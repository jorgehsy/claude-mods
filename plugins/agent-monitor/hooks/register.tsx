import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'agent-monitor'
const rows = atom({ plugin: 'agent-monitor', key: 'rows' } as const, {})
const frame = atom({ plugin: 'agent-monitor', key: 'frame' } as const, 0)
const opened = atom({ plugin: 'agent-monitor', key: 'opened' } as const, false)

// ── Precios y ventana ────────────────────────────────────────────────────────
// USD por millón de tokens: [entrada, salida, lectura de caché, escritura de caché]. Estimados.
const PRICES: Array<[string, [number, number, number, number]]> = [
  ['opus', [15, 75, 1.5, 18.75]],
  ['fable', [15, 75, 1.5, 18.75]],
  ['sonnet', [3, 15, 0.3, 3.75]],
  ['haiku', [1, 5, 0.1, 1.25]],
]
const priceOf = (model: string) =>
  PRICES.find(([k]) => model.toLowerCase().includes(k))?.[1] ?? [3, 15, 0.3, 3.75]
const windowOf = (model: string) => (/1m/i.test(model) ? 1_000_000 : 200_000)
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

function prettyModel(model: string) {
  if (!model || model === '-') return '—'
  const m = model.replace(/^.*claude-/, '').replace(/\[.*\]$/, '')
  const [fam = '', ...v] = m.split('-')
  return `${fam.charAt(0).toUpperCase()}${fam.slice(1)} ${v.filter(x => /^\d+$/.test(x)).join('.')}`.trim()
}

// ── Estados ──────────────────────────────────────────────────────────────────
type Mood = 'work' | 'wait' | 'sleep' | 'dead'
const moodOf = (s: string): Mood =>
  s === 'waiting' ? 'wait' : s === 'failed' || s === 'killed' ? 'dead'
    : s === 'running' || s === 'pending' ? 'work' : 'sleep'
const LABEL: Record<string, string> = {
  running: 'trabajando', pending: 'arrancando', waiting: 'espera tu respuesta',
  idle: 'inactivo', completed: 'terminó', failed: 'falló', killed: 'detenido',
}
const STATUS_COLOR: Record<Mood, string> = { work: '#4EBA65', wait: '#E5B93C', sleep: '#8A8A8A', dead: '#E5534B' }

// ── Clawd en píxeles ─────────────────────────────────────────────────────────
// La silueta del logo de Claude Code (` ▐▛███▜▌ / ▝▜█████▛▘ /   ▘▘ ▝▝ `) en una
// grilla de 18×8: filas 0–1 sombrero, 2–6 cuerpo y patas, 7 vacía.
const W = 18
const H = 8
const BODY = 0xd97757
const BODY_DEAD = 0x8a8a8a
const EYE = 0x1f1e1d
const LID = 0x9c4f37

type Px = [number, number, number] // x, y, color
const span = (y: number, a: number, b: number, c: number): Px[] =>
  Array.from({ length: b - a + 1 }, (_, i) => [a + i, y, c] as Px)

function bodyPx(c: number): Px[] {
  return [
    ...span(2, 3, 14, c),
    ...span(3, 3, 4, c), ...span(3, 6, 11, c), ...span(3, 13, 14, c),
    ...span(4, 1, 16, c),
    ...span(5, 3, 14, c),
  ]
}
const EYES: Px[] = [[5, 3, EYE], [12, 3, EYE]]
const LEGS_A = [4, 6, 11, 13]
const LEGS_B = [5, 7, 10, 12]
const legsPx = (xs: number[], c: number): Px[] => xs.map(x => [x, 6, c] as Px)

type Skin = { name: string; color: string; hat: Px[] }
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

function skinOf(type: string): Skin {
  const t = type.toLowerCase()
  if (/frontend|developer|engineer|architect|devops|backend|prototyper|senior/.test(t)) {
    const c = 0x4eba65 // gorra
    return { name: 'dev', color: hex(c), hat: [...span(0, 5, 12, c), ...span(1, 3, 16, c)] }
  }
  if (/design|ux|ui|writer|canvas|document/.test(t)) {
    const c = 0xc061cb // boina
    return { name: 'diseño', color: hex(c), hat: [...span(0, 5, 10, c), [11, 0, c], ...span(1, 4, 13, c)] }
  }
  if (/explore|search|research|plan|buscador/.test(t)) {
    const c = 0xe5b93c // antena
    return { name: 'explorador', color: hex(c), hat: [[8, 0, c], [9, 0, c], [8, 1, 0x8a8a8a], [9, 1, 0x8a8a8a]] }
  }
  if (/review|qa|test|checker|auditor|security|evidence/.test(t)) {
    const c = 0xe5534b // visera
    return { name: 'revisor', color: hex(c), hat: span(1, 2, 15, c) }
  }
  if (/general|claude/.test(t)) return { name: 'general', color: '#5BB8D6', hat: [] }
  const c = 0x6b8afd // vincha
  return { name: 'otro', color: hex(c), hat: [...span(1, 3, 14, c), [15, 1, c], [16, 0, c]] }
}

/** Una pose: lo que se pinta en un cuadro del terminal. */
function pose(skin: Skin, mood: Mood, tick: number): Px[] {
  const c = mood === 'dead' ? BODY_DEAD : BODY
  const blink = mood === 'wait' ? tick % 2 === 1 : mood === 'work' && tick % 8 === 7
  const closed = mood === 'sleep' || mood === 'dead' || blink
  const legs = mood === 'work' && tick % 2 === 1 ? LEGS_B : LEGS_A
  // Abiertos: huecos, como en el logo. Cerrados: párpado de un tono más oscuro.
  const body = bodyPx(c).concat(closed ? EYES.map(([x, y]) => [x, y, LID] as Px) : [])
  return [...skin.hat, ...body, ...legsPx(legs, c)]
}

// ── Terminal: Raster con cuartos de bloque, como el logo ─────────────────────
// Cada celda lleva 2×2 píxeles (▘▝▖▗…), así el píxel queda alto como en el logo.
const DEFAULT = 0x01000000
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'
const COLS = W / 2
const ROWS = H / 2
function rasterCells(px: Px[]): string {
  const grid: number[] = new Array(W * H).fill(-1)
  for (const [x, y, c] of px) grid[y * W + x] = c
  const at = (i: number) => grid[i] ?? -1
  const words = new Uint32Array(COLS * ROWS * 3)
  for (let r = 0; r < ROWS; r++) {
    for (let cx = 0; cx < COLS; cx++) {
      // TL, TR, BL, BR → bits 1, 2, 4, 8
      const q: number[] = [
        at(2 * r * W + 2 * cx), at(2 * r * W + 2 * cx + 1),
        at((2 * r + 1) * W + 2 * cx), at((2 * r + 1) * W + 2 * cx + 1),
      ]
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
  const bytes = new Uint8Array(words.buffer)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

// ── Escritorio: SVG con animación SMIL ───────────────────────────────────────
const MASCOT_PX = 56
const rect = ([x, y, c]: Px) => `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${hex(c)}"/>`
const flip = (dur: string, on: string) =>
  `<animate attributeName="opacity" values="${on}" dur="${dur}" calcMode="discrete" repeatCount="indefinite"/>`

function clawdSvg(skin: Skin, mood: Mood): string {
  const c = mood === 'dead' ? BODY_DEAD : BODY
  const body = [...skin.hat, ...bodyPx(c)].map(rect).join('')
  const eyes = mood === 'sleep' || mood === 'dead'
    ? `<g fill="${hex(EYE)}"><rect x="5" y="3.55" width="1" height=".45"/><rect x="12" y="3.55" width="1" height=".45"/></g>`
    : `<g>${EYES.map(rect).join('')}${flip(mood === 'wait' ? '.6s' : '3.2s', mood === 'wait' ? '1;0' : '1;1;1;1;1;1;1;0')}</g>`
  const legsA = legsPx(LEGS_A, c).map(rect).join('')
  const legsB = legsPx(LEGS_B, c).map(rect).join('')
  const legs = mood === 'work'
    ? `<g>${legsA}${flip('.5s', '1;0')}</g><g>${legsB}${flip('.5s', '0;1')}</g>`
    : legsA
  const bob = mood === 'work'
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -.4" dur=".5s" calcMode="discrete" repeatCount="indefinite"/>`
    : ''
  const extra =
    mood === 'wait'
      ? `<g fill="#E5B93C"><rect x="16.4" y="-1.6" width="1.2" height="3.6"/><rect x="16.4" y="2.6" width="1.2" height="1.2"/>${flip('.6s', '1;.25')}</g>`
      : mood === 'sleep'
        ? `<text x="14.6" y="2.2" font-size="4.2" font-family="ui-monospace,monospace" font-weight="700" fill="#8A8A8A">z<animate attributeName="opacity" values=".2;1;.2" dur="2.4s" repeatCount="indefinite"/></text>`
        : ''
  // Píxel 1 de ancho × 2 de alto, como las celdas del logo en el terminal.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 18 18" width="${MASCOT_PX}" height="${MASCOT_PX}" shape-rendering="crispEdges"><g transform="scale(1 2)"><g>${body}${eyes}${bob}</g>${legs}</g>${extra}</svg>`
}

function barSvg(ratio: number, color: string): string {
  const w = Math.max(0, Math.min(1, ratio)) * 100
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" width="220" height="8" preserveAspectRatio="none"><rect width="100" height="6" rx="3" fill="#8A8A8A" opacity=".2"/><rect width="${w.toFixed(2)}" height="6" rx="3" fill="${color}"/></svg>`
}

const ctxColor = (r: number) => (r < 0.6 ? '#4EBA65' : r < 0.85 ? '#E5B93C' : '#E5534B')

// ── Datos ────────────────────────────────────────────────────────────────────
const blank = (id: string): AgentRow => ({
  id, type: '?', description: '', status: 'running', model: '-',
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, context: 0, usd: 0,
})

async function sync($: any) {
  const list = await $.agent.list()
  await update($, rows, (all: Record<string, AgentRow>) => {
    const next = { ...all }
    for (const a of list) {
      next[a.id] = { ...(next[a.id] ?? blank(a.id)), type: a.type, description: a.description, status: a.status }
    }
    return next
  })
}

async function openOnce($: any) {
  if (await read($, opened)) return
  await update($, opened, () => true)
  await $.ui.open({ id: PANE, title: 'Agentes' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agent-monitor', description: 'Abre el panel de subagentes' })
    $.clock.every(500, async () => {
      const all = Object.values(await read($, rows)) as AgentRow[]
      if (all.some(r => moodOf(r.status) === 'work' || moodOf(r.status) === 'wait')) {
        await update($, frame, (n: number) => n + 1)
      }
    })
    return next(e)
  })

  on('command.run', { command: 'agent-monitor' }, async $ => {
    await update($, opened, () => true)
    await $.ui.open({ id: PANE, title: 'Agentes' })
    return { text: 'Panel de agentes abierto.' }
  })

  // En el escritorio no hay comandos: el panel se abre solo con el primer subagente.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await sync($)
    await openOnce($)
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    const id = e.agentId
    if (id && res.usage) {
      const u = res.usage
      const p = priceOf(u.model)
      const cost = (u.input_tokens * p[0] + u.output_tokens * p[1] +
        u.cache_read_input_tokens * p[2] + u.cache_creation_input_tokens * p[3]) / 1e6
      await update($, rows, (all: Record<string, AgentRow>) => {
        const r = all[id] ?? blank(id)
        return {
          ...all,
          [id]: {
            ...r,
            model: u.model,
            input: r.input + u.input_tokens,
            output: r.output + u.output_tokens,
            cacheRead: r.cacheRead + u.cache_read_input_tokens,
            cacheWrite: r.cacheWrite + u.cache_creation_input_tokens,
            context: u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
            usd: r.usd + cost,
          },
        }
      })
    }
    await sync($)
    return res
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const isTerm = e.surface === 'terminal'
    const all = Object.values(await read($, rows)) as AgentRow[]
    // Sólo el terminal anima cuadro a cuadro; el SVG del escritorio se anima solo.
    const tick = isTerm ? ((await read($, frame)) as number) : 0
    const total = all.reduce((s, r) => s + r.usd, 0)
    const tokens = all.reduce((s, r) => s + r.input + r.output + r.cacheRead + r.cacheWrite, 0)
    const live = all.filter(r => moodOf(r.status) === 'work').length
    const waiting = all.filter(r => moodOf(r.status) === 'wait').length
    const cols = (e.props as any)?.bodyColumns ?? 40
    const barW = Math.max(10, Math.min(30, cols - 12))

    const mascot = (skin: Skin, mood: Mood, key: string) => {
      if (isTerm && 'Raster' in els) {
        const { Raster } = els as any
        return <Raster key={`m-${key}`} columns={COLS} rows={ROWS} cells={rasterCells(pose(skin, mood, tick))} />
      }
      if ('Svg' in els) {
        // Sin isInteractive: imagen con fondo transparente; SMIL anima igual.
        const { Svg } = els as any
        return <Svg source={clawdSvg(skin, mood)} alt={`Clawd ${skin.name}`} width={MASCOT_PX} height={MASCOT_PX} />
      }
      return <Text>✳</Text>
    }

    const ctxBar = (ratio: number) => {
      const color = ctxColor(ratio)
      if (!isTerm && 'Svg' in els) {
        const { Svg } = els as any
        return <Svg source={barSvg(ratio, color)} alt={`contexto ${Math.round(ratio * 100)}%`} width={220} height={8} />
      }
      const full = Math.round(Math.max(0, Math.min(1, ratio)) * barW)
      return (
        <Text>
          <Text color={color}>{'━'.repeat(full)}</Text>
          <Text dimColor>{'━'.repeat(barW - full)}</Text>
        </Text>
      )
    }

    const order: Record<Mood, number> = { wait: 0, work: 1, dead: 2, sleep: 3 }
    const sorted = [...all].sort((a, b) => order[moodOf(a.status)] - order[moodOf(b.status)])

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column" paddingX={1}>
          <Text>
            <Text bold color="#D97757">✻ Agentes</Text>
            <Text dimColor>  {all.length} en total</Text>
          </Text>
          <Text>
            <Text color={STATUS_COLOR.work}>● {live} trabajando</Text>
            {waiting > 0 && <Text color={STATUS_COLOR.wait} bold>   ▲ {waiting} esperan</Text>}
          </Text>
          <Text dimColor>{k(tokens)} tokens · ~US$ {total.toFixed(3)}</Text>
        </Box>

        {all.length === 0 && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            {mascot(skinOf('general'), 'sleep', 'empty')}
            <Text dimColor>Todavía no hay subagentes.</Text>
          </Box>
        )}

        {sorted.map(r => {
          const skin = skinOf(r.type)
          const mood = moodOf(r.status)
          const win = windowOf(r.model)
          const ratio = r.context / win
          const dim = mood === 'sleep'
          const border = mood === 'wait' ? (tick % 2 === 0 ? STATUS_COLOR.wait : '#D97757') : STATUS_COLOR[mood]
          return (
            <Box key={r.id} borderStyle={mood === 'wait' ? 'bold' : 'round'} borderColor={border} paddingX={1} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                {mascot(skin, mood, r.id)}
                <Box flexDirection="column" flexGrow={1}>
                  <Text bold color={skin.color} dimColor={dim}>{r.type}</Text>
                  <Text color={STATUS_COLOR[mood]} bold={mood === 'wait'}>
                    {mood === 'wait' ? '▲ ' : '● '}{LABEL[r.status] ?? r.status}
                  </Text>
                  <Text dimColor>{prettyModel(r.model)}</Text>
                </Box>
              </Box>
              {r.description !== '' && <Text dimColor={dim} wrap="truncate-end">{r.description}</Text>}
              <Text dimColor={dim}>
                ↑ {k(r.input + r.cacheRead + r.cacheWrite)}  ↓ {k(r.output)}  · ~US$ {r.usd.toFixed(3)}
              </Text>
              {ctxBar(ratio)}
              <Text dimColor>contexto {k(r.context)} / {k(win)} · {Math.round(ratio * 100)}%</Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
