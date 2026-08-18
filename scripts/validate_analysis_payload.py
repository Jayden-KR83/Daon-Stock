"""구독으로 생성한 분석 payload 검증 — 주입 전 관문.

별도 파일로 둔 이유: 이 검증을 PowerShell here-string 안에 파이썬 코드로 심었더니
한글 리터럴('매수'/'보유'/'매도')이 인코딩 과정에서 깨져 **정상 payload 를 반대로
불합격 처리**했다(2026-08-18). 한글이 들어가는 코드는 UTF-8 파일로 분리한다.

하나라도 어긋나면 exit 1 — 절반만 주입된 상태가 가장 나쁘다.
사용: python validate_analysis_payload.py <payload.json>
"""
import io
import json
import sys

RECO = ('매수', '보유', '매도')
NEED_STR = ('recommendation', 'summary', 'company_overview', 'earnings_ir',
            'backlog', 'analyst_views', 'verdict')
NEED_LIST = ('catalysts_short', 'catalysts_medium', 'bull', 'bear', 'sources')


def validate(path):
    try:
        payload = json.load(io.open(path, encoding='utf-8'))
    except Exception as e:
        return ['payload 를 읽을 수 없음: %s' % e]
    if not isinstance(payload, list) or not payload:
        return ['payload 가 비었거나 배열이 아님']

    errs = []
    for o in payload:
        t = str(o.get('ticker') or '?')
        d = o.get('data') or {}
        for k in NEED_STR:
            if not isinstance(d.get(k), str) or not d.get(k).strip():
                errs.append('%s: %s 비었음' % (t, k))
        for k in NEED_LIST:
            if not isinstance(d.get(k), list) or not d.get(k):
                errs.append('%s: %s 비었음' % (t, k))
        if d.get('recommendation') not in RECO:
            errs.append('%s: recommendation 값 이상 (%r)' % (t, d.get('recommendation')))
        # 출처 URL 이 하나도 없으면 근거 없는 분석이다
        srcs = d.get('sources') or []
        if not any(isinstance(s, dict) and s.get('url') for s in srcs):
            errs.append('%s: 출처 URL 없음' % t)
    return errs


def main():
    if len(sys.argv) < 2:
        print('사용: validate_analysis_payload.py <payload.json>')
        sys.exit(2)
    path = sys.argv[1]
    errs = validate(path)
    # 콘솔 인코딩(cp949)에서 한글 출력이 깨지지 않도록 안전하게 쓴다
    w = lambda s: sys.stdout.buffer.write((s + '\n').encode('utf-8', 'replace'))
    if errs:
        w('검증 실패 %d건:' % len(errs))
        for e in errs[:15]:
            w('  - ' + e)
        sys.exit(1)
    n = len(json.load(io.open(path, encoding='utf-8')))
    w('검증 통과: %d 종목' % n)


if __name__ == '__main__':
    main()
