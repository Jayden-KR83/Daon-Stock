import React from 'react'

/**
 * 켜짐/꺼짐 토글.
 *
 * 왜 버튼을 토글로 바꿨나 (2026-10-27 오너 지적):
 * 예전에는 검은 바탕에 '켜기'라고 쓴 버튼이었다. 그 글자가 **지금 상태**인지
 * **누르면 일어날 일**인지 구분되지 않았다 — 강조색이라 "켜져 있음"으로도 읽힌다.
 * 토글은 그 모호함이 없다. 손잡이 위치가 상태이고, 미는 동작이 곧 전환이다.
 *
 * 그래도 글자를 함께 두는 이유: 손잡이 위치만으로는 색각·저시력 사용자에게
 * 상태가 전달되지 않는다. 모양·위치·글자 셋이 같은 말을 하게 한다.
 */
export default function ToggleSwitch({
  checked, onChange, disabled = false, busy = false,
  label, onText = '켜짐', offText = '꺼짐',
}) {
  return (
    <span className="sw-wrap">
      <span className={`sw-state ${checked ? 'is-on' : ''}`}>
        {busy ? '…' : checked ? onText : offText}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label}
        disabled={disabled || busy}
        className={`sw-track ${checked ? 'is-on' : ''}`}
        onClick={() => { if (!disabled && !busy) onChange(!checked) }}>
        <span className="sw-knob" aria-hidden="true" />
      </button>
    </span>
  )
}
