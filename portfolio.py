import streamlit as st
import yfinance as yf
import pandas as pd
import re
from datetime import datetime
import plotly.graph_objects as go
import plotly.express as px
import requests
from bs4 import BeautifulSoup
from io import BytesIO
import json
import os
import urllib.parse
from PIL import Image as _PILImg

_icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "daon_icon.png")
_page_icon = _PILImg.open(_icon_path) if os.path.exists(_icon_path) else "📈"

st.set_page_config(page_title="다온", page_icon=_page_icon, layout="wide", initial_sidebar_state="collapsed")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  다온 Design System — White Mode
#  Mobile  (≤767px): Uniswap-inspired, token rows, fixed bottom nav
#  Desktop (≥768px): Original card layout, sticky top nav, wider
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
html,body,[class*="css"]{font-family:'Inter',-apple-system,sans-serif!important}

/* ── Foundation ── */
.stApp{background:#F8FAFC!important}
.block-container{padding:0 0.9rem 5rem;max-width:480px;margin:0 auto}
#MainMenu,footer,header{visibility:hidden}
section[data-testid="stSidebar"]{display:none!important}

/* ── Hero Card (mobile) ── */
.daon-hero{
  background:linear-gradient(160deg,#EFF6FF 0%,#F0F9FF 100%);
  border-radius:24px;padding:22px 20px 18px;margin:10px 0 6px;
  border:1px solid rgba(14,165,233,.25)}
.hero-app-name{font-size:11px;font-weight:600;color:#94A3B8;
  letter-spacing:.22em;text-transform:uppercase;margin-bottom:14px}
.hero-label{font-size:12px;color:#94A3B8;font-weight:500;margin-bottom:5px}
.hero-value{font-size:36px;font-weight:900;color:#0F172A;
  letter-spacing:-.03em;line-height:1}
.hero-pnl{margin-top:6px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px}
.hero-pnl-pos{color:#16A34A}.hero-pnl-neg{color:#DC2626}

/* ── Market Bar (white) ── */
.mbar{background:#FFFFFF;display:flex;overflow-x:auto;
  padding:0 4px;border-bottom:1px solid #E2E8F0;
  margin:-1rem calc(-0.9rem) 0 calc(-0.9rem);gap:0;
  scrollbar-width:none;-ms-overflow-style:none}
.mbar::-webkit-scrollbar{display:none}
.mi{display:flex;align-items:center;gap:6px;padding:6px 12px;cursor:pointer;
  border-right:1px solid #F1F5F9;min-width:86px;transition:background .15s;
  text-decoration:none!important;color:inherit!important}
.mi:last-child{border-right:none}
.mi:hover{background:rgba(14,165,233,.06)}
.mi-info{display:flex;flex-direction:column;gap:1px}
.ml{font-size:9px;color:#94A3B8;font-weight:600;white-space:nowrap;text-transform:uppercase}
.mp{font-size:12px;color:#334155;font-weight:700;white-space:nowrap}
.mu{font-size:10px;color:#16A34A;font-weight:700}
.md{font-size:10px;color:#DC2626;font-weight:700}

/* ── Bottom Navigation (mobile default) ── */
.nav-wrap [data-testid="stHorizontalBlock"]{
  flex-wrap:nowrap!important;overflow-x:hidden!important;gap:0!important}
.nav-wrap [data-testid="stColumn"]{min-width:0!important;flex:1 1 0!important;padding:0!important}
.nav-wrap [data-testid="stButton"]>button,
.nav-wrap button[data-testid^="baseButton-"]{
  white-space:pre-line!important;line-height:1.25!important;
  min-height:52px!important;height:52px!important;font-size:9px!important;
  display:flex!important;flex-direction:column!important;
  align-items:center!important;justify-content:center!important;
  width:100%!important;padding:2px 0!important;border-radius:0!important;
  font-weight:600!important;letter-spacing:.01em!important;
  color:#64748B!important;background:#FFFFFF!important;border:none!important;box-shadow:none!important}
/* 기본(공통): 탭 active = 테두리만, 흰 배경, 파란 텍스트 */
.nav-wrap [data-testid="stButton"]>button[kind="primary"],
.nav-wrap button[data-testid="baseButton-primary"]{
  color:#0284C7!important;background:#EFF6FF!important;
  border-top:2px solid #0EA5E9!important;font-weight:700!important}
.nav-wrap{
  position:fixed!important;bottom:0!important;left:50%!important;
  transform:translateX(-50%)!important;
  width:100%!important;max-width:480px!important;
  z-index:9999!important;background:#FFFFFF!important;
  border-top:1px solid #E2E8F0!important;
  padding:0!important;box-shadow:0 -4px 16px rgba(0,0,0,.08)!important}

/* ── Global buttons — all variants ── */
/* Primary (save / submit / 보유추가 등) */
[data-testid="stButton"]>button[kind="primary"],
button[data-testid="baseButton-primary"]{
  background:linear-gradient(135deg,#0EA5E9,#0284C7)!important;
  border:none!important;color:#fff!important;font-weight:700!important;
  border-radius:14px!important}
/* Secondary / default — borderless icon button style */
[data-testid="stButton"]>button[kind="secondary"],
button[data-testid="baseButton-secondary"],
[data-testid="stButton"]>button:not([kind="primary"]),
button[data-testid^="baseButton-"]:not([data-testid="baseButton-primary"]){
  background:transparent!important;border:none!important;
  color:#64748B!important;box-shadow:none!important}
[data-testid="stButton"]>button[kind="secondary"]:hover,
button[data-testid="baseButton-secondary"]:hover{
  background:rgba(14,165,233,.08)!important;color:#0EA5E9!important}
[data-testid="stButton"]>button{
  border-radius:10px;font-family:'Inter',sans-serif!important;
  font-weight:500;font-size:12px;padding:6px 12px;transition:all .15s}

/* ── Radio buttons ── */
[data-testid="stRadio"] [data-baseweb="radio"] div:first-child{
  background:#FFFFFF!important;border-color:#CBD5E1!important}
[data-testid="stRadio"] label span{color:#334155!important}
[data-testid="stCheckbox"] label span{color:#334155!important}

/* ── Segmented control (토글 스타일) ── */
[data-testid="stSegmentedControl"]{background:#F1F5F9!important;border-radius:20px!important;padding:3px!important}
[data-testid="stSegmentedControl"] button{
  border-radius:16px!important;font-size:12px!important;font-weight:600!important;
  min-height:28px!important;height:28px!important;padding:0 12px!important;
  border:none!important;background:transparent!important;color:#64748B!important;
  box-shadow:none!important}
[data-testid="stSegmentedControl"] button[aria-selected="true"]{
  background:#FFFFFF!important;color:#0F172A!important;
  box-shadow:0 1px 4px rgba(0,0,0,.12)!important}

/* ── Token Row (mobile Uniswap-style) ── */
.tok{display:flex;align-items:center;gap:12px;padding:12px 2px;
  border-bottom:1px solid #F1F5F9;cursor:default}
.tok:last-child{border-bottom:none}
.tok:hover{background:rgba(14,165,233,.04);border-radius:14px;padding:12px 8px;margin:0 -6px}
.tok-left{display:flex;align-items:center;gap:11px;flex:1;min-width:0}
.tok-mid{flex:0 0 70px;display:flex;align-items:center;justify-content:center}
.tok-right{text-align:right;flex:0 0 auto}
.tok-name{font-size:15px;font-weight:600;color:#0F172A;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px}
.tok-sub{font-size:11px;color:#94A3B8;margin-top:2px}
.tok-price{font-size:15px;font-weight:700;color:#0F172A}
.tok-up{font-size:12px;color:#16A34A;font-weight:600;margin-top:1px}
.tok-dn{font-size:12px;color:#DC2626;font-weight:600;margin-top:1px}

/* ── Symbol Logo Circle ── */
.sym-circle{width:42px;height:42px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;font-weight:800;color:#fff;flex-shrink:0;
  overflow:hidden;border:none}
.sym-circle img{width:36px;height:36px;object-fit:contain;border-radius:50%}

/* ── Pills ── */
.pill{display:inline-block;padding:3px 8px;border-radius:20px;
  font-size:11px;font-weight:700;margin-top:2px}
.pill.pu{background:rgba(22,163,74,.12);color:#16A34A}
.pill.pd{background:rgba(220,38,38,.12);color:#DC2626}

/* ── Surface Cards (관심·탐색) ── */
.sc{background:transparent;border-radius:0;padding:10px 4px;margin:0;
  border:none;border-bottom:1px solid #F1F5F9;
  display:flex;align-items:center;gap:10px;transition:all .15s}
.sc:last-child{border-bottom:none}
.sc:hover{background:#F8FAFC;border-radius:10px;border-bottom:1px solid transparent;padding:10px 10px;margin:0 -6px}
.sc.active{border-bottom:2px solid #0EA5E9}
.sc-left{display:flex;align-items:center;gap:10px;flex:0 0 auto;min-width:140px}
.sc-mid{flex:1;display:flex;align-items:center;justify-content:center;padding:0 4px}
.sc-right{text-align:right;flex:0 0 auto}
.sn{font-size:13px;font-weight:700;color:#0F172A;line-height:1.3}
.sm{font-size:10px;color:#94A3B8;margin-top:2px;line-height:1.3}
.sp{font-size:14px;font-weight:700;color:#0F172A}

/* ── Metrics (차트탭 지표) ── */
[data-testid="stMetric"]{
  background:transparent!important;border:none!important;
  border-radius:0!important;padding:8px 4px!important;
  min-height:auto!important;height:auto!important;
  border-bottom:1px solid #F1F5F9!important;box-shadow:none!important}
[data-testid="stMetricLabel"]{font-size:12px!important;color:#94A3B8!important;font-weight:500!important}
[data-testid="stMetricValue"]{font-size:14px!important;font-weight:700!important;color:#0F172A!important;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-testid="stMetricDelta"]>div{font-size:12px!important;font-weight:600!important}

/* ── Inputs — force white on ALL Streamlit form components ── */
input,[data-testid="stTextInput"] input,[data-testid="stNumberInput"] input{
  background:#FFFFFF!important;color:#0F172A!important;
  border:1px solid #E2E8F0!important;border-radius:12px!important}
input:focus{border-color:#0EA5E9!important;box-shadow:0 0 0 2px rgba(14,165,233,.15)!important}
label,[data-testid="stWidgetLabel"] p{color:#64748B!important}

/* Selectbox — all layers */
[data-baseweb="select"]{background:#FFFFFF!important;border-radius:12px!important}
[data-baseweb="select"]>div,[data-baseweb="select"]>div>div,
[data-baseweb="select"] [data-baseweb="select-control"],
[data-baseweb="popover"] [data-baseweb="menu"],
[data-testid="stSelectbox"] [data-baseweb="select"]>div{
  background:#FFFFFF!important;color:#0F172A!important}
[data-baseweb="select"] [role="option"],[data-baseweb="option"]{
  background:#FFFFFF!important;color:#0F172A!important}
[data-baseweb="option"]:hover{background:#F0F9FF!important}
[data-baseweb="select"] svg,[data-baseweb="select"] [data-testid="stSelectboxVirtualDropdown"]{
  color:#64748B!important;fill:#64748B!important}
/* Dropdown container */
[data-baseweb="popover"]{background:#FFFFFF!important}

/* Number input — +/− buttons */
[data-testid="stNumberInput"] button,[data-testid="stNumberInput"] [data-baseweb="button"]{
  background:#F8FAFC!important;color:#0F172A!important;
  border:1px solid #E2E8F0!important}
[data-testid="stNumberInput"]>div{
  background:#FFFFFF!important;border:1px solid #E2E8F0!important;border-radius:12px!important}

/* ── Expander ── */
[data-testid="stExpander"]{background:#FFFFFF!important;
  border:1px solid #E2E8F0!important;border-radius:14px!important}
[data-testid="stExpanderToggleIcon"]{color:#0EA5E9!important}
details summary p{color:#64748B!important}

/* ── Dataframe — force white ── */
[data-testid="stDataFrame"]{border-radius:14px;overflow:hidden;
  border:1px solid #E2E8F0!important;background:#FFFFFF!important}
[data-testid="stDataFrame"] [data-testid="stDataFrameResizable"],
[data-testid="stDataFrame"] canvas,
[data-testid="stDataFrame"]>div{background:#FFFFFF!important}

/* ── Tab title ── */
.ttl{font-size:16px;font-weight:800;color:#0F172A;margin:12px 0 8px;
  letter-spacing:-.01em;line-height:1.3}

/* ── Caption / paragraph ── */
.stCaption p,.stCaption{color:#94A3B8!important}
p{color:#334155}
/* Markdown bold/text in general */
[data-testid="stMarkdown"] p{color:#334155!important}
[data-testid="stMarkdown"] strong{color:#0F172A!important}

/* ── Section header ── */
.sec-hd{font-size:13px;font-weight:600;color:#94A3B8;
  text-transform:uppercase;letter-spacing:.1em;
  margin:16px 0 8px;padding:0}

/* ── News Card ── */
.news-card{background:#FFFFFF;border:1px solid #E2E8F0;
  border-radius:14px;padding:12px 14px;margin:4px 0;display:flex;gap:10px;align-items:flex-start}
.news-num{background:linear-gradient(135deg,#0EA5E9,#0284C7);color:#fff;
  border-radius:8px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:800;flex-shrink:0;margin-top:1px}
.news-title{font-size:13px;font-weight:500;color:#334155;line-height:1.5}
.news-title a{color:#0EA5E9;text-decoration:none}
.news-title a:hover{text-decoration:underline}
.news-src{font-size:10px;color:#94A3B8;margin-top:3px}

/* ── Hot Row ── */
.hot-row{background:#FFFFFF;border:1px solid #E2E8F0;
  border-radius:14px;padding:10px 14px;margin:3px 0;display:flex;align-items:center;gap:10px}
.hot-rank{font-size:13px;font-weight:900;color:#0EA5E9;width:20px;text-align:center;flex-shrink:0}
.hot-name{flex:1;min-width:0}
.hot-tn{font-size:13px;font-weight:600;color:#0F172A;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hot-sub{font-size:10px;color:#94A3B8}

/* ── Insight Card ── */
.insight-card{
  background:linear-gradient(160deg,#EFF6FF,#F0F9FF);
  border:1px solid rgba(14,165,233,.3);border-left:3px solid #0EA5E9;
  border-radius:16px;padding:16px;margin:8px 0}
.insight-title{font-size:13px;font-weight:800;color:#0284C7;margin-bottom:10px}
.insight-item{font-size:12px;color:#475569;line-height:1.8;padding:4px 0;
  border-bottom:1px solid #F1F5F9}
.insight-item:last-child{border-bottom:none}
.risk-badge{display:inline-block;padding:2px 8px;border-radius:20px;
  font-size:10px;font-weight:700;margin-left:6px}
.risk-high{background:rgba(220,38,38,.1);color:#DC2626}
.risk-mid{background:rgba(245,158,11,.1);color:#D97706}
.risk-low{background:rgba(22,163,74,.1);color:#16A34A}

/* ── Rec Card ── */
.rec-card{background:#FFFFFF;border:1px solid #E2E8F0;
  border-radius:12px;padding:10px 14px;margin:4px 0;display:flex;gap:8px;align-items:flex-start}
.rec-firm{font-size:11px;font-weight:700;color:#0284C7;min-width:110px}
.rec-action{font-size:11px;font-weight:600;color:#0F172A}
.rec-target{font-size:11px;color:#94A3B8}

/* ── Analyst price target bar ── */
.tgt-bar-wrap{background:#F8FAFC;border-radius:14px;padding:14px 16px;margin:8px 0}
.tgt-bar-title{font-size:12px;font-weight:700;color:#64748B;margin-bottom:12px}
.tgt-bar-track{position:relative;height:6px;background:#E2E8F0;border-radius:3px;margin:20px 8px 28px}
.tgt-bar-fill{position:absolute;height:6px;background:linear-gradient(90deg,#E2E8F0,#93C5FD,#2563EB);border-radius:3px}
.tgt-marker{position:absolute;top:-5px;width:16px;height:16px;border-radius:50%;
  border:2.5px solid #fff;box-shadow:0 0 0 1px #CBD5E1,0 2px 4px rgba(0,0,0,.1);
  transform:translateX(-50%)}
.tgt-marker-label{position:absolute;top:-28px;transform:translateX(-50%);
  background:#0F172A;color:#fff;font-size:9px;font-weight:700;
  padding:2px 6px;border-radius:6px;white-space:nowrap}
.tgt-marker-sub{position:absolute;top:14px;transform:translateX(-50%);
  font-size:9px;color:#94A3B8;font-weight:500;white-space:nowrap}
.tgt-ends{display:flex;justify-content:space-between;margin-top:0;
  font-size:10px;color:#64748B;font-weight:600}

/* ── YouTube Analysis Card ── */
.yt-card{background:linear-gradient(160deg,#FFF7ED,#FFFBEB);
  border:1px solid rgba(234,88,12,.2);border-left:3px solid #EA580C;
  border-radius:16px;padding:16px;margin:8px 0}
.yt-title{font-size:13px;font-weight:800;color:#C2410C;margin-bottom:6px}
.yt-stock-chip{display:inline-block;background:#EFF6FF;border:1px solid #BFDBFE;
  color:#1D4ED8;font-size:11px;font-weight:700;padding:3px 10px;
  border-radius:20px;margin:3px 3px 3px 0;cursor:pointer}
.yt-section{font-size:12px;font-weight:700;color:#64748B;margin:10px 0 4px;
  text-transform:uppercase;letter-spacing:.06em}
.yt-body{font-size:12px;color:#334155;line-height:1.7}

/* ══════════════════════════════════════════════════════════
   DESKTOP / WEB  ≥768px — original card layout, sticky top nav
   ══════════════════════════════════════════════════════════ */
@media(min-width:768px){
  .block-container{padding:0 2rem 2rem;max-width:1100px}
  .mbar{margin:-1rem -2rem 0;background:#FFFFFF;border-bottom:1px solid #E2E8F0}
  /* Hero hidden on desktop */
  .daon-hero{display:none!important}
  /* Nav: sticky top bar, not fixed bottom */
  .nav-wrap{
    position:sticky!important;top:0!important;left:0!important;
    transform:none!important;
    width:100%!important;max-width:100%!important;
    z-index:9999!important;background:#FFFFFF!important;
    border-top:none!important;border-bottom:1px solid #E2E8F0!important;
    padding:4px 0!important;box-shadow:0 2px 8px rgba(0,0,0,.06)!important}
  .nav-wrap [data-testid="stButton"]>button{
    min-height:40px!important;height:40px!important;font-size:13px!important;
    white-space:nowrap!important;border-radius:10px!important}
  /* Desktop active tab: border outline only (no fill) */
  .nav-wrap [data-testid="stButton"]>button[kind="primary"],
  .nav-wrap button[data-testid="baseButton-primary"]{
    background:#EFF6FF!important;
    border:2px solid #0EA5E9!important;
    color:#0284C7!important;
    font-weight:700!important}
  /* tok row → flat separator style on desktop (no card borders) */
  .tok{background:transparent;border-radius:0;border:none;
    border-bottom:1px solid #F1F5F9;
    padding:14px 4px;margin:0;box-shadow:none}
  .tok:last-child{border-bottom:none}
  .tok:hover{background:#F8FAFC;border-radius:12px;
    border-bottom:1px solid transparent;
    padding:14px 12px;margin:0 -8px;box-shadow:none}
  /* sc (watchlist/search) → flat */
  .sc{border:none!important;border-bottom:1px solid #F1F5F9!important;
    border-radius:0!important;box-shadow:none!important;
    padding:12px 4px!important;margin:0!important}
  .sc:hover{background:#F8FAFC!important;border-radius:12px!important;
    border-bottom:1px solid transparent!important;
    padding:12px 12px!important;margin:0 -8px!important}
  .sc.active{border:none!important;border-bottom:2px solid #0EA5E9!important}
  /* hot-row → flat */
  .hot-row{border:none;border-bottom:1px solid #F1F5F9;
    border-radius:0;box-shadow:none;padding:10px 4px;margin:0;
    background:transparent}
  .hot-row:last-child{border-bottom:none}
  .tok-name{max-width:220px;font-size:14px}
  .tok-price{font-size:16px}
  .sym-circle{width:46px;height:46px;font-size:16px;border:none}
  .sym-circle img{width:40px;height:40px}
}

/* ══════════════════════════════════════════════════════════
   MOBILE  ≤767px — Uniswap style, fixed bottom nav, hero visible
   ══════════════════════════════════════════════════════════ */
@media(max-width:767px){
  .block-container{padding:0 0.5rem 5rem;max-width:100%}
  .mbar{margin:-1rem -0.5rem 0}
  .mi{padding:5px 10px;min-width:76px;gap:5px}
  .tok-name{max-width:90px}
  .sym-circle{width:36px;height:36px;font-size:13px}
  .sym-circle img{width:30px;height:30px}
  [data-testid="stMetric"]{padding:10px 12px!important;min-height:76px!important;height:76px!important}
  [data-testid="stMetricValue"]{font-size:14px!important}
  [data-testid="stButton"]>button{font-size:11px;padding:5px 8px}
  .nav-wrap [data-testid="stButton"]>button{
    min-height:48px!important;height:48px!important;font-size:8px!important}
  .hero-value{font-size:30px!important}
  .ttl{font-size:14px}
}

/* Tablet */
@media(min-width:768px) and (max-width:1024px){
  .block-container{padding:0 1.5rem 2rem;max-width:900px}
}
</style>
""", unsafe_allow_html=True)

# ─── Constants ────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "portfolio_data.json")
ACCOUNTS  = ['US', 'KR_RETIRE', 'KR_PERSONAL', 'KR_ISA']
ACCOUNT_NAMES = {'US': '🇺🇸 미국', 'KR_RETIRE': '🇰🇷 퇴직', 'KR_PERSONAL': '🇰🇷 개별', 'KR_ISA': '🇰🇷 ISA'}
MARKET_TICKERS = [
    ('S&P500','^GSPC'),('Dow','^DJI'),('Nasdaq','^IXIC'),('VIX','^VIX'),
    ('KOSPI','^KS11'),('BTC','BTC-USD'),('ETH','ETH-USD'),('Gold','GC=F'),('USD/KRW','KRW=X'),
]
TAB_NAMES = ['보유','관심','탐색','비중','차트','트렌드','추가','관리']
# Nav display: icon on top, text below
TAB_DISPLAY = ['보유','관심','탐색','비중','차트','트렌드','추가','관리']
TAB_IDX = {n: i for i, n in enumerate(TAB_NAMES)}
BADGE_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
                '#EC4899','#14B8A6','#F97316','#0EA5E9','#84CC16','#6366F1']
SECTOR_ETFS = {
    '기술':('XLK',30),'헬스케어':('XLV',12),'금융':('XLF',13),
    '통신서비스':('XLC',9),'소비재':('XLY',10),'산업재':('XLI',9),
    '에너지':('XLE',4),'필수소비재':('XLP',6),'유틸리티':('XLU',3),
    '소재':('XLB',3),'부동산':('XLRE',2),
}
KOSPI_SECTOR_ETFS = {
    'IT·반도체':('091160.KS',25),'2차전지':('305720.KS',15),
    '금융·은행':('091220.KS',12),'자동차':('091180.KS',10),
    '화학·에너지':('117460.KS',8),'헬스케어':('143860.KS',7),
    '방산·우주':('310080.KS',6),'통신':('098560.KS',5),
    '건설':('117700.KS',5),'철강·소재':('102960.KS',4),'유통·소비':('091170.KS',3),
}
# ETF ticker → 섹터 매핑 (sector 필드가 비어있을 때 fallback)
KR_ETF_SECTOR = {
    '305720': '2차전지', '364980': '2차전지', '371460': '2차전지', '381180': '2차전지', '391600': '2차전지',
    '091160': 'IT·반도체', '091170': 'IT·반도체', '266370': 'IT·반도체', '229200': 'IT·반도체',
    '143860': '헬스케어', '326030': '헬스케어', '250000': '헬스케어',
    '310080': '방산·우주', '272210': '방산·우주',
    '069500': 'S&P500/코스피', '252670': 'S&P500/코스피레버리지',
    '278540': '미국주식', '360750': '미국주식',
    '148020': '채권', '136340': '채권',
}
US_ETF_SECTOR = {
    'TLT': '채권', 'BND': '채권', 'IEF': '채권', 'SHY': '채권', 'AGG': '채권', 'LQD': '채권', 'HYG': '채권',
    'GLD': '금·귀금속', 'IAU': '금·귀금속', 'SLV': '은·귀금속', 'PDBC': '원자재',
    'QQQ': 'AI·기술', 'XLK': 'AI·기술', 'SOXX': 'AI·반도체', 'SMH': 'AI·반도체', 'SOXL': 'AI·반도체레버리지',
    'XLV': '헬스케어', 'IBB': '헬스케어바이오',
    'XLE': '에너지', 'XLF': '금융', 'XLI': '산업재', 'XLU': '유틸리티', 'XLRE': '부동산',
    'ITA': '방산', 'XAR': '방산',
    'ARKK': 'ARK혁신', 'ARKG': 'ARK바이오',
    'IBIT': 'BTC ETF', 'FBTC': 'BTC ETF', 'BITO': 'BTC ETF',
    'SPY': 'S&P500 ETF', 'IVV': 'S&P500 ETF', 'VOO': 'S&P500 ETF',
    'EEM': '신흥국', 'EWJ': '일본', 'FXI': '중국',
}
SP500_SECTOR_STOCKS = {
    '기술':        [('AAPL','Apple'),('MSFT','Microsoft'),('NVDA','NVIDIA'),('AVGO','Broadcom'),('ORCL','Oracle')],
    '헬스케어':    [('UNH','UnitedHealth'),('LLY','Eli Lilly'),('JNJ','J&J'),('ABBV','AbbVie'),('MRK','Merck')],
    '금융':        [('JPM','JPMorgan'),('V','Visa'),('MA','Mastercard'),('BAC','BofA'),('GS','Goldman')],
    '통신서비스':  [('META','Meta'),('GOOGL','Alphabet'),('NFLX','Netflix'),('DIS','Disney'),('T','AT&T')],
    '소비재':      [('AMZN','Amazon'),('TSLA','Tesla'),('HD','Home Depot'),('NKE','Nike'),('SBUX','Starbucks')],
    '산업재':      [('CAT','Caterpillar'),('DE','Deere'),('LMT','Lockheed'),('RTX','RTX'),('BA','Boeing')],
    '에너지':      [('XOM','ExxonMobil'),('CVX','Chevron'),('COP','ConocoPhillips'),('SLB','Schlumberger'),('MPC','Marathon')],
    '필수소비재':  [('WMT','Walmart'),('COST','Costco'),('PG','P&G'),('KO','Coca-Cola'),('PEP','PepsiCo')],
    '유틸리티':    [('NEE','NextEra'),('DUK','Duke Energy'),('SO','Southern'),('D','Dominion'),('AEP','AEP')],
    '소재':        [('LIN','Linde'),('APD','Air Products'),('ECL','Ecolab'),('NEM','Newmont'),('FCX','Freeport')],
    '부동산':      [('PLD','Prologis'),('AMT','American Tower'),('EQIX','Equinix'),('CCI','Crown Castle'),('SPG','Simon')],
}
KOSPI_SECTOR_STOCKS = {
    'IT·반도체':   [('005930','삼성전자'),('000660','SK하이닉스'),('042700','한미반도체'),('240810','원익IPS'),('357780','솔브레인')],
    '2차전지':     [('373220','LG에너지솔루션'),('051910','LG화학'),('006400','삼성SDI'),('247540','에코프로비엠'),('086520','에코프로')],
    '금융·은행':   [('105560','KB금융'),('055550','신한지주'),('086790','하나금융지주'),('316140','우리금융지주'),('032830','삼성생명')],
    '자동차':      [('005380','현대차'),('000270','기아'),('012330','현대모비스'),('018880','한온시스템'),('073240','금호타이어')],
    '화학·에너지': [('096770','SK이노베이션'),('010950','S-Oil'),('011170','롯데케미칼'),('006650','대한유화'),('003490','대한항공')],
    '헬스케어':    [('207940','삼성바이오로직스'),('068270','셀트리온'),('326030','SK바이오팜'),('263750','펩트론'),('091990','셀트리온헬스케어')],
    '방산·우주':   [('047810','한국항공우주'),('064350','현대로템'),('003570','SNT다이내믹스'),('272210','한화시스템'),('012450','한화에어로스페이스')],
    '통신':        [('017670','SK텔레콤'),('030200','KT'),('032640','LG유플러스'),('053210','스카이라이프'),('032290','골든브릿지증권')],
    '건설':        [('000720','현대건설'),('028260','삼성물산'),('047040','대우건설'),('010140','삼성중공업'),('009540','HD현대중공업')],
    '철강·소재':   [('005490','POSCO홀딩스'),('004020','현대제철'),('001430','세아베스틸지주'),('103140','풍산'),('014820','동원시스템즈')],
    '유통·소비':   [('139480','이마트'),('023530','롯데쇼핑'),('004170','신세계'),('071840','롯데제과'),('033600','쌍용정보통신')],
}
FINANCE_KEYWORDS = [
    'AI','earnings','revenue','beat','miss','upgrade','downgrade','record',
    'growth','profit','loss','guidance','forecast','rally','surge','drop',
    'crash','buy','sell','target','실적','매출','순이익','목표가','상향','하향','급등','급락','추천',
]
# Clearbit logo domains for known US tickers
LOGO_DOMAINS = {
    'AAPL':'apple.com','MSFT':'microsoft.com','GOOGL':'google.com','GOOG':'google.com',
    'AMZN':'amazon.com','NVDA':'nvidia.com','META':'meta.com','TSLA':'tesla.com',
    'NFLX':'netflix.com','AMD':'amd.com','INTC':'intel.com','QCOM':'qualcomm.com',
    'TSM':'tsmc.com','BABA':'alibaba.com','JPM':'jpmorgan.com','V':'visa.com',
    'MA':'mastercard.com','BAC':'bankofamerica.com','GS':'goldmansachs.com',
    'WMT':'walmart.com','COST':'costco.com','DIS':'disney.com','SBUX':'starbucks.com',
    'NKE':'nike.com','ORCL':'oracle.com','CRM':'salesforce.com','ADBE':'adobe.com',
    'PYPL':'paypal.com','UBER':'uber.com','ABNB':'airbnb.com','SNAP':'snap.com',
    'TWTR':'twitter.com','COIN':'coinbase.com','HOOD':'robinhood.com',
    'PLTR':'palantir.com','SOFI':'sofi.com','RBLX':'roblox.com',
    'SPY':'ssga.com','QQQ':'invesco.com','IWM':'blackrock.com','GLD':'spdrgoldshares.com',
    'TLT':'blackrock.com','XLK':'ssga.com','ARKK':'ark-invest.com',
    'AVGO':'broadcom.com','MU':'micron.com','LRCX':'lamresearch.com',
    'AMAT':'appliedmaterials.com','ASML':'asml.com','ARM':'arm.com',
    'SMCI':'supermicro.com','DELL':'dell.com','HPE':'hpe.com',
    'MRVL':'marvell.com','ON':'onsemi.com','TXN':'ti.com',
    'LLY':'lilly.com','JNJ':'jnj.com','PFE':'pfizer.com','ABBV':'abbvie.com',
    'UNH':'unitedhealthgroup.com','CVS':'cvshealth.com','MRK':'merck.com',
    'AMGN':'amgen.com','GILD':'gilead.com','BIIB':'biogen.com',
    'XOM':'exxonmobil.com','CVX':'chevron.com','COP':'conocophillips.com',
    'SLB':'slb.com','MPC':'marathonpetroleum.com',
    'BRK.B':'berkshirehathaway.com','BRK-B':'berkshirehathaway.com',
    'MSFT':'microsoft.com','LMT':'lockheedmartin.com','RTX':'rtx.com',
    'NOC':'northropgrumman.com','GD':'gd.com','BA':'boeing.com',
    'CAT':'caterpillar.com','DE':'deere.com','MMM':'3m.com',
    'HD':'homedepot.com','LOW':'lowes.com','TGT':'target.com',
    'AMZN':'amazon.com','SHOP':'shopify.com','ETSY':'etsy.com',
    'MELI':'mercadolibre.com','SE':'sea.com',
    'T':'att.com','VZ':'verizon.com','TMUS':'t-mobile.com',
    'NEE':'nexteraenergy.com','DUK':'duke-energy.com',
    'PLD':'prologis.com','AMT':'americantower.com',
    'SPGI':'spglobal.com','ICE':'intercontinentalexchange.com',
    'CME':'cmegroup.com','MSCI':'msci.com',
}

# ─── Helpers ──────────────────────────────────────────────────────────
def logo_html(ticker, size=40):
    """Company logo circle — 4-step fallback chain, US flag final fallback"""
    t = str(ticker).upper()
    color = BADGE_COLORS[sum(ord(c) for c in t) % len(BADGE_COLORS)]
    if is_kr_ticker(t):
        return (f'<div class="sym-circle" style="background:{color};font-size:9px;'
                f'font-weight:800;letter-spacing:-.02em">{t}</div>')
    domain = LOGO_DOMAINS.get(t, f'{t.lower()}.com')
    s2 = size - 4
    src1 = f"https://assets.parqet.com/logos/symbol/{t}?format=jpg"
    src2 = f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
    # 이미지 실패 시: 컬러 배경 표시 + 국기 표시
    oe_final = (f"this.style.display='none';"
                f"this.parentElement.style.background='{color}';"
                f"this.previousSibling.style.display='block'")
    oe1 = (f"this.onerror=function(){{{oe_final}}};"
           f"this.src='{src2}'")
    return (
        # 배경 transparent → 이미지 성공 시 깔끔, 실패 시 JS로 컬러 배경 표시
        f'<div class="sym-circle" style="background:transparent;position:relative">'
        f'<span style="display:none;position:absolute;font-size:18px;'
        f'top:50%;left:50%;transform:translate(-50%,-50%);z-index:0;line-height:1">🇺🇸</span>'
        f'<img src="{src1}" width="{s2}" height="{s2}" '
        f'style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);'
        f'z-index:1;object-fit:contain;border-radius:50%;'
        f'background:rgba(255,255,255,0.88);padding:2px" '
        f'onerror="{oe1}">'
        f'</div>'
    )

def make_svg_spark(values, w=72, h=22, positive=True):
    if not values or len(values) < 2: return ''
    mn, mx = min(values), max(values)
    if mx - mn < 1e-6: mx = mn + 1
    color = '#00C48C' if positive else '#FF5C5C'
    pts = [f"{i/(len(values)-1)*w:.1f},{(1-(v-mn)/(mx-mn))*h:.1f}" for i, v in enumerate(values)]
    return (f'<svg width="{w}" height="{h}" style="display:block">'
            f'<path d="M {" L ".join(pts)}" fill="none" stroke="{color}" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')

def is_kr_ticker(ticker):
    return bool(re.match(r'^\d{6}$', str(ticker)))

def quarter_label(dt):
    try:
        ts = pd.Timestamp(dt)
        return f"{ts.year}/Q{(ts.month-1)//3+1}"
    except Exception:
        return str(dt)[:7]

def has_korean(text):
    return any('\uAC00' <= c <= '\uD7A3' or '\u3131' <= c <= '\u318E' for c in text)

def highlight_keywords(text):
    for kw in FINANCE_KEYWORDS:
        text = re.sub(
            f'(?<![\\w가-힣])({re.escape(kw)})(?![\\w가-힣])',
            r'<strong style="color:#F1F5F9;font-weight:700">\1</strong>',
            text, flags=re.IGNORECASE
        )
    return text

# ─── Persistence ──────────────────────────────────────────────────────
def save_portfolio():
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump({'portfolios': {k: st.session_state.portfolios.get(k, []) for k in ACCOUNTS},
                   'watchlist': st.session_state.watchlist}, f, ensure_ascii=False, indent=2)

def load_portfolio():
    if not os.path.exists(DATA_FILE): return None
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict) and 'portfolios' in data:
            return data
        watchlist = [{'ticker': x.get('ticker',''), 'name': x.get('name',''), 'exchange':'', 'qtype':''}
                     for x in data.pop('WATCHLIST', [])]
        return {'portfolios': {k: data.get(k, []) for k in ACCOUNTS}, 'watchlist': watchlist}
    except Exception:
        return None

# ─── Session State ────────────────────────────────────────────────────
if 'portfolios' not in st.session_state:
    loaded = load_portfolio()
    st.session_state.portfolios = loaded['portfolios'] if loaded else {k: [] for k in ACCOUNTS}
    st.session_state.watchlist  = loaded.get('watchlist', []) if loaded else []
if 'watchlist'      not in st.session_state: st.session_state.watchlist = []
if 'active_tab'     not in st.session_state: st.session_state.active_tab = 0
if 'chart_ticker'   not in st.session_state: st.session_state.chart_ticker = None
if 'expanded_card'  not in st.session_state: st.session_state.expanded_card = None
if 'acc_select'     not in st.session_state: st.session_state.acc_select = '전체'
if 'sort_by'        not in st.session_state: st.session_state.sort_by = '평가액'
if 'sort_asc'       not in st.session_state: st.session_state.sort_asc = False   # False = 높은순

# ─── Data Functions ───────────────────────────────────────────────────
@st.cache_data(ttl=300)
def get_market_data():
    results = []
    for name, ticker in MARKET_TICKERS:
        try:
            hist = yf.Ticker(ticker).history(period='1mo')
            if hist.empty: continue
            cur  = hist['Close'].iloc[-1]
            prev = hist['Close'].iloc[-2] if len(hist) > 1 else cur
            chg  = cur - prev
            pct  = (chg / prev * 100) if prev != 0 else 0.0
            results.append({'name': name, 'ticker': ticker, 'price': cur,
                            'change': chg, 'pct': pct, 'spark': hist['Close'].tolist()[-20:]})
        except Exception:
            pass
    return results

@st.cache_data(ttl=3600)
def get_usd_krw_rate():
    try:
        return yf.Ticker("KRW=X").history(period="1d")['Close'].iloc[-1]
    except Exception:
        return 1300.0

@st.cache_data(ttl=120)
def get_us_stock_data(ticker):
    """Full data including 1y history — used for chart tab"""
    try:
        stock = yf.Ticker(ticker)
        hist  = stock.history(period="1y")
        info  = stock.info
        if hist.empty: return None
        cur  = hist['Close'].iloc[-1]
        prev = hist['Close'].iloc[-2] if len(hist) > 1 else cur
        hist['MA20']  = hist['Close'].rolling(20).mean()
        hist['MA60']  = hist['Close'].rolling(60).mean()
        hist['MA120'] = hist['Close'].rolling(120).mean()
        delta = hist['Close'].diff()
        gain  = delta.where(delta > 0, 0).rolling(14).mean()
        loss  = (-delta.where(delta < 0, 0)).rolling(14).mean()
        hist['RSI'] = 100 - (100 / (1 + (gain / loss.replace(0, float('nan')))))
        return {
            'current_price': cur, 'change': cur - prev,
            'change_pct': ((cur - prev) / prev * 100) if prev != 0 else 0.0,
            'week_52_high': hist['High'].max(), 'week_52_low': hist['Low'].min(), 'hist': hist,
            'prev_close': info.get('previousClose', prev), 'open': info.get('open', 0),
            'day_high': info.get('dayHigh', 0), 'day_low': info.get('dayLow', 0),
            'volume': info.get('volume', 0), 'market_cap': info.get('marketCap', 0),
            'pe_ratio': info.get('trailingPE', 0), 'sector': info.get('sector', 'N/A'),
            'target_mean': info.get('targetMeanPrice'), 'target_high': info.get('targetHighPrice'),
            'target_low': info.get('targetLowPrice'), 'recommendation': info.get('recommendationKey', 'N/A'),
            'num_analysts': info.get('numberOfAnalystOpinions', 0),
        }
    except Exception:
        return None

@st.cache_data(ttl=90)
def get_us_price_fast(ticker):
    """Lightweight price + 30d spark — used for portfolio cards"""
    try:
        hist = yf.Ticker(ticker).history(period='1mo')
        if hist.empty: return None
        cur  = hist['Close'].iloc[-1]
        prev = hist['Close'].iloc[-2] if len(hist) > 1 else cur
        chg  = cur - prev
        pct  = (chg / prev * 100) if prev != 0 else 0.0
        return {'current_price': cur, 'change': chg, 'change_pct': pct,
                'spark': hist['Close'].tolist()}
    except Exception:
        return None

@st.cache_data(ttl=90)
def get_kr_stock_data(ticker):
    try:
        r = requests.get(f"https://finance.naver.com/item/main.nhn?code={ticker}",
                         headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        soup = BeautifulSoup(r.text, 'html.parser')
        el = soup.select_one('.no_today .blind')
        if not el: return None
        cur = int(el.text.replace(',', '').strip())
        cel = soup.select_one('.no_exday .blind')
        chg = int(cel.text.replace(',', '').strip()) if cel else 0
        prev = cur - chg
        return {'current_price': cur, 'change': chg,
                'change_pct': (chg / prev * 100) if prev > 0 else 0.0}
    except Exception:
        return None

@st.cache_data(ttl=1800)
def get_kr_stock_history(ticker):
    for suffix in ['.KS', '.KQ']:
        try:
            hist = yf.Ticker(f"{ticker}{suffix}").history(period="1y")
            if not hist.empty and len(hist) > 5:
                return hist
        except Exception:
            pass
    return None

@st.cache_data(ttl=300)
def search_kr_naver(query):
    # 방법 1: Naver 모바일 API
    try:
        url = f"https://m.stock.naver.com/api/search/all?keyword={urllib.parse.quote(query)}"
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        data = r.json()
        items = (data.get('result', {}).get('d', {}).get('stock', {}).get('items') or
                 data.get('result', {}).get('stock', {}).get('items', []))
        if items:
            return [{'symbol': str(x.get('code', x.get('ticker',''))),
                     'shortname': str(x.get('name', x.get('stockName',''))),
                     'exchange': str((x.get('stockExchangeType') or {}).get('code','KRX')),
                     'quoteType': 'EQUITY'} for x in items[:8] if x.get('code') or x.get('ticker')]
    except Exception:
        pass
    # 방법 2: ac.stock.naver
    try:
        url2 = f"https://ac.stock.naver.com/ac?q={urllib.parse.quote(query)}&q_enc=UTF-8&target=stock,etf"
        r2 = requests.get(url2, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        data2 = r2.json()
        items2 = data2.get('items', [[]])[0] if data2.get('items') else []
        if items2:
            return [{'symbol': str(x[1]), 'shortname': str(x[0]),
                     'exchange': str(x[2]) if len(x) > 2 else 'KRX', 'quoteType': 'EQUITY'}
                    for x in items2[:8] if isinstance(x, list) and len(x) >= 2]
    except Exception:
        pass
    # 방법 3: ac.finance.naver
    try:
        url3 = f"https://ac.finance.naver.com/ac?q={urllib.parse.quote(query)}&q_enc=UTF-8&target=stock,etf&v=2&type=cp"
        r3 = requests.get(url3, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        data3 = r3.json()
        items3 = data3.get('items', [[]])[0] if data3.get('items') else []
        if items3:
            return [{'symbol': str(x[1]), 'shortname': str(x[0]),
                     'exchange': str(x[2]) if len(x) > 2 else 'KRX', 'quoteType': 'EQUITY'}
                    for x in items3[:8] if isinstance(x, list) and len(x) >= 2]
    except Exception:
        pass
    # 방법 4: Naver Finance 검색 페이지 스크래핑
    try:
        url4 = f"https://finance.naver.com/search/searchList.nhn?query={urllib.parse.quote(query)}"
        r4 = requests.get(url4, headers={'User-Agent': 'Mozilla/5.0',
                                         'Accept-Language': 'ko-KR,ko;q=0.9'}, timeout=7)
        r4.encoding = 'utf-8'
        soup4 = BeautifulSoup(r4.text, 'html.parser')
        results4 = []
        for a in soup4.select('table.tbl_search tbody tr td.tit a, .search_list li a[href*="code="]'):
            href = a.get('href', '')
            m = re.search(r'code=(\d{6})', href)
            if m and a.text.strip():
                code = m.group(1)
                if not any(x['symbol'] == code for x in results4):
                    results4.append({'symbol': code, 'shortname': a.text.strip(),
                                     'exchange': 'KRX', 'quoteType': 'EQUITY'})
        if results4:
            return results4[:8]
    except Exception:
        pass
    return []

@st.cache_data(ttl=300)
def search_stocks_fn(query):
    if has_korean(query):
        return search_kr_naver(query)
    results = []
    try:
        from yfinance import Search
        for r in Search(query, max_results=8, news_count=0).quotes:
            if r.get('quoteType') in ('EQUITY','ETF','CRYPTOCURRENCY','FUTURE','CURRENCY'):
                results.append(r)
    except Exception:
        pass
    existing = {r.get('symbol') for r in results}
    for r in search_kr_naver(query):
        if r['symbol'] not in existing:
            results.append(r)
    if not results:
        try:
            info = yf.Ticker(query.upper()).info
            if info.get('symbol'):
                results.append({'symbol': info['symbol'], 'shortname': info.get('shortName', query),
                                'exchange': info.get('exchange', ''), 'quoteType': info.get('quoteType', '')})
        except Exception:
            pass
    return results

@st.cache_data(ttl=3600)
def get_earnings_data(ticker):
    try:
        stock = yf.Ticker(ticker)
        try:   qi = stock.quarterly_income_stmt
        except AttributeError: qi = stock.quarterly_financials
        hist_rev = hist_ni = hist_eps = hist_guidance_eps = None
        if qi is not None and not qi.empty:
            for row in qi.index:
                rs = str(row).lower().replace(' ','').replace('_','')
                if 'totalrevenue' in rs:
                    hist_rev = qi.loc[row].dropna().sort_index()
                elif 'netincome' in rs and 'minority' not in rs and 'noncontrolling' not in rs:
                    hist_ni = qi.loc[row].dropna().sort_index()
                elif ('dilutedeps' in rs or 'basiceps' in rs or
                      ('earningspershare' in rs and 'diluted' in rs)):
                    hist_eps = qi.loc[row].dropna().sort_index()
        try:
            eq = stock.quarterly_earnings
            if eq is not None and not eq.empty:
                if hist_eps is None and 'Reported EPS' in eq.columns:
                    hist_eps = eq['Reported EPS'].dropna().sort_index()
                if hist_guidance_eps is None and 'Estimated EPS' in eq.columns:
                    hist_guidance_eps = eq['Estimated EPS'].dropna().sort_index()
        except Exception:
            pass
        fwd_rev = fwd_eps = None
        try:
            re_est = stock.revenue_estimate
            ep_est = stock.earnings_estimate
            if re_est is not None and not re_est.empty and 'avg' in re_est.columns:
                fwd_rev = {p: re_est.loc[p,'avg'] for p in ['0q','1q'] if p in re_est.index}
            if ep_est is not None and not ep_est.empty and 'avg' in ep_est.columns:
                fwd_eps = {p: ep_est.loc[p,'avg'] for p in ['0q','1q'] if p in ep_est.index}
        except Exception:
            pass
        return {'hist_rev': hist_rev, 'hist_ni': hist_ni, 'hist_eps': hist_eps,
                'hist_guidance_eps': hist_guidance_eps, 'fwd_rev': fwd_rev, 'fwd_eps': fwd_eps}
    except Exception:
        return None

@st.cache_data(ttl=1800)
def get_stock_news_and_recs(ticker):
    try:
        stock = yf.Ticker(ticker)
        news_list = []
        for n in (stock.news or [])[:8]:
            content = n.get('content', {})
            if isinstance(content, dict):
                title  = content.get('title', '')
                link   = (content.get('canonicalUrl') or {}).get('url', '') or content.get('link', '')
                pub    = (content.get('provider') or {}).get('displayName', '')
                pub_ts = content.get('pubDate', '')
            else:
                title  = n.get('title', ''); link = n.get('link', '')
                pub    = n.get('publisher', ''); pub_ts = n.get('providerPublishTime', '')
            if title and link and title not in {x['title'] for x in news_list}:
                date_str = ''
                if pub_ts:
                    try:
                        date_str = (datetime.fromtimestamp(pub_ts).strftime('%m/%d')
                                    if isinstance(pub_ts, (int, float)) else str(pub_ts)[:10])
                    except Exception: pass
                news_list.append({'title': title, 'link': link, 'publisher': pub, 'date': date_str})
            if len(news_list) >= 5: break
        recs = []
        try:
            rdf = stock.recommendations
            if rdf is not None and not rdf.empty:
                for _, row in rdf.tail(6).iterrows():
                    firm   = str(row.get('Firm', '')).strip()
                    action = str(row.get('To Grade', row.get('Action', ''))).strip()
                    frm    = str(row.get('From Grade', '')).strip()
                    if firm and action: recs.append({'firm': firm, 'action': action, 'from': frm})
        except Exception: pass
        return {'news': news_list, 'recs': recs}
    except Exception:
        return None

def get_effective_sector(s):
    """종목의 실질 섹터 — sector 필드 우선, 없으면 ETF 매핑으로 fallback"""
    sec = s.get('sector', '')
    if sec and str(sec) not in ('N/A', 'nan', 'None', ''):
        return str(sec)
    tkr = str(s.get('ticker', '')).upper()
    if tkr in US_ETF_SECTOR: return US_ETF_SECTOR[tkr]
    if tkr in KR_ETF_SECTOR: return KR_ETF_SECTOR[tkr]
    return ''

def analyze_portfolio(stocks, label='전체 포트폴리오'):
    if not stocks: return None
    total = sum(s['cur_krw'] for s in stocks)
    if total <= 0: return None
    us_val   = sum(s['cur_krw'] for s in stocks if s['is_us'])
    us_pct   = us_val / total * 100
    def sec_pct(kws):
        v = sum(s['cur_krw'] for s in stocks
                if any(k.lower() in get_effective_sector(s).lower() for k in kws))
        return v / total * 100
    tech_pct    = sec_pct(['AI','반도체','빅테크','IT','기술','Technology'])
    bond_pct    = sec_pct(['채권','bond','Bond'])
    battery_pct = sec_pct(['2차전지','배터리'])
    defense_pct = sec_pct(['방산','우주항공','항공','Defense','Aerospace'])
    bio_pct     = sec_pct(['바이오','헬스','Bio','Health'])
    risk = '낮음'
    if tech_pct > 50 or battery_pct > 30: risk = '높음'
    elif tech_pct > 30 or us_pct > 75: risk = '보통'
    # 실제 보유 종목 기반 섹터 분석
    sector_breakdown = {}
    for s in stocks:
        sec = get_effective_sector(s) or '기타'
        sector_breakdown[sec] = sector_breakdown.get(sec, 0) + s['cur_krw']
    top_sectors = sorted(sector_breakdown.items(), key=lambda x: -x[1])[:5]
    sector_summary = ' · '.join(f"{sec} {v/total*100:.0f}%" for sec, v in top_sectors)

    insights = [f"📊 보유 섹터 구성: {sector_summary}"]
    if tech_pct > 40:
        insights.append(f"📌 AI·기술 집중도 {tech_pct:.0f}% — 빅테크 실적 미스·금리 재인상 시 포트폴리오 전체가 흔들릴 수 있습니다.")
    if bond_pct < 8:
        insights.append(f"📌 안전자산(채권·금) {bond_pct:.0f}% — TLT·BND·GLD 10~15% 편입으로 변동성 완충을 권장합니다.")
    if battery_pct > 20:
        insights.append(f"📌 2차전지 {battery_pct:.0f}% — 중국 CATL 가격 공세와 전기차 수요 둔화로 단기 변동성 주의.")
    if battery_pct > 0 and battery_pct <= 20:
        insights.append(f"📌 2차전지 {battery_pct:.0f}% — 적정 비중. 에코프로·LG에솔 실적 추이 모니터링 권장.")
    if us_pct > 80:
        insights.append(f"📌 미국 자산 {us_pct:.0f}% — 달러 약세 전환·환율 변동 시 원화 환산 손실 위험.")
    if defense_pct < 3:
        insights.append(f"📌 방산·우주 {defense_pct:.0f}% — 지정학 리스크 고조 국면, ITA·LMT·한화에어로 편입 고려.")
    if bio_pct < 5:
        insights.append(f"📌 헬스케어·바이오 {bio_pct:.0f}% — AI 신약 개발 붐, XLV 5~10% 편입 권장.")
    insights.append("💡 현금 5~10%(MMF·단기채) 유지로 조정 시 저점 매수 기회를 확보하세요.")
    return {'label': label, 'risk': risk, 'us_pct': us_pct, 'tech_pct': tech_pct,
            'bond_pct': bond_pct, 'battery_pct': battery_pct, 'defense_pct': defense_pct,
            'insights': insights}

@st.cache_data(ttl=1800)
def get_most_active_us():
    try:
        url = ("https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
               "?formatted=false&lang=en-US&region=US&scrIds=most_actives&count=10&start=0")
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=10)
        quotes = r.json()['finance']['result'][0]['quotes']
        return [{'ticker': q['symbol'], 'name': q.get('shortName', q['symbol']),
                 'price': q.get('regularMarketPrice', 0),
                 'change_pct': q.get('regularMarketChangePercent', 0),
                 'volume': q.get('regularMarketVolume', 0)} for q in quotes[:10]]
    except Exception:
        pass
    try:
        from yfinance import Screener
        data = Screener().set_predefined_body("most_actives").fetch()
        return [{'ticker': q['symbol'], 'name': q.get('shortName', q['symbol']),
                 'price': q.get('regularMarketPrice', 0),
                 'change_pct': q.get('regularMarketChangePercent', 0),
                 'volume': q.get('regularMarketVolume', 0)} for q in data.get('quotes', [])[:10]]
    except Exception:
        return []

@st.cache_data(ttl=1800)
def get_most_active_kr():
    """네이버 증권 거래량 상위 — 모바일 API 우선, 직접 스크래핑 fallback"""
    fetch_date = datetime.now().strftime('%Y-%m-%d')

    # 방법 1: Naver mobile stock API (JSON)
    for market_param in ['KOSPI', 'KOSDAQ']:
        try:
            url = f"https://m.stock.naver.com/api/stocks/top?type=VOLUME&count=10&market={market_param}"
            r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0',
                                           'Referer': 'https://m.stock.naver.com/'}, timeout=10)
            if r.status_code == 200:
                items = r.json()
                if isinstance(items, list) and len(items) > 0:
                    results = []
                    for x in items[:10]:
                        try:
                            price = int(str(x.get('closePrice','0')).replace(',',''))
                        except: price = 0
                        try:
                            pct = float(str(x.get('fluctuationsRatio','0')).replace(',',''))
                        except: pct = 0.0
                        try:
                            vol = int(str(x.get('accumulatedTradingVolume','0')).replace(',',''))
                        except: vol = 0
                        results.append({
                            'ticker': str(x.get('itemCode', x.get('code', ''))),
                            'name': str(x.get('stockName', x.get('name', ''))),
                            'price': price, 'change_pct': pct, 'volume': vol, 'market': market_param
                        })
                    if results:
                        return {'items': results[:10], 'date': fetch_date}
        except Exception:
            pass

    # 방법 2: Naver Finance sise_quant HTML 스크래핑
    results = []
    for sosok, mkt in [('0', 'KOSPI'), ('1', 'KOSDAQ')]:
        if len(results) >= 10: break
        try:
            url = f"https://finance.naver.com/sise/sise_quant.nhn?sosok={sosok}"
            r = requests.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Charset': 'euc-kr,utf-8;q=0.7,*;q=0.3',
                'Referer': 'https://finance.naver.com/'
            }, timeout=15)
            r.encoding = 'euc-kr'
            soup = BeautifulSoup(r.text, 'html.parser')
            # 날짜 파싱
            for el in soup.select('caption, .tbl_type3 caption, span.tit_type'):
                m = re.search(r'(\d{4})[.\-](\d{2})[.\-](\d{2})', el.text)
                if m:
                    fetch_date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"; break
            # 테이블 파싱 — tbody 태그 없는 구조이므로 tr 직접 선택
            rows = soup.select('table.type_2 tr')
            for row in rows:
                cells = row.select('td')
                if len(cells) < 6: continue
                # 링크에서 종목코드 추출
                link_el = None
                for td in cells:
                    a = td.select_one('a[href*="code="]')
                    if a:
                        link_el = a; break
                if not link_el: continue
                name = link_el.text.strip()
                if not name: continue
                m2 = re.search(r'code=(\d{6})', link_el.get('href', ''))
                if not m2: continue
                ticker = m2.group(1)
                # sise_quant 컬럼: 순위|종목명|현재가|전일비|등락률|거래량|전일거래량|...
                price = chg_pct = volume = 0
                try: price  = int(cells[2].text.replace(',','').strip())
                except: pass
                try:
                    chg_text = cells[4].text.strip()
                    chg_raw  = re.sub(r'[^\d.]', '', chg_text)
                    chg_pct  = float(chg_raw) if chg_raw else 0.0
                    if '-' in chg_text or '▼' in chg_text: chg_pct = -chg_pct
                except: pass
                try: volume = int(cells[5].text.replace(',','').strip())
                except: volume = 0
                results.append({'ticker': ticker, 'name': name, 'price': price,
                                'change_pct': chg_pct, 'volume': volume, 'market': mkt})
                if len(results) >= 10: break
        except Exception:
            continue

    # 방법 3: yfinance KOSPI 구성 종목으로 대체
    if not results:
        KR_FALLBACK = [
            ('005930','삼성전자'),('000660','SK하이닉스'),('373220','LG에너지솔루션'),
            ('207940','삼성바이오로직스'),('005380','현대차'),('000270','기아'),
            ('051910','LG화학'),('068270','셀트리온'),('035420','NAVER'),('035720','카카오'),
        ]
        for ticker, name in KR_FALLBACK:
            try:
                d = get_kr_stock_data(ticker)
                if d:
                    results.append({'ticker': ticker, 'name': name, 'price': d['current_price'],
                                    'change_pct': d['change_pct'], 'volume': 0, 'market': 'KOSPI'})
            except Exception:
                pass

    return {'items': results[:10], 'date': fetch_date}

@st.cache_data(ttl=3600)
def get_tech_news():
    news, seen = [], set()
    for sym in ['QQQ', 'NVDA', 'MSFT', 'SPY', 'AI']:
        try:
            for n in (yf.Ticker(sym).news or [])[:4]:
                content = n.get('content', {})
                if isinstance(content, dict):
                    title = content.get('title', '')
                    link  = (content.get('canonicalUrl') or {}).get('url', '') or content.get('link', '')
                    pub   = (content.get('provider') or {}).get('displayName', '')
                else:
                    title = n.get('title', ''); link = n.get('link', ''); pub = n.get('publisher', '')
                if title and title not in seen and link:
                    seen.add(title)
                    news.append({'title': title, 'link': link, 'publisher': pub})
        except Exception: pass
    return news[:10]

@st.cache_data(ttl=1800)
def get_sector_performance():
    results = []
    for name, (etf, weight) in SECTOR_ETFS.items():
        try:
            hist = yf.Ticker(etf).history(period='5d')
            if len(hist) >= 2:
                cur = hist['Close'].iloc[-1]; prev = hist['Close'].iloc[-2]
                results.append({'sector': name, 'pct': round((cur-prev)/prev*100, 2), 'weight': weight})
        except Exception: pass
    return results

@st.cache_data(ttl=1800)
def get_kospi_sector_performance():
    results = []
    for name, (etf, weight) in KOSPI_SECTOR_ETFS.items():
        try:
            hist = yf.Ticker(etf).history(period='5d')
            if len(hist) >= 2:
                cur = hist['Close'].iloc[-1]; prev = hist['Close'].iloc[-2]
                results.append({'sector': name, 'pct': round((cur-prev)/prev*100, 2), 'weight': weight})
        except Exception: pass
    return results

@st.cache_data(ttl=1800)
def get_sp500_mini_heatmap():
    """Finviz-style mini S&P500 heatmap — major stocks per sector, batch price fetch"""
    HMAP = [
        # (ticker, sector, weight)
        ('AAPL','기술',7.0),('MSFT','기술',6.5),('NVDA','기술',5.8),('AVGO','기술',2.0),
        ('ORCL','기술',1.2),('AMD','기술',1.0),('QCOM','기술',0.8),('TXN','기술',0.6),
        ('META','통신서비스',2.5),('GOOGL','통신서비스',2.0),('GOOG','통신서비스',1.8),
        ('NFLX','통신서비스',0.9),('DIS','통신서비스',0.6),('T','통신서비스',0.4),
        ('BRK-B','금융',1.8),('JPM','금융',1.7),('V','금융',1.5),('MA','금융',1.2),
        ('BAC','금융',0.8),('GS','금융',0.5),('MS','금융',0.5),
        ('UNH','헬스케어',1.4),('LLY','헬스케어',1.3),('JNJ','헬스케어',1.1),
        ('ABBV','헬스케어',0.9),('MRK','헬스케어',0.8),('AMGN','헬스케어',0.5),
        ('AMZN','소비재',3.5),('TSLA','소비재',1.0),('HD','소비재',0.8),
        ('BKNG','소비재',0.5),('NKE','소비재',0.5),
        ('CAT','산업재',0.6),('RTX','산업재',0.5),('LMT','산업재',0.5),
        ('BA','산업재',0.4),('DE','산업재',0.4),('UPS','산업재',0.4),
        ('XOM','에너지',1.2),('CVX','에너지',0.9),('COP','에너지',0.5),('SLB','에너지',0.3),
        ('WMT','필수소비재',0.8),('COST','필수소비재',0.7),('PG','필수소비재',0.7),
        ('KO','필수소비재',0.6),('PEP','필수소비재',0.5),
        ('NEE','유틸리티',0.5),('DUK','유틸리티',0.3),('SO','유틸리티',0.3),
        ('LIN','소재',0.5),('APD','소재',0.2),('NEM','소재',0.2),('FCX','소재',0.2),
        ('PLD','부동산',0.4),('AMT','부동산',0.3),('EQIX','부동산',0.3),
    ]
    tickers = [r[0] for r in HMAP]
    try:
        raw = yf.download(tickers, period='2d', auto_adjust=True, progress=False)
        closes = raw['Close']
        result = []
        for tkr, sector, weight in HMAP:
            try:
                col = closes[tkr] if tkr in closes.columns else None
                if col is None: continue
                s = col.dropna()
                if len(s) < 2: continue
                cur, prev = float(s.iloc[-1]), float(s.iloc[-2])
                pct = (cur - prev) / prev * 100
                result.append({'ticker': tkr, 'sector': sector, 'weight': weight,
                                'price': round(cur, 2), 'pct': round(pct, 2)})
            except Exception:
                continue
        return result
    except Exception:
        return []

# ─── Portfolio Calc ───────────────────────────────────────────────────
def collect_stocks(usd_krw, account_filter='ALL', need_history=False):
    total_inv = total_cur = 0.0
    stocks = []
    accs = ACCOUNTS if account_filter == 'ALL' else [account_filter]
    for acc in accs:
        for s in st.session_state.portfolios.get(acc, []):
            is_us = not is_kr_ticker(s['ticker'])
            # Use fast price fetch for cards; full data only when need_history=True
            if need_history and is_us:
                data = get_us_stock_data(s['ticker'])
                spark_src = data.get('hist') if data else None
            elif is_us:
                data = get_us_price_fast(s['ticker'])
                spark_src = None  # no sparkline in fast mode
            else:
                data = get_kr_stock_data(s['ticker'])
                spark_src = get_kr_stock_history(s['ticker'])  # always fetch (TTL=1800s, cached)
            if not data: continue
            rate    = usd_krw if is_us else 1.0
            inv_krw = s['avg_price'] * s['quantity'] * rate
            cur_krw = data['current_price'] * s['quantity'] * rate
            total_inv += inv_krw; total_cur += cur_krw
            # Sparkline from fast data or history
            if spark_src is None and data.get('spark'):
                spark_vals = data['spark']
            elif spark_src is not None and hasattr(spark_src, 'empty') and not spark_src.empty:
                spark_vals = spark_src['Close'].tail(60).tolist()
            else:
                spark_vals = []
            stocks.append({
                'acc': acc, 'acc_name': ACCOUNT_NAMES[acc],
                'name': s['name'], 'ticker': s['ticker'],
                'quantity': s['quantity'], 'avg_price': s['avg_price'],
                'current_price': data['current_price'], 'change': data['change'],
                'change_pct': data['change_pct'], 'inv_krw': inv_krw, 'cur_krw': cur_krw,
                'profit': cur_krw - inv_krw,
                'profit_rate': ((cur_krw - inv_krw) / inv_krw * 100) if inv_krw > 0 else 0.0,
                'is_us': is_us, 'spark_vals': spark_vals,
                'sector': s.get('sector', 'N/A'),
            })
    return total_inv, total_cur, stocks

# ─── Market Bar (HTML + Yahoo Finance links) ──────────────────────────
usd_krw     = get_usd_krw_rate()
market_data = get_market_data()

if market_data:
    html_items = ''
    for m in market_data:
        n, p, pct = m['name'], m['price'], m['pct']
        ticker_raw = m['ticker']
        yf_url = f"https://finance.yahoo.com/chart/{urllib.parse.quote(ticker_raw)}"
        sign = '+' if pct >= 0 else ''
        cls  = 'mu' if pct >= 0 else 'md'
        svg  = make_svg_spark(m.get('spark', []), 48, 18, pct >= 0)
        if n == 'BTC':              ps = f"${p:,.0f}"
        elif n in ('ETH', 'Gold'):  ps = f"${p:,.2f}"
        elif n == 'USD/KRW':        ps = f"₩{p:,.2f}"
        elif n == 'VIX':            ps = f"{p:.2f}"
        else:                       ps = f"{p:,.2f}"
        cs = f"{sign}{pct:.2f}%"
        html_items += (
            f'<a href="{yf_url}" target="_blank" class="mi">'
            f'{svg}<div class="mi-info">'
            f'<span class="ml">{n}</span><span class="mp">{ps}</span>'
            f'<span class="{cls}">{cs}</span></div></a>')
    st.markdown(f'<div class="mbar">{html_items}</div>', unsafe_allow_html=True)

# ─── 다온 tagline ─────────────────────────────────────────────────────
st.markdown(
    '<div style="text-align:center;padding:5px 0 1px;color:#334155;'
    'font-size:11px;letter-spacing:0.20em;font-family:\'Inter\',sans-serif;font-weight:500">'
    '다온 &nbsp;·&nbsp; 모든 좋은 것이 모여드는 투자 공간'
    '</div>',
    unsafe_allow_html=True)

# ─── Hero Section (global, always visible) ────────────────────────────
_h_inv, _h_cur, _ = collect_stocks(usd_krw, 'ALL', need_history=False)
if _h_inv > 0:
    _h_profit = _h_cur - _h_inv
    _h_rate   = _h_profit / _h_inv * 100
    _h_cls    = 'hero-pnl-pos' if _h_profit >= 0 else 'hero-pnl-neg'
    _h_arrow  = '↑' if _h_profit >= 0 else '↓'
    _h_ps     = '+' if _h_profit >= 0 else ''
    st.markdown(
        f'<div class="daon-hero">'
        f'<div class="hero-app-name">다온 포트폴리오</div>'
        f'<div class="hero-label">총 평가액</div>'
        f'<div class="hero-value">₩{_h_cur:,.0f}</div>'
        f'<div class="hero-pnl">'
        f'<span class="{_h_cls}">{_h_arrow} ₩{abs(_h_profit):,.0f}</span>'
        f'&nbsp;<span class="{_h_cls}">({_h_ps}{_h_rate:.2f}%)</span>'
        f'</div></div>',
        unsafe_allow_html=True)

# ─── Navigation (icon above text) ────────────────────────────────────
st.markdown('<div class="nav-wrap" style="height:6px"></div>', unsafe_allow_html=True)
st.markdown('<div class="nav-wrap">', unsafe_allow_html=True)
nc = st.columns(len(TAB_NAMES))
for i, (col, name, disp) in enumerate(zip(nc, TAB_NAMES, TAB_DISPLAY)):
    if col.button(disp, key=f'nav_{i}',
                  type='primary' if st.session_state.active_tab == i else 'secondary',
                  use_container_width=True):
        st.session_state.active_tab = i
        st.session_state.expanded_card = None
        st.rerun()
st.markdown('</div>', unsafe_allow_html=True)
st.markdown('<div style="height:4px"></div>', unsafe_allow_html=True)
active = st.session_state.active_tab

# ═══ TAB 0: 💼 보유 ══════════════════════════════════════════════════
if active == 0:
    # ── 계좌 선택 드롭다운 + 뷰 옵션 ──
    acc_opts_map = {'전체': 'ALL', '🇺🇸 미국': 'US', '🇰🇷 퇴직': 'KR_RETIRE',
                    '🇰🇷 개별': 'KR_PERSONAL', '🇰🇷 ISA': 'KR_ISA'}
    acc_opts_list = list(acc_opts_map.keys())

    # ── 필터: 계좌 | 평가액/시세 토글 | 달러$ | 정렬기준 | 높은순/낮은순 토글 ──
    r1c1, r1c2, r1c3, r1c4, r1c5 = st.columns([2, 2, 1, 2, 2])
    with r1c1:
        sel_acc_name = st.selectbox('계좌', acc_opts_list, key='acc_select_box',
                                    label_visibility='collapsed')
        filter_key = acc_opts_map[sel_acc_name]
    with r1c2:
        vt = st.segmented_control('보기', ['평가액', '시세'], default='평가액',
                                  key='view_seg', label_visibility='collapsed')
        view_type = '💰 평가액' if (vt == '평가액' or vt is None) else '📈 시세'
    with r1c3:
        show_usd = st.checkbox('$', key='usd_check', help='달러 표시')
    with r1c4:
        sort_by = st.selectbox('정렬', ['평가액','매입금액','총 수익','수익률'],
                               key='sort_by_sel', label_visibility='collapsed')
    with r1c5:
        so = st.segmented_control('순서', ['높은순','낮은순'], default='높은순',
                                  key='sort_seg', label_visibility='collapsed')
        sort_order = so if so else '높은순'

    total_inv, total_cur, all_stocks = collect_stocks(usd_krw, filter_key, need_history=False)

    # Apply sort
    sort_field_map = {'평가액': 'cur_krw', '매입금액': 'inv_krw', '총 수익': 'profit', '수익률': 'profit_rate'}
    sf = sort_field_map.get(sort_by, 'cur_krw')
    all_stocks.sort(key=lambda x: x[sf], reverse=(sort_order == '높은순'))

    if total_inv > 0:
        profit = total_cur - total_inv; prate = (profit / total_inv) * 100
        pnl_clr = '#16A34A' if profit >= 0 else '#DC2626'
        ps = '+' if profit >= 0 else ''
        def _sum_card(label, val_str, sub_html=''):
            right = (f'<div style="text-align:right">'
                     f'<span style="font-size:14px;font-weight:700;color:#0F172A">{val_str}</span>'
                     f'{sub_html}</div>') if sub_html else (
                     f'<span style="font-size:14px;font-weight:700;color:#0F172A">{val_str}</span>')
            return (f'<div style="padding:10px 4px 8px;border-bottom:1px solid #F1F5F9">'
                    f'<div style="display:flex;justify-content:space-between;align-items:baseline">'
                    f'<span style="font-size:12px;color:#94A3B8;font-weight:500">{label}</span>'
                    f'{right}'
                    f'</div></div>')
        mc1, mc2, mc3 = st.columns(3)
        with mc1: st.markdown(_sum_card('평가액', f'₩{total_cur:,.0f}'), unsafe_allow_html=True)
        with mc2: st.markdown(_sum_card('손익', f'₩{profit:,.0f}',
            f'<div style="font-size:11px;font-weight:700;color:{pnl_clr};margin-top:3px">'
            f'{ps}{prate:.2f}%</div>'), unsafe_allow_html=True)
        with mc3: st.markdown(_sum_card('투자금', f'₩{total_inv:,.0f}'), unsafe_allow_html=True)
        st.markdown('<div style="height:6px"></div>', unsafe_allow_html=True)

    if not all_stocks:
        st.info("보유 종목이 없습니다. '추가' 탭에서 종목을 추가하세요.")
    else:
        for si, s in enumerate(all_stocks):
            is_pos   = s['profit'] >= 0
            ps       = '+' if is_pos else ''
            pill_cls = 'pu' if is_pos else 'pd'
            if view_type == '💰 평가액':
                main = (f"${s['cur_krw']/usd_krw:,.2f}" if s['is_us'] and show_usd
                        else f"₩{s['cur_krw']:,.0f}")
                pill = f"{ps}{s['profit_rate']:.2f}%"
            else:
                main = (f"${s['current_price']:.2f}" if s['is_us'] and show_usd
                        else (f"₩{s['current_price']*usd_krw:,.0f}" if s['is_us']
                              else f"₩{s['current_price']:,}"))
                pill = f"{ps}{s['change_pct']:.2f}%"

            qty_str  = str(int(s['quantity']))
            avg_str  = f"${s['avg_price']:.2f}" if s['is_us'] else f"₩{int(s['avg_price']):,}"
            spark    = make_svg_spark(s['spark_vals'], 80, 24, is_pos) if s['spark_vals'] else ''
            card_key = f"{s['acc']}_{s['ticker']}_{si}"
            is_exp   = st.session_state.expanded_card == card_key

            col_card, col_edit, col_chart = st.columns([11, 1, 1])
            with col_card:
                tok_pnl_cls = 'tok-up' if is_pos else 'tok-dn'
                st.markdown(
                    f'<div class="tok{" active" if is_exp else ""}">'
                    f'<div class="tok-left">'
                    f'{logo_html(s["ticker"])}'
                    f'<div><div class="tok-name">{s["name"]}</div>'
                    f'<div class="tok-sub">{s["ticker"]} · {s["acc_name"]} · {qty_str}주 · {avg_str}</div>'
                    f'</div></div>'
                    f'<div class="tok-mid">{spark}</div>'
                    f'<div class="tok-right">'
                    f'<div class="tok-price">{main}</div>'
                    f'<div class="{tok_pnl_cls}">{pill}</div>'
                    f'</div></div>',
                    unsafe_allow_html=True)
            with col_edit:
                if st.button("✏️", key=f"ed_{card_key}", use_container_width=True, help="수정"):
                    st.session_state.expanded_card = None if is_exp else card_key; st.rerun()
            with col_chart:
                if st.button("📈", key=f"ch_{card_key}", use_container_width=True, help="차트"):
                    st.session_state.chart_ticker = s['ticker']
                    st.session_state.active_tab = TAB_IDX['차트']; st.rerun()

            if is_exp:
                with st.container():
                    ec1, ec2, ec3 = st.columns(3)
                    with ec1:
                        new_name   = st.text_input("종목명", value=s['name'], key=f"en_{card_key}")
                        new_sector = st.text_input("섹터", value=s['sector'] if s['sector'] not in ('N/A','nan','None','') else '', key=f"es_{card_key}")
                    with ec2:
                        new_acc = st.selectbox("계좌 이동", ACCOUNTS, index=ACCOUNTS.index(s['acc']),
                                               format_func=lambda x: ACCOUNT_NAMES[x], key=f"eacc_{card_key}")
                        if s['is_us']:
                            new_qty = st.number_input("수량", value=float(s['quantity']), min_value=0.0, step=0.1, key=f"eq_{card_key}")
                        else:
                            new_qty = float(st.number_input("수량", value=int(s['quantity']), min_value=0, key=f"eq_{card_key}"))
                    with ec3:
                        if s['is_us']:
                            new_avg = st.number_input("평단가 ($)", value=float(s['avg_price']), min_value=0.0, key=f"ea_{card_key}")
                        else:
                            new_avg = float(st.number_input("평단가 (원)", value=int(s['avg_price']), min_value=0, key=f"ea_{card_key}"))
                        if st.button("💾 저장", key=f"sv_{card_key}", type='primary', use_container_width=True):
                            upd = {'ticker': s['ticker'], 'name': new_name, 'quantity': new_qty,
                                   'avg_price': new_avg, 'sector': new_sector}
                            if new_acc != s['acc']:
                                st.session_state.portfolios[s['acc']] = [
                                    x for x in st.session_state.portfolios[s['acc']] if x['ticker'] != s['ticker']]
                                st.session_state.portfolios[new_acc].append(upd)
                            else:
                                for item in st.session_state.portfolios[s['acc']]:
                                    if item['ticker'] == s['ticker']:
                                        item.update(upd); break
                            save_portfolio()
                            st.session_state.expanded_card = None; st.success("저장됨!"); st.rerun()

# ═══ TAB 1: ⭐ 관심 ══════════════════════════════════════════════════
elif active == 1:
    st.markdown('<div class="ttl">⭐ 관심 종목</div>', unsafe_allow_html=True)
    if not st.session_state.watchlist:
        st.info("관심 종목이 없습니다. '탐색' 탭에서 추가하세요.")
    for idx, w in enumerate(st.session_state.watchlist):
        ticker = w['ticker']; is_us = not is_kr_ticker(ticker)
        data   = get_us_price_fast(ticker) if is_us else get_kr_stock_data(ticker)
        is_pos = data['change_pct'] >= 0 if data else True
        pill_c = 'pu' if is_pos else 'pd'
        ps     = '+' if is_pos else ''
        prstr  = (f"${data['current_price']:.2f}" if is_us else f"₩{data['current_price']:,}") if data else "—"
        pctstr = f"{ps}{data['change_pct']:.2f}%" if data else ""
        spark_vals = data.get('spark', []) if (data and is_us) else []
        spark  = make_svg_spark(spark_vals, 80, 24, is_pos) if spark_vals else ''
        wk = f"w_{idx}"; is_exp = st.session_state.expanded_card == wk
        col_card, col_add, col_chart, col_del = st.columns([9, 1, 1, 1])
        with col_card:
            st.markdown(f'''<div class="sc {'active' if is_exp else ''}">
              <div class="sc-left">{logo_html(ticker)}
                <div><div class="sn">{w["name"]}</div>
                <div class="sm">{ticker} · {w.get("exchange","")}</div></div>
              </div>
              <div class="sc-mid">{spark}</div>
              <div class="sc-right"><div class="sp">{prstr}</div>
              <span class="pill {pill_c}">{pctstr}</span></div>
            </div>''', unsafe_allow_html=True)
        with col_add:
            if st.button("📋", key=f"wadd_{idx}", use_container_width=True, help="보유 추가"):
                st.session_state.expanded_card = None if is_exp else wk; st.rerun()
        with col_chart:
            if st.button("📈", key=f"wchart_{idx}", use_container_width=True, help="차트"):
                st.session_state.chart_ticker = ticker
                st.session_state.active_tab = TAB_IDX['차트']; st.rerun()
        with col_del:
            if st.button("🗑️", key=f"wdel_{idx}", use_container_width=True, help="삭제"):
                st.session_state.watchlist.pop(idx); save_portfolio(); st.rerun()
        if is_exp:
            xc1, xc2, xc3 = st.columns(3)
            with xc1:
                w_acc = st.selectbox("계좌", ACCOUNTS, format_func=lambda x: ACCOUNT_NAMES[x], key=f"wacc_{idx}")
            with xc2:
                w_is_us = (w_acc == 'US')
                if w_is_us: w_qty = st.number_input("수량", min_value=0.0, value=1.0, step=0.1, key=f"wqty_{idx}")
                else:       w_qty = float(st.number_input("수량", min_value=0, value=1, key=f"wqty_{idx}"))
            with xc3:
                if w_is_us: w_avg = st.number_input("평단가 ($)", min_value=0.0, value=100.0, key=f"wavg_{idx}")
                else:       w_avg = float(st.number_input("평단가 (원)", min_value=0, value=50000, key=f"wavg_{idx}"))
                if st.button("포트폴리오 이동", key=f"wmove_{idx}", use_container_width=True, type='primary'):
                    st.session_state.portfolios[w_acc].append(
                        {'ticker': ticker, 'name': w['name'], 'quantity': w_qty, 'avg_price': w_avg, 'sector': ''})
                    st.session_state.watchlist.pop(idx); save_portfolio()
                    st.session_state.expanded_card = None; st.success("추가됨!"); st.rerun()

# ═══ TAB 2: 🔍 탐색 ══════════════════════════════════════════════════
elif active == 2:
    st.markdown('<div class="ttl">🔍 종목 탐색</div>', unsafe_allow_html=True)
    st.caption("종목명(한글/영문) 또는 티커로 검색 — 삼성전자, 005930, AAPL, Apple 등")
    query = st.text_input("검색어", placeholder="예: 삼성전자, 005930, Apple, AAPL, 네이버", key="search_q")
    if query:
        with st.spinner("검색 중..."):
            results = search_stocks_fn(query)
        if not results:
            st.warning("검색 결과가 없습니다.")
        else:
            for r in results:
                sym   = r.get('symbol', ''); name = r.get('shortname') or r.get('longname') or sym
                exch  = r.get('exchange', ''); qtype = r.get('quoteType', '')
                if not sym: continue
                in_watch = any(w['ticker'] == sym for w in st.session_state.watchlist)
                in_port  = any(any(s['ticker'] == sym for s in st.session_state.portfolios.get(a,[])) for a in ACCOUNTS)
                rc1, rc2, rc3 = st.columns([4, 1, 1])
                with rc1:
                    st.markdown(f'''<div class="sc" style="cursor:default"><div class="sc-left">
                      {logo_html(sym)}<div><div class="sn">{name}</div>
                      <div class="sm">{sym} · {exch} · {qtype}</div></div></div></div>''', unsafe_allow_html=True)
                with rc2:
                    if in_watch: st.button("✅ 관심", key=f"srw_{sym}", disabled=True, use_container_width=True)
                    elif st.button("⭐ 관심", key=f"srw_{sym}", use_container_width=True):
                        st.session_state.watchlist.append({'ticker': sym, 'name': name, 'exchange': exch, 'qtype': qtype})
                        save_portfolio(); st.success(f"{name} 관심 추가!"); st.rerun()
                with rc3:
                    if in_port: st.button("✅ 보유", key=f"srp_{sym}", disabled=True, use_container_width=True)
                    elif st.button("📈 차트", key=f"srp_{sym}", use_container_width=True):
                        st.session_state.chart_ticker = sym
                        st.session_state.active_tab = TAB_IDX['차트']; st.rerun()

    # ── YouTube 영상 분석 ──────────────────────────────────────────────
    st.markdown("---")
    st.markdown("**🎬 YouTube 영상 분석 · 관련 종목 탐색**")
    st.caption("투자 관련 YouTube URL을 붙여넣으면 요약 + 관련 종목 분석을 제공합니다")
    yt_url = st.text_input("YouTube URL", placeholder="https://www.youtube.com/watch?v=...", key="yt_url_input")

    def extract_yt_id(url):
        m = re.search(r'(?:v=|youtu\.be/|/v/|/embed/)([A-Za-z0-9_-]{11})', url)
        return m.group(1) if m else None

    @st.cache_data(ttl=3600)
    def fetch_yt_info(vid_id):
        """YouTube oEmbed로 제목/채널 가져오기"""
        try:
            r = requests.get(f"https://www.youtube.com/oembed?url=https://youtube.com/watch?v={vid_id}&format=json", timeout=8)
            if r.status_code == 200: return r.json()
        except: pass
        return None

    # ── API Key 로드/저장 (파일 영구 저장) ──
    _key_file = os.path.join(BASE_DIR, ".anthropic_key")
    if 'anthropic_key' not in st.session_state:
        env_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if env_key:
            st.session_state['anthropic_key'] = env_key
        elif os.path.exists(_key_file):
            with open(_key_file, 'r') as _f:
                st.session_state['anthropic_key'] = _f.read().strip()
        else:
            st.session_state['anthropic_key'] = ''
    if not st.session_state['anthropic_key']:
        with st.expander("🔑 Claude API Key 설정 (YouTube 분석 사용 시 필요, 한 번만 입력)"):
            k = st.text_input("Anthropic API Key", type="password", key="anthropic_key_inp",
                              placeholder="sk-ant-...")
            if k:
                with open(_key_file, 'w') as _f: _f.write(k.strip())
                st.session_state['anthropic_key'] = k.strip()
                st.rerun()

    def analyze_yt_title_claude(title, channel, api_key):
        """제목+채널명 기반 Claude 분석 — requests 직접 호출"""
        if not api_key: return None, "NO_KEY"
        prompt = (f"다음 YouTube 투자 영상 제목과 채널명을 보고 분석해주세요.\n\n"
                  f"제목: {title}\n채널: {channel}\n\n"
                  f"※ 자막 없이 제목만으로 분석하므로 추론 기반입니다. 참고용으로만 활용하세요.\n\n"
                  f"아래 형식으로 한국어로 답변:\n\n"
                  f"## 📋 예상 내용 요약 (3줄)\n제목에서 유추되는 핵심 주제를 설명해주세요.\n\n"
                  f"## 🎯 관련 주식 종목 (티커 포함)\n- 종목명 (TICKER): 관련성 이유\n\n"
                  f"## 📊 종목별 투자 분석\n각 종목에 대해:\n"
                  f"- 투자 매력도: ★★★☆☆ (한 줄 근거)\n- 경쟁 대비 강점: ...\n"
                  f"- 투자 유의사항: ...\n- 관련 ETF: ...")
        for model_id in ["claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022", "claude-3-haiku-20240307"]:
            try:
                resp = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                             "content-type": "application/json"},
                    json={"model": model_id, "max_tokens": 1500,
                          "messages": [{"role": "user", "content": prompt}]},
                    timeout=30)
                if resp.status_code == 200:
                    return resp.json()["content"][0]["text"], "OK"
                err_body = resp.json() if resp.headers.get("content-type","").startswith("application/json") else {}
                err_type = err_body.get("error", {}).get("type", "")
                if resp.status_code in (401, 403) or err_type == "authentication_error":
                    return None, "BAD_KEY"
                if err_type == "not_found_error" or resp.status_code == 404:
                    continue  # 다음 모델 시도
                return None, f"ERR:{resp.status_code} {err_body.get('error',{}).get('message','')}"
            except Exception as e:
                return None, f"ERR:{str(e)[:150]}"
        return None, "ERR:지원되는 모델을 찾을 수 없습니다"

    if yt_url and yt_url.strip():
        vid_id = extract_yt_id(yt_url.strip())
        if not vid_id:
            st.warning("유효한 YouTube URL을 입력해주세요.")
        else:
            yt_info    = fetch_yt_info(vid_id)
            yt_title   = yt_info.get('title','(제목 없음)') if yt_info else '(제목 없음)'
            yt_channel = yt_info.get('author_name','') if yt_info else ''
            st.markdown(
                f'<div style="display:flex;gap:10px;align-items:center;margin:8px 0 12px">'
                f'<img src="https://img.youtube.com/vi/{vid_id}/mqdefault.jpg" '
                f'style="width:120px;border-radius:8px;flex-shrink:0">'
                f'<div><div style="font-size:13px;font-weight:700;color:#0F172A">{yt_title}</div>'
                f'<div style="font-size:11px;color:#94A3B8;margin-top:2px">{yt_channel}</div>'
                f'<div style="font-size:10px;color:#F59E0B;margin-top:3px">'
                f'⚠️ 클라우드 서버 IP 제한으로 자막 추출 불가 → 제목 기반 분석 제공</div>'
                f'</div></div>', unsafe_allow_html=True)
            api_key = st.session_state.get('anthropic_key', '')
            if not api_key:
                st.info("🔑 위 API Key 설정 후 분석이 시작됩니다.")
            else:
                with st.spinner("Claude AI 분석 중..."):
                    analysis, status = analyze_yt_title_claude(yt_title, yt_channel, api_key)
                if status == "OK" and analysis:
                    st.markdown(
                        f'<div class="yt-card"><div class="yt-title">📊 AI 투자 분석 (제목 기반)</div>'
                        f'<div class="yt-body">{analysis.replace(chr(10),"<br>")}</div></div>',
                        unsafe_allow_html=True)
                elif status == "NO_KEY":
                    st.info("🔑 API Key를 먼저 설정해주세요.")
                elif status == "BAD_KEY":
                    st.error("API Key가 유효하지 않습니다. 설정을 확인해주세요.")
                    st.session_state['anthropic_key'] = ''
                else:
                    st.error(f"분석 실패: {status}")

# ═══ TAB 3: 📊 비중 ══════════════════════════════════════════════════
elif active == 3:
    st.markdown('<div class="ttl">자산 비중</div>', unsafe_allow_html=True)
    _, total_cur, all_stocks = collect_stocks(usd_krw, 'ALL', need_history=False)
    if not all_stocks:
        st.info("보유 종목이 없습니다.")
    else:
        av_raw = st.segmented_control('기준', ['종목별','계좌별','유형별'], default='종목별',
                                      key='av_seg', label_visibility='collapsed')
        av = av_raw if av_raw else '종목별'

        # 5색 그라데이션: 진한 파랑 → 연한 파랑 (많은 항목은 순환)
        _base5 = ['#0C4A6E','#0369A1','#0EA5E9','#7DD3FC','#BAE6FD']
        def _grad_colors(n):
            """n개 항목에 대해 5색 팔레트를 그라데이션으로 배분"""
            if n <= 5: return _base5[:n]
            import colorsys
            # 0.7(진한 파랑) → 0.55(청록)로 hue 그라데이션
            result = []
            for i in range(n):
                t_ = i / max(n - 1, 1)
                r_, g_, b_ = colorsys.hls_to_rgb(0.58 - 0.08 * t_, 0.3 + 0.35 * t_, 0.7 - 0.2 * t_)
                result.append(f"#{int(r_*255):02x}{int(g_*255):02x}{int(b_*255):02x}")
            return result
        COLORS = _grad_colors

        def render_alloc(raw, lbl, qty_map=None):
            df = pd.DataFrame(list(raw.items()), columns=[lbl,'금액'])
            t  = df['금액'].sum()
            df['비중(%)'] = (df['금액']/t*100).round(2)
            df['평가액']  = df['금액'].apply(lambda x: f"₩{x:,.0f}")
            if qty_map:
                df['수량'] = df[lbl].map(lambda k: qty_map.get(k, ''))
            df = df.sort_values('비중(%)', ascending=False).reset_index(drop=True)
            n = len(df)
            palette = COLORS(n)
            pc1, pc2 = st.columns([1,1])
            with pc1:
                fig = px.pie(df, values='금액', names=lbl, hole=0.44,
                             color_discrete_sequence=palette)
                fig.update_traces(
                    textinfo='label+percent',
                    textposition='auto',
                    hovertemplate='%{label}<br>₩%{value:,.0f}<extra></extra>',
                    insidetextfont=dict(color='white', size=10, family='Inter'),
                    outsidetextfont=dict(color='#334155', size=9, family='Inter'),
                    marker=dict(line=dict(color='#fff', width=2)))
                fig.update_layout(height=310, margin=dict(l=5,r=5,t=5,b=5), showlegend=False,
                                  font=dict(family='Inter', color='#334155'),
                                  paper_bgcolor='white', plot_bgcolor='white')
                st.plotly_chart(fig, width='stretch')
            with pc2:
                show_cols = [lbl,'평가액','비중(%)']
                if qty_map: show_cols.append('수량')
                st.dataframe(df[show_cols], use_container_width=True, height=310, hide_index=True)

        if av == "종목별":
            qty_m = {s['name']: f"{int(s['quantity'])}주" for s in all_stocks}
            render_alloc({s['name']: s['cur_krw'] for s in all_stocks}, '종목', qty_m)
        elif av == "계좌별":
            d = {}; qty_m = {}
            for s in all_stocks:
                d[s['acc_name']] = d.get(s['acc_name'], 0) + s['cur_krw']
                qty_m[s['acc_name']] = qty_m.get(s['acc_name'], 0) + 1
            qty_m = {k: f"{v}종목" for k,v in qty_m.items()}
            render_alloc(d, '계좌', qty_m)
        else:
            d = {}
            for s in all_stocks:
                k = '미국 주식' if s['is_us'] else '국내 주식'
                d[k] = d.get(k, 0) + s['cur_krw']
            render_alloc({k:v for k,v in d.items() if v>0}, '유형')

        # ── 섹터별 비중 (보유종목 + 수량 + 평가액 포함) ──
        sec_d = {}; sec_stocks = {}
        for s in all_stocks:
            sec = s.get('sector','')
            if sec and sec not in ('N/A','nan','None',''):
                sec_d[sec] = sec_d.get(sec,0)+s['cur_krw']
                sec_stocks.setdefault(sec,[]).append(s)
        if sec_d:
            st.markdown("---"); st.markdown("**섹터별 비중**")
            total_sec = sum(sec_d.values())
            dfs = pd.DataFrame(list(sec_d.items()), columns=['섹터','금액'])
            dfs['비중(%)'] = (dfs['금액']/total_sec*100).round(2)
            dfs = dfs.sort_values('비중(%)', ascending=True)
            # 가로 막대 차트 (그라데이션)
            bar_colors = COLORS(len(dfs))
            fig_s = go.Figure(go.Bar(
                x=dfs['비중(%)'], y=dfs['섹터'], orientation='h',
                marker=dict(color=bar_colors[::-1], opacity=0.85, line_width=0),
                text=[f"{v:.1f}%" for v in dfs['비중(%)']],
                textposition='outside', textfont=dict(color='#334155', size=11)))
            fig_s.update_layout(height=max(200, len(dfs)*42), showlegend=False,
                                 margin=dict(l=5,r=50,t=5,b=5), font=dict(family='Inter',color='#334155'),
                                 paper_bgcolor='white', plot_bgcolor='#F8FAFC',
                                 xaxis=dict(showgrid=False,showticklabels=False,zeroline=False),
                                 yaxis=dict(tickfont=dict(size=12,color='#334155')))
            st.plotly_chart(fig_s, width='stretch')
            # ── 섹터별 종목 상세 (좌측 정렬 리스트) ──
            for sec_name in sorted(sec_d, key=lambda k: sec_d[k], reverse=True):
                pct = sec_d[sec_name]/total_sec*100
                stocks_in_sec = sec_stocks[sec_name]
                with st.expander(f"**{sec_name}** — {pct:.1f}%  ·  ₩{sec_d[sec_name]:,.0f}"):
                    for ss in sorted(stocks_in_sec, key=lambda x: x['cur_krw'], reverse=True):
                        qty_str = f"{int(ss['quantity'])}주"
                        val_str = f"₩{ss['cur_krw']:,.0f}"
                        st.markdown(
                            f'<div style="display:flex;justify-content:space-between;'
                            f'padding:5px 0;border-bottom:1px solid #F1F5F9;font-size:12px">'
                            f'<span style="font-weight:600;color:#0F172A">{ss["name"]}</span>'
                            f'<span style="color:#64748B">{qty_str} &nbsp;·&nbsp; '
                            f'<b style="color:#0F172A">{val_str}</b></span></div>',
                            unsafe_allow_html=True)

        # ── 고수의 제언 ──
        st.markdown("---")
        # 항상 계좌 선택 가능
        acc_choices = ['전체 포트폴리오'] + [ACCOUNT_NAMES[a] for a in ACCOUNTS if st.session_state.portfolios.get(a)]
        sel_ana = st.selectbox("분석 대상 계좌", acc_choices, key="ana_acc_sel")
        if sel_ana == '전체 포트폴리오':
            ana_stocks = all_stocks
            ana_label  = '전체 포트폴리오'
        else:
            acc_key = {v: k for k, v in ACCOUNT_NAMES.items()}.get(sel_ana, 'ALL')
            ana_stocks = [s for s in all_stocks if s['acc'] == acc_key]
            ana_label  = sel_ana

        analysis = analyze_portfolio(ana_stocks, ana_label)
        if analysis:
            risk_cls  = {'높음':'risk-high','보통':'risk-mid','낮음':'risk-low'}.get(analysis['risk'],'risk-mid')
            risk_badge = f'<span class="risk-badge {risk_cls}">리스크 {analysis["risk"]}</span>'
            items_html = ''.join(f'<div class="insight-item">· {ins}</div>' for ins in analysis['insights'])
            st.markdown(f'''<div class="insight-card">
              <div class="insight-title">🏆 고수의 제언 — {analysis["label"]} {risk_badge}</div>
              <div style="font-size:11px;color:#64748B;margin-bottom:8px">
                미국 {analysis["us_pct"]:.0f}% · 기술 {analysis["tech_pct"]:.0f}% ·
                채권 {analysis["bond_pct"]:.0f}% · 방산 {analysis["defense_pct"]:.0f}%
              </div>
              {items_html}
            </div>''', unsafe_allow_html=True)

# ═══ TAB 4: 📈 차트 ══════════════════════════════════════════════════
elif active == 4:
    st.markdown('<div class="ttl">📈 종목 차트 · 심층 분석</div>', unsafe_allow_html=True)
    _, _, all_stocks = collect_stocks(usd_krw, 'ALL', need_history=False)
    all_tickers = [(s['name'],s['ticker'],s['is_us']) for s in all_stocks] + \
                  [(w['name'],w['ticker'],not is_kr_ticker(w['ticker'])) for w in st.session_state.watchlist]

    tc1, tc2 = st.columns([1, 3])
    with tc1:
        manual = st.text_input("티커 직접 입력", placeholder="AAPL, 005930...", key="manual_chart")
    with tc2:
        if all_tickers:
            default_idx = 0
            if st.session_state.chart_ticker:
                for i, (_,t,_) in enumerate(all_tickers):
                    if t == st.session_state.chart_ticker: default_idx = i; break
            disp    = [f"{n} ({t})" for n,t,_ in all_tickers]
            sel_idx = st.selectbox("종목 선택", range(len(disp)),
                                   format_func=lambda i: disp[i], index=default_idx, key="chart_sel")
            sel_name, sel_ticker, sel_is_us = all_tickers[sel_idx]
        else:
            sel_ticker = None; sel_is_us = True; sel_name = ""

    if manual:
        sel_ticker = manual.strip().upper(); sel_is_us = not is_kr_ticker(sel_ticker); sel_name = sel_ticker

    if not sel_ticker:
        st.info("종목을 선택하거나 티커를 직접 입력하세요.")
    else:
        with st.spinner(f"{sel_ticker} 데이터 로딩 중..."):
            data = get_us_stock_data(sel_ticker) if sel_is_us else get_kr_stock_data(sel_ticker)
        if not data:
            st.error(f"'{sel_ticker}' 데이터를 불러올 수 없습니다.")
        else:
            cur = data['current_price']; chg = data['change']; cpct = data['change_pct']
            # ── 현재가 + 변동 + 52주 범위 통합 표시 ──
            chg_clr = '#16A34A' if chg >= 0 else '#DC2626'
            chg_sgn = '+' if chg >= 0 else ''
            pr_fmt = f"${cur:.2f}" if sel_is_us else f"₩{cur:,}"
            if sel_is_us:
                w52h = data.get('week_52_high', 0); w52l = data.get('week_52_low', 0)
            else:
                w52h = w52l = 0
            if sel_is_us and w52h and w52l and w52h > w52l:
                # 현재가 위치 계산
                cur_pct52 = max(2, min(97, (cur - w52l) / (w52h - w52l) * 100))
                st.markdown(
                    f'<div style="padding:14px 8px 12px">'
                    # 제목줄: 현재가 좌 / 변동 우
                    f'<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px">'
                    f'<div style="font-size:11px;color:#94A3B8;font-weight:500">52주 범위</div>'
                    f'<div style="font-size:12px;font-weight:600;color:{chg_clr}">'
                    f'{chg_sgn}{chg:.2f} ({chg_sgn}{cpct:.2f}%)</div>'
                    f'</div>'
                    # 바 (현재가 마커)
                    f'<div style="position:relative;height:5px;background:#E2E8F0;border-radius:3px;margin:0 2px 32px">'
                    # 현재가 마커
                    f'<div style="position:absolute;left:{cur_pct52}%;top:-6px;width:17px;height:17px;'
                    f'border-radius:50%;background:#0EA5E9;border:2.5px solid #fff;'
                    f'box-shadow:0 0 0 1.5px #0EA5E9,0 2px 6px rgba(14,165,233,.35);transform:translateX(-50%)">'
                    # 현재가 라벨 (아래, 회색)
                    f'<div style="position:absolute;top:20px;left:50%;transform:translateX(-50%);'
                    f'font-size:9px;font-weight:700;color:#64748B;white-space:nowrap">{pr_fmt}</div>'
                    f'</div>'
                    f'</div>'
                    # 하단: 저 / 고 (Analyst Low/High 동일 스타일)
                    f'<div style="display:flex;justify-content:space-between;margin-top:4px">'
                    f'<span style="font-size:9px;font-weight:700;color:#64748B">${w52l:.2f} 52주 저</span>'
                    f'<span style="font-size:9px;font-weight:700;color:#64748B">${w52h:.2f} 52주 고</span>'
                    f'</div></div>', unsafe_allow_html=True)
            else:
                st.markdown(
                    f'<div style="padding:14px 8px 12px">'
                    f'<div style="font-size:11px;color:#94A3B8;font-weight:500;margin-bottom:4px">현재가</div>'
                    f'<div style="font-size:24px;font-weight:800;color:#0F172A;letter-spacing:-.02em;line-height:1">{pr_fmt}</div>'
                    f'<div style="font-size:12px;font-weight:600;color:{chg_clr};margin-top:4px">'
                    f'{chg_sgn}{chg:.2f} ({chg_sgn}{cpct:.2f}%)</div>'
                    f'</div>', unsafe_allow_html=True)
            if sel_is_us:
                tm,th,tl = data.get('target_mean'), data.get('target_high'), data.get('target_low')
                rec, na  = data.get('recommendation','N/A'), data.get('num_analysts',0)
                if tm and cur > 0 and th and tl:
                    up = (tm-cur)/cur*100
                    rm = {'buy':'매수','strongBuy':'강력매수','hold':'보유','sell':'매도','underperform':'비중축소'}
                    rec_kor = rm.get(rec, rec)
                    rec_clr = ('#16A34A' if rec in ('buy','strongBuy')
                               else '#DC2626' if rec in ('sell','underperform')
                               else '#64748B')
                    # 목표가 바 — Yahoo Finance 스타일
                    bar_min = min(tl, cur) * 0.98; bar_max = max(th, cur) * 1.02
                    bar_range = bar_max - bar_min
                    cur_pct = max(2, min(97, (cur - bar_min)/bar_range*100))
                    avg_pct = max(2, min(97, (tm  - bar_min)/bar_range*100))
                    lo_pct  = max(2, min(97, (tl  - bar_min)/bar_range*100))
                    hi_pct  = max(2, min(97, (th  - bar_min)/bar_range*100))
                    st.markdown(
                        f'<div class="tgt-bar-wrap">'
                        f'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
                        f'<span style="font-size:12px;font-weight:700;color:#64748B">Analyst Price Targets</span>'
                        f'<span style="font-size:11px;color:{rec_clr};font-weight:700">{rec_kor} ({na}명)</span></div>'
                        f'<div style="position:relative;height:6px;background:#E2E8F0;border-radius:3px;margin:24px 0 40px">'
                        # fill bar (저→고)
                        f'<div style="position:absolute;left:{lo_pct}%;width:{hi_pct-lo_pct}%;height:6px;'
                        f'background:linear-gradient(90deg,#93C5FD,#2563EB);border-radius:3px"></div>'
                        # Low 라벨 (바 아래)
                        f'<div style="position:absolute;left:{lo_pct}%;top:18px;transform:translateX(-50%);'
                        f'font-size:9px;font-weight:700;color:#64748B;white-space:nowrap">${tl:.2f} Low</div>'
                        # High 라벨 (바 아래)
                        f'<div style="position:absolute;left:{hi_pct}%;top:18px;transform:translateX(-50%);'
                        f'font-size:9px;font-weight:700;color:#64748B;white-space:nowrap">${th:.2f} High</div>'
                        # 현재가 마커 (흰 테두리 파란 점)
                        f'<div style="position:absolute;left:{cur_pct}%;top:-5px;width:16px;height:16px;'
                        f'border-radius:50%;background:#0EA5E9;border:2.5px solid #fff;'
                        f'box-shadow:0 0 0 1.5px #0EA5E9;transform:translateX(-50%)">'
                        f'<div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);'
                        f'font-size:9px;font-weight:700;color:#64748B;white-space:nowrap">${cur:.2f} · Current</div></div>'
                        # 평균 목표가 마커 (보라)
                        f'<div style="position:absolute;left:{avg_pct}%;top:-5px;width:16px;height:16px;'
                        f'border-radius:50%;background:#7C3AED;border:2.5px solid #fff;'
                        f'box-shadow:0 0 0 1.5px #7C3AED;transform:translateX(-50%)">'
                        f'<div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);'
                        f'font-size:9px;font-weight:700;color:#7C3AED;white-space:nowrap'
                        f'">${tm:.2f} avg</div></div>'
                        f'</div>'
                        f'<div style="margin-top:8px;font-size:11px;color:#64748B">'
                        f'업사이드 <b style="color:{"#16A34A" if up>=0 else "#DC2626"}">'
                        f'{("+" if up>=0 else "")}{up:.1f}%</b> 여력</div>'
                        f'</div>', unsafe_allow_html=True)

            # ── Yahoo Finance 스타일 차트 상수 ──────────────────────────
            BG_PAPER = '#FFFFFF'; BG_PLOT = '#FFFFFF'
            GRID  = '#F1F5F9';  AXIS_CLR = '#94A3B8'
            UP    = '#00B050';  DN = '#CC0000'
            _xax = dict(gridcolor=GRID, gridwidth=1, linecolor='#E2E8F0', zeroline=False,
                        tickfont=dict(color=AXIS_CLR, size=10),
                        showspikes=True, spikecolor='#94A3B8', spikethickness=1,
                        spikemode='across', spikesnap='cursor')
            _yax = dict(gridcolor=GRID, gridwidth=1, linecolor='#E2E8F0', zeroline=False,
                        tickfont=dict(color=AXIS_CLR, size=10),
                        showspikes=True, spikecolor='#94A3B8', spikethickness=1)
            _hlabel = dict(bgcolor='rgba(255,255,255,.97)', bordercolor='#CBD5E1',
                           font=dict(color='#0F172A', size=11, family='Inter'))
            _cfg = {'scrollZoom': True, 'displayModeBar': False}

            if sel_is_us and 'hist' in data and data['hist'] is not None:
                hist = data['hist']

                # ── ① 캔들스틱 차트 (Yahoo Finance style) ───────────────
                fig1 = go.Figure()
                # 캔들 hover 텍스트 (OHLCV)
                candle_hover = [
                    f"<b>{str(d)[:10]}</b><br>"
                    f"시가: ${o:,.2f}<br>고가: ${h:,.2f}<br>저가: ${l:,.2f}<br>"
                    f"종가: <b>${c:,.2f}</b><br>거래량: {int(v):,}"
                    for d,o,h,l,c,v in zip(
                        hist.index, hist['Open'], hist['High'],
                        hist['Low'], hist['Close'], hist['Volume'])]
                fig1.add_trace(go.Candlestick(
                    x=hist.index, open=hist['Open'], high=hist['High'],
                    low=hist['Low'], close=hist['Close'],
                    name='',
                    increasing=dict(line=dict(color=UP, width=1), fillcolor=UP),
                    decreasing=dict(line=dict(color=DN, width=1), fillcolor=DN),
                    hovertext=candle_hover, hoverinfo='text',
                    showlegend=False))
                for col_, nm_, clr_ in [('MA20','MA20','#0EA5E9'),
                                         ('MA60','MA60','#F59E0B'),
                                         ('MA120','MA120','#A78BFA')]:
                    if col_ in hist.columns:
                        fig1.add_trace(go.Scatter(
                            x=hist.index, y=hist[col_], mode='lines', name=nm_,
                            line=dict(color=clr_, width=1.3),
                            hovertemplate=f'{nm_}: $%{{y:,.2f}}<extra></extra>'))
                if data.get('target_mean'):
                    tm_ = data['target_mean']
                    fig1.add_hline(y=tm_, line_dash='dash', line_color='#EC4899', line_width=1.2,
                        annotation_text=f"목표가 ${tm_:.2f}",
                        annotation_position='right',
                        annotation_font=dict(color='#EC4899', size=10))
                fig1.update_layout(
                    height=420, xaxis_rangeslider_visible=False,
                    paper_bgcolor=BG_PAPER, plot_bgcolor=BG_PLOT,
                    font=dict(family='Inter', color='#334155', size=11),
                    hovermode='x', hoverlabel=_hlabel,
                    legend=dict(orientation='h', y=1.02, x=0,
                                font=dict(color='#475569', size=10)),
                    xaxis=dict(**_xax),
                    yaxis=dict(**_yax, tickprefix='$'),
                    margin=dict(t=36, b=4, l=4, r=4))
                st.plotly_chart(fig1, width='stretch', config=_cfg)

                # ── ② RSI 차트 ─────────────────────────────────────────
                if 'RSI' in hist.columns:
                    fig2 = go.Figure()
                    fig2.add_hrect(y0=70, y1=100,
                        fillcolor='rgba(220,38,38,.04)', line_width=0)
                    fig2.add_hrect(y0=0, y1=30,
                        fillcolor='rgba(22,163,74,.04)', line_width=0)
                    fig2.add_trace(go.Scatter(
                        x=hist.index, y=hist['RSI'], mode='lines', name='RSI',
                        line=dict(color='#6366F1', width=1.5),
                        fill='tozeroy', fillcolor='rgba(99,102,241,.07)',
                        hovertemplate='RSI: <b>%{y:.1f}</b><extra></extra>'))
                    fig2.add_hline(y=70, line_dash='dot', line_color='#DC2626', line_width=1,
                        annotation_text='70', annotation_position='right',
                        annotation_font=dict(color='#DC2626', size=9))
                    fig2.add_hline(y=50, line_dash='dot', line_color='#CBD5E1', line_width=0.8)
                    fig2.add_hline(y=30, line_dash='dot', line_color='#16A34A', line_width=1,
                        annotation_text='30', annotation_position='right',
                        annotation_font=dict(color='#16A34A', size=9))
                    fig2.update_layout(
                        height=150, showlegend=False,
                        paper_bgcolor=BG_PAPER, plot_bgcolor=BG_PLOT,
                        font=dict(family='Inter', color='#334155', size=10),
                        hovermode='x', hoverlabel=_hlabel,
                        xaxis=dict(**_xax),
                        yaxis=dict(**_yax, range=[0,100],
                                   title=dict(text='RSI', font=dict(size=9, color=AXIS_CLR))),
                        margin=dict(t=4, b=4, l=4, r=36))
                    st.plotly_chart(fig2, width='stretch', config=_cfg)

                # ── ③ 거래량 차트 ──────────────────────────────────────
                vc = [UP if c >= o else DN
                      for c, o in zip(hist['Close'], hist['Open'])]
                fig3 = go.Figure()
                fig3.add_trace(go.Bar(
                    x=hist.index, y=hist['Volume'],
                    marker=dict(color=vc, opacity=0.75, line_width=0),
                    name='거래량',
                    hovertemplate='%{x|%Y-%m-%d}<br>거래량: <b>%{y:,}</b><extra></extra>'))
                fig3.update_layout(
                    height=110, showlegend=False, bargap=0.15,
                    paper_bgcolor=BG_PAPER, plot_bgcolor=BG_PLOT,
                    font=dict(family='Inter', color='#334155', size=10),
                    hovermode='x', hoverlabel=_hlabel,
                    xaxis=dict(**_xax),
                    yaxis=dict(**_yax,
                               title=dict(text='Vol', font=dict(size=9, color=AXIS_CLR)),
                               tickformat='.2s'),
                    margin=dict(t=4, b=16, l=4, r=4))
                st.plotly_chart(fig3, width='stretch', config=_cfg)

                # ── ④ 분기 실적 차트 (Revenue / Earnings) ─────────────
                st.markdown("---")
                st.markdown("**분기별 실적 및 전망 (매출·순이익·주당순이익)**")
                eq = get_earnings_data(sel_ticker)
                if eq:
                    fig4 = go.Figure()
                    hr, hn = eq.get('hist_rev'), eq.get('hist_ni')
                    fwd_r = eq.get('fwd_rev') or {}
                    if hr is not None and len(hr) > 0:
                        r8 = hr.tail(8)
                        xr = [quarter_label(d) for d in r8.index]
                        fig4.add_trace(go.Bar(
                            x=xr, y=r8.values/1e9, name='Revenue ($B)',
                            marker=dict(color='#2563EB', opacity=0.88, line_width=0),
                            hovertemplate='%{x}<br>매출: <b>$%{y:.2f}B</b><extra></extra>'))
                    if hn is not None and len(hn) > 0:
                        n8 = hn.tail(8)
                        fig4.add_trace(go.Bar(
                            x=[quarter_label(d) for d in n8.index],
                            y=n8.values/1e9, name='Earnings ($B)',
                            marker=dict(color='#7C3AED', opacity=0.88, line_width=0),
                            hovertemplate='%{x}<br>순이익: <b>$%{y:.2f}B</b><extra></extra>'))
                    if hr is not None and len(hr) > 0 and fwd_r:
                        last_dt = pd.Timestamp(hr.index[-1])
                        fx = [quarter_label(last_dt + pd.DateOffset(months=3*(i+1)))
                              for i in range(len(fwd_r))]
                        fy = [v/1e9 for v in list(fwd_r.values())[:len(fx)]]
                        fig4.add_trace(go.Bar(
                            x=fx, y=fy, name='Revenue Estimate',
                            marker=dict(color='rgba(37,99,235,0.3)',
                                        line=dict(color='#60A5FA', width=1.5)),
                            hovertemplate='%{x}<br>매출예측: <b>$%{y:.2f}B</b><extra></extra>'))
                    fig4.add_hline(y=0, line_color='#E2E8F0', line_width=1)
                    fig4.update_layout(
                        height=260, barmode='group',
                        paper_bgcolor=BG_PAPER, plot_bgcolor=BG_PLOT,
                        font=dict(family='Inter', color='#334155', size=11),
                        hovermode='x unified', hoverlabel=_hlabel,
                        yaxis_title='$B',
                        legend=dict(orientation='h', y=1.06, x=0,
                                    font=dict(color='#475569', size=10)),
                        xaxis=dict(**_xax),
                        yaxis=dict(**_yax),
                        margin=dict(t=32, b=20, l=4, r=4),
                        bargap=0.28, bargroupgap=0.06)
                    st.plotly_chart(fig4, width='stretch', config=_cfg)

                    # EPS Dot 차트 — Beat(초록)/Miss(빨강) 컬러링, 가이던스(빈 원) 비교
                    he = eq.get('hist_eps'); hg = eq.get('hist_guidance_eps')
                    fe = eq.get('fwd_eps') or {}
                    if he is not None and len(he) > 0:
                        e6 = he.tail(6)
                        x_hist = [quarter_label(d) for d in e6.index]
                        y_hist = e6.values.tolist()
                        fig5 = go.Figure()
                        # 가이던스 EPS (빈 원) — 먼저 그려서 아래층에
                        if hg is not None and len(hg) > 0:
                            try: g6 = hg.reindex(e6.index)
                            except: g6 = hg
                            gx, gy = [], []
                            for xi, vi in zip(x_hist, g6.values):
                                if not pd.isna(vi): gx.append(xi); gy.append(float(vi))
                            if gx:
                                fig5.add_trace(go.Scatter(
                                    x=gx, y=gy, mode='markers+text',
                                    marker=dict(size=16, color='rgba(0,0,0,0)', symbol='circle',
                                                line=dict(color='#94A3B8', width=2.5)),
                                    text=[f"E${v:.2f}" for v in gy], textposition='bottom center',
                                    textfont=dict(color='#94A3B8', size=9), name='추정 EPS (Estimate)'))
                        # 실적 EPS — 추정 대비 beat=초록, miss=빨강, 없으면 주황
                        guidance_map = {}
                        if hg is not None and len(hg) > 0:
                            try:
                                for dt, v in hg.items():
                                    if not pd.isna(v): guidance_map[quarter_label(dt)] = float(v)
                            except: pass
                        dot_colors = []
                        beat_flags = []
                        for xi, yi in zip(x_hist, y_hist):
                            g = guidance_map.get(xi)
                            if g is not None:
                                if yi > g: dot_colors.append('#00B050'); beat_flags.append('Beat')
                                else:       dot_colors.append('#CC0000'); beat_flags.append('Miss')
                            else:
                                dot_colors.append('#F59E0B'); beat_flags.append('')
                        # 연결선
                        fig5.add_trace(go.Scatter(
                            x=x_hist, y=y_hist, mode='lines',
                            line=dict(color='#CBD5E1', width=1.5, dash='dot'),
                            showlegend=False, hoverinfo='skip'))
                        # 실적 점 (각 색상 개별)
                        for xi, yi, clr, bf in zip(x_hist, y_hist, dot_colors, beat_flags):
                            hover_txt = (f"<b>{xi}</b><br>실적 EPS: <b>${yi:.2f}</b>"
                                         + (f"<br><b>{bf}</b>" if bf else ''))
                            fig5.add_trace(go.Scatter(
                                x=[xi], y=[yi], mode='markers+text',
                                marker=dict(size=14, color=clr, symbol='circle',
                                            line=dict(color=clr, width=2)),
                                text=[f"${yi:.2f}"], textposition='top center',
                                textfont=dict(color=clr, size=10),
                                hovertext=[hover_txt], hoverinfo='text',
                                name='Beat' if bf=='Beat' else ('Miss' if bf=='Miss' else '실적 EPS'),
                                showlegend=False))
                        # 예측 EPS (미래) — 빈 파란 원
                        if fe and len(e6) > 0:
                            last_dt2 = pd.Timestamp(e6.index[-1])
                            fx2 = [quarter_label(last_dt2 + pd.DateOffset(months=3*(i+1))) for i in range(len(fe))]
                            fy2 = list(fe.values())[:len(fx2)]
                            fig5.add_trace(go.Scatter(
                                x=fx2, y=fy2, mode='markers+text',
                                marker=dict(size=16, color='rgba(0,0,0,0)', symbol='circle',
                                            line=dict(color='#38BDF8', width=2.5)),
                                text=[f"${v:.2f}" for v in fy2], textposition='top center',
                                textfont=dict(color='#38BDF8', size=10), name='예측 EPS (Forward)'))
                        # 범례
                        fig5.add_trace(go.Scatter(x=[None],y=[None],mode='markers',
                            marker=dict(size=10,color='#00B050'),name='Beat'))
                        fig5.add_trace(go.Scatter(x=[None],y=[None],mode='markers',
                            marker=dict(size=10,color='#CC0000'),name='Miss'))
                        fig5.add_trace(go.Scatter(x=[None],y=[None],mode='markers',
                            marker=dict(size=10,color='rgba(0,0,0,0)',
                                        line=dict(color='#94A3B8',width=2)),name='Estimate'))
                        fig5.add_hline(y=0, line_color='#E2E8F0', line_width=1)
                        fig5.update_layout(
                            height=260,
                            paper_bgcolor=BG_PAPER, plot_bgcolor=BG_PLOT,
                            font=dict(family='Inter', color='#334155', size=11),
                            hovermode='closest', hoverlabel=_hlabel,
                            yaxis_title='EPS ($)',
                            legend=dict(orientation='h', y=1.08, x=0,
                                        font=dict(color='#475569', size=10)),
                            xaxis=dict(**_xax, tickangle=-30),
                            yaxis=dict(**_yax),
                            margin=dict(t=40, b=30, l=4, r=4))
                        st.plotly_chart(fig5, width='stretch', config=_cfg)
                else:
                    st.info("분기 실적 데이터를 불러올 수 없습니다.")

                st.markdown("---"); st.markdown("**주요 지표**")
                km1,km2,km3,km4 = st.columns(4)
                km1.metric("📅 전일 종가", f"${data['prev_close']:.2f}")
                km1.metric("🔔 개장가",    f"${data['open']:.2f}")
                km2.metric("🔺 당일 고",   f"${data['day_high']:.2f}")
                km2.metric("🔻 당일 저",   f"${data['day_low']:.2f}")
                mc = data.get('market_cap',0); pe = data.get('pe_ratio',0)
                km3.metric("🏢 시가총액",  f"${mc/1e9:.1f}B" if mc else "N/A")
                km3.metric("📐 PER",       f"{pe:.1f}x" if pe else "N/A")
                km4.metric("📦 거래량",    f"{data.get('volume',0):,}")
                km4.metric("🏷️ 섹터",      data.get('sector','N/A'))

            if sel_is_us:
                st.markdown("---")
                nr_col, rec_col = st.columns([3, 2])
                with nr_col:
                    st.markdown("**📰 관련 최신 뉴스 (Top 5)**")
                    nr_data = get_stock_news_and_recs(sel_ticker)
                    if nr_data and nr_data.get('news'):
                        # 종목명/티커 포함된 기사 우선 필터링
                        kw = [sel_ticker.lower(), sel_name.lower()[:6]]
                        scored = []
                        for n in nr_data['news']:
                            tl = n['title'].lower()
                            sc = sum(1 for k in kw if k in tl)
                            scored.append((sc, n))
                        scored.sort(key=lambda x: x[0], reverse=True)
                        shown = 0
                        for sc, n in scored:
                            if shown >= 5: break
                            hi_title = highlight_keywords(n['title'])
                            date_str = f" <span style='color:#64748B'>· {n['date']}</span>" if n.get('date') else ''
                            st.markdown(f'''<div class="news-card">
                              <div class="news-num">{shown+1}</div>
                              <div>
                                <div class="news-title"><a href="{n["link"]}" target="_blank">{hi_title}</a>{date_str}</div>
                                <div class="news-src">{n.get("publisher","")}</div>
                              </div>
                            </div>''', unsafe_allow_html=True)
                            shown += 1
                    else:
                        st.info("뉴스를 불러오지 못했습니다.")
                with rec_col:
                    st.markdown("**💼 애널리스트 의견 · 리포트**")
                    nr_data = nr_data if 'nr_data' in dir() else get_stock_news_and_recs(sel_ticker)
                    has_recs = nr_data and nr_data.get('recs')
                    if has_recs:
                        for r in nr_data['recs']:
                            frm_txt = f" ← {r['from']}" if r.get('from') and r['from'] not in ('','nan','None') else ''
                            action = r['action']
                            ac_color = ('#16A34A' if any(k in action.lower() for k in ['buy','outperform','overweight','strong'])
                                        else '#DC2626' if any(k in action.lower() for k in ['sell','underperform','underweight','reduce'])
                                        else '#64748B')
                            st.markdown(f'''<div class="rec-card">
                              <div class="rec-firm">{r["firm"]}</div>
                              <div><span class="rec-action" style="color:{ac_color}">{action}</span>
                              <span class="rec-target">{frm_txt}</span></div>
                            </div>''', unsafe_allow_html=True)
                    # 항상 리포트 링크 표시 (의견 없을 때는 대체, 있을 때는 추가)
                    if not has_recs:
                        st.caption("yfinance 애널리스트 데이터 없음 — 아래 링크에서 확인")
                    st.markdown("**🔗 리서치 · 보고서 링크**")
                    t_enc = urllib.parse.quote(sel_ticker)
                    links = [
                        ("Yahoo Finance 분석", f"https://finance.yahoo.com/quote/{t_enc}/analysis/"),
                        ("Seeking Alpha", f"https://seekingalpha.com/symbol/{t_enc}/analysis"),
                        ("Stock Analysis", f"https://stockanalysis.com/stocks/{t_enc.lower()}/forecast/"),
                        ("MarketBeat 의견", f"https://www.marketbeat.com/stocks/NASDAQ/{t_enc}/analyst-ratings/"),
                        ("Macrotrends 실적", f"https://www.macrotrends.net/stocks/charts/{t_enc}/{sel_name.lower().replace(' ','-')}/revenue"),
                    ]
                    for label, url in links:
                        st.markdown(
                            f'<a href="{url}" target="_blank" style="display:block;font-size:12px;'
                            f'color:#0EA5E9;text-decoration:none;padding:5px 0;'
                            f'border-bottom:1px solid #F1F5F9">↗ {label}</a>',
                            unsafe_allow_html=True)
            elif not sel_is_us:
                st.info("한국 주식은 기본 시세만 제공됩니다.")

# ═══ TAB 5: 🔥 트렌드 ════════════════════════════════════════════════
elif active == 5:
    st.markdown('<div class="ttl">🔥 시장 트렌드</div>', unsafe_allow_html=True)
    t1, t2 = st.columns(2)

    with t1:
        us_hot = get_most_active_us()
        fetch_date_us = datetime.now().strftime('%Y-%m-%d')
        st.markdown(f"**🇺🇸 미국 거래 상위 10** <span style='font-size:10px;color:#64748B'>({fetch_date_us} 기준)</span>",
                    unsafe_allow_html=True)
        if not us_hot:
            st.info("데이터를 불러오지 못했습니다.")
        else:
            for i, s in enumerate(us_hot[:10], 1):
                is_pos = s['change_pct'] >= 0
                pill_c = 'pu' if is_pos else 'pd'; ps_s = '+' if is_pos else ''
                vol_str = (f"{s['volume']/1e9:.2f}B" if s['volume'] >= 1e9
                           else f"{s['volume']/1e6:.1f}M" if s['volume'] >= 1e6
                           else f"{s['volume']:,}")
                st.markdown(f'''<div class="hot-row">
                  <div class="hot-rank">{i}</div>{logo_html(s["ticker"])}
                  <div class="hot-name"><div class="hot-tn">{s["name"]}</div>
                    <div class="hot-sub">{s["ticker"]} &nbsp;|&nbsp; 거래량 {vol_str}</div></div>
                  <div style="text-align:right">
                    <div style="font-size:13px;font-weight:700;color:#0F172A">${s["price"]:.2f}</div>
                    <span class="pill {pill_c}">{ps_s}{s["change_pct"]:.2f}%</span>
                  </div>
                </div>''', unsafe_allow_html=True)

    with t2:
        kr_result = get_most_active_kr()
        kr_hot    = kr_result.get('items', []) if kr_result else []
        kr_date   = kr_result.get('date', datetime.now().strftime('%Y-%m-%d')) if kr_result else ''
        st.markdown(f"**🇰🇷 한국 거래 상위 10** <span style='font-size:10px;color:#64748B'>({kr_date} 기준)</span>",
                    unsafe_allow_html=True)
        if not kr_hot:
            st.info("데이터를 불러오지 못했습니다.")
        else:
            for i, s in enumerate(kr_hot[:10], 1):
                is_pos = s['change_pct'] >= 0
                pill_c = 'pu' if is_pos else 'pd'; ps_s = '+' if is_pos else ''
                vol_str = (f"{s['volume']/1e6:.1f}M" if s['volume'] >= 1e6 else f"{s['volume']:,}")
                mkt_badge = f"<span style='font-size:9px;color:#0EA5E9;margin-left:4px'>{s.get('market','')}</span>"
                st.markdown(f'''<div class="hot-row">
                  <div class="hot-rank">{i}</div>{logo_html(s["ticker"])}
                  <div class="hot-name"><div class="hot-tn">{s["name"]}{mkt_badge}</div>
                    <div class="hot-sub">{s["ticker"]} &nbsp;|&nbsp; 거래량 {vol_str}</div></div>
                  <div style="text-align:right">
                    <div style="font-size:13px;font-weight:700;color:#0F172A">₩{s["price"]:,}</div>
                    <span class="pill {pill_c}">{ps_s}{s["change_pct"]:.2f}%</span>
                  </div>
                </div>''', unsafe_allow_html=True)

    # S&P500 Finviz-style 개별 종목 히트맵
    st.markdown("---"); st.markdown("**🗺️ S&P500 Finviz-style 히트맵**")
    hm_data = get_sp500_mini_heatmap()
    if hm_data:
        df_hm = pd.DataFrame(hm_data)
        COLOR_SCALE = [[0.0,'#7F1D1D'],[0.35,'#991B1B'],[0.47,'#374151'],
                       [0.53,'#374151'],[0.65,'#14532D'],[1.0,'#166534']]
        fig_fv = px.treemap(
            df_hm, path=['sector','ticker'], values='weight',
            color='pct', color_continuous_scale=COLOR_SCALE,
            color_continuous_midpoint=0,
            custom_data=['price','pct'])
        fig_fv.update_traces(
            texttemplate='<b>%{label}</b><br>%{customdata[1]:+.2f}%',
            textfont=dict(size=11, color='white', family='Inter'),
            hovertemplate='<b>%{label}</b><br>$%{customdata[0]:.2f}<br>%{customdata[1]:+.2f}%<extra></extra>',
            marker_line_width=0.5, marker_line_color='#FFFFFF')
        fig_fv.update_layout(
            height=420, margin=dict(l=4,r=4,t=4,b=4),
            paper_bgcolor='white', font=dict(family='Inter', color='#334155'),
            coloraxis_showscale=False)
        st.plotly_chart(fig_fv, width='stretch')
    else:
        # Fallback: 섹터 ETF 기반 단순 히트맵
        sp_data = get_sector_performance()
        if sp_data:
            df_sp = pd.DataFrame(sp_data)
            lbl   = [f"{r['sector']}\n{r['pct']:+.2f}%" for _, r in df_sp.iterrows()]
            fig_h = go.Figure(go.Treemap(
                labels=lbl, parents=['']*len(df_sp), values=df_sp['weight'],
                marker=dict(colors=df_sp['pct'],
                    colorscale=[[0.0,'#7F1D1D'],[0.35,'#991B1B'],[0.48,'#374151'],
                                [0.52,'#374151'],[0.65,'#14532D'],[1.0,'#166534']],
                    cmid=0, showscale=False),
                textfont=dict(family='Inter',color='white',size=12)))
            fig_h.update_layout(height=280, margin=dict(l=4,r=4,t=4,b=4),
                                paper_bgcolor='white', font=dict(family='Inter',color='#334155'))
            st.plotly_chart(fig_h, width='stretch')
    # 섹터 대표 종목 선택
    sp_sector_names = list(SP500_SECTOR_STOCKS.keys())
    sel_sp_sec = st.selectbox("섹터 대표 종목 보기", ['선택하세요…'] + sp_sector_names, key="sp_sec_sel")
    if sel_sp_sec != '선택하세요…':
        stocks_in_sec = SP500_SECTOR_STOCKS.get(sel_sp_sec, [])
        st.markdown(f"**{sel_sp_sec} 대표 종목**")
        sec_cols = st.columns(len(stocks_in_sec))
        for col, (tkr, nm) in zip(sec_cols, stocks_in_sec):
            d = get_us_price_fast(tkr)
            if d:
                chg_c = '#00C48C' if d['change_pct'] >= 0 else '#FF5C5C'
                sign = '+' if d['change_pct'] >= 0 else ''
                col.markdown(
                    f'<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;'
                    f'padding:8px 6px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.05)">'
                    f'<div style="display:flex;justify-content:center;margin-bottom:4px">{logo_html(tkr, size=32)}</div>'
                    f'<div style="font-size:11px;font-weight:700;color:#334155">{tkr}</div>'
                    f'<div style="font-size:13px;font-weight:700;color:#0F172A">${d["current_price"]:.2f}</div>'
                    f'<div style="font-size:11px;color:{chg_c}">{sign}{d["change_pct"]:.2f}%</div>'
                    f'</div>', unsafe_allow_html=True)
            else:
                col.markdown(f'<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:8px;text-align:center">'
                             f'<div style="font-size:11px;color:#334155">{tkr}</div></div>', unsafe_allow_html=True)

    # KOSPI 섹터 히트맵
    st.markdown("**🗺️ KOSPI 섹터별 등락률 히트맵**")
    kp_data = get_kospi_sector_performance()
    if kp_data:
        df_kp = pd.DataFrame(kp_data)
        lbl_k = [f"{r['sector']}\n{r['pct']:+.2f}%" for _, r in df_kp.iterrows()]
        fig_k = go.Figure(go.Treemap(
            labels=lbl_k, parents=['']*len(df_kp), values=df_kp['weight'],
            marker=dict(colors=df_kp['pct'],
                colorscale=[[0.0,'#7F1D1D'],[0.35,'#991B1B'],[0.48,'#94A3B8'],
                            [0.52,'#94A3B8'],[0.65,'#14532D'],[1.0,'#166534']],
                cmid=0, showscale=True,
                colorbar=dict(tickfont=dict(color='#334155'), title=dict(text='%', font=dict(color='#334155')))),
            textfont=dict(family='Inter',color='white',size=12)))
        fig_k.update_layout(height=280, margin=dict(l=5,r=5,t=5,b=5),
                            paper_bgcolor='white', font=dict(family='Inter',color='#334155'))
        st.plotly_chart(fig_k, width='stretch')
        # 섹터 상세 종목
        kp_sector_names = list(KOSPI_SECTOR_STOCKS.keys())
        sel_kp_sec = st.selectbox("섹터 대표 종목 보기", ['선택하세요…'] + kp_sector_names, key="kp_sec_sel")
        if sel_kp_sec != '선택하세요…':
            stocks_in_kp = KOSPI_SECTOR_STOCKS.get(sel_kp_sec, [])
            st.markdown(f"**{sel_kp_sec} 대표 종목**")
            kp_cols = st.columns(len(stocks_in_kp))
            for col, (tkr, nm) in zip(kp_cols, stocks_in_kp):
                d = get_kr_stock_data(tkr)
                if d:
                    chg_c = '#00C48C' if d['change_pct'] >= 0 else '#FF5C5C'
                    sign = '+' if d['change_pct'] >= 0 else ''
                    col.markdown(
                        f'<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;'
                        f'padding:8px 10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.05)">'
                        f'{logo_html(tkr, size=32)}'
                        f'<div style="font-size:12px;font-weight:700;color:#0F172A;margin-top:4px">{nm}</div>'
                        f'<div style="font-size:10px;color:#94A3B8">{tkr}</div>'
                        f'<div style="font-size:13px;font-weight:700;color:#0F172A">₩{d["current_price"]:,}</div>'
                        f'<div style="font-size:11px;color:{chg_c}">{sign}{d["change_pct"]:.2f}%</div>'
                        f'</div>', unsafe_allow_html=True)
                else:
                    col.markdown(f'<div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;padding:8px;text-align:center">'
                                 f'<div style="font-size:12px;color:#334155">{nm}</div><div style="font-size:10px;color:#94A3B8">{tkr}</div></div>',
                                 unsafe_allow_html=True)
    else:
        st.info("KOSPI 섹터 데이터를 불러오지 못했습니다.")

    # AI/기술 뉴스
    st.markdown("---"); st.markdown("**📰 AI · 기술 · 투자 뉴스 (오늘 Top 10)**")
    news_items = get_tech_news()
    if not news_items:
        st.info("뉴스를 불러오지 못했습니다.")
    else:
        for i, n in enumerate(news_items, 1):
            st.markdown(f'''<div class="news-card">
              <div class="news-num">{i}</div>
              <div>
                <div class="news-title"><a href="{n["link"]}" target="_blank">{n["title"]}</a></div>
                <div class="news-src">{n.get("publisher","")}</div>
              </div>
            </div>''', unsafe_allow_html=True)

# ═══ TAB 6: ➕ 추가 ══════════════════════════════════════════════════
elif active == 6:
    st.markdown('<div class="ttl">➕ 종목 추가</div>', unsafe_allow_html=True)
    method = st.radio("", ["개별 입력","엑셀 업로드"], horizontal=True,
                      key="add_method", label_visibility='collapsed')
    if method == "개별 입력":
        acc   = st.selectbox("계좌", ACCOUNTS, format_func=lambda x: ACCOUNT_NAMES[x], key="add_acc")
        is_us = (acc == 'US')
        c1, c2 = st.columns(2)
        with c1:
            ticker = st.text_input("종목 코드", placeholder="AAPL 또는 005930", key="add_ticker")
            name   = st.text_input("종목명",   key="add_name")
            sector = st.text_input("섹터",     key="add_sector")
        with c2:
            if is_us:
                qty = st.number_input("수량", min_value=0.0, value=1.0, step=0.1, key="add_qty")
                avg = st.number_input("평단가 ($)", min_value=0.0, value=100.0, key="add_avg")
            else:
                qty = float(st.number_input("수량", min_value=0, value=1, key="add_qty2"))
                avg = float(st.number_input("평단가 (원)", min_value=0, value=50000, key="add_avg2"))
        if st.button("추가", key="add_btn", type='primary'):
            if ticker and name:
                st.session_state.portfolios[acc].append({
                    'ticker': ticker.upper() if is_us else ticker,
                    'name': name, 'quantity': qty, 'avg_price': avg, 'sector': sector})
                save_portfolio(); st.success(f"{name} 추가 완료!"); st.rerun()
            else:
                st.warning("종목 코드와 종목명을 입력하세요.")
    else:
        rows = [{'계좌명': a, '종목코드': s['ticker'], '종목명': s['name'],
                 '섹터': s.get('sector',''), '보유수량': s['quantity'], '평균단가': s['avg_price']}
                for a in ACCOUNTS for s in st.session_state.portfolios.get(a,[])]
        if not rows:
            rows = [{'계좌명':'US','종목코드':'AAPL','종목명':'Apple','섹터':'Technology','보유수량':10,'평균단가':150.0}]
        out = BytesIO()
        with pd.ExcelWriter(out, engine='openpyxl') as w:
            pd.DataFrame(rows).to_excel(w, index=False)
        st.download_button("📥 현재 포트폴리오 다운로드", out.getvalue(), "portfolio.xlsx",
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        st.caption("수정 후 업로드하면 데이터가 교체됩니다.")
        up = st.file_uploader("엑셀 업로드 (교체)", type=['xlsx'], key="excel_upload")
        if up:
            try:
                df  = pd.read_excel(up).dropna(subset=['종목코드','종목명'])
                new_p = {k:[] for k in ACCOUNTS}; cnt = 0
                for _, row in df.iterrows():
                    a = str(row['계좌명']).strip()
                    if a in ACCOUNTS:
                        new_p[a].append({'ticker': str(row['종목코드']).strip(),
                                         'name': str(row['종목명']).strip(),
                                         'quantity': float(row['보유수량']),
                                         'avg_price': float(row['평균단가']),
                                         'sector': str(row.get('섹터',''))}); cnt += 1
                st.session_state.portfolios = new_p; save_portfolio()
                st.success(f"{cnt}개 종목으로 교체 완료!"); st.rerun()
            except Exception as e:
                st.error(f"오류: {e}")

# ═══ TAB 7: ⚙️ 관리 ══════════════════════════════════════════════════
elif active == 7:
    st.markdown('<div class="ttl">⚙️ 포트폴리오 관리</div>', unsafe_allow_html=True)
    for acc, acc_name in ACCOUNT_NAMES.items():
        items = st.session_state.portfolios.get(acc, [])
        if items:
            st.markdown(f"**{acc_name}** ({len(items)}종목)")
            for idx, s in enumerate(items):
                mc1, mc2 = st.columns([6,1])
                is_us   = not is_kr_ticker(s['ticker'])
                avg_str = f"${s['avg_price']:.2f}" if is_us else f"₩{int(s['avg_price']):,}"
                mc1.markdown(
                    f'<div style="display:flex;align-items:center;gap:10px;padding:6px 0">'
                    f'{logo_html(s["ticker"])}'
                    f'<div><div style="font-size:14px;font-weight:700;color:#0F172A">{s["name"]}</div>'
                    f'<div style="font-size:12px;color:#64748B">{s["ticker"]} · {int(s["quantity"])}주 · {avg_str}</div>'
                    f'</div></div>',
                    unsafe_allow_html=True)
                if mc2.button("🗑️", key=f"mgdel_{acc}_{idx}", use_container_width=True):
                    st.session_state.portfolios[acc].pop(idx); save_portfolio(); st.rerun()
            st.markdown("---")
    if st.button("⭐ 관심 목록 전체 삭제", type='secondary'):
        st.session_state.watchlist = []; save_portfolio()
        st.success("관심 목록 초기화 완료"); st.rerun()

# ─── Footer ───────────────────────────────────────────────────────────
st.caption(f"💱 USD/KRW ₩{usd_krw:,.2f} · Yahoo Finance · 네이버 금융 · {datetime.now().strftime('%H:%M')} 기준")
