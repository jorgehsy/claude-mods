import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Issue, Pr, Snapshot } from '../types'
import {
  QUERY, parseRepo, parseGraphql, ghError, canTake, canMerge, canRetry,
  CHECKS_LABEL, MERGE_LABEL, ago, labelFg, labelBg,
} from './github.ts'

const PANE = 'github-panel'
const REFRESH_MS = 30_000

const repo = atom({ plugin: 'github-panel', key: 'repo' } as const, '')
const data = atom({ plugin: 'github-panel', key: 'data' } as const, null)
const error = atom({ plugin: 'github-panel', key: 'error' } as const, '')
const fetchedAt = atom({ plugin: 'github-panel', key: 'fetchedAt' } as const, 0)
const now = atom({ plugin: 'github-panel', key: 'now' } as const, 0)
const refreshing = atom({ plugin: 'github-panel', key: 'refreshing' } as const, false)
const collapsed = atom({ plugin: 'github-panel', key: 'collapsed' } as const, { issues: false, prs: false })
const busy = atom({ plugin: 'github-panel', key: 'busy' } as const, {})
const confirm = atom({ plugin: 'github-panel', key: 'confirm' } as const, null)
const notes = atom({ plugin: 'github-panel', key: 'notes' } as const, {})

const title = (name: string) => (name ? name : 'GitHub')

/** Corre `gh` en el directorio de la sesión; nunca rechaza. */
async function gh($: EngineInterface, args: string[], timeoutMs = 20_000) {
  try {
    const res = await $.process.run(['gh', ...args], { timeoutMs })
    return { ok: res.exitCode === 0, out: res.stdout, err: res.stderr.trim() }
  } catch (err) {
    return { ok: false, out: '', err: String(err) }
  }
}

async function detectRepo($: EngineInterface): Promise<string> {
  const res = await gh($, ['repo', 'view', '--json', 'nameWithOwner'], 10_000)
  const name = res.ok ? parseRepo(res.out) : null
  if (name) {
    await update($, repo, () => name)
    await update($, error, () => '')
    return name
  }
  await update($, error, () => ghError(res.err, 'No se detectó un repositorio de GitHub'))
  return ''
}

// Un solo fetch a la vez.
let fetching = false

async function refresh($: EngineInterface) {
  if (fetching) return
  fetching = true
  await update($, refreshing, () => true)
  try {
    let name = (await read($, repo)) as string
    if (!name) name = await detectRepo($)
    if (name) {
      const [owner, rname] = name.split('/')
      const res = await gh($, ['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${rname}`, '-f', `query=${QUERY}`])
      if (res.ok) {
        try {
          const snap = parseGraphql(res.out)
          await update($, data, () => snap)
          await update($, error, () => '')
        } catch (err) {
          await update($, error, () => ghError(String(err instanceof Error ? err.message : err)))
        }
      } else {
        await update($, error, () => ghError(res.err))
      }
    }
    const t = await $.clock.now()
    await update($, fetchedAt, () => t)
    await update($, now, () => t)
  } catch (err) {
    $.ui.log(`github-panel: no se pudo refrescar: ${String(err)}`, { to: 'debug' })
  } finally {
    fetching = false
    await update($, refreshing, () => false)
  }
}

const setNote = ($: EngineInterface, key: string, text: string) =>
  update($, notes, (all: Record<string, string>) => ({ ...all, [key]: text }))

/** Corre una acción con el botón en «…», deja el resultado en la fila y refresca. */
async function act($: EngineInterface, busyKey: string, noteKey: string, run: () => Promise<string>) {
  await update($, busy, (all: Record<string, boolean>) => ({ ...all, [busyKey]: true }))
  try {
    await setNote($, noteKey, await run())
  } catch (err) {
    await setNote($, noteKey, `Error: ${ghError(String(err))}`)
  } finally {
    await update($, busy, (all: Record<string, boolean>) => ({ ...all, [busyKey]: false }))
  }
  await refresh($)
}

const take = ($: EngineInterface, i: Issue) =>
  act($, `take-${i.number}`, `issue-${i.number}`, async () => {
    const r = await gh($, ['issue', 'edit', String(i.number), '--add-assignee', '@me'])
    return r.ok ? `Tomaste el #${i.number}` : `Error: ${ghError(r.err)}`
  })

const merge = ($: EngineInterface, p: Pr) =>
  act($, `merge-${p.number}`, `pr-${p.number}`, async () => {
    await update($, confirm, () => null)
    const r = await gh($, ['pr', 'merge', String(p.number), '--squash', '--delete-branch'], 60_000)
    return r.ok ? `#${p.number} mergeado` : `Error: ${ghError(r.err)}`
  })

const retry = ($: EngineInterface, p: Pr) =>
  act($, `retry-${p.number}`, `pr-${p.number}`, async () => {
    const l = await gh($, ['run', 'list', '--branch', p.head, '--status', 'failure', '--limit', '1', '--json', 'databaseId'])
    if (!l.ok) return `Error: ${ghError(l.err)}`
    let id: number | undefined
    try { id = (JSON.parse(l.out) as { databaseId?: number }[])[0]?.databaseId } catch { /* sin JSON, sin corrida */ }
    if (id === undefined) return 'No hay una corrida fallida para reintentar'
    const r = await gh($, ['run', 'rerun', String(id), '--failed'])
    return r.ok ? `Reintentando la corrida ${id}` : `Error: ${ghError(r.err)}`
  })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'github-panel', description: 'Abre el panel de issues y PR de GitHub' })
    // Detectar el repo y el primer fetch no frenan el arranque de la sesión.
    void (async () => {
      try {
        const name = await detectRepo($)
        await $.ui.open({ id: PANE, title: title(name) })
        await refresh($)
      } catch (err) {
        $.ui.log(`github-panel: no arrancó: ${String(err)}`, { to: 'debug' })
      }
    })()
    // Cada segundo mueve el «hace N s»; cada 30 s vuelve a leer.
    $.clock.every(1000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
      const at = (await read($, fetchedAt)) as number
      if (!fetching && t - at >= REFRESH_MS) await refresh($)
    })
    return next(e)
  })

  on('command.run', { command: 'github-panel' }, async $ => {
    await $.ui.open({ id: PANE, title: title((await read($, repo)) as string) })
    void refresh($)
    return { text: 'Panel de GitHub abierto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link } = els as any
    const name = (await read($, repo)) as string
    const snap = (await read($, data)) as Snapshot | null
    const err = (await read($, error)) as string
    const t = (await read($, now)) as number
    const at = (await read($, fetchedAt)) as number
    const isRefreshing = (await read($, refreshing)) as boolean
    const fold = (await read($, collapsed)) as { issues: boolean; prs: boolean }
    const working = (await read($, busy)) as Record<string, boolean>
    const asking = (await read($, confirm)) as number | null
    const msgs = (await read($, notes)) as Record<string, string>

    const toggle = (k: 'issues' | 'prs') => update($, collapsed, (c: { issues: boolean; prs: boolean }) => ({ ...c, [k]: !c[k] }))
    const noteLine = (key: string) => {
      const m = msgs[key]
      return m ? <Text color={m.startsWith('Error') ? '#E5534B' : '#4EBA65'} wrap="truncate-end">{m}</Text> : null
    }
    const btn = (key: string, label: string, onPress: () => void, variant?: 'primary') => (
      <Button key={key} label={working[key] ? '…' : label} variant={variant} onPress={() => { if (!working[key]) onPress() }} />
    )

    const labels = (i: Issue) => i.labels.map(l => (
      <Text key={l.name} backgroundColor={labelBg(l.color)} color={labelFg(l.color)}>{` ${l.name} `}</Text>
    ))

    const issueRow = (i: Issue) => (
      <Box key={i.number} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate-end"><Text bold color="#4EBA65">#{i.number}</Text> <Link href={i.url}>{i.title}</Link></Text>
          </Box>
          {canTake(i) && btn(`take-${i.number}`, 'Tomarlo', () => take($, i))}
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {labels(i)}
          <Text dimColor={i.assignees.length === 0}>{i.assignees.length ? i.assignees.map(a => `@${a}`).join(' ') : 'sin asignar'}</Text>
          {i.subTotal > 0 && <Text dimColor>sub {i.subDone}/{i.subTotal}</Text>}
          {i.prNumber !== undefined ? <Text color="#A371F7">PR #{i.prNumber}</Text> : <Text dimColor>sin PR</Text>}
        </Box>
        {noteLine(`issue-${i.number}`)}
      </Box>
    )

    const checkColor = { ok: '#4EBA65', failed: '#E5534B', running: '#E5B93C', none: '#8A8A8A' } as const
    const prRow = (p: Pr) => (
      <Box key={p.number} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate-end">
              <Text bold color="#A371F7">#{p.number}</Text> <Link href={p.url}>{p.title}</Link>
              {p.isDraft && <Text dimColor> (borrador)</Text>}
            </Text>
          </Box>
          {canMerge(p) && asking !== p.number && btn(`merge-${p.number}`, 'Merge', () => update($, confirm, () => p.number), 'primary')}
          {canRetry(p) && btn(`retry-${p.number}`, 'Reintentar checks', () => retry($, p))}
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text dimColor>{p.head} → {p.base}</Text>
          <Text color={checkColor[p.checks]}>{CHECKS_LABEL[p.checks]}</Text>
          <Text color={p.mergeable === 'CONFLICTING' ? '#E5534B' : p.mergeable === 'MERGEABLE' ? '#4EBA65' : '#8A8A8A'}>{MERGE_LABEL[p.mergeable]}</Text>
        </Box>
        {asking === p.number && (
          <Box flexDirection="row" gap={1}>
            <Text bold>¿Mergear #{p.number}?</Text>
            {btn(`merge-${p.number}`, 'Sí', () => merge($, p), 'primary')}
            <Button key={`no-${p.number}`} label="No" onPress={() => update($, confirm, () => null)} />
          </Box>
        )}
        {noteLine(`pr-${p.number}`)}
      </Box>
    )

    const section = (k: 'issues' | 'prs', head: string, n: number, body: any, emptyText: string) => (
      <Box flexDirection="column" gap={1}>
        <Button key={`sec-${k}`} plain label={`${fold[k] ? '▸' : '▾'} ${head} · ${n}`} onPress={() => toggle(k)} />
        {!fold[k] && (n === 0 ? <Text dimColor>{emptyText}</Text> : body)}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate-end"><Text bold color="#D97757">{name || 'GitHub'}</Text> <Text dimColor>{ago(t, at)}</Text></Text>
          </Box>
          <Button key="refresh" plain label={isRefreshing ? '…' : '↻'} onPress={() => { void refresh($) }} />
        </Box>
        {err !== '' && <Text color="#E5534B" wrap="truncate-end">{err}</Text>}
        {snap === null && err === '' && <Text dimColor>Leyendo GitHub…</Text>}
        {snap !== null && section('issues', 'Issues', snap.issues.length, <Box flexDirection="column" gap={1}>{snap.issues.map(issueRow)}</Box>, 'Sin issues abiertos')}
        {snap !== null && section('prs', 'Pull requests', snap.prs.length, <Box flexDirection="column" gap={1}>{snap.prs.map(prRow)}</Box>, 'Sin PR abiertos')}
      </Box>
    )
  })
}
