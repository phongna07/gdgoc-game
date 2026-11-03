import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { G } from '../game/sprites'

export interface ConfettiHandle {
  burst: (n?: number) => void
}

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  w: number
  h: number
  color: string
  life: number
  shape: 0 | 1 | 2
}

const COLORS = [G.blue, G.red, G.yellow, G.green]

/** Full-screen canvas confetti cannon in Google colours. */
export function Confetti({ ref }: { ref?: Ref<ConfettiHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pieces = useRef<Piece[]>([])
  const running = useRef(false)

  function start() {
    running.current = true
    let last = performance.now()
    const frame = (now: number) => {
      const c = canvasRef.current
      if (!c) return
      const ctx = c.getContext('2d')!
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (c.width !== c.clientWidth * dpr) {
        c.width = c.clientWidth * dpr
        c.height = c.clientHeight * dpr
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, c.clientWidth, c.clientHeight)
      for (const p of pieces.current) {
        p.life -= dt
        p.vx *= Math.exp(-1.6 * dt)
        p.vy = p.vy * Math.exp(-1.6 * dt) + 900 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        ctx.save()
        ctx.globalAlpha = Math.min(1, p.life)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.scale(1, Math.cos(p.rot * 1.7))
        ctx.fillStyle = p.color
        if (p.shape === 0) ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        else if (p.shape === 1) {
          ctx.beginPath()
          ctx.arc(0, 0, p.h / 2 + 1, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // tiny GDG chevron
          ctx.strokeStyle = p.color
          ctx.lineWidth = 3
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(-3, -6)
          ctx.lineTo(4, 0)
          ctx.lineTo(-3, 6)
          ctx.stroke()
        }
        ctx.restore()
      }
      pieces.current = pieces.current.filter((p) => p.life > 0 && p.y < c.clientHeight + 40)
      if (pieces.current.length) requestAnimationFrame(frame)
      else {
        running.current = false
        ctx.clearRect(0, 0, c.clientWidth, c.clientHeight)
      }
    }
    requestAnimationFrame(frame)
  }

  useImperativeHandle(ref, () => ({
    burst(n = 160) {
      const c = canvasRef.current
      if (!c) return
      const w = c.clientWidth
      const h = c.clientHeight
      for (let i = 0; i < n; i++) {
        const fromLeft = i % 2 === 0
        const a = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9
        const s = 700 + Math.random() * 900
        pieces.current.push({
          x: fromLeft ? -10 : w + 10,
          y: h * 0.75,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 14,
          w: 8 + Math.random() * 10,
          h: 6 + Math.random() * 8,
          color: COLORS[i % 4],
          life: 3 + Math.random() * 2,
          shape: (i % 3) as 0 | 1 | 2,
        })
      }
      if (!running.current) start()
    },
  }))


  useEffect(
    () => () => {
      pieces.current = []
    },
    [],
  )

  return <canvas ref={canvasRef} className="confetti" aria-hidden="true" />
}
