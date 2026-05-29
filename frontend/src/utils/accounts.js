import { useStore } from '../store'

/**
 * 동적 계좌 — 사용자별 계좌 목록을 store에서 가져와 사용하기 편한 형태로 제공.
 *
 * 반환:
 *   accounts:    [{key, label, currency, sort_order}, ...]  — 원본 배열
 *   accountKeys: ['US', 'KR_RETIRE', ...]                   — key만 추출 (구 ACCOUNTS 대체)
 *   accLabels:   {US: '미국', ...}                          — 매핑 객체 (구 ACC_LABELS 대체)
 *   isKrAccount: (key) => boolean                           — 통화 KRW 여부
 *   isUsAccount: (key) => boolean                           — 통화 USD 여부
 */
export function useAccounts() {
  const accounts = useStore(s => s.accounts)
  return {
    accounts,
    accountKeys: accounts.map(a => a.key),
    accLabels:   Object.fromEntries(accounts.map(a => [a.key, a.label])),
    isKrAccount: (key) => accounts.find(a => a.key === key)?.currency === 'KRW',
    isUsAccount: (key) => accounts.find(a => a.key === key)?.currency === 'USD',
  }
}
