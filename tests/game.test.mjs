import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let vite, scores, GameEngine, localBackend
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
}
globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 1 })
globalThis.Image = class { complete = true; naturalWidth = 120 }
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}

before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  scores = await vite.ssrLoadModule('/src/lib/scores.ts')
  ;({ GameEngine } = await vite.ssrLoadModule('/src/game/engine.ts'))
  localBackend = (await vite.ssrLoadModule('/src/lib/localBackend.ts')).createLocalBackend()
})
after(async () => { await vite?.close() })

function game() {
  const state = { hud: null, stats: null, frenzy: 0 }
  const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ width: 390, height: 844 }) }
  const engine = new GameEngine(canvas, {
    onHud: (hud) => { state.hud = hud },
    onEnd: (stats) => { state.stats = stats },
    onHazard: () => {},
    onFrenzy: () => { state.frenzy++ },
  })
  engine.start()
  return { engine, state }
}
function target(engine, type = 'blue', kind = 'bug') {
  engine.entities = [{ kind, bug: type, x: 150, y: 300, r: 36, escaping: false }]
  engine.pointerDown(150, 300)
}

test('VinUni identity validation and normalized player IDs', () => {
  assert.ok(scores.EMAIL_RE.test('student@vinuni.edu.vn'))
  assert.ok(!scores.EMAIL_RE.test('student@vinuni.edu.vn.evil.com'))
  assert.ok(!scores.EMAIL_RE.test('student@gmail.com'))
  assert.equal(scores.playerIdFor(' Student@vinuni.edu.vn '), scores.playerIdFor('student@vinuni.edu.vn'))
})
test('leaderboard deduplicates players, sorts scores and breaks ties by time', () => {
  const rows = [
    { playerId: 'a', score: 100, createdAt: 1 },
    { playerId: 'b', score: 300, createdAt: 3 },
    { playerId: 'a', score: 300, createdAt: 2 },
  ]
  assert.deepEqual(scores.dedupeBest(rows, 10).map((r) => r.playerId), ['a', 'b'])
  assert.deepEqual(scores.dedupeBest(rows, 0), [])
})
test('bugs award points; hazards subtract 150, floor at zero and reset streak', () => {
  const { engine, state } = game()
  target(engine, 'gold')
  assert.equal(state.hud.score, 300)
  target(engine, undefined, 'hazard')
  assert.equal(state.hud.score, 150)
  assert.equal(state.hud.streak, 0)
  target(engine, undefined, 'hazard')
  target(engine, undefined, 'hazard')
  assert.equal(state.hud.score, 0)
  engine.destroy()
})
test('final five seconds double bug points and finish exactly once at 30 seconds', () => {
  const { engine, state } = game()
  engine.update(0, 25000)
  assert.equal(state.frenzy, 1)
  assert.equal(state.hud.remaining, 5000)
  target(engine, 'gold')
  assert.equal(state.hud.score, 600)
  engine.update(0, 5000)
  assert.equal(state.stats.score, 600)
  assert.equal(state.stats.accuracy, 100)
  assert.equal(state.hud.remaining, 0)
  target(engine)
  assert.equal(state.stats.score, 600)
  engine.destroy()
})
test('paused games reject taps', () => {
  const { engine, state } = game()
  engine.setPaused(true)
  target(engine)
  assert.equal(state.hud.score, 0)
  engine.setPaused(false)
  target(engine)
  assert.equal(state.hud.score, 100)
  engine.destroy()
})
test('local retries preserve a single score and never persist an email publicly', async () => {
  const s = { id: 'run-local-1', name: 'Debugger', email: 'student@vinuni.edu.vn', score: 100, bugs: 1, hazards: 0, accuracy: 100, bestStreak: 1, gold: 0 }
  const first = await localBackend.submit(s)
  const second = await localBackend.submit(s)
  assert.equal(first.id, second.id)
  const saved = JSON.parse(store.get('bsq.local.scores'))
  assert.equal(saved.length, 1)
  assert.ok(!('email' in saved[0]))
})
test('offline queue deduplicates stable run IDs and survives malformed storage', () => {
  store.set('bsq.pending', '{broken')
  const s = { id: 'retry-1', score: 100 }
  scores.queuePending(s)
  scores.queuePending(s)
  assert.equal(JSON.parse(store.get('bsq.pending')).length, 1)
  scores.removePending(s.id)
  assert.deepEqual(JSON.parse(store.get('bsq.pending')), [])
})
