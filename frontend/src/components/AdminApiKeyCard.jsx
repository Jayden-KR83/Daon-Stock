import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { saveApiKey } from '../api'
import { useStore } from '../store'

/**
 * Anthropic API 키 입력 — 관리자 탭 전용.
 *
 * 2026-10-11 ManageTab 에서 옮겨 왔다. 설정 탭과 관리자 탭 양쪽에 관리자 기능이
 * 흩어져 있어 "어디서 고치지"가 매번 헷갈렸다. 키는 서버 settings 에 저장되며
 * **서버 cron 이 쓰는 API 지갑**이다 — 오너 PC 스케줄러의 구독 OAuth 와는 다른 지갑이다
 * (2026-10-11: 이 둘을 혼동해 엉뚱한 쪽을 충전한 일이 있었다).
 */
export default function AdminApiKeyCard() {
  /* props 를 받지 않는다 — 호출부가 키 보유 여부와 저장 후 처리를 **또** 알아야 하면,
     옮겨 붙일 때마다 그 두 줄을 같이 옮겨야 하고 한 번 빠뜨리면 조용히 깨진다.
     실제로 2026-10-11 설정→관리자 이동에서 props 없이 렌더해 그럴 뻔했다. */
  const qc = useQueryClient()
  const hasKey = useStore(s => s.hasAnthropicKey)
  const setHasAnthropicKey = useStore(s => s.setHasAnthropicKey)
  const onSaved = () => {
    setHasAnthropicKey(true)
    qc.invalidateQueries({ queryKey: ['apikey-status'] })
  }
  const [keyInput, setKeyInput] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (!keyInput.trim()) return
    setSaving(true)
    try {
      await saveApiKey(keyInput.trim())
      setKeyInput(''); setKeyVisible(false); setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert(e.response?.data?.detail || 'API Key 저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--clr-text-strong)', marginBottom: 4 }}>
        ◆ Anthropic API Key
      </div>
      <div style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        서버 저장 — 모든 기기에서 공유됩니다. 앱 전체 사용자가 이 키로 AI 분석을 이용합니다.<br />
        발급: console.anthropic.com → API Keys → Create Key
      </div>
      {hasKey && (
        <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginBottom: 8 }}>
          ✓ API Key가 서버에 저장되어 있습니다
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input className="input"
            type={keyVisible ? 'text' : 'password'}
            placeholder={hasKey ? '새 키 입력 시 덮어씁니다' : 'sk-ant-api03-...'}
            value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setSaved(false) }}
            style={{ fontSize: 12, width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
          />
          <button onClick={() => setKeyVisible(v => !v)}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
              color: 'var(--clr-text-muted)', padding: 0 }}
            title={keyVisible ? '숨기기' : '보기'}>
            {keyVisible ? '🙈' : '👁'}
          </button>
        </div>
        <button className="btn-primary"
          disabled={saving || !keyInput.trim()}
          onClick={save}
          style={{ whiteSpace: 'nowrap', padding: '0 20px', width: 'auto',
            opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
      {saved && (
        <div style={{ fontSize: 11, color: 'var(--clr-pos-dark)', marginTop: 6 }}>
          ✓ 저장 완료 — 모든 기기에서 즉시 적용됩니다
        </div>
      )}
    </div>
  )
}
