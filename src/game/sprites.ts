/**
 * All game art is vector, defined inline as SVG strings so the whole app ships
 * with zero image requests. Each sprite uses a 120×120 viewBox and bugs face "up"
 * (towards negative y) so the engine can rotate them along their heading.
 */

export const G = {
  blue: '#4285F4',
  red: '#EA4335',
  yellow: '#FBBC04',
  green: '#34A853',
  ink: '#202124',
  grey: '#5F6368',
} as const

export type BugType = 'blue' | 'red' | 'green' | 'gold'
export type HazardType = 'clean' | 'coffee'

const shade: Record<BugType, string> = {
  blue: '#1A56C4',
  red: '#B3261E',
  green: '#137333',
  gold: '#202124',
}

const fill: Record<BugType, string> = {
  blue: G.blue,
  red: G.red,
  green: G.green,
  gold: '#FFFFFF',
}

/** The GDG "< >" chevron mark, centred on (cx, cy). */
export function gdgMark(cx: number, cy: number, s: number, w: number) {
  const p = (x: number, y: number) => `${cx + x * s},${cy + y * s}`
  return `
  <g fill="none" stroke-linecap="round" stroke-width="${w}">
    <path d="M${p(-4, -10)} L${p(-14, 0)}" stroke="${G.red}"/>
    <path d="M${p(-14, 0)} L${p(-4, 10)}" stroke="${G.blue}"/>
    <path d="M${p(4, -10)} L${p(14, 0)}" stroke="${G.green}"/>
    <path d="M${p(14, 0)} L${p(4, 10)}" stroke="${G.yellow}"/>
  </g>`
}

function legs(frame: 0 | 1, color: string) {
  // Tripod gait: legs 0/2 on the left move with leg 1 on the right.
  const rows = [50, 64, 78]
  let out = ''
  rows.forEach((y, i) => {
    const phase = (i % 2 === 0 ? 1 : -1) * (frame ? 1 : -1)
    const kneeY = y - 6 + phase * 3
    const footY = y - (i === 0 ? 14 : i === 2 ? -10 : 0) + phase * 7
    out += `<path d="M46 ${y} L30 ${kneeY} L16 ${footY}"/>`
    const p2 = -phase
    const kneeY2 = y - 6 + p2 * 3
    const footY2 = y - (i === 0 ? 14 : i === 2 ? -10 : 0) + p2 * 7
    out += `<path d="M74 ${y} L90 ${kneeY2} L104 ${footY2}"/>`
  })
  return `<g fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${out}</g>`
}

export function bugSVG(type: BugType, frame: 0 | 1 = 0) {
  const c = fill[type]
  const d = shade[type]
  const legColor = type === 'gold' ? G.ink : d
  const isGold = type === 'gold'
  const wiggle = frame ? 2 : -2
  const back = isGold
    ? gdgMark(60, 70, 1.25, 6.5)
    : `<g fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".95">
        <path d="M53 62 L45 70 L53 78"/><path d="M67 62 L75 70 L67 78"/><path d="M63 58 L57 82"/>
      </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
  ${legs(frame, legColor)}
  <g fill="none" stroke="${legColor}" stroke-width="3.5" stroke-linecap="round">
    <path d="M55 27 Q ${48 + wiggle} 14 ${42 + wiggle} 8"/>
    <path d="M65 27 Q ${72 - wiggle} 14 ${78 - wiggle} 8"/>
  </g>
  <circle cx="${42 + wiggle}" cy="8" r="4.5" fill="${isGold ? G.yellow : c}" stroke="${legColor}" stroke-width="2"/>
  <circle cx="${78 - wiggle}" cy="8" r="4.5" fill="${isGold ? G.yellow : c}" stroke="${legColor}" stroke-width="2"/>
  <ellipse cx="60" cy="70" rx="27" ry="33" fill="${c}" stroke="${isGold ? G.yellow : d}" stroke-width="${isGold ? 5 : 3}"/>
  <ellipse cx="50" cy="56" rx="9" ry="13" fill="#fff" opacity="${isGold ? 0 : 0.28}"/>
  ${back}
  <circle cx="60" cy="36" r="15" fill="${d}"/>
  <circle cx="53.5" cy="33" r="6" fill="#fff"/><circle cx="66.5" cy="33" r="6" fill="#fff"/>
  <circle cx="53.5" cy="31" r="3" fill="${G.ink}"/><circle cx="66.5" cy="31" r="3" fill="${G.ink}"/>
  <circle cx="54.6" cy="29.8" r="1.1" fill="#fff"/><circle cx="67.6" cy="29.8" r="1.1" fill="#fff"/>
</svg>`
}

export function hazardSVG(type: HazardType) {
  if (type === 'clean') {
    // A "Clean Code" IC module: chip with pins + green check sticker.
    let pins = ''
    for (let i = 0; i < 4; i++) {
      const y = 36 + i * 15
      pins += `<rect x="12" y="${y}" width="12" height="7" rx="2"/><rect x="96" y="${y}" width="12" height="7" rx="2"/>`
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
  <g fill="#9AA0A6">${pins}</g>
  <rect x="22" y="24" width="76" height="76" rx="12" fill="${G.ink}"/>
  <rect x="22" y="24" width="76" height="76" rx="12" fill="none" stroke="#3C4043" stroke-width="3"/>
  <circle cx="32" cy="34" r="3.5" fill="#5F6368"/>
  <circle cx="60" cy="54" r="17" fill="${G.green}"/>
  <path d="M51 54 L57.5 60.5 L70 47.5" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="60" y="88" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11.5" font-weight="700" fill="#E8EAED">CLEAN</text>
  <text x="60" y="97" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="7.5" font-weight="700" fill="#9AA0A6">CODE.v1</text>
</svg>`
  }
  // Coffee mug with Google-colour band and steam.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
  <g fill="none" stroke="#BDC1C6" stroke-width="4" stroke-linecap="round">
    <path d="M44 30 q -6 -7 0 -14 q 6 -7 0 -12"/>
    <path d="M60 28 q -6 -7 0 -14 q 6 -7 0 -12"/>
    <path d="M76 30 q -6 -7 0 -14 q 6 -7 0 -12"/>
  </g>
  <path d="M86 52 h8 a14 14 0 0 1 0 28 h-8" fill="none" stroke="#DADCE0" stroke-width="8"/>
  <path d="M86 52 h8 a14 14 0 0 1 0 28 h-8" fill="none" stroke="#5F6368" stroke-width="2" opacity=".35"/>
  <path d="M28 40 h60 v46 a16 16 0 0 1 -16 16 h-28 a16 16 0 0 1 -16 -16 z" fill="#fff" stroke="#DADCE0" stroke-width="3"/>
  <ellipse cx="58" cy="41" rx="30" ry="6.5" fill="#6D4C41" stroke="#DADCE0" stroke-width="3"/>
  <ellipse cx="52" cy="40" rx="10" ry="2" fill="#A1887F"/>
  <rect x="29.5" y="62" width="14.5" height="10" fill="${G.blue}"/>
  <rect x="44" y="62" width="14.5" height="10" fill="${G.red}"/>
  <rect x="58.5" y="62" width="14.5" height="10" fill="${G.yellow}"/>
  <rect x="73" y="62" width="13.5" height="10" fill="${G.green}"/>
  <text x="58" y="92" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="9" font-weight="700" fill="#5F6368">JAVA</text>
</svg>`
}

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export interface SpriteSet {
  bugs: Record<BugType, [HTMLImageElement, HTMLImageElement]>
  hazards: Record<HazardType, HTMLImageElement>
}

function loadImage(svg: string) {
  const img = new Image()
  img.decoding = 'async'
  img.src = svgUrl(svg)
  return img
}

let cache: SpriteSet | null = null

export function getSprites(): SpriteSet {
  if (cache) return cache
  const types: BugType[] = ['blue', 'red', 'green', 'gold']
  const bugs = {} as SpriteSet['bugs']
  for (const t of types) bugs[t] = [loadImage(bugSVG(t, 0)), loadImage(bugSVG(t, 1))]
  cache = {
    bugs,
    hazards: { clean: loadImage(hazardSVG('clean')), coffee: loadImage(hazardSVG('coffee')) },
  }
  return cache
}

export function spritesReady(): Promise<void> {
  const s = getSprites()
  const all = [...Object.values(s.bugs).flat(), ...Object.values(s.hazards)]
  return Promise.all(all.map((i) => (i.complete ? Promise.resolve() : i.decode().catch(() => undefined)))).then(
    () => undefined,
  )
}
