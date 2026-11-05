import React from 'react'

/**
 * 켜짐/꺼짐 토글.
 *
 * 1차(2026-10-27): '켜기' 버튼 -> 토글 + 옆 글자.
 *   검은 바탕에 '켜기'라고 쓴 버튼은 그 글자가 **지금 상태**인지 **누르면 일어날
 *   일**인지 구분되지 않았다.
 *
 * 2차(2026-11-05, 오너 지적 "토글키가 헷갈리게 되어 있어"):
 *   1차는 읽을 것을 **둘**로 늘렸다 — 왼쪽 글자('꺼짐')와 손잡이 위치. 둘이
 *   떨어져 있으니 눈이 둘 사이를 오가고, 더 나쁘게는 **글자가 눌리지 않았다.**
 *   글자를 누른 사람은 아무 일도 안 일어나는 것을 본다. 그 순간 글자는
 *   '누르면 될 것 같은데 안 되는 것'이 된다.
 *
 *   -> 글자를 손잡이 **안**에 넣는다. 읽을 것이 하나가 되고, 그 하나가 곧
 *      누를 것이 된다. 상태는 세 가지가 같은 말을 한다: 글자 · 위치 · 색.
 *
 * 접근성: 글자가 손잡이 안에 있어도 `role="switch"` + `aria-checked` 는 그대로다.
 * 스크린리더는 위치가 아니라 이 속성을 읽는다.
 */
export default function ToggleSwitch({
  checked, onChange, disabled = false, busy = false,
  label, onText = '켜짐', offText = '꺼짐',
}) {
  const text = busy ? '…' : checked ? onText : offText
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled || busy}
      className={`sw-track ${checked ? 'is-on' : ''}`}
      onClick={() => { if (!disabled && !busy) onChange(!checked) }}>
      {/* 손잡이 = 글자. 눌리는 영역은 트랙 전체라, 글자를 눌러도 같은 동작이다. */}
      <span className="sw-knob" aria-hidden="true">{text}</span>
    </button>
  )
}
