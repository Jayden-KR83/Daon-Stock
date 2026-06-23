"""
다온 포트폴리오 — FastAPI 백엔드 v2
Yahoo Finance v8 chart API 직접 호출 (yfinance 429 문제 완전 해결)
"""
from __future__ import annotations

import hashlib, json, os, re, secrets, sqlite3, urllib.parse, math, uuid
import concurrent.futures as _cf
from contextlib import contextmanager
from datetime import datetime
from functools import wraps
from threading import Lock
from time import time, sleep, strftime, gmtime
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, Header, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ─── App ──────────────────────────────────────────────────────────────
app = FastAPI(title="다온 포트폴리오 API", version="2.0.0")
# CORS: 운영 도메인으로 제한 (이전 "*" → 상용 공개 후 출처 제한).
# 프론트는 daonwealth.com 동일 출처에서 서빙되므로 앱 동작엔 영향 없음.
# 로컬 개발은 Vite 프록시(동일 출처)라 CORS 미적용.
app.add_middleware(CORSMiddleware,
                   allow_origins=["https://daonwealth.com", "https://www.daonwealth.com"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE_DIR, "..", "portfolio_data.json")   # 마이그레이션 소스
USERS_FILE = os.path.join(BASE_DIR, "..", "users.json")            # 마이그레이션 소스
DB_FILE    = os.path.join(BASE_DIR, "..", "daon.db")               # SQLite DB
STATIC_DIR = os.path.join(BASE_DIR, "static")

# ─── SQLite DB ────────────────────────────────────────────────────────
@contextmanager
def _db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _init_db():
    with _db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id    TEXT PRIMARY KEY,
            email      TEXT UNIQUE NOT NULL,
            name       TEXT NOT NULL DEFAULT '',
            pw_hash    TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            expires    REAL NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS portfolios (
            user_id    TEXT NOT NULL,
            account    TEXT NOT NULL,
            ticker     TEXT NOT NULL,
            name       TEXT NOT NULL DEFAULT '',
            avg_price  REAL NOT NULL DEFAULT 0,
            quantity   REAL NOT NULL DEFAULT 0,
            sector     TEXT NOT NULL DEFAULT '',
            PRIMARY KEY(user_id, account, ticker),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS watchlist (
            user_id    TEXT NOT NULL,
            ticker     TEXT NOT NULL,
            name       TEXT NOT NULL DEFAULT '',
            exchange   TEXT NOT NULL DEFAULT '',
            qtype      TEXT NOT NULL DEFAULT '',
            PRIMARY KEY(user_id, ticker),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS metrics_cache (
            user_id      TEXT NOT NULL,
            scope        TEXT NOT NULL,
            fingerprint  TEXT NOT NULL,
            result_json  TEXT NOT NULL,
            computed_at  REAL NOT NULL,
            PRIMARY KEY(user_id, scope),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS strategy_cache (
            user_id      TEXT NOT NULL,
            scope        TEXT NOT NULL,
            fingerprint  TEXT NOT NULL,
            result_json  TEXT NOT NULL,
            computed_at  REAL NOT NULL,
            PRIMARY KEY(user_id, scope),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS accounts (
            user_id     TEXT NOT NULL,
            key         TEXT NOT NULL,
            label       TEXT NOT NULL,
            currency    TEXT NOT NULL DEFAULT 'KRW',
            sort_order  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(user_id, key),
            FOREIGN KEY(user_id) REFERENCES users(user_id)
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ts          REAL NOT NULL,
            user_id     TEXT NOT NULL DEFAULT '',
            event_type  TEXT NOT NULL,
            details     TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
        CREATE TABLE IF NOT EXISTS holding_notes (
            user_id     TEXT NOT NULL,
            ticker      TEXT NOT NULL,
            note        TEXT NOT NULL DEFAULT '',
            stop_loss   REAL,
            target      REAL,
            updated_at  REAL NOT NULL,
            PRIMARY KEY(user_id, ticker)
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            account     TEXT NOT NULL,
            ticker      TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            side        TEXT NOT NULL,          -- 'BUY' | 'SELL'
            quantity    REAL NOT NULL,
            price       REAL NOT NULL,
            fee         REAL NOT NULL DEFAULT 0,
            tax         REAL NOT NULL DEFAULT 0,
            traded_at   REAL NOT NULL,
            memo        TEXT NOT NULL DEFAULT '',
            created_at  REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tx_user_ticker ON transactions(user_id, ticker, traded_at);
        CREATE INDEX IF NOT EXISTS idx_tx_user_traded ON transactions(user_id, traded_at DESC);
        CREATE TABLE IF NOT EXISTS net_worth_snapshots (
            user_id        TEXT NOT NULL,
            snapshot_date  TEXT NOT NULL,        -- 'YYYY-MM-DD' (KST 기준)
            total_krw      INTEGER NOT NULL,
            holdings_count INTEGER NOT NULL DEFAULT 0,
            breakdown      TEXT NOT NULL DEFAULT '{}',  -- {account: krw_value, ...}
            usd_krw        REAL NOT NULL DEFAULT 1380,
            created_at     REAL NOT NULL,
            PRIMARY KEY(user_id, snapshot_date)
        );
        CREATE INDEX IF NOT EXISTS idx_snap_user_date ON net_worth_snapshots(user_id, snapshot_date DESC);
        CREATE TABLE IF NOT EXISTS holding_pnl_snapshots (
            user_id        TEXT NOT NULL,
            snapshot_date  TEXT NOT NULL,
            ticker         TEXT NOT NULL,
            quantity       REAL NOT NULL,
            avg_price      REAL NOT NULL,
            current_price  REAL NOT NULL,
            value_krw      INTEGER NOT NULL,
            pnl_krw        INTEGER NOT NULL,
            pnl_pct        REAL NOT NULL,
            created_at     REAL NOT NULL,
            PRIMARY KEY(user_id, snapshot_date, ticker)
        );
        CREATE INDEX IF NOT EXISTS idx_hpnl_user_ticker ON holding_pnl_snapshots(user_id, ticker, snapshot_date DESC);
        CREATE TABLE IF NOT EXISTS price_alerts (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT NOT NULL,
            ticker       TEXT NOT NULL,
            name         TEXT NOT NULL DEFAULT '',
            target_high  REAL,                    -- 도달 시 (>=) 트리거
            target_low   REAL,                    -- 도달 시 (<=) 트리거
            enabled      INTEGER NOT NULL DEFAULT 1,
            triggered_at REAL,                    -- 마지막 트리거 epoch (재발화 방지 24h)
            created_at   REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id, enabled);
        CREATE INDEX IF NOT EXISTS idx_alerts_ticker ON price_alerts(ticker);
        CREATE TABLE IF NOT EXISTS notifications (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT NOT NULL,
            ticker        TEXT NOT NULL,
            name          TEXT NOT NULL DEFAULT '',
            kind          TEXT NOT NULL,          -- 'high' | 'low' | 'info'
            target_price  REAL,
            current_price REAL,
            message       TEXT NOT NULL DEFAULT '',
            created_at    REAL NOT NULL,
            read_at       REAL                    -- NULL이면 미확인
        );
        CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read_at);
        CREATE INDEX IF NOT EXISTS idx_notif_user_ts ON notifications(user_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint   TEXT PRIMARY KEY,       -- 브라우저 push endpoint (고유)
            user_id    TEXT NOT NULL,
            p256dh     TEXT NOT NULL,           -- 구독 공개키
            auth       TEXT NOT NULL,           -- 구독 auth secret
            created_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
        CREATE TABLE IF NOT EXISTS goals (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id              TEXT NOT NULL,
            name                 TEXT NOT NULL DEFAULT '목표',
            target_amount        REAL NOT NULL,          -- 목표 금액(KRW)
            target_date          TEXT NOT NULL,          -- 'YYYY-MM-DD'
            monthly_contribution REAL NOT NULL DEFAULT 0, -- 월 납입(KRW)
            expected_return      REAL NOT NULL DEFAULT 0.06, -- 연 기대수익률
            volatility           REAL NOT NULL DEFAULT 0.15, -- 연 변동성
            created_at           REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
        CREATE TABLE IF NOT EXISTS ai_cache (
            cache_key    TEXT PRIMARY KEY,         -- 'stock_v2:{TICKER}:{name}'
            value_json   TEXT NOT NULL,
            computed_at  REAL NOT NULL,
            source       TEXT NOT NULL DEFAULT 'api'   -- 'api' | 'manual_import' | 'claude_code'
        );
        CREATE INDEX IF NOT EXISTS idx_aicache_ts ON ai_cache(computed_at DESC);
        CREATE TABLE IF NOT EXISTS discovery_scores (
            ticker            TEXT PRIMARY KEY,         -- universe 중복 종목은 1행 (INSERT OR REPLACE)
            market            TEXT NOT NULL,            -- 'US' | 'KR'
            name              TEXT NOT NULL DEFAULT '',
            sector            TEXT NOT NULL DEFAULT '',
            -- raw 지표 (없으면 NULL — 가짜값 절대 금지)
            peg               REAL,
            rel_per           REAL,                     -- 시장 내 상대 PER (median 대비)
            eps_growth        REAL,                     -- YoY %
            rev_growth        REAL,                     -- YoY %
            roe               REAL,
            debt_to_equity    REAL,                     -- KR=NULL (Naver 미제공)
            near_52w_high     REAL,                     -- 현재가/52주고가 (0~1)
            analyst_upside    REAL,                     -- (target_mean-cur)/cur %, KR=NULL
            -- 투자판단용 표시 지표
            current_price     REAL,
            target_price      REAL,                     -- 애널리스트 평균 목표가 (US)
            trailing_pe       REAL,                     -- 후행 PER
            forward_pe        REAL,                     -- 선행(추정) PER
            profit_margin     REAL,                     -- 순이익률 % (US)
            exchange          TEXT NOT NULL DEFAULT '', -- NMS/NYQ/KSC/KOE 등
            quote_type        TEXT NOT NULL DEFAULT '', -- EQUITY/ETF
            expense_ratio     REAL,                     -- ETF 보수율 % (US)
            aum               REAL,                     -- ETF 순자산 (US)
            ret_6m            REAL,                     -- 6개월 수익률 % (ETF)
            -- 축별 백분위 (0~100, 시장 내 정규화). N/A 축은 NULL
            pct_value         REAL,
            pct_growth        REAL,
            pct_quality       REAL,
            pct_momentum      REAL,
            pct_sentiment     REAL,
            -- 종합
            composite_score   REAL NOT NULL DEFAULT 0,  -- 가용 축 재정규화 가중합 (0~100)
            gate_pass         INTEGER NOT NULL DEFAULT 0,
            gate_fail_reason  TEXT NOT NULL DEFAULT '',
            data_completeness INTEGER NOT NULL DEFAULT 0,-- 5축 중 데이터 확보 축 수 (0~5)
            computed_at       REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_discovery_score ON discovery_scores(gate_pass DESC, composite_score DESC);
        CREATE INDEX IF NOT EXISTS idx_discovery_market ON discovery_scores(market, composite_score DESC);
        CREATE TABLE IF NOT EXISTS discovery_history (
            snapshot_date   TEXT NOT NULL,           -- KST 날짜 'YYYY-MM-DD'
            ticker          TEXT NOT NULL,
            market          TEXT NOT NULL,
            sector          TEXT NOT NULL DEFAULT '',
            composite_score REAL NOT NULL DEFAULT 0,
            gate_pass       INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(snapshot_date, ticker)        -- 일자별 랭킹 스냅샷 → 포워드테스트 토대
        );
        CREATE INDEX IF NOT EXISTS idx_dischist_date ON discovery_history(snapshot_date, composite_score DESC);
        """)

_init_db()

# 스키마 진화: users 테이블에 컬럼 점진적 추가
def _migrate_schema():
    with _db() as conn:
        cols = {row['name'] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if 'nickname' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''")
        if 'is_admin' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        # 신규: 가입 승인 체계 + AI 사용 권한 + 활동 지표
        added_status = False
        if 'status' not in cols:
            # 'pending' | 'approved' | 'rejected' | 'suspended'
            conn.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'")
            added_status = True
        if 'ai_enabled' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 0")
        if 'last_seen_at' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_seen_at REAL NOT NULL DEFAULT 0")
        if 'login_count' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0")
        if 'ai_call_count' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN ai_call_count INTEGER NOT NULL DEFAULT 0")
        if 'approved_at' not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN approved_at REAL NOT NULL DEFAULT 0")
        # watchlist 그룹화 (C1)
        wl_cols = {row['name'] for row in conn.execute("PRAGMA table_info(watchlist)").fetchall()}
        if 'group_name' not in wl_cols:
            conn.execute("ALTER TABLE watchlist ADD COLUMN group_name TEXT NOT NULL DEFAULT '기본'")
        # 발굴: 투자판단용 추가 지표 (현재가·목표가·밸류·거래소·유형)
        ds_cols = {row['name'] for row in conn.execute("PRAGMA table_info(discovery_scores)").fetchall()}
        for col, decl in (('current_price', 'REAL'), ('target_price', 'REAL'),
                          ('trailing_pe', 'REAL'), ('forward_pe', 'REAL'),
                          ('profit_margin', 'REAL'), ('exchange', "TEXT NOT NULL DEFAULT ''"),
                          ('quote_type', "TEXT NOT NULL DEFAULT ''"),
                          ('expense_ratio', 'REAL'), ('aum', 'REAL'), ('ret_6m', 'REAL')):
            if ds_cols and col not in ds_cols:
                conn.execute(f"ALTER TABLE discovery_scores ADD COLUMN {col} {decl}")
        # 수동 기준가: 외부 시세 미조회 종목(한국 비상장 펀드 등)에 사용자가 직접 입력한 참고가
        pf_cols = {row['name'] for row in conn.execute("PRAGMA table_info(portfolios)").fetchall()}
        if pf_cols and 'manual_price' not in pf_cols:
            conn.execute("ALTER TABLE portfolios ADD COLUMN manual_price REAL NOT NULL DEFAULT 0")
        # 마이그레이션 직후, 기존 사용자(이미 가입된 자)는 자동 approved + ai_enabled (legacy compat)
        if added_status:
            conn.execute(
                "UPDATE users SET status='approved', ai_enabled=1, approved_at=? "
                "WHERE status='pending'", (time(),)
            )

_migrate_schema()

# 기존 사용자의 ACCOUNTS 데이터를 accounts 테이블에 시드 (1회)
def _seed_existing_accounts():
    """legacy ACCOUNTS(['US','KR_RETIRE','KR_PERSONAL','KR_ISA'])를 모든 기존 사용자에게 시드.
    포트폴리오에 이미 존재하는 계좌만 만들어 정리. 빈 사용자는 4개 모두 기본 생성."""
    with _db() as conn:
        # 이미 accounts 시드 완료 flag
        flag = conn.execute("SELECT value FROM settings WHERE key='accounts_seeded'").fetchone()
        if flag:
            return
        users = conn.execute("SELECT user_id FROM users").fetchall()
        labels = {'US': '미국', 'KR_RETIRE': '퇴직', 'KR_PERSONAL': '개별', 'KR_ISA': 'ISA'}
        currencies = {'US': 'USD', 'KR_RETIRE': 'KRW', 'KR_PERSONAL': 'KRW', 'KR_ISA': 'KRW'}
        order = {'US': 0, 'KR_RETIRE': 1, 'KR_PERSONAL': 2, 'KR_ISA': 3}
        for u in users:
            uid = u['user_id']
            for key, label in labels.items():
                try:
                    conn.execute(
                        "INSERT OR IGNORE INTO accounts(user_id, key, label, currency, sort_order) "
                        "VALUES (?,?,?,?,?)",
                        (uid, key, label, currencies[key], order[key])
                    )
                except Exception:
                    pass
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('accounts_seeded','1')")

_seed_existing_accounts()

_migrate_lock = Lock()

def _migrate_from_json():
    """최초 1회: JSON 파일 → SQLite 마이그레이션"""
    with _migrate_lock:
        with _db() as conn:
            done = conn.execute("SELECT value FROM settings WHERE key='migrated'").fetchone()
            if done:
                return

        # users.json 마이그레이션
        if os.path.exists(USERS_FILE):
            try:
                with open(USERS_FILE, 'r', encoding='utf-8') as f:
                    ud = json.load(f)
                with _db() as conn:
                    for email, u in ud.get("users", {}).items():
                        try:
                            conn.execute(
                                "INSERT OR IGNORE INTO users(user_id,email,name,pw_hash,created_at) VALUES(?,?,?,?,?)",
                                (u["user_id"], email, u.get("name",""), u["password_hash"],
                                 u.get("created_at", datetime.now().isoformat()))
                            )
                        except Exception:
                            pass
                    for token, s in ud.get("sessions", {}).items():
                        if s.get("expires", 0) > time():
                            try:
                                conn.execute(
                                    "INSERT OR IGNORE INTO sessions(token,user_id,expires) VALUES(?,?,?)",
                                    (token, s["user_id"], s["expires"])
                                )
                            except Exception:
                                pass
            except Exception as e:
                print(f"users.json 마이그레이션 오류: {e}")

        # portfolio_data.json 마이그레이션
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    pd_data = json.load(f)

                # Anthropic API 키
                api_key = pd_data.get("settings", {}).get("anthropic_key", "")
                if api_key:
                    with _db() as conn:
                        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('anthropic_key',?)", (api_key,))

                # 사용자별 포트폴리오
                up = pd_data.get("user_portfolios", {})
                if not up:
                    # 구버전: 루트 레벨 portfolios
                    root_p = pd_data.get("portfolios", {})
                    root_w = pd_data.get("watchlist", [])
                    if any(bool(v) for v in root_p.values()) or root_w:
                        up = {"__legacy__": {"portfolios": root_p, "watchlist": root_w}}

                with _db() as conn:
                    for uid, udata in up.items():
                        for acc, holdings in udata.get("portfolios", {}).items():
                            for h in holdings:
                                try:
                                    conn.execute(
                                        "INSERT OR IGNORE INTO portfolios(user_id,account,ticker,name,avg_price,quantity,sector) VALUES(?,?,?,?,?,?,?)",
                                        (uid, acc, h.get("ticker",""), h.get("name",""),
                                         h.get("avg_price",0), h.get("quantity",0), h.get("sector",""))
                                    )
                                except Exception:
                                    pass
                        for w in udata.get("watchlist", []):
                            try:
                                conn.execute(
                                    "INSERT OR IGNORE INTO watchlist(user_id,ticker,name,exchange,qtype) VALUES(?,?,?,?,?)",
                                    (uid, w.get("ticker",""), w.get("name",""),
                                     w.get("exchange",""), w.get("qtype",""))
                                )
                            except Exception:
                                pass
            except Exception as e:
                print(f"portfolio_data.json 마이그레이션 오류: {e}")

        with _db() as conn:
            conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('migrated','1')")
        print("✅ JSON → SQLite 마이그레이션 완료")

_migrate_from_json()

# ─── React 정적 파일 서빙 ─────────────────────────────────────────────
_assets_dir = os.path.join(STATIC_DIR, "assets")
if os.path.exists(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

# PWA 아이콘 디렉토리 (/icons)
_icons_dir = os.path.join(STATIC_DIR, "icons")
if os.path.exists(_icons_dir):
    app.mount("/icons", StaticFiles(directory=_icons_dir), name="icons")

# PWA 루트 정적 파일 (manifest, sw, workbox-*.js)
@app.get("/manifest.webmanifest", include_in_schema=False)
def pwa_manifest():
    p = os.path.join(STATIC_DIR, "manifest.webmanifest")
    if not os.path.exists(p):
        raise HTTPException(404, "manifest not found")
    return FileResponse(p, media_type="application/manifest+json")

@app.get("/sw.js", include_in_schema=False)
def pwa_sw():
    p = os.path.join(STATIC_DIR, "sw.js")
    if not os.path.exists(p):
        raise HTTPException(404, "sw.js not found")
    return FileResponse(p, media_type="application/javascript",
                        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"})

@app.get("/registerSW.js", include_in_schema=False)
def pwa_register_sw():
    p = os.path.join(STATIC_DIR, "registerSW.js")
    if not os.path.exists(p):
        raise HTTPException(404)
    return FileResponse(p, media_type="application/javascript")

@app.get("/push-sw.js", include_in_schema=False)
def pwa_push_sw():
    # sw.js가 importScripts('push-sw.js')로 로드하는 Web Push 핸들러
    p = os.path.join(STATIC_DIR, "push-sw.js")
    if not os.path.exists(p):
        raise HTTPException(404, "push-sw.js not found")
    return FileResponse(p, media_type="application/javascript",
                        headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"})

# workbox-{hash}.js — sw.js가 같은 디렉토리에서 import 하므로 별도 마운트 필요
# vite-plugin-pwa가 backend/static 루트에 workbox-XXX.js를 출력하므로
# 빌드 시 /assets 디렉토리로 복사하여 sw.js의 import 경로도 같이 수정
# → 더 간단한 방법: 정확한 파일명 매칭 라우트
from fastapi.responses import Response as _FResponse
@app.get("/workbox-{hash}.js", include_in_schema=False)
def pwa_workbox_file(hash: str):
    fname = f"workbox-{hash}.js"
    p = os.path.join(STATIC_DIR, fname)
    if not os.path.exists(p):
        raise HTTPException(404)
    return FileResponse(p, media_type="application/javascript")

# ─── HTTP Session ─────────────────────────────────────────────────────
_session = requests.Session()
_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  'Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
})

# ─── Constants ────────────────────────────────────────────────────────
ACCOUNTS = ['US', 'KR_RETIRE', 'KR_PERSONAL', 'KR_ISA']
MARKET_TICKERS = [
    ('S&P500','^GSPC'), ('Dow','^DJI'), ('Nasdaq','^IXIC'), ('VIX','^VIX'),
    ('Russell','^RUT'), ('KOSPI','^KS11'), ('BTC','BTC-USD'), ('ETH','ETH-USD'),
    ('Gold','GC=F'), ('Silver','SI=F'), ('USD/KRW','KRW=X'), ('10Y채권','^TNX'),
]
SECTOR_ETFS = {
    '기술':('XLK',30),'헬스케어':('XLV',12),'금융':('XLF',13),
    '통신서비스':('XLC',9),'소비재':('XLY',10),'산업재':('XLI',9),
    '에너지':('XLE',4),'필수소비재':('XLP',6),'유틸리티':('XLU',3),
    '소재':('XLB',3),'부동산':('XLRE',2),
}
US_SECTOR_TOP = {
    '기술':      [('AAPL','Apple'),('NVDA','NVIDIA'),('MSFT','Microsoft'),('AVGO','Broadcom'),
                  ('ORCL','Oracle'),('CRM','Salesforce'),('CSCO','Cisco'),('ACN','Accenture'),
                  ('IBM','IBM'),('ADBE','Adobe')],
    '헬스케어':   [('LLY','Eli Lilly'),('UNH','UnitedHealth'),('JNJ','Johnson & Johnson'),
                  ('ABBV','AbbVie'),('MRK','Merck'),('ABT','Abbott'),
                  ('TMO','Thermo Fisher'),('DHR','Danaher'),('AMGN','Amgen'),('BMY','Bristol Myers')],
    '금융':      [('BRK-B','Berkshire Hath.'),('JPM','JPMorgan Chase'),('V','Visa'),
                  ('MA','Mastercard'),('BAC','Bank of America'),('GS','Goldman Sachs'),
                  ('MS','Morgan Stanley'),('WFC','Wells Fargo'),('SPGI','S&P Global'),('AXP','AmEx')],
    '통신서비스': [('META','Meta'),('GOOGL','Alphabet A'),('GOOG','Alphabet C'),
                  ('NFLX','Netflix'),('DIS','Disney'),('CMCSA','Comcast'),
                  ('T','AT&T'),('VZ','Verizon'),('TMUS','T-Mobile'),('CHTR','Charter Comm.')],
    '소비재':    [('AMZN','Amazon'),('TSLA','Tesla'),('HD','Home Depot'),
                  ('MCD','McDonald\'s'),('NKE','Nike'),('LOW','Lowe\'s'),
                  ('SBUX','Starbucks'),('BKNG','Booking'),('TJX','TJX Cos.'),('CMG','Chipotle')],
    '산업재':    [('GE','GE Aerospace'),('RTX','RTX Corp'),('HON','Honeywell'),
                  ('CAT','Caterpillar'),('UPS','UPS'),('BA','Boeing'),
                  ('LMT','Lockheed'),('DE','Deere'),('UNP','Union Pacific'),('MMM','3M')],
    '에너지':    [('XOM','ExxonMobil'),('CVX','Chevron'),('COP','ConocoPhillips'),
                  ('SLB','SLB'),('EOG','EOG Resources'),('MPC','Marathon Petro.'),
                  ('PSX','Phillips 66'),('FANG','Diamondback'),('VLO','Valero'),('OXY','Occidental')],
    '필수소비재': [('WMT','Walmart'),('PG','Procter & Gamble'),('COST','Costco'),
                  ('KO','Coca-Cola'),('PEP','PepsiCo'),('PM','Philip Morris'),
                  ('MO','Altria'),('CL','Colgate'),('MDLZ','Mondelez'),('GIS','General Mills')],
    '유틸리티':  [('NEE','NextEra Energy'),('SO','Southern Co.'),('DUK','Duke Energy'),
                  ('AEP','AEP'),('SRE','Sempra'),('D','Dominion'),
                  ('EXC','Exelon'),('XEL','Xcel Energy'),('ES','Eversource'),('ED','Con Edison')],
    '소재':      [('LIN','Linde'),('APD','Air Products'),('SHW','Sherwin-Williams'),
                  ('ECL','Ecolab'),('NEM','Newmont'),('FCX','Freeport'),
                  ('NUE','Nucor'),('VMC','Vulcan Materials'),('MLM','Martin Marietta'),('ALB','Albemarle')],
    '부동산':    [('PLD','Prologis'),('AMT','American Tower'),('EQIX','Equinix'),
                  ('WELL','Welltower'),('SPG','Simon Property'),('PSA','Public Storage'),
                  ('DLR','Digital Realty'),('O','Realty Income'),('AVB','AvalonBay'),('EQR','Equity Res.')],
}
KR_SECTOR_TOP = {
    'IT·반도체': [('005930','삼성전자'),('000660','SK하이닉스'),('035420','NAVER'),
                  ('035720','카카오'),('066570','LG전자'),('042700','한미반도체'),
                  ('009150','삼성전기'),('034220','LG디스플레이'),('000990','DB하이텍'),('240810','원익IPS')],
    '2차전지':   [('373220','LG에너지솔루션'),('247540','에코프로비엠'),('086520','에코프로'),
                  ('006400','삼성SDI'),('051910','LG화학'),('003670','포스코퓨처엠'),
                  ('357780','솔브레인'),('278280','천보'),('452400','포스코DX'),('298040','효성첨단소재')],
    '금융·은행':  [('105560','KB금융'),('055550','신한지주'),('086790','하나금융지주'),
                  ('316140','우리금융지주'),('024110','기업은행'),('175330','JB금융지주'),
                  ('138040','메리츠금융지주'),('000810','삼성화재'),('005830','DB손해보험'),('001450','현대해상')],
    '자동차':    [('005380','현대차'),('000270','기아'),('012330','현대모비스'),
                  ('204320','HL만도'),('011210','현대위아'),('064960','S&T모티브'),
                  ('108670','LG이노텍'),('161390','한국타이어앤테크놀로지'),('005850','에스엘'),('002960','쌍용C&E')],
    '헬스케어':   [('207940','삼성바이오로직스'),('068270','셀트리온'),('128940','한미약품'),
                  ('000100','유한양행'),('069620','대웅제약'),('185750','종근당'),
                  ('326030','SK바이오사이언스'),('141080','레고켐바이오'),('237690','에스티팜'),('000520','삼일제약')],
    '방산·우주':  [('012450','한화에어로스페이스'),('047810','한국항공우주'),('000880','한화'),
                  ('272210','한화시스템'),('042660','한화오션'),('329180','HD현대중공업'),
                  ('009540','HD한국조선해양'),('010140','삼성중공업'),('064350','현대로템'),('079550','LIG넥스원')],
    '화학·에너지':[('051910','LG화학'),('003670','포스코퓨처엠'),('010950','S-Oil'),
                  ('096770','SK이노베이션'),('011170','롯데케미칼'),('005490','POSCO홀딩스'),
                  ('004020','현대제철'),('078930','GS'),('267250','HD현대'),('011790','SKC')],
    '통신':      [('017670','SK텔레콤'),('030200','KT'),('032640','LG유플러스'),
                  ('033780','KT&G'),('021240','코웨이'),('036570','엔씨소프트'),
                  ('293490','카카오게임즈'),('112040','위메이드'),('263750','펄어비스'),('251270','넷마블')],
    '건설':      [('000720','현대건설'),('047040','대우건설'),('006360','GS건설'),
                  ('375500','DL이앤씨'),('034020','두산에너빌리티'),('028050','삼성엔지니어링'),
                  ('012630','HDC'),('000120','CJ대한통운'),('097230','한진'),('047050','포스코인터내셔널')],
    '철강·소재':  [('005490','POSCO홀딩스'),('004020','현대제철'),('010130','고려아연'),
                  ('001230','동국제강'),('010060','OCI'),('002380','KCC'),
                  ('011790','SKC'),('298040','효성첨단소재'),('009150','삼성전기'),('000590','CS홀딩스')],
    '유통·소비':  [('004170','신세계'),('069960','현대백화점'),('023530','롯데쇼핑'),
                  ('282330','BGF리테일'),('007070','GS리테일'),('035760','CJ ENM'),
                  ('271560','오리온'),('000080','하이트진로'),('004990','롯데지주'),('033780','KT&G')],
}
KOSPI_SECTOR_ETFS = {
    'IT·반도체':('091160.KS',25),'2차전지':('305720.KS',15),
    '금융·은행':('091220.KS',12),'자동차':('091180.KS',10),
    '화학·에너지':('117460.KS',8),'헬스케어':('143860.KS',7),
    '방산·우주':('310080.KS',6),'통신':('098560.KS',5),
    '건설':('117700.KS',5),'철강·소재':('102960.KS',4),'유통·소비':('091170.KS',3),
}
KR_ETF_SECTOR = {
    '305720':'2차전지','364980':'2차전지','371460':'2차전지',
    '091160':'IT·반도체','091170':'IT·반도체','266370':'IT·반도체',
    '143860':'헬스케어','326030':'헬스케어',
    '310080':'방산·우주','272210':'방산·우주',
    '069500':'S&P500/코스피','278540':'미국주식','360750':'미국주식',
    '148020':'채권','136340':'채권',
}
US_ETF_SECTOR = {
    'TLT':'채권','BND':'채권','IEF':'채권','SHY':'채권','AGG':'채권',
    'GLD':'금·귀금속','IAU':'금·귀금속','SLV':'은·귀금속',
    'QQQ':'AI·기술','XLK':'AI·기술','SOXX':'AI·반도체','SMH':'AI·반도체',
    'XLV':'헬스케어','IBB':'헬스케어바이오',
    'XLE':'에너지','XLF':'금융','XLI':'산업재','XLU':'유틸리티','XLRE':'부동산',
    'ITA':'방산','SPY':'S&P500 ETF','IVV':'S&P500 ETF','VOO':'S&P500 ETF',
    'IBIT':'BTC ETF','FBTC':'BTC ETF',
}

# ─── TTL Cache ────────────────────────────────────────────────────────
_cache: Dict[str, Any] = {}
_cache_ts: Dict[str, float] = {}
_lock = Lock()

def ttl_cache(ttl: int):
    def dec(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = f"{fn.__name__}:{args}:{sorted(kwargs.items())}"
            with _lock:
                if key in _cache and time() - _cache_ts[key] < ttl:
                    return _cache[key]
            result = fn(*args, **kwargs)
            with _lock:
                _cache[key] = result
                _cache_ts[key] = time()
            return result
        return wrapper
    return dec

# ─── AI 분석 24h 캐시 (in-memory + SQLite persist) ─────────────────────
# 서버 재시작 시에도 캐시 보존 + 외부 도구(Claude Code/채팅)로 만든 분석을
# import endpoint로 inject 가능. in-memory는 빠른 read, DB는 영속성.
_ai_cache: Dict[str, Any]      = {}
_ai_cache_ts: Dict[str, float] = {}
_AI_TTL = 86400  # 24시간

def _get_ai_cache(key: str):
    now = time()
    # 1) in-memory hit
    with _lock:
        if key in _ai_cache and now - _ai_cache_ts[key] < _AI_TTL:
            return _ai_cache[key]
    # 2) DB fallback — 서버 재시작 후 첫 조회
    try:
        with _db() as conn:
            row = conn.execute(
                "SELECT value_json, computed_at FROM ai_cache WHERE cache_key=?",
                (key,)
            ).fetchone()
        if row and now - float(row['computed_at']) < _AI_TTL:
            value = json.loads(row['value_json'])
            with _lock:
                _ai_cache[key]    = value
                _ai_cache_ts[key] = float(row['computed_at'])
            return value
    except Exception:
        pass
    return None

def _get_stock_cache_by_ticker(ticker: str):
    """종목 분석(stock_v2) 조회 — 이름 변형으로 캐시 키가 갈려도, 그리고 24h TTL과 무관하게
    stock_v2:{TICKER}:* 중 '가장 최근' 분석을 반환한다.
    (자동 만료하지 않음 — 사용자가 분석 날짜를 보고 직접 갱신 여부를 판단.)
    반환: (value, computed_at) | (None, 0.0)"""
    prefix = f"stock_v2:{ticker.upper()}:"
    best_val, best_ts = None, -1.0
    # 1) 메모리 (최신 ts) — TTL 무시
    with _lock:
        for k, ts in list(_ai_cache_ts.items()):
            if k.startswith(prefix) and ts > best_ts:
                best_val, best_ts = _ai_cache.get(k), ts
    # 2) DB가 더 최신일 수 있으니 확인 (서버 재시작 후 등)
    try:
        with _db() as conn:
            row = conn.execute(
                "SELECT value_json, computed_at FROM ai_cache "
                "WHERE cache_key LIKE ? ORDER BY computed_at DESC LIMIT 1",
                (prefix + '%',)
            ).fetchone()
        if row and float(row['computed_at']) > best_ts:
            best_val = json.loads(row['value_json'])
            best_ts  = float(row['computed_at'])
    except Exception:
        pass
    if best_val is None:
        return None, 0.0
    return best_val, best_ts

def _set_ai_cache(key: str, value, source: str = 'api'):
    now = time()
    with _lock:
        _ai_cache[key]    = value
        _ai_cache_ts[key] = now
    # DB persist (best-effort)
    try:
        with _db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO ai_cache (cache_key, value_json, computed_at, source) "
                "VALUES (?,?,?,?)",
                (key, json.dumps(value, ensure_ascii=False), now, source)
            )
    except Exception:
        pass

# ─── Helpers ──────────────────────────────────────────────────────────
def is_kr(ticker: str) -> bool:
    # A005930, 005930 모두 한국 주식으로 처리 (KRX의 A접두사 포함)
    return bool(re.match(r'^A?\d{6}$', str(ticker)))

def kr_code(ticker: str) -> str:
    """Naver/yfinance 호출 시 A접두사 제거"""
    t = str(ticker)
    return t[1:] if re.match(r'^A\d{6}$', t) else t

def has_korean(text: str) -> bool:
    return any('\uAC00' <= c <= '\uD7A3' or '\u3131' <= c <= '\u318E' for c in text)

def _nan(v) -> bool:
    try:
        if v is None: return True
        f = float(v)
        return math.isnan(f) or math.isinf(f)
    except Exception:
        return True

def _f(v, d=4):
    return None if _nan(v) else round(float(v), d)

def get_eff_sector(s: dict) -> str:
    sec = s.get('sector', '')
    if sec and str(sec) not in ('N/A', 'nan', 'None', ''):
        return str(sec)
    tkr = str(s.get('ticker', '')).upper()
    return US_ETF_SECTOR.get(tkr) or KR_ETF_SECTOR.get(tkr) or ''

# ─── Yahoo Finance v8 API ─────────────────────────────────────────────
def _yf_chart(ticker: str, range_: str = '1y', interval: str = '1d') -> dict | None:
    """Yahoo Finance v8 chart — 직접 호출, 429 없음."""
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}'
           f'?interval={interval}&range={range_}')
    try:
        r = _session.get(url, timeout=12)
        if r.status_code != 200:
            return None
        data = r.json()
        res = data.get('chart', {}).get('result')
        return res[0] if res else None
    except Exception:
        return None

def _yf_search(query: str, count: int = 8) -> list:
    url = (f'https://query1.finance.yahoo.com/v1/finance/search'
           f'?q={urllib.parse.quote(query)}&quotesCount={count}&newsCount=0&enableFuzzyQuery=false')
    try:
        r = _session.get(url, timeout=8)
        if r.status_code != 200:
            return []
        data = r.json()
        results = []
        for q in data.get('quotes', []):
            qt = q.get('quoteType', '')
            if qt in ('EQUITY', 'ETF', 'CRYPTOCURRENCY', 'FUTURE', 'CURRENCY', 'INDEX'):
                results.append({
                    'symbol':    q.get('symbol', ''),
                    'shortname': q.get('shortname') or q.get('longname', ''),
                    'exchange':  q.get('exchange', ''),
                    'quoteType': qt,
                })
        return results
    except Exception:
        return []

def _chart_to_price(res: dict) -> dict | None:
    """v8 결과 → 일간 가격 요약.

    중요: range=1mo 호출 시 chartPreviousClose는 '1개월 전' 종가이므로 일간 변동률 계산에
    사용하면 안 됨. 일간 변동률은 closes[-2] (직전 거래일 종가)와 비교해야 정확.
    """
    try:
        meta   = res.get('meta', {})
        closes = res.get('indicators', {}).get('quote', [{}])[0].get('close', [])
        closes = [c for c in closes if c is not None]
        if not closes:
            return None
        cur  = closes[-1]
        # 일간 변동률: 직전 거래일 종가(closes[-2]) 우선. 데이터 부족 시 regularMarketPreviousClose.
        if len(closes) >= 2:
            prev = float(closes[-2])
        else:
            prev_meta = meta.get('regularMarketPreviousClose') or meta.get('previousClose')
            prev = float(prev_meta) if prev_meta else cur
        chg  = cur - prev
        pct  = (chg / prev * 100) if prev != 0 else 0.0
        return {
            'current_price': round(cur, 4),
            'change':        round(chg, 4),
            'change_pct':    round(pct, 4),
            'spark':         [round(float(c), 4) for c in closes[-30:]],
        }
    except Exception:
        return None

def _chart_to_full(ticker: str, res: dict) -> dict | None:
    """v8 결과 → 전체 차트 데이터"""
    try:
        import pandas as pd, numpy as np
        meta   = res['meta']
        q0     = res['indicators']['quote'][0]
        ts     = res.get('timestamp', [])
        closes = q0.get('close', [])
        opens  = q0.get('open', [])
        highs  = q0.get('high', [])
        lows   = q0.get('low', [])
        vols   = q0.get('volume', [])

        if not ts or not closes:
            return None

        df = pd.DataFrame({
            'close': closes, 'open': opens, 'high': highs,
            'low': lows, 'volume': vols,
        }, index=pd.to_datetime(ts, unit='s'))
        df = df.dropna(subset=['close'])

        # Moving averages
        df['ma20']  = df['close'].rolling(20).mean()
        df['ma60']  = df['close'].rolling(60).mean()
        df['ma120'] = df['close'].rolling(120).mean()

        # RSI
        delta = df['close'].diff()
        gain  = delta.where(delta > 0, 0).rolling(14).mean()
        loss  = (-delta.where(delta < 0, 0)).rolling(14).mean()
        df['rsi'] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))

        hist_data = []
        for idx, row in df.iterrows():
            hist_data.append({
                'date':   str(idx)[:10],
                'open':   _f(row['open']),
                'high':   _f(row['high']),
                'low':    _f(row['low']),
                'close':  _f(row['close']),
                'volume': int(row['volume']) if not _nan(row['volume']) else None,
                'ma20':   _f(row['ma20']),
                'ma60':   _f(row['ma60']),
                'ma120':  _f(row['ma120']),
                'rsi':    _f(row['rsi'], 2),
            })

        cur  = _f(df['close'].iloc[-1])
        prev = _f(df['close'].iloc[-2]) if len(df) > 1 else cur
        chg  = round(cur - prev, 4) if cur and prev else 0
        pct  = round(chg / prev * 100, 4) if prev else 0

        return {
            'ticker':        ticker.upper(),
            'short_name':    meta.get('shortName') or meta.get('symbol', ticker),
            'current_price': cur,
            'change':        chg,
            'change_pct':    pct,
            'week_52_high':  _f(df['high'].max()),
            'week_52_low':   _f(df['low'].min()),
            'prev_close':    _f(meta.get('chartPreviousClose') or prev),
            'volume':        int(meta.get('regularMarketVolume') or 0),
            'market_cap':    0,
            'pe_ratio':      0.0,
            'sector':        'N/A',
            'target_mean':   None,
            'target_high':   None,
            'target_low':    None,
            'recommendation': 'N/A',
            'num_analysts':  0,
            'hist':          hist_data,
        }
    except Exception as e:
        return None

# ─── Portfolio CRUD (SQLite) ──────────────────────────────────────────
def _load_user_portfolio(user_id: str) -> dict:
    with _db() as conn:
        rows = conn.execute(
            "SELECT account,ticker,name,avg_price,quantity,sector,manual_price FROM portfolios WHERE user_id=?",
            (user_id,)
        ).fetchall()
        wl = conn.execute(
            "SELECT ticker,name,exchange,qtype FROM watchlist WHERE user_id=?",
            (user_id,)
        ).fetchall()
    portfolios = {k: [] for k in ACCOUNTS}
    for r in rows:
        acc = r['account']
        if acc in portfolios:
            portfolios[acc].append({
                'ticker': r['ticker'], 'name': r['name'],
                'avg_price': r['avg_price'], 'quantity': r['quantity'],
                'sector': r['sector'],
                'manual_price': (r['manual_price'] if 'manual_price' in r.keys() else 0) or 0,
            })
    watchlist = [{'ticker': w['ticker'], 'name': w['name'],
                  'exchange': w['exchange'], 'qtype': w['qtype']} for w in wl]
    return {'portfolios': portfolios, 'watchlist': watchlist}

def _save_user_portfolio(user_id: str, user_data: dict):
    """포트폴리오 전체 저장 (PUT /portfolio 용)"""
    with _db() as conn:
        conn.execute("DELETE FROM portfolios WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM watchlist WHERE user_id=?", (user_id,))
        for acc, holdings in user_data.get('portfolios', {}).items():
            for h in holdings:
                conn.execute(
                    "INSERT INTO portfolios(user_id,account,ticker,name,avg_price,quantity,sector,manual_price) VALUES(?,?,?,?,?,?,?,?)",
                    (user_id, acc, h.get('ticker',''), h.get('name',''),
                     h.get('avg_price',0), h.get('quantity',0), h.get('sector',''),
                     h.get('manual_price',0) or 0)
                )
        for w in user_data.get('watchlist', []):
            conn.execute(
                "INSERT INTO watchlist(user_id,ticker,name,exchange,qtype) VALUES(?,?,?,?,?)",
                (user_id, w.get('ticker',''), w.get('name',''),
                 w.get('exchange',''), w.get('qtype',''))
            )

# ─── 하위 호환: settings (API key) ────────────────────────────────────
def _load() -> dict:
    """settings 접근 전용 (마이그레이션 이후에는 API key만 사용)"""
    with _db() as conn:
        key = conn.execute("SELECT value FROM settings WHERE key='anthropic_key'").fetchone()
    return {'settings': {'anthropic_key': key['value'] if key else ''}}

def _save(data: dict):
    """settings 저장 전용"""
    key = data.get('settings', {}).get('anthropic_key', '')
    with _db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('anthropic_key',?)", (key,))

# ─── Auth Helpers (SQLite) ────────────────────────────────────────────
def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split(':', 1)
        check = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
        return check.hex() == h
    except Exception:
        return False

def _get_user_from_token(token: str) -> Optional[dict]:
    with _db() as conn:
        row = conn.execute(
            "SELECT s.user_id, s.expires, u.email, u.name, u.nickname, u.is_admin, "
            "u.status, u.ai_enabled FROM sessions s "
            "JOIN users u ON u.user_id=s.user_id WHERE s.token=?", (token,)
        ).fetchone()
    if not row or row['expires'] < time():
        return None
    return {
        "user_id":    row['user_id'],
        "email":      row['email'],
        "name":       row['name'],
        "nickname":   row['nickname'] or row['name'],
        "is_admin":   bool(row['is_admin']),
        "status":     row['status'] if 'status' in row.keys() else 'approved',
        "ai_enabled": bool(row['ai_enabled']) if 'ai_enabled' in row.keys() else False,
    }

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "로그인이 필요합니다")
    token = authorization[7:].strip()
    user = _get_user_from_token(token)
    if not user:
        raise HTTPException(401, "세션이 만료되었습니다. 다시 로그인해주세요")
    # 승인되지 않은 사용자는 보호된 endpoint 접근 차단 (단 auth/me, auth/logout 제외 — 라우터에서 분기)
    return user

def require_approved(cu: dict = Depends(get_current_user)) -> dict:
    """승인 완료된 사용자만 허용 (pending/rejected/suspended는 차단)."""
    st = cu.get('status', 'approved')
    if st == 'pending':
        raise HTTPException(403, "가입 승인 대기 중입니다 — 관리자 승인 후 이용 가능합니다")
    if st == 'rejected':
        raise HTTPException(403, "가입이 거부되었습니다")
    if st == 'suspended':
        raise HTTPException(403, "계정이 일시 정지되었습니다 — 관리자에게 문의하세요")
    return cu

def require_ai_enabled(cu: dict = Depends(require_approved)) -> dict:
    """AI 비용 발생 기능 — 관리자가 사용자별로 ai_enabled=1로 켜야 호출 가능."""
    if cu.get('is_admin'):
        return cu  # 관리자는 항상 허용
    if not cu.get('ai_enabled'):
        raise HTTPException(
            403,
            "AI 분석 기능이 비활성화되어 있습니다 — 관리자에게 사용 권한 요청을 부탁드립니다"
        )
    return cu

def _log_event(user_id: str, event_type: str, details: dict = None):
    """감사 로그 — 가벼운 best-effort (실패해도 메인 로직 안 막음)."""
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO audit_log(ts, user_id, event_type, details) VALUES(?,?,?,?)",
                (time(), user_id or '', event_type, json.dumps(details or {}, ensure_ascii=False))
            )
    except Exception:
        pass

def _bump_login(user_id: str):
    try:
        with _db() as conn:
            conn.execute(
                "UPDATE users SET login_count = login_count + 1, last_seen_at = ? WHERE user_id=?",
                (time(), user_id)
            )
    except Exception:
        pass

def _bump_ai_call(user_id: str):
    try:
        with _db() as conn:
            conn.execute(
                "UPDATE users SET ai_call_count = ai_call_count + 1, last_seen_at = ? WHERE user_id=?",
                (time(), user_id)
            )
    except Exception:
        pass

# 하위 호환 alias (기존 코드에서 _load_user_data / _save_user_data 호출 부분)
def _load_user_data(user_id: str) -> dict:
    return _load_user_portfolio(user_id)

def _save_user_data(user_id: str, user_data: dict):
    _save_user_portfolio(user_id, user_data)

# ─── Auth Models & Endpoints ──────────────────────────────────────────
class RegisterReq(BaseModel):
    email: str
    password: str
    name: str = ''
    invite_code: str = ''

class LoginReq(BaseModel):
    email: str
    password: str

def _seed_default_accounts(uid: str):
    """신규 사용자에게 기본 계좌 4종을 시드. 관리자가 승인 시점에 호출."""
    defaults = [
        ('US',           '미국',  'USD', 0),
        ('KR_RETIRE',    '퇴직',  'KRW', 1),
        ('KR_PERSONAL',  '개별',  'KRW', 2),
        ('KR_ISA',       'ISA',  'KRW', 3),
    ]
    with _db() as conn:
        for key, label, cur, ordr in defaults:
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO accounts(user_id,key,label,currency,sort_order) VALUES(?,?,?,?,?)",
                    (uid, key, label, cur, ordr)
                )
            except Exception:
                pass

@app.post("/api/auth/register")
def auth_register(req: RegisterReq):
    email = req.email.lower().strip()
    if not email or '@' not in email:
        raise HTTPException(400, "유효한 이메일을 입력해주세요")
    if len(req.password) < 6:
        raise HTTPException(400, "비밀번호는 6자 이상이어야 합니다")
    uid  = str(uuid.uuid4())[:8]
    name = req.name or email.split('@')[0]

    # 첫 가입자 부트스트랩: 기존 사용자가 0명이면 자동 super-admin + approved + ai_enabled
    with _db() as conn:
        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()['c']
    is_first = (count == 0)

    # 초대 코드 게이트 (첫 사용자 제외) — settings에 코드가 설정돼 있으면 일치해야 가입.
    # 코드 미설정(빈 값)이면 게이트 비활성(누구나 가입 → 기존 승인 게이트만 작동).
    if not is_first:
        with _db() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key='invite_code'").fetchone()
        required = ((row['value'] if row else '') or '').strip()
        if required and (req.invite_code or '').strip() != required:
            _log_event('', 'register_blocked', {'email': email, 'reason': 'bad_invite_code'})
            raise HTTPException(403, "초대 코드가 올바르지 않습니다 — 관리자에게 코드를 요청하세요.")

    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users(user_id,email,name,pw_hash,created_at,status,ai_enabled,is_admin,approved_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (uid, email, name, _hash_password(req.password), datetime.now().isoformat(),
                 'approved' if is_first else 'pending',
                 1 if is_first else 0,
                 1 if is_first else 0,
                 time() if is_first else 0)
            )
    except sqlite3.IntegrityError:
        raise HTTPException(400, "이미 등록된 이메일입니다")

    _log_event(uid, 'register', {'email': email, 'first_user': is_first})

    if is_first:
        # 첫 사용자: 즉시 세션 발급 + 계좌 시드
        _seed_default_accounts(uid)
        token = secrets.token_hex(32)
        with _db() as conn:
            conn.execute(
                "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
                (token, uid, time() + 30 * 86400)
            )
        _bump_login(uid)
        _log_event(uid, 'login', {'auto_first_user': True})
        return {
            "token": token,
            "user": {"user_id": uid, "email": email, "name": name},
            "status": "approved",
            "message": "첫 사용자로서 관리자 권한이 부여되었습니다",
        }

    # 일반 가입: 토큰 없이 pending 상태만 반환 — 관리자 승인 후 로그인 가능
    return {
        "token": None,
        "status": "pending",
        "message": "가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.",
        "email": email,
    }

# ─── 데모 모드 (로그인 없이 둘러보기 — 외부 UI/UX 검증용) ────────────────
DEMO_UID = 'demo'
_DEMO_HOLDINGS = {
    'US': [
        {'ticker': 'AAPL',  'name': 'Apple',     'quantity': 30, 'avg_price': 210, 'sector': 'Technology'},
        {'ticker': 'MSFT',  'name': 'Microsoft', 'quantity': 15, 'avg_price': 410, 'sector': 'Technology'},
        {'ticker': 'NVDA',  'name': 'NVIDIA',    'quantity': 40, 'avg_price': 120, 'sector': 'Technology'},
        {'ticker': 'GOOGL', 'name': 'Alphabet',  'quantity': 20, 'avg_price': 165, 'sector': 'Communication'},
        {'ticker': 'TSLA',  'name': 'Tesla',     'quantity': 12, 'avg_price': 240, 'sector': 'Consumer'},
        {'ticker': 'AMZN',  'name': 'Amazon',    'quantity': 18, 'avg_price': 185, 'sector': 'Consumer'},
    ],
    'KR_RETIRE': [
        {'ticker': '005930', 'name': '삼성전자',         'quantity': 100, 'avg_price': 72000,  'sector': '반도체'},
        {'ticker': '000660', 'name': 'SK하이닉스',       'quantity': 20,  'avg_price': 180000, 'sector': '반도체'},
        {'ticker': '373220', 'name': 'LG에너지솔루션',   'quantity': 8,   'avg_price': 410000, 'sector': '2차전지'},
    ],
    'KR_PERSONAL': [
        {'ticker': '035420', 'name': 'NAVER', 'quantity': 15, 'avg_price': 195000, 'sector': '인터넷'},
        {'ticker': '035720', 'name': '카카오', 'quantity': 30, 'avg_price': 48000,  'sector': '인터넷'},
    ],
    'KR_ISA': [
        {'ticker': '005380', 'name': '현대차', 'quantity': 10, 'avg_price': 240000, 'sector': '자동차'},
        {'ticker': '000270', 'name': '기아',   'quantity': 25, 'avg_price': 105000, 'sector': '자동차'},
    ],
}
_DEMO_WATCHLIST = [
    {'ticker': 'META', 'name': 'Meta Platforms'},
    {'ticker': 'AVGO', 'name': 'Broadcom'},
    {'ticker': 'RXRX', 'name': 'Recursion Pharma'},
]

def _is_demo(cu: dict) -> bool:
    return bool(cu) and cu.get('user_id') == DEMO_UID

# 데모 공개 체험의 라이브 AI 생성(캐시 미스 시에만 소모) 24h 롤링 상한 — 비용 폭주 방지.
_demo_ai_calls: list = []
_DEMO_AI_DAILY_CAP = 40

def _demo_ai_budget_ok() -> bool:
    """데모용 라이브 AI 호출 예산 확인 + 차감. 한도 초과면 False (캐시만 제공)."""
    global _demo_ai_calls
    cutoff = time() - 86400
    _demo_ai_calls = [t for t in _demo_ai_calls if t > cutoff]
    if len(_demo_ai_calls) >= _DEMO_AI_DAILY_CAP:
        return False
    _demo_ai_calls.append(time())
    return True

def _seed_demo_user():
    """데모 유저 생성 + 샘플 포트폴리오로 리셋. 승인됨·AI 체험 on·비관리자 (안전한 샌드박스).
    AI는 캐시 우선 + 24h 롤링 한도로 비용 상한 (force_refresh 무시)."""
    with _db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users(user_id,email,name,nickname,pw_hash,created_at,"
            "status,ai_enabled,is_admin,approved_at) VALUES(?,?,?,?,?,?, 'approved', 1, 0, ?)",
            (DEMO_UID, 'demo@daon.app', '데모 사용자', '데모',
             _hash_password(secrets.token_hex(16)), datetime.now().isoformat(), time())
        )
        # 기존 데모 행(과거 ai_enabled=0으로 생성됨)도 체험 가능하도록 강제 갱신
        conn.execute("UPDATE users SET ai_enabled=1, status='approved', is_admin=0 WHERE user_id=?",
                     (DEMO_UID,))
    _seed_default_accounts(DEMO_UID)
    # 매 진입마다 샘플로 리셋 — 외부 검증자가 데이터를 바꿔도 다음 진입 시 깨끗
    ud = _load_user_data(DEMO_UID)
    ud['portfolios'] = {acc: [dict(h) for h in hs] for acc, hs in _DEMO_HOLDINGS.items()}
    ud['watchlist']  = [{'ticker': w['ticker'], 'name': w['name'], 'group_name': '기본'}
                        for w in _DEMO_WATCHLIST]
    _save_user_data(DEMO_UID, ud)

@app.post("/api/auth/demo")
def auth_demo():
    """로그인 없이 둘러보기 — 데모 세션 토큰 발급 (샘플 데이터·AI off·비관리자)."""
    try:
        _seed_demo_user()
    except Exception as e:
        raise HTTPException(500, f"데모 준비 실패: {str(e)[:80]}")
    token = secrets.token_hex(32)
    with _db() as conn:
        conn.execute("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
                     (token, DEMO_UID, time() + 7 * 86400))
    _log_event(DEMO_UID, 'login', {'demo': True})
    return {
        "token": token,
        "user": {"user_id": DEMO_UID, "email": "demo@daon.app", "name": "데모 사용자",
                 "nickname": "데모", "ai_enabled": True, "is_admin": False, "status": "approved"},
        "status": "approved",
        "demo": True,
    }

@app.post("/api/auth/login")
def auth_login(req: LoginReq):
    email = req.email.lower().strip()
    with _db() as conn:
        row = conn.execute(
            "SELECT user_id, name, pw_hash, status FROM users WHERE email=?", (email,)
        ).fetchone()
    if not row or not _verify_password(req.password, row['pw_hash']):
        _log_event('', 'login_fail', {'email': email})
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다")

    status = row['status'] if 'status' in row.keys() else 'approved'
    if status == 'pending':
        _log_event(row['user_id'], 'login_blocked', {'reason': 'pending'})
        raise HTTPException(403, "가입 승인 대기 중입니다 — 관리자 승인 후 로그인할 수 있습니다")
    if status == 'rejected':
        _log_event(row['user_id'], 'login_blocked', {'reason': 'rejected'})
        raise HTTPException(403, "가입이 거부되었습니다")
    if status == 'suspended':
        _log_event(row['user_id'], 'login_blocked', {'reason': 'suspended'})
        raise HTTPException(403, "계정이 일시 정지되었습니다 — 관리자에게 문의하세요")

    token = secrets.token_hex(32)
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
            (token, row['user_id'], time() + 30 * 86400)
        )
    _bump_login(row['user_id'])
    _log_event(row['user_id'], 'login', {})
    return {"token": token, "user": {"user_id": row['user_id'], "email": email, "name": row['name']}}

@app.post("/api/auth/logout")
def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        with _db() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    return {"ok": True}

@app.get("/api/auth/me")
def auth_me(current_user: dict = Depends(get_current_user)):
    return current_user

# ─── 관리자 암호 (절대 권한) ─────────────────────────────────────────
# admin 암호로 잠금 해제한 세션만 관리 기능 접근 가능
_admin_sessions: Dict[str, float] = {}  # {user_id: unlock_expires_ts}
_ADMIN_UNLOCK_TTL = 3600  # 1시간

def _admin_pw_hash() -> str:
    with _db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='admin_password_hash'").fetchone()
    return row['value'] if row else ''

def _set_admin_pw(password: str):
    h = _hash_password(password)
    with _db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES('admin_password_hash', ?)", (h,))

def _is_admin_unlocked(user_id: str) -> bool:
    exp = _admin_sessions.get(user_id)
    return bool(exp and exp > time())

def require_admin(cu: dict = Depends(get_current_user)) -> dict:
    if not cu.get('is_admin'):
        raise HTTPException(403, "관리자 권한이 필요합니다")
    if not _is_admin_unlocked(cu['user_id']):
        raise HTTPException(401, "관리자 모드가 잠겨 있습니다 - 암호를 입력하세요")
    return cu

class AdminUnlockReq(BaseModel):
    password: str

class AdminSetPwReq(BaseModel):
    current_password: str = ''  # 기존 암호 (변경 시 필수)
    new_password: str

@app.get("/api/admin/status")
def admin_status(cu: dict = Depends(get_current_user)):
    """현재 사용자의 관리자 상태 및 잠금 여부"""
    return {
        'is_admin':      bool(cu.get('is_admin')),
        'unlocked':      _is_admin_unlocked(cu['user_id']) if cu.get('is_admin') else False,
        'password_set':  bool(_admin_pw_hash()),
        'unlock_expires': _admin_sessions.get(cu['user_id']) if cu.get('is_admin') else None,
    }

@app.post("/api/admin/unlock")
def admin_unlock(req: AdminUnlockReq, cu: dict = Depends(get_current_user)):
    """admin 암호를 검증하고 세션 해제 (1시간 유효)"""
    if not cu.get('is_admin'):
        raise HTTPException(403, "관리자 권한이 없습니다")
    pw_hash = _admin_pw_hash()
    if not pw_hash:
        raise HTTPException(400, "관리자 암호가 설정되지 않았습니다 - 먼저 설정해주세요")
    if not _verify_password(req.password, pw_hash):
        raise HTTPException(401, "관리자 암호가 일치하지 않습니다")
    _admin_sessions[cu['user_id']] = time() + _ADMIN_UNLOCK_TTL
    return {'ok': True, 'unlock_expires': _admin_sessions[cu['user_id']]}

@app.post("/api/admin/lock")
def admin_lock(cu: dict = Depends(get_current_user)):
    """현재 세션의 관리자 모드 해제"""
    _admin_sessions.pop(cu['user_id'], None)
    return {'ok': True}

@app.post("/api/admin/set-password")
def admin_set_password(req: AdminSetPwReq, cu: dict = Depends(get_current_user)):
    """관리자 암호 최초 설정 또는 변경 (is_admin 필수)"""
    if not cu.get('is_admin'):
        raise HTTPException(403, "관리자 권한이 없습니다")
    if len(req.new_password) < 6:
        raise HTTPException(400, "새 암호는 6자 이상이어야 합니다")
    existing = _admin_pw_hash()
    if existing:
        # 변경: 기존 암호 검증 필요
        if not _verify_password(req.current_password, existing):
            raise HTTPException(401, "현재 관리자 암호가 일치하지 않습니다")
    _set_admin_pw(req.new_password)
    _admin_sessions[cu['user_id']] = time() + _ADMIN_UNLOCK_TTL  # 설정 직후 자동 해제
    return {'ok': True}

# ─── 프로필 업데이트 (닉네임 변경) ─────────────────────────────────────
class ProfileUpdateReq(BaseModel):
    nickname: str

@app.put("/api/auth/profile")
def update_profile(req: ProfileUpdateReq, cu: dict = Depends(get_current_user)):
    nick = (req.nickname or '').strip()[:30]
    if not nick:
        raise HTTPException(400, "닉네임은 비워둘 수 없습니다")
    with _db() as conn:
        conn.execute("UPDATE users SET nickname=? WHERE user_id=?", (nick, cu['user_id']))
    return {"ok": True, "nickname": nick}

# ─── 사용자 관리 (admin 전용) ─────────────────────────────────────────
@app.get("/api/admin/users")
def list_users(cu: dict = Depends(require_admin)):
    """사용자 목록 조회 — admin 잠금 해제 필수. 가입 승인 상태/AI 권한/활동 지표 포함."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT u.user_id, u.email, u.name, u.nickname, u.is_admin, u.created_at, "
            "u.status, u.ai_enabled, u.last_seen_at, u.login_count, u.ai_call_count, u.approved_at, "
            "(SELECT COUNT(*) FROM portfolios p WHERE p.user_id=u.user_id) AS holdings, "
            "(SELECT COUNT(*) FROM watchlist w WHERE w.user_id=u.user_id) AS watchlist_cnt "
            "FROM users u ORDER BY "
            "CASE u.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, "
            "u.created_at DESC"
        ).fetchall()
    return {
        'is_admin': True,
        'users': [
            {
                'user_id':       r['user_id'],
                'email':         r['email'],
                'name':          r['name'],
                'nickname':      r['nickname'] or r['name'],
                'is_admin':      bool(r['is_admin']),
                'created_at':    r['created_at'],
                'holdings':      r['holdings'],
                'watchlist':     r['watchlist_cnt'],
                'status':        r['status'],
                'ai_enabled':    bool(r['ai_enabled']),
                'last_seen_at':  r['last_seen_at'],
                'login_count':   r['login_count'],
                'ai_call_count': r['ai_call_count'],
                'approved_at':   r['approved_at'],
            } for r in rows
        ]
    }


class InviteCodeReq(BaseModel):
    code: str = ''

@app.get("/api/admin/invite_code")
def get_invite_code(cu: dict = Depends(require_admin)):
    """현재 공통 초대 코드 조회 (admin). 빈 값이면 게이트 비활성."""
    with _db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='invite_code'").fetchone()
    code = ((row['value'] if row else '') or '').strip()
    return {'code': code, 'enabled': bool(code)}

@app.put("/api/admin/invite_code")
def set_invite_code(req: InviteCodeReq, cu: dict = Depends(require_admin)):
    """공통 초대 코드 설정/변경 (admin). 빈 값으로 저장하면 게이트 해제(누구나 가입)."""
    code = (req.code or '').strip()
    with _db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('invite_code',?)", (code,))
    _log_event(cu['user_id'], 'admin_set_invite_code', {'enabled': bool(code)})
    return {'ok': True, 'enabled': bool(code), 'code': code}


class UserActionReq(BaseModel):
    reason: str = ''


def _admin_target_user(user_id: str) -> sqlite3.Row:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    return row


@app.post("/api/admin/users/{user_id}/approve")
def admin_approve(user_id: str, req: UserActionReq = UserActionReq(),
                  cu: dict = Depends(require_admin)):
    """가입 승인 — pending → approved 전환 + 기본 계좌 시드."""
    target = _admin_target_user(user_id)
    if target['status'] == 'approved':
        return {'ok': True, 'already': True}
    with _db() as conn:
        conn.execute(
            "UPDATE users SET status='approved', approved_at=? WHERE user_id=?",
            (time(), user_id)
        )
    _seed_default_accounts(user_id)
    _log_event(cu['user_id'], 'admin_approve_user', {
        'target_user': user_id, 'target_email': target['email'], 'reason': req.reason})
    return {'ok': True, 'user_id': user_id, 'status': 'approved'}


@app.post("/api/admin/users/{user_id}/reject")
def admin_reject(user_id: str, req: UserActionReq = UserActionReq(),
                 cu: dict = Depends(require_admin)):
    """가입 거부 — pending → rejected 전환."""
    target = _admin_target_user(user_id)
    if target['user_id'] == cu['user_id']:
        raise HTTPException(400, "자신을 거부할 수 없습니다")
    with _db() as conn:
        conn.execute("UPDATE users SET status='rejected' WHERE user_id=?", (user_id,))
        # 활성 세션 삭제
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    _log_event(cu['user_id'], 'admin_reject_user', {
        'target_user': user_id, 'target_email': target['email'], 'reason': req.reason})
    return {'ok': True, 'user_id': user_id, 'status': 'rejected'}


@app.post("/api/admin/users/{user_id}/suspend")
def admin_suspend(user_id: str, req: UserActionReq = UserActionReq(),
                  cu: dict = Depends(require_admin)):
    """일시 정지 — approved → suspended."""
    target = _admin_target_user(user_id)
    if target['user_id'] == cu['user_id']:
        raise HTTPException(400, "자신을 정지할 수 없습니다")
    with _db() as conn:
        conn.execute("UPDATE users SET status='suspended' WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    _log_event(cu['user_id'], 'admin_suspend_user', {
        'target_user': user_id, 'target_email': target['email'], 'reason': req.reason})
    return {'ok': True, 'user_id': user_id, 'status': 'suspended'}


@app.post("/api/admin/users/{user_id}/reinstate")
def admin_reinstate(user_id: str, cu: dict = Depends(require_admin)):
    """정지 해제 — suspended/rejected → approved."""
    target = _admin_target_user(user_id)
    with _db() as conn:
        conn.execute("UPDATE users SET status='approved' WHERE user_id=?", (user_id,))
    _log_event(cu['user_id'], 'admin_reinstate_user', {
        'target_user': user_id, 'target_email': target['email']})
    return {'ok': True, 'user_id': user_id, 'status': 'approved'}


class AiToggleReq(BaseModel):
    enabled: bool


@app.post("/api/admin/users/{user_id}/ai-toggle")
def admin_ai_toggle(user_id: str, req: AiToggleReq, cu: dict = Depends(require_admin)):
    """AI 사용 권한 부여/회수 (비용 발생 기능 게이트)."""
    target = _admin_target_user(user_id)
    with _db() as conn:
        conn.execute(
            "UPDATE users SET ai_enabled=? WHERE user_id=?",
            (1 if req.enabled else 0, user_id)
        )
    _log_event(cu['user_id'], 'admin_ai_toggle', {
        'target_user': user_id, 'target_email': target['email'], 'enabled': req.enabled})
    return {'ok': True, 'user_id': user_id, 'ai_enabled': req.enabled}


class PromoteReq(BaseModel):
    is_admin: bool


@app.post("/api/admin/users/{user_id}/promote")
def admin_promote(user_id: str, req: PromoteReq, cu: dict = Depends(require_admin)):
    """관리자 권한 부여/회수. 자기 자신 권한 회수는 불가."""
    target = _admin_target_user(user_id)
    if not req.is_admin and target['user_id'] == cu['user_id']:
        raise HTTPException(400, "자신의 관리자 권한을 회수할 수 없습니다 — 다른 관리자에게 부탁하세요")
    with _db() as conn:
        conn.execute("UPDATE users SET is_admin=? WHERE user_id=?",
                     (1 if req.is_admin else 0, user_id))
    _log_event(cu['user_id'], 'admin_promote', {
        'target_user': user_id, 'target_email': target['email'], 'is_admin': req.is_admin})
    return {'ok': True, 'user_id': user_id, 'is_admin': req.is_admin}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, cu: dict = Depends(require_admin)):
    """사용자 완전 삭제 (자기 자신 불가). 모든 데이터 cascading 삭제."""
    target = _admin_target_user(user_id)
    if target['user_id'] == cu['user_id']:
        raise HTTPException(400, "자신을 삭제할 수 없습니다")
    with _db() as conn:
        conn.execute("DELETE FROM portfolios WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM watchlist WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM accounts WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM metrics_cache WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM strategy_cache WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE user_id=?", (user_id,))
    _log_event(cu['user_id'], 'admin_delete_user', {
        'target_user': user_id, 'target_email': target['email']})
    return {'ok': True}


@app.get("/api/admin/stats")
def admin_stats(cu: dict = Depends(require_admin)):
    """앱 사용 현황 — 사용자 수·로그인·AI 호출 집계."""
    now = time()
    with _db() as conn:
        totals = conn.execute(
            "SELECT "
            "  COUNT(*) AS total_users, "
            "  SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_users, "
            "  SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_users, "
            "  SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended_users, "
            "  SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected_users, "
            "  SUM(CASE WHEN ai_enabled=1 THEN 1 ELSE 0 END) AS ai_enabled_users, "
            "  SUM(CASE WHEN is_admin=1 THEN 1 ELSE 0 END) AS admin_users, "
            "  SUM(login_count) AS total_logins, "
            "  SUM(ai_call_count) AS total_ai_calls "
            "FROM users"
        ).fetchone()
        active_24h = conn.execute(
            "SELECT COUNT(*) AS c FROM users WHERE last_seen_at > ?",
            (now - 86400,)
        ).fetchone()['c']
        active_7d = conn.execute(
            "SELECT COUNT(*) AS c FROM users WHERE last_seen_at > ?",
            (now - 86400 * 7,)
        ).fetchone()['c']
        # 일별 가입자 추이 (최근 30일)
        signup_rows = conn.execute(
            "SELECT DATE(created_at) AS d, COUNT(*) AS c FROM users "
            "WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY d",
            (datetime.fromtimestamp(now - 30 * 86400).isoformat(),)
        ).fetchall()
        # 최근 7일 AI 호출 (audit_log 기반)
        ai_calls_7d = conn.execute(
            "SELECT DATE(ts, 'unixepoch') AS d, COUNT(*) AS c FROM audit_log "
            "WHERE event_type='ai_call' AND ts > ? GROUP BY DATE(ts, 'unixepoch') ORDER BY d",
            (now - 86400 * 7,)
        ).fetchall()
    return {
        'totals': {k: (totals[k] or 0) for k in totals.keys()},
        'active_24h': active_24h,
        'active_7d':  active_7d,
        'signup_trend':   [{'date': r['d'], 'count': r['c']} for r in signup_rows],
        'ai_call_trend':  [{'date': r['d'], 'count': r['c']} for r in ai_calls_7d],
    }


@app.get("/api/admin/audit-log")
def admin_audit_log(limit: int = 50, event_type: str = '', cu: dict = Depends(require_admin)):
    """최근 활동 로그 (가입·로그인·AI 호출·관리자 액션 등)."""
    limit = min(max(limit, 1), 500)
    with _db() as conn:
        if event_type:
            rows = conn.execute(
                "SELECT a.id, a.ts, a.user_id, a.event_type, a.details, u.email "
                "FROM audit_log a LEFT JOIN users u ON u.user_id=a.user_id "
                "WHERE a.event_type=? ORDER BY a.ts DESC LIMIT ?",
                (event_type, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT a.id, a.ts, a.user_id, a.event_type, a.details, u.email "
                "FROM audit_log a LEFT JOIN users u ON u.user_id=a.user_id "
                "ORDER BY a.ts DESC LIMIT ?",
                (limit,)
            ).fetchall()
    return {
        'events': [
            {
                'id': r['id'], 'ts': r['ts'],
                'user_id': r['user_id'], 'email': r['email'] or '',
                'event_type': r['event_type'],
                'details': (lambda d: json.loads(d) if d else {})(r['details']),
            } for r in rows
        ]
    }


# ─── 동적 계좌 (Dynamic Accounts) ─────────────────────────────────────
class AccountUpsertReq(BaseModel):
    key:        str           # 영문/숫자/언더스코어 (예: 'BR_MAIN'); 새 계좌 생성 시 필수
    label:      str           # 사용자에게 보일 한글 라벨 (예: '브라질 메인')
    currency:   str = 'KRW'   # 'KRW' | 'USD' | 'BRL' | 'JPY' 등
    sort_order: int = 0


@app.get("/api/accounts")
def get_accounts(cu: dict = Depends(require_approved)):
    """현재 사용자의 계좌 목록 — 없으면 기본 4종 자동 시드."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT key, label, currency, sort_order FROM accounts "
            "WHERE user_id=? ORDER BY sort_order, key",
            (cu['user_id'],)
        ).fetchall()
    if not rows:
        _seed_default_accounts(cu['user_id'])
        with _db() as conn:
            rows = conn.execute(
                "SELECT key, label, currency, sort_order FROM accounts "
                "WHERE user_id=? ORDER BY sort_order, key",
                (cu['user_id'],)
            ).fetchall()
    return {'accounts': [dict(r) for r in rows]}


@app.post("/api/accounts")
def add_account(req: AccountUpsertReq, cu: dict = Depends(require_approved)):
    """계좌 추가. key는 영문/숫자/언더스코어로 자동 정규화."""
    key = re.sub(r'[^A-Za-z0-9_]', '_', (req.key or '').upper().strip())[:32]
    if not key:
        raise HTTPException(400, "계좌 키가 비어 있습니다")
    label = (req.label or '').strip()[:30]
    if not label:
        raise HTTPException(400, "계좌 이름이 비어 있습니다")
    currency = (req.currency or 'KRW').upper()[:8]
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO accounts(user_id,key,label,currency,sort_order) VALUES(?,?,?,?,?)",
                (cu['user_id'], key, label, currency, req.sort_order)
            )
    except sqlite3.IntegrityError:
        raise HTTPException(400, "동일한 키의 계좌가 이미 있습니다")
    return {'ok': True, 'account': {'key': key, 'label': label, 'currency': currency, 'sort_order': req.sort_order}}


@app.put("/api/accounts/{key}")
def update_account(key: str, req: AccountUpsertReq, cu: dict = Depends(require_approved)):
    """계좌 정보 수정 (key 자체는 변경 불가 — 별도 endpoint 미제공으로 단순화)."""
    label = (req.label or '').strip()[:30]
    if not label:
        raise HTTPException(400, "계좌 이름이 비어 있습니다")
    currency = (req.currency or 'KRW').upper()[:8]
    with _db() as conn:
        cur = conn.execute(
            "UPDATE accounts SET label=?, currency=?, sort_order=? WHERE user_id=? AND key=?",
            (label, currency, req.sort_order, cu['user_id'], key)
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "계좌를 찾을 수 없습니다")
    return {'ok': True}


@app.delete("/api/accounts/{key}")
def delete_account(key: str, cu: dict = Depends(require_approved)):
    """계좌 삭제. 해당 계좌에 보유 종목이 있으면 거부."""
    with _db() as conn:
        cnt = conn.execute(
            "SELECT COUNT(*) AS c FROM portfolios WHERE user_id=? AND account=?",
            (cu['user_id'], key)
        ).fetchone()['c']
        if cnt > 0:
            raise HTTPException(400, f"이 계좌에 {cnt}개 종목이 있어 삭제할 수 없습니다 — 먼저 종목을 다른 계좌로 옮기세요")
        conn.execute("DELETE FROM accounts WHERE user_id=? AND key=?", (cu['user_id'], key))
    return {'ok': True}

# ─── 포트폴리오 백업/원복 ─────────────────────────────────────────────
class PortfolioBackup(BaseModel):
    portfolios: dict = {}
    watchlist:  list = []

@app.get("/api/portfolio/backup")
def get_backup(cu: dict = Depends(get_current_user)):
    """최근 자동 백업 스냅샷 조회"""
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key=?", (f"backup:{cu['user_id']}",)
        ).fetchone()
    if not row:
        return {"has_backup": False}
    try:
        data = json.loads(row['value'])
        return {"has_backup": True, **data}
    except Exception:
        return {"has_backup": False}

@app.post("/api/portfolio/restore")
def restore_backup(cu: dict = Depends(get_current_user)):
    """최근 백업으로 원복"""
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key=?", (f"backup:{cu['user_id']}",)
        ).fetchone()
    if not row:
        raise HTTPException(404, "복원할 백업이 없습니다")
    try:
        data = json.loads(row['value'])
    except Exception:
        raise HTTPException(500, "백업 데이터 파싱 실패")
    _save_user_data(cu['user_id'], {
        'portfolios': data.get('portfolios', {}),
        'watchlist':  data.get('watchlist', []),
    })
    return {"ok": True}

def _stored_api_key() -> str:
    """SQLite settings 테이블에서 Anthropic API 키 반환"""
    with _db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='anthropic_key'").fetchone()
    return row['value'] if row else ''

def _ai_error_message(status_code: int, body_excerpt: str = "") -> str:
    """Anthropic API 상태코드를 한국어 사용자 안내로 변환."""
    if status_code == 429:
        return ("AI 요청 한도 초과 (429) — Anthropic API의 분당 토큰/요청 한도를 잠시 넘었습니다. "
                "20~60초 뒤 다시 시도해주세요. 자주 발생하면 console.anthropic.com 에서 사용 한도(Tier)를 확인하세요.")
    if status_code == 401:
        return "API Key 인증 실패 (401) — 관리 탭에서 Anthropic API Key를 다시 확인해주세요."
    if status_code == 400:
        snippet = f" · 상세: {body_excerpt[:120]}" if body_excerpt else ""
        return f"AI 요청 형식 오류 (400){snippet}"
    if status_code == 529:
        return "AI 서버 과부하 (529) — Anthropic이 일시적으로 혼잡합니다. 30~90초 뒤 다시 시도해주세요."
    if status_code in (500, 502, 503, 504):
        return f"AI 서버 일시 장애 ({status_code}) — 잠시 후 다시 시도해주세요."
    return f"AI 비서가 잠시 자리를 비웠습니다 ({status_code})"

# 종목당 AI 입력 텍스트(뉴스/공시 등 가변 데이터) 상한 — 페이로드 과대로 인한 API 400/413 방어
MAX_STOCK_PAYLOAD_CHARS = 50_000


def _sanitize_unicode(s):
    """JSON 직렬화 불가 문자(lone surrogate 등)를 제거.

    BeautifulSoup으로 긁은 뉴스/공시 텍스트에 깨진 서로게이트(\\ud800~\\udfff 단독)가
    섞이면 requests의 json.dumps가 'no low surrogate in string' 에러로 400을 유발한다.
    encode('utf-8','ignore') → decode 로 강제 정제."""
    if not isinstance(s, str):
        return s
    return s.encode('utf-8', 'ignore').decode('utf-8', 'ignore')


def _truncate_head(s, limit: int = MAX_STOCK_PAYLOAD_CHARS):
    """텍스트가 limit를 넘으면 상위(최신) 내용만 남기고 잘라냄.

    뉴스/공시는 최신순으로 쌓이므로 앞부분(head)을 유지하고 뒤를 버린다."""
    if not isinstance(s, str) or len(s) <= limit:
        return s
    return s[:limit] + "\n…(이하 생략 — 입력 길이 제한)"


def _sanitize_payload(obj):
    """payload 내 모든 문자열 값을 재귀적으로 유니코드 정제 (json.dumps 전처리)."""
    if isinstance(obj, str):
        return _sanitize_unicode(obj)
    if isinstance(obj, dict):
        return {k: _sanitize_payload(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_payload(v) for v in obj]
    return obj


def _anthropic_post(payload: dict, api_key: str, timeout: int) -> requests.Response:
    """Anthropic /v1/messages 호출 — 429/529 시 1회 자동 재시도 (Retry-After 헤더 존중, 최대 8초 대기)."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01",
               "content-type": "application/json"}
    # json.dumps(requests 내부) 전에 깨진 유니코드를 강제 정제 — 'no low surrogate' 400 차단
    payload = _sanitize_payload(payload)
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if resp.status_code in (429, 529):
        # Retry-After 헤더가 있으면 그 값(초)을, 없으면 6초 대기. 단 8초로 상한.
        retry_after = 6
        ra_hdr = resp.headers.get("retry-after") or resp.headers.get("Retry-After")
        if ra_hdr:
            try:
                retry_after = min(8, max(2, int(float(ra_hdr))))
            except Exception:
                pass
        sleep(retry_after)
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    return resp


def _call_claude(api_key: str, model: str, prompt: str, max_tokens: int, timeout: int) -> str:
    """Claude API 호출 — system 프롬프트로 순수 JSON 반환 강제. 429/529는 1회 자동 재시도."""
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": (
            "You are a financial analyst AI. "
            "IMPORTANT: Respond with valid JSON ONLY. "
            "Do NOT use markdown code blocks (no ```json). "
            "Do NOT use actual newline characters inside JSON string values — use a space instead. "
            "Do NOT use unescaped double quotes inside string values. "
            "Your entire response must be a single valid JSON object starting with { and ending with }."
        ),
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = _anthropic_post(payload, api_key, timeout)
    if resp.status_code != 200:
        body_excerpt = ""
        try:
            body_excerpt = (resp.json().get("error") or {}).get("message", "") or resp.text[:200]
        except Exception:
            body_excerpt = resp.text[:200]
        raise HTTPException(resp.status_code, _ai_error_message(resp.status_code, body_excerpt))
    return resp.json()["content"][0]["text"]


def _call_claude_with_search(api_key: str, model: str, prompt: str,
                             max_tokens: int = 8192, max_searches: int = 4,
                             timeout: int = 180) -> tuple[str, list]:
    """Claude API 호출 + web_search 도구 사용. (마지막 텍스트 블록, 인용 출처 리스트) 반환.

    중요: web_search를 쓰면 응답에 thinking-text 블록이 여러 개 포함됨.
    JSON 응답만 안정적으로 추출하기 위해 '마지막 text 블록'을 우선 반환한다.
    429/529는 1회 자동 재시도 (Retry-After 존중).
    """
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "tools": [{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": max_searches,
        }],
        "system": (
            "You are a senior equity research analyst writing in KOREAN.\n"
            "Use the web_search tool to gather recent factual data, then produce ONE final JSON answer.\n"
            "STRICT RULES for the FINAL response:\n"
            "1. The final response MUST be a single valid JSON object — nothing before {, nothing after }.\n"
            "2. Do NOT include any reasoning, search notes, English narration, or markdown fences.\n"
            "3. ALL field values inside the JSON must be written in Korean (한국어). "
            "   Numbers, percentages, currency symbols, ticker symbols are allowed as-is.\n"
            "4. Inside JSON string values, replace actual newlines with a space, escape any double quotes.\n"
            "5. If a fact is not confirmed by search, write '확인 필요' for that field — never fabricate."
        ),
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = _anthropic_post(payload, api_key, timeout)
    if resp.status_code != 200:
        body_excerpt = ""
        try:
            body_excerpt = (resp.json().get("error") or {}).get("message", "") or resp.text[:200]
        except Exception:
            body_excerpt = resp.text[:200]
        raise HTTPException(resp.status_code, _ai_error_message(resp.status_code, body_excerpt))

    data = resp.json()
    text_blocks: list[str] = []   # 모든 text 블록 순서대로
    citations: list[dict] = []
    seen_urls: set[str] = set()

    for block in data.get("content", []):
        btype = block.get("type")
        if btype == "text":
            text_blocks.append(block.get("text", ""))
            for cit in (block.get("citations") or []):
                if cit.get("type") in ("web_search_result_location", "web_fetch_result_location"):
                    url = cit.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        citations.append({
                            "title":   (cit.get("title") or "")[:140],
                            "url":     url,
                            "snippet": (cit.get("cited_text") or "")[:240],
                        })
        elif btype == "web_search_tool_result":
            for r in (block.get("content") or []):
                if r.get("type") == "web_search_result":
                    url = r.get("url", "")
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        citations.append({
                            "title":   (r.get("title") or "")[:140],
                            "url":     url,
                            "snippet": "",
                        })

    # 마지막 text 블록을 우선 반환 (web_search 사용 시 그것이 최종 JSON)
    # 만약 마지막 블록이 너무 짧거나 JSON처럼 안 보이면, 마지막 '{...}' 블록을 모든 text 합본에서 추출
    final_text = text_blocks[-1].strip() if text_blocks else ""
    if not (final_text.startswith("{") and final_text.endswith("}")):
        merged = "\n".join(text_blocks)
        # 가장 마지막 '{...}' 매치 (greedy, multi-line)
        matches = list(re.finditer(r'\{[\s\S]*\}', merged))
        if matches:
            final_text = matches[-1].group()
        else:
            final_text = merged   # 최후의 수단 — 파서에서 처리

    return final_text, citations

def _parse_claude_json(text: str) -> dict:
    """Claude 응답 → dict 변환. 4단계 시도."""
    candidates = [text]
    m = re.search(r'\{.*\}', text, re.DOTALL)
    if m and m.group() != text:
        candidates.append(m.group())

    for raw in candidates:
        # 시도 1: 직접 파싱
        try:
            return json.loads(raw)
        except Exception:
            pass

        # 시도 2: 문자열 안의 제어문자만 공백으로 치환 (상태머신)
        try:
            out, in_str, i = [], False, 0
            while i < len(raw):
                c = raw[i]
                if c == '\\' and in_str and i + 1 < len(raw):
                    out.append(c); out.append(raw[i+1]); i += 2; continue
                if c == '"':
                    in_str = not in_str
                elif in_str and ord(c) < 0x20:
                    out.append(' '); i += 1; continue
                out.append(c); i += 1
            return json.loads(''.join(out))
        except Exception:
            pass

        # 시도 3: 공격적 — 모든 제어문자 공백 치환
        try:
            return json.loads(re.sub(r'[\x00-\x1f\x7f]', ' ', raw))
        except Exception:
            pass

        # 시도 4: max_tokens 잘림 대응 — 마지막 완전한 '}'까지 잘라서 닫기 시도
        try:
            # 열린 중괄호/대괄호 수를 추적해 마지막 완전한 위치 찾기
            cleaned = re.sub(r'[\x00-\x1f\x7f]', ' ', raw)
            depth = 0
            last_complete = -1
            in_s, i = False, 0
            while i < len(cleaned):
                c = cleaned[i]
                if c == '\\' and in_s:
                    i += 2; continue
                if c == '"':
                    in_s = not in_s
                elif not in_s:
                    if c in '{[':
                        depth += 1
                    elif c in '}]':
                        depth -= 1
                        if depth == 0:
                            last_complete = i
                i += 1
            if last_complete > 0:
                return json.loads(cleaned[:last_complete + 1])
        except Exception:
            pass

    raise ValueError(f"JSON 파싱 실패 (text[:80]={text[:80]!r})")

# ─── Data Functions ───────────────────────────────────────────────────
@ttl_cache(300)
def _market_data():
    """12개 마켓 지수를 병렬 HTTP 호출 — 순차 합산 대기 없음."""
    def _fetch_one(name_ticker):
        name, ticker = name_ticker
        try:
            res = _yf_chart(ticker, '1mo', '1d')
            if not res:
                return None
            p = _chart_to_price(res)
            if p:
                return {
                    'name': name, 'ticker': ticker,
                    'price': p['current_price'],
                    'pct':   p['change_pct'],
                    **p,
                }
        except Exception:
            pass
        return None

    results_map = {}
    with _cf.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(_fetch_one, nt): nt for nt in MARKET_TICKERS}
        for fut in _cf.as_completed(futs, timeout=15):
            try:
                item = fut.result(timeout=0)
                if item:
                    results_map[item['ticker']] = item
            except Exception:
                pass
    # MARKET_TICKERS 순서 유지
    return [results_map[t] for _, t in MARKET_TICKERS if t in results_map]

@ttl_cache(3600)
def _usd_krw() -> float:
    res = _yf_chart('KRW=X', '1d', '1m')
    if res:
        p = _chart_to_price(res)
        if p:
            return p['current_price']
    return 1300.0

@ttl_cache(90)
def _price_fast(ticker: str) -> dict | None:
    res = _yf_chart(ticker, '1mo', '1d')
    return _chart_to_price(res) if res else None

def _yf_info_safe(ticker: str, timeout: int = 8) -> dict:
    """yf.Ticker.info를 별도 스레드에서 실행 — 무한 hang 방지."""
    try:
        import yfinance as yf
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(lambda: yf.Ticker(ticker).info)
            return future.result(timeout=timeout)
    except Exception:
        return {}

def _yf_history_safe(ticker: str, period: str = '1y', timeout: int = 12):
    """yf.Ticker.history를 별도 스레드에서 실행 — 무한 hang 방지."""
    try:
        import yfinance as yf
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(lambda: yf.Ticker(ticker).history(period=period))
            return future.result(timeout=timeout)
    except Exception:
        return None

@ttl_cache(120)
def _stock_full(ticker: str) -> dict | None:
    # chart 와 meta 를 병렬 실행 → 합산 대기 없음
    with _cf.ThreadPoolExecutor(max_workers=2) as ex:
        chart_fut = ex.submit(_yf_chart, ticker, '5y', '1d')
        info_fut  = ex.submit(_yf_info_safe, ticker, 6)   # timeout=6s
        try:
            res = chart_fut.result(timeout=13)
        except Exception:
            res = None
        try:
            info = info_fut.result(timeout=7)
        except Exception:
            info = {}
    if not res:
        return None
    data = _chart_to_full(ticker, res)
    if not data:
        return None
    # 추가 메타 (analyst target 등)
    try:
        if info:
            data['market_cap']    = int(info.get('marketCap') or 0)
            data['pe_ratio']      = float(info.get('trailingPE') or 0)
            data['sector']        = info.get('sector', 'N/A')
            data['short_name']    = info.get('shortName', data['short_name'])
            data['target_mean']   = info.get('targetMeanPrice')
            data['target_high']   = info.get('targetHighPrice')
            data['target_low']    = info.get('targetLowPrice')
            data['recommendation']= info.get('recommendationKey', 'N/A')
            data['num_analysts']  = int(info.get('numberOfAnalystOpinions') or 0)
            data['exchange']      = info.get('exchange', '')          # NMS/NYQ 등
            data['quote_type']    = info.get('quoteType', '')         # EQUITY/ETF
            data['profit_margin'] = (round(float(info['profitMargins']) * 100, 2)
                                     if info.get('profitMargins') is not None
                                     and not _nan(info.get('profitMargins')) else None)
    except Exception:
        pass  # meta 실패해도 chart는 표시
    return data

# 한국 종목 가격 이중화 — fresh(5분) + stale(30분 fallback) 캐시
_kr_price_cache: dict = {}      # ticker -> (fresh_until_epoch, data)
_kr_price_stale: dict = {}      # ticker -> (last_ok_epoch, data)  — 마지막 정상값 보관
_KR_FRESH_TTL = 300             # 5분 — 정상 응답을 캐시
_KR_STALE_TTL = 1800            # 30분 — Naver/yfinance 모두 실패 시 마지막 정상값 반환

def _kr_price(ticker: str) -> dict | None:
    """KR 종목 현재가 — Naver 1차 → yfinance 2차 → stale 3차.
    HTML 구조 변경/네트워크 오류 시에도 마지막 정상값(30분 내) 반환해 한국 종목 전체 0 표시를 방지."""
    now = time()
    # 1) fresh 캐시 hit
    if ticker in _kr_price_cache:
        until, data = _kr_price_cache[ticker]
        if now < until:
            return data

    code = kr_code(ticker)
    fetched = None

    # 2-1) 1차 — Naver Finance 스크래핑
    try:
        r = _session.get(f'https://finance.naver.com/item/main.nhn?code={code}',
                         headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            el = soup.select_one('.no_today .blind')
            if el:
                cur = int(el.text.replace(',', '').strip())
                cel = soup.select_one('.no_exday .blind')
                chg = int(cel.text.replace(',', '').strip()) if cel else 0
                prev = cur - chg
                fetched = {
                    'current_price': cur, 'change': chg,
                    'change_pct': round(chg / prev * 100, 4) if prev > 0 else 0.0,
                    '_source': 'naver',
                }
    except Exception:
        pass

    # 2-2) 2차 — yfinance fallback (.KS / .KQ)
    # 변경점: Naver가 200 응답이지만 element 못 찾는 경우(HTML 구조 변경)에도 fallback 시도
    if fetched is None:
        for sfx in ['.KS', '.KQ']:
            try:
                hist = _yf_history_safe(f"{code}{sfx}", period='2d', timeout=3)
                if hist is not None and not hist.empty:
                    cur  = float(hist['Close'].iloc[-1])
                    prev = float(hist['Close'].iloc[-2]) if len(hist) > 1 else cur
                    chg  = cur - prev
                    fetched = {
                        'current_price': round(cur), 'change': round(chg),
                        'change_pct': round(chg / prev * 100, 4) if prev > 0 else 0.0,
                        '_source': f'yfinance{sfx}',
                    }
                    break
            except Exception:
                pass

    # 3) 정상 응답 — fresh + stale 캐시 모두 갱신
    if fetched is not None:
        _kr_price_cache[ticker] = (now + _KR_FRESH_TTL, fetched)
        _kr_price_stale[ticker] = (now, fetched)
        return fetched

    # 4) Stale fallback — 30분 내 마지막 정상값 반환 (0 표시 방지)
    if ticker in _kr_price_stale:
        last_ok, data = _kr_price_stale[ticker]
        if now - last_ok < _KR_STALE_TTL:
            stale = dict(data)
            stale['_stale'] = True
            stale['_stale_age_sec'] = int(now - last_ok)
            return stale

    return None

@ttl_cache(1800)
def _kr_history(ticker: str) -> list | None:
    """직접 Yahoo Finance v8 chart API 호출 — yfinance 라이브러리 hang 없음."""
    import pandas as pd, numpy as np
    code = kr_code(ticker)
    for sfx in ['.KS', '.KQ']:
        try:
            res = _yf_chart(f"{code}{sfx}", '5y', '1d')
            if not res:
                continue
            q0 = res.get('indicators', {}).get('quote', [{}])[0]
            ts = res.get('timestamp', [])
            closes = q0.get('close', [])
            if not ts or not closes:
                continue
            df = pd.DataFrame({
                'close':  closes,
                'open':   q0.get('open',   [None]*len(ts)),
                'high':   q0.get('high',   [None]*len(ts)),
                'low':    q0.get('low',    [None]*len(ts)),
                'volume': q0.get('volume', [None]*len(ts)),
            }, index=pd.to_datetime(ts, unit='s'))
            df = df.dropna(subset=['close'])
            if len(df) < 5:
                continue
            df['ma20']  = df['close'].rolling(20).mean()
            df['ma60']  = df['close'].rolling(60).mean()
            df['ma120'] = df['close'].rolling(120).mean()
            delta = df['close'].diff()
            gain  = delta.where(delta > 0, 0).rolling(14).mean()
            loss  = (-delta.where(delta < 0, 0)).rolling(14).mean()
            df['rsi'] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))
            return [{'date':   str(idx)[:10],
                     'open':   _f(row['open']),   'high':   _f(row['high']),
                     'low':    _f(row['low']),    'close':  _f(row['close']),
                     'volume': int(row['volume']) if not _nan(row['volume']) else None,
                     'ma20':   _f(row['ma20']),   'ma60':   _f(row['ma60']),
                     'ma120':  _f(row['ma120']),  'rsi':    _f(row['rsi'], 2)}
                    for idx, row in df.iterrows()]
        except Exception:
            pass
    return None

@ttl_cache(300)
def _search_kr(query: str) -> list:
    # Naver mobile API
    try:
        url = f'https://m.stock.naver.com/api/search/all?keyword={urllib.parse.quote(query)}'
        r = _session.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=6)
        data = r.json()
        items = (data.get('result', {}).get('d', {}).get('stock', {}).get('items') or
                 data.get('result', {}).get('stock', {}).get('items', []))
        if items:
            return [{'symbol': str(x.get('code', x.get('ticker',''))),
                     'shortname': str(x.get('name', x.get('stockName',''))),
                     'exchange': 'KRX', 'quoteType': 'EQUITY'}
                    for x in items[:8] if x.get('code') or x.get('ticker')]
    except Exception:
        pass
    # ac.stock.naver fallback
    try:
        url2 = f'https://ac.stock.naver.com/ac?q={urllib.parse.quote(query)}&q_enc=UTF-8&target=stock,etf'
        r2 = _session.get(url2, headers={'User-Agent': 'Mozilla/5.0'}, timeout=6)
        data2 = r2.json()
        items2 = data2.get('items', [])
        if items2:
            return [{'symbol': str(x.get('code', '')), 'shortname': str(x.get('name', '')),
                     'exchange': x.get('typeCode', 'KRX'), 'quoteType': 'EQUITY'}
                    for x in items2[:8] if isinstance(x, dict) and x.get('code')]
    except Exception:
        pass
    return []

@ttl_cache(300)
def _search(query: str) -> list:
    if has_korean(query):
        return _search_kr(query)
    results = _yf_search(query)
    if not results:
        # 직접 티커 조회 fallback
        res = _yf_chart(query.upper(), '5d', '1d')
        if res:
            meta = res.get('meta', {})
            results = [{'symbol': meta.get('symbol', query.upper()),
                        'shortname': meta.get('shortName', query.upper()),
                        'exchange': meta.get('exchangeName', ''),
                        'quoteType': 'EQUITY'}]
    return results

@ttl_cache(1800)
def _fetch_spark(ticker: str) -> list:
    """5일 일봉 종가만 추출 — 트렌드 sparkline용. 실패 시 빈 리스트."""
    try:
        res = _yf_chart(ticker, '5d', '1d')
        if not res:
            return []
        q0 = (res.get('indicators', {}).get('quote', [{}]) or [{}])[0]
        closes = [c for c in (q0.get('close') or []) if c is not None]
        return closes[-20:]  # 최근 20포인트
    except Exception:
        return []


def _most_active_us() -> list:
    try:
        url = ('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved'
               '?formatted=false&scrIds=most_actives&count=10&start=0')
        r = _session.get(url, timeout=10)
        if r.status_code != 200:
            return []
        quotes = r.json()['finance']['result'][0]['quotes']
        items = [{'ticker': q['symbol'], 'name': q.get('shortName', q['symbol']),
                  'price': q.get('regularMarketPrice', 0),
                  'change_pct': q.get('regularMarketChangePercent', 0),
                  'volume': q.get('regularMarketVolume', 0),
                  'spark': []} for q in quotes[:10]]
        # spark 병렬 fetch
        with _cf.ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(_fetch_spark, it['ticker']): i for i, it in enumerate(items)}
            for fut in _cf.as_completed(futs, timeout=12):
                try:
                    items[futs[fut]]['spark'] = fut.result(timeout=0)
                except Exception:
                    pass
        return items
    except Exception:
        pass
    return []

@ttl_cache(1800)
def _most_active_kr() -> dict:
    fetch_date = datetime.now().strftime('%Y-%m-%d')
    results = []
    for sosok, market_name in [('0', 'KOSPI'), ('1', 'KOSDAQ')]:
        if len(results) >= 10:
            break
        try:
            url = f'https://finance.naver.com/sise/sise_quant.nhn?sosok={sosok}'
            r = _session.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
            if r.status_code != 200:
                continue
            soup = BeautifulSoup(r.text, 'html.parser')
            rows = soup.select('table.type_2 tr')
            for row in rows:
                cols = row.select('td')
                if len(cols) < 6:
                    continue
                name_el = row.select_one('a.tltle')
                if not name_el:
                    continue
                name = name_el.text.strip()
                href = name_el.get('href', '')
                code = href.split('code=')[-1] if 'code=' in href else ''
                if not code:
                    continue
                try: price = int(cols[2].text.strip().replace(',', ''))
                except: price = 0
                try:
                    pct_txt = cols[4].text.strip().replace('%', '').replace(',', '')
                    pct = float(pct_txt) if pct_txt else 0.0
                except: pct = 0.0
                try: vol = int(cols[5].text.strip().replace(',', ''))
                except: vol = 0
                results.append({'ticker': code, 'name': name, 'price': price,
                                 'change_pct': pct, 'volume': vol, 'market': market_name,
                                 'spark': []})
                if len(results) >= 10:
                    break
        except Exception:
            pass
    # KR 종목 spark 병렬 fetch (.KS/.KQ 자동 시도)
    def _fetch_kr_spark(item):
        for sfx in ('.KS', '.KQ'):
            sp = _fetch_spark(f"{item['ticker']}{sfx}")
            if sp:
                return sp
        return []
    if results:
        with _cf.ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(_fetch_kr_spark, it): i for i, it in enumerate(results)}
            for fut in _cf.as_completed(futs, timeout=12):
                try:
                    results[futs[fut]]['spark'] = fut.result(timeout=0)
                except Exception:
                    pass
    return {'items': results[:10], 'date': fetch_date}

@ttl_cache(1800)
def _sector_us() -> list:
    def _fetch(name_etf_weight):
        name, (etf, weight) = name_etf_weight
        res = _yf_chart(etf, '5d', '1d')
        if res:
            p = _chart_to_price(res)
            if p:
                return {'sector': name, 'pct': round(p['change_pct'], 2), 'weight': weight}
        return None
    results = []
    with _cf.ThreadPoolExecutor(max_workers=11) as ex:
        futs = [ex.submit(_fetch, item) for item in SECTOR_ETFS.items()]
        for fut in _cf.as_completed(futs, timeout=15):
            try:
                r = fut.result(timeout=0)
                if r: results.append(r)
            except Exception: pass
    return sorted(results, key=lambda x: -x['weight'])

@ttl_cache(1800)
def _sector_kr() -> list:
    def _fetch(name_etf_weight):
        name, (etf, weight) = name_etf_weight
        tkr = etf.replace('.KS','').replace('.KQ','')
        d = _kr_price(tkr)
        if d:
            return {'sector': name, 'pct': round(d['change_pct'], 2), 'weight': weight}
        return None
    results = []
    with _cf.ThreadPoolExecutor(max_workers=11) as ex:
        futs = [ex.submit(_fetch, item) for item in KOSPI_SECTOR_ETFS.items()]
        for fut in _cf.as_completed(futs, timeout=20):
            try:
                r = fut.result(timeout=0)
                if r: results.append(r)
            except Exception: pass
    return sorted(results, key=lambda x: -x['weight'])

@ttl_cache(3600)
def _tech_news() -> list:
    """야후 파이낸스 v1 search API 직접 호출 — yfinance 타임아웃 없는 hang 방지."""
    news, seen = [], set()
    for sym in ['QQQ', 'NVDA', 'MSFT', 'SPY']:
        try:
            url = (f'https://query1.finance.yahoo.com/v1/finance/search'
                   f'?q={sym}&quotesCount=0&newsCount=4&enableFuzzyQuery=false')
            r = _session.get(url, timeout=6)
            if r.status_code != 200:
                continue
            for n in r.json().get('news', []):
                title = n.get('title', '')
                link  = n.get('link', '')
                pub   = n.get('publisher', '')
                if title and title not in seen and link:
                    seen.add(title)
                    news.append({'title': title, 'link': link, 'publisher': pub})
        except Exception:
            pass
    return news[:10]

@ttl_cache(3600)
@ttl_cache(900)  # 15분 캐시
def _naver_news(ticker: str) -> list:
    """네이버 금융 종목 뉴스 스크래핑 — 한국 주식/ETF용 한국어 뉴스."""
    news = []
    try:
        code = kr_code(ticker)
        url = f'https://finance.naver.com/item/news_news.naver?code={code}&page=1&clusterId='
        headers = {
            'User-Agent': 'Mozilla/5.0',
            'Referer': f'https://finance.naver.com/item/news.naver?code={code}',
        }
        r = _session.get(url, headers=headers, timeout=6)
        if r.status_code != 200:
            return news
        r.encoding = 'euc-kr'
        soup = BeautifulSoup(r.text, 'html.parser')
        rows = soup.select('table.type5 tr')
        for tr in rows:
            a = tr.select_one('td.title a')
            info_cells = tr.select('td.info')
            date_cell  = tr.select_one('td.date')
            if not a:
                continue
            title = a.get('title') or a.get_text(strip=True)
            href  = a.get('href') or ''
            if not title or not href:
                continue
            if not href.startswith('http'):
                href = 'https://finance.naver.com' + href
            publisher = info_cells[0].get_text(strip=True) if info_cells else '네이버 금융'
            date_str = date_cell.get_text(strip=True)[:10].replace('.', '-') if date_cell else ''
            if title in {x['title'] for x in news}:
                continue
            news.append({'title': title, 'link': href, 'publisher': publisher, 'date': date_str})
            if len(news) >= 6:
                break
    except Exception:
        pass
    return news

def _stock_news(ticker: str) -> dict:
    """종목 뉴스 — KR 티커면 Naver 금융, 아니면 Yahoo Finance."""
    # KR 종목: Naver 금융 우선
    if is_kr(ticker):
        kr_news = _naver_news(ticker)
        if kr_news:
            return {'news': kr_news, 'recs': []}
        # Naver 실패 시 Yahoo로 fallback

    news_list = []
    try:
        q = ticker
        url = (f'https://query1.finance.yahoo.com/v1/finance/search'
               f'?q={urllib.parse.quote(q)}&quotesCount=0&newsCount=8&enableFuzzyQuery=false')
        r = _session.get(url, timeout=8)
        if r.status_code == 200:
            for n in r.json().get('news', []):
                title   = n.get('title', '')
                link    = n.get('link', '')
                pub     = n.get('publisher', '')
                pub_ts  = n.get('providerPublishTime', '')
                if not title or not link:
                    continue
                if title in {x['title'] for x in news_list}:
                    continue
                date_str = ''
                try:
                    date_str = (datetime.fromtimestamp(pub_ts).strftime('%m/%d')
                                if isinstance(pub_ts, (int, float)) else str(pub_ts)[:10])
                except Exception:
                    pass
                news_list.append({'title': title, 'link': link, 'publisher': pub, 'date': date_str})
                if len(news_list) >= 5:
                    break
    except Exception:
        pass
    return {'news': news_list, 'recs': []}

@ttl_cache(1800)
def _sp500_heatmap() -> list:
    HMAP = [
        ('AAPL','기술',7.0),('MSFT','기술',6.5),('NVDA','기술',5.8),
        ('META','통신서비스',2.5),('GOOGL','통신서비스',2.0),('NFLX','통신서비스',0.9),
        ('JPM','금융',1.7),('V','금융',1.5),('MA','금융',1.2),
        ('UNH','헬스케어',1.4),('LLY','헬스케어',1.3),('JNJ','헬스케어',1.1),
        ('AMZN','소비재',3.5),('TSLA','소비재',1.0),('HD','소비재',0.8),
        ('CAT','산업재',0.6),('RTX','산업재',0.5),('LMT','산업재',0.5),
        ('XOM','에너지',1.2),('CVX','에너지',0.9),
        ('WMT','필수소비재',0.8),('COST','필수소비재',0.7),('PG','필수소비재',0.7),
        ('NEE','유틸리티',0.5),('DUK','유틸리티',0.3),
        ('LIN','소재',0.5),('FCX','소재',0.2),
        ('PLD','부동산',0.4),('AMT','부동산',0.3),
    ]
    def _fetch(row):
        tkr, sector, weight = row
        try:
            res = _yf_chart(tkr, '5d', '1d')
            if res:
                p = _chart_to_price(res)
                if p:
                    return {'ticker': tkr, 'sector': sector, 'weight': weight,
                            'price': p['current_price'], 'pct': p['change_pct']}
        except Exception:
            pass
        return None
    result = []
    with _cf.ThreadPoolExecutor(max_workers=29) as ex:
        futs = [ex.submit(_fetch, row) for row in HMAP]
        for fut in _cf.as_completed(futs, timeout=20):
            try:
                r = fut.result(timeout=0)
                if r: result.append(r)
            except Exception:
                pass
    return result

# ─── Batch prices ─────────────────────────────────────────────────────
def _fetch_us_price(t: str):
    try:
        p = _price_fast(t)
        return (t, p) if p else (t, None)
    except Exception:
        return (t, None)

def _get_cached_kr_history(ticker: str):
    """_kr_history 캐시 히트 시에만 반환, 미스면 None (네트워크 호출 없음)."""
    key = f"_kr_history:('{ticker}',):{sorted({}.items())}"
    with _lock:
        if key in _cache and time() - _cache_ts.get(key, 0) < 1800:
            return _cache[key]
    return None

@ttl_cache(1800)
def _kr_spark(ticker: str) -> list | None:
    """KR 종목 30일 스파크라인 — Yahoo v8 chart API 직접 호출 (yfinance hang 없음)"""
    code = kr_code(ticker)
    for sfx in ['.KS', '.KQ']:
        try:
            res = _yf_chart(f"{code}{sfx}", '1mo', '1d')
            if not res:
                continue
            q0 = res.get('indicators', {}).get('quote', [{}])[0]
            closes = [c for c in (q0.get('close') or []) if c is not None]
            if len(closes) >= 3:
                return [round(float(c), 2) for c in closes[-30:]]
        except Exception:
            continue
    return None

def _fetch_kr_price(t: str):
    try:
        p = _kr_price(t)
        if not p:
            return (t, None)
        # 스파크라인: 먼저 캐시, 없으면 v8 chart API로 짧은 타임아웃 내 실시간 페치
        try:
            hist = _get_cached_kr_history(t)
            if hist:
                closes = [row['close'] for row in hist[-30:] if row.get('close') is not None]
                if closes:
                    p['spark'] = closes
            else:
                spark = _kr_spark(t)
                if spark:
                    p['spark'] = spark
        except Exception:
            pass
        return (t, p)
    except Exception:
        return (t, None)

def _batch_prices(tickers: list) -> dict:
    """모든 종목 가격을 병렬로 가져옵니다. 상장폐지 종목으로 인한 hang 완전 방지."""
    result = {}
    us = [t for t in tickers if not is_kr(t)]
    kr = [t for t in tickers if is_kr(t)]

    # US + KR 동시에 병렬 실행 (max_workers=20)
    with _cf.ThreadPoolExecutor(max_workers=20) as ex:
        us_futs = {ex.submit(_fetch_us_price, t): t for t in us}
        kr_futs = {ex.submit(_fetch_kr_price, t): t for t in kr}
        all_futs = {**us_futs, **kr_futs}
        try:
            for fut in _cf.as_completed(all_futs, timeout=15):
                try:
                    ticker, p = fut.result(timeout=0)
                    if p:
                        result[ticker] = p
                except Exception:
                    pass
        except _cf.TimeoutError:
            pass  # 타임아웃 시 수집된 결과만 반환 (500 에러 방지)
    return result

@ttl_cache(3600)
def _parse_kr_num(s) -> Optional[float]:
    """Naver 텍스트 숫자 파싱: '26.03'→26.03, '12,372'→12372.0, '-'/''→None."""
    try:
        s = str(s).replace(',', '').strip()
        if not s or s in ('-', 'N/A'):
            return None
        return float(s)
    except Exception:
        return None

@ttl_cache(1800)
def _kr_fundamentals(ticker: str) -> dict:
    """한국 종목 Valuation — Naver 종목 메인의 투자정보 ID(_per/_pbr/_eps/_dvr/_cns_per/
    _market_sum) + 동일업종비교 ROE 스크래핑. yfinance KR info가 비는 격차 보완.
    HTML 구조 변경 시 빈 dict 반환(프론트가 '데이터 없음'으로 분기)."""
    code = kr_code(ticker)
    out: dict = {}
    try:
        r = _session.get(f'https://finance.naver.com/item/main.naver?code={code}',
                         headers={'User-Agent': 'Mozilla/5.0'}, timeout=6)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, 'html.parser')
        def by_id(eid):
            el = soup.find(id=eid)
            return _parse_kr_num(el.get_text(strip=True)) if el else None
        # 시가총액 — _market_sum "1,882조 5,017" (조 + 억)
        mc = None
        msum = soup.find(id='_market_sum')
        if msum:
            txt = msum.get_text(' ', strip=True)
            jo = re.search(r'([\d,]+)\s*조', txt)
            rest = re.sub(r'[\d,]+\s*조', '', txt)
            ok = re.search(r'([\d,]+)', rest)
            if jo:
                mc = int(jo.group(1).replace(',', '')) * 10**12 \
                     + (int(ok.group(1).replace(',', '')) if ok else 0) * 10**8
            elif ok:
                mc = int(ok.group(1).replace(',', '')) * 10**8
        # ROE — 동일업종비교 self(첫) 컬럼
        roe = None
        sec = soup.select_one('.section.trade_compare')
        if sec:
            for tr in sec.select('table tbody tr'):
                th = tr.find('th')
                if th and 'ROE' in th.get_text():
                    td = tr.find('td')
                    if td:
                        roe = _parse_kr_num(td.get_text(strip=True))
                    break
        out = {
            'market_cap':    int(mc) if mc else None,
            'trailing_pe':   by_id('_per'),
            'forward_pe':    by_id('_cns_per'),   # 추정 PER(컨센서스)
            'price_to_book': by_id('_pbr'),
            'diluted_eps':   by_id('_eps'),
            'div_yield':     by_id('_dvr'),
            'roe':           roe,
        }
    except Exception:
        return {}
    return out if any(v is not None for v in out.values()) else {}

def _stock_fundamentals(ticker: str) -> dict:
    if is_kr(ticker):
        return _kr_fundamentals(ticker)
    try:
        info = _yf_info_safe(ticker.upper(), timeout=10)
        def safe_pct(v):
            try:
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else round(f * 100, 2)
            except: return None
        def safe_f(v):
            try:
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
            except: return None
        def safe_i(v):
            try: return int(v) if v and not _nan(v) else None
            except: return None
        return {
            'market_cap':       safe_i(info.get('marketCap')),
            'enterprise_value': safe_i(info.get('enterpriseValue')),
            'trailing_pe':      safe_f(info.get('trailingPE')),
            'forward_pe':       safe_f(info.get('forwardPE')),
            'peg_ratio':        safe_f(info.get('pegRatio')),
            'price_to_sales':   safe_f(info.get('priceToSalesTrailing12Months')),
            'price_to_book':    safe_f(info.get('priceToBook')),
            'ev_revenue':       safe_f(info.get('enterpriseToRevenue')),
            'ev_ebitda':        safe_f(info.get('enterpriseToEbitda')),
            'profit_margin':    safe_pct(info.get('profitMargins')),
            'roa':              safe_pct(info.get('returnOnAssets')),
            'roe':              safe_pct(info.get('returnOnEquity')),
            'revenue_growth':   safe_pct(info.get('revenueGrowth')),   # YoY 분기 매출성장 (발굴 Growth축)
            'revenue':          safe_i(info.get('totalRevenue')),
            'net_income':       safe_i(info.get('netIncomeToCommon')),
            'diluted_eps':      safe_f(info.get('trailingEps')),
            'total_cash':       safe_i(info.get('totalCash')),
            'debt_to_equity':   safe_f(info.get('debtToEquity')),
            'free_cash_flow':   safe_i(info.get('freeCashflow')),
        }
    except Exception:
        return {}

# ─── 신규 종목 발굴 (GARP 스크리닝) ───────────────────────────────────
# 깔때기: universe(하드코딩 재활용) → 정량 스크리닝(이 섹션) → 랭킹.
# GARP = 성장 대비 안 비싼 종목(PEG 중심). 게이트는 정적(투명·정직),
# 스코어는 시장(US/KR)별 백분위(동적 상대평가). KR은 데이터 구멍을
# N/A 처리 후 가용 축만 재정규화 — 가짜값 절대 금지(정직성 원칙).

GARP_WEIGHTS = {'value': 0.30, 'growth': 0.25, 'quality': 0.20,
                'momentum': 0.15, 'sentiment': 0.10}
# 한국은 개별주 중기 모멘텀이 reversal(역전)이 지배적(IAJ 2024, 1983-2023) →
# 모멘텀 가중을 0.15→0.05로 낮추고 펀더멘털(가치·체력)로 재배분. 미국은 모멘텀 유지.
GARP_WEIGHTS_KR = {'value': 0.35, 'growth': 0.25, 'quality': 0.25,
                   'momentum': 0.05, 'sentiment': 0.10}

def _weights_for(market: str) -> dict:
    return GARP_WEIGHTS_KR if market == 'KR' else GARP_WEIGHTS

# 경기민감주 함정 방지: PEG 계산 시 성장률 상한(winsorize). 저점 회복으로
# 성장률 497% 같은 값이 찍히면 PEG가 0에 수렴해 밸류가 과대평가됨 → 50%로 캡.
_GROWTH_CAP_FOR_PEG = 50.0

# 신호 → (raw 키, higher_better)  — higher_better=False면 낮을수록 우수
_GARP_SIGNALS = {
    'peg':            ('peg', False),
    'rel_per':        ('rel_per', False),       # 후행 PER 섹터 상대
    'rel_fwd_pe':     ('rel_fwd_pe', False),    # 포워드(추정) PER 섹터 상대 — 경기민감주 함정 완화
    'eps_growth':     ('eps_growth', True),
    'rev_growth':     ('rev_growth', True),
    'roe':            ('roe', True),
    'debt_to_equity': ('debt_to_equity', False),
    'near_52w_high':  ('near_52w_high', True),
    'analyst_upside': ('analyst_upside', True),
    'est_rev_mag':    ('est_rev_mag', True),     # 90일 +1y EPS 추정치 변화% (revision drift)
    'est_rev_breadth':('est_rev_breadth', True), # 상향-하향 애널리스트 비율 (breadth)
}
# 축 = 소속 신호 백분위 평균(가용분만)
_GARP_AXIS_SIGNALS = {
    'value':     ['peg', 'rel_per', 'rel_fwd_pe'],
    'growth':    ['eps_growth', 'rev_growth'],
    'quality':   ['roe', 'debt_to_equity'],
    'momentum':  ['near_52w_high'],
    # 센티먼트 = 목표가 + 추정치 상향(magnitude·breadth) 합성. raw revision 단독은
    # 사후 감쇠하나 합성은 GFC 이후도 유의(Guerard CTEF) — 가장 검증된 단기 알파.
    'sentiment': ['analyst_upside', 'est_rev_mag', 'est_rev_breadth'],
}


def _median(xs: list):
    s = sorted(xs); n = len(s)
    if n == 0:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _pct_rank(vals: list, v, higher_better: bool) -> float:
    """vals: 동일 신호의 가용값(None 제외, v 포함). 0~100, 높을수록 우수.
    higher_better=False(낮을수록 좋음)는 더 큰 값을 '열등'으로 카운트."""
    n = len(vals)
    if n <= 1:
        return 50.0   # 단일 표본 — 순위 불가, 중립
    if higher_better:
        worse = sum(1 for x in vals if x < v)
    else:
        worse = sum(1 for x in vals if x > v)
    return round(worse / (n - 1) * 100, 2)


def _garp_gate(m: dict):
    """필수 게이트(정적). raw 값 기준. 데이터 없음(None)은 탈락 아님(면제 — 정직성).
    반환 (pass: bool, reason: str)."""
    peg = m.get('peg')
    if peg is not None and peg > 1.5:
        return False, 'PEG>1.5'
    eg = m.get('eps_growth')
    if eg is not None and eg <= 0:
        return False, 'EPS성장≤0'
    dte = m.get('debt_to_equity')
    if dte is not None and dte >= 200:
        return False, '부채비율≥200'
    # 가치 함정 방지: 싸도 매출이 급감하는 사양산업은 제외
    rev = m.get('rev_growth')
    if rev is not None and rev <= -15:
        return False, '매출 급감'
    return True, ''


def _garp_score(rows: list) -> list:
    """universe 전체 raw dict 리스트 입력 → pct_*·composite_score·gate_* 부여 후 반환.
    백분위·rel_per는 시장(US/KR)별로 분리 계산. 순수함수 (I/O·전역상태 없음)."""
    rows = [dict(r) for r in rows]   # 비파괴
    by_market: dict = {}
    for r in rows:
        by_market.setdefault(r.get('market', 'US'), []).append(r)

    for group in by_market.values():
        # rel_per·rel_fwd_pe 파생: 같은 섹터 median PER 대비 (낮을수록 상대적으로 쌈).
        # 시장 전체가 아닌 '섹터 내' 비교 → 은행(저PER)을 반도체(고PER)와 직접 안 비교(2-B 섹터중립).
        sectors: dict = {}
        for r in group:
            sectors.setdefault(r.get('sector', ''), []).append(r)
        for srows in sectors.values():
            med_t = _median([r['trailing_pe'] for r in srows
                             if r.get('trailing_pe') and r['trailing_pe'] > 0])
            med_f = _median([r['forward_pe'] for r in srows
                             if r.get('forward_pe') and r['forward_pe'] > 0])
            for r in srows:
                pe = r.get('trailing_pe'); fpe = r.get('forward_pe')
                r['rel_per']    = round(pe / med_t, 3) if (pe and pe > 0 and med_t) else None
                r['rel_fwd_pe'] = round(fpe / med_f, 3) if (fpe and fpe > 0 and med_f) else None

        # 신호별 가용값 리스트 (시장 내)
        sig_vals = {sig: [r[key] for r in group if r.get(key) is not None]
                    for sig, (key, _hb) in _GARP_SIGNALS.items()}

        for r in group:
            sig_pct = {}
            for sig, (key, hb) in _GARP_SIGNALS.items():
                v = r.get(key)
                sig_pct[sig] = None if v is None else _pct_rank(sig_vals[sig], v, hb)
            axis_pct = {}
            for axis, sigs in _GARP_AXIS_SIGNALS.items():
                avail = [sig_pct[s] for s in sigs if sig_pct[s] is not None]
                axis_pct[axis] = round(sum(avail) / len(avail), 2) if avail else None
            r['pct_value']     = axis_pct['value']
            r['pct_growth']    = axis_pct['growth']
            r['pct_quality']   = axis_pct['quality']
            r['pct_momentum']  = axis_pct['momentum']
            r['pct_sentiment'] = axis_pct['sentiment']
            r['data_completeness'] = sum(1 for a in axis_pct.values() if a is not None)

            passed, reason = _garp_gate(r)
            # 평가 불가 종목 제외: 현재가 없음(상폐/죽은 티커) 또는 5요소 중 3개 미만.
            # → 데이터 없어서 게이트를 '면제로 통과'하던 깡통/상폐 종목이 추천에 끼는 것 차단.
            if r.get('current_price') is None or r['data_completeness'] < 3:
                passed, reason = False, '데이터 부족'
            r['gate_pass'] = 1 if passed else 0
            r['gate_fail_reason'] = reason

            # 가용 축만 가중치 재정규화 후 가중합 → 0~100 (시장별 차등 가중)
            weights = _weights_for(r.get('market', 'US'))
            num = den = 0.0
            for axis, w in weights.items():
                ap = axis_pct[axis]
                if ap is not None:
                    num += w * ap; den += w
            base = num / den if den > 0 else 0.0
            # 결측 패널티: 5요소 중 부족분만큼 감점(×완성도/5). 한 축(예: 저평가 99)만으로
            # 상위에 오르는 것 차단 — 데이터 충실한 종목이 우선되도록(권위 확보).
            r['composite_score'] = round(base * (r['data_completeness'] / 5.0), 2)
    return rows


def _discovery_universe() -> list:
    """US_SECTOR_TOP + KR_SECTOR_TOP 병합·dedup. 반환 [{ticker, name, market, sector}]."""
    seen: set = set()
    out: list = []
    for market, table in (('US', US_SECTOR_TOP), ('KR', KR_SECTOR_TOP)):
        for sector, stocks in table.items():
            for tkr, name in stocks:
                key = str(tkr).upper()
                if key in seen:
                    continue
                seen.add(key)
                out.append({'ticker': key, 'name': name,
                            'market': market, 'sector': sector})
    return out


def _ttm_yoy(vals: list):
    """분기값 리스트(시간순, 최신이 끝) → TTM YoY 성장률 % 또는 None.
    최근 4분기 합 vs 직전 4분기 합. 직전 합이 음수/0이면 왜곡 → None."""
    xs = [v for v in vals if v is not None]
    if len(xs) < 8:
        return None
    recent = sum(xs[-4:]); prior = sum(xs[-8:-4])
    if prior <= 0:
        return None
    return round((recent - prior) / prior * 100, 2)


def _eps_yoy_from_trend(trend: dict):
    """_financials_trend의 eps(과거 실적) → 최신 분기 vs 4분기 전 YoY %.
    적자(음수) 기준연도는 성장률 왜곡 → None."""
    eps = [e['actual'] for e in trend.get('eps', [])
           if not e.get('is_future') and e.get('actual') is not None]
    if len(eps) < 5:
        return None
    latest, prior = eps[-1], eps[-5]
    if prior is None or prior <= 0:
        return None
    return round((latest - prior) / prior * 100, 2)


def _est_revision(ticker: str):
    """US 애널리스트 추정치 상향 — (90일 +1y EPS 변화%, breadth -1~1) 또는 (None, None).
    forecast-revision drift = 가장 검증된 단기 알파(Huang 2022·PEAD). yfinance eps_trend/eps_revisions."""
    def _work():
        import yfinance as yf
        tk = yf.Ticker(ticker.upper())
        mag = brd = None
        try:
            tr = tk.eps_trend
            if tr is not None and '+1y' in tr.index:
                cur, ago = tr.loc['+1y', 'current'], tr.loc['+1y', '90daysAgo']
                if cur and ago and float(ago) != 0 and not _nan(cur) and not _nan(ago):
                    mag = round((float(cur) - float(ago)) / abs(float(ago)) * 100, 2)
        except Exception:
            pass
        try:
            rv = tk.eps_revisions
            if rv is not None and '+1y' in rv.index:
                up = rv.loc['+1y', 'upLast30days']; dn = rv.loc['+1y', 'downLast30days']
                up = float(up) if up and not _nan(up) else 0.0
                dn = float(dn) if dn and not _nan(dn) else 0.0
                if up + dn > 0:
                    brd = round((up - dn) / (up + dn), 3)
        except Exception:
            pass
        return mag, brd
    try:
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            return ex.submit(_work).result(timeout=8)
    except Exception:
        return None, None


def _discovery_raw_metrics(ticker: str, market: str) -> dict:
    """1종목 raw 지표 수집. 실패·미제공 축은 None(가짜값 금지). 종목당 격리(예외 흡수)."""
    m: dict = {
        'peg': None, 'trailing_pe': None, 'forward_pe': None, 'eps_growth': None,
        'rev_growth': None, 'roe': None, 'debt_to_equity': None,
        'near_52w_high': None, 'analyst_upside': None,
        'est_rev_mag': None, 'est_rev_breadth': None,
        'current_price': None, 'target_price': None, 'profit_margin': None,
        'exchange': '', 'quote_type': '',
    }
    try:
        f = _stock_fundamentals(ticker) or {}
        m['trailing_pe'] = f.get('trailing_pe')
        m['forward_pe'] = f.get('forward_pe')   # US: yfinance forwardPE / KR: Naver 추정PER
        m['roe'] = f.get('roe')
        try:
            trend = _financials_trend(ticker) or {}
        except Exception:
            trend = {}
        raw_eps_g = _eps_yoy_from_trend(trend)
        # 성장률 winsorize(+50% 상한): 적자→흑자·코로나백신 소멸 같은 기저효과로 YoY가 수백%
        # 튀어 성장 순위를 지배하는 것을 차단. 음수는 그대로(게이트가 거름).
        m['eps_growth'] = (min(raw_eps_g, 50.0) if (raw_eps_g is not None and raw_eps_g > 0) else raw_eps_g)
        # rev_growth: yfinance info의 revenueGrowth가 US/KR 모두 안정적 → 1차.
        # 분기 합산 YoY(_ttm_yoy)는 yfinance가 4~5분기만 줘 대개 None → fallback.
        raw_rev_g = _ttm_yoy([r.get('value') for r in trend.get('revenue', [])])
        m['rev_growth'] = (min(raw_rev_g, 50.0) if (raw_rev_g is not None and raw_rev_g > 0) else raw_rev_g)

        if market == 'US':
            rg = f.get('revenue_growth')
            if rg is not None:
                m['rev_growth'] = min(rg, 50.0) if rg > 0 else rg
            up = f.get('peg_ratio')   # Yahoo PEG(5년 성장 기반) — 비현실치(≤0.1)는 데이터오류로 드롭
            m['peg'] = up if (up is not None and up > 0.1) else None
            m['debt_to_equity'] = f.get('debt_to_equity')
            m['profit_margin'] = f.get('profit_margin')
            full = _stock_full(ticker) or {}
            cur = full.get('current_price'); hi = full.get('week_52_high')
            m['current_price'] = cur
            m['exchange'] = full.get('exchange', '') or ''
            m['quote_type'] = full.get('quote_type', '') or ''
            if cur and hi and hi > 0:
                m['near_52w_high'] = round(cur / hi, 4)
            tgt = full.get('target_mean'); na = full.get('num_analysts') or 0
            if cur and tgt and na >= 3:
                m['target_price'] = round(float(tgt), 2)
                m['analyst_upside'] = round((tgt - cur) / cur * 100, 2)
            m['est_rev_mag'], m['est_rev_breadth'] = _est_revision(ticker)  # 추정치 상향(3-B)
        else:  # KR — PEG는 Naver PER로 계산, 그 외(부채·마진·목표가)는 yfinance .KS info
            def _f2(v):
                try:
                    x = float(v); return None if _nan(x) else x
                except Exception:
                    return None
            # yfinance .KS/.KQ info 1회 조회: 한국 대형주는 부채·마진·애널리스트 목표가까지 제공
            info_kr, used_sfx = {}, ''
            for sfx in ('.KS', '.KQ'):
                ik = _yf_info_safe(kr_code(ticker) + sfx, timeout=6)
                if ik and (ik.get('regularMarketPrice') or ik.get('revenueGrowth') is not None
                           or ik.get('exchange')):
                    info_kr, used_sfx = ik, sfx; break
            if m['rev_growth'] is None and info_kr.get('revenueGrowth') is not None:
                _rg = round(info_kr['revenueGrowth'] * 100, 2)
                m['rev_growth'] = min(_rg, 50.0) if _rg > 0 else _rg
            m['exchange'] = info_kr.get('exchange') or (
                'KSC' if used_sfx == '.KS' else 'KOE' if used_sfx == '.KQ' else '')
            m['quote_type'] = info_kr.get('quoteType') or 'EQUITY'
            m['debt_to_equity'] = _f2(info_kr.get('debtToEquity'))      # 안정성 축 보강
            pm = _f2(info_kr.get('profitMargins'))
            m['profit_margin'] = round(pm * 100, 2) if pm is not None else None
            cur = _f2(info_kr.get('currentPrice')) or _f2(info_kr.get('regularMarketPrice'))
            tgt = _f2(info_kr.get('targetMeanPrice'))
            na = info_kr.get('numberOfAnalystOpinions') or 0
            if cur and tgt and na >= 3:                                 # 기대(전문가) 축 보강
                m['target_price'] = round(tgt, 2)
                m['analyst_upside'] = round((tgt - cur) / cur * 100, 2)
            # PEG는 지속가능 성장 구간(0<성장≤50%)에서만 계산. raw 성장률이 50% 초과(적자턴어라운드·
            # 코로나기저·시클리컬 고점)면 PEG 드롭 → 가치는 PER·선행PER로만 평가(가짜 초저PEG 방지).
            pe = m['trailing_pe']
            if pe and pe > 0 and raw_eps_g is not None and 0 < raw_eps_g <= 50:
                m['peg'] = round(pe / raw_eps_g, 3)
            # current_price + near_52w_high: KR 차트(_kr_history), 없으면 info 현재가
            try:
                hist = _kr_history(ticker) or []
                bars = hist[-252:]
                highs = [b['high'] for b in bars if b.get('high')]
                last = bars[-1]['close'] if bars and bars[-1].get('close') else None
                m['current_price'] = last or cur
                if highs and last:
                    mx = max(highs)
                    if mx > 0:
                        m['near_52w_high'] = round(last / mx, 4)
            except Exception:
                m['current_price'] = m['current_price'] or cur
    except Exception:
        pass
    return m


# ─── ETF 발굴 (개별종목과 별도 모델: 추세 50% · 저비용 25% · 규모 25%) ──────
# ETF는 PEG·EPS·ROE가 없어(바스켓) GARP 부적합 → 전용 점수. US는 보수율·AUM 제공,
# KR ETF는 yfinance에 보수율·AUM 없어 추세·거래량 위주(정직 N/A).
US_ETFS = {
    'SPY': ('SPDR S&P 500', '미국 대표'), 'QQQ': ('Invesco QQQ', '미국 나스닥100'),
    'VOO': ('Vanguard S&P 500', '미국 대표'), 'VTI': ('Vanguard 전체시장', '미국 전체'),
    'IWM': ('iShares 러셀2000', '미국 중소형'), 'DIA': ('SPDR 다우30', '미국 대표'),
    'XLK': ('Tech Select', '미국 기술'), 'XLF': ('Financial Select', '미국 금융'),
    'XLE': ('Energy Select', '미국 에너지'), 'XLV': ('Health Select', '미국 헬스케어'),
    'SMH': ('VanEck 반도체', '반도체'), 'SCHD': ('Schwab 배당', '미국 배당'),
    'VUG': ('Vanguard 성장', '미국 성장'), 'VTV': ('Vanguard 가치', '미국 가치'),
    'ARKK': ('ARK 이노베이션', '혁신성장'), 'TLT': ('iShares 20년채', '미국 장기채'),
    'GLD': ('SPDR 금', '금'), 'EFA': ('iShares 선진국', '해외 선진국'),
}
KR_ETFS = {
    '069500': ('KODEX 200', '한국 대표'), '102110': ('TIGER 200', '한국 대표'),
    '229200': ('KODEX 코스닥150', '코스닥'), '091160': ('KODEX 반도체', '반도체'),
    '305720': ('KODEX 2차전지산업', '2차전지'), '102780': ('KODEX 삼성그룹', '삼성그룹'),
    '379800': ('KODEX 미국S&P500', '미국주식'), '360750': ('TIGER 미국S&P500', '미국주식'),
    '133690': ('TIGER 미국나스닥100', '미국주식'), '132030': ('KODEX 골드선물', '금'),
    '273130': ('KODEX 종합채권액티브', '한국 채권'),
}

def _discovery_etf_universe() -> list:
    out: list = []
    for tkr, (nm, cat) in US_ETFS.items():
        out.append({'ticker': tkr.upper(), 'name': nm, 'market': 'US', 'sector': cat})
    for code, (nm, cat) in KR_ETFS.items():
        out.append({'ticker': code, 'name': nm, 'market': 'KR', 'sector': cat})
    return out

# ETF 신호 → higher_better
_ETF_SIGNALS = {'near_52w_high': True, 'ret_6m': True, 'expense_ratio': False,
                'aum': True, 'avg_volume': True}
_ETF_GROUPS = {'momentum': (['near_52w_high', 'ret_6m'], 0.50),
               'cost': (['expense_ratio'], 0.25), 'size': (['aum', 'avg_volume'], 0.25)}

def _etf_score(rows: list) -> list:
    """ETF 전용 점수 — 추세·저비용·규모. 시장별 백분위. 순수함수."""
    rows = [dict(r) for r in rows]
    by_market: dict = {}
    for r in rows:
        by_market.setdefault(r.get('market', 'US'), []).append(r)
    for group in by_market.values():
        sig_vals = {s: [r[s] for r in group if r.get(s) is not None] for s in _ETF_SIGNALS}
        for r in group:
            sig_pct = {}
            for s, hb in _ETF_SIGNALS.items():
                v = r.get(s)
                sig_pct[s] = None if v is None else _pct_rank(sig_vals[s], v, hb)
            grp = {}
            for gname, (sigs, _w) in _ETF_GROUPS.items():
                avail = [sig_pct[s] for s in sigs if sig_pct[s] is not None]
                grp[gname] = round(sum(avail) / len(avail), 2) if avail else None
            r['pct_momentum'] = grp['momentum']     # 표시용 (추세)
            r['pct_value'] = grp['cost']            # 표시용 (저비용)
            r['pct_quality'] = grp['size']          # 표시용 (규모)
            r['pct_growth'] = None; r['pct_sentiment'] = None
            r['data_completeness'] = sum(1 for v in grp.values() if v is not None)
            num = den = 0.0
            for gname, (_s, w) in _ETF_GROUPS.items():
                if grp[gname] is not None:
                    num += w * grp[gname]; den += w
            base = num / den if den > 0 else 0.0
            r['composite_score'] = round(base * (r['data_completeness'] / 3.0), 2)  # 결측 패널티(/3)
            ok = r.get('current_price') is not None and grp['momentum'] is not None
            r['gate_pass'] = 1 if ok else 0
            r['gate_fail_reason'] = '' if ok else '데이터 부족'
    return rows

def _discovery_etf_metrics(ticker: str, market: str) -> dict:
    """ETF raw 지표 — 추세(52주·6개월)·보수율·AUM·거래량. 종목당 격리."""
    m: dict = {'near_52w_high': None, 'ret_6m': None, 'expense_ratio': None, 'aum': None,
               'avg_volume': None, 'current_price': None, 'exchange': '', 'quote_type': 'ETF'}
    try:
        info, sym = {}, None
        if market == 'US':
            info = _yf_info_safe(ticker.upper(), timeout=8); sym = ticker.upper()
        else:
            for sfx in ('.KS', '.KQ'):
                ik = _yf_info_safe(kr_code(ticker) + sfx, timeout=6)
                if ik and (ik.get('regularMarketPrice') or ik.get('navPrice')):
                    info, sym = ik, kr_code(ticker) + sfx; break
        cur = info.get('currentPrice') or info.get('regularMarketPrice') or info.get('navPrice')
        hi = info.get('fiftyTwoWeekHigh')
        m['current_price'] = float(cur) if cur and not _nan(cur) else None
        if m['current_price'] and hi and float(hi) > 0:
            m['near_52w_high'] = round(m['current_price'] / float(hi), 4)
        exp = info.get('annualReportExpenseRatio') or info.get('netExpenseRatio')
        m['expense_ratio'] = round(float(exp), 3) if exp and not _nan(exp) else None  # 이미 % 단위
        aum = info.get('totalAssets')
        m['aum'] = float(aum) if aum and not _nan(aum) else None
        vol = info.get('averageVolume') or info.get('averageVolume10days')
        m['avg_volume'] = float(vol) if vol and not _nan(vol) else None
        m['exchange'] = info.get('exchange', '') or ''
        try:
            res = _yf_chart(sym, '6mo', '1d') if sym else None
            if res:
                cl = [c for c in res.get('indicators', {}).get('quote', [{}])[0].get('close', []) if c is not None]
                if len(cl) > 5 and cl[0]:
                    r6 = round((cl[-1] / cl[0] - 1) * 100, 2)
                    # 차트 데이터 오류(분할 미반영 등)로 6mo 수익률이 비현실적이면 버림
                    m['ret_6m'] = r6 if -95 < r6 < 150 else None
        except Exception:
            pass
    except Exception:
        pass
    return m


def safe_i_local(v):
    try: return int(v) if v and not _nan(v) else None
    except: return None

# AI 기반 신약개발 플랫폼(TechBio) — peer 큐레이션.
# Yahoo 추천은 'AI' 키워드로 데이터센터(APLD)·로봇(SERV) 등 이종 섹터를 섞으므로,
# 이 universe 종목은 동일 'AI 신약개발 플랫폼'끼리만 비교군을 구성한다.
# 우선순위 순서(저명한 AI 신약개발 플랫폼 먼저) — peer 선정 시 앞에서부터 채운다.
_AIDRUG_PEERS = ['RXRX', 'SDGR', 'EXAI', 'ABCL', 'RLAY', 'ABSI', 'CGEM', 'GRPH']

def _curated_aidrug_peers(ticker: str):
    """TechBio(AI 신약개발) universe면 큐레이션 peer 티커(자기 제외, 최대 4), 아니면 None.
    'AI' 키워드로 데이터센터(APLD)·로봇(SERV)이 섞이는 것 방지. (순수 함수 — 회귀 테스트로 보호)"""
    t = str(ticker).upper()
    if t in _AIDRUG_PEERS:
        return [p for p in _AIDRUG_PEERS if p != t][:4]
    return None

def _audit_stock_analysis(ticker: str, data: dict) -> list:
    """생성된 종목 분석이 섹터별 비즈니스 로직 규칙을 어겼는지 결정적 휴리스틱으로 점검.
    TechBio(AI 신약개발) 한정 — 위반 메시지 리스트 반환(빈 리스트=통과).
    저장 시 자동 실행되어 '경고'로 반환됨 → 사용자가 아니라 시스템이 출력 품질을 자가 검증."""
    issues = []
    if str(ticker).upper() not in _AIDRUG_PEERS:
        return issues

    def _txt(v):
        return ' '.join(str(x) for x in v) if isinstance(v, list) else str(v or '')

    # item 1 — 공동창업자 이사회 퇴임 + 전문경영인 전담을 '리스크'로 기계 분류 금지
    bear = _txt(data.get('bear'))
    if (('창업자' in bear) and (('퇴임' in bear) or ('이사회' in bear))
            and (('리스크' in bear) or ('불확실' in bear))):
        issues.append("item1 경영진: 창업자 이사회 퇴임을 리스크로 분류함 — "
                      "'연구→상업화·계약 단계 전환'의 중립~긍정 맥락으로 다시 서술 필요")

    # item 2 — 제조식 수주잔고만 있고 마일스톤/기술수출 언급 없음
    backlog = _txt(data.get('backlog'))
    if ((('수주 잔고' in backlog) or ('수주잔고' in backlog))
            and ('마일스톤' not in backlog) and ('기술수출' not in backlog)
            and ('License' not in backlog)):
        issues.append("item2 재무지표: 제조식 수주잔고 위주 — "
                      "잠재 마일스톤·기술수출(License-out) 잠재력으로 서술 필요")
    return issues

@ttl_cache(1800)
def _kr_peers(ticker: str) -> list:
    """한국 종목 동종비교 — Naver 종목 메인의 '동일업종비교' 테이블 스크래핑.
    self(첫 컬럼) 포함 최대 5개. US peers와 동일 dict 키. 실패 시 []."""
    code = kr_code(ticker)
    try:
        r = _session.get(f'https://finance.naver.com/item/main.naver?code={code}',
                         headers={'User-Agent': 'Mozilla/5.0'}, timeout=6)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, 'html.parser')
        sec = soup.select_one('.section.trade_compare')
        if not sec:
            return []
        # 종목 컬럼 (코드 + 명) — 중복 제거, 순서 유지, 최대 5
        cols, seen = [], set()
        for a in sec.select('a[href*="code="]'):
            m = re.search(r'code=(\d{6})', a.get('href', ''))
            if not m:
                continue
            cd = m.group(1)
            if cd in seen:
                continue
            seen.add(cd)
            nm = re.sub(r'\*?' + cd + r'$', '', a.get_text(strip=True)).rstrip('*').strip()
            cols.append({'code': cd, 'name': nm})
        cols = cols[:5]
        if not cols:
            return []
        def row_vals(pred):
            for tr in sec.select('table tbody tr'):
                th = tr.find('th')
                if th and pred(th.get_text(' ', strip=True)):
                    return [td.get_text(' ', strip=True) for td in tr.find_all('td')]
            return []
        prices = row_vals(lambda t: t.startswith('현재가'))
        chgs   = row_vals(lambda t: '등락률' in t)
        mcaps  = row_vals(lambda t: t.startswith('시가총액'))
        epss   = row_vals(lambda t: '주당순이익' in t)
        peers = []
        for i, c in enumerate(cols):
            g = lambda arr: arr[i] if i < len(arr) else ''
            price = _parse_kr_num(g(prices))
            eps   = _parse_kr_num(g(epss))
            mcap  = _parse_kr_num(g(mcaps))      # 억 단위
            raw_chg = g(chgs)
            cm = re.search(r'([\d.]+)\s*%', raw_chg)
            chg = float(cm.group(1)) if cm else None
            if chg is not None and ('하락' in raw_chg or '하향' in raw_chg or '-' in raw_chg):
                chg = -abs(chg)
            peers.append({
                'ticker':     c['code'],
                'name':       c['name'],
                'price':      price,
                'change_pct': chg,
                'market_cap': int(mcap * 1e8) if mcap else None,   # 억 → 원
                # 동일업종비교 EPS는 분기/기간 불일치로 PER 계산 시 왜곡 → 미표시
                'pe_ratio':   None,
                'eps':        eps,
                'forward_pe': None,
                'sector':     '',
            })
        return peers
    except Exception:
        return []

@ttl_cache(3600)
def _stock_peers(ticker: str) -> list:
    # KR 종목은 Naver 동일업종비교 스크래핑 (Yahoo peer 데이터 없음)
    if is_kr(ticker):
        return _kr_peers(ticker)
    try:
        t = ticker.upper()
        # TechBio(AI 신약개발)는 큐레이션 — 이종 'AI'(데이터센터·로봇) 배제. 그 외는 Yahoo 추천.
        peer_tickers = _curated_aidrug_peers(t)
        if peer_tickers is None:
            peer_tickers = []
            url = (f'https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/'
                   f'{urllib.parse.quote(t)}')
            r = _session.get(url, timeout=8)
            if r.status_code == 200:
                recs = (r.json().get('finance', {}).get('result') or [{}])[0].get('recommendedSymbols', [])
                peer_tickers = [x['symbol'] for x in recs[:4] if x.get('symbol')]
        all_tickers = [t] + peer_tickers

        def _fetch_peer(pt):
            try:
                info = _yf_info_safe(pt, timeout=6)
                return {
                    'ticker':     pt,
                    'name':       info.get('shortName', pt),
                    'price':      _f(info.get('regularMarketPrice') or info.get('currentPrice')),
                    'change_pct': _f(info.get('regularMarketChangePercent')),
                    'market_cap': safe_i_local(info.get('marketCap')),
                    'pe_ratio':   _f(info.get('trailingPE')),
                    'eps':        _f(info.get('trailingEps')),
                    'forward_pe': _f(info.get('forwardPE')),
                    'dividend':   _f(info.get('dividendRate')),
                    'div_yield':  _f(info.get('dividendYield')),
                    'sector':     info.get('sector', ''),
                    'industry':   info.get('industry', ''),
                }
            except Exception:
                return None

        # 5개 동시 병렬 실행 → 순차 합산(40s) → 병렬(7s max)
        peers = []
        with _cf.ThreadPoolExecutor(max_workers=5) as ex:
            futs = {ex.submit(_fetch_peer, pt): pt for pt in all_tickers[:5]}
            for fut in _cf.as_completed(futs, timeout=8):
                try:
                    p = fut.result(timeout=0)
                    if p:
                        peers.append(p)
                except Exception:
                    pass
        return peers
    except Exception:
        return []

# ─── Pydantic ─────────────────────────────────────────────────────────
class Holding(BaseModel):
    ticker: str; name: str; quantity: float; avg_price: float; sector: str = ''
    manual_price: float = 0   # 외부 시세 미조회 종목용 사용자 직접 입력 참고가(0=미설정)

class WatchlistItem(BaseModel):
    ticker: str; name: str; exchange: str = ''; qtype: str = ''

class PortfolioData(BaseModel):
    portfolios: Dict[str, List[dict]]; watchlist: List[dict]

class YoutubeReq(BaseModel):
    video_id: str; title: str; channel: str = ''; api_key: str

# ─── Routes ───────────────────────────────────────────────────────────
_NO_CACHE = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}

@app.get("/", include_in_schema=False)
def root():
    idx = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(idx):
        return FileResponse(idx, headers=_NO_CACHE)
    return {"status": "ok", "app": "다온 API v2"}

@app.get("/presentation.html", include_in_schema=False)
def serve_presentation():
    f = os.path.join(STATIC_DIR, "presentation.html")
    if os.path.exists(f):
        return FileResponse(f)
    raise HTTPException(404)

# Portfolio
@app.get("/api/portfolio")
def get_portfolio(cu: dict = Depends(get_current_user)):
    return _load_user_data(cu["user_id"])

@app.put("/api/portfolio")
def save_portfolio(data: PortfolioData, cu: dict = Depends(get_current_user)):
    # 일괄 저장 전 현재 상태를 백업 — 엑셀 업로드 등 대규모 변경 시 원복 가능
    try:
        current = _load_user_data(cu["user_id"])
        backup  = {
            'saved_at':   time(),
            'portfolios': current.get('portfolios', {}),
            'watchlist':  current.get('watchlist', []),
        }
        with _db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)",
                (f"backup:{cu['user_id']}", json.dumps(backup, default=str))
            )
    except Exception:
        pass  # 백업 실패해도 저장은 진행
    _save_user_data(cu["user_id"], data.model_dump()); return {"ok": True}

def _user_account_keys(user_id: str) -> set:
    """사용자의 계좌 key 집합 — validation용."""
    with _db() as conn:
        rows = conn.execute("SELECT key FROM accounts WHERE user_id=?", (user_id,)).fetchall()
    return {r['key'] for r in rows}

@app.post("/api/portfolio/{account}/add")
def add_holding(account: str, h: Holding, cu: dict = Depends(require_approved)):
    valid = _user_account_keys(cu['user_id'])
    # 시드 안된 사용자: 기본 4종 시드 후 재확인
    if not valid:
        _seed_default_accounts(cu['user_id'])
        valid = _user_account_keys(cu['user_id'])
    if account not in valid:
        raise HTTPException(400, f"존재하지 않는 계좌입니다: {account}")
    ud = _load_user_data(cu["user_id"])
    holdings = ud['portfolios'].get(account, [])
    for i, x in enumerate(holdings):
        if x['ticker'].upper() == h.ticker.upper():
            holdings[i] = h.model_dump()
            ud['portfolios'][account] = holdings
            _save_user_data(cu["user_id"], ud); return {"ok": True, "action": "updated"}
    holdings.append(h.model_dump())
    ud['portfolios'][account] = holdings
    _save_user_data(cu["user_id"], ud); return {"ok": True, "action": "added"}

@app.delete("/api/portfolio/{account}/{ticker}")
def del_holding(account: str, ticker: str, cu: dict = Depends(get_current_user)):
    ud = _load_user_data(cu["user_id"])
    ud['portfolios'][account] = [x for x in ud['portfolios'].get(account, [])
                                  if x['ticker'].upper() != ticker.upper()]
    _save_user_data(cu["user_id"], ud); return {"ok": True}

@app.post("/api/watchlist/add")
def add_watchlist(item: WatchlistItem, cu: dict = Depends(get_current_user)):
    ud = _load_user_data(cu["user_id"])
    wl = ud.get('watchlist', [])
    if not any(w['ticker'].upper() == item.ticker.upper() for w in wl):
        wl.append(item.model_dump()); ud['watchlist'] = wl
        _save_user_data(cu["user_id"], ud)
    return {"ok": True}

@app.delete("/api/watchlist/{ticker}")
def del_watchlist(ticker: str, cu: dict = Depends(get_current_user)):
    ud = _load_user_data(cu["user_id"])
    ud['watchlist'] = [w for w in ud.get('watchlist', [])
                       if w['ticker'].upper() != ticker.upper()]
    _save_user_data(cu["user_id"], ud); return {"ok": True}

# Settings — API Key (서버에 영구 저장, 모든 기기 공유) — admin 전용
@app.get("/api/settings/apikey")
def get_apikey(cu: dict = Depends(require_admin)):
    key = _stored_api_key()
    return {"has_key": bool(key)}

class ApiKeyReq(BaseModel):
    key: str

@app.put("/api/settings/apikey")
def set_apikey(req: ApiKeyReq, cu: dict = Depends(require_admin)):
    with _db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('anthropic_key',?)",
                     (req.key.strip(),))
    return {"ok": True}

# API Key 존재 여부만 체크 (모든 사용자 — AI 기능 사용 가능 여부 판단용)
@app.get("/api/settings/apikey/status")
def get_apikey_status(cu: dict = Depends(get_current_user)):
    return {"has_key": bool(_stored_api_key())}

# Market
@app.get("/api/market")
def get_market(): return _market_data()

@app.get("/api/usdkrw")
def get_usdkrw(): return {"rate": _usd_krw()}

# Stock
@app.get("/api/stock/{ticker}")
def get_stock(ticker: str):
    if is_kr(ticker):
        # _kr_price 와 _kr_history 를 병렬 실행 → 전체 대기 시간 최소화
        with _cf.ThreadPoolExecutor(max_workers=2) as ex:
            price_fut = ex.submit(_kr_price, ticker)
            hist_fut  = ex.submit(_kr_history, ticker)
            try:
                d = price_fut.result(timeout=10)
            except Exception:
                d = None
            try:
                hist = hist_fut.result(timeout=15)
            except Exception:
                hist = None

        # 가격 + 히스토리 모두 실패 → 펀드/일부 ETF로 추정 (Naver·yfinance 모두 미제공)
        if not d and not hist:
            raise HTTPException(404, detail={
                'error_code': 'unsupported_kr_fund',
                'ticker': ticker,
                'message': '한국 펀드/일부 ETF는 외부 시세 소스(Naver Finance · yfinance)에서 조회되지 않습니다.',
                'hint': '보유 종목 등록은 가능하지만 실시간 시세·차트는 표시되지 않습니다. 자산 추이/비중 계산은 평균단가로 추정됩니다.',
                'sources_tried': ['naver_finance', 'yfinance.KS', 'yfinance.KQ'],
            })
        # 가격만 실패 (히스토리 있음) — 거래정지/공시 휴장 등
        if not d:
            raise HTTPException(404, detail={
                'error_code': 'kr_price_unavailable',
                'ticker': ticker,
                'message': '현재가 조회만 실패했습니다. 거래정지/공시 휴장 또는 일시적 데이터 소스 오류일 수 있습니다.',
            })

        # 52주 고가·저가·총 거래량 등을 hist에서 계산
        extra = {}
        if hist:
            try:
                highs   = [r.get('high')   for r in hist[-252:] if r.get('high')   is not None]
                lows    = [r.get('low')    for r in hist[-252:] if r.get('low')    is not None]
                volumes = [r.get('volume') for r in hist[-5:]   if r.get('volume') is not None]
                if highs: extra['week_52_high'] = max(highs)
                if lows:  extra['week_52_low']  = min(lows)
                if volumes: extra['volume']     = int(volumes[-1])
            except Exception:
                pass
        # 네이버에서 종목명 시도 (best-effort)
        short_name = ticker
        try:
            code = kr_code(ticker)
            r = _session.get(f'https://finance.naver.com/item/main.naver?code={code}',
                             headers={'User-Agent': 'Mozilla/5.0'}, timeout=4)
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, 'html.parser')
                el = soup.select_one('.wrap_company h2 a')
                if el and el.get_text(strip=True):
                    short_name = el.get_text(strip=True)
        except Exception:
            pass

        # stale fallback 사용 시 사용자에게 명시
        is_stale = bool(d.get('_stale'))
        stale_min = int(d.get('_stale_age_sec', 0) // 60) if is_stale else 0
        data_status = 'stale' if is_stale else 'ok'
        data_message = (
            f"한국 시세 1·2차 소스가 일시 응답하지 않아 약 {stale_min}분 전 가격을 표시합니다. "
            f"자동 재시도 중입니다."
            if is_stale else None
        )
        return {
            **d, **extra,
            'ticker': ticker, 'hist': hist or [],
            'short_name': short_name,
            '_data_status':  data_status,
            '_data_message': data_message,
            '_data_source':  d.get('_source'),
        }

    d = _stock_full(ticker.upper())
    if not d:
        raise HTTPException(404, detail={
            'error_code': 'delisted_or_invalid',
            'ticker': ticker.upper(),
            'message': '잘못된 티커이거나 상장폐지 종목일 수 있습니다.',
            'hint': '티커 철자를 확인하시거나, 검색에서 종목을 다시 선택해주세요.',
        })
    return {**d, '_data_status': 'ok', '_data_message': None}

@app.get("/api/stock/{ticker}/price")
def get_price(ticker: str):
    if is_kr(ticker):
        d = _kr_price(ticker)
    else:
        d = _price_fast(ticker.upper())
    if not d: raise HTTPException(404, "Not found")
    return d

@app.get("/api/prices")
def get_prices(tickers: str):
    lst = [t.strip() for t in tickers.split(',') if t.strip()]
    return _batch_prices(lst)

@app.get("/api/stock/{ticker}/earnings")
def get_earnings(ticker: str):
    try:
        import yfinance as yf
        def _fetch():
            s = yf.Ticker(ticker.upper())
            try:   return s.quarterly_income_stmt
            except AttributeError: return s.quarterly_financials
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            qi = ex.submit(_fetch).result(timeout=10)
        try:   qi = qi
        except: qi = None
        hist_rev = hist_ni = hist_eps = hist_guidance_eps = None
        if qi is not None and not qi.empty:
            for row in qi.index:
                rs = str(row).lower().replace(' ','').replace('_','')
                if 'totalrevenue' in rs:
                    hist_rev = [{'date': str(k)[:10], 'value': float(v)}
                                for k, v in qi.loc[row].dropna().sort_index().items()]
                elif 'netincome' in rs and 'minority' not in rs:
                    hist_ni = [{'date': str(k)[:10], 'value': float(v)}
                               for k, v in qi.loc[row].dropna().sort_index().items()]
        return {'hist_rev': hist_rev, 'hist_ni': hist_ni,
                'hist_eps': hist_eps, 'hist_guidance_eps': hist_guidance_eps,
                'fwd_rev': None, 'fwd_eps': None}
    except Exception:
        return {'hist_rev': None, 'hist_ni': None, 'hist_eps': None,
                'hist_guidance_eps': None, 'fwd_rev': None, 'fwd_eps': None}

@ttl_cache(3600)  # 1시간 캐시
def _financials_trend(ticker: str) -> dict:
    """2년간 분기별 매출·영업이익 + EPS(실적·추정치) 트렌드 데이터"""
    import yfinance as yf
    import pandas as pd

    def _fmt_q(ts):
        try:
            t = pd.Timestamp(ts)
            return f"{str(t.year)[2:]}Q{t.quarter}"
        except Exception:
            return str(ts)[:10]

    def _to_float(v):
        try:
            if v is None or pd.isna(v): return None
            return float(v)
        except Exception:
            return None

    def _work():
        # KR 티커: .KS/.KQ 서픽스 자동 시도
        upper = ticker.upper()
        if is_kr(upper):
            code = kr_code(upper)
            s = None
            for sfx in ['.KS', '.KQ']:
                try:
                    cand = yf.Ticker(f"{code}{sfx}")
                    qi_test = None
                    try:   qi_test = cand.quarterly_income_stmt
                    except: qi_test = cand.quarterly_financials
                    if qi_test is not None and not qi_test.empty:
                        s = cand
                        break
                except Exception:
                    continue
            if s is None:
                return {'revenue': [], 'operating_income': [], 'eps': []}
        else:
            s = yf.Ticker(upper)

        result = {'revenue': [], 'operating_income': [], 'eps': []}

        # 분기별 매출·영업이익 (최근 8분기)
        try:
            qi = s.quarterly_income_stmt
        except AttributeError:
            qi = s.quarterly_financials
        if qi is not None and not qi.empty:
            rev_row = next((i for i in qi.index
                            if 'totalrevenue' in str(i).lower().replace(' ','').replace('_','')), None)
            op_row  = next((i for i in qi.index
                            if 'operatingincome' in str(i).lower().replace(' ','').replace('_','')), None)
            cols = sorted([c for c in qi.columns])[-8:]
            for c in cols:
                period = _fmt_q(c)
                date_s = str(c)[:10]
                rev = _to_float(qi.loc[rev_row, c]) if rev_row is not None else None
                op  = _to_float(qi.loc[op_row, c])  if op_row  is not None else None
                result['revenue'].append({'period': period, 'date': date_s, 'value': rev})
                result['operating_income'].append({'period': period, 'date': date_s, 'value': op})

        # EPS: 과거 실적 + 미래 예상 (earnings_dates)
        try:
            ed = s.earnings_dates
        except Exception:
            ed = None
        if ed is not None and not ed.empty:
            try:
                tz = ed.index.tz
                now = pd.Timestamp.now(tz=tz) if tz else pd.Timestamp.now()
                ed_sorted = ed.sort_index()
                past   = ed_sorted[ed_sorted.index <  now].tail(6)
                future = ed_sorted[ed_sorted.index >= now].head(2)
                combined = pd.concat([past, future])
                for idx, row in combined.iterrows():
                    est = None
                    act = None
                    for k in row.index:
                        kl = str(k).lower().replace(' ','')
                        if 'reported' in kl and 'eps' in kl:
                            act = _to_float(row[k])
                        elif 'epsestimate' in kl or (kl == 'estimate'):
                            est = _to_float(row[k])
                    result['eps'].append({
                        'period':    _fmt_q(idx),
                        'date':      str(idx)[:10],
                        'estimate':  est,
                        'actual':    act,
                        'is_future': bool(idx >= now),
                    })
            except Exception:
                pass

        return result

    try:
        with _cf.ThreadPoolExecutor(max_workers=1) as ex:
            return ex.submit(_work).result(timeout=15)
    except Exception:
        return {'revenue': [], 'operating_income': [], 'eps': []}

@app.get("/api/stock/{ticker}/financials-trend")
def get_financials_trend(ticker: str):
    return _financials_trend(ticker.upper())

@app.get("/api/stock/{ticker}/news")
def get_news(ticker: str): return _stock_news(ticker.upper())

# Search
@app.get("/api/search")
def search(q: str = ''):
    if not q: return []
    return _search(q)

# Trends
@app.get("/api/most-active/us")
def most_active_us(): return _most_active_us()

@app.get("/api/most-active/kr")
def most_active_kr(): return _most_active_kr()

@app.get("/api/sector/us")
def sector_us(): return _sector_us()

@app.get("/api/sector/kr")
def sector_kr(): return _sector_kr()

@ttl_cache(3600)
def _sector_stocks_us(sector: str) -> list:
    stocks = US_SECTOR_TOP.get(sector, [])
    if not stocks:
        return []
    def _fetch(tkr_name):
        tkr, name = tkr_name
        try:
            res = _yf_chart(tkr, '5d', '1d')
            if res:
                p = _chart_to_price(res)
                if p:
                    return {'ticker': tkr, 'name': name,
                            'price': round(p['current_price'], 2),
                            'change_pct': round(p['change_pct'], 2), 'market_cap': 0,
                            'spark': p.get('spark', [])}
        except Exception:
            pass
        return {'ticker': tkr, 'name': name, 'price': 0, 'change_pct': 0, 'market_cap': 0, 'spark': []}
    result_map = {}
    with _cf.ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(_fetch, tn): tn[0] for tn in stocks}
        for fut in _cf.as_completed(futs, timeout=15):
            try:
                r = fut.result(timeout=0)
                result_map[r['ticker']] = r
            except Exception:
                pass
    # preserve original order
    return [result_map.get(tkr, {'ticker': tkr, 'name': name, 'price': 0, 'change_pct': 0, 'market_cap': 0})
            for tkr, name in stocks]

def _sector_stocks_kr(sector: str) -> list:
    stocks = KR_SECTOR_TOP.get(sector, [])[:10]
    if not stocks:
        return []
    def _fetch(tkr_name):
        tkr, name = tkr_name
        try:
            p = _kr_price(tkr)
            sp = _kr_spark(tkr) or []
            return {'ticker': tkr, 'name': name,
                    'price': p.get('current_price', 0) if p else 0,
                    'change_pct': round(p.get('change_pct', 0), 2) if p else 0,
                    'market_cap': 0, 'spark': sp}
        except Exception:
            return {'ticker': tkr, 'name': name, 'price': 0, 'change_pct': 0, 'market_cap': 0, 'spark': []}
    result_map = {}
    with _cf.ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(_fetch, tn): tn[0] for tn in stocks}
        for fut in _cf.as_completed(futs, timeout=20):
            try:
                r = fut.result(timeout=0)
                result_map[r['ticker']] = r
            except Exception:
                pass
    return [result_map.get(tkr, {'ticker': tkr, 'name': name, 'price': 0, 'change_pct': 0, 'market_cap': 0})
            for tkr, name in stocks]

@app.get("/api/sector/stocks/us/{sector}")
def sector_stocks_us(sector: str): return _sector_stocks_us(sector)

@app.get("/api/sector/stocks/kr/{sector}")
def sector_stocks_kr(sector: str): return _sector_stocks_kr(sector)

@app.get("/api/heatmap")
def heatmap(): return _sp500_heatmap()

@app.get("/api/trends/news")
def trends_news(): return _tech_news()

class AnalyzeReq(BaseModel):
    api_key: str = ''
    holdings: list = []
    prices: dict = {}

@app.post("/api/portfolio/analyze")
def analyze(req: AnalyzeReq, cu: dict = Depends(require_ai_enabled)):
    api_key = req.api_key or _stored_api_key()
    if not api_key:
        raise HTTPException(400, "Anthropic API key required")
    _fp = hashlib.md5(json.dumps(sorted(h.get('ticker','') for h in req.holdings)).encode()).hexdigest()
    # 캐시 키에 user_id 포함 — 다른 사용자가 동일 구성으로 우연히 결과 공유 방지
    cache_key = f"portfolio_analyze:{cu['user_id']}:{_fp}"
    cached = _get_ai_cache(cache_key)
    if cached is not None:
        return cached
    _log_event(cu['user_id'], 'ai_call', {'kind': 'portfolio_analyze'})
    _bump_ai_call(cu['user_id'])
    lines = []
    total_krw = 0
    usd_krw = 1380
    for h in req.holdings:
        tkr   = h.get('ticker','')
        acc   = h.get('account','')
        qty   = h.get('quantity', 0)
        avg   = h.get('avg_price', 0)
        name  = h.get('name', tkr)
        sector= h.get('sector','?')
        is_us = not re.match(r'^A?\d{6}$', tkr)
        cur   = req.prices.get(tkr, {}).get('current_price') or (h.get('manual_price') or 0) or avg
        mul   = usd_krw if is_us else 1
        val   = qty * cur * mul
        cost  = qty * avg * mul
        pnl   = (cur - avg) / avg * 100 if avg else 0
        total_krw += val
        lines.append(
            f"  {tkr}({name}) | 계좌:{acc} | 섹터:{sector} | {qty}주 | "
            f"현재가:{'$' if is_us else '₩'}{cur:,.0f} | "
            f"평가액:₩{val:,.0f} | 수익률:{pnl:+.1f}%"
        )
    holdings_txt = "\n".join(lines)
    total_txt = f"₩{total_krw:,.0f}"
    prompt = (
        "당신은 월스트리트 및 한국 주식시장 TOP 애널리스트입니다. "
        "아래 포트폴리오를 분석하고 한국어로 날카로운 통찰을 제공해주세요.\n\n"
        f"=== 포트폴리오 (총 평가액 {total_txt}) ===\n{holdings_txt}\n\n"
        "다음 5가지 항목을 각각 2-3문장으로 분석해주세요:\n"
        "1. diagnosis: 섹터 집중도·분산도 현황 진단\n"
        "2. risks: 현재 포트폴리오의 주요 리스크 요인\n"
        "3. rebalance: 구체적인 비중 조정 추천 (확대/축소 종목)\n"
        "4. positioning: 현재 글로벌 매크로 환경 대비 포지셔닝 평가\n"
        "5. outlook: 단기(1-3개월) 및 중기(6-12개월) 방향 제시\n\n"
        'JSON만 응답: {"diagnosis":"...","risks":"...","rebalance":"...","positioning":"...","outlook":"..."}'
    )
    try:
        text = _call_claude(api_key, "claude-haiku-4-5-20251001", prompt, 1800, 80)
        try:
            res = _parse_claude_json(text)
        except Exception:
            res = {"diagnosis": text, "risks":"", "rebalance":"", "positioning":"", "outlook":""}
        _set_ai_cache(cache_key, res)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/stock/{ticker}/fundamentals")
def get_fundamentals(ticker: str):
    return _stock_fundamentals(ticker.upper())

@app.get("/api/stock/{ticker}/peers")
def get_peers(ticker: str):
    return _stock_peers(ticker.upper())

class StockAnalyzeReq(BaseModel):
    api_key: str = ''
    name: str = ''             # 보유 종목 이름 (프론트가 알고 있다면 전달 — 환각 방지)
    force_refresh: bool = False  # True면 캐시 무시하고 새로 분석


@app.get("/api/stock/{ticker}/analyze/cached")
def get_cached_analysis(ticker: str, name: str = ''):
    """캐시된 분석이 있으면 반환, 없으면 cached=False. 분석 자동 트리거 안 함."""
    # 티커 기준 조회 (이름 무시 + TTL 무시) — 한 번 분석한 종목은 날짜와 함께 기존 결과를 기본 표시
    cached, ts = _get_stock_cache_by_ticker(ticker)
    if cached is None:
        return {"cached": False}
    return {
        "cached": True,
        "data": cached,
        "computed_at": ts,   # epoch seconds
    }

@app.post("/api/stock/{ticker}/analyze")
def analyze_stock(ticker: str, req: StockAnalyzeReq, cu: dict = Depends(require_ai_enabled)):
    api_key = req.api_key or _stored_api_key()
    if not api_key:
        raise HTTPException(400, "API key required")
    if _is_demo(cu):
        req.force_refresh = False  # 데모: 공유 캐시 재사용, 재분석 강제 차단
    # 종목명을 캐시 키에 포함 — 다른 사용자가 잘못된 이름으로 캐시 오염시켰을 때 방어
    name_hint = (req.name or '').strip()
    # v2: 새 분석 스키마 — 종목 분석은 공개 데이터 + AI 결과이므로 사용자 간 캐시 공유 (비용 최적화)
    cache_key = f"stock_v2:{ticker.upper()}:{name_hint}"
    if not req.force_refresh:
        # 티커 기준(이름·TTL 무시) — 기존 분석이 있으면 그대로 반환. 갱신은 force_refresh로 사용자가 결정.
        cached, ts = _get_stock_cache_by_ticker(ticker)
        if cached is not None:
            out = dict(cached)
            out["_cached"] = True
            out["_computed_at"] = ts
            return out
    # 데모: 미캐시 티커는 라이브 생성 — 24h 롤링 한도 초과 시 차단(비용 상한)
    if _is_demo(cu) and not _demo_ai_budget_ok():
        raise HTTPException(429,
            "데모 체험용 AI 분석 일일 한도에 도달했습니다 — 이미 분석된 종목은 계속 열람 가능합니다. "
            "회원가입 후 모든 종목을 무제한 분석해보세요.")
    _log_event(cu['user_id'], 'ai_call', {'kind': 'stock_analyze', 'ticker': ticker.upper()})
    _bump_ai_call(cu['user_id'])

    try:
        # ── 1) 컨텍스트 데이터 수집 (가격/펀더멘털/뉴스/애널리스트) ──────────
        if is_kr(ticker):
            p = _kr_price(ticker)
            cur = p.get('current_price', 0) if p else 0
            chg = p.get('change_pct', 0) if p else 0

            kr_name = name_hint
            if not kr_name:
                try:
                    code = kr_code(ticker)
                    r = _session.get(f'https://finance.naver.com/item/main.naver?code={code}',
                                     headers={'User-Agent': 'Mozilla/5.0'}, timeout=4)
                    if r.status_code == 200:
                        soup = BeautifulSoup(r.text, 'html.parser')
                        el = soup.select_one('.wrap_company h2 a')
                        if el and el.get_text(strip=True):
                            kr_name = el.get_text(strip=True)
                except Exception:
                    pass
            if not kr_name:
                raise HTTPException(503,
                    f"종목명을 조회할 수 없습니다 ({ticker}). 환각 방지를 위해 분석을 중단합니다.")

            etf_brands = ['TIGER', 'ACE', 'KODEX', 'RISE', 'KBSTAR', 'HANARO', 'ARIRANG',
                          'PLUS', '히어로즈', '파워', 'KOSEF', 'SOL', '미래에셋', 'KOACT', 'TIMEFOLIO']
            up = kr_name.upper()
            is_etf = any(b.upper() in up for b in etf_brands) or 'ETF' in up
            asset_class = 'ETF' if is_etf else '주식'
            company_name = kr_name
            ticker_str   = f"{ticker} (KRX)"
            price_str    = f"₩{cur:,.0f} ({chg:+.2f}%)"
            fundamentals_str = ""
            target_str   = ""
            extra_guidance = (
                f"\n[중요 — 환각 방지 지침]\n"
                f"- '종목명: {kr_name}' 만이 정확한 식별 정보입니다.\n"
                f"- 종목코드 '{ticker}'는 KRX 식별자입니다. 숫자를 보고 다른 회사로 오인하지 마세요.\n"
                f"- {('ETF는 추종 지수/테마, 보수율, 분배 정책 관점에서 분석하세요.' if is_etf else '회사의 사업 모델·산업 동향·실적 관점에서 분석하세요.')}\n"
                f"- 회사명이 익숙하지 않다면 web_search로 정확히 확인 후 분석하세요.\n"
            )
        else:
            d = _stock_full(ticker.upper())
            if not d:
                raise HTTPException(404, "Not found")
            fnd = _stock_fundamentals(ticker.upper())
            cur = d.get('current_price', 0)
            chg = d.get('change_pct', 0)
            company_name = d.get('short_name', ticker.upper())
            ticker_str   = f"{ticker.upper()} (US)"
            price_str    = f"${cur:.2f} ({chg:+.2f}%)"
            fundamentals_str = (
                f"P/E: {fnd.get('trailing_pe') or 'N/A'} | Forward P/E: {fnd.get('forward_pe') or 'N/A'} | "
                f"PEG: {fnd.get('peg_ratio') or 'N/A'}\n"
                f"시가총액: ${(fnd.get('market_cap') or 0)/1e9:.1f}B | "
                f"섹터: {d.get('sector','N/A')}\n"
                f"이익률: {fnd.get('profit_margin') or 'N/A'}% | ROE: {fnd.get('roe') or 'N/A'}% | "
                f"FCF: ${(fnd.get('free_cash_flow') or 0)/1e9:.2f}B\n"
                f"매출(TTM): ${(fnd.get('revenue') or 0)/1e9:.2f}B | EPS: {fnd.get('diluted_eps') or 'N/A'}"
            )
            tm = d.get('target_mean')
            tlow = d.get('target_low')
            thigh = d.get('target_high')
            rec_yh = d.get('recommendation', '')
            n_an = d.get('num_analysts', 0)
            if tm:
                target_str = (
                    f"애널리스트 컨센서스 (Yahoo Finance/Refinitiv 기준):\n"
                    f"  목표가 평균: ${tm:.2f} | 범위: ${tlow:.2f}~${thigh:.2f} | "
                    f"추천: {rec_yh} ({n_an}명 참여)"
                )
            else:
                target_str = ""
            extra_guidance = ""

        # 최근 뉴스 (최대 5개)
        news_lines: list[str] = []
        try:
            news_data = _stock_news(ticker.upper())
            for n in (news_data.get('news') or [])[:5]:
                line = f"- {n.get('title','')} ({n.get('publisher','')}{', ' + n['date'] if n.get('date') else ''})"
                news_lines.append(line)
        except Exception:
            pass
        news_block = "\n".join(news_lines) if news_lines else "(최근 뉴스 데이터 없음)"

        # ── 2) 프롬프트 작성 ─────────────────────────────────────────
        from datetime import date as _date
        today = _date.today().isoformat()

        # 종목별 가변 데이터(가격/펀더멘털/뉴스/공시) — 너무 크면 API가 거절하므로
        # 상위(최신) 내용만 남기고 50,000자 내외로 자른다. 고정 지침은 별도로 뒤에 붙여 보존.
        context_block = _truncate_head(
            f"오늘 날짜: {today}\n"
            f"분석 대상: {company_name}\n"
            f"티커: {ticker_str}\n"
            f"현재가: {price_str}\n"
            + (f"{fundamentals_str}\n" if fundamentals_str else "")
            + (f"{target_str}\n" if target_str else "")
            + extra_guidance
            + f"\n[수집된 최근 뉴스 헤드라인 (참고용)]\n{news_block}\n",
            MAX_STOCK_PAYLOAD_CHARS,
        )

        prompt = (
            context_block
            + (
                "\n[작업 절차]\n"
                "STEP 0 (섹터 판별 후 분기): 먼저 종목의 섹터·비즈니스 모델을 판별하라.\n"
                "  ▶ TechBio/바이오 플랫폼(AI 기반 신약 발굴 등 임상단계 신약개발사 — 예: RXRX, SDGR, EXAI)인 경우 아래를 반드시 반영:\n"
                "     (a) 경영진 변경 해석: 공동창업자의 이사회 퇴임 + 전문경영인(신약개발·상업화 전문가)의 경영 전담을 "
                "'단순 경영진 불확실성 리스크'로 기계적 분류하지 말 것. '연구 단계 → 상업화·파트너십/계약 단계로의 전환'이라는 중립~긍정 맥락으로 해석하라.\n"
                "     (b) 재무지표: 제조업식 '수주 잔고/백로그' 조사를 강제하지 말 것. 대신 '잠재 마일스톤(Potential Milestones) 총액'과 "
                "'기술수출(License-out) 계약 잠재력'(파트너십당 개발·규제 마일스톤 잠재 규모, 선급금·로열티 구조)을 우선 추적하라.\n"
                "     (c) 동종업계(Peer): 'AI' 키워드만으로 데이터센터(APLD)·로봇(SERV) 등 이종 섹터를 비교군에 넣지 말 것. "
                "SDGR·EXAI 등 'AI 기반 신약개발 플랫폼' 기업으로만 비교하라.\n"
                "  ▶ 그 외 섹터(제조·반도체·SW·소비재 등)는 STEP 1 표준 절차를 그대로 따른다.\n"
                "STEP 1: web_search로 다음을 충분히 조사하세요 (총 4회 이내, 실적·호재·애널리스트·전략 위주):\n"
                "  ① 회사 최근 사업 진행, 신사업 진출, 미래 전략 (최근 3-6개월)\n"
                "  ② CEO/경영진의 최근 발언, 인터뷰, IR/투자자 컨퍼런스\n"
                "  ③ 가장 최근 분기 실적: 매출·영업이익·EPS (컨센서스 대비)·가이던스\n"
                "  ④ 단기 호재 (1-3M): 신제품·규제승인·수주·파트너십 — 반드시 정량 수치\n"
                "  ⑤ 중기 호재 (3-12M): 신사업 매출 기여·시장 확장·캐파 증설 — 정량\n"
                "  ⑥ (제조·SW형) 수주 잔고/백로그·RPO·Deferred Revenue / (TechBio형) 잠재 마일스톤 총액·기술수출(License-out) 잠재력 — 섹터에 맞는 지표만\n"
                "  ⑦ 최근 1-2개월 애널리스트 보고서 (기관·목표가·의견 변경)\n"
                "  ⑧ 무료 다운로드 가능한 보고서/IR 페이지 URL\n\n"
                "STEP 2: 모든 조사가 끝나면, 다음 JSON을 한국어로 작성하여 단일 메시지로 응답하세요.\n"
                "[중요] 응답 메시지에는 절대로 사전 설명·검색 노트·영어 narration을 넣지 마세요.\n"
                "메시지의 처음과 끝은 '{' 와 '}' 여야 합니다. 내부 모든 텍스트는 한국어.\n\n"
                "[JSON 스키마 — 정확히 이 키들만 사용]\n"
                "{\n"
                '  "recommendation": "매수" | "보유" | "매도",\n'
                '  "priceTarget": null 또는 숫자 (USD 또는 KRW 단위, 표시 통화에 맞게),\n'
                '  "summary": "한국어 3-4문장. 투자 논거의 핵심을 서술형으로.",\n'
                '  "company_overview": "한국어 5-7줄 상세 서술. 사업 구조·최근 동향·신사업·미래 전략을 인과관계와 핵심 수치로 설명. 단어 나열 금지, 완결된 문장으로.",\n'
                '  "earnings_ir": "한국어 5-7줄 상세. 최근 분기 매출/영업이익/EPS를 컨센서스·전년동기 대비 수치로, 가이던스와 CEO 발언의 함의까지 서술.",\n'
                '  "catalysts_short": ["단기 호재 3개 — 각 항목을 1-2문장으로 근거·정량 수치·시점과 함께 서술 (단어 나열 금지)"],\n'
                '  "catalysts_medium": ["중기 호재 3개 — 각 항목을 1-2문장으로 근거·정량 수치와 함께 서술"],\n'
                '  "backlog": "한국어 2-3줄. (제조·SW형) 수주 잔고/백로그/RPO 현황·추이. (TechBio/바이오 플랫폼) 대신 잠재 마일스톤 총액·기술수출(License-out) 계약 잠재력을 서술. 해당 없으면 빈 문자열",\n'
                '  "analyst_views": "한국어 4-5줄 상세. 최근 애널리스트 보고서를 기관명·목표가·의견 변동과 그 논거까지 서술.",\n'
                '  "bull": ["강세 논거 3개 — 각 항목을 1-2문장으로 근거와 함께 서술 (단어 조각 금지)"],\n'
                '  "bear": ["리스크 3개 — 각 항목을 1-2문장으로 근거·발생 가능성과 함께 서술"],\n'
                '  "verdict": "한국어 2-3문장 최종 의견 — 매수/보유/매도 판단의 핵심 근거와 조건."\n'
                "}\n"
                "[규칙]\n"
                "- 【분량·깊이 필수】 company_overview·earnings_ir·analyst_views·backlog 각 필드는 **최소 4문장 이상** 상세 서술. "
                "catalysts/bull/bear의 각 항목도 **완결된 1-2문장(근거+구체 수치)**. "
                "'Azure 고성장', 'Copilot 채택 확대' 같은 **키워드·단어 나열식 짧은 답변은 거부됨** — 반드시 '왜·얼마나·언제'를 문장으로 풀어쓸 것.\n"
                "- 모든 string 값은 한국어로 작성. 회사명·티커·통화기호·전문용어 약어는 영어 그대로 OK.\n"
                "- 확인되지 않은 항목은 정확히 \"확인 필요\" 라고만 적고, 추측 절대 금지.\n"
                "- 모든 수치는 출처·시점을 함께 명시 (예: 'Q1 FY26 매출 $200.3M (YoY +63.5%, 2026-05-08 발표)').\n"
                "- 본문 외 어떤 prefix·suffix·주석·markdown도 금지.\n"
            )
        )

        # ── 3) Claude Sonnet 4.6 + web_search 호출 ────────────────────
        text, citations = _call_claude_with_search(
            api_key=api_key,
            model="claude-sonnet-4-6",
            prompt=prompt,
            max_tokens=8000,
            max_searches=4,
            timeout=180,
        )
        try:
            res = _parse_claude_json(text)
        except Exception:
            # JSON 파싱 실패 — 영어 사고 과정이 raw text로 들어가는 것 방지.
            # 캐시하지 않고 명시적 에러 반환 → 사용자가 재시도 가능.
            raise HTTPException(
                502,
                "AI 분석 결과를 정상 형식으로 받지 못했습니다. 다시 시도해주세요.",
            )

        # 필수 필드 기본값 보강
        for key in ("recommendation", "summary", "company_overview", "earnings_ir",
                    "backlog", "analyst_views", "verdict"):
            if not isinstance(res.get(key), str):
                res[key] = ""
        for key in ("catalysts_short", "catalysts_medium", "bull", "bear"):
            if not isinstance(res.get(key), list):
                res[key] = []

        # 출처 (web_search 결과 + 인용)
        res["sources"] = citations[:12]
        _set_ai_cache(cache_key, res)
        # 응답 메타데이터
        res["_cached"] = False
        res["_computed_at"] = time()
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# YouTube
@app.post("/api/youtube/analyze")
def youtube_analyze(req: YoutubeReq, cu: dict = Depends(require_ai_enabled)):
    api_key = req.api_key or _stored_api_key()
    if not api_key: raise HTTPException(400, "API key required")
    _log_event(cu['user_id'], 'ai_call', {'kind': 'youtube_analyze'})
    _bump_ai_call(cu['user_id'])
    prompt = (f"YouTube 영상을 분석해주세요.\n제목: {req.title}\n채널: {req.channel}\n\n"
              f"1. 핵심 요약 (3줄)\n2. 언급된 투자 종목/섹터\n3. 투자 시사점\n4. 관련 추천 종목 (티커 포함, 최대 5개)\n\n"
              f'JSON: {{"summary":"...","tickers":[{{"ticker":"AAPL","name":"Apple","reason":"..."}}],"insight":"..."}}')
    try:
        content = _call_claude(api_key, "claude-haiku-4-5-20251001", prompt, 1024, 60)
        try:
            return _parse_claude_json(content)
        except Exception:
            return {"summary": content, "tickers": [], "insight": ""}
    except HTTPException: raise
    except Exception as e: raise HTTPException(500, str(e))

# ─── Portfolio Metrics (MDD · Sharpe · Return) ───────────────────────────────
class MetricsHolding(BaseModel):
    ticker: str
    avg_price: float
    quantity: float
    account: Optional[str] = None

class MetricsReq(BaseModel):
    holdings: list[MetricsHolding]
    scope: str = 'ALL'           # 계좌 필터 구분 (ALL / US / KR_RETIRE / KR_PERSONAL / KR_ISA)
    force_refresh: bool = False  # True면 캐시 무시하고 재계산

def _calc_metrics(ticker: str, avg_price: float) -> dict:
    """1년 일별 종가 히스토리로 MDD·Sharpe·수익률 계산"""
    import yfinance as yf
    import numpy as np

    hist = None
    if re.match(r'^A?\d{6}$', ticker):
        code = re.sub(r'^A', '', ticker)
        # 1차: v8 chart API 직접 호출 — yfinance보다 KR ETF 커버리지 넓음
        for sfx in ['.KS', '.KQ']:
            try:
                res = _yf_chart(f"{code}{sfx}", '1y', '1d')
                if res:
                    q0 = res.get('indicators', {}).get('quote', [{}])[0]
                    closes = [c for c in (q0.get('close') or []) if c is not None]
                    if len(closes) > 20:
                        hist = pd.Series([float(c) for c in closes])
                        break
            except Exception:
                pass
        # 2차: yfinance fallback (신규 상장 ETF 대비)
        if hist is None:
            for sfx in ['.KS', '.KQ']:
                try:
                    h = _yf_history_safe(f"{code}{sfx}", period='1y', timeout=10)
                    if h is not None and not h.empty and len(h) > 20:
                        hist = h['Close'].astype(float)
                        break
                except Exception:
                    pass
        # 3차: 데이터 짧아도 시도 (최근 상장 채권 ETF)
        if hist is None:
            for sfx in ['.KS', '.KQ']:
                try:
                    res = _yf_chart(f"{code}{sfx}", '6mo', '1d')
                    if res:
                        q0 = res.get('indicators', {}).get('quote', [{}])[0]
                        closes = [c for c in (q0.get('close') or []) if c is not None]
                        if len(closes) >= 5:
                            hist = pd.Series([float(c) for c in closes])
                            break
                except Exception:
                    pass
    else:
        try:
            h = _yf_history_safe(ticker, period='1y', timeout=12)
            if h is not None and not h.empty and len(h) > 20:
                hist = h['Close'].astype(float)
        except Exception:
            pass

    if hist is None or len(hist) < 5:
        return {'mdd': None, 'sharpe': None, 'return_pct': None, 'data_points': 0}

    closes = hist.values
    current_price = float(closes[-1])

    # 수익률 (평균단가 기준)
    return_pct = (current_price - avg_price) / avg_price * 100 if avg_price > 0 else 0.0

    # MDD (1년 구간 내 최고점 대비 최대 낙폭)
    peak = closes[0]
    max_dd = 0.0
    for p in closes:
        if p > peak:
            peak = p
        dd = (peak - p) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Sharpe (일간 수익률 기준, 연율화, 무위험수익률 4%)
    daily_ret = np.diff(closes) / closes[:-1]
    ann_ret   = float(np.mean(daily_ret)) * 252
    ann_std   = float(np.std(daily_ret, ddof=1)) * (252 ** 0.5)
    risk_free = 0.04
    sharpe = (ann_ret - risk_free) / ann_std if ann_std > 0 else 0.0

    return {
        'mdd':        round(max_dd * 100, 2),      # %
        'sharpe':     round(sharpe, 2),
        'return_pct': round(return_pct, 2),
        'data_points': len(closes),
    }

def _metrics_fingerprint(holdings: list) -> str:
    """보유 종목 구성 (ticker, avg_price, quantity, account) 기반 지문."""
    items = sorted([
        (h.ticker, round(float(h.avg_price), 4), round(float(h.quantity), 4), h.account or '')
        for h in holdings
    ])
    return hashlib.md5(json.dumps(items).encode()).hexdigest()

@app.get("/api/portfolio/metrics/cached")
def portfolio_metrics_cached(scope: str = 'ALL', cu: dict = Depends(get_current_user)):
    """저장된 성과 분석 결과 조회 (없으면 {cached: false})"""
    with _db() as conn:
        row = conn.execute(
            "SELECT result_json, computed_at, fingerprint FROM metrics_cache WHERE user_id=? AND scope=?",
            (cu['user_id'], scope)
        ).fetchone()
    if not row:
        return {'cached': False}
    try:
        result = json.loads(row['result_json'])
    except Exception:
        return {'cached': False}
    return {
        'cached':      True,
        'computed_at': row['computed_at'],
        'fingerprint': row['fingerprint'],
        **result,
    }

@app.post("/api/portfolio/metrics")
def portfolio_metrics(req: MetricsReq, cu: dict = Depends(get_current_user)):
    fp = _metrics_fingerprint(req.holdings)

    # 캐시 조회 — force_refresh가 아니고 fingerprint 일치 시 그대로 반환
    if not req.force_refresh:
        with _db() as conn:
            row = conn.execute(
                "SELECT result_json, computed_at, fingerprint FROM metrics_cache WHERE user_id=? AND scope=?",
                (cu['user_id'], req.scope)
            ).fetchone()
        if row and row['fingerprint'] == fp:
            try:
                cached = json.loads(row['result_json'])
                return {**cached, 'cached': True, 'computed_at': row['computed_at'], 'fingerprint': fp}
            except Exception:
                pass

    def _fetch_metric(h):
        m = _calc_metrics(h.ticker, h.avg_price)
        return {'ticker': h.ticker, 'account': h.account, **m}
    results = []
    with _cf.ThreadPoolExecutor(max_workers=min(len(req.holdings) or 1, 20)) as ex:
        futs = {ex.submit(_fetch_metric, h): h for h in req.holdings}
        for fut in _cf.as_completed(futs, timeout=30):
            try:
                results.append(fut.result(timeout=0))
            except Exception:
                h = futs[fut]
                results.append({'ticker': h.ticker, 'account': h.account,
                                'return_pct': None, 'mdd': None, 'sharpe': None})

    # 포트폴리오 가중 종합 지표 (계산 가능한 종목만)
    valid = [r for r in results if r['return_pct'] is not None]
    portfolio_summary = {}
    if valid:
        # 동일가중 평균 (실제 금액 가중은 current_price 필요 → 단순 평균으로 제공)
        portfolio_summary = {
            'avg_return':  round(sum(r['return_pct'] for r in valid) / len(valid), 2),
            'avg_mdd':     round(sum(r['mdd'] for r in valid) / len(valid), 2),
            'avg_sharpe':  round(sum(r['sharpe'] for r in valid) / len(valid), 2),
            'best_ticker': max(valid, key=lambda r: r['return_pct'])['ticker'],
            'worst_ticker':min(valid, key=lambda r: r['return_pct'])['ticker'],
            'highest_risk':max(valid, key=lambda r: r['mdd'])['ticker'],
            'best_sharpe': max(valid, key=lambda r: r['sharpe'])['ticker'],
            'valid_count': len(valid),
        }

    payload = {'metrics': results, 'summary': portfolio_summary}
    now_ts = time()

    # DB 저장 (user_id, scope) 단위로 덮어쓰기
    try:
        with _db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO metrics_cache(user_id, scope, fingerprint, result_json, computed_at) "
                "VALUES(?, ?, ?, ?, ?)",
                (cu['user_id'], req.scope, fp, json.dumps(payload), now_ts)
            )
    except Exception:
        pass

    return {**payload, 'cached': False, 'computed_at': now_ts, 'fingerprint': fp}


# ─── 다온 AI 전략 리포트 (metrics + Claude Sonnet 통합) ───────────────────────
class StrategyReq(BaseModel):
    holdings: list = []
    prices:   dict = {}
    scope:    str  = 'ALL'        # 어떤 계좌 필터로 분석했는지 (캐시 저장용)
    force_refresh: bool = False   # True면 캐시 무시하고 새로 분석
    years_to_retirement: int | None = None   # 은퇴까지 남은 햇수 (Life Timeline)
    monthly_inflow:      float | None = None  # 매월 추가 투입 가능액 (KRW)

@app.get("/api/portfolio/strategy/cached")
def portfolio_strategy_cached(scope: str = 'ALL', cu: dict = Depends(get_current_user)):
    """저장된 AI 전략 리포트 조회 (없으면 {cached: false})."""
    with _db() as conn:
        row = conn.execute(
            "SELECT result_json, computed_at, fingerprint FROM strategy_cache "
            "WHERE user_id=? AND scope=?",
            (cu['user_id'], scope)
        ).fetchone()
    if not row:
        return {'cached': False}
    try:
        result = json.loads(row['result_json'])
    except Exception:
        return {'cached': False}
    return {
        'cached':      True,
        'computed_at': row['computed_at'],
        'fingerprint': row['fingerprint'],
        'data':        result,
    }

@app.post("/api/portfolio/strategy")
def portfolio_strategy(req: StrategyReq, cu: dict = Depends(require_ai_enabled)):
    api_key = _stored_api_key()
    if not api_key:
        raise HTTPException(400, "AI 비서가 잠시 자리를 비웠습니다 — 관리 탭에서 Anthropic API Key를 먼저 입력해주세요")
    # 데모: force_refresh 무시 → '업데이트' 반복 클릭해도 캐시 재사용(재과금 차단)
    if _is_demo(cu):
        req.force_refresh = False
    _log_event(cu['user_id'], 'ai_call', {'kind': 'portfolio_strategy', 'scope': req.scope})
    _bump_ai_call(cu['user_id'])
    _fp = hashlib.md5(json.dumps([
        sorted(h.get('ticker', '') for h in req.holdings),
        req.years_to_retirement, req.monthly_inflow,
    ]).encode()).hexdigest()
    _cache_key = f"strategy:{cu['user_id']}:{_fp}"
    # 1) force_refresh면 캐시 무시
    if not req.force_refresh:
        # 1-a) 메모리 캐시 (최근 24시간)
        cached = _get_ai_cache(_cache_key)
        if cached is not None:
            return cached
        # 1-b) SQLite 캐시 (사용자가 마지막에 본 결과 — 지속성)
        with _db() as conn:
            row = conn.execute(
                "SELECT result_json, fingerprint FROM strategy_cache "
                "WHERE user_id=? AND scope=?",
                (cu['user_id'], req.scope)
            ).fetchone()
        if row and row['fingerprint'] == _fp:
            try:
                return json.loads(row['result_json'])
            except Exception:
                pass

    # 데모: 캐시 미스에서만 라이브 생성 — 24h 롤링 한도 초과 시 차단(비용 상한)
    if _is_demo(cu) and not _demo_ai_budget_ok():
        raise HTTPException(429,
            "데모 체험용 AI 분석 일일 한도에 도달했습니다 — 잠시 후 다시 시도하거나, "
            "회원가입 후 본인 포트폴리오로 무제한 이용해보세요.")

    usd_krw = 1380.0
    enriched = []
    total_krw = 0.0

    # metrics를 모든 종목 병렬로 계산 (최대 20 workers, 30s timeout)
    def _fetch_strategy_metric(h):
        tkr    = h.get('ticker', '')
        avg    = float(h.get('avg_price', 0))
        return tkr, _calc_metrics(tkr, avg)

    metrics_map = {}
    holdings_list = req.holdings
    with _cf.ThreadPoolExecutor(max_workers=min(len(holdings_list) or 1, 20)) as ex:
        futs = {ex.submit(_fetch_strategy_metric, h): h for h in holdings_list}
        for fut in _cf.as_completed(futs, timeout=30):
            try:
                tkr, m = fut.result(timeout=0)
                metrics_map[tkr] = m
            except Exception:
                pass

    for h in holdings_list:
        tkr    = h.get('ticker', '')
        qty    = float(h.get('quantity', 0))
        avg    = float(h.get('avg_price', 0))
        name   = h.get('name', tkr)
        sector = h.get('sector', '기타')
        acct   = h.get('account', '')
        is_us  = not re.match(r'^A?\d{6}$', tkr)
        cur    = float(req.prices.get(tkr, {}).get('current_price') or (h.get('manual_price') or 0) or avg)
        mul    = usd_krw if is_us else 1.0
        val    = qty * cur * mul
        pnl    = (cur - avg) / avg * 100 if avg > 0 else 0.0
        total_krw += val

        m = metrics_map.get(tkr, {'mdd': None, 'sharpe': None, 'return_pct': None})
        enriched.append({
            'ticker': tkr, 'name': name, 'sector': sector, 'account': acct,
            'quantity': qty, 'avg_price': avg, 'current_price': cur,
            'value_krw': round(val), 'pnl_pct': round(pnl, 1),
            'mdd': m['mdd'], 'sharpe': m['sharpe'], 'return_pct': m['return_pct'],
            'is_us': is_us,
        })

    # 프롬프트용 데이터 정제
    enriched.sort(key=lambda x: x['value_krw'], reverse=True)

    holding_lines = []
    for e in enriched:
        mdd_s    = f"MDD:{e['mdd']:.1f}%" if e['mdd'] is not None else "MDD:—"
        sharpe_s = f"샤프:{e['sharpe']:.2f}" if e['sharpe'] is not None else "샤프:—"
        holding_lines.append(
            f"  [{e['ticker']}] {e['name']} | 계좌:{e['account']} | 섹터:{e['sector']} | "
            f"비중:{e['value_krw']/total_krw*100:.1f}% | 수익률:{e['pnl_pct']:+.1f}% | "
            f"{mdd_s} | {sharpe_s}"
        )

    sector_map: dict = {}
    for e in enriched:
        sector_map[e['sector']] = sector_map.get(e['sector'], 0) + e['value_krw']
    sector_lines = [f"  {k}: {v/total_krw*100:.1f}%" for k, v in
                    sorted(sector_map.items(), key=lambda x: -x[1])]

    valid_m  = [e for e in enriched if e['return_pct'] is not None]
    avg_ret  = sum(e['return_pct'] for e in valid_m) / len(valid_m) if valid_m else 0
    avg_mdd  = sum(e['mdd'] for e in valid_m) / len(valid_m) if valid_m else 0
    avg_sh   = sum(e['sharpe'] for e in valid_m) / len(valid_m) if valid_m else 0

    # Life Timeline 입력 정제
    _accounts = sorted({e['account'] for e in enriched if e.get('account')})
    _acct_str = ', '.join(_accounts) if _accounts else '미지정'
    _yrs = req.years_to_retirement
    _yrs_eff = _yrs if (_yrs and _yrs > 0) else 15
    _yrs_str = f"{_yrs}년" if (_yrs and _yrs > 0) else "미입력(기본 15년 가정)"
    _inflow_str = (f"₩{req.monthly_inflow:,.0f}/월"
                   if (req.monthly_inflow and req.monthly_inflow > 0) else "미입력")

    prompt = f"""[역할] 당신은 월스트리트 출신 세계 최고 수준의 자산 배분가(Asset Allocator)이자 글로벌 매크로 분석가입니다. 보유 자산과 은퇴까지 남은 시간(Life Timeline)을 결합해 5년 단위 포괄적 자산배분(주식·채권·금·부동산/리츠·암호화폐·연금) 전략을 도출합니다. 명료하고 냉철한 전문 어조로 한국어로 작성하세요.

=== 입력 데이터 ===
- 총 평가 자산(Total_Capital): ₩{total_krw:,.0f}
- 은퇴까지 남은 시간(Years_To_Retirement): {_yrs_str}
- 운영 계좌(Account_Types): {_acct_str}
- 매월 추가 투입금(Monthly_Inflow): {_inflow_str}
- 종합 지표(1년): 평균 수익률 {avg_ret:+.1f}% | 평균 MDD {avg_mdd:.1f}% | 평균 샤프 {avg_sh:.2f}

=== 보유 종목 ===
{chr(10).join(holding_lines)}

=== 섹터 비중 ===
{chr(10).join(sector_lines)}

[작성 지침]
- [1] 종합 리스크 진단: 은퇴 잔여 시간 대비 현재 변동성(MDD)·섹터 쏠림이 유효한지, 절세 계좌(DC/ISA 등)의 혜택이 현재 종목 구성에 올바르게 활용되는지 세무/금융 관점으로 진단.
- [2] 5년 단위 자산배분: {_yrs_eff}년을 5년 단위 Phase로 나눠(예: 15년→3개, 10년→2개) 각 Phase의 자산 비중(%)·계좌별 운용·추가 유입금 투입 방향을 구체적으로 제시.
- [3] 월 배당 시뮬레이션: 전액을 월 배당형으로 대전환할 경우의 계좌별 추천 자산·비중·예상 월 현금흐름 + [월가의 경고](성장 기회비용 상실을 은퇴 타임라인과 비교해 날카롭게).
- [예외] 적자 마이크로캡/초소형 성장주는 5% 미만 또는 종목당 고정금액으로 리스크 격리 지시. 환율은 장기 복리 증식 관점.

다음 JSON만 응답하세요 (다른 텍스트 없이). 문자열 값 안에 큰따옴표(")를 절대 쓰지 말고 작은따옴표(')를 쓰세요.
{{
  "expert_review": "전문가 총평 — 포트폴리오 전반 진단·강약점 (3-4문장)",
  "risk_diagnosis": "[1] 종합 리스크 진단 — 타임라인 대비 변동성·섹터 쏠림 유효성 + 절세계좌(DC/ISA) 활용 진단 (5-7문장)",
  "allocation_phases": [
    {{"name": "단계명(예: 공격적 성장기)", "years": "1~5년차", "allocation": {{"주식": 60, "채권": 15, "금": 10, "리츠": 10, "암호화폐": 5}}, "account_strategy": "계좌별 운용 — 어떤 계좌(ISA/DC 등)에서 어떤 자산을 매집", "inflow_direction": "추가 유입금 최적 투입 방향"}}
  ],
  "dividend_simulation": {{
    "rows": [{{"account": "계좌", "asset": "추천 배당자산(ETF/리츠)", "weight": 30, "monthly_cashflow": "₩예상 월현금흐름"}}],
    "total_monthly": "₩총 예상 월 현금흐름",
    "warning": "[월가의 경고] 성장 기회비용(Capital Gain 상실)을 은퇴 타임라인과 비교한 날카로운 경고 (2-3문장)"
  }},
  "risk_factors": [{{"title": "리스크 제목", "detail": "구체적 설명 (1-2문장)"}}],
  "rebalancing": "구체적 리밸런싱 제안 — 확대/축소할 종목·섹터 명시 (3문장 이내)",
  "actions": [{{"priority": "HIGH", "action": "즉시 실행 (1문장)"}}, {{"priority": "MED", "action": "중기 (1문장)"}}, {{"priority": "LOW", "action": "장기 (1문장)"}}],
  "macro_view": "글로벌 매크로 환경과 이 포트폴리오 포지셔닝 평가 (2문장)",
  "edge_notes": "마이크로캡 격리·환율 등 예외 처리 코멘트 (해당 없으면 빈 문자열)"
}}

[규칙] allocation_phases 는 {_yrs_eff}년을 5년 단위로 나눈 개수만큼 생성하고, 각 Phase allocation 자산 비중의 합은 반드시 100이어야 한다."""

    try:
        text = _call_claude(api_key, "claude-sonnet-4-6", prompt, 7000, 150)
        try:
            result = _parse_claude_json(text)
        except Exception as pe:
            raise HTTPException(500, f"AI 비서가 잠시 자리를 비웠습니다 — 응답 파싱 오류: {str(pe)[:80]}")
        # 계산된 metrics 요약도 함께 반환
        result['_metrics_summary'] = {
            'avg_return': round(avg_ret, 1),
            'avg_mdd':    round(avg_mdd, 1),
            'avg_sharpe': round(avg_sh, 2),
            'total_krw':  round(total_krw),
            'stock_count': len(enriched),
        }
        _set_ai_cache(_cache_key, result)
        # SQLite에도 저장 — 서버 재시작 후에도 마지막 결과 미리보기 가능
        try:
            with _db() as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO strategy_cache(user_id, scope, fingerprint, result_json, computed_at) "
                    "VALUES (?,?,?,?,?)",
                    (cu['user_id'], req.scope, _fp, json.dumps(result, ensure_ascii=False), time())
                )
        except Exception:
            pass
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"AI 비서가 잠시 자리를 비웠습니다 — {str(e)[:100]}")


# ─── ETF 비교 도구 ────────────────────────────────────────────────────────

def _etf_info_us(ticker: str) -> dict:
    """미국 ETF 정보 — yfinance Ticker.info 기반."""
    import yfinance as yf
    out = {
        'ticker': ticker.upper(), 'market': 'US', 'name': ticker.upper(),
        'current_price': None, 'change_pct': None,
        'aum_usd': None, 'avg_volume': None, 'expense_ratio': None,
        'category': None, 'sector_focus': None,
        'top_holdings': [], 'ytd_return': None, 'three_year_return': None,
    }
    try:
        t = yf.Ticker(ticker.upper())
        info = t.info or {}
        out['name']        = info.get('longName') or info.get('shortName') or ticker.upper()
        out['current_price'] = info.get('regularMarketPrice') or info.get('previousClose')
        prev = info.get('regularMarketPreviousClose') or info.get('previousClose')
        if out['current_price'] and prev:
            out['change_pct'] = round((out['current_price'] - prev) / prev * 100, 2)
        out['aum_usd']      = info.get('totalAssets')
        out['avg_volume']   = info.get('averageVolume') or info.get('averageVolume10days')
        # yfinance는 ETF에 따라 ER을 0.0094(decimal=0.94%) 또는 0.94(percent=0.94%)로 반환.
        # ETF 보수율은 0.05% 미만이 거의 없으므로, 값 > 0.05면 percent 단위로 보고 정규화.
        er_raw = info.get('annualReportExpenseRatio') or info.get('netExpenseRatio')
        if er_raw is not None:
            er_norm = float(er_raw) / 100.0 if float(er_raw) > 0.05 else float(er_raw)
            out['expense_ratio'] = er_norm
        out['category']     = info.get('category')
        out['sector_focus'] = US_ETF_SECTOR.get(ticker.upper()) or info.get('category', '')
        out['ytd_return']   = info.get('ytdReturn')
        out['three_year_return'] = info.get('threeYearAverageReturn')
    except Exception:
        pass
    # top holdings — funds_data 시도 (yfinance 신규 API)
    try:
        t = yf.Ticker(ticker.upper())
        fd = t.funds_data
        if fd is not None:
            try:
                holdings = fd.top_holdings
                if holdings is not None and len(holdings) > 0:
                    rows = holdings.head(10).reset_index()
                    out['top_holdings'] = [
                        {
                            'symbol': str(r.get('Symbol') or r.iloc[0] if hasattr(r, 'iloc') else ''),
                            'name':   str(r.get('Name') or ''),
                            'weight': float(r.get('Holding Percent') or 0)
                        }
                        for _, r in rows.iterrows()
                    ]
            except Exception:
                pass
    except Exception:
        pass
    return out


def _etf_info_kr(ticker: str) -> dict:
    """한국 ETF 정보 — Naver Finance ETF 페이지 스크래핑."""
    code = kr_code(ticker)
    out = {
        'ticker': ticker, 'market': 'KR', 'name': '',
        'current_price': None, 'change_pct': None,
        'aum_krw': None, 'avg_volume': None, 'expense_ratio': None,
        'category': None, 'sector_focus': KR_ETF_SECTOR.get(ticker) or KR_ETF_SECTOR.get(code) or '',
        'top_holdings': [], 'ytd_return': None,
    }
    try:
        # 현재가/변동률
        p = _kr_price(ticker)
        if p:
            out['current_price'] = p.get('current_price')
            out['change_pct']    = p.get('change_pct')
        # 종목명 + AUM + 거래량 (Naver ETF 페이지)
        url = f'https://finance.naver.com/item/main.naver?code={code}'
        r = _session.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=6)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            name_el = soup.select_one('.wrap_company h2 a')
            if name_el:
                out['name'] = name_el.get_text(strip=True)
            # Naver 종목 페이지의 #_market_sum (시총) / 일별 거래량 정확 매칭
            for tr in soup.select('table.no_info tr'):
                for td in tr.find_all('td'):
                    # 시가총액
                    if td.find(id='_market_sum'):
                        try:
                            txt = td.find(id='_market_sum').get_text(' ', strip=True)
                            # "12조 3,456" 또는 "1,234" (억 단위)
                            jo_match = re.search(r'([\d,]+)\s*조', txt)
                            ok_match = re.search(r'([\d,]+)\s*$', txt)
                            jo  = int(jo_match.group(1).replace(',', '')) if jo_match else 0
                            ok  = int(ok_match.group(1).replace(',', '')) if ok_match else 0
                            aum = jo * 10_000_000_000_000 + ok * 100_000_000
                            if aum > 0:
                                out['aum_krw'] = aum
                        except Exception:
                            pass
                    # 거래량 (정확한 라벨 매칭)
                    label = td.get_text(' ', strip=True)
                    if label.startswith('거래량') and not label.startswith('거래대금'):
                        em = td.find('em')
                        if em:
                            try:
                                v = int(em.get_text(strip=True).replace(',', ''))
                                # 1억 주 이상은 비현실적 (한국 ETF 일일 거래량 상한)
                                if 0 < v < 100_000_000:
                                    out['avg_volume'] = v
                            except Exception:
                                pass
        # 보수율 — Naver ETF 별도 페이지
        try:
            r2 = _session.get(f'https://finance.naver.com/item/coinfo.naver?code={code}',
                              headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            if r2.status_code == 200:
                m = re.search(r'(\d+\.\d{2,4})\s*%?\s*</td>', r2.text)
                # 보수율은 보통 0.05~1% 범위
                if m:
                    val = float(m.group(1))
                    if 0 < val < 5:
                        out['expense_ratio'] = round(val / 100, 5)
        except Exception:
            pass
    except Exception:
        pass
    # yfinance fallback — KR ETF도 .KS/.KQ 접미사로 일부 메타데이터 제공
    if out['aum_krw'] is None or out['avg_volume'] is None or out['expense_ratio'] is None:
        try:
            import yfinance as yf
            for sfx in ('.KS', '.KQ'):
                try:
                    t = yf.Ticker(f"{code}{sfx}")
                    info = t.info or {}
                    if not info or not info.get('regularMarketPrice'):
                        continue
                    if out['aum_krw'] is None and info.get('totalAssets'):
                        out['aum_krw'] = int(info['totalAssets'])
                    if out['avg_volume'] is None:
                        v = info.get('averageVolume') or info.get('averageVolume10days')
                        if v and 0 < int(v) < 100_000_000:
                            out['avg_volume'] = int(v)
                    if out['expense_ratio'] is None:
                        er_raw = info.get('annualReportExpenseRatio') or info.get('netExpenseRatio')
                        if er_raw is not None:
                            er = float(er_raw) / 100.0 if float(er_raw) > 0.05 else float(er_raw)
                            out['expense_ratio'] = er
                    if not out['name'] or out['name'] == ticker:
                        out['name'] = info.get('longName') or info.get('shortName') or out['name']
                    if not out['category']:
                        out['category'] = info.get('category')
                    break
                except Exception:
                    continue
        except Exception:
            pass
    if not out['name']:
        out['name'] = ticker
    return out


def _etf_info(ticker: str) -> dict:
    return _etf_info_kr(ticker) if is_kr(ticker) else _etf_info_us(ticker)


@app.get("/api/etf/info")
def etf_info(ticker: str = ''):
    if not ticker:
        raise HTTPException(400, "ticker required")
    return _etf_info(ticker.strip())


@app.get("/api/etf/compare")
def etf_compare(tickers: str = ''):
    """ETF 2~4종 정보 일괄 조회. tickers는 쉼표 구분."""
    tlist = [t.strip() for t in tickers.split(',') if t.strip()]
    if not (2 <= len(tlist) <= 4):
        raise HTTPException(400, "2~4개의 티커가 필요합니다")
    results = []
    with _cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(_etf_info, t): t for t in tlist}
        for fut in _cf.as_completed(futs, timeout=25):
            try:
                results.append(fut.result(timeout=0))
            except Exception as e:
                results.append({'ticker': futs[fut], 'error': str(e)[:80]})
    # 원래 입력 순서 유지
    order = {t: i for i, t in enumerate(tlist)}
    results.sort(key=lambda x: order.get(x.get('ticker'), 99))
    return {'etfs': results}


class EtfCompareAiReq(BaseModel):
    etfs: list  # /api/etf/compare 결과의 etfs 그대로


@app.post("/api/etf/compare/ai")
def etf_compare_ai(req: EtfCompareAiReq, cu: dict = Depends(require_ai_enabled)):
    """ETF 비교 데이터를 기반으로 AI 투자 시사점 생성."""
    api_key = _stored_api_key()
    if not api_key:
        raise HTTPException(400, "관리 탭에서 Anthropic API Key를 먼저 입력해주세요")
    _log_event(cu['user_id'], 'ai_call', {
        'kind': 'etf_compare_ai',
        'tickers': [e.get('ticker') for e in (req.etfs or [])][:5]
    })
    _bump_ai_call(cu['user_id'])
    if not req.etfs or len(req.etfs) < 2:
        raise HTTPException(400, "비교할 ETF가 부족합니다")

    # ETF 데이터를 한국어로 정리
    lines = []
    for e in req.etfs:
        mkt = e.get('market', '?')
        nm  = e.get('name') or e.get('ticker')
        tkr = e.get('ticker', '')
        price = e.get('current_price')
        chg   = e.get('change_pct')
        aum   = e.get('aum_usd') or e.get('aum_krw')
        aum_str = ''
        if aum:
            if mkt == 'US':
                aum_str = f"AUM ${aum/1e9:.2f}B" if aum >= 1e9 else f"AUM ${aum/1e6:.0f}M"
            else:
                aum_str = f"AUM ₩{aum/1e8:.0f}억" if aum >= 1e8 else f"AUM ₩{aum:,}"
        vol = e.get('avg_volume')
        vol_str = f"평균거래량 {vol:,}주" if vol else ''
        er = e.get('expense_ratio')
        er_str = f"보수율 {er*100:.2f}%" if er else ''
        sector = e.get('sector_focus') or e.get('category') or ''
        holdings = e.get('top_holdings') or []
        hold_str = ''
        if holdings:
            top5 = holdings[:5]
            hold_str = ' / 상위보유: ' + ', '.join(
                f"{h.get('name') or h.get('symbol','')}({(h.get('weight') or 0)*100:.1f}%)"
                for h in top5
            )
        line = f"- [{mkt}] {nm} ({tkr})"
        parts = []
        if price: parts.append(f"현재가 {price}")
        if chg is not None: parts.append(f"({chg:+.2f}%)")
        if sector: parts.append(f"섹터: {sector}")
        if aum_str: parts.append(aum_str)
        if vol_str: parts.append(vol_str)
        if er_str: parts.append(er_str)
        if parts:
            line += ' · ' + ' · '.join(parts)
        line += hold_str
        lines.append(line)

    prompt = (
        "당신은 글로벌 ETF 시장 전문가입니다. 아래 한국·미국 ETF들을 비교 분석하여 "
        "투자 관점의 시사점을 한국어로 작성해주세요.\n\n"
        "=== 비교 대상 ETF ===\n"
        + "\n".join(lines)
        + "\n\n다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):\n"
        "{\n"
        '  "thesis": "비교 핵심 시사점 (2-3문장)",\n'
        '  "similarities": "공통점/유사 노출 (1-2문장, 동일/유사 섹터일 때 강조)",\n'
        '  "differences": "결정적 차이점 (담는 종목·보수율·유동성·시가총액 관점 1-3문장)",\n'
        '  "verdict": [\n'
        '    {"ticker": "...", "best_for": "이 ETF가 가장 적합한 투자 시나리오 (1문장)"},\n'
        '    {"ticker": "...", "best_for": "..."}\n'
        '  ],\n'
        '  "risk_note": "주의해야 할 공통 리스크 (1-2문장)"\n'
        "}"
    )
    try:
        text = _call_claude(api_key, "claude-haiku-4-5-20251001", prompt, 1500, 60)
        return _parse_claude_json(text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"AI 비교 분석 실패: {str(e)[:100]}")


# ─── 종목별 메모/투자노트 (P0-3) ─────────────────────────────────────
class NoteUpsertReq(BaseModel):
    note:      str = ''
    stop_loss: float | None = None
    target:    float | None = None

@app.get("/api/notes/{ticker}")
def get_note(ticker: str, cu: dict = Depends(require_approved)):
    """단일 종목의 메모 조회 — 없으면 빈 객체."""
    with _db() as conn:
        row = conn.execute(
            "SELECT note, stop_loss, target, updated_at FROM holding_notes WHERE user_id=? AND ticker=?",
            (cu['user_id'], ticker.upper())
        ).fetchone()
    if not row:
        return {'ticker': ticker.upper(), 'note': '', 'stop_loss': None, 'target': None, 'updated_at': 0}
    return {'ticker': ticker.upper(), **dict(row)}

@app.get("/api/notes")
def list_notes(cu: dict = Depends(require_approved)):
    """현재 사용자의 모든 메모 일괄 조회 (HoldingsTab에 메모 표시용)."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT ticker, note, stop_loss, target, updated_at FROM holding_notes WHERE user_id=?",
            (cu['user_id'],)
        ).fetchall()
    return {'notes': {r['ticker']: dict(r) for r in rows}}

@app.put("/api/notes/{ticker}")
def upsert_note(ticker: str, req: NoteUpsertReq, cu: dict = Depends(require_approved)):
    """메모/손절가/목표가 upsert. 모두 빈값이면 행 삭제."""
    tkr = ticker.upper()
    note = (req.note or '').strip()[:2000]
    if not note and req.stop_loss is None and req.target is None:
        # 전부 비어있으면 삭제
        with _db() as conn:
            conn.execute("DELETE FROM holding_notes WHERE user_id=? AND ticker=?",
                         (cu['user_id'], tkr))
        return {'ok': True, 'deleted': True}
    with _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO holding_notes(user_id, ticker, note, stop_loss, target, updated_at) "
            "VALUES (?,?,?,?,?,?)",
            (cu['user_id'], tkr, note, req.stop_loss, req.target, time())
        )
    return {'ok': True, 'ticker': tkr}

# ─── 거래내역 (P0-4) ──────────────────────────────────────────────────
class TransactionReq(BaseModel):
    account:   str
    ticker:    str
    name:      str = ''
    side:      str             # 'BUY' | 'SELL'
    quantity:  float
    price:     float
    fee:       float = 0
    tax:       float = 0
    traded_at: float | None = None   # epoch seconds; None이면 now
    memo:      str = ''

def _compute_holding_summary(rows: list) -> dict:
    """FIFO 매칭으로 현재 보유 수량·평균단가·실현손익 계산."""
    lots = []  # [{qty, price, fee}]  매수 lot 큐
    realized = 0.0
    total_fee = 0.0
    for r in rows:
        side = (r.get('side') or '').upper()
        qty = float(r.get('quantity') or 0)
        pr  = float(r.get('price') or 0)
        fee = float(r.get('fee') or 0)
        tax = float(r.get('tax') or 0)
        total_fee += fee + tax
        if side == 'BUY':
            lots.append({'qty': qty, 'price': pr, 'fee_per_share': fee / qty if qty else 0})
        else:  # SELL
            remain = qty
            sell_fees = (fee + tax)
            while remain > 0 and lots:
                lot = lots[0]
                take = min(remain, lot['qty'])
                # 실현손익 = (매도가 - 매수가) × take - 비례 fee
                realized += (pr - lot['price']) * take - lot['fee_per_share'] * take
                lot['qty'] -= take
                remain -= take
                if lot['qty'] <= 1e-9:
                    lots.pop(0)
            # 매도 수수료·세금은 실현손익에서 차감
            realized -= sell_fees
    cur_qty = sum(l['qty'] for l in lots)
    avg_cost = sum(l['qty'] * l['price'] for l in lots) / cur_qty if cur_qty > 0 else 0
    return {
        'current_quantity': round(cur_qty, 6),
        'avg_cost':         round(avg_cost, 4),
        'realized_pnl':     round(realized, 2),
        'total_fee':        round(total_fee, 2),
    }

def _sync_holding_from_tx(user_id: int, account: str, ticker: str, name: str = ''):
    """해당 계좌·종목의 거래내역을 FIFO로 재계산 → 보유(portfolios)에 반영.
    전량 매도(수량 0)면 보유에서 제거. 거래기록이 보유·비중·차트 등 전 탭에 연동되게 함."""
    ticker = str(ticker).upper()
    with _db() as conn:
        rows = conn.execute(
            "SELECT side, quantity, price, fee, tax FROM transactions "
            "WHERE user_id=? AND account=? AND UPPER(ticker)=? "
            "ORDER BY traded_at ASC, id ASC",
            (user_id, account, ticker)
        ).fetchall()
    s = _compute_holding_summary([dict(r) for r in rows])
    qty = s['current_quantity']
    ud = _load_user_data(user_id)
    holdings = ud['portfolios'].get(account, [])
    idx = next((i for i, x in enumerate(holdings)
                if str(x.get('ticker', '')).upper() == ticker), None)
    if qty <= 1e-9:
        if idx is not None:
            holdings.pop(idx)
            ud['portfolios'][account] = holdings
            _save_user_data(user_id, ud)
        return
    if idx is not None:
        holdings[idx]['quantity']  = qty
        holdings[idx]['avg_price'] = s['avg_cost']
        if name and not str(holdings[idx].get('name') or '').strip():
            holdings[idx]['name'] = name
    else:
        holdings.append({'ticker': ticker, 'name': name or ticker,
                         'quantity': qty, 'avg_price': s['avg_cost'], 'sector': ''})
    ud['portfolios'][account] = holdings
    _save_user_data(user_id, ud)

@app.get("/api/transactions")
def list_transactions(ticker: str = '', limit: int = 200, cu: dict = Depends(require_approved)):
    """거래내역 조회. ticker 지정 시 해당 종목만."""
    limit = min(max(limit, 1), 1000)
    with _db() as conn:
        if ticker:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE user_id=? AND ticker=? "
                "ORDER BY traded_at DESC, id DESC LIMIT ?",
                (cu['user_id'], ticker.upper(), limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE user_id=? "
                "ORDER BY traded_at DESC, id DESC LIMIT ?",
                (cu['user_id'], limit)
            ).fetchall()
    txs = [dict(r) for r in rows]
    # ticker 지정 시 요약 함께 제공 (시간순 정렬로 계산)
    summary = None
    if ticker and txs:
        chrono = sorted(txs, key=lambda x: (x['traded_at'], x['id']))
        summary = _compute_holding_summary(chrono)
    return {'transactions': txs, 'summary': summary}

@app.post("/api/transactions")
def add_transaction(req: TransactionReq, cu: dict = Depends(require_approved)):
    """거래내역 신규 추가."""
    side = (req.side or '').upper()
    if side not in ('BUY', 'SELL'):
        raise HTTPException(400, "side는 BUY 또는 SELL이어야 합니다")
    if req.quantity <= 0 or req.price <= 0:
        raise HTTPException(400, "수량/가격은 0보다 커야 합니다")
    valid = _user_account_keys(cu['user_id'])
    if not valid:
        _seed_default_accounts(cu['user_id'])
        valid = _user_account_keys(cu['user_id'])
    if req.account not in valid:
        raise HTTPException(400, f"존재하지 않는 계좌입니다: {req.account}")
    traded = req.traded_at or time()
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO transactions(user_id, account, ticker, name, side, quantity, price, "
            "fee, tax, traded_at, memo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (cu['user_id'], req.account, req.ticker.upper(), req.name,
             side, req.quantity, req.price, req.fee, req.tax, traded, req.memo, time())
        )
        new_id = cur.lastrowid
    # 거래 → 보유 동기화 (보유·비중·차트 전 탭 연동)
    try:
        _sync_holding_from_tx(cu['user_id'], req.account, req.ticker, req.name)
    except Exception:
        pass
    return {'ok': True, 'id': new_id}

@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int, cu: dict = Depends(require_approved)):
    with _db() as conn:
        row = conn.execute(
            "SELECT account, ticker, name FROM transactions WHERE id=? AND user_id=?",
            (tx_id, cu['user_id'])
        ).fetchone()
        cur = conn.execute(
            "DELETE FROM transactions WHERE id=? AND user_id=?",
            (tx_id, cu['user_id'])
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "거래내역을 찾을 수 없습니다")
    # 삭제 후 보유 재동기화
    if row:
        try:
            _sync_holding_from_tx(cu['user_id'], row['account'], row['ticker'], row['name'] or '')
        except Exception:
            pass
    return {'ok': True}

# ─── 백테스트 (P1-2) ──────────────────────────────────────────────────
class BacktestReq(BaseModel):
    holdings: list           # [{ticker, quantity, account?}, ...]  — 가상 보유
    months:   int = 12       # 1, 3, 6, 12, 24, 60
    rebalance: str = 'none'  # 'none' (보유 유지) — 향후 'monthly' 등 확장 가능

@app.post("/api/backtest")
def backtest(req: BacktestReq, cu: dict = Depends(require_approved)):
    """현재 보유 종목 구성으로 과거 N개월 시뮬레이션. 일별 포트폴리오 가치 곡선 반환."""
    months = max(1, min(req.months, 120))
    if not req.holdings:
        raise HTTPException(400, "보유 종목이 비어있습니다")

    # 종목별 일별 종가 시계열 fetch (병렬)
    import yfinance as yf
    import pandas as _pd
    import numpy as _np

    period_map = {1:'1mo', 3:'3mo', 6:'6mo', 12:'1y', 24:'2y', 36:'5y', 60:'5y', 120:'10y'}
    period = period_map.get(months, '2y' if months > 24 else '1y')

    def _fetch(h):
        tkr = h.get('ticker', '')
        qty = float(h.get('quantity', 0))
        if qty <= 0: return None
        # KR 종목은 .KS/.KQ 시도
        if re.match(r'^A?\d{6}$', tkr):
            code = re.sub(r'^A', '', tkr)
            for sfx in ('.KS', '.KQ'):
                try:
                    res = _yf_chart(f"{code}{sfx}", period, '1d')
                    if res:
                        q0 = res.get('indicators', {}).get('quote', [{}])[0]
                        ts = res.get('timestamp', [])
                        closes = q0.get('close') or []
                        pts = [(t, c) for t, c in zip(ts, closes) if c is not None]
                        if len(pts) > 5:
                            return {'ticker': tkr, 'quantity': qty, 'series': pts, 'is_us': False}
                except Exception:
                    pass
            return None
        # US
        try:
            res = _yf_chart(tkr.upper(), period, '1d')
            if res:
                q0 = res.get('indicators', {}).get('quote', [{}])[0]
                ts = res.get('timestamp', [])
                closes = q0.get('close') or []
                pts = [(t, c) for t, c in zip(ts, closes) if c is not None]
                if len(pts) > 5:
                    return {'ticker': tkr, 'quantity': qty, 'series': pts, 'is_us': True}
        except Exception:
            pass
        return None

    series_list = []
    with _cf.ThreadPoolExecutor(max_workers=min(len(req.holdings), 20)) as ex:
        futs = {ex.submit(_fetch, h): h for h in req.holdings}
        for fut in _cf.as_completed(futs, timeout=30):
            try:
                r = fut.result(timeout=0)
                if r: series_list.append(r)
            except Exception:
                pass
    if not series_list:
        raise HTTPException(404, "백테스트용 가격 데이터를 수집할 수 없습니다")

    usd_krw = 1380.0  # 단순 고정환율
    # 공통 timestamp 그리드 만들기 — 모든 series 합집합
    all_ts = sorted({t for s in series_list for t, _ in s['series']})
    if len(all_ts) < 5:
        raise HTTPException(500, "유효 가격 포인트가 부족합니다")

    # 각 종목별 forward-fill 한 dict (ts→price)
    def _ffill(pts, grid):
        d = dict(pts)
        out, last = [], None
        for t in grid:
            if t in d: last = d[t]
            out.append(last)
        return out

    pf_values = []  # 일별 KRW 평가액
    for ts in all_ts:
        v = 0.0
        for s in series_list:
            d = dict(s['series'])
            # 가장 가까운 과거 ts의 close 사용
            past = [c for t, c in s['series'] if t <= ts]
            if past:
                price = past[-1]
                mul = usd_krw if s['is_us'] else 1.0
                v += s['quantity'] * price * mul
        pf_values.append({'ts': ts, 'value': round(v)})

    # 시작/현재 비교
    start = pf_values[0]['value'] if pf_values else 0
    end   = pf_values[-1]['value'] if pf_values else 0
    return_pct = ((end - start) / start * 100) if start > 0 else 0
    # 최대 낙폭 (MDD)
    peak = 0
    mdd  = 0
    for p in pf_values:
        if p['value'] > peak: peak = p['value']
        if peak > 0:
            dd = (peak - p['value']) / peak * 100
            if dd > mdd: mdd = dd
    # 일별 수익률 시계열로 변동성 계산
    vals = [p['value'] for p in pf_values if p['value'] > 0]
    returns = []
    for i in range(1, len(vals)):
        if vals[i-1] > 0:
            returns.append((vals[i] - vals[i-1]) / vals[i-1])
    vol = (_np.std(returns) * (252 ** 0.5) * 100) if returns else 0
    # 샤프 (무위험률 4% 가정)
    avg_r = (_np.mean(returns) * 252) if returns else 0
    sharpe = (avg_r - 0.04) / (vol / 100) if vol > 0 else 0

    return {
        'series':       pf_values,
        'start_value':  start,
        'end_value':    end,
        'return_pct':   round(return_pct, 2),
        'mdd_pct':      round(mdd, 2),
        'volatility':   round(vol, 2),
        'sharpe':       round(sharpe, 2),
        'months':       months,
        'data_points':  len(pf_values),
        'tickers_used': [s['ticker'] for s in series_list],
    }


# ─── Net Worth 일별 스냅샷 (A1) ───────────────────────────────────────
# 매일 1회 자동 저장. /api/portfolio 호출 시 lazy 캡처 (별도 cron 불필요).
# 같은 날 다시 호출돼도 INSERT OR REPLACE 로 최신 값으로 갱신.

def _kst_today_str() -> str:
    """KST 기준 오늘 날짜 (YYYY-MM-DD). 서버 timezone 무관."""
    from datetime import timezone, timedelta
    kst = timezone(timedelta(hours=9))
    return datetime.now(kst).strftime('%Y-%m-%d')

def _capture_net_worth_snapshot(user_id: str, portfolio_dict: dict, prices: dict, usd_krw: float = 1380.0):
    """현재 portfolio dict + prices로 KRW 평가액 계산 후 SQLite 저장.
    portfolio_dict: {account_key: [holding, ...], ...}
    prices: {ticker: {current_price: ...}}
    같은 날짜는 덮어쓰기 — 하루 중 마지막 호출이 그 날의 값.
    """
    if not portfolio_dict:
        return
    today = _kst_today_str()
    breakdown = {}
    total = 0.0
    holdings_count = 0
    for acc, items in portfolio_dict.items():
        acc_val = 0.0
        for h in items or []:
            ticker = h.get('ticker', '')
            if not ticker:
                continue
            qty = float(h.get('quantity') or 0)
            avg = float(h.get('avg_price') or 0)
            cur = (prices or {}).get(ticker, {}).get('current_price') or (h.get('manual_price') or 0) or avg
            is_us = not is_kr(ticker)
            mul = usd_krw if is_us else 1.0
            v = qty * float(cur) * mul
            acc_val += v
            total += v
            holdings_count += 1
        if acc_val > 0:
            breakdown[acc] = round(acc_val)
    try:
        with _db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO net_worth_snapshots "
                "(user_id, snapshot_date, total_krw, holdings_count, breakdown, usd_krw, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (user_id, today, round(total), holdings_count,
                 json.dumps(breakdown, ensure_ascii=False), usd_krw, time())
            )
    except Exception:
        pass

class SnapshotCaptureReq(BaseModel):
    portfolios: dict = {}      # {account_key: [{ticker, quantity, avg_price}, ...], ...}
    prices:     dict = {}      # {ticker: {current_price: ...}, ...}
    usd_krw:    float = 1380.0

@app.post("/api/snapshots/capture")
def capture_snapshot(req: SnapshotCaptureReq, cu: dict = Depends(require_approved)):
    """현재 portfolio + prices로 오늘자 Net Worth 스냅샷 저장.
    같은 날 여러 번 호출돼도 INSERT OR REPLACE로 마지막 값 유지.
    프론트엔드가 portfolio+prices가 모두 로드된 후 1회 호출 (세션당 1회 제한 권장)."""
    _capture_net_worth_snapshot(cu['user_id'], req.portfolios, req.prices, req.usd_krw)
    with _db() as conn:
        row = conn.execute(
            "SELECT snapshot_date, total_krw FROM net_worth_snapshots "
            "WHERE user_id=? AND snapshot_date=?",
            (cu['user_id'], _kst_today_str())
        ).fetchone()
    return {'ok': True, 'snapshot': dict(row) if row else None}

@app.get("/api/snapshots/networth")
def get_networth_snapshots(days: int = 365, cu: dict = Depends(require_approved)):
    """Net Worth 일별 스냅샷 조회. 기본 1년치.
    days=0이면 전체."""
    if days < 0: days = 365
    days = min(days, 3650)
    with _db() as conn:
        if days == 0:
            rows = conn.execute(
                "SELECT snapshot_date, total_krw, holdings_count, breakdown, usd_krw "
                "FROM net_worth_snapshots WHERE user_id=? ORDER BY snapshot_date",
                (cu['user_id'],)
            ).fetchall()
        else:
            from datetime import timedelta as _td
            from datetime import timezone as _tz
            kst = _tz(_td(hours=9))
            since = (datetime.now(kst) - _td(days=days)).strftime('%Y-%m-%d')
            rows = conn.execute(
                "SELECT snapshot_date, total_krw, holdings_count, breakdown, usd_krw "
                "FROM net_worth_snapshots WHERE user_id=? AND snapshot_date >= ? "
                "ORDER BY snapshot_date",
                (cu['user_id'], since)
            ).fetchall()
    snapshots = []
    for r in rows:
        try:
            breakdown = json.loads(r['breakdown'])
        except Exception:
            breakdown = {}
        snapshots.append({
            'date':           r['snapshot_date'],
            'total_krw':      r['total_krw'],
            'holdings_count': r['holdings_count'],
            'breakdown':      breakdown,
            'usd_krw':        r['usd_krw'],
        })
    # 시작/끝/변동률 요약
    if len(snapshots) >= 2:
        start_v = snapshots[0]['total_krw']
        end_v   = snapshots[-1]['total_krw']
        change  = end_v - start_v
        change_pct = (change / start_v * 100) if start_v > 0 else 0
        # 최고/최저
        max_v = max(s['total_krw'] for s in snapshots)
        min_v = min(s['total_krw'] for s in snapshots)
        summary = {
            'start_value': start_v, 'end_value': end_v,
            'change':      change,  'change_pct': round(change_pct, 2),
            'max_value':   max_v,   'min_value':  min_v,
            'point_count': len(snapshots),
            'first_date':  snapshots[0]['date'],
            'last_date':   snapshots[-1]['date'],
        }
    else:
        summary = {'point_count': len(snapshots)}
    return {'snapshots': snapshots, 'summary': summary}


# ─── Portfolio Health Score (B1) ──────────────────────────────────────
# 100점 만점 종합 점수 — 4개 하위 지표 가중 평균.
# AI 호출 없음, 보유 종목 + 가격 + 1년 일봉만으로 계산.

class HealthScoreReq(BaseModel):
    holdings: list = []                # [{ticker, quantity, avg_price, account, sector}, ...]
    prices:   dict = {}
    usd_krw:  float = 1380.0

@app.post("/api/portfolio/health")
def portfolio_health(req: HealthScoreReq, cu: dict = Depends(require_approved)):
    """4개 하위 지표 → 0~100 종합 점수.
    1) 분산도 (종목 수 + Herfindahl 지수)
    2) 섹터 집중도 (단일 섹터 최대 비중)
    3) 변동성 (평균 1년 일별 표준편차)
    4) 손실 회복력 (평균 MDD)
    """
    if not req.holdings:
        raise HTTPException(400, "보유 종목이 없습니다")

    # 1) 가치·비중 계산
    enriched = []
    total = 0.0
    sector_map = {}
    for h in req.holdings:
        tkr = h.get('ticker', '')
        qty = float(h.get('quantity') or 0)
        avg = float(h.get('avg_price') or 0)
        sec = h.get('sector') or '기타'
        is_us = not is_kr(tkr)
        cur = (req.prices or {}).get(tkr, {}).get('current_price') or avg
        mul = req.usd_krw if is_us else 1.0
        val = qty * float(cur) * mul
        if val > 0:
            enriched.append({'ticker': tkr, 'val': val, 'sector': sec, 'avg_price': avg})
            total += val
            sector_map[sec] = sector_map.get(sec, 0) + val

    if total <= 0:
        raise HTTPException(400, "평가액이 0입니다")

    # ─── 1. 분산도 (Diversification Score) ───
    # 종목 수: 1종 0점, 5종 60점, 10종 80점, 20종+ 100점 (대수적)
    n = len(enriched)
    if n <= 1:    n_score = 0
    elif n <= 3:  n_score = 25 + (n - 1) * 15
    elif n <= 10: n_score = 55 + (n - 3) * 5
    elif n <= 20: n_score = 90 + (n - 10) * 1
    else:         n_score = 100

    # Herfindahl 지수: 종목 비중 제곱의 합 (0~1, 낮을수록 분산)
    hhi = sum((e['val'] / total) ** 2 for e in enriched)
    # hhi=1 (1종 집중) → 0점, hhi=0.05 (20종 균등) → 100점
    hhi_score = max(0, min(100, (1 - hhi) / (1 - 0.05) * 100))

    diversification = round(n_score * 0.5 + hhi_score * 0.5)

    # ─── 2. 섹터 집중도 (낮을수록 좋음) ───
    max_sector_pct = max((v / total * 100 for v in sector_map.values()), default=100)
    # 단일 섹터 80%+ → 0점, 40% → 50점, 20% → 100점
    if max_sector_pct >= 80:    sector_score = 0
    elif max_sector_pct >= 60:  sector_score = (80 - max_sector_pct) / 20 * 25
    elif max_sector_pct >= 40:  sector_score = 25 + (60 - max_sector_pct) / 20 * 25
    elif max_sector_pct >= 20:  sector_score = 50 + (40 - max_sector_pct) / 20 * 50
    else:                       sector_score = 100
    sector_score = round(sector_score)

    # ─── 3. 변동성 & 4. MDD ───
    # 종목별 metrics 병렬 계산 (이미 있는 _calc_metrics 재사용)
    metrics_map = {}
    def _fetch_m(e):
        try:
            return e['ticker'], _calc_metrics(e['ticker'], e['avg_price'])
        except Exception:
            return e['ticker'], None
    with _cf.ThreadPoolExecutor(max_workers=min(len(enriched), 20)) as ex:
        futs = [ex.submit(_fetch_m, e) for e in enriched]
        for fut in _cf.as_completed(futs, timeout=30):
            try:
                t, m = fut.result(timeout=0)
                if m: metrics_map[t] = m
            except Exception:
                pass

    # 변동성: 평균 MDD ~ -1로 normalize (값이 클수록 변동 큼)
    valid_mdds = [m['mdd'] for m in metrics_map.values() if m.get('mdd') is not None]
    avg_mdd = sum(valid_mdds) / len(valid_mdds) if valid_mdds else 0
    # mdd 0% → 100점, 50%+ → 0점
    mdd_score = round(max(0, min(100, 100 - avg_mdd * 2)))

    # 손실 회복력: 평균 샤프 (1 이상 100점, 0 → 50점, -1 이하 0점)
    valid_sharpes = [m['sharpe'] for m in metrics_map.values() if m.get('sharpe') is not None]
    avg_sharpe = sum(valid_sharpes) / len(valid_sharpes) if valid_sharpes else 0
    sharpe_score = round(max(0, min(100, (avg_sharpe + 1) / 2 * 100)))

    # ─── 종합 점수 (가중) ───
    overall = round(
        diversification * 0.30
      + sector_score    * 0.25
      + mdd_score       * 0.25
      + sharpe_score    * 0.20
    )

    # 등급 (S/A/B/C/D)
    grade = ('S', '#16A34A') if overall >= 85 \
       else ('A', '#22C55E') if overall >= 70 \
       else ('B', '#F59E0B') if overall >= 55 \
       else ('C', '#F97316') if overall >= 40 \
       else ('D', '#DC2626')

    # 코멘트 (가장 낮은 점수 항목 기준)
    sub_scores = {
        '분산도':       diversification,
        '섹터 집중도':  sector_score,
        '변동성 관리':  mdd_score,
        '위험조정 수익': sharpe_score,
    }
    weakest = min(sub_scores.items(), key=lambda x: x[1])
    comment = {
        '분산도':       f"{n}종목 보유 — 더 다양화하면 위험이 줄어듭니다",
        '섹터 집중도':  f"단일 섹터 비중 {max_sector_pct:.0f}% — 분산 권장",
        '변동성 관리':  f"평균 MDD -{avg_mdd:.1f}% — 변동성 큰 종목 비중 조정 검토",
        '위험조정 수익': f"평균 샤프 {avg_sharpe:.2f} — 위험 대비 수익률 개선 필요",
    }[weakest[0]] if weakest[1] < 60 else "전반적으로 균형 잡힌 포트폴리오입니다"

    return {
        'overall':       overall,
        'grade':         grade[0],
        'grade_color':   grade[1],
        'sub_scores':    sub_scores,
        'stats': {
            'holdings_count':  n,
            'max_sector_pct':  round(max_sector_pct, 1),
            'avg_mdd':         round(avg_mdd, 2),
            'avg_sharpe':      round(avg_sharpe, 2),
            'hhi':             round(hhi, 4),
        },
        'weakest':       weakest[0],
        'comment':       comment,
    }


# ─── 룰 기반 리밸런싱 경고 (B3) ────────────────────────────────────────
# AI 호출 없이 룰만으로 위험·집중·이탈을 자동 감지.

class AlertsReq(BaseModel):
    holdings:        list = []
    prices:          dict = {}
    usd_krw:         float = 1380.0
    target_max_ticker_pct: float = 30.0   # 단일 종목 최대 %
    target_max_sector_pct: float = 50.0   # 단일 섹터 최대 %
    target_max_loss_pct:   float = -20.0  # 단일 종목 손실 임계 (예: -20%)


def _compute_rebalance_alerts(holdings: list, prices: dict, usd_krw: float,
                              max_ticker: float, max_sector: float, max_loss: float) -> list:
    """룰 기반 경고 리스트 반환. AI 호출 없음."""
    alerts = []
    if not holdings:
        return alerts

    # 1) 가치 계산
    enriched = []
    total = 0.0
    sector_map = {}
    for h in holdings:
        tkr = h.get('ticker', '')
        qty = float(h.get('quantity') or 0)
        avg = float(h.get('avg_price') or 0)
        sec = h.get('sector') or '기타'
        if qty <= 0:
            continue
        is_us = not is_kr(tkr)
        cur = (prices or {}).get(tkr, {}).get('current_price') or avg
        mul = usd_krw if is_us else 1.0
        val = qty * float(cur) * mul
        cost = qty * avg * mul
        pnl_pct = ((float(cur) - avg) / avg * 100) if avg > 0 else 0
        enriched.append({
            'ticker': tkr, 'name': h.get('name') or tkr, 'sector': sec,
            'val': val, 'cost': cost, 'pnl_pct': pnl_pct,
            'avg_price': avg, 'current_price': float(cur),
        })
        total += val
        sector_map[sec] = sector_map.get(sec, 0) + val

    if total <= 0:
        return alerts

    # 2-1) 단일 종목 과집중
    for e in enriched:
        pct = e['val'] / total * 100
        if pct > max_ticker:
            severity = 'critical' if pct > max_ticker * 1.5 else 'high'
            alerts.append({
                'rule':     'ticker_concentration',
                'severity': severity,
                'title':    f"{e['name']} 비중 {pct:.1f}% — 과집중",
                'detail':   f"단일 종목 권장 한도 {max_ticker:.0f}%를 초과합니다. "
                           f"일부 정리 또는 다른 종목 확대를 검토하세요.",
                'ticker':   e['ticker'],
                'value':    round(pct, 1),
                'threshold': max_ticker,
            })

    # 2-2) 단일 섹터 과집중
    for sec, v in sector_map.items():
        pct = v / total * 100
        if pct > max_sector:
            severity = 'critical' if pct > max_sector * 1.4 else 'high'
            alerts.append({
                'rule':     'sector_concentration',
                'severity': severity,
                'title':    f"섹터 「{sec}」 {pct:.1f}% — 분산 필요",
                'detail':   f"단일 섹터 권장 한도 {max_sector:.0f}%를 초과합니다. "
                           f"다른 섹터로 분산 투자를 권장합니다.",
                'sector':   sec,
                'value':    round(pct, 1),
                'threshold': max_sector,
            })

    # 2-3) 큰 손실 종목 (-X% 이하)
    for e in enriched:
        if e['pnl_pct'] <= max_loss:
            severity = 'critical' if e['pnl_pct'] <= max_loss * 1.5 else 'med'
            alerts.append({
                'rule':     'large_loss',
                'severity': severity,
                'title':    f"{e['name']} {e['pnl_pct']:.1f}% — 큰 손실",
                'detail':   f"평균단가 대비 {abs(e['pnl_pct']):.1f}% 손실. "
                           f"손절/추가매수/관망 중 전략 점검이 필요합니다.",
                'ticker':   e['ticker'],
                'value':    round(e['pnl_pct'], 1),
                'threshold': max_loss,
            })

    # 2-4) 중복 익스포저 — 동일 섹터 ETF + 개별 종목 모두 보유
    sector_etfs = {
        'AI & 빅테크': ['QQQ', 'QQQM', 'XLK'],
        'AI':         ['QQQ', 'QQQM', 'XLK', 'SOXX', 'SMH'],
        '반도체':      ['SOXX', 'SMH'],
        '헬스케어':    ['XLV'],
        '금융':       ['XLF'],
        '에너지':     ['XLE'],
        '소비재':     ['XLY', 'XLP'],
    }
    by_sector = {}
    for e in enriched:
        by_sector.setdefault(e['sector'], []).append(e)
    for sec, lst in by_sector.items():
        if sec not in sector_etfs: continue
        etfs_in = [e['ticker'] for e in lst if e['ticker'] in sector_etfs[sec]]
        non_etf_holds = [e for e in lst if e['ticker'] not in sector_etfs[sec]]
        if etfs_in and len(non_etf_holds) >= 2:
            overlaps = sorted(
                [{'ticker': e['ticker'], 'name': e['name'],
                  'value': round(e['val'] / total * 100, 1)} for e in non_etf_holds],
                key=lambda x: -x['value'])
            alerts.append({
                'rule':     'overlap_exposure',
                'severity': 'med',
                'title':    f"섹터 「{sec}」 중복 노출",
                'detail':   f"{', '.join(etfs_in)} ETF 와 개별 종목 {len(non_etf_holds)}개 동시 보유. "
                           f"이미 ETF에 포함된 종목이라면 비중 중복 가능 — 점검 권장.",
                'sector':   sec,
                'etfs':     etfs_in,
                'overlaps': overlaps,   # [{ticker,name,value(비중%)}] — 프론트 표시용
            })

    # 2-5) 종목 수 1-2개만 보유 (극단적 미분산)
    if len(enriched) <= 2:
        alerts.append({
            'rule':     'too_few_holdings',
            'severity': 'high',
            'title':    f"보유 종목 {len(enriched)}개 — 극단적 미분산",
            'detail':   "분산 효과를 위해 최소 5종목 이상 보유를 권장합니다.",
            'value':    len(enriched),
            'threshold': 5,
        })

    # severity 정렬
    sev_order = {'critical': 0, 'high': 1, 'med': 2, 'low': 3}
    alerts.sort(key=lambda a: (sev_order.get(a['severity'], 9),
                                -(a.get('value') or 0)))
    return alerts


@app.post("/api/portfolio/alerts")
def portfolio_alerts(req: AlertsReq, cu: dict = Depends(require_approved)):
    """현재 보유 구성을 룰 엔진으로 검사. AI 호출 없음."""
    alerts = _compute_rebalance_alerts(
        req.holdings, req.prices, req.usd_krw,
        req.target_max_ticker_pct, req.target_max_sector_pct, req.target_max_loss_pct
    )
    summary = {
        'total':     len(alerts),
        'critical':  sum(1 for a in alerts if a['severity'] == 'critical'),
        'high':      sum(1 for a in alerts if a['severity'] == 'high'),
        'med':       sum(1 for a in alerts if a['severity'] == 'med'),
    }
    return {'alerts': alerts, 'summary': summary,
            'thresholds': {
                'ticker_max': req.target_max_ticker_pct,
                'sector_max': req.target_max_sector_pct,
                'loss_max':   req.target_max_loss_pct,
            }}


# ─── 종목별 P/L 일별 스냅샷 (E안-A2) ──────────────────────────────────
class PnLSnapshotReq(BaseModel):
    portfolios: dict = {}
    prices:     dict = {}
    usd_krw:    float = 1380.0

def _capture_pnl_snapshot(user_id: str, portfolios: dict, prices: dict, usd_krw: float = 1380.0):
    """종목별 P/L을 일별로 저장. 같은 날 INSERT OR REPLACE."""
    if not portfolios: return
    today = _kst_today_str()
    rows = []
    for acc, items in portfolios.items():
        for h in items or []:
            tkr = h.get('ticker', '')
            if not tkr: continue
            qty = float(h.get('quantity') or 0)
            avg = float(h.get('avg_price') or 0)
            cur_raw = (prices or {}).get(tkr, {}).get('current_price') or avg
            cur = float(cur_raw)
            is_us = not is_kr(tkr)
            mul = usd_krw if is_us else 1.0
            value = qty * cur * mul
            cost  = qty * avg * mul
            pnl   = value - cost
            pnl_pct = ((cur - avg) / avg * 100) if avg > 0 else 0
            rows.append((user_id, today, tkr, qty, avg, cur,
                         round(value), round(pnl), round(pnl_pct, 4), time()))
    if not rows: return
    try:
        with _db() as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO holding_pnl_snapshots "
                "(user_id, snapshot_date, ticker, quantity, avg_price, current_price, "
                " value_krw, pnl_krw, pnl_pct, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                rows
            )
    except Exception:
        pass

@app.post("/api/snapshots/pnl/capture")
def capture_pnl_snapshot(req: PnLSnapshotReq, cu: dict = Depends(require_approved)):
    _capture_pnl_snapshot(cu['user_id'], req.portfolios, req.prices, req.usd_krw)
    return {'ok': True}

@app.get("/api/snapshots/pnl/{ticker}")
def get_pnl_history(ticker: str, days: int = 365, cu: dict = Depends(require_approved)):
    """특정 종목의 P/L 추이 (일별)."""
    days = max(1, min(days, 3650))
    from datetime import timedelta as _td, timezone as _tz
    kst = _tz(_td(hours=9))
    since = (datetime.now(kst) - _td(days=days)).strftime('%Y-%m-%d')
    with _db() as conn:
        rows = conn.execute(
            "SELECT snapshot_date, quantity, avg_price, current_price, "
            "value_krw, pnl_krw, pnl_pct "
            "FROM holding_pnl_snapshots WHERE user_id=? AND ticker=? AND snapshot_date >= ? "
            "ORDER BY snapshot_date",
            (cu['user_id'], ticker.upper(), since)
        ).fetchall()
    return {'ticker': ticker.upper(), 'history': [dict(r) for r in rows]}

# ─── 관심종목 그룹 (C안-C1) ───────────────────────────────────────────
class WatchlistGroupReq(BaseModel):
    ticker:     str
    group_name: str = '기본'

@app.put("/api/watchlist/{ticker}/group")
def update_watchlist_group(ticker: str, req: WatchlistGroupReq,
                            cu: dict = Depends(require_approved)):
    """관심종목의 그룹 이름 변경."""
    group = (req.group_name or '기본').strip()[:30]
    with _db() as conn:
        cur = conn.execute(
            "UPDATE watchlist SET group_name=? WHERE user_id=? AND ticker=?",
            (group, cu['user_id'], ticker.upper())
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "관심 종목이 없습니다")
    return {'ok': True}

@app.get("/api/watchlist/groups")
def list_watchlist_groups(cu: dict = Depends(require_approved)):
    """사용자의 관심종목 그룹 목록 + 각 그룹당 종목 수."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT group_name, COUNT(*) AS cnt FROM watchlist "
            "WHERE user_id=? GROUP BY group_name ORDER BY group_name",
            (cu['user_id'],)
        ).fetchall()
    return {'groups': [{'name': r['group_name'], 'count': r['cnt']} for r in rows]}

# ─── 종목 간 상관관계 매트릭스 (B안-B2) ──────────────────────────────
class CorrelationReq(BaseModel):
    holdings: list = []
    period:   str = '1y'   # '3mo' | '6mo' | '1y' | '2y'

@app.post("/api/portfolio/correlation")
def portfolio_correlation(req: CorrelationReq, cu: dict = Depends(require_approved)):
    """보유 종목 간 1년 일별 종가 기준 Pearson 상관계수 매트릭스."""
    import numpy as _np
    if not req.holdings:
        raise HTTPException(400, "보유 종목이 없습니다")
    period = req.period if req.period in ('3mo','6mo','1y','2y') else '1y'

    # 종목별 일별 종가 fetch (병렬)
    def _fetch(h):
        tkr = h.get('ticker', '')
        if not tkr: return None
        if re.match(r'^A?\d{6}$', tkr):
            code = re.sub(r'^A', '', tkr)
            for sfx in ('.KS', '.KQ'):
                try:
                    res = _yf_chart(f"{code}{sfx}", period, '1d')
                    if res:
                        q0 = (res.get('indicators', {}).get('quote', [{}]) or [{}])[0]
                        ts = res.get('timestamp', [])
                        closes = q0.get('close') or []
                        pts = {t: c for t, c in zip(ts, closes) if c is not None}
                        if len(pts) >= 20: return (tkr, pts)
                except Exception: pass
            return None
        try:
            res = _yf_chart(tkr.upper(), period, '1d')
            if res:
                q0 = (res.get('indicators', {}).get('quote', [{}]) or [{}])[0]
                ts = res.get('timestamp', [])
                closes = q0.get('close') or []
                pts = {t: c for t, c in zip(ts, closes) if c is not None}
                if len(pts) >= 20: return (tkr, pts)
        except Exception: pass
        return None

    series = {}
    with _cf.ThreadPoolExecutor(max_workers=min(len(req.holdings), 20)) as ex:
        futs = [ex.submit(_fetch, h) for h in req.holdings]
        for fut in _cf.as_completed(futs, timeout=30):
            try:
                r = fut.result(timeout=0)
                if r: series[r[0]] = r[1]
            except Exception: pass

    if len(series) < 2:
        raise HTTPException(404, "상관관계 계산을 위해 가격 데이터가 부족합니다 (2종목 이상 필요)")

    # KR/US 혼합 시 공통 timestamp가 거의 0이므로, 합집합 + forward-fill 사용
    all_ts = sorted(set().union(*[set(s.keys()) for s in series.values()]))
    if len(all_ts) < 20:
        raise HTTPException(404, f"거래일이 부족합니다 ({len(all_ts)}일)")

    tickers = list(series.keys())
    # 각 종목 forward-fill 가격 시계열 (없는 날짜는 직전 가격 유지)
    ffilled = {}
    for t in tickers:
        d = series[t]
        out, last = [], None
        for ts in all_ts:
            if ts in d:
                last = d[ts]
            out.append(last)
        ffilled[t] = out

    # 모든 종목이 첫 가격을 갖기 시작한 시점부터 사용 (앞쪽 None 제거)
    first_valid = max(
        next((i for i, v in enumerate(ffilled[t]) if v is not None), len(all_ts))
        for t in tickers
    )
    if len(all_ts) - first_valid < 20:
        raise HTTPException(404, f"공통 거래일이 부족합니다 ({len(all_ts) - first_valid}일)")

    # 각 종목 일별 수익률 (first_valid 이후만)
    returns = {}
    for t in tickers:
        prices = ffilled[t][first_valid:]
        rets = []
        for i in range(1, len(prices)):
            if prices[i-1] and prices[i-1] > 0:
                rets.append((prices[i] - prices[i-1]) / prices[i-1])
            else:
                rets.append(0)
        returns[t] = rets
    common_ts = all_ts[first_valid:]

    # numpy 상관계수
    matrix = _np.corrcoef([returns[t] for t in tickers])
    corr_rows = []
    for i, ta in enumerate(tickers):
        row = []
        for j, tb in enumerate(tickers):
            v = float(matrix[i][j])
            if _np.isnan(v): v = 0
            row.append(round(v, 3))
        corr_rows.append({'ticker': ta, 'values': row})

    # 평균 상관계수 (자기 자신 1.0 제외)
    n = len(tickers)
    off_diag_sum = sum(matrix[i][j] for i in range(n) for j in range(n) if i != j)
    avg_corr = off_diag_sum / (n * (n - 1)) if n > 1 else 0

    return {
        'tickers':    tickers,
        'matrix':     corr_rows,
        'data_points': len(common_ts),
        'period':     period,
        'avg_correlation': round(float(avg_corr), 3),
        'interpretation':
            '높은 분산 효과' if avg_corr < 0.3 else
            '보통 분산' if avg_corr < 0.6 else
            '낮은 분산 (대부분 같이 움직임)',
    }

# ─── 실적 캘린더 (B안-B4) ────────────────────────────────────────────
# 참고 유니버스 — S&P500 상위 ~50 + Nasdaq100 상위 ~50 (시총 상위 근사, 중복 제거)
# 실적 캘린더 유니버스 — 시총 상위: 나스닥 30 + S&P500 30 + KOSPI 30 (2026 기준 큐레이션)
_NASDAQ_TOP30 = [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','AVGO','TSLA','COST','NFLX',
    'ADBE','AMD','PEP','CSCO','TMUS','INTC','QCOM','INTU','TXN','AMGN',
    'ISRG','AMAT','BKNG','HON','VRTX','ADP','MU','LRCX','REGN','PANW',
]
_SP500_TOP30 = [
    'AAPL','MSFT','NVDA','AMZN','GOOGL','META','BRK-B','LLY','AVGO','TSLA',
    'JPM','WMT','V','UNH','XOM','MA','JNJ','PG','HD','COST',
    'ORCL','ABBV','MRK','CVX','AMD','KO','PEP','BAC','NFLX','ADBE',
]
_KOSPI_TOP30 = [
    '005930','000660','373220','207940','005380','000270','068270','105560',
    '035420','012330','028260','005490','055550','035720','051910','006400',
    '086790','000810','015760','033780','096770','003670','017670','316140',
    '011200','259960','010130','009150','011070','032830',
]
# 캘린더 과밀 완화 — 각 지수 상위 20만 반영 (아이콘 너무 작아지는 문제)
_EARNINGS_REF_TICKERS = sorted(set(_NASDAQ_TOP30[:20] + _SP500_TOP30[:20] + _KOSPI_TOP30[:20]))
# KOSPI 상위 20 코드 → 한글명 (캘린더 툴팁용 — 사용자 보유 외 유니버스 종목명)
_KOSPI_NAMES = {
    '005930': '삼성전자', '000660': 'SK하이닉스', '373220': 'LG에너지솔루션',
    '207940': '삼성바이오로직스', '005380': '현대차', '000270': '기아',
    '068270': '셀트리온', '105560': 'KB금융', '035420': 'NAVER', '012330': '현대모비스',
    '028260': '삼성물산', '005490': 'POSCO홀딩스', '055550': '신한지주', '035720': '카카오',
    '051910': 'LG화학', '006400': '삼성SDI', '086790': '하나금융지주', '000810': '삼성화재',
    '015760': '한국전력', '033780': 'KT&G',
}
_earnings_cache: Dict[str, tuple] = {}   # ticker -> (fetched_ts, [events])
_EARNINGS_TTL = 43200  # 12h — 실적일은 자주 안 바뀜

class EarningsReq(BaseModel):
    tickers: list = []
    days_ahead: int = 90

@app.post("/api/earnings/calendar")
def earnings_calendar(req: EarningsReq, cu: dict = Depends(require_approved)):
    """보유·관심 + 참고 유니버스(나스닥30·S&P500 30·KOSPI30)의 실적 발표일 일괄 조회.
    보유종목이 없어도 참고 유니버스는 항상 표시한다."""
    import yfinance as yf
    from datetime import timedelta as _td
    days_ahead = max(1, min(req.days_ahead, 365))
    cutoff = datetime.now() + _td(days=days_ahead)

    now = datetime.now()
    win_lo = now - _td(days=45)   # 이번 달 '과거' 발표일도 표시 (예: 지난주 NVDA 발표)

    def _fetch(tkr):
        tkr = str(tkr).upper()
        is_kr = bool(re.match(r'^A?\d{6}$', tkr))
        nowt = time()
        c = _earnings_cache.get(tkr)
        if c and nowt - c[0] < _EARNINGS_TTL:
            return c[1]
        out = []
        try:
            if is_kr:
                # KR: .KS(KOSPI) → .KQ(KOSDAQ) 순으로 earnings 시도 (있는 종목만 표시)
                code = tkr.lstrip('A')
                ed = None
                for _sfx in ('.KS', '.KQ'):
                    try:
                        _cand = yf.Ticker(code + _sfx).earnings_dates
                        if _cand is not None and not _cand.empty:
                            ed = _cand; break
                    except Exception:
                        continue
            else:
                ed = yf.Ticker(tkr).earnings_dates   # DataFrame, index=date
            if ed is not None and not ed.empty:
                for ts_idx in ed.index:
                    try:
                        ts = ts_idx.to_pydatetime().replace(tzinfo=None)
                    except Exception:
                        continue
                    if win_lo <= ts <= cutoff:
                        row = ed.loc[ts_idx]
                        nm = _KOSPI_NAMES.get(tkr.lstrip('A')) if is_kr else tkr
                        out.append({
                            'ticker': tkr,
                            'name':   nm,            # KR은 한글명(유니버스), US는 티커
                            'date':   ts.strftime('%Y-%m-%d'),
                            'eps_estimate': float(row.get('EPS Estimate')) if row.get('EPS Estimate') == row.get('EPS Estimate') else None,
                            'eps_actual':   float(row.get('Reported EPS')) if row.get('Reported EPS') == row.get('Reported EPS') else None,
                        })
        except Exception:
            pass
        _earnings_cache[tkr] = (nowt, out)
        return out

    # 보유·관심 + 참고 유니버스(S&P500·Nasdaq100 상위) 병합
    held = {str(t).upper() for t in req.tickers}
    all_tickers = sorted(held | set(_EARNINGS_REF_TICKERS))

    events = []
    # with 블록 금지(느린 스레드 대기 → 먹통) → 수동 executor + 비대기 shutdown.
    ex = _cf.ThreadPoolExecutor(max_workers=min(len(all_tickers), 24))
    try:
        futs = [ex.submit(_fetch, t) for t in all_tickers]
        for fut in _cf.as_completed(futs, timeout=22):
            try:
                r = fut.result(timeout=0)
                if r: events.extend(r)
            except Exception: pass
    except Exception:
        pass  # TimeoutError 등 — 모인 결과만 (캐시 워밍 후 다음 호출은 빠름)
    finally:
        ex.shutdown(wait=False, cancel_futures=True)
    for e in events:
        e['held'] = e['ticker'] in held
    events.sort(key=lambda x: x['date'])
    return {'events': events, 'tickers_checked': len(all_tickers)}

# ─── 차트 비교 모드 (B안-B5) — 가격 시계열 일괄 ────────────────────
class CompareSeriesReq(BaseModel):
    tickers: list = []
    period:  str = '1y'   # '1mo'|'3mo'|'6mo'|'1y'|'2y'|'5y'

@app.post("/api/compare/series")
def compare_series(req: CompareSeriesReq, cu: dict = Depends(require_approved)):
    """2~6종목의 일별 종가 시계열 (정규화는 프론트에서)."""
    if not (2 <= len(req.tickers) <= 6):
        raise HTTPException(400, "2~6개 종목이 필요합니다")
    period = req.period if req.period in ('1mo','3mo','6mo','1y','2y','5y') else '1y'

    def _fetch(tkr):
        try:
            if re.match(r'^A?\d{6}$', tkr):
                code = re.sub(r'^A', '', tkr)
                for sfx in ('.KS', '.KQ'):
                    try:
                        res = _yf_chart(f"{code}{sfx}", period, '1d')
                        if res:
                            q0 = (res.get('indicators', {}).get('quote', [{}]) or [{}])[0]
                            ts = res.get('timestamp', [])
                            closes = q0.get('close') or []
                            pts = [(t, c) for t, c in zip(ts, closes) if c is not None]
                            if len(pts) > 5:
                                return {'ticker': tkr, 'series': pts}
                    except Exception: pass
                return None
            res = _yf_chart(tkr.upper(), period, '1d')
            if res:
                q0 = (res.get('indicators', {}).get('quote', [{}]) or [{}])[0]
                ts = res.get('timestamp', [])
                closes = q0.get('close') or []
                pts = [(t, c) for t, c in zip(ts, closes) if c is not None]
                if len(pts) > 5:
                    return {'ticker': tkr.upper(), 'series': pts}
        except Exception: pass
        return None

    results = []
    with _cf.ThreadPoolExecutor(max_workers=len(req.tickers)) as ex:
        futs = [ex.submit(_fetch, t) for t in req.tickers]
        for fut in _cf.as_completed(futs, timeout=20):
            try:
                r = fut.result(timeout=0)
                if r: results.append(r)
            except Exception: pass
    # 원래 순서 유지
    order = {t: i for i, t in enumerate(req.tickers)}
    results.sort(key=lambda x: order.get(x['ticker'], 99))
    return {'series': results, 'period': period}


# ─── 배당금 이력 & 캘린더 ─────────────────────────────────────────
class DividendsReq(BaseModel):
    holdings: list = []          # [{ticker, quantity, name, account}]
    months_back: int = 12
    usd_krw:    float = 1380.0

_dividends_cache: dict = {}      # cache_key -> (epoch, data)
_DIVIDENDS_TTL = 12 * 3600       # 12h — 배당은 자주 안 바뀜

def _fetch_dividends_single(tkr: str, months_back: int):
    cache_key = f"{tkr}:{months_back}"
    now = time()
    if cache_key in _dividends_cache:
        ts, data = _dividends_cache[cache_key]
        if now - ts < _DIVIDENDS_TTL:
            return data
    try:
        import yfinance as yf
        from datetime import timedelta as _td
        is_kr = bool(re.match(r'^A?\d{6}$', tkr))
        t = None
        if is_kr:
            code = re.sub(r'^A', '', tkr)
            for sfx in ('.KS', '.KQ'):
                try:
                    cand = yf.Ticker(f"{code}{sfx}")
                    d = cand.dividends
                    if d is not None and len(d) > 0:
                        t = cand
                        break
                except Exception: continue
            if t is None:
                t = yf.Ticker(f"{code}.KS")
        else:
            t = yf.Ticker(tkr.upper())

        divs = None
        try: divs = t.dividends
        except Exception: divs = None

        info = {}
        try: info = t.info or {}
        except Exception: info = {}

        past = []
        if divs is not None and len(divs) > 0:
            cutoff = datetime.now() - _td(days=months_back * 31)
            for ts_idx, amount in divs.items():
                try:
                    dt = ts_idx.to_pydatetime().replace(tzinfo=None)
                except Exception: continue
                if dt >= cutoff:
                    past.append({
                        'date': dt.strftime('%Y-%m-%d'),
                        'per_share': float(amount),
                    })
            past.sort(key=lambda x: x['date'])

        # 연간 예상 배당률 — info → 없으면 최근 12개월 합으로 추정
        annual_rate = float(info.get('dividendRate') or 0)
        if not annual_rate and past:
            ytd_cutoff = (datetime.now() - _td(days=365)).strftime('%Y-%m-%d')
            annual_rate = sum(p['per_share'] for p in past if p['date'] >= ytd_cutoff)

        # dividendYield 정규화 (yfinance는 fraction or percentage 혼재)
        dy_raw = float(info.get('dividendYield') or 0)
        div_yield = dy_raw if dy_raw > 1 else dy_raw * 100

        ex_date = None
        try:
            cal = t.calendar
            if isinstance(cal, dict):
                ex = cal.get('Ex-Dividend Date')
                if ex: ex_date = str(ex)[:10]
        except Exception: pass

        data = {
            'ticker': tkr, 'past': past,
            'annual_rate_per_share': round(annual_rate, 4),
            'dividend_yield_pct':    round(div_yield, 2),
            'ex_date': ex_date,
            'is_kr':   is_kr,
        }
        _dividends_cache[cache_key] = (now, data)
        return data
    except Exception:
        return None


@app.post("/api/portfolio/dividends")
def portfolio_dividends(req: DividendsReq, cu: dict = Depends(require_approved)):
    """보유 종목 배당 이력 + 연간 예상 배당 + 다가오는 ex-date."""
    if not req.holdings:
        return {'events': [], 'upcoming': [], 'annual_estimate_krw': 0,
                'ttm_received_krw': 0, 'by_ticker': {}, 'tickers_checked': 0}

    by_ticker, events, upcoming = {}, [], []
    annual_total = 0.0
    ttm_total    = 0.0

    valid = [h for h in req.holdings if h.get('ticker') and float(h.get('quantity') or 0) > 0]
    if not valid:
        return {'events': [], 'upcoming': [], 'annual_estimate_krw': 0,
                'ttm_received_krw': 0, 'by_ticker': {}, 'tickers_checked': 0}

    with _cf.ThreadPoolExecutor(max_workers=min(len(valid), 15)) as ex:
        futs = {ex.submit(_fetch_dividends_single, h['ticker'], req.months_back): h
                for h in valid}
        for fut in _cf.as_completed(futs, timeout=35):
            h = futs[fut]
            try: d = fut.result(timeout=0)
            except Exception: d = None
            if not d: continue

            tkr = h['ticker']
            qty = float(h.get('quantity') or 0)
            mul = 1.0 if d['is_kr'] else req.usd_krw
            name = h.get('name') or tkr

            annual_est   = d['annual_rate_per_share'] * qty * mul
            ttm_per_sh   = sum(p['per_share'] for p in d['past'])
            ttm_received = ttm_per_sh * qty * mul

            by_ticker[tkr] = {
                'name':                 name,
                'annual_estimate_krw':  round(annual_est, 0),
                'ttm_received_krw':     round(ttm_received, 0),
                'dividend_yield_pct':   d['dividend_yield_pct'],
                'per_share_annual':     d['annual_rate_per_share'],
                'past_count':           len(d['past']),
                'ex_date':              d['ex_date'],
            }
            for p in d['past']:
                events.append({
                    'ticker': tkr, 'name': name,
                    'date': p['date'], 'per_share': p['per_share'],
                    'total_krw': round(p['per_share'] * qty * mul, 0),
                })
            if d['ex_date']:
                est_q = annual_est / 4 if annual_est else 0
                upcoming.append({
                    'ticker': tkr, 'name': name,
                    'ex_date': d['ex_date'],
                    'est_total_krw': round(est_q, 0),
                })

            annual_total += annual_est
            ttm_total    += ttm_received

    events.sort(key=lambda x: x['date'], reverse=True)
    upcoming.sort(key=lambda x: x['ex_date'])

    return {
        'events':              events[:50],     # 최근 50건만
        'upcoming':            upcoming[:20],
        'annual_estimate_krw': round(annual_total, 0),
        'ttm_received_krw':    round(ttm_total, 0),
        'by_ticker':           by_ticker,
        'tickers_checked':     len(valid),
    }


# ─── 가격 알림 (Price Alerts) ──────────────────────────────────────
class AlertUpsertReq(BaseModel):
    ticker:      str
    name:        str = ''
    target_high: float | None = None
    target_low:  float | None = None
    enabled:     bool = True

@app.get("/api/alerts")
def list_alerts(cu: dict = Depends(require_approved)):
    """사용자 가격 알림 목록."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, ticker, name, target_high, target_low, enabled, "
            "       triggered_at, created_at "
            "FROM price_alerts WHERE user_id=? ORDER BY ticker ASC",
            (cu['user_id'],)
        ).fetchall()
    return {'alerts': [dict(r) for r in rows]}

@app.post("/api/alerts")
def upsert_alert(req: AlertUpsertReq, cu: dict = Depends(require_approved)):
    """티커별 알림 한 건 추가 or 갱신 (1 user × 1 ticker)."""
    if not req.ticker:
        raise HTTPException(400, "ticker required")
    if req.target_high is None and req.target_low is None:
        raise HTTPException(400, "target_high 또는 target_low 중 하나는 필요")
    now = time()
    with _db() as conn:
        existing = conn.execute(
            "SELECT id FROM price_alerts WHERE user_id=? AND ticker=?",
            (cu['user_id'], req.ticker)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE price_alerts SET name=?, target_high=?, target_low=?, "
                "       enabled=?, triggered_at=NULL "
                "WHERE id=?",
                (req.name or req.ticker, req.target_high, req.target_low,
                 1 if req.enabled else 0, existing['id'])
            )
            return {'ok': True, 'id': existing['id'], 'updated': True}
        cur = conn.execute(
            "INSERT INTO price_alerts (user_id, ticker, name, target_high, "
            "                          target_low, enabled, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (cu['user_id'], req.ticker, req.name or req.ticker,
             req.target_high, req.target_low,
             1 if req.enabled else 0, now)
        )
        return {'ok': True, 'id': cur.lastrowid, 'created': True}

@app.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: int, cu: dict = Depends(require_approved)):
    with _db() as conn:
        conn.execute("DELETE FROM price_alerts WHERE id=? AND user_id=?",
                     (alert_id, cu['user_id']))
    return {'ok': True}

@app.get("/api/notifications")
def list_notifications(unread_only: bool = False,
                       limit: int = 50,
                       cu: dict = Depends(require_approved)):
    """알림 목록 (최신순). unread_only=true면 미확인만."""
    with _db() as conn:
        q = ("SELECT id, ticker, name, kind, target_price, current_price, "
             "       message, created_at, read_at "
             "FROM notifications WHERE user_id=?")
        params = [cu['user_id']]
        if unread_only:
            q += " AND read_at IS NULL"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(max(1, min(limit, 200)))
        rows = conn.execute(q, params).fetchall()
        unread_count = conn.execute(
            "SELECT COUNT(*) AS n FROM notifications "
            "WHERE user_id=? AND read_at IS NULL", (cu['user_id'],)
        ).fetchone()['n']
    return {'notifications': [dict(r) for r in rows],
            'unread_count': unread_count}

@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, cu: dict = Depends(require_approved)):
    with _db() as conn:
        conn.execute(
            "UPDATE notifications SET read_at=? "
            "WHERE id=? AND user_id=? AND read_at IS NULL",
            (time(), notif_id, cu['user_id'])
        )
    return {'ok': True}

@app.post("/api/notifications/read_all")
def mark_all_notifications_read(cu: dict = Depends(require_approved)):
    now = time()
    with _db() as conn:
        cur = conn.execute(
            "UPDATE notifications SET read_at=? "
            "WHERE user_id=? AND read_at IS NULL", (now, cu['user_id'])
        )
        cnt = cur.rowcount
    return {'ok': True, 'marked': cnt}


# ─── 신규 종목 발굴 스캔 cron + 조회 endpoint ──────────────────────────
class DiscoverScanReq(BaseModel):
    cron_secret: str = ''   # TriggerReq와 동일 형태지만, 정의 순서 의존 회피 위해 별도 선언

_discover_scan_busy = {'v': False}   # 동시 스캔 방지 (cron·관리자 수동 겹침 차단)

def _store_discovery_rows(conn, rows: list, now: float):
    """스코어된 행(개별종목·ETF 공용)을 discovery_scores + history에 저장."""
    snap_date = strftime('%Y-%m-%d', gmtime(now + 9 * 3600))
    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO discovery_scores ("
            "ticker, market, name, sector, peg, rel_per, eps_growth, rev_growth, "
            "roe, debt_to_equity, near_52w_high, analyst_upside, pct_value, pct_growth, "
            "pct_quality, pct_momentum, pct_sentiment, composite_score, gate_pass, "
            "gate_fail_reason, data_completeness, computed_at, "
            "current_price, target_price, trailing_pe, forward_pe, profit_margin, "
            "exchange, quote_type, expense_ratio, aum, ret_6m) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (r['ticker'], r['market'], r.get('name', ''), r.get('sector', ''),
             r.get('peg'), r.get('rel_per'), r.get('eps_growth'), r.get('rev_growth'),
             r.get('roe'), r.get('debt_to_equity'), r.get('near_52w_high'),
             r.get('analyst_upside'), r.get('pct_value'), r.get('pct_growth'),
             r.get('pct_quality'), r.get('pct_momentum'), r.get('pct_sentiment'),
             r.get('composite_score', 0), r.get('gate_pass', 0),
             r.get('gate_fail_reason', ''), r.get('data_completeness', 0), now,
             r.get('current_price'), r.get('target_price'), r.get('trailing_pe'),
             r.get('forward_pe'), r.get('profit_margin'),
             r.get('exchange', ''), r.get('quote_type', ''),
             r.get('expense_ratio'), r.get('aum'), r.get('ret_6m')))
        conn.execute(
            "INSERT OR REPLACE INTO discovery_history "
            "(snapshot_date, ticker, market, sector, composite_score, gate_pass) "
            "VALUES (?,?,?,?,?,?)",
            (snap_date, r['ticker'], r['market'], r.get('sector', ''),
             r.get('composite_score', 0), r.get('gate_pass', 0)))


def _do_discover_scan() -> dict:
    """개별종목(GARP) + ETF(전용 모델) 스캔 → discovery_scores 저장. (cron·관리자 공용)
    Oracle 1GB RAM(MemoryMax 850M) — 동시성 2 제한(4는 OOM-kill 확인). 종목당 예외 흡수."""
    _discover_scan_busy['v'] = True
    try:
        t0 = time()
        # 1) 개별종목 (GARP)
        universe = _discovery_universe()
        rows: list = []
        def _fetch(item):
            m = _discovery_raw_metrics(item['ticker'], item['market'])
            m.update({'ticker': item['ticker'], 'name': item['name'],
                      'market': item['market'], 'sector': item['sector']})
            return m
        with _cf.ThreadPoolExecutor(max_workers=2) as ex:
            for m in ex.map(_fetch, universe):
                rows.append(m)
        scored = _garp_score(rows)

        # 2) ETF (추세·저비용·규모 전용 모델)
        etf_uni = _discovery_etf_universe()
        etf_rows: list = []
        def _fetch_etf(item):
            m = _discovery_etf_metrics(item['ticker'], item['market'])
            m.update({'ticker': item['ticker'], 'name': item['name'],
                      'market': item['market'], 'sector': item['sector']})
            return m
        with _cf.ThreadPoolExecutor(max_workers=2) as ex:
            for m in ex.map(_fetch_etf, etf_uni):
                etf_rows.append(m)
        etf_scored = _etf_score(etf_rows)

        now = time()
        with _db() as conn:
            _store_discovery_rows(conn, scored, now)
            _store_discovery_rows(conn, etf_scored, now)
            # 고아 행 제거: 이번 스캔에서 갱신 안 된(universe에서 빠진/상폐된) 티커 삭제.
            # 안 하면 제거된 티커(예: PXD)가 옛 gate_pass=1로 영구 잔존해 추천에 노출됨.
            conn.execute("DELETE FROM discovery_scores WHERE computed_at < ?", (now - 1,))

        return {'scanned': len(universe) + len(etf_uni), 'stocks': len(scored),
                'etfs': len(etf_scored),
                'gate_passed': sum(1 for r in scored + etf_scored if r.get('gate_pass')),
                'elapsed_s': round(time() - t0, 1)}
    finally:
        _discover_scan_busy['v'] = False


@app.post("/api/cron/discover_scan")
def cron_discover_scan(req: DiscoverScanReq):
    """일배치(공용). cron_secret 검증(check_alerts와 동일). 결과는 사용자 무관 공용 캐시."""
    secret = ''
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key='cron_secret'").fetchone()
        if row: secret = row['value']
    if not secret:
        secret = secrets.token_hex(24)
        with _db() as conn:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                         ('cron_secret', secret))
        return {'error': 'cron_secret 초기화. 다시 호출 필요.', 'set': True}
    if req.cron_secret != secret:
        raise HTTPException(403, "invalid cron secret")
    return _do_discover_scan()


@app.post("/api/discover/rescan")
def discover_rescan(cu: dict = Depends(require_approved)):
    """관리자 수동 갱신 — 백그라운드 스레드로 스캔(UI 안 막힘). 즉시 상태 반환."""
    if not cu.get('is_admin'):
        raise HTTPException(403, "관리자만 갱신할 수 있습니다.")
    if _discover_scan_busy['v']:
        return {'status': 'already_running'}
    import threading
    threading.Thread(target=_do_discover_scan, daemon=True).start()
    return {'status': 'started'}


@app.get("/api/discover")
def get_discover(market: str = 'ALL', min_score: float = 0, sort: str = 'score',
                 limit: int = 50, offset: int = 0, include_failed: bool = False,
                 qtype: str = 'stock'):
    """발굴 랭킹 조회 — discovery_scores read only. 무인증 공용 데이터(데모·비로그인 열람).
    qtype: 'stock'(개별종목, 기본) | 'etf' | 'all'. gate_pass=1 우선, composite desc 기본."""
    where = ["composite_score >= ?"]
    params: list = [min_score]
    if market in ('US', 'KR'):
        where.append("market = ?"); params.append(market)
    if qtype == 'etf':
        where.append("quote_type = 'ETF'")
    elif qtype == 'stock':
        where.append("quote_type != 'ETF'")
    if not include_failed:
        where.append("gate_pass = 1")
    order = {'score': 'composite_score DESC',
             'completeness': 'data_completeness DESC, composite_score DESC',
             'roe': 'roe DESC'}.get(sort, 'composite_score DESC')
    sql = ("SELECT * FROM discovery_scores WHERE " + " AND ".join(where) +
           f" ORDER BY gate_pass DESC, {order} LIMIT ? OFFSET ?")
    params += [max(1, min(limit, 200)), max(0, offset)]
    with _db() as conn:
        rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        cnt_row = conn.execute(
            "SELECT COUNT(*) c, MAX(computed_at) mx FROM discovery_scores "
            "WHERE " + " AND ".join(where), params[:len(params) - 2]).fetchone()
    return {'items': rows, 'total': cnt_row['c'] if cnt_row else 0,
            'computed_at': cnt_row['mx'] if cnt_row else None}


# ─── Web Push (V2) — VAPID + 구독 + 발송 ───────────────────────────
# 인앱 알림(V1, notifications 테이블)에 더해 브라우저가 닫혀 있어도 도달하는 푸시.
# VAPID 키는 최초 호출 시 1회 생성해 settings에 저장(cron_secret 패턴과 동일).
PUSH_VAPID_SUB = 'mailto:rising.yu@gmail.com'   # VAPID claims sub (연락처)

def _get_vapid() -> tuple[str, str]:
    """(private_pem, public_app_server_key_b64url) 반환. 없으면 생성·저장."""
    with _db() as conn:
        rows = {r['key']: r['value'] for r in conn.execute(
            "SELECT key, value FROM settings WHERE key IN ('vapid_private','vapid_public')"
        ).fetchall()}
    priv, pub = rows.get('vapid_private'), rows.get('vapid_public')
    if priv and pub:
        return priv, pub
    # 최초 1회 생성 (cryptography는 pywebpush 의존성으로 항상 존재)
    import base64
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    pk = ec.generate_private_key(ec.SECP256R1())
    priv = pk.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()).decode()
    raw_pub = pk.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint)
    pub = base64.urlsafe_b64encode(raw_pub).rstrip(b'=').decode()
    with _db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                     ('vapid_private', priv))
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                     ('vapid_public', pub))
    return priv, pub

def _send_push(user_id: str, title: str, body: str, url: str = '/') -> int:
    """user_id의 모든 구독에 푸시 발송. 만료 구독(404/410)은 정리. 발송 성공 수 반환.
    실패해도 호출부(알림 INSERT 등)에 영향 없도록 전부 격리."""
    try:
        from pywebpush import webpush, WebPushException
    except Exception:
        return 0
    try:
        priv, _ = _get_vapid()
    except Exception:
        return 0
    with _db() as conn:
        subs = conn.execute(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?",
            (user_id,)
        ).fetchall()
    if not subs:
        return 0
    payload = json.dumps({'title': title, 'body': body, 'url': url})
    sent, dead = 0, []
    for s in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': s['endpoint'],
                    'keys': {'p256dh': s['p256dh'], 'auth': s['auth']},
                },
                data=payload,
                vapid_private_key=priv,
                vapid_claims={'sub': PUSH_VAPID_SUB},  # 매 호출 새 dict (라이브러리가 변형)
                timeout=10,
            )
            sent += 1
        except WebPushException as e:
            code = getattr(getattr(e, 'response', None), 'status_code', None)
            if code in (404, 410):       # 만료/해지된 구독
                dead.append(s['endpoint'])
        except Exception:
            pass
    if dead:
        with _db() as conn:
            conn.executemany("DELETE FROM push_subscriptions WHERE endpoint=?",
                             [(e,) for e in dead])
    return sent

@app.get("/api/push/public_key")
def push_public_key(cu: dict = Depends(require_approved)):
    _, pub = _get_vapid()
    return {'key': pub}

class PushSubReq(BaseModel):
    endpoint: str
    keys: Dict[str, str] = {}

@app.post("/api/push/subscribe")
def push_subscribe(req: PushSubReq, cu: dict = Depends(require_approved)):
    p256dh, auth = req.keys.get('p256dh'), req.keys.get('auth')
    if not req.endpoint or not p256dh or not auth:
        raise HTTPException(400, "invalid subscription")
    with _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO push_subscriptions "
            "(endpoint, user_id, p256dh, auth, created_at) VALUES (?,?,?,?,?)",
            (req.endpoint, cu['user_id'], p256dh, auth, time())
        )
    return {'ok': True}

class PushUnsubReq(BaseModel):
    endpoint: str

@app.post("/api/push/unsubscribe")
def push_unsubscribe(req: PushUnsubReq, cu: dict = Depends(require_approved)):
    with _db() as conn:
        conn.execute("DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?",
                     (req.endpoint, cu['user_id']))
    return {'ok': True}

@app.post("/api/push/test")
def push_test(cu: dict = Depends(require_approved)):
    """본인에게 테스트 푸시 1건 — 구독/발송 동작 검증용."""
    sent = _send_push(cu['user_id'], '다온 알림 테스트',
                      '푸시 알림이 정상 동작합니다. 🎉', '/')
    return {'ok': True, 'sent': sent}


# ─── 목표 기반 포트폴리오 (Goal-Based Investing) ───────────────────
# MVP: 결정론 모델(Kasten 2013 — 동일 입력이면 몬테카를로와 고도 상관).
# 위험=변동성이 아니라 '목표 시점 미달 가능성'. ⚠️ 추정치·투자자문 아님(프론트 고지).
def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def _current_net_worth_krw(uid: str) -> float:
    """현재 총 자산(KRW). 최신 Net Worth 스냅샷 우선(자산추이와 일치), 없으면 라이브 계산."""
    with _db() as conn:
        row = conn.execute(
            "SELECT total_krw FROM net_worth_snapshots WHERE user_id=? "
            "ORDER BY snapshot_date DESC LIMIT 1", (uid,)
        ).fetchone()
    if row and row['total_krw']:
        return float(row['total_krw'])
    with _db() as conn:
        rows = conn.execute(
            "SELECT ticker, avg_price, quantity FROM portfolios WHERE user_id=?", (uid,)
        ).fetchall()
    usd_krw, total = 1380.0, 0.0
    for h in rows:
        qty = float(h['quantity'] or 0); avg = float(h['avg_price'] or 0)
        if qty <= 0:
            continue
        is_us = not is_kr(h['ticker'])
        p = (_price_fast(h['ticker']) if is_us else _kr_price(h['ticker'])) or {}
        cur = float(p.get('current_price') or avg)
        total += qty * cur * (usd_krw if is_us else 1.0)
    return total

def _months_until(date_str: str) -> int:
    try:
        parts = [int(x) for x in str(date_str).split('-')[:2]]
        now = datetime.now()
        return max(1, (parts[0] - now.year) * 12 + (parts[1] - now.month))
    except Exception:
        return 1

def _project_goal(current_value: float, monthly: float, months: int,
                  annual_return: float, annual_vol: float, target: float) -> dict:
    """결정론 월별 중앙값 경로 + 80% 밴드(lognormal 포락) + 상태 + 달성확률 추정."""
    months = max(1, int(months))
    r = (1.0 + annual_return) ** (1.0 / 12.0) - 1.0
    sigma = max(0.0, annual_vol)
    path, median_final = [], current_value
    # 긴 horizon이면 다운샘플(차트 점 과다 방지) — 최대 ~120점
    step = max(1, months // 120)
    for t in range(1, months + 1):
        if abs(r) < 1e-12:
            med = current_value + monthly * t
        else:
            med = current_value * (1.0 + r) ** t + monthly * (((1.0 + r) ** t - 1.0) / r)
        median_final = med
        if t % step == 0 or t == months:
            env = math.exp(1.2816 * sigma * math.sqrt(t / 12.0))   # 80%(10/90 백분위)
            path.append({'month': t, 'median': round(med),
                         'low': round(med / env), 'high': round(med * env)})
    T = months / 12.0
    sigT = sigma * math.sqrt(T) if T > 0 else sigma
    prob = None
    if median_final > 0 and target > 0:
        if sigT > 1e-9:
            prob = _norm_cdf((math.log(median_final) - math.log(target)) / sigT)
        else:
            prob = 1.0 if median_final >= target else 0.0
    status = ('on_track' if median_final >= target
              else 'at_risk' if median_final >= target * 0.9
              else 'off_track')
    return {
        'months': months,
        'current_value': round(current_value),
        'median_final': round(median_final),
        'target': round(target),
        'shortfall': round(target - median_final),   # 양수=부족
        'probability': round(prob, 3) if prob is not None else None,
        'status': status,
        'path': path,
    }

class GoalReq(BaseModel):
    id: int | None = None
    name: str = '목표'
    target_amount: float
    target_date: str                       # 'YYYY-MM-DD'
    monthly_contribution: float = 0
    expected_return: float = 0.06
    volatility: float = 0.15

class GoalProjectReq(BaseModel):
    target_amount: float
    target_date: str
    monthly_contribution: float = 0
    expected_return: float = 0.06
    volatility: float = 0.15

@app.get("/api/goals")
def list_goals(cu: dict = Depends(require_approved)):
    cur_val = _current_net_worth_krw(cu['user_id'])
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, name, target_amount, target_date, monthly_contribution, "
            "expected_return, volatility, created_at FROM goals WHERE user_id=? "
            "ORDER BY created_at DESC", (cu['user_id'],)
        ).fetchall()
    goals = []
    for r in rows:
        g = dict(r)
        g['projection'] = _project_goal(
            cur_val, g['monthly_contribution'], _months_until(g['target_date']),
            g['expected_return'], g['volatility'], g['target_amount'])
        goals.append(g)
    return {'goals': goals, 'current_value': round(cur_val)}

@app.post("/api/goals")
def upsert_goal(req: GoalReq, cu: dict = Depends(require_approved)):
    if req.target_amount <= 0:
        raise HTTPException(400, "목표 금액이 필요합니다")
    if not req.target_date:
        raise HTTPException(400, "목표 시점이 필요합니다")
    now = time()
    with _db() as conn:
        if req.id:
            conn.execute(
                "UPDATE goals SET name=?, target_amount=?, target_date=?, "
                "monthly_contribution=?, expected_return=?, volatility=? "
                "WHERE id=? AND user_id=?",
                (req.name, req.target_amount, req.target_date, req.monthly_contribution,
                 req.expected_return, req.volatility, req.id, cu['user_id']))
            return {'ok': True, 'id': req.id, 'updated': True}
        cur = conn.execute(
            "INSERT INTO goals (user_id, name, target_amount, target_date, "
            "monthly_contribution, expected_return, volatility, created_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (cu['user_id'], req.name, req.target_amount, req.target_date,
             req.monthly_contribution, req.expected_return, req.volatility, now))
        return {'ok': True, 'id': cur.lastrowid, 'created': True}

@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: int, cu: dict = Depends(require_approved)):
    with _db() as conn:
        conn.execute("DELETE FROM goals WHERE id=? AND user_id=?",
                     (goal_id, cu['user_id']))
    return {'ok': True}

@app.post("/api/goals/project")
def project_goal_preview(req: GoalProjectReq, cu: dict = Depends(require_approved)):
    """저장 전 실시간 미리보기. 현재 Net Worth는 서버 계산."""
    cur_val = _current_net_worth_krw(cu['user_id'])
    return {'current_value': round(cur_val),
            'projection': _project_goal(
                cur_val, req.monthly_contribution, _months_until(req.target_date),
                req.expected_return, req.volatility, req.target_amount)}


# ─── 알림 트리거 cron (모든 활성 알림 가격 체크) ────────────────────
class TriggerReq(BaseModel):
    cron_secret: str = ''

@app.post("/api/cron/check_alerts")
def cron_check_alerts(req: TriggerReq):
    """서버 cron이 5~10분 간격으로 호출. 모든 user × 활성 alert × 현재가 비교 → 트리거.
    cron_secret은 settings에서 검증."""
    secret = ''
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key='cron_secret'"
        ).fetchone()
        if row: secret = row['value']
    if not secret:
        # 최초 호출 시 자동 생성
        secret = secrets.token_hex(24)
        with _db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)",
                ('cron_secret', secret)
            )
        return {'error': 'cron_secret 초기화. 다시 호출 필요.', 'set': True}
    if req.cron_secret != secret:
        raise HTTPException(403, "invalid cron secret")

    now = time()
    cutoff = now - 24 * 3600   # 24h 안에 트리거된 건 재발화 안 함
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, user_id, ticker, name, target_high, target_low "
            "FROM price_alerts "
            "WHERE enabled=1 AND (triggered_at IS NULL OR triggered_at < ?)",
            (cutoff,)
        ).fetchall()

    if not rows:
        return {'checked': 0, 'triggered': 0}

    # 티커별 그룹핑하여 가격 일괄 조회
    tickers = sorted({r['ticker'] for r in rows})
    prices: dict = {}
    for tkr in tickers:
        try:
            if re.match(r'^A?\d{6}$', tkr):
                p = _kr_price(tkr) or {}
            else:
                p = _price_fast(tkr) or {}
            cur = p.get('current_price')
            if cur is not None:
                prices[tkr] = float(cur)
        except Exception:
            pass

    triggered = 0
    pushed: list = []   # (user_id, msg) — 커밋 후 Web Push 발송 대상
    with _db() as conn:
        for r in rows:
            cur = prices.get(r['ticker'])
            if cur is None: continue
            hit_kind, target = None, None
            if r['target_high'] is not None and cur >= float(r['target_high']):
                hit_kind, target = 'high', float(r['target_high'])
            elif r['target_low'] is not None and cur <= float(r['target_low']):
                hit_kind, target = 'low', float(r['target_low'])
            if not hit_kind: continue
            msg = (f"{r['name'] or r['ticker']} "
                   + (f"목표가 ${target:.2f} 도달 (현재 ${cur:.2f})"
                      if hit_kind == 'high'
                      else f"손절가 ${target:.2f} 하회 (현재 ${cur:.2f})"))
            conn.execute(
                "INSERT INTO notifications (user_id, ticker, name, kind, "
                "       target_price, current_price, message, created_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (r['user_id'], r['ticker'], r['name'], hit_kind,
                 target, cur, msg, now)
            )
            conn.execute(
                "UPDATE price_alerts SET triggered_at=? WHERE id=?",
                (now, r['id'])
            )
            triggered += 1
            pushed.append((r['user_id'], msg))

    # 인앱 알림 INSERT 후 Web Push 발송 (DB 커밋 이후, 실패해도 격리)
    for uid, msg in pushed:
        _send_push(uid, '다온 가격 알림', msg, '/')

    return {'checked': len(rows), 'triggered': triggered,
            'unique_tickers': len(tickers)}


# ─── AI 주간 리밸런싱 리포트 (cron, 주 1회) ────────────────────────
def _weekly_rebalance_for_user(uid: str, api_key: str) -> int:
    """ai_enabled 사용자 1인의 포트폴리오를 조립 → Haiku로 리밸런싱 핵심 3가지 →
    notifications(info) INSERT + Web Push. 생성=1, 스킵/실패=0. 전부 격리."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT ticker, name, avg_price, quantity, sector "
            "FROM portfolios WHERE user_id=?", (uid,)
        ).fetchall()
    holdings = [dict(r) for r in rows if float(r['quantity'] or 0) > 0]
    if len(holdings) < 2:
        return 0   # 리밸런싱 의미 최소 2종목
    usd_krw = 1380.0   # 상대 비중 계산용 (전략 엔드포인트와 동일 가정)
    enriched, total = [], 0.0
    for h in holdings:
        tkr = h['ticker']; qty = float(h['quantity']); avg = float(h['avg_price'] or 0)
        is_us = not is_kr(tkr)
        p = (_price_fast(tkr) if is_us else _kr_price(tkr)) or {}
        cur = float(p.get('current_price') or avg)
        val = qty * cur * (usd_krw if is_us else 1.0)
        total += val
        enriched.append({'tkr': tkr, 'name': h['name'] or tkr,
                         'sector': h['sector'] or '기타', 'val': val,
                         'pnl': ((cur - avg) / avg * 100 if avg > 0 else 0.0)})
    if total <= 0:
        return 0
    enriched.sort(key=lambda x: -x['val'])
    lines = [f"  [{e['tkr']}] {e['name']} | 섹터:{e['sector']} | "
             f"비중:{e['val']/total*100:.1f}% | 수익률:{e['pnl']:+.1f}%" for e in enriched]
    sec: dict = {}
    for e in enriched:
        sec[e['sector']] = sec.get(e['sector'], 0) + e['val']
    sec_lines = [f"  {k}: {v/total*100:.1f}%" for k, v in
                 sorted(sec.items(), key=lambda x: -x[1])]
    prompt = (
        "[역할] 당신은 자산배분 전문가입니다. 아래 포트폴리오를 '이번 주 리밸런싱' 관점에서 "
        "검토해 핵심 3가지를 한국어로 간결히 제시하세요. 과도한 집중·부진 종목·분산 보완 위주로, "
        "각 항목 1~2문장 불릿(•)만. 군더더기·인사말 금지.\n\n"
        f"총자산: ₩{total:,.0f}\n=== 보유 ===\n" + "\n".join(lines) +
        "\n=== 섹터 비중 ===\n" + "\n".join(sec_lines)
    )
    try:
        text = _call_claude(api_key, "claude-haiku-4-5-20251001", prompt, 700, 60)
    except Exception:
        return 0
    if not text or not text.strip():
        return 0
    msg = text.strip()[:900]
    now = time()
    with _db() as conn:
        conn.execute(
            "INSERT INTO notifications (user_id, ticker, name, kind, message, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (uid, '', '주간 리밸런싱', 'info', msg, now)
        )
    _bump_ai_call(uid)
    _send_push(uid, '다온 주간 리밸런싱',
               msg[:110] + ('…' if len(msg) > 110 else ''), '/')
    return 1

@app.post("/api/cron/weekly_rebalance")
def cron_weekly_rebalance(req: TriggerReq):
    """주 1회 cron 호출. ai_enabled 승인 사용자별 AI 리밸런싱 리포트 생성.
    cron_secret 검증(check_alerts와 동일). 비용 제어: ai_enabled 사용자만."""
    secret = ''
    with _db() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key='cron_secret'"
        ).fetchone()
        if row: secret = row['value']
    if not secret or req.cron_secret != secret:
        raise HTTPException(403, "invalid cron secret")
    api_key = _stored_api_key()
    if not api_key:
        return {'processed': 0, 'reason': 'no_api_key'}
    with _db() as conn:
        users = conn.execute(
            "SELECT user_id FROM users WHERE ai_enabled=1 AND status='approved'"
        ).fetchall()
    processed = 0
    for u in users:
        try:
            processed += _weekly_rebalance_for_user(u['user_id'], api_key)
        except Exception:
            pass
    return {'processed': processed, 'eligible_users': len(users)}


# ─── AI 캐시 외부 import (Claude Code/채팅에서 만든 분석 결과 주입) ────
# 사용 시나리오: API 호출 비용/rate limit 없이 무료 Claude로 분석 →
#                결과 JSON을 본 endpoint로 inject → 종목 탭이 즉시 표시.
# 권한: admin만 사용 가능 (다른 사용자의 분석 캐시까지 영향 주므로).
REQUIRED_FIELDS = {'recommendation', 'summary'}   # 최소 검증 (스키마 호환)

class AiCacheImportItem(BaseModel):
    ticker: str
    name:   str = ''
    data:   dict                       # 다온 stock_v2 스키마 전체 (recommendation, priceTarget, ...)
    source: str = 'manual_import'      # 'manual_import' | 'claude_code' | 'free_chat'

class AiCacheImportReq(BaseModel):
    items: list                        # list of AiCacheImportItem-like dict
    overwrite: bool = True             # False면 기존 캐시 있으면 skip

def _require_admin(cu: dict = Depends(get_current_user)):
    if not cu.get('is_admin'):
        raise HTTPException(403, "admin only")
    return cu

@app.post("/api/admin/ai_cache/import")
def import_ai_cache(req: AiCacheImportReq, cu: dict = Depends(_require_admin)):
    """외부 도구로 만든 종목 분석 결과를 캐시에 일괄 inject.
    body: { items: [{ticker, name, data, source}], overwrite: bool }
    응답: { imported, skipped, failed: [{ticker, error}] }
    """
    imported, skipped, failed, audit_warnings = 0, 0, [], []
    for raw in req.items or []:
        try:
            ticker = str(raw.get('ticker') or '').strip().upper()
            name   = str(raw.get('name') or '').strip()
            data   = raw.get('data') or {}
            source = str(raw.get('source') or 'manual_import')
            if not ticker:
                failed.append({'ticker': '', 'error': 'ticker required'})
                continue
            # 최소 스키마 검증
            missing = REQUIRED_FIELDS - set(data.keys())
            if missing:
                failed.append({'ticker': ticker,
                    'error': f'missing fields: {", ".join(sorted(missing))}'})
                continue
            cache_key = f"stock_v2:{ticker}:{name}"
            if not req.overwrite and _get_ai_cache(cache_key) is not None:
                skipped += 1
                continue
            _set_ai_cache(cache_key, data, source=source)
            imported += 1
            # 출력 품질 자가 감사 — TechBio 비즈니스 로직 위반 시 경고 (저장은 유지)
            w = _audit_stock_analysis(ticker, data)
            if w:
                audit_warnings.append({'ticker': ticker, 'issues': w})
        except Exception as e:
            failed.append({'ticker': str(raw.get('ticker') or '?'),
                          'error': str(e)[:200]})

    _log_event(cu['user_id'], 'ai_cache_import', {
        'imported': imported, 'skipped': skipped, 'failed_count': len(failed),
    })
    return {
        'imported': imported,
        'skipped':  skipped,
        'failed':   failed,
        'total_in_cache': len(_ai_cache),
        'audit_warnings': audit_warnings,   # 비즈니스 로직 위반 자동 점검 결과
    }

@app.get("/api/admin/ai_cache/list")
def list_ai_cache(cu: dict = Depends(_require_admin)):
    """현재 캐시된 분석 목록 (관리용)."""
    try:
        with _db() as conn:
            rows = conn.execute(
                "SELECT cache_key, source, computed_at FROM ai_cache "
                "ORDER BY computed_at DESC LIMIT 500"
            ).fetchall()
        items = [{
            'cache_key':  r['cache_key'],
            'source':     r['source'],
            'computed_at': r['computed_at'],
            'age_hours':  round((time() - float(r['computed_at'])) / 3600, 1),
        } for r in rows]
        return {'items': items, 'count': len(items)}
    except Exception as e:
        return {'items': [], 'count': 0, 'error': str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
