import { sfx, vibrate } from './audio'
import { getSprites, type BugType, type HazardType, G } from './sprites'

export const GAME_DURATION = 30_000
export const FRENZY_AT = 5_000
export const HAZARD_PENALTY = 150

export const BUG_INFO: Record<BugType, { name: string; points: number; speed: number; dodge: number; color: string }> = {
  blue: { name: 'Syntax Bug', points: 100, speed: 1, dodge: 0.35, color: G.blue },
  red: { name: 'Null Pointer', points: 150, speed: 1.15, dodge: 0.5, color: G.red },
  green: { name: 'Race Condition', points: 200, speed: 1.4, dodge: 0.7, color: G.green },
  gold: { name: 'GDGoC Golden Bug', points: 300, speed: 1.7, dodge: 1, color: G.yellow },
}

export const HAZARD_INFO: Record<HazardType, { name: string }> = {
  clean: { name: 'Clean Code' },
  coffee: { name: 'Coffee Mug' },
}

export interface HudState {
  score: number
  remaining: number
  streak: number
  frenzy: boolean
}

export interface GameStats {
  score: number
  bugs: number
  hazards: number
  taps: number
  accuracy: number
  bestStreak: number
  gold: number
  byType: Record<BugType, number>
}

interface Callbacks {
  onHud: (s: HudState) => void
  onFrenzy: () => void
  onHazard: () => void
  onEnd: (stats: GameStats) => void
}

interface Entity {
  id: number
  kind: 'bug' | 'hazard'
  bug?: BugType
  hazard?: HazardType
  x: number
  y: number
  heading: number
  speed: number
  boost: number
  r: number
  born: number
  ttl: number
  escaping: boolean
  nextJuke: number
  legPhase: number
  bob: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  kind: 'dot' | 'glyph' | 'ring' | 'text' | 'spark'
  text?: string
  rot: number
  vr: number
}

interface Splat {
  x: number
  y: number
  color: string
  life: number
  blobs: { dx: number; dy: number; r: number }[]
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const GLYPHS = ['{ }', '</>', ';', '()', '=>', '0x1F', '//', '[]', '!=', '&&']

export class GameEngine {
  private ctx: CanvasRenderingContext2D
  private sprites = getSprites()
  private w = 0
  private h = 0
  private dpr = 1
  private unit = 36
  private topInset = 84

  private entities: Entity[] = []
  private particles: Particle[] = []
  private splats: Splat[] = []
  private nextId = 1
  private raf = 0
  private last = 0
  private time = 0 // elapsed game ms
  private paused = false
  private running = false
  private ended = false
  private spawnTimer = 0
  private frenzy = false
  private lastTickSecond = -1
  private shake = 0
  private hover: { x: number; y: number } | null = null

  private score = 0
  private streak = 0
  private bestStreak = 0
  private taps = 0
  private hits = 0
  private hazardsHit = 0
  private byType: Record<BugType, number> = { blue: 0, red: 0, green: 0, gold: 0 }
  private lastHud = ''
  private cb: Callbacks
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas
    this.cb = cb
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('Canvas 2D unsupported')
    this.ctx = ctx
    this.resize()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = Math.round(rect.width * this.dpr)
    this.canvas.height = Math.round(rect.height * this.dpr)
    this.unit = clamp(Math.min(this.w, this.h) * 0.085, 30, 54)
    this.topInset = this.w < 600 ? 92 : 104
  }

  start() {
    this.running = true
    this.time = 0
    this.last = performance.now()
    for (let i = 0; i < 3; i++) this.spawnBug(true)
    this.emitHud(true)
  }

  setPaused(paused: boolean) {
    this.paused = paused
    this.last = performance.now()
    this.hover = null
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.running = false
  }

  /** Difficulty 0..1 scales with score. */
  private get difficulty() {
    return clamp(this.score / 4500, 0, 1)
  }

  // ---------------------------------------------------------------- input

  pointerMove(x: number, y: number) {
    this.hover = { x, y }
  }

  pointerDown(x: number, y: number) {
    if (!this.running || this.ended || this.paused) return
    this.taps++
    // Find the closest entity under the finger (generous radius for touch).
    let best: Entity | null = null
    let bestD = Infinity
    for (const e of this.entities) {
      if (e.escaping && e.kind === 'hazard') continue
      const d = Math.hypot(e.x - x, e.y - y)
      const reach = e.r * (e.kind === 'bug' ? 1.2 : 1.0)
      if (d < reach && d < bestD) {
        best = e
        bestD = d
      }
    }
    if (best?.kind === 'bug') this.squash(best)
    else if (best?.kind === 'hazard') this.hitHazard(best)
    else this.miss(x, y)
    this.scare(x, y, best)
    this.emitHud(true)
  }

  private squash(e: Entity) {
    const info = BUG_INFO[e.bug!]
    const mult = this.frenzy ? 2 : 1
    const pts = info.points * mult
    this.score += pts
    this.hits++
    this.streak++
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.byType[e.bug!]++
    this.remove(e)
    const gold = e.bug === 'gold'
    sfx.squash(this.streak, gold)
    vibrate(gold ? [25, 30, 40] : 22)

    const color = info.color
    // splat decal
    this.splats.push({
      x: e.x,
      y: e.y,
      color,
      life: 1,
      blobs: Array.from({ length: 7 }, () => ({ dx: rand(-1, 1) * e.r * 0.7, dy: rand(-1, 1) * e.r * 0.7, r: rand(0.25, 0.55) * e.r })),
    })
    // shockwave
    this.particles.push(this.p(e.x, e.y, 0, 0, 0.45, color, e.r, 'ring'))
    // goo + Google-coloured confetti
    const palette = [color, color, G.blue, G.red, G.yellow, G.green]
    for (let i = 0; i < (gold ? 26 : 16); i++) {
      const a = rand(0, Math.PI * 2)
      const s = rand(120, 420) * (this.unit / 36)
      this.particles.push(this.p(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.8), palette[i % palette.length], rand(3, 7), i % 3 ? 'dot' : 'spark'))
    }
    for (let i = 0; i < 3; i++) {
      const p = this.p(e.x, e.y, rand(-90, 90), rand(-260, -140), 0.9, color, this.unit * 0.42, 'glyph')
      p.text = GLYPHS[(Math.random() * GLYPHS.length) | 0]
      this.particles.push(p)
    }
    const t = this.p(e.x, e.y - e.r * 0.6, 0, -110, 0.95, gold ? G.yellow : color, this.unit * (gold ? 0.95 : 0.75), 'text')
    t.text = `+${pts}`
    this.particles.push(t)
  }

  private hitHazard(e: Entity) {
    this.score = Math.max(0, this.score - HAZARD_PENALTY)
    this.hazardsHit++
    this.streak = 0
    this.remove(e)
    this.shake = 1
    sfx.hazard()
    vibrate([70, 40, 110])
    this.cb.onHazard()
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2)
      const s = rand(80, 300)
      this.particles.push(this.p(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.7), i % 2 ? G.red : '#9AA0A6', rand(3, 6), 'dot'))
    }
    this.particles.push(this.p(e.x, e.y, 0, 0, 0.4, G.red, e.r * 1.2, 'ring'))
    const t = this.p(e.x, e.y - e.r * 0.5, 0, -90, 1.1, G.red, this.unit * 0.85, 'text')
    t.text = `−${HAZARD_PENALTY}`
    this.particles.push(t)
  }

  private miss(x: number, y: number) {
    this.streak = 0
    sfx.miss()
    vibrate(8)
    this.particles.push(this.p(x, y, 0, 0, 0.35, this.frenzy ? '#ffffff' : '#9AA0A6', this.unit * 0.6, 'ring'))
  }

  /** Bugs near a tap scatter — more likely and further as difficulty rises. */
  private scare(x: number, y: number, except: Entity | null) {
    const d = this.difficulty
    const radius = this.unit * (2.5 + 3.5 * d)
    for (const e of this.entities) {
      if (e === except || e.kind !== 'bug' || e.escaping) continue
      const dist = Math.hypot(e.x - x, e.y - y)
      if (dist > radius) continue
      const chance = BUG_INFO[e.bug!].dodge * (0.25 + 0.75 * d)
      if (Math.random() < chance) {
        e.heading = Math.atan2(e.y - y, e.x - x) + rand(-0.5, 0.5)
        e.boost = 2.2 + d
      }
    }
  }

  // ---------------------------------------------------------------- spawning

  private spawnBug(initial = false) {
    const d = this.difficulty
    const weights: [BugType, number][] = [
      ['blue', 5 - 3 * d],
      ['red', 3],
      ['green', 1.2 + 2 * d],
      ['gold', 0.5 + 1.1 * d],
    ]
    const total = weights.reduce((s, [, w]) => s + w, 0)
    let roll = Math.random() * total
    let type: BugType = 'blue'
    for (const [t, w] of weights) {
      if ((roll -= w) <= 0) {
        type = t
        break
      }
    }
    const r = this.unit * (type === 'gold' ? 0.92 : 1)
    const pad = r + 6
    let x: number, y: number, heading: number
    if (!initial && Math.random() < 0.55) {
      // Crawl in from an edge
      const side = (Math.random() * 4) | 0
      if (side === 0) [x, y] = [rand(pad, this.w - pad), this.topInset - r]
      else if (side === 1) [x, y] = [this.w + r, rand(this.topInset + pad, this.h - pad)]
      else if (side === 2) [x, y] = [rand(pad, this.w - pad), this.h + r]
      else [x, y] = [-r, rand(this.topInset + pad, this.h - pad)]
      heading = Math.atan2(this.h * 0.55 - y, this.w / 2 - x) + rand(-0.6, 0.6)
    } else {
      x = rand(pad, this.w - pad)
      y = rand(this.topInset + pad, this.h - pad)
      heading = rand(0, Math.PI * 2)
      this.particles.push(this.p(x, y, 0, 0, 0.4, BUG_INFO[type].color, r * 0.9, 'ring'))
    }
    this.entities.push({
      id: this.nextId++,
      kind: 'bug',
      bug: type,
      x,
      y,
      heading,
      speed: this.unit * 2.1 * BUG_INFO[type].speed,
      boost: 1,
      r,
      born: this.time,
      ttl: rand(4200, 6800) - d * 1200,
      escaping: false,
      nextJuke: this.time + rand(600, 1800),
      legPhase: Math.random() * 2,
      bob: 0,
    })
  }

  private spawnHazard() {
    const r = this.unit * 0.95
    const pad = r + 8
    // Prefer spots near bugs — that's what makes them a precision test.
    let x = rand(pad, this.w - pad)
    let y = rand(this.topInset + pad, this.h - pad)
    const bugs = this.entities.filter((e) => e.kind === 'bug' && !e.escaping)
    if (bugs.length && Math.random() < 0.6) {
      const b = bugs[(Math.random() * bugs.length) | 0]
      const a = rand(0, Math.PI * 2)
      x = clamp(b.x + Math.cos(a) * r * 2.4, pad, this.w - pad)
      y = clamp(b.y + Math.sin(a) * r * 2.4, this.topInset + pad, this.h - pad)
    }
    this.entities.push({
      id: this.nextId++,
      kind: 'hazard',
      hazard: Math.random() < 0.5 ? 'clean' : 'coffee',
      x,
      y,
      heading: rand(0, Math.PI * 2),
      speed: this.unit * 0.45,
      boost: 1,
      r,
      born: this.time,
      ttl: rand(2400, 3600),
      escaping: false,
      nextJuke: Infinity,
      legPhase: 0,
      bob: Math.random() * 10,
    })
  }

  private remove(e: Entity) {
    const i = this.entities.indexOf(e)
    if (i >= 0) this.entities.splice(i, 1)
  }

  private p(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, kind: Particle['kind']): Particle {
    return { x, y, vx, vy, life, max: life, color, size, kind, rot: rand(-0.4, 0.4), vr: rand(-4, 4) }
  }

  // ---------------------------------------------------------------- loop

  private loop = (now: number) => {
    const elapsed = Math.max(0, now - this.last)
    const dt = Math.min(0.05, elapsed / 1000)
    this.last = now
    if (this.running && !this.ended && !this.paused) this.update(dt, elapsed)
    this.updateParticles(dt)
    this.draw(now)
    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number, elapsed = dt * 1000) {
    this.time += elapsed
    const remaining = Math.max(0, GAME_DURATION - this.time)

    if (!this.frenzy && remaining <= FRENZY_AT) {
      this.frenzy = true
      sfx.frenzyStart()
      sfx.setFrenzy(true)
      vibrate([40, 40, 40, 40, 80])
      this.cb.onFrenzy()
      for (let i = 0; i < 3; i++) this.spawnBug()
    }
    const sec = Math.ceil(remaining / 1000)
    if (this.frenzy && sec !== this.lastTickSecond && sec > 0) {
      this.lastTickSecond = sec
      sfx.tick(sec)
    }

    // Spawning
    const d = this.difficulty
    const interval = lerp(720, 400, d) / (this.frenzy ? 2 : 1)
    const maxOnScreen = (this.frenzy ? 20 : 11) + Math.round(d * 4)
    this.spawnTimer += dt * 1000
    while (this.spawnTimer >= interval) {
      this.spawnTimer -= interval
      if (this.entities.length >= maxOnScreen) continue
      const hazardChance = 0.17 + 0.1 * d
      const hazards = this.entities.filter((e) => e.kind === 'hazard').length
      if (Math.random() < hazardChance && hazards < 4) this.spawnHazard()
      else this.spawnBug()
    }

    const speedScale = (1 + 1.5 * d) * (this.frenzy ? 1.15 : 1)
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i]
      const age = this.time - e.born
      if (e.kind === 'hazard') {
        e.bob += dt
        e.x += Math.cos(e.heading) * e.speed * dt
        e.y += Math.sin(e.heading) * e.speed * dt
        this.bounce(e)
        if (e.escaping) {
          if (age > 260) this.entities.splice(i, 1)
        } else if (age > e.ttl) {
          e.escaping = true
          e.born = this.time // reuse as fade start
        }
        continue
      }

      // Bugs: wander + juke + optional hover-dodge for desktop players
      if (!e.escaping && age > e.ttl) {
        e.escaping = true
        e.heading = this.edgeHeading(e)
      }
      if (!e.escaping) {
        e.heading += rand(-1, 1) * 2.4 * dt
        if (this.time >= e.nextJuke) {
          const info = BUG_INFO[e.bug!]
          if (Math.random() < info.dodge * (0.3 + 0.7 * d)) {
            e.heading += (Math.random() < 0.5 ? -1 : 1) * rand(1, 2.4)
            e.boost = 1.6 + d
          }
          e.nextJuke = this.time + lerp(1800, 650, d) * rand(0.7, 1.3)
        }
        if (this.hover && (e.bug === 'gold' || e.bug === 'green') && d > 0.15) {
          const dx = e.x - this.hover.x
          const dy = e.y - this.hover.y
          if (Math.hypot(dx, dy) < e.r * (1.6 + 1.6 * d)) {
            e.heading = Math.atan2(dy, dx)
            e.boost = Math.max(e.boost, 1.8)
          }
        }
      }
      e.boost = 1 + (e.boost - 1) * Math.exp(-2.6 * dt)
      const v = e.speed * speedScale * e.boost * (e.escaping ? 1.6 : 1)
      e.x += Math.cos(e.heading) * v * dt
      e.y += Math.sin(e.heading) * v * dt
      e.legPhase += v * dt * 0.06
      if (e.escaping) {
        if (e.x < -e.r * 2 || e.x > this.w + e.r * 2 || e.y < -e.r * 2 || e.y > this.h + e.r * 2) this.entities.splice(i, 1)
      } else if (age > 500) this.bounce(e)
    }

    for (const s of this.splats) s.life -= dt / 2.4
    this.splats = this.splats.filter((s) => s.life > 0)
    this.shake = Math.max(0, this.shake - dt * 3)

    if (remaining <= 0) this.finish()
    else this.emitHud()
  }

  private edgeHeading(e: Entity) {
    const opts = [
      [e.x, Math.PI],
      [this.w - e.x, 0],
      [e.y - this.topInset, -Math.PI / 2],
      [this.h - e.y, Math.PI / 2],
    ]
    opts.sort((a, b) => a[0] - b[0])
    return opts[0][1] + rand(-0.3, 0.3)
  }

  private bounce(e: Entity) {
    const minX = e.r * 0.8
    const maxX = this.w - e.r * 0.8
    const minY = this.topInset + e.r * 0.5
    const maxY = this.h - e.r * 0.8
    let cx = Math.cos(e.heading)
    let cy = Math.sin(e.heading)
    if ((e.x < minX && cx < 0) || (e.x > maxX && cx > 0)) cx = -cx
    if ((e.y < minY && cy < 0) || (e.y > maxY && cy > 0)) cy = -cy
    e.heading = Math.atan2(cy, cx)
  }

  private finish() {
    this.ended = true
    this.running = false
    this.emitHud(true)
    // Remaining bugs scurry away
    for (const e of this.entities) {
      e.escaping = true
      if (e.kind === 'bug') e.heading = this.edgeHeading(e)
    }
    const stats: GameStats = {
      score: this.score,
      bugs: this.hits,
      hazards: this.hazardsHit,
      taps: this.taps,
      accuracy: this.taps ? Math.round((this.hits / this.taps) * 100) : 0,
      bestStreak: this.bestStreak,
      gold: this.byType.gold,
      byType: { ...this.byType },
    }
    this.cb.onEnd(stats)
  }

  private emitHud(force = false) {
    const remaining = Math.max(0, GAME_DURATION - this.time)
    const key = `${this.score}|${Math.ceil(remaining / 100)}|${this.streak}|${this.frenzy}`
    if (!force && key === this.lastHud) return
    this.lastHud = key
    this.cb.onHud({ score: this.score, remaining, streak: this.streak, frenzy: this.frenzy })
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      if (p.kind === 'dot' || p.kind === 'spark') {
        p.vx *= Math.exp(-4 * dt)
        p.vy = p.vy * Math.exp(-4 * dt) + 300 * dt
      } else if (p.kind === 'glyph') {
        p.vy += 380 * dt
      } else if (p.kind === 'text') {
        p.vy *= Math.exp(-3 * dt)
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    if (this.ended) {
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const e = this.entities[i]
        const v = e.speed * 3
        e.x += Math.cos(e.heading) * v * dt
        e.y += Math.sin(e.heading) * v * dt
        e.legPhase += v * dt * 0.06
        if (e.kind === 'hazard') e.r *= Math.exp(-6 * dt)
        if (e.x < -100 || e.x > this.w + 100 || e.y < -100 || e.y > this.h + 100 || e.r < 2) this.entities.splice(i, 1)
      }
    }
  }

  // ---------------------------------------------------------------- render

  private draw(now: number) {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.w, this.h)
    if (this.shake > 0) {
      const s = this.shake * this.shake * 14
      ctx.translate(rand(-s, s), rand(-s, s))
    }

    // Splat decals
    for (const s of this.splats) {
      ctx.globalAlpha = Math.min(1, s.life * 1.5) * 0.32
      ctx.fillStyle = s.color
      for (const b of s.blobs) {
        ctx.beginPath()
        ctx.arc(s.x + b.dx, s.y + b.dy, b.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // Shadows
    ctx.fillStyle = this.frenzy ? 'rgba(0,0,0,0.35)' : 'rgba(32,33,36,0.12)'
    for (const e of this.entities) {
      const sc = this.entityScale(e)
      ctx.beginPath()
      ctx.ellipse(e.x + 3, e.y + e.r * 0.55 * sc, e.r * 0.72 * sc, e.r * 0.26 * sc, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // Hazards first (so bugs crawl over them)
    for (const e of this.entities) if (e.kind === 'hazard') this.drawHazard(e, now)
    for (const e of this.entities) if (e.kind === 'bug') this.drawBug(e, now)

    // Particles
    for (const p of this.particles) {
      const t = p.life / p.max
      ctx.globalAlpha = Math.min(1, t * 1.6)
      if (p.kind === 'dot') {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'spark') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7)
        ctx.restore()
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 4 * t
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.9), 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'glyph' || p.kind === 'text') {
        ctx.save()
        ctx.translate(p.x, p.y)
        const pop = p.kind === 'text' ? 1 + Math.max(0, (t - 0.8) * 2.5) : 1
        ctx.rotate(p.kind === 'glyph' ? p.rot : 0)
        ctx.scale(pop, pop)
        ctx.font = `${p.kind === 'text' ? 800 : 700} ${p.size}px ${p.kind === 'text' ? '"Google Sans Flex", system-ui, sans-serif' : '"Google Sans Code", ui-monospace, Menlo, monospace'}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        if (p.kind === 'text') {
          ctx.lineWidth = Math.max(3, p.size * 0.16)
          ctx.strokeStyle = this.frenzy ? '#000' : '#fff'
          ctx.lineJoin = 'round'
          ctx.strokeText(p.text!, 0, 0)
        }
        ctx.fillStyle = p.color
        ctx.fillText(p.text!, 0, 0)
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
  }

  private entityScale(e: Entity) {
    const age = this.time - e.born
    if (e.kind === 'hazard') {
      if (e.escaping) return Math.max(0, 1 - age / 260)
      const t = clamp(age / 320, 0, 1) - 1
      return 1 + 2.70158 * t * t * t + 1.70158 * t * t // easeOutBack pop-in
    }
    const t = clamp(age / 220, 0, 1)
    return 0.4 + 0.6 * (1 - Math.pow(1 - t, 3))
  }

  private drawBug(e: Entity, now: number) {
    const ctx = this.ctx
    const frame = (Math.floor(e.legPhase) % 2) as 0 | 1
    const img = this.sprites.bugs[e.bug!][frame]
    if (!img.complete || !img.naturalWidth) return
    const sc = this.entityScale(e)
    const size = e.r * 2.75 * sc
    ctx.save()
    ctx.translate(e.x, e.y)
    if (e.bug === 'gold') {
      const pulse = 0.5 + 0.5 * Math.sin(now / 120)
      const grd = ctx.createRadialGradient(0, 0, e.r * 0.3, 0, 0, e.r * 1.5)
      grd.addColorStop(0, `rgba(251,188,4,${0.35 + 0.25 * pulse})`)
      grd.addColorStop(1, 'rgba(251,188,4,0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(0, 0, e.r * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.rotate(e.heading + Math.PI / 2)
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
    ctx.restore()
  }

  private drawHazard(e: Entity, now: number) {
    const ctx = this.ctx
    const img = this.sprites.hazards[e.hazard!]
    if (!img.complete || !img.naturalWidth) return
    const sc = this.entityScale(e)
    if (sc <= 0) return
    const size = e.r * 2.2 * sc
    const wob = Math.sin(e.bob * 3) * 0.08
    ctx.save()
    ctx.translate(e.x, e.y + Math.sin(e.bob * 4) * 3)
    // Warning halo
    ctx.save()
    ctx.rotate(now / 700)
    ctx.setLineDash([6, 7])
    ctx.lineWidth = 2.5
    ctx.strokeStyle = this.frenzy ? 'rgba(255,120,110,0.85)' : 'rgba(234,67,53,0.55)'
    ctx.beginPath()
    ctx.arc(0, 0, e.r * 1.05 * sc, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    ctx.rotate(wob)
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
    // Lifetime arc so players can read how long it stays
    const life = clamp(1 - (this.time - e.born) / e.ttl, 0, 1)
    if (!e.escaping) {
      ctx.rotate(-wob)
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(234,67,53,0.9)'
      ctx.beginPath()
      ctx.arc(0, 0, e.r * 1.05, -Math.PI / 2, -Math.PI / 2 + life * Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}
