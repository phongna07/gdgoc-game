import { readStored, writeStored } from './storage'
/**
 * Score persistence. Uses Cloud Firestore when VITE_FIREBASE_* env vars are set,
 * otherwise falls back to a local demo store (localStorage + BroadcastChannel)
 * so the game and TV display work out of the box in two tabs of one browser.
 *
 * Firebase is dynamically imported so it never bloats the initial game bundle.
 */

export interface Player {
  name: string
  email: string
}

export interface ScoreSubmission extends Player {
  id: string
  score: number
  bugs: number
  hazards: number
  accuracy: number
  bestStreak: number
  gold: number
}

export interface PublicScore {
  id: string
  name: string
  playerId: string
  score: number
  bugs: number
  hazards: number
  accuracy: number
  bestStreak: number
  gold: number
  createdAt: number
}

export type Unsub = () => void

export interface ScoreBackend {
  kind: 'firebase' | 'local'
  submit(s: ScoreSubmission): Promise<PublicScore>
  /** Live top-N leaderboard, deduplicated to each player's best score. */
  subscribeTop(n: number, cb: (rows: PublicScore[]) => void, onError?: (error: Error) => void): Unsub
  /** Fires for every score submitted after subscribing. */
  subscribeNew(cb: (row: PublicScore) => void, onError?: (error: Error) => void): Unsub
}

/** randomUUID is unavailable on some phones using an HTTP LAN preview. */
export function createRunId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const EMAIL_RE = /^[a-z0-9._%+-]+@vinuni\.edu\.vn$/i

/** Non-reversible-ish public id so the TV can dedupe players without exposing emails. */
export function playerIdFor(email: string) {
  const str = email.trim().toLowerCase()
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function dedupeBest(rows: PublicScore[], n: number) {
  if (n <= 0) return []
  const seen = new Set<string>()
  const out: PublicScore[] = []
  for (const r of [...rows].sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)) {
    if (seen.has(r.playerId)) continue
    seen.add(r.playerId)
    out.push(r)
    if (out.length >= n) break
  }
  return out
}

export const firebaseConfigured = Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_API_KEY)

let backendPromise: Promise<ScoreBackend> | null = null

export function getBackend(): Promise<ScoreBackend> {
  if (!backendPromise) {
    backendPromise = firebaseConfigured
      ? import('./firebaseBackend').then((m) => m.createFirebaseBackend())
      : import('./localBackend').then((m) => m.createLocalBackend())
  }
  return backendPromise
}

// ---- Offline safety net: keep unsent scores and retry on next launch ----
const PENDING_KEY = 'bsq.pending'

function pendingScores(): ScoreSubmission[] {
  const value = readStored<ScoreSubmission[]>(PENDING_KEY, [])
  return Array.isArray(value) ? value.filter((s) => s && typeof s.id === 'string') : []
}

export function queuePending(s: ScoreSubmission) {
  const list = pendingScores().filter((row) => row.id !== s.id)
  return writeStored(PENDING_KEY, [...list, s].slice(-50))
}

export function removePending(id: string) {
  writeStored(PENDING_KEY, pendingScores().filter((row) => row.id !== id))
}

let flushing: Promise<void> | null = null
export function flushPending(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const list = pendingScores()
    if (!list.length) return
    const backend = await getBackend()
    for (const s of list) {
      try {
        await backend.submit(s)
        removePending(s.id)
      } catch {
        // Keep this score, including if a submission was added during this flush.
      }
    }
  })().finally(() => { flushing = null })
  return flushing
}
