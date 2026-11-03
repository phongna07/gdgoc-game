import { readStored, writeStored } from '../lib/storage'
/**
 * Tiny synthesised arcade sound engine on top of the Web Audio API.
 * No audio files are downloaded — every effect is generated on the fly.
 */

type Wave = OscillatorType

class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private musicTimer: number | null = null
  private step = 0
  private nextNote = 0
  private bpm = 128
  private frenzy = false
  muted = readStored('bsq.muted', false)

  /** Must be called from a user gesture (tap/click) to satisfy autoplay rules. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.7
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.ratio.value = 4
      this.master.connect(comp).connect(this.ctx.destination)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 0.55
      this.musicBus.connect(this.master)
      const len = this.ctx.sampleRate * 0.5
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  setMuted(m: boolean) {
    this.muted = m
    writeStored('bsq.muted', m)
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02)
  }

  private tone(
    freq: number,
    dur: number,
    { type = 'square' as Wave, vol = 0.2, slide = 0, delay = 0, out = this.master, attack = 0.004 } = {},
  ) {
    const ctx = this.ctx
    if (!ctx || !out) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private noise(dur: number, { vol = 0.2, freq = 2000, q = 1, type = 'bandpass' as BiquadFilterType, delay = 0, out = this.master } = {}) {
    const ctx = this.ctx
    if (!ctx || !this.noiseBuf || !out) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  squash(streak: number, gold: boolean) {
    const semis = Math.min(streak, 14)
    const f = 420 * Math.pow(2, semis / 12)
    this.noise(0.09, { vol: 0.45, freq: 1800, q: 0.8 })
    this.tone(f * 2, 0.12, { type: 'triangle', vol: 0.32, slide: f * 0.6 })
    this.tone(f, 0.08, { type: 'square', vol: 0.08, slide: f * 0.5 })
    if (gold) {
      ;[1, 1.26, 1.5, 2].forEach((m, i) => this.tone(1046 * m, 0.14, { type: 'square', vol: 0.09, delay: 0.05 + i * 0.045 }))
    }
  }

  hazard() {
    this.tone(220, 0.32, { type: 'sawtooth', vol: 0.28, slide: 70 })
    this.tone(233, 0.32, { type: 'square', vol: 0.14, slide: 75 })
    this.noise(0.25, { vol: 0.25, freq: 400, q: 0.6, type: 'lowpass' })
  }

  miss() {
    this.tone(260, 0.05, { type: 'sine', vol: 0.07, slide: 180 })
  }

  count(n: number) {
    this.tone(n > 0 ? 660 : 1320, n > 0 ? 0.16 : 0.4, { type: 'square', vol: 0.18 })
    if (n === 0) this.tone(1980, 0.4, { type: 'triangle', vol: 0.12 })
  }

  frenzyStart() {
    this.tone(300, 0.35, { type: 'sawtooth', vol: 0.18, slide: 1200 })
    this.tone(300, 0.35, { type: 'sawtooth', vol: 0.18, slide: 1200, delay: 0.35 })
    this.noise(0.6, { vol: 0.2, freq: 5000, q: 0.5, type: 'highpass', delay: 0.1 })
  }

  tick(n: number) {
    this.tone(n <= 3 ? 1500 : 1100, 0.07, { type: 'square', vol: 0.12 })
  }

  gameOver() {
    ;[523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.14, delay: i * 0.11 }))
    this.tone(1046, 0.6, { type: 'triangle', vol: 0.16, delay: 0.44 })
  }

  success() {
    ;[880, 1318].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.18, delay: i * 0.09 }))
  }

  ui() {
    this.tone(880, 0.06, { type: 'triangle', vol: 0.12 })
  }

  // ---------- Background music (step sequencer) ----------

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return
    this.step = 0
    this.bpm = this.frenzy ? 164 : 128
    this.nextNote = this.ctx.currentTime + 0.05
    this.musicTimer = window.setInterval(() => this.schedule(), 25)
  }

  setFrenzy(on: boolean) {
    this.frenzy = on
    this.bpm = on ? 164 : 128
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer)
    this.musicTimer = null
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    while (this.nextNote < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNote - ctx.currentTime)
      this.nextNote += 60 / this.bpm / 2
      this.step = (this.step + 1) % 16
    }
  }

  private playStep(s: number, delay: number) {
    const out = this.musicBus
    // A minor-ish arcade bassline
    const bass = [110, 110, 220, 110, 130.8, 110, 146.8, 164.8, 110, 110, 220, 110, 98, 98, 196, 123.5]
    this.tone(bass[s], 0.16, { type: 'triangle', vol: 0.28, delay, out })
    if (s % 4 === 0) this.tone(150, 0.14, { type: 'sine', vol: 0.5, slide: 40, delay, out })
    if (s % 2 === 1) this.noise(0.04, { vol: 0.08, freq: 8000, q: 1, type: 'highpass', delay, out })
    if (s % 8 === 4) this.noise(0.12, { vol: 0.16, freq: 1500, q: 0.7, delay, out })
    if (this.frenzy) {
      const arp = [440, 523, 659, 880, 659, 523, 440, 523]
      this.tone(arp[s % 8] * 2, 0.08, { type: 'square', vol: 0.05, delay, out })
    }
  }
}

export const sfx = new Sfx()

export function vibrate(pattern: number | number[]) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* unsupported (e.g. iOS Safari) — silently ignore */
  }
}
