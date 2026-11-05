"""결측 축 감점 민감도 분석 — 2026-11-05 제3자 2차 검증 대응.

무엇을 묻는가 (Gemini 2차 #1 · ChatGPT 2차 #1):
  현행  composite = base x (가용축수 / 5)
  대안  composite = base x (1 - 빠진축들의_가중치_합)

  현행은 **어떤 축이 빠졌든 똑같이** 감점한다. 한국 종목에서 가치(35%)가 빠진
  것과 모멘텀(15%)이 빠진 것이 둘 다 x0.8 이다. Gemini 의 지적이 이것이고,
  1차에서 내가 쓴 반박("제안들은 전부 지금보다 후하다")은 **이 제안에는 안 통한다**
  — 가중치 비례는 큰 축이 빠지면 지금보다 **더** 깎는다.

ChatGPT 의 조건: "검증 결과가 충분하지 않으면 공식을 변경하지 않는다."
그래서 바꾸기 전에 **운영 데이터로 먼저 재 본다.**

보는 것:
  1. 결측이 있는 종목이 몇 개나 되나 (없으면 논쟁 자체가 공허하다)
  2. 어떤 축이 주로 빠지나 (가치가 안 빠지면 Gemini 의 예시는 성립 안 한다)
  3. 점수 변화의 분포 — 오르는 쪽인가 내리는 쪽인가
  4. 🟥 **상위 15위 명단이 바뀌나** — 이것이 유일하게 사용자가 보는 결과다

사용: python scripts/sensitivity_missing_axis.py
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get('DAON_BASE', 'https://daonwealth.com')

GARP_WEIGHTS    = {'value': 0.30, 'growth': 0.25, 'quality': 0.20,
                   'momentum': 0.15, 'sentiment': 0.10}
GARP_WEIGHTS_KR = {'value': 0.35, 'growth': 0.25, 'quality': 0.25,
                   'momentum': 0.10, 'sentiment': 0.05}
AXES = ('value', 'growth', 'quality', 'momentum', 'sentiment')


# 운영 nginx 가 기본 urllib UA 를 403 으로 막는다(봇 필터). 브라우저 UA 를 쓴다.
_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
       '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')


def _get(path, token=None):
    req = urllib.request.Request(BASE + path, headers={'User-Agent': _UA})
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def _post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'User-Agent': _UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def main():
    token = _post('/api/auth/demo', {})['token']
    data = _get('/api/discover?limit=400', token)
    rows = data.get('rows') or data.get('items') or []
    if not rows:
        print('발굴 행을 못 받았다. 응답 키:', list(data)[:8])
        return 2

    changed, worse, better = [], 0, 0
    missing_axis_count = {a: 0 for a in AXES}
    n_incomplete = 0

    for r in rows:
        w = GARP_WEIGHTS_KR if r.get('market') == 'KR' else GARP_WEIGHTS
        present = {a: r.get('pct_' + a) for a in AXES}
        miss = [a for a in AXES if present[a] is None]
        if not miss:
            continue
        n_incomplete += 1
        for a in miss:
            missing_axis_count[a] += 1

        # base 재구성: 가용 축만 재정규화한 가중평균
        num = den = 0.0
        for a in AXES:
            if present[a] is not None:
                num += w[a] * present[a]; den += w[a]
        if den <= 0:
            continue
        base = num / den
        cur  = base * (len(AXES) - len(miss)) / 5.0        # 현행
        alt  = base * (1.0 - sum(w[a] for a in miss))      # 대안(가중치 비례)
        changed.append({
            'ticker': r.get('ticker'), 'name': r.get('name'),
            'market': r.get('market'), 'miss': miss,
            'cur': round(cur, 2), 'alt': round(alt, 2),
            'delta': round(alt - cur, 2),
        })
        if alt < cur - 0.01: worse += 1
        elif alt > cur + 0.01: better += 1

    print('=' * 72)
    print('결측 축 감점 민감도 — 운영 데이터 %d종' % len(rows))
    print('=' * 72)
    print('결측이 있는 종목: %d / %d (%.0f%%)'
          % (n_incomplete, len(rows), 100.0 * n_incomplete / max(1, len(rows))))
    if not n_incomplete:
        print('\n결측 종목이 없다 — 두 공식의 결과가 같다. 바꿀 이유가 없다.')
        return 0
    print('어떤 축이 빠지나:',
          ', '.join('%s %d' % (a, c) for a, c in missing_axis_count.items() if c))

    # 🟥 결측이 **시장에 치우쳐 있는가**. 치우쳐 있으면 감점 공식을 어떻게 바꾸든
    #    그것은 '공식 개선'이 아니라 **특정 시장에 대한 체계적 감점**이 된다.
    for mk in ('US', 'KR'):
        tot = [r for r in rows if r.get('market') == mk]
        if not tot:
            continue
        for ax in AXES:
            miss = sum(1 for r in tot if r.get('pct_' + ax) is None)
            if miss:
                print('  %s · %-9s 결측 %3d / %3d (%3.0f%%)'
                      % (mk, ax, miss, len(tot), 100.0 * miss / len(tot)))
    print('대안이 더 낮게 주는 종목: %d · 더 높게: %d' % (worse, better))

    if changed:
        ds = sorted(c['delta'] for c in changed)
        print('점수 변화 분포: 최소 %+.2f · 중앙 %+.2f · 최대 %+.2f'
              % (ds[0], ds[len(ds) // 2], ds[-1]))
        print('\n변화가 큰 10종:')
        for c in sorted(changed, key=lambda x: -abs(x['delta']))[:10]:
            print('  %-8s %-18s %s  결측 %-22s %6.2f -> %6.2f (%+.2f)'
                  % (c['ticker'], (c['name'] or '')[:18], c['market'],
                     ','.join(c['miss']), c['cur'], c['alt'], c['delta']))

    # 🟥 사용자가 실제로 보는 것: 상위 15 명단
    alt_by = {c['ticker']: c['alt'] for c in changed}
    scored = [(r.get('ticker'), r.get('name'), float(r.get('composite_score') or 0),
               alt_by.get(r.get('ticker'), float(r.get('composite_score') or 0)))
              for r in rows if r.get('gate_pass')]
    top_cur = [t for t, _n, c, _a in sorted(scored, key=lambda x: -x[2])[:15]]
    top_alt = [t for t, _n, _c, a in sorted(scored, key=lambda x: -x[3])[:15]]
    print('\n' + '-' * 72)
    print('상위 15 명단 비교 (게이트 통과 %d종 기준)' % len(scored))
    print('  현행: ' + ' '.join(top_cur))
    print('  대안: ' + ' '.join(top_alt))
    inn  = [t for t in top_alt if t not in top_cur]
    out  = [t for t in top_cur if t not in top_alt]
    print('  새로 들어옴: %s' % (' '.join(inn) or '없음'))
    print('  빠짐:        %s' % (' '.join(out) or '없음'))
    print('  순위 변동 없음' if not inn and not out
          else '  🟥 명단이 바뀐다 — 사용자가 보는 결과가 달라진다')
    return 0


if __name__ == '__main__':
    sys.exit(main())
