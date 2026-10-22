"""구독으로 생성한 분석 payload 검증 — 주입 전 관문.

별도 파일로 둔 이유: 이 검증을 PowerShell here-string 안에 파이썬 코드로 심었더니
한글 리터럴('매수'/'보유'/'매도')이 인코딩 과정에서 깨져 **정상 payload 를 반대로
불합격 처리**했다(2026-08-18). 한글이 들어가는 코드는 UTF-8 파일로 분리한다.

2026-10-17 변경 — **종목 단위로 가른다.**
예전에는 하나라도 어긋나면 전체를 버렸다("절반만 주입된 상태가 가장 나쁘다").
그런데 실제로 나쁜 것은 '절반만 주입'이 아니라 **틀린 내용이 주입되는 것**이었다.
공모펀드처럼 웹에 자료가 없는 종목이 하나 섞이면 멀쩡한 5종목까지 버려졌다
(실측: 35회 실행 중 주입 성공 2회). 통과한 것만 남기고 나머지는 이름을 불러 보고한다.

사용: python validate_analysis_payload.py <payload.json> [--prune]
  --prune: 통과한 종목만 남겨 payload 를 다시 쓰고, 하나라도 남으면 exit 0
"""
import io
import json
import sys

RECO = ('매수', '보유', '매도')
NEED_STR = ('recommendation', 'summary', 'company_overview', 'earnings_ir',
            'backlog', 'analyst_views', 'verdict')
NEED_LIST = ('catalysts_short', 'catalysts_medium', 'bull', 'bear', 'sources')


def validate_one(o):
    """종목 하나의 오류 목록. 빈 목록이면 주입해도 되는 분석이다."""
    t = str(o.get('ticker') or '?')
    d = o.get('data') or {}
    errs = []
    for k in NEED_STR:
        if not isinstance(d.get(k), str) or not d.get(k).strip():
            errs.append('%s: %s 비었음' % (t, k))
    for k in NEED_LIST:
        if not isinstance(d.get(k), list) or not d.get(k):
            errs.append('%s: %s 비었음' % (t, k))
    if d.get('recommendation') not in RECO:
        errs.append('%s: recommendation 값 이상 (%r)' % (t, d.get('recommendation')))
    srcs = d.get('sources') or []
    if not any(isinstance(s, dict) and s.get('url') for s in srcs):
        errs.append('%s: 출처 URL 없음' % t)
    return errs


def validate(path):
    try:
        payload = json.load(io.open(path, encoding='utf-8'))
    except Exception as e:
        return ['payload 를 읽을 수 없음: %s' % e]
    if not isinstance(payload, list) or not payload:
        return ['payload 가 비었거나 배열이 아님']

    errs = []
    for o in payload:
        errs.extend(validate_one(o))
    return errs


def main():
    if len(sys.argv) < 2:
        print('사용: validate_analysis_payload.py <payload.json>')
        sys.exit(2)
    path = sys.argv[1]
    prune = '--prune' in sys.argv
    # 콘솔 인코딩(cp949)에서 한글 출력이 깨지지 않도록 안전하게 쓴다
    w = lambda s: sys.stdout.buffer.write((s + '\n').encode('utf-8', 'replace'))

    try:
        payload = json.load(io.open(path, encoding='utf-8'))
    except Exception as e:
        w('payload 를 읽을 수 없음: %s' % e)
        sys.exit(1)
    if not isinstance(payload, list) or not payload:
        w('payload 가 비었거나 배열이 아님')
        sys.exit(1)

    good, bad = [], []
    for o in payload:
        e = validate_one(o)
        (bad if e else good).append((o, e))

    if not prune:
        if bad:
            errs = [x for _, e in bad for x in e]
            w('검증 실패 %d건:' % len(errs))
            for x in errs[:15]:
                w('  - ' + x)
            sys.exit(1)
        w('검증 통과: %d 종목' % len(good))
        return

    # --prune: 통과한 것만 남긴다. 멀쩡한 분석을 한 종목 때문에 버리지 않는다.
    for o, e in bad:
        w('  제외 %s — %s' % (str(o.get('ticker') or '?'), e[0] if e else ''))
    if not good:
        w('검증 통과 0종목 — 주입할 것이 없다')
        sys.exit(1)
    json.dump([o for o, _ in good], io.open(path, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    w('검증 통과: %d 종목 (제외 %d)' % (len(good), len(bad)))


if __name__ == '__main__':
    main()
