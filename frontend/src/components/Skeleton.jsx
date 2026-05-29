/**
 * Skeleton — 로딩 중 shimmer 플레이스홀더
 * tokens.css 의 .skeleton, .skeleton-row 클래스를 사용합니다.
 */

/** 단순 사각형 skeleton (width/height 자유 지정) */
export function Skeleton({ width, height = 12, style, className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width, ...style }}
    />
  )
}

/**
 * 종목 행 skeleton (LogoCircle + 텍스트 2줄 + 숫자 2줄)
 * HoldingsTab, WatchlistPanel, PortfolioPanel 등에서 사용
 */
export function SkeletonRow({ avatarSize = 36 }) {
  return (
    <div className="skeleton-row">
      <div
        className="skeleton"
        style={{ width: avatarSize, height: avatarSize, flexShrink: 0 }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="skeleton skeleton-text-sm" style={{ width: '62%' }} />
        <div className="skeleton skeleton-text-xs" style={{ width: '38%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div className="skeleton skeleton-text-sm" style={{ width: 52 }} />
        <div className="skeleton skeleton-text-xs" style={{ width: 36 }} />
      </div>
    </div>
  )
}

/**
 * 뉴스 아이템 skeleton (점 + 텍스트 2줄)
 * ChartPanel 뉴스 로딩에 사용
 */
export function SkeletonNews() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 0' }}>
      <div
        className="skeleton"
        style={{ width: 6, height: 6, borderRadius: 9999, flexShrink: 0, marginTop: 5 }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className="skeleton skeleton-text-sm" style={{ width: '90%' }} />
        <div className="skeleton skeleton-text-sm" style={{ width: '70%' }} />
        <div className="skeleton skeleton-text-xs" style={{ width: '30%' }} />
      </div>
    </div>
  )
}
