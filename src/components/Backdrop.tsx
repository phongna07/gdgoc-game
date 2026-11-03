import { useMemo } from 'react'
import { bugSVG, svgUrl, type BugType } from '../game/sprites'

const SHAPES = ['circle', 'square', 'tri', 'chev', 'brace', 'circle', 'square', 'chev'] as const
const COLORS = ['blue', 'red', 'yellow', 'green'] as const

/** Decorative floating Google-coloured shapes + a few wandering bugs. */
export function Backdrop({ bugs = true }: { bugs?: boolean }) {
  const items = useMemo(
    () =>
      SHAPES.map((s, i) => ({
        s,
        c: COLORS[i % 4],
        left: (i * 37 + 7) % 100,
        top: (i * 53 + 11) % 100,
        size: 26 + ((i * 17) % 40),
        delay: -i * 1.7,
        dur: 9 + (i % 4) * 2,
      })),
    [],
  )
  const walkers = useMemo(
    () =>
      (['blue', 'red', 'green', 'gold'] as BugType[]).map((t, i) => ({
        src: svgUrl(bugSVG(t, 0)),
        src2: svgUrl(bugSVG(t, 1)),
        top: 12 + i * 22,
        dur: 14 + i * 3,
        delay: -i * 4.5,
        rev: i % 2 === 1,
      })),
    [],
  )
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="dotgrid" />
      {items.map((it, i) => (
        <span
          key={i}
          className={`shape shape-${it.s} c-${it.c}`}
          style={{
            left: `${it.left}%`,
            top: `${it.top}%`,
            width: it.size,
            height: it.size,
            animationDelay: `${it.delay}s`,
            animationDuration: `${it.dur}s`,
          }}
        />
      ))}
      {bugs &&
        walkers.map((w, i) => (
          <div
            key={i}
            className={`walker ${w.rev ? 'rev' : ''}`}
            style={{ top: `${w.top}%`, animationDuration: `${w.dur}s`, animationDelay: `${w.delay}s` }}
          >
            <img src={w.src} alt="" className="walk-a" />
            <img src={w.src2} alt="" className="walk-b" />
          </div>
        ))}
    </div>
  )
}
