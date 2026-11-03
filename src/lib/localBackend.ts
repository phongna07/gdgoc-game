import { dedupeBest, playerIdFor, type PublicScore, type ScoreBackend } from './scores'

const KEY = 'bsq.local.scores'
const CHANNEL = 'bsq-scores'

function read(): PublicScore[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

/** Demo backend: works across tabs of the same browser (e.g. laptop + TV tab). */
export function createLocalBackend(): ScoreBackend {
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null

  return {
    kind: 'local',

    async submit(s) {
      await new Promise((r) => setTimeout(r, 450)) // feel like a network round-trip
      const existing = read().find((row) => row.id === s.id)
      if (existing) return existing
      const row: PublicScore = {
        id: s.id,
        name: s.name.trim().slice(0, 24),
        playerId: playerIdFor(s.email),
        score: s.score,
        bugs: s.bugs,
        hazards: s.hazards,
        accuracy: s.accuracy,
        bestStreak: s.bestStreak,
        gold: s.gold,
        createdAt: Date.now(),
      }
      const all = read()
      all.push(row)
      localStorage.setItem(KEY, JSON.stringify(all.slice(-500)))
      channel?.postMessage(row)
      return row
    },

    subscribeTop(n, cb) {
      const emit = () => cb(dedupeBest(read(), n))
      emit()
      const onMsg = () => emit()
      const onStorage = (e: StorageEvent) => e.key === KEY && emit()
      channel?.addEventListener('message', onMsg)
      window.addEventListener('storage', onStorage)
      return () => {
        channel?.removeEventListener('message', onMsg)
        window.removeEventListener('storage', onStorage)
      }
    },

    subscribeNew(cb) {
      // A dedicated channel instance: BroadcastChannel doesn't deliver to its own sender.
      const ch = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null
      const seen = new Set(read().map((row) => row.id))
      const emit = (row: PublicScore) => {
        if (seen.has(row.id)) return
        seen.add(row.id)
        cb(row)
      }
      const onMsg = (e: MessageEvent<PublicScore>) => emit(e.data)
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) read().forEach(emit)
      }
      ch?.addEventListener('message', onMsg)
      window.addEventListener('storage', onStorage)
      return () => {
        ch?.close()
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}
