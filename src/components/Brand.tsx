import { G } from '../game/sprites'

export function GdgMark({ size = 40, stroke = 7 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 64 40" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeWidth={stroke}>
        <path d="M24 6 L8 20" stroke={G.red} />
        <path d="M8 20 L24 34" stroke={G.blue} />
        <path d="M40 6 L56 20" stroke={G.green} />
        <path d="M56 20 L40 34" stroke={G.yellow} />
      </g>
    </svg>
  )
}

export function GdgBadge({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`gdg-badge ${dark ? 'dark' : ''}`}>
      <GdgMark size={34} stroke={7} />
      <div className="gdg-badge-text">
        <span className="gdg-badge-title">Google Developer Groups</span>
        <span className="gdg-badge-sub">On Campus · VinUniversity</span>
      </div>
    </div>
  )
}

const COLORS = [G.blue, G.red, G.yellow, G.blue, G.green, G.red]

export function Wordmark({ text = 'Bug Squasher', className = '' }: { text?: string; className?: string }) {
  let k = 0
  return (
    <h1 className={`wordmark ${className}`} aria-label={text}>
      {text.split('').map((ch, i) => {
        if (ch === ' ') return <span key={i} className="wm-space" />
        const c = COLORS[k++ % COLORS.length]
        return (
          <span key={i} className="wm-letter" style={{ color: c, animationDelay: `${i * 60}ms` }}>
            {ch}
          </span>
        )
      })}
    </h1>
  )
}
