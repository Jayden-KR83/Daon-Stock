import React, { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pushSupported, getPushState, enablePush, disablePush, pushDiagnostics } from '../pushClient'
import { sendTestPush, getMovePrefs, saveMovePrefs } from '../api'
import { useInstall, isStandalone as pwaStandalone } from '../utils/installPrompt'

/* ══════════════════════════════════════════════════════════════
   휴대폰 알림 설정 — 설정 탭의 독립 카드
   ══════════════════════════════════════════════════════════════
   Web Push 자체는 2026-06 에 이미 붙어 있었다(VAPID + service worker +
   5분 cron 에서 발송). 그런데 켜는 스위치가 알림 벨 시트 안쪽에만 있어서,
   기능이 있는지조차 모른 채 "웹에서만 뜬다" 로 남아 있었다.

   그래서 이 카드는 세 가지를 한 화면에서 끝낸다.
     ① 지금 상태가 무엇인지 (지원 안 함 / 차단됨 / 꺼짐 / 켜짐)
     ② 무엇이 언제 오는지 (목표가·급등락·주간 리포트)
     ③ 왜 안 오는지 — 특히 iOS 는 홈 화면에 추가해야만 푸시가 온다.
        이걸 안 적어두면 "켰는데 안 온다" 가 반복된다.
   ══════════════════════════════════════════════════════════════ */

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '')
/* iOS 는 홈 화면에 설치된 상태(standalone)에서만 푸시를 허용한다.
   사파리 탭에서는 권한 요청 자체가 실패하거나 조용히 아무 일도 안 일어난다.
   판정은 utils/installPrompt.js 하나로 모았다 — 두 벌이면 한쪽만 고쳐진다. */

/* ── 휴대폰 '앱 목록' 에 다온이 안 보이는 이유 ──────────────────────────
   휴대폰 설정 → 알림 목록은 **설치된 앱** 만 보여준다. 브라우저 탭에서 열어
   쓰는 동안 다온은 앱이 아니라 '웹사이트' 라서, 안드로이드에서는 크롬 안쪽
   (설정 → 앱 → Chrome → 알림 → 사이트) 에 파묻히고 아이폰에서는 아예 없다.

   홈 화면에 설치해야 비로소 독립된 앱으로 등록된다.
     · 안드로이드: 크롬이 beforeinstallprompt 를 주면 버튼 한 번으로 설치(WebAPK).
       이때부터 설정 → 앱 목록에 '다온' 이 뜬다.
     · 아이폰: 공유 → 홈 화면에 추가 (프로그램적으로 띄울 방법이 없다).
   ────────────────────────────────────────────────────────────────── */
function InstallSection({ installed }) {
  const { deferred, install, manualSteps } = useInstall()
  const [tried, setTried] = useState(false)

  if (installed) {
    return (
      <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-pos-dark)',
        marginBottom: 12, lineHeight: 1.7 }}>
        ✓ 홈 화면 앱으로 실행 중입니다 — 휴대폰 설정의 앱 목록에 &lsquo;다온&rsquo;이 나타납니다.
      </div>
    )
  }

  return (
    <div className="ko-keep" style={{ background: 'var(--clr-info-bg)',
      border: '1px solid var(--clr-info-border)', borderRadius: 4,
      padding: '9px 11px', marginBottom: 12, fontSize: 11.5,
      color: 'var(--clr-text)', lineHeight: 1.75 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>
        먼저 홈 화면에 설치해야 합니다
      </div>
      <div style={{ whiteSpace: 'pre-line' }}>
        {'지금은 브라우저에서 열려 있어서, 휴대폰 설정의 앱 목록에 다온이 없습니다.\n'
         + '홈 화면에 설치하면 독립된 앱으로 등록되고 그때부터 알림도 옵니다.'}
      </div>

      {deferred && (
        <button className="btn-primary" style={{ marginTop: 9, padding: '9px 18px',
          fontSize: 13, width: 'auto' }}
          onClick={async () => { await install(); setTried(true) }}>
          앱으로 설치
        </button>
      )}

      {/* 버튼이 뜨든 안 뜨든 손으로 하는 길은 항상 적어둔다.
          브라우저가 설치 이벤트를 안 주는 경우가 실제로 있고(삼성 인터넷·
          일부 태블릿), 그때 버튼만 없으면 사용자는 "설치를 막아놨다"고 읽는다. */}
      <div style={{ marginTop: deferred ? 8 : 6, whiteSpace: 'pre-line',
        color: 'var(--clr-text-sub)' }}>
        {deferred ? '버튼이 안 눌리면 ' : ''}{manualSteps}
      </div>

      {!deferred && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--clr-text-sub)' }}>
          이 브라우저는 설치 버튼을 제공하지 않아 위 메뉴로만 설치됩니다.
          다온이 막은 것이 아닙니다.
        </div>
      )}
      {tried && <div style={{ marginTop: 6, fontSize: 10.5,
        color: 'var(--clr-text-sub)' }}>설치를 마쳤다면 홈 화면의 다온 아이콘으로 다시 열어 주세요.</div>}
    </div>
  )
}

export default function PushSetupCard() {
  const [state, setState] = useState('off')   // unsupported | denied | on | off
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState('')
  const [diag, setDiag]   = useState(null)
  const qc = useQueryClient()

  const { data: prefs } = useQuery({
    queryKey: ['move-prefs'], queryFn: getMovePrefs, staleTime: 60_000,
  })

  useEffect(() => { getPushState().then(setState).catch(() => setState('off')) }, [])

  const installed  = pwaStandalone()
  const iosBlocked = isIos() && !installed

  const toggle = async () => {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      setState(state === 'on' ? await disablePush() : await enablePush())
      setMsg(state === 'on' ? '알림을 껐습니다.' : '이제 휴대폰으로 알림이 옵니다.')
    } catch (e) {
      /* 실패 사유를 뭉뚱그리지 않는다. "알림을 켜지 못했습니다" 한 줄이면
         사용자도 나도 다음에 뭘 해야 할지 모른다(2026-09-03 제보). */
      const REASON = {
        unsupported: '이 브라우저는 웹 알림을 지원하지 않습니다. 크롬·사파리 최신 버전에서 열어주세요.',
        denied: '브라우저가 알림을 차단해 두었습니다. 앱에서는 다시 물어볼 수 없습니다 — 아래 안내대로 사이트 설정에서 허용해 주세요.',
        dismissed: '알림 허용 창을 닫으셨습니다. 다시 눌러 "허용"을 선택해 주세요.',
        sw_timeout: '서비스워커가 응답하지 않습니다. 앱을 완전히 닫았다가 다시 열고(또는 설정 → 업데이트 확인) 다시 시도해 주세요.',
        vapid_failed: '서버에서 알림 키를 받지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
        subscribe_failed: '기기에서 알림 구독에 실패했습니다. 홈 화면 앱으로 열려 있는지 확인해 주세요.',
        server_save_failed: '구독 정보를 서버에 저장하지 못했습니다. 로그인 상태를 확인해 주세요.',
      }
      setMsg(REASON[String(e?.message)] || `알림을 켜지 못했습니다 (${String(e?.message || '원인 미상')}).`)
      setState(await getPushState())
      setDiag(await pushDiagnostics().catch(() => null))
    } finally { setBusy(false) }
  }

  const test = async () => {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      const r = await sendTestPush()
      setMsg(r?.sent > 0
        ? `테스트 알림을 보냈습니다 (기기 ${r.sent}대). 잠금화면을 확인해 보세요.`
        : '보낼 기기가 없습니다. 이 기기에서 알림을 먼저 켜주세요.')
    } catch { setMsg('테스트 발송에 실패했습니다.') }
    finally { setBusy(false) }
  }

  const setThreshold = async (v) => {
    if (busy) return
    setBusy(true)
    try {
      await saveMovePrefs({ ...(prefs || {}), threshold_pct: v })
      qc.invalidateQueries({ queryKey: ['move-prefs'] })
      setMsg(`급등락 기준을 ±${v}% 로 바꿨습니다.`)
    } catch { setMsg('기준을 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  const badge = state === 'on'
    ? { t: '켜짐', c: 'var(--clr-pos-dark)' }
    : state === 'denied' ? { t: '브라우저가 차단', c: 'var(--clr-neg-dark)' }
    : state === 'unsupported' ? { t: '이 브라우저는 지원 안 함', c: 'var(--clr-text-muted)' }
    : { t: '꺼짐', c: 'var(--clr-text-muted)' }

  const thr = prefs?.threshold_pct ?? 5

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)' }}>
          휴대폰 알림
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
          color: badge.c, border: `1px solid ${badge.c}` }}>{badge.t}</span>
      </div>
      <div className="ko-keep" style={{ fontSize: 11, color: 'var(--clr-text-muted)',
        marginBottom: 12, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
        {'앱을 열지 않아도 잠금화면으로 알림이 옵니다.\n기기마다 따로 켜야 합니다 — 휴대폰에서 켜면 휴대폰으로 옵니다.'}
      </div>

      {/* 무엇이 오는가 — 켜기 전에 알아야 결정할 수 있다 */}
      <div style={{ background: 'var(--clr-bg)', border: '1px solid var(--clr-border-md)',
        borderRadius: 4, padding: '9px 11px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--clr-text-sub)', marginBottom: 6 }}>
          이런 때 알려드립니다
        </div>
        {[
          ['보유·관심 종목 급등락', `하루 변동률이 ±${thr}% 를 넘을 때 · 5분마다 확인`],
          ['목표가 · 손절가 도달', '종목별로 설정한 가격에 닿을 때'],
          ['주간 리밸런싱 리포트', '매주 월요일 아침'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 0' }}>
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 0, flexShrink: 0,
              background: 'var(--clr-text-tertiary)', transform: 'translateY(-2px)' }} />
            <span style={{ fontSize: 11.5, color: 'var(--clr-text)', fontWeight: 600 }}>{k}</span>
            <span style={{ fontSize: 10.5, color: 'var(--clr-text-muted)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* 급등락 기준 — 서버가 판단하는 값이라 기기와 무관하다 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 5 }}>
          급등락 기준
        </div>
        <div className="seg-ctrl">
          {[3, 5, 7, 10].map(v => (
            <button key={v} className={`seg-btn ${thr === v ? 'active' : ''}`}
              onClick={() => setThreshold(v)}>±{v}%</button>
          ))}
        </div>
      </div>

      {/* 설치 여부 — 휴대폰 앱 목록에 다온이 없는 이유가 대부분 여기다 */}
      <InstallSection installed={installed} />

      {/* 설치돼 있어도 알림을 켜야 앱 목록의 알림 항목이 생긴다 */}
      {installed && state === 'off' && (
        <div className="ko-keep" style={{ fontSize: 11.5, color: 'var(--clr-text-sub)',
          marginBottom: 12, lineHeight: 1.75, whiteSpace: 'pre-line' }}>
          {'아래에서 알림을 켜면 휴대폰 설정 → 알림 목록에 다온이 나타납니다.\n'
           + '거기서 소리·잠금화면 표시 같은 세부 설정을 바꿀 수 있습니다.'}
        </div>
      )}

      {state === 'denied' && (
        <div className="ko-keep" style={{ background: 'var(--clr-neg-bg-soft)',
          border: '1px solid var(--clr-neg-border)', borderRadius: 4,
          padding: '9px 11px', marginBottom: 12, fontSize: 11.5,
          color: 'var(--clr-text)', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
          {'브라우저가 이 사이트의 알림을 차단해 두었습니다. 앱에서는 다시 물어볼 수 없습니다.\n'
           + '주소창 왼쪽 자물쇠(또는 ⓘ) → 사이트 설정 → 알림 → 허용 으로 바꾼 뒤 새로고침해 주세요.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* ⚠ 예전에는 iosBlocked 면 버튼을 disabled 로 막았다. 그런데 아이폰에서
            홈 화면 앱으로 열어도 standalone 판정이 빗나가는 경우가 있어, 설치했는데도
            버튼이 죽어 '눌러도 아무 일이 없는' 상태가 됐다(2026-09-03 제보).
            → 막지 말고 눌러보게 하고, 실패하면 진짜 이유를 말해준다.
            판정으로 기능을 막는 것보다, 시도하고 사실대로 알려주는 편이 낫다. */}
        {(state === 'on' || state === 'off') && (
          <button className={state === 'on' ? '' : 'btn-primary'} onClick={toggle} disabled={busy}
            style={state === 'on'
              ? { padding: '9px 16px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--clr-border-md)',
                  borderRadius: 4, color: 'var(--clr-text-sub)', opacity: busy ? 0.5 : 1 }
              : { padding: '9px 18px', fontSize: 13, width: 'auto',
                  opacity: busy ? 0.5 : 1 }}>
            {state === 'on' ? '알림 끄기' : '휴대폰 알림 켜기'}
          </button>
        )}
        {state === 'on' && (
          <button onClick={test} disabled={busy}
            style={{ padding: '9px 16px', fontSize: 13, fontFamily: 'inherit',
              cursor: 'pointer', background: 'transparent',
              border: '1px solid var(--clr-border-md)', borderRadius: 4,
              color: 'var(--clr-text-sub)', opacity: busy ? 0.5 : 1 }}>
            테스트 알림 보내기
          </button>
        )}
      </div>

      {msg && (
        <div className="ko-keep" style={{ fontSize: 11.5, marginTop: 9, lineHeight: 1.7,
          color: 'var(--clr-text-sub)' }}>{msg}</div>
      )}

      {/* 진단 — 안 될 때 '지금 기기가 어떤 상태인지'를 눈으로 보여준다.
          원격에서 "안 돼요"만으로는 원인을 좁힐 수 없다. */}
      <details style={{ marginTop: 10 }} onToggle={async (e) => {
        if (e.currentTarget.open && !diag) setDiag(await pushDiagnostics().catch(() => null))
      }}>
        <summary style={{ fontSize: 11, color: 'var(--clr-text-muted)', cursor: 'pointer' }}>
          알림이 안 될 때 — 진단 정보
        </summary>
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.8,
          color: 'var(--clr-text-sub)', fontVariantNumeric: 'tabular-nums' }}>
          {diag
            ? Object.entries(diag).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: 'var(--clr-text-muted)' }}>{k}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))
            : <span style={{ color: 'var(--clr-text-muted)' }}>확인 중…</span>}
          <div className="ko-keep" style={{ marginTop: 6, color: 'var(--clr-text-muted)' }}>
            휴대폰 설정의 알림 목록에는 <b>홈 화면 앱으로 설치되고 + 알림을 한 번 허용한 뒤</b>부터
            &lsquo;다온&rsquo;이 나타납니다. 둘 중 하나라도 빠지면 목록에 없습니다.
          </div>
        </div>
      </details>
    </div>
  )
}
