import { readStored, writeStored } from './lib/storage'
import { lazy, Suspense, useEffect, useState } from 'react'
import { GameScreen } from './components/GameScreen'
import { Register } from './components/Register'
import { Results } from './components/Results'
import type { GameStats } from './game/engine'
import { flushPending, playerIdFor, type Player } from './lib/scores'

const TVDisplay = lazy(() => import('./components/TVDisplay'))

function useHashRoute() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash.replace(/^#\/?/, '')
}

const PLAYER_KEY = 'bsq.player'
const bestKey = (p: Player) => `bsq.best.${playerIdFor(p.email)}`

function loadPlayer(): Player | null {
  try {
    const p = readStored<Player | null>(PLAYER_KEY, null)
    return p && typeof p.name === 'string' && typeof p.email === 'string' ? p : null
  } catch {
    return null
  }
}

type Screen = { name: 'register' } | { name: 'game'; key: number } | { name: 'results'; stats: GameStats; prevBest: number }

function PlayerApp() {
  const [player, setPlayer] = useState<Player | null>(loadPlayer)
  const [screen, setScreen] = useState<Screen>({ name: 'register' })
  const best = player ? Number(readStored(bestKey(player), 0)) : 0

  useEffect(() => {
    const retry = () => { void flushPending().catch(() => undefined) }
    retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  const play = () => setScreen({ name: 'game', key: Date.now() })

  if (screen.name === 'game' && player)
    return (
      <GameScreen
        key={screen.key}
        onDone={(stats) => {
          const prevBest = Number(readStored(bestKey(player), 0))
          if (stats.score > prevBest) writeStored(bestKey(player), stats.score)
          setScreen({ name: 'results', stats, prevBest })
        }}
      />
    )

  if (screen.name === 'results' && player)
    return (
      <Results
        player={player}
        stats={screen.stats}
        prevBest={screen.prevBest}
        onReplay={play}
        onChangePlayer={() => setScreen({ name: 'register' })}
      />
    )

  return (
    <Register
      initial={player}
      best={best}
      onStart={(p) => {
        writeStored(PLAYER_KEY, p)
        setPlayer(p)
        play()
      }}
    />
  )
}

export default function App() {
  const route = useHashRoute()
  if (route.startsWith('tv'))
    return (
      <Suspense fallback={<div className="screen loading">Loading leaderboard…</div>}>
        <TVDisplay />
      </Suspense>
    )
  return <PlayerApp />
}
