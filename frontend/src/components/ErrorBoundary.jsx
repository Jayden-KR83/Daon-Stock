import React from 'react'

/**
 * React 컴포넌트 트리 안 어디서든 JS exception 발생 시 흰 화면 대신 명확한 안내.
 * - 사용자에게 어떤 영역이 깨졌는지 + 새로고침 / 보고 옵션
 * - production에서는 stack 숨기고, dev에서는 보임
 * - 새 빌드 hash mismatch (ChunkLoadError) 자동 감지 → 1회 자동 새로고침
 *
 * 사용:
 *   <ErrorBoundary name="HoldingsTab"><HoldingsTab/></ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, reloaded: false }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    this.setState({ info })
    // ChunkLoadError or dynamic import 실패 → 1회 자동 새로고침 시도
    const msg = String(error?.message || error?.name || '')
    const isChunkErr = /ChunkLoadError|Loading chunk|Importing a module script failed|Failed to fetch dynamically imported/i.test(msg)
    if (isChunkErr && !sessionStorage.getItem('eb-reloaded-once')) {
      sessionStorage.setItem('eb-reloaded-once', '1')
      // 같은 세션 1회만 자동 reload — 무한 reload loop 방지
      window.location.reload()
      return
    }
    // 콘솔에 보존 (개발자 도구로 추적 가능)
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.name || 'root'}]`, error, info)
  }
  handleReload = () => {
    sessionStorage.removeItem('eb-reloaded-once')
    window.location.reload()
  }
  handleReset = () => {
    this.setState({ error: null, info: null })
  }
  render() {
    if (!this.state.error) return this.props.children

    const msg = String(this.state.error?.message || this.state.error || '알 수 없는 오류')
    const isChunkErr = /ChunkLoadError|Loading chunk|Failed to fetch dynamically/i.test(msg)
    const area = this.props.name || '화면 일부'
    const showStack = (typeof window !== 'undefined') && /localhost|127\.0\.0\.1/.test(window.location.hostname)

    return (
      <div className="ko-keep" style={{
        margin: 20, padding: '18px 20px',
        background: 'var(--m-surface)',
        border: '1px solid var(--m-outline-variant)',
        borderRadius: 4,
        color: 'var(--m-text)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 800,
          color: 'var(--m-negative)', marginBottom: 6 }}>
          {isChunkErr ? '앱 업데이트 감지' : `${area} 화면 오류`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--m-text-secondary)',
          lineHeight: 1.65, marginBottom: 4 }}>
          {isChunkErr
            ? '새 버전이 배포되었습니다. 새로고침하시면 최신 화면이 표시됩니다.'
            : '이 영역만 일시적으로 표시되지 못했습니다. 나머지 화면은 정상 동작합니다.'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--m-text-tertiary)',
          lineHeight: 1.6, marginBottom: 12, fontFamily: 'monospace',
          wordBreak: 'break-all' }}>
          {msg}
        </div>
        {showStack && this.state.info?.componentStack && (
          <pre style={{ fontSize: 10, color: 'var(--m-text-tertiary)',
            background: 'var(--m-surface-variant)', padding: 8, borderRadius: 2,
            overflow: 'auto', maxHeight: 200, marginBottom: 12 }}>
            {this.state.info.componentStack}
          </pre>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={this.handleReload} style={{
            padding: '8px 14px', borderRadius: 2, border: 'none',
            background: 'var(--m-text)', color: 'var(--m-surface)',
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>새로고침</button>
          {!isChunkErr && (
            <button onClick={this.handleReset} style={{
              padding: '8px 14px', borderRadius: 2,
              background: 'transparent',
              border: '1px solid var(--m-outline-variant)',
              color: 'var(--m-text-secondary)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>이 화면만 다시 시도</button>
          )}
        </div>
      </div>
    )
  }
}
