import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { searchStocks, addWatchlist } from '../api'
import { useStore } from '../store'
import LogoCircle from '../components/LogoCircle'

export default function ExploreTab() {
  const qc = useQueryClient()
  const setChartTicker = useStore(s => s.setChartTicker)

  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 400)
    return () => clearTimeout(t)
  }, [query])

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ['search', debouncedQ],
    queryFn: () => searchStocks(debouncedQ),
    enabled: debouncedQ.length >= 1,
  })

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="section-title">종목 검색</div>
      <input
        className="input"
        placeholder="종목명, 티커, 한글 검색..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {isFetching && <div className="spinner" />}

      {searchResults.map(item => (
        <div key={item.symbol} className="row-item">
          <LogoCircle ticker={item.symbol} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stock-ticker">{item.symbol}</div>
            <div className="stock-name">{item.shortname}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn-icon" onClick={() => setChartTicker(item.symbol)}>📈</button>
            <button className="btn-icon" title="관심 추가" onClick={async () => {
              await addWatchlist({ ticker: item.symbol, name: item.shortname, exchange: item.exchange || '', qtype: item.quoteType || '' })
              qc.invalidateQueries({ queryKey: ['portfolio'] })
              alert(`⭐ ${item.symbol} 관심 추가!`)
            }}>⭐</button>
          </div>
        </div>
      ))}
    </div>
  )
}
