/* ══════════════════════════════════════════════════════════════════════
   전략 리포트 생성 작업 — 화면을 떠나도 계속 돈다
   ══════════════════════════════════════════════════════════════════════
   문제: 갱신을 누르고 다른 탭으로 가면 분석이 멈춘 것처럼 보였고, 돌아와서
   처음부터 다시 눌러야 했다(2026-09-14 지적).

   원인: 폴링 루프가 AllocationTab 안에 있었다. 탭을 옮기면 컴포넌트가
   언마운트되고 그 setState 는 아무 데도 닿지 않는다. **서버는 계속 만들고
   있었는데** 화면만 그 사실을 잊은 것이다 — 그래서 다시 누르면 이미 끝난
   작업을 또 시키게 된다(토큰도 두 번 쓴다).

   그래서 작업을 컴포넌트 밖(모듈 수준)에 둔다. 화면은 구독만 한다.
   sessionStorage 에도 남겨 새로고침 후에도 이어받는다.

   ⚠ 이 모듈은 scope(계좌) 당 하나의 작업만 허용한다. 같은 scope 로 두 번
     누르면 새로 시작하지 않고 돌고 있는 작업에 붙는다.
   ══════════════════════════════════════════════════════════════════════ */
import { pollPortfolioStrategy } from '../api'

const KEY = 'daon.strategyJobs.v1'
const POLL_MS = 5000
const MAX_MS = 210_000        // Cloudflare 100초 한도를 피해 5초 간격으로 ~3.5분

/** scope -> { fp, startedAt, status, data, error, timer, subs:Set<fn> } */
const jobs = new Map()

function persist() {
  try {
    const out = {}
    for (const [scope, j] of jobs) {
      if (j.status === 'running') out[scope] = { fp: j.fp, startedAt: j.startedAt }
    }
    sessionStorage.setItem(KEY, JSON.stringify(out))
  } catch { /* 시크릿 창 등 — 기억하지 못할 뿐 동작에는 지장 없다 */ }
}

function restore() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || '{}')
    for (const [scope, v] of Object.entries(raw)) {
      if (!v?.fp) continue
      if (Date.now() - (v.startedAt || 0) > MAX_MS) continue   // 이미 늦은 작업은 버린다
      start(scope, v.fp, v.startedAt)
    }
  } catch { /* 형식이 깨졌으면 없던 것으로 */ }
}

function emit(scope) {
  const j = jobs.get(scope)
  if (!j) return
  for (const cb of j.subs) {
    try { cb(snapshot(scope)) } catch { /* 구독자 하나가 죽어도 나머지는 받는다 */ }
  }
}

function finish(scope, patch) {
  const j = jobs.get(scope)
  if (!j) return
  clearTimeout(j.timer)
  Object.assign(j, patch)
  persist()
  emit(scope)
}

async function tick(scope) {
  const j = jobs.get(scope)
  if (!j || j.status !== 'running') return
  if (Date.now() - j.startedAt > MAX_MS) {
    finish(scope, { status: 'error', error: '분석이 지연되고 있습니다 — 잠시 후 다시 시도해주세요' })
    return
  }
  try {
    const p = await pollPortfolioStrategy(j.fp, scope)
    if (p?.status === 'done') return finish(scope, { status: 'done', data: p.data })
    if (p?.status === 'error') return finish(scope, { status: 'error', error: p.error || 'AI 분석 실패' })
  } catch {
    // 일시적 네트워크 오류는 그냥 다음 차례에 다시 묻는다
  }
  const cur = jobs.get(scope)
  if (cur && cur.status === 'running') cur.timer = setTimeout(() => tick(scope), POLL_MS)
}

/** 작업 시작(이미 돌고 있으면 그 작업에 붙는다). */
export function start(scope, fp, startedAt = Date.now()) {
  const cur = jobs.get(scope)
  if (cur && cur.status === 'running' && cur.fp === fp) return
  if (cur) clearTimeout(cur.timer)
  jobs.set(scope, {
    fp, startedAt, status: 'running', data: null, error: '',
    subs: cur?.subs || new Set(), timer: null,
  })
  persist()
  emit(scope)
  const j = jobs.get(scope)
  j.timer = setTimeout(() => tick(scope), POLL_MS)
}

/** 결과를 받아 갔으면 지운다 — 탭을 다시 열 때 옛 결과가 또 뜨지 않게. */
export function clear(scope) {
  const j = jobs.get(scope)
  if (!j) return
  clearTimeout(j.timer)
  j.status = 'idle'; j.data = null; j.error = ''
  persist()
}

export function snapshot(scope) {
  const j = jobs.get(scope)
  if (!j) return { status: 'idle', data: null, error: '' }
  return { status: j.status, data: j.data, error: j.error, startedAt: j.startedAt }
}

export function subscribe(scope, cb) {
  let j = jobs.get(scope)
  if (!j) {
    j = { fp: '', startedAt: 0, status: 'idle', data: null, error: '', subs: new Set(), timer: null }
    jobs.set(scope, j)
  }
  j.subs.add(cb)
  cb(snapshot(scope))
  return () => { j.subs.delete(cb) }
}

restore()
