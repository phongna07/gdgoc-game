import { useState, type FormEvent } from 'react'
import { sfx } from '../game/audio'
import { BUG_INFO, HAZARD_PENALTY } from '../game/engine'
import { bugSVG, hazardSVG, svgUrl, type BugType } from '../game/sprites'
import { EMAIL_RE, firebaseConfigured, type Player } from '../lib/scores'
import { Backdrop } from './Backdrop'
import { GdgBadge, Wordmark } from './Brand'

const LEGEND: BugType[] = ['blue', 'red', 'green', 'gold']

export function Register({ initial, best, onStart }: { initial: Player | null; best: number; onStart: (p: Player) => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [touched, setTouched] = useState(false)

  const nameErr = name.trim().length < 2 ? 'Enter a name or handle (2+ chars)' : name.trim().length > 20 ? 'Max 20 characters' : ''
  const emailErr = !EMAIL_RE.test(email.trim()) ? 'Use your VinUni email (…@vinuni.edu.vn)' : ''
  const valid = !nameErr && !emailErr

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    sfx.unlock()
    if (!valid) {
      sfx.miss()
      return
    }
    sfx.ui()
    onStart({ name: name.trim(), email: email.trim().toLowerCase() })
  }

  return (
    <div className="screen menu">
      <Backdrop />
      <div className="menu-inner">
        <GdgBadge />
        <div className="hero">
          <div className="hero-bug">
            <img src={svgUrl(bugSVG('gold', 0))} alt="" className="hb-a" />
            <img src={svgUrl(bugSVG('gold', 1))} alt="" className="hb-b" />
          </div>
          <Wordmark />
          <p className="tagline">
            <code>30s</code> to squash as many bugs as you can. <br />
            Don’t touch the clean code. Don’t spill the coffee.
          </p>
        </div>

        <form className="card form" onSubmit={submit} noValidate>
          <label className={`field ${touched && nameErr ? 'err' : ''}`}>
            <input
              aria-label="Name or handle"
              aria-invalid={touched && !!nameErr}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=" "
              maxLength={24}
              autoComplete="nickname"
              enterKeyHint="next"
            />
            <span>Name / handle</span>
            {touched && nameErr && <em>{nameErr}</em>}
          </label>
          <label className={`field ${touched && emailErr ? 'err' : ''}`}>
            <input
              aria-label="VinUni student email"
              aria-invalid={touched && !!emailErr}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
            />
            <span>VinUni student email</span>
            {touched && emailErr && <em>{emailErr}</em>}
          </label>
          <button className="btn primary big" type="submit">
            <span>Start debugging</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          </button>
          {best > 0 && (
            <p className="pb">
              Your best: <strong>{best.toLocaleString()}</strong>
            </p>
          )}
        </form>

        <div className="card legend">
          <div className="legend-title">Squash</div>
          <div className="legend-row">
            {LEGEND.map((t) => (
              <div key={t} className={`legend-item ${t}`}>
                <img src={svgUrl(bugSVG(t))} alt={BUG_INFO[t].name} />
                <b>+{BUG_INFO[t].points}</b>
                <small>{BUG_INFO[t].name}</small>
              </div>
            ))}
          </div>
          <div className="legend-title avoid">Avoid</div>
          <div className="legend-row hazards">
            <div className="legend-item hz">
              <img src={svgUrl(hazardSVG('clean'))} alt="Clean Code module" />
              <b>−{HAZARD_PENALTY}</b>
              <small>Clean Code</small>
            </div>
            <div className="legend-item hz">
              <img src={svgUrl(hazardSVG('coffee'))} alt="Coffee mug" />
              <b>−{HAZARD_PENALTY}</b>
              <small>Coffee Mug</small>
            </div>
            <div className="legend-item frenzy-tip">
              <div className="ft-badge">×2</div>
              <b>Frenzy</b>
              <small>Final 5 seconds</small>
            </div>
          </div>
        </div>
        <p className="foot">Your handle and score appear on the leaderboard. Your email stays off the public display.</p>
        <p className="foot">{firebaseConfigured ? 'Live event mode' : 'Demo mode · scores stay in this browser'} · <a href="#/tv" target="_blank" rel="noreferrer">Open TV display ↗</a></p>
      </div>
    </div>
  )
}
