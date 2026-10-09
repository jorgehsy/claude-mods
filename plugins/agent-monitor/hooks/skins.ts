// Catálogo de skins de Clawd. Datos puros, sin dependencias: el panel los
// pinta en el terminal (Raster, cuartos de bloque) y en el escritorio (SVG).
//
// Lienzo de W×H píxeles; cada píxel es 1 de ancho por 2 de alto, como las
// celdas del logo de Claude Code. Clawd ocupa x 0–17; los accesorios, x 17–25.

export const W = 26
export const H = 8

export type Px = [number, number, number] // x, y, color 0xRRGGBB
export type Frame = Px[]
export type Mood = 'work' | 'wait' | 'sleep' | 'dead'
export type Role = 'research' | 'developer' | 'auditor' | 'base'

export type Animation = {
  fps: number
  frames: Frame[]
  /** Píxeles sólo para el SVG: brillos, sombras, vidrio. */
  shine?: Frame
}

export type Skin = {
  role: Role
  label: string
  accent: string
  animate: (mood: Mood) => Animation
}

// ── Paleta ───────────────────────────────────────────────────────────────────
export const C = {
  body: 0xd97757,
  bodyHi: 0xeb9a78,
  bodySh: 0xb35f42,
  lid: 0x9c4f37,
  dead: 0x7d7d7d,
  deadSh: 0x5f5f5f,
  ink: 0x1f1e1d,
  white: 0xf2efe8,
  steel: 0xa9a9a9,
  dark: 0x2e2e2e,
  screen: 0x14202e,
  green: 0x4eba65,
  blue: 0x6b8afd,
  yellow: 0xe5b93c,
  red: 0xe5534b,
  redHot: 0xff6b5e,
  redDim: 0x7a2a26,
  wood: 0x8b5a2b,
  woodSh: 0x6b4420,
  glass: 0x2b4b5a,
  glint: 0xdff4ff,
}

const span = (y: number, a: number, b: number, c: number): Px[] =>
  Array.from({ length: b - a + 1 }, (_, i) => [a + i, y, c] as Px)

// ── Clawd ────────────────────────────────────────────────────────────────────
type Eyes = 'open' | 'right' | 'closed' | 'covered'
type Arms = 'out' | 'typeL' | 'typeR' | 'hold'

type Pose = { eyes: Eyes; arms: Arms; legs: 0 | 1; color: number }

const LEGS: [number[], number[]] = [[4, 6, 11, 13], [5, 7, 10, 12]]

function clawd({ eyes, arms, legs, color }: Pose): Px[] {
  // Los ojos son huecos en la fila 3, como en el logo.
  const holes = eyes === 'right' ? [6, 13] : [5, 12]
  const row3: Px[] = []
  for (let x = 3; x <= 14; x++) {
    if (holes.includes(x)) {
      if (eyes === 'closed') row3.push([x, 3, C.lid])
      else if (eyes === 'covered') row3.push([x, 3, color])
    } else row3.push([x, 3, color])
  }
  const arm = (side: 'L' | 'R', down: boolean): Px[] => {
    const xs = side === 'L' ? [1, 2] : [15, 16]
    return xs.map(x => [x, down ? 5 : 4, color] as Px)
  }
  const armL = arm('L', arms === 'typeL')
  const armR = arms === 'hold' ? [[15, 4, color], [16, 4, color], [17, 4, color]] as Px[] : arm('R', arms === 'typeR')
  return [
    ...span(2, 3, 14, color),
    ...row3,
    ...span(4, 3, 14, color),
    ...armL,
    ...armR,
    ...span(5, 3, 14, color),
    ...LEGS[legs].map(x => [x, 6, color] as Px),
  ]
}

/** Brillo arriba y sombra abajo, sólo en el SVG. */
function bodyShine(color: number): Frame {
  const hi = color === C.dead ? C.steel : C.bodyHi
  const sh = color === C.dead ? C.deadSh : C.bodySh
  return [...span(2, 4, 13, hi), ...span(5, 3, 14, sh)]
}

const bodyOf = (mood: Mood) => (mood === 'dead' ? C.dead : C.body)
const tint = (mood: Mood, c: number) => (mood === 'dead' ? C.deadSh : c)

/** El signo de espera, arriba a la derecha, en dos cuadros. */
const BANG: Px[] = [[16, 0, C.yellow], [16, 1, C.yellow]]
const waitFrames = (pose: Frame, blinkPose: Frame): Frame[] => [
  [...pose, ...BANG],
  [...pose, ...BANG],
  [...pose],
  [...blinkPose],
]

// ── Research: lupa que barre, mirada siguiéndola, destello en el vidrio ────
function research(mood: Mood): Animation {
  const color = bodyOf(mood)
  const lens = (dy: number, glintAt: number | null): Px[] => {
    const y0 = 1 + dy
    const ring = tint(mood, C.steel)
    const px: Px[] = [
      ...span(y0, 20, 23, ring), ...span(y0 + 3, 20, 23, ring),
      [19, y0 + 1, ring], [19, y0 + 2, ring], [24, y0 + 1, ring], [24, y0 + 2, ring],
      ...span(y0 + 1, 20, 23, C.glass), ...span(y0 + 2, 20, 23, C.glass),
      [18, y0 + 3, tint(mood, C.wood)], [18, y0 + 4, tint(mood, C.wood)],
    ]
    if (glintAt !== null) {
      const spots: Array<[number, number]> = [[20, 1], [21, 1], [22, 1], [23, 2], [22, 2], [21, 2]]
      const [gx, gy] = spots[glintAt % spots.length]!
      px.push([gx, y0 + gy, C.glint])
    }
    return px
  }
  if (mood === 'work') {
    const dys = [0, -1, -1, 0, 0, 1, 1, 0]
    return {
      fps: 8,
      frames: dys.map((dy, f) => [
        ...clawd({ eyes: f === 7 ? 'closed' : 'right', arms: 'hold', legs: (f >> 1) % 2 as 0 | 1, color }),
        ...lens(dy, f),
        ...(f % 4 < 2 ? [[25, 1 + dy, C.yellow] as Px] : []),
      ]),
      shine: bodyShine(color),
    }
  }
  const still = [...clawd({ eyes: mood === 'wait' ? 'open' : 'closed', arms: 'hold', legs: 0, color }), ...lens(1, null)]
  if (mood === 'wait') {
    const blink = [...clawd({ eyes: 'closed', arms: 'hold', legs: 0, color }), ...lens(1, null)]
    return { fps: 3, frames: waitFrames(still, blink), shine: bodyShine(color) }
  }
  return { fps: 1, frames: [still], shine: bodyShine(color) }
}

// ── Developer: audífonos, laptop con código que corre, brazos tecleando ──────
const CODE: Array<Array<[number, number]>> = [
  // [largo, color] por segmento; cada fila cabe en x 20–24
  [[2, C.blue], [2, C.white]],
  [[1, 0x5a5a5a], [3, C.green]],
  [[1, 0x5a5a5a], [2, C.yellow], [1, C.white]],
  [[3, C.red], [1, C.white]],
  [[2, C.blue], [1, C.white], [1, C.green]],
  [[1, 0x5a5a5a], [1, 0x5a5a5a], [2, C.white]],
  [[4, C.green]],
  [[2, C.white], [2, C.blue]],
]
function codeRow(line: number, y: number): Px[] {
  const out: Px[] = []
  let x = 20
  for (const [len, c] of CODE[line % CODE.length]!) {
    for (let i = 0; i < len && x <= 24; i++) out.push([x++, y, c])
  }
  return out
}

function developer(mood: Mood): Animation {
  const color = bodyOf(mood)
  const phones = (led: boolean): Px[] => [
    // Diadema fina sobre la cabeza y copas a los lados.
    ...span(1, 3, 14, 0x3a3a3a),
    [2, 1, C.dark], [2, 2, C.dark], [2, 3, C.dark], [15, 1, C.dark], [15, 2, C.dark], [15, 3, C.dark],
    ...(led ? [[2, 3, tint(mood, C.green)] as Px] : []),
  ]
  const laptop = (scroll: number | null, cursor: boolean): Px[] => {
    const frame = tint(mood, 0x4a4a4a)
    const px: Px[] = [
      ...span(1, 19, 25, frame), [19, 2, frame], [19, 3, frame], [19, 4, frame],
      [25, 2, frame], [25, 3, frame], [25, 4, frame], ...span(5, 19, 25, frame),
      ...span(6, 17, 25, tint(mood, 0x9a9a9a)),
    ]
    for (let y = 2; y <= 4; y++) px.push(...span(y, 20, 24, C.screen))
    if (scroll !== null && mood !== 'dead') {
      px.push(...codeRow(scroll, 2), ...codeRow(scroll + 1, 3))
      const last = codeRow(scroll + 2, 4).slice(0, 2)
      px.push(...last)
      if (cursor) px.push([20 + last.length, 4, C.white])
    }
    return px
  }
  if (mood === 'work') {
    return {
      fps: 8,
      frames: Array.from({ length: 8 }, (_, f) => [
        ...clawd({ eyes: f === 6 ? 'closed' : 'right', arms: f % 2 ? 'typeL' : 'typeR', legs: 0, color }),
        ...phones(f % 2 === 0),
        ...laptop(f >> 1, f % 2 === 0),
      ]),
      shine: bodyShine(color),
    }
  }
  const still = [...clawd({ eyes: mood === 'wait' ? 'open' : 'closed', arms: 'out', legs: 0, color }), ...phones(false), ...laptop(mood === 'wait' ? 0 : null, false)]
  if (mood === 'wait') {
    const blink = [...clawd({ eyes: 'closed', arms: 'out', legs: 0, color }), ...phones(false), ...laptop(0, false)]
    return { fps: 3, frames: waitFrames(still, blink), shine: bodyShine(color) }
  }
  return { fps: 1, frames: [still], shine: bodyShine(color) }
}

// ── Auditor: visor con barrido rojo y portapapeles que se va marcando ───────
function auditor(mood: Mood): Animation {
  const color = bodyOf(mood)
  const visor = (at: number | null): Px[] => {
    // Gafas: no tocan los bordes, así Clawd sigue entero.
    const band = span(3, 4, 13, C.dark)
    if (at === null) return band
    const lit: Px[] = [[at, 3, C.redHot], [at + 1, 3, C.red]]
    const trail: Px[] = [[at - 1, 3, C.redDim], [at + 2, 3, C.redDim]].filter(([x]) => x! >= 4 && x! <= 13) as Px[]
    return [...band, ...trail, ...lit]
  }
  const board = (checks: number, finding: boolean): Px[] => {
    const wood = tint(mood, C.wood)
    const px: Px[] = [
      ...span(1, 18, 23, wood), ...span(6, 18, 23, tint(mood, C.woodSh)),
      [18, 2, wood], [18, 3, wood], [18, 4, wood], [18, 5, wood],
      [23, 2, wood], [23, 3, wood], [23, 4, wood], [23, 5, wood],
      ...span(0, 20, 21, C.steel),
    ]
    for (let y = 2; y <= 5; y++) {
      px.push([19, y, C.white], ...span(y, 20, 22, 0xbdbab3))
    }
    for (let i = 0; i < 4; i++) {
      const y = 2 + i
      if (i < checks) px.push([19, y, tint(mood, C.green)])
      if (finding && i === 3) px.push([19, y, C.red])
    }
    return px
  }
  if (mood === 'work') {
    const path = [4, 6, 8, 10, 12, 12, 10, 8, 6, 4]
    return {
      fps: 10,
      frames: path.map((at, f) => [
        ...clawd({ eyes: 'covered', arms: 'out', legs: 0, color }),
        ...visor(at),
        ...board(Math.min(3, f >> 1), f >= 8),
      ]),
      shine: bodyShine(color),
    }
  }
  const still = [...clawd({ eyes: 'covered', arms: 'out', legs: 0, color }), ...visor(mood === 'wait' ? 8 : null), ...board(mood === 'sleep' ? 3 : 1, false)]
  if (mood === 'wait') {
    const dim = [...clawd({ eyes: 'covered', arms: 'out', legs: 0, color }), ...visor(null), ...board(1, false)]
    return { fps: 3, frames: waitFrames(still, dim), shine: bodyShine(color) }
  }
  return { fps: 1, frames: [still], shine: bodyShine(color) }
}

// ── Base: Clawd solo, mientras no se sabe qué hace ──────────────────────────
function base(mood: Mood): Animation {
  const color = bodyOf(mood)
  if (mood === 'work') {
    return {
      fps: 4,
      frames: Array.from({ length: 8 }, (_, f) =>
        clawd({ eyes: f === 7 ? 'closed' : 'open', arms: 'out', legs: (f % 2) as 0 | 1, color })),
      shine: bodyShine(color),
    }
  }
  const still = clawd({ eyes: mood === 'wait' ? 'open' : 'closed', arms: 'out', legs: 0, color })
  if (mood === 'wait') {
    return { fps: 3, frames: waitFrames(still, clawd({ eyes: 'closed', arms: 'out', legs: 0, color })), shine: bodyShine(color) }
  }
  return { fps: 1, frames: [still], shine: bodyShine(color) }
}

export const SKINS: Record<Role, Skin> = {
  research: { role: 'research', label: 'investigando', accent: '#E5B93C', animate: research },
  developer: { role: 'developer', label: 'programando', accent: '#4EBA65', animate: developer },
  auditor: { role: 'auditor', label: 'auditando', accent: '#E5534B', animate: auditor },
  base: { role: 'base', label: 'arrancando', accent: '#D97757', animate: base },
}

// ── Pintores ─────────────────────────────────────────────────────────────────
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const key = ([x, y, c]: Px) => `${x},${y},${c}`

function flatten(frame: Frame): Map<string, number> {
  // El último píxel escrito en una posición gana.
  const m = new Map<string, number>()
  for (const [x, y, c] of frame) if (x >= 0 && x < W && y >= 0 && y < H) m.set(`${x},${y}`, c)
  return m
}
const toPx = (m: Map<string, number>): Px[] =>
  [...m].map(([k, c]) => { const [x, y] = k.split(',').map(Number); return [x!, y!, c] as Px })

const rects = (px: Px[], extra = '') =>
  px.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${hex(c)}"${extra}/>`).join('')

/** SVG animado (SMIL, cuadros discretos); `px` de ancho. */
export function svgOf(anim: Animation, mood: Mood, px: number): string {
  const frames = anim.frames.map(f => toPx(flatten(f)))
  const shared = frames.slice(1).reduce(
    (acc, f) => { const s = new Set(f.map(key)); return acc.filter(p => s.has(key(p))) },
    frames[0]!,
  )
  const sharedKeys = new Set(shared.map(key))
  const n = frames.length
  const dur = `${(n / anim.fps).toFixed(3)}s`
  const keyTimes = Array.from({ length: n }, (_, i) => (i / n).toFixed(4)).join(';')
  const layers = n === 1 ? '' : frames.map((f, i) => {
    const values = Array.from({ length: n }, (_, j) => (j === i ? 'visible' : 'hidden')).join(';')
    return `<g visibility="${i === 0 ? 'visible' : 'hidden'}">${rects(f.filter(p => !sharedKeys.has(key(p))))}<animate attributeName="visibility" values="${values}" keyTimes="${keyTimes}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/></g>`
  }).join('')
  // El brillo sólo cae sobre píxeles del cuerpo que siguen siendo cuerpo.
  const bodyKeys = new Set(shared.filter(([, , c]) => c === C.body || c === C.dead).map(([x, y]) => `${x},${y}`))
  const shine = (anim.shine ?? []).filter(([x, y]) => bodyKeys.has(`${x},${y}`))
  const zz = mood === 'sleep'
    ? `<text x="15.5" y="3.4" font-size="3.6" font-family="ui-monospace,Menlo,monospace" font-weight="700" fill="#8A8A8A">z<animate attributeName="opacity" values=".15;1;.15" dur="2.4s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="2.4s" repeatCount="indefinite"/></text>`
    : ''
  const ground = `<ellipse cx="9" cy="14.6" rx="7.5" ry=".7" fill="#000" opacity=".22"/>`
  const h = Math.round((px * (H * 2 + 1)) / W)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 ${W} ${H * 2 + 1}" width="${px}" height="${h}" shape-rendering="crispEdges">${ground}<g transform="scale(1 2)">${rects(shared)}${rects(shine, ' opacity=".55"')}${layers}</g>${zz}</svg>`
}

/** Celdas del Raster del terminal para un cuadro: cuartos de bloque, 2×2 píxeles. */
export const COLS = W / 2
export const ROWS = H / 2
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const DEFAULT = 0x01000000

export function cellsOf(frame: Frame): Uint32Array {
  const m = flatten(frame)
  const at = (x: number, y: number) => m.get(`${x},${y}`) ?? -1
  const words = new Uint32Array(COLS * ROWS * 3)
  for (let r = 0; r < ROWS; r++) {
    for (let cx = 0; cx < COLS; cx++) {
      const q = [at(2 * cx, 2 * r), at(2 * cx + 1, 2 * r), at(2 * cx, 2 * r + 1), at(2 * cx + 1, 2 * r + 1)]
      const count = new Map<number, number>()
      for (const c of q) if (c >= 0) count.set(c, (count.get(c) ?? 0) + 1)
      const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
      const i = (r * COLS + cx) * 3
      if (ranked.length === 0) { words.set([0x20, DEFAULT, DEFAULT], i); continue }
      const fg = ranked[0]!
      const bg = q.some(c => c < 0) ? DEFAULT : ranked[1] ?? DEFAULT
      let mask = 0
      q.forEach((c, b) => { if (c === fg) mask |= 1 << b })
      words.set([QUAD.charCodeAt(mask), fg, bg], i)
    }
  }
  return words
}
