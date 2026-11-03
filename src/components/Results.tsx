import { rankTitle } from '../game/ranks'
import { useEffect, useState } from 'react'
import { sfx, vibrate } from '../game/audio'
import { BUG_INFO, type GameStats } from '../game/engine'
import { bugSVG, svgUrl, type BugType } from '../game/sprites'
import { createRunId, firebaseConfigured, getBackend, queuePending, removePending, type Player, type ScoreSubmission } from '../lib/scores'
import { Backdrop } from './Backdrop'
import { GdgMark } from './Brand'

type SubmitState = 'sending' | 'sent' | 'error'

// Guard against React StrictMode double-invoking effects → double submissions.
const submitted = new WeakMap<GameStats, Promise<unknown>>()

function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - t, 4))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

export function Results({
  player,
  stats,
  prevBest,
  onReplay,
  onChangePlayer,
}: {
  player: Player
  stats: GameStats
  prevBest: number
  onReplay: () => void
  onChangePlayer: () => void
}) {
  const [runId] = useState(createRunId)
  const [state, setState] = useState<SubmitState>('sending')
  const [attempt, setAttempt] = useState(0)
  const shown = useCountUp(stats.score)
  const isPB = stats.score > prevBest && stats.score > 0
  const rank = rankTitle(stats.score)

  useEffect(() => {
    let alive = true
    const payload: ScoreSubmission = {
      id: runId,
      ...player,
      score: stats.score,
      bugs: stats.bugs,
      hazards: stats.hazards,
      accuracy: stats.accuracy,
      bestStreak: stats.bestStreak,
      gold: stats.gold,
    }
    let p = attempt === 0 ? submitted.get(stats) : undefined
    if (!p) {
      queuePending(payload)
      p = getBackend().then((b) =>
        Promise.race([b.submit(payload).then((row) => { removePending(runId); return row }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]),
      )
      submitted.set(stats, p)
    }
    p.then(
      () => {
        if (!alive) return
        setState('sent')
        sfx.success()
        vibrate([20, 60, 20])
      },
      () => {
        if (!alive) return
        setState('error')
      },
    )
    return () => {
      alive = false
    }
  }, [attempt, player, stats, runId])

  return (
    <div className="screen results">
      <Backdrop bugs={false} />
      <div className="results-inner">
        <div className="res-head">
          <GdgMark size={40} />
          <span>Debug session complete</span>
        </div>

        <div className="card score-card">
          {isPB && <div className="pb-ribbon">NEW PERSONAL BEST</div>}
          <div className="res-name">{player.name}</div>
          <div className="res-score">{shown.toLocaleString()}</div>
          <div className="res-rank">
            <span>{rank.emoji}</span> {rank.title}
          </div>

          <div className={`submit-chip ${state}`} role="status">
            {state === 'sending' && (
              <>
                <span className="spinner" /> Beaming to the big screen…
              </>
            )}
            {state === 'sent' && (
              <>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="check-path" />
                </svg>
                {firebaseConfigured ? 'Score submitted — look at the TV! 📺' : 'Saved locally · view the TV tab in this browser'}
              </>
            )}
            {state === 'error' && (
              <>
                ⚠️ Couldn’t reach the server
                <button className="link-btn" onClick={() => { setState('sending'); setAttempt((a) => a + 1) }}>
                  Retry
                </button>
              </>
            )}
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat">
            <b>{stats.bugs}</b>
            <span>bugs squashed</span>
          </div>
          <div className="stat">
            <b>{stats.accuracy}%</b>
            <span>accuracy</span>
          </div>
          <div className="stat">
            <b>{stats.bestStreak}</b>
            <span>best streak</span>
          </div>
          <div className="stat bad">
            <b>{stats.hazards}</b>
            <span>hazards hit</span>
          </div>
        </div>

        <div className="card breakdown">
          {(Object.keys(BUG_INFO) as BugType[]).map((t) => (
            <div key={t} className="bd-item">
              <img src={svgUrl(bugSVG(t))} alt={BUG_INFO[t].name} />
              <b>×{stats.byType[t]}</b>
            </div>
          ))}
        </div>

        <div className="res-actions">
          <button
            className="btn primary big"
            onClick={() => {
              sfx.unlock()
              sfx.ui()
              onReplay()
            }}
          >
            Play again
          </button>
          <button className="btn ghost" onClick={onChangePlayer}>
            Switch player
          </button>
        </div>
      </div>
    </div>
  )
}
