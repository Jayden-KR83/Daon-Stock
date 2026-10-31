import { useEffect, useRef } from 'react'
import { logTabDwell } from '../api'
import { tabLabel } from '../components/BottomNav'

/**
 * 탭 체류시간 기록 — 오너 결정(2026-10-31): 탭을 합칠 때 **느낌이 아니라 기록**으로 정한다.
 *
 * 남기는 것은 **탭 이름과 머문 시간뿐**이다. 클릭 좌표·스크롤·입력값은 남기지 않는다.
 * 탭 구조를 판단하는 데 그 이상은 필요 없고, 더 모으면 지우기 어려운 것이 쌓인다.
 *
 * 세 가지를 조심한다.
 *  ① **화면을 보고 있지 않은 시간은 사용이 아니다.** 탭을 켜 둔 채 자리를 비우면
 *     체류시간이 아니라 방치시간이다 → 문서가 숨으면(visibilitychange) 시계를 멈춘다.
 *  ② **스쳐 지나간 탭을 세지 않는다.** 2초 미만은 서버가 버린다.
 *  ③ **앱을 닫을 때의 마지막 구간을 놓치지 않는다.** 일반 요청은 페이지가 사라지면
 *     취소되므로 sendBeacon 으로 보낸다.
 */
export function useTabDwell(activeTab) {
  const startedRef = useRef(0)       // 현재 구간 시작 시각 (보고 있을 때만 흐른다)
  const accRef     = useRef(0)       // 이 탭에서 누적된 ms
  const tabRef     = useRef(activeTab)

  useEffect(() => {
    const now = () => Date.now()

    const flush = (label, beacon = false) => {
      const ms = accRef.current + (startedRef.current ? now() - startedRef.current : 0)
      accRef.current = 0
      startedRef.current = 0
      if (!label || ms < 2000) return
      logTabDwell(label, Math.round(ms), beacon)
    }

    const onVisibility = () => {
      if (document.hidden) {
        // 자리를 비웠다 — 시계를 멈추고 지금까지를 누적만 해 둔다
        if (startedRef.current) {
          accRef.current += now() - startedRef.current
          startedRef.current = 0
        }
      } else if (!startedRef.current) {
        startedRef.current = now()
      }
    }
    const onHide = () => flush(tabRef.current, true)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)

    // 탭이 바뀌었다 — 이전 탭 구간을 닫고 새 구간을 연다
    const prev = tabRef.current
    if (prev !== activeTab) flush(tabLabel(prev))
    tabRef.current = activeTab
    if (!document.hidden) startedRef.current = now()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
    }
  }, [activeTab])
}
