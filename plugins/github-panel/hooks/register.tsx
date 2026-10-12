import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Issue, Pr, Snapshot } from '../types'
import {
  QUERY, parseRepo, parseGraphql, ghError, canTake, canMerge, canRetry,
  C, progressBar, checkStatus, mergeStatus, prIsBad, ago, labelFg, labelBg,
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
    // Abre en cuanto arranca la sesión; detectar el repo y el primer fetch no lo frenan.
    void (async () => {
      try {
        await $.ui.open({ id: PANE, title: title('') })
        const name = await detectRepo($)
        if (name) await $.ui.open({ id: PANE, title: title(name) })
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
      return m ? <Text color={m.startsWith('Error') ? C.bad : C.ok} wrap="truncate-end">{m}</Text> : null
    }
    const btn = (key: string, label: string, onPress: () => void, variant?: 'primary') => (
      <Button key={key} label={working[key] ? '…' : label} variant={variant} onPress={() => { if (!working[key]) onPress() }} />
    )

    const labels = (i: Issue) => i.labels.map(l => (
      <Text key={l.name} backgroundColor={labelBg(l.color)} color={labelFg(l.color)}>{` ${l.name} `}</Text>
    ))

    // Terminal: botones siempre a la vista. Otras superficies: se revelan al pasar el puntero,
    // salvo que haya confirmación, trabajo en curso o un mensaje en esa tarjeta.
    const onTerminal = e.surface === 'terminal'
    const actions = (id: string, pinned: boolean, kids: any[]) => {
      const shown = kids.filter(Boolean)
      if (shown.length === 0) return null
      const always = onTerminal || pinned
      return (
        <Box flexDirection="row" gap={1} alignSelf="center" display={always ? 'flex' : 'none'} hover={always ? undefined : { display: 'flex' }}>
          {shown}
        </Box>
      )
    }
    const card = (id: string, bad: boolean, kids: any) => (
      <Box
        key={id} flexDirection="row" gap={1} paddingX={1} marginBottom={1}
        borderStyle="round" borderColor={bad ? C.borderBad : C.border}
        hover={{ borderColor: bad ? C.bad : C.borderHover }}
      >
        {kids}
      </Box>
    )
    const status = (s: { glyph: string; text: string; color?: string; dim?: boolean }) => (
      <Text color={s.color} dimColor={s.dim}>{s.glyph ? `${s.glyph} ${s.text}` : s.text}</Text>
    )

    const issueRow = (i: Issue) => {
      const bar = progressBar(i.subDone, i.subTotal)
      const pinned = working[`take-${i.number}`] === true || !!msgs[`issue-${i.number}`]
      return card(`issue-${i.number}`, false, [
        <Box key="main" flexDirection="column" flexGrow={1}>
          <Text wrap="truncate-end"><Text color={C.muted}>#{i.number}</Text> <Link href={i.url}>{i.title}</Link></Text>
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            {i.labels.length > 0 && <Box flexDirection="row" gap={1}>{labels(i)}</Box>}
            {i.assignees.length ? <Text>● {i.assignees.map(a => `@${a}`).join(' ')}</Text> : <Text dimColor>○ sin asignar</Text>}
            {bar.label !== '' && <Text><Text color={C.ok}>{bar.filled}</Text><Text dimColor>{bar.empty}</Text> {bar.label}</Text>}
            {i.prNumber !== undefined ? <Text>⇄ #{i.prNumber}</Text> : <Text dimColor>sin PR</Text>}
          </Box>
          {noteLine(`issue-${i.number}`)}
        </Box>,
        actions(`issue-${i.number}`, pinned, [canTake(i) && btn(`take-${i.number}`, 'Tomarlo', () => take($, i))]),
      ])
    }

    const prRow = (p: Pr) => {
      const asked = asking === p.number
      const pinned = asked || working[`merge-${p.number}`] === true || working[`retry-${p.number}`] === true || !!msgs[`pr-${p.number}`]
      return card(`pr-${p.number}`, prIsBad(p), [
        <Box key="main" flexDirection="column" flexGrow={1}>
          <Text wrap="truncate-end">
            <Text color={C.muted}>#{p.number}</Text> <Link href={p.url}>{p.title}</Link>
            {p.isDraft && <Text dimColor> borrador</Text>}
          </Text>
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            <Text dimColor>{p.head} → {p.base}</Text>
            {status(checkStatus(p.checks))}
            {status(mergeStatus(p.mergeable))}
          </Box>
          {asked && (
            <Box flexDirection="row" gap={1}>
              <Text bold>¿Mergear #{p.number}?</Text>
              {btn(`merge-${p.number}`, 'Sí', () => merge($, p), 'primary')}
              <Button key={`no-${p.number}`} label="No" onPress={() => update($, confirm, () => null)} />
            </Box>
          )}
          {noteLine(`pr-${p.number}`)}
        </Box>,
        actions(`pr-${p.number}`, pinned, [
          canMerge(p) && !asked && btn(`merge-${p.number}`, 'Merge', () => update($, confirm, () => p.number), 'primary'),
          canRetry(p) && btn(`retry-${p.number}`, 'Reintentar', () => retry($, p)),
        ]),
      ])
    }

    const section = (k: 'issues' | 'prs', head: string, n: number, body: any, emptyText: string) => (
      <Box flexDirection="column">
        <Button key={`sec-${k}`} plain onPress={() => toggle(k)}>
          {`${fold[k] ? '▸' : '▾'} ${head} `}<Text backgroundColor={C.pill}>{` ${n} `}</Text>
        </Button>
        {!fold[k] && (n === 0 ? <Text dimColor>{emptyText}</Text> : body)}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Box flexGrow={1}>
            <Text wrap="truncate-end"><Text bold color={C.accent}>{name || 'GitHub'}</Text> <Text dimColor>· {ago(t, at)}</Text></Text>
          </Box>
          <Button key="refresh" plain label={isRefreshing ? '…' : '↻'} onPress={() => { void refresh($) }} />
        </Box>
        {err !== '' && <Text color={C.bad} wrap="truncate-end">{err}</Text>}
        {snap === null && err === '' && <Text dimColor>Leyendo GitHub…</Text>}
        {snap !== null && section('issues', 'Issues', snap.issues.length, <Box flexDirection="column">{snap.issues.map(issueRow)}</Box>, 'Sin issues abiertos')}
        {snap !== null && section('prs', 'Pull requests', snap.prs.length, <Box flexDirection="column">{snap.prs.map(prRow)}</Box>, 'Sin PR abiertos')}
      </Box>
    )
  })
}
