import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { sfx } from '../game/audio'
import { GAME_DURATION, GameEngine, type GameStats, type HudState } from '../game/engine'
import { spritesReady } from '../game/sprites'

type Phase = 'countdown' | 'playing' | 'over'

export function GameScreen({ onDone }: { onDone: (s: GameStats) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])

  const [phase, setPhase] = useState<Phase>('countdown')
  const [count, setCount] = useState(3)
  const [hud, setHud] = useState<HudState>({ score: 0, remaining: GAME_DURATION, streak: 0, frenzy: false })
  const [flash, setFlash] = useState(0)
  const [frenzyIntro, setFrenzyIntro] = useState(false)
  const [paused, setPaused] = useState(document.hidden)
  const [muted, setMuted] = useState(sfx.muted)

  useEffect(() => {
    const canvas = canvasRef.current!
    const timers: number[] = []
    const engine = new GameEngine(canvas, {
      onHud: setHud,
      onHazard: () => setFlash((f) => f + 1),
      onFrenzy: () => {
        setFrenzyIntro(true)
        timers.push(window.setTimeout(() => setFrenzyIntro(false), 1700))
      },
      onEnd: (stats) => {
        sfx.stopMusic()
        sfx.gameOver()
        setPhase('over')
        timers.push(window.setTimeout(() => doneRef.current(stats), 1700))
      },
    })
    engineRef.current = engine
    const visibility = () => {
      engine.setPaused(document.hidden)
      setPaused(document.hidden)
      if (document.hidden) sfx.stopMusic()
      else if (started) sfx.startMusic()
    }
    let started = false
    visibility()
    document.addEventListener('visibilitychange', visibility)

    const ro = new ResizeObserver(() => engine.resize())
    ro.observe(canvas)

    let cancelled = false
    spritesReady().then(() => {
      if (cancelled) return
      let n = 3
      setCount(n)
      sfx.count(n)
      const step = () => {
        n--
        setCount(n)
        sfx.count(n)
        if (n > 0) timers.push(window.setTimeout(step, 750))
        else {
          timers.push(
            window.setTimeout(() => {
              setPhase('playing')
              engine.start()
              sfx.setFrenzy(false)
              started = true
              if (!document.hidden) sfx.startMusic()
            }, 450),
          )
        }
      }
      timers.push(window.setTimeout(step, 750))
    })

    // Block pinch/double-tap zoom & context menus during play
    const prevent = (e: Event) => {
      if (e.target === canvas) e.preventDefault()
    }
    const wrap = wrapRef.current!
    wrap.addEventListener('touchstart', prevent, { passive: false })
    wrap.addEventListener('contextmenu', prevent)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', visibility)
      timers.forEach(clearTimeout)
      ro.disconnect()
      engine.destroy()
      sfx.stopMusic()
      wrap.removeEventListener('touchstart', prevent)
      wrap.removeEventListener('contextmenu', prevent)
    }
  }, [])

  const toCanvas = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [x, y] = toCanvas(e)
    engineRef.current?.pointerDown(x, y)
  }
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return
    const [x, y] = toCanvas(e)
    engineRef.current?.pointerMove(x, y)
  }

  const secs = Math.ceil(hud.remaining / 1000)
  const progress = hud.remaining / GAME_DURATION
  const R = 26
  const C = 2 * Math.PI * R

  return (
    <div ref={wrapRef} className={`screen game ${hud.frenzy ? 'frenzy' : ''}`}>
      <div className="game-bg">
        <div className="dotgrid" />
        <div className="frenzy-bg">
          <div className="frenzy-glow g1" />
          <div className="frenzy-glow g2" />
          <div className="frenzy-stripes" />
          <div className="frenzy-x2">×2</div>
        </div>
      </div>

      <canvas aria-label="Tap moving bugs to score points. Avoid coffee and clean code." ref={canvasRef} className="playfield" onPointerDown={onDown} onPointerMove={onMove} />

      <div className="hud">
        <div className="hud-score">
          <span className="hud-label">Score</span>
          <span key={hud.score} className="hud-value bump">
            {hud.score.toLocaleString()}
          </span>
        </div>

        <div className={`hud-timer ${secs <= 5 ? 'hot' : ''}`}>
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={R} className="track" />
            <circle
              cx="32"
              cy="32"
              r={R}
              className="bar"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              transform="rotate(-90 32 32)"
            />
          </svg>
          <span key={secs <= 5 ? secs : 'n'} className={secs <= 5 ? 'pulse' : ''}>
            {secs}
          </span>
        </div>

        <div className="hud-right">
          <button
            className="icon-btn"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              sfx.setMuted(!muted)
              setMuted(!muted)
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <div className={`streak ${hud.streak >= 3 ? 'on' : ''}`}>
            <span key={hud.streak}>{hud.streak >= 3 ? `🔥 ${hud.streak}` : `${hud.streak}`}</span>
            <small>streak</small>
          </div>
        </div>
      </div>

      {hud.frenzy && !frenzyIntro && phase === 'playing' && <div className="frenzy-chip">FRENZY ×2</div>}
      {frenzyIntro && (
        <div className="frenzy-intro">
          <div className="fi-title">FRENZY</div>
          <div className="fi-sub">2× bugs · 2× points</div>
        </div>
      )}

      {flash > 0 && <div key={flash} className="hazard-flash" />}

      {phase === 'countdown' && (
        <div className="overlay countdown">
          <div key={count} className={`count-num c${count}`}>
            {count > 0 ? count : 'GO!'}
          </div>
          <p className="count-hint">Tap the bugs. Avoid ☕ and ✅ modules.</p>
        </div>
      )}
      {paused && phase === 'playing' && <div className="overlay countdown"><p>Paused · return to this page to continue</p></div>}
      {phase === 'over' && (
        <div className="overlay over">
          <div className="over-title">TIME’S UP!</div>
          <div className="over-score">{hud.score.toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}
