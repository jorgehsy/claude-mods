import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow } from '../types'
import { SKINS, svgOf, cellsOf, withTier, COLS, ROWS, type Mood, type Role } from './skins.ts'
import { modelInfo, costOf, tierOf, TIER_STYLE, type Tier } from './models.ts'

const PANE = 'agent-monitor'
const rows = atom({ plugin: 'agent-monitor', key: 'rows' } as const, {})
const frame = atom({ plugin: 'agent-monitor', key: 'frame' } as const, 0)
const opened = atom({ plugin: 'agent-monitor', key: 'opened' } as const, false)
// La hora del panel, al segundo: mueve la cuenta regresiva de los que terminaron.
const now = atom({ plugin: 'agent-monitor', key: 'now' } as const, 0)

// Cada tick del reloj del panel dura TICK ms; los cuadros de cada skin se
// reparten según sus propios fps.
const TICK = 125
// Un agente que terminó y no recibe otra instrucción en este tiempo se oculta.
const LINGER = 30_000

// ── Precio y ventana: ver models.ts ─────────────────────────────────────────
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

function prettyModel(model: string) {
  if (!model || model === '-') return '—'
  const m = model.replace(/^.*claude-/, '').replace(/\[.*\]$/, '')
  const [fam = '', ...v] = m.split('-')
  return `${fam.charAt(0).toUpperCase()}${fam.slice(1)} ${v.filter(x => /^\d+$/.test(x)).join('.')}`.trim()
}

// ── Estados ──────────────────────────────────────────────────────────────────
const moodOf = (s: string): Mood =>
  s === 'waiting' ? 'wait' : s === 'failed' || s === 'killed' ? 'dead'
    : s === 'running' || s === 'pending' ? 'work' : 'sleep'
const LABEL: Record<string, string> = {
  running: 'trabajando', pending: 'arrancando', waiting: 'espera tu respuesta',
  idle: 'inactivo', completed: 'terminó', failed: 'falló', killed: 'detenido',
}
const STATUS_COLOR: Record<Mood, string> = { work: '#4EBA65', wait: '#E5B93C', sleep: '#8A8A8A', dead: '#E5534B' }

// ── Qué está haciendo: el skin ───────────────────────────────────────────────
const AUDIT = /review|audit|security|seguridad|vuln|qa\b|checker|reviewer|revis|auditor|evidence/i
const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const READS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch'])
const RECENT = 6

type Kind = 'read' | 'write' | 'other'

/**
 * Qué fue una llamada. El motor marca `isReadOnly` con el mismo chequeo de sus
 * permisos: un `ls` o un `git diff` por Bash es lectura, un `pnpm build` no.
 */
function kindOf(tool: string, isReadOnly: boolean | undefined): Kind {
  if (isReadOnly || READS.has(tool) || tool.startsWith('mcp__')) return 'read'
  if (WRITES.has(tool)) return 'write'
  return 'other'
}

/** auditor por su encargo; si no, lo que dominan sus últimas llamadas. */
function roleOf(r: AgentRow): Role {
  if (AUDIT.test(`${r.type} ${r.description}`)) return 'auditor'
  const kinds = (r.tools ?? []).filter(t => t === 'read' || t === 'write')
  if (kinds.length === 0) return /explore|plan|research|buscador/i.test(r.type) ? 'research' : 'base'
  const writes = kinds.filter(t => t === 'write').length
  return writes > kinds.length - writes ? 'developer' : 'research'
}

// ── Datos ────────────────────────────────────────────────────────────────────
const blank = (id: string): AgentRow => ({
  id, type: '?', description: '', status: 'running', model: '-',
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, context: 0, usd: 0, tools: [],
})

const isLive = (status: string) => {
  const m = moodOf(status)
  return m === 'work' || m === 'wait'
}

async function sync($: EngineInterface) {
  const list = await $.agent.list()
  const t = await $.clock.now()
  await update($, rows, (all: Record<string, AgentRow>) => {
    const next = { ...all }
    for (const a of list) {
      const prev = next[a.id] ?? blank(a.id)
      const live = isLive(String(a.status))
      // Al terminar arranca la cuenta; si vuelve a trabajar, se cancela.
      const endedAt = live ? undefined : prev.endedAt ?? t
      next[a.id] = { ...prev, type: a.type, description: a.description, status: a.status, endedAt }
    }
    return next
  })
}

async function openOnce($: EngineInterface) {
  if (await read($, opened)) return
  await update($, opened, () => true)
  await $.ui.open({ id: PANE, title: 'Agentes' })
}

function b64(words: Uint32Array) {
  const bytes = new Uint8Array(words.buffer)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

const ctxColor = (r: number) => (r < 0.6 ? '#4EBA65' : r < 0.85 ? '#E5B93C' : '#E5534B')

function barSvg(ratio: number, color: string): string {
  const w = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) * 100 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" width="220" height="8" preserveAspectRatio="none"><rect width="100" height="6" rx="3" fill="#8A8A8A" opacity=".2"/><rect width="${w.toFixed(2)}" height="6" rx="3" fill="${color}"/></svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agent-monitor', description: 'Abre el panel de subagentes' })
    $.clock.every(TICK, async () => {
      const all = Object.values(await read($, rows)) as AgentRow[]
      if (all.some(r => moodOf(r.status) === 'work' || moodOf(r.status) === 'wait')) {
        await update($, frame, (n: number) => n + 1)
      }
    })
    // Cada segundo: estado al día, cuenta regresiva y ocultar a los que se cumplió.
    $.clock.every(1000, async () => {
      const all = Object.values(await read($, rows)) as AgentRow[]
      const t = await $.clock.now()
      if (all.some(r => r.endedAt === undefined || t - r.endedAt < LINGER + 1000)) {
        await sync($)
        // Los que ya no lista el motor también cuentan desde ahora.
        await update($, rows, (cur: Record<string, AgentRow>) => {
          const out = { ...cur }
          for (const [id, r] of Object.entries(out)) {
            if (!isLive(r.status) && r.endedAt === undefined) out[id] = { ...r, endedAt: t }
          }
          return out
        })
        await update($, now, () => t)
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

  // Cada herramienta que usa un subagente decide su skin, ya resuelta.
  on('tool.call', async ($, e, next) => {
    const res = await next(e)
    const id = e.agentId
    if (id) {
      try {
        const kind = kindOf(String(e.tool), (res as { isReadOnly?: boolean }).isReadOnly)
        await update($, rows, (all: Record<string, AgentRow>) => {
          const r = all[id] ?? blank(id)
          return { ...all, [id]: { ...r, tools: [...(r.tools ?? []), kind].slice(-RECENT) } }
        })
      } catch (err) {
        // El panel nunca frena una herramienta; el fallo queda en el log de depuración.
        $.ui.log(`agent-monitor: no se pudo anotar ${String(e.tool)}: ${String(err)}`, { to: 'debug' })
      }
    }
    return res
  })

  on('turn.step', async function* ($, e, next) {
    const res = yield* next(e)
    const id = e.agentId
    if (id && res.usage) {
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
      const u = {
        model: String(res.usage.model ?? '-'),
        input_tokens: n(res.usage.input_tokens),
        output_tokens: n(res.usage.output_tokens),
        cache_read_input_tokens: n(res.usage.cache_read_input_tokens),
        cache_creation_input_tokens: n(res.usage.cache_creation_input_tokens),
      }
      const cost = costOf(u.model, {
        input: u.input_tokens, output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens,
      })
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
    const every = Object.values(await read($, rows)) as AgentRow[]
    const t = (await read($, now)) as number
    const left = (r: AgentRow) => (r.endedAt === undefined ? null : Math.max(0, Math.ceil((LINGER - (t - r.endedAt)) / 1000)))
    const all = every.filter(r => left(r) !== 0)
    // Sólo el terminal anima cuadro a cuadro; el SVG del escritorio se anima solo.
    const tick = isTerm ? ((await read($, frame)) as number) : 0
    // Tokens y costo: toda la sesión, también los que ya se ocultaron.
    const total = every.reduce((s, r) => s + r.usd, 0)
    const tokens = every.reduce((s, r) => s + r.input + r.output + r.cacheRead + r.cacheWrite, 0)
    const live = all.filter(r => moodOf(r.status) === 'work').length
    const waiting = all.filter(r => moodOf(r.status) === 'wait').length
    // Opus y Fable trabajando o esperando: se cuentan arriba para verlos sin bajar.
    const busy = all.filter(r => moodOf(r.status) === 'work' || moodOf(r.status) === 'wait')
    const costly = (['top', 'high'] as const)
      .map(t => [t, busy.filter(r => tierOf(r.model) === t).length] as [Tier, number])
      .filter(([, n]) => n > 0)
    const cols = (e.props as any)?.bodyColumns ?? 40
    const barW = Math.max(10, Math.min(30, cols - 12))

    const mascot = (role: Role, mood: Mood, key: string, tier: Tier = 'mid') => {
      const anim = withTier(SKINS[role].animate(mood), tier, mood, isTerm ? 'term' : 'svg')
      if (isTerm && 'Raster' in els) {
        const { Raster } = els as any
        const n = anim.frames.length
        const i = Math.floor((tick * TICK * anim.fps) / 1000) % n
        return <Raster key={`m-${key}`} columns={COLS} rows={ROWS} cells={b64(cellsOf(anim.frames[i]!))} />
      }
      if ('Svg' in els) {
        const { Svg } = els as any
        return <Svg source={svgOf(anim, mood, 104)} alt={`Clawd ${SKINS[role].label}`} width={104} height={68} />
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
            <Text dimColor>  {all.length} en el panel</Text>
          </Text>
          <Text>
            <Text color={STATUS_COLOR.work}>● {live} trabajando</Text>
            {waiting > 0 && <Text color={STATUS_COLOR.wait} bold>   ▲ {waiting} esperan</Text>}
          </Text>
          {costly.length > 0 && (
            <Text>
              {costly.map(([tier, n], i) => (
                <Text key={tier} color={TIER_STYLE[tier].color} bold>{i > 0 ? ' · ' : ''}{TIER_STYLE[tier].mark}{n} {tier === 'top' ? 'Fable' : 'Opus'}</Text>
              ))}
              <Text dimColor> activos</Text>
            </Text>
          )}
          <Text dimColor>{k(tokens)} tokens · ~US$ {total.toFixed(3)} en la sesión</Text>
        </Box>

        {all.length === 0 && (
          <Box flexDirection="column" alignItems="center" paddingY={1}>
            {mascot('base', 'sleep', 'empty')}
            <Text dimColor>Todavía no hay subagentes.</Text>
          </Box>
        )}

        {sorted.map(r => {
          const role = roleOf(r)
          const skin = SKINS[role]
          const tier = tierOf(r.model)
          const ts = TIER_STYLE[tier]
          const mood = moodOf(r.status)
          const win = modelInfo(r.model).window
          const ratio = r.context / win
          const dim = mood === 'sleep'
          const border = mood === 'wait' ? (tick % 4 < 2 ? STATUS_COLOR.wait : '#D97757') : STATUS_COLOR[mood]
          return (
            <Box key={r.id} borderStyle={mood === 'wait' ? 'bold' : 'round'} borderColor={border} paddingX={1} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                {mascot(role, mood, r.id, tier)}
                <Box flexDirection="column" flexGrow={1}>
                  <Text bold dimColor={dim}>{r.type}</Text>
                  <Text color={STATUS_COLOR[mood]} bold={mood === 'wait'}>
                    {mood === 'wait' ? '▲ ' : '● '}{LABEL[r.status] ?? r.status}
                    {left(r) !== null && <Text dimColor>  · se oculta en {left(r)} s</Text>}
                  </Text>
                  {role !== 'base' && (mood === 'work' || mood === 'wait') && <Text color={skin.accent}>◆ {skin.label}</Text>}
                  <Text color={ts.color} bold={ts.bold} dimColor={ts.dim}>{ts.mark}{prettyModel(r.model)}</Text>
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
