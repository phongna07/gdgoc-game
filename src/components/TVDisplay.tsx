import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { bugSVG, svgUrl } from '../game/sprites'
import { getBackend, type PublicScore, type ScoreBackend } from '../lib/scores'
import { Backdrop } from './Backdrop'
import { GdgBadge, Wordmark } from './Brand'
import { Confetti, type ConfettiHandle } from './Confetti'
import { rankTitle } from '../game/ranks'

const TOP_N = 10

function gameUrl() {
  const params = new URLSearchParams(location.search)
  return params.get('play') || import.meta.env.VITE_PUBLIC_GAME_URL || `${location.origin}${location.pathname}`
}

function QR({ url }: { url: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true })
  }, [url])
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
}

function timeAgo(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`
}

export default function TVDisplay() {
  const [backend, setBackend] = useState<ScoreBackend | null>(null)
  const [top, setTop] = useState<PublicScore[]>([])
  const [recent, setRecent] = useState<PublicScore[]>([])
  const [queue, setQueue] = useState<PublicScore[]>([])
  const current = queue[0] ?? null
  const highlight = current?.id
  const [error, setError] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const confetti = useRef<ConfettiHandle>(null)
  const url = gameUrl()

  useEffect(() => {
    let unsubs: (() => void)[] = []
    let alive = true
    getBackend().then((b) => {
      if (!alive) return
      setBackend(b)
      unsubs = [
        b.subscribeTop(TOP_N, (rows) => { setTop(rows); setError(false) }, () => setError(true)),
        b.subscribeNew((row) => {
          setRecent((r) => [row, ...r.filter((x) => x.id !== row.id)].slice(0, 6))
          setQueue((q) => [...q, row].slice(-50))
        }, () => setError(true)),
      ]
    }).catch(() => { if (alive) setError(true) })
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => {
      alive = false
      unsubs.forEach((u) => u())
      clearInterval(t)
    }
  }, [])

  // A bounded FIFO keeps celebrations ordered when several players finish together.
  useEffect(() => {
    if (!current) return
    confetti.current?.burst(160)
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), 4200)
    return () => clearTimeout(timer)
  }, [current])

  const currentRank = current ? top.findIndex((r) => r.playerId === current.playerId && r.score === current.score) : -1

  return (
    <div className="screen tv">
      <Backdrop />
      <Confetti ref={confetti} />

      <header className="tv-header">
        <GdgBadge />
        <div className="tv-live">
          <span className="live-dot" /> {error ? 'CONNECTION ERROR · check Firebase setup' : 'LIVE'}
          {backend?.kind === 'local' && <span className="tv-demo">demo mode · local only</span>}
        </div>
      </header>

      <main className="tv-main">
        <section className="tv-left">
          <Wordmark className="tv-wordmark" />
          <p className="tv-tag">30 seconds. Squash bugs. Avoid clean code & coffee. Final 5s = FRENZY ×2.</p>
          <div className="card tv-join">
            <QR url={url} />
            <div>
              <div className="tv-join-title">Scan to play</div>
              <div className="tv-join-url">{url.replace(/^https?:\/\//, '')}</div>
              <div className="tv-join-sub">No install · No account</div>
            </div>
          </div>
          <div className="card tv-feed">
            <div className="tv-feed-title">Latest runs</div>
            {recent.length === 0 && <div className="tv-empty">Waiting for the first debugger…</div>}
            {recent.map((r) => (
              <div key={r.id} className="feed-row">
                <span className="feed-name">{r.name}</span>
                <span className="feed-score">{r.score.toLocaleString()}</span>
                <span className="feed-time">{timeAgo(r.createdAt, now)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card tv-board">
          <div className="board-head">
            <h2>Leaderboard</h2>
            <span>Top {TOP_N} debuggers</span>
          </div>
          <ol className="board">
            {top.length === 0 && (
              <li className="board-empty">
                <img src={svgUrl(bugSVG('gold'))} alt="" />
                No scores yet — be the first!
              </li>
            )}
            {top.map((r, i) => (
              <li key={r.playerId} className={`row r${i + 1} ${highlight === r.id ? 'fresh' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                <span className="rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                <span className="who">
                  <b>{r.name}</b>
                  <small>
                    {rankTitle(r.score).title} · {r.bugs} bugs · {r.accuracy}%
                  </small>
                </span>
                <span className="pts">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {current && (
        <div className="tv-celebrate" key={current.id}>
          <div className="cel-card">
            <div className="cel-kicker">{currentRank === 0 ? '👑 NEW #1 HIGH SCORE!' : currentRank > 0 ? `🎉 Enters the Top ${TOP_N} at #${currentRank + 1}` : '✅ Score received'}</div>
            <div className="cel-name">{current.name}</div>
            <div className="cel-score">{current.score.toLocaleString()}</div>
            <div className="cel-meta">
              {current.bugs} bugs squashed · {current.accuracy}% accuracy · best streak {current.bestStreak}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
