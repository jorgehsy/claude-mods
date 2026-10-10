import type { Checks, Issue, Mergeable, Pr, Snapshot } from '../types'

/** La consulta: una sola llamada trae issues y PR. */
export const QUERY = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
issues(states:OPEN,first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title url labels(first:10){nodes{name color}} assignees(first:5){nodes{login}} subIssuesSummary{total completed} closedByPullRequestsReferences(first:3){nodes{number url}}}}
pullRequests(states:OPEN,first:30,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title url isDraft headRefName baseRefName mergeable commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}`

type Nodes<T> = { nodes?: (T | null)[] | null } | null | undefined
const list = <T>(c: Nodes<T>): T[] => (c?.nodes ?? []).filter((x): x is T => x != null)

/** «owner/repo» de la salida de `gh repo view --json nameWithOwner`; null si no es válida. */
export function parseRepo(stdout: string): string | null {
  try {
    const v = (JSON.parse(stdout) as { nameWithOwner?: unknown }).nameWithOwner
    return typeof v === 'string' && /^[^/\s]+\/[^/\s]+$/.test(v) ? v : null
  } catch {
    return null
  }
}

/** Una línea legible del error de `gh`, con las causas comunes en español. */
export function ghError(stderr: string, fallback = 'No se pudo leer GitHub'): string {
  const s = stderr.trim()
  if (/not found|command not found|ENOENT|no such file/i.test(s) && /gh/i.test(s)) return 'No se encontró la CLI gh'
  if (/not logged|gh auth login|authentication/i.test(s)) return 'gh no tiene sesión: corre gh auth login'
  if (/not a git repository|no git remotes|none of the git remotes|could not determine/i.test(s)) {
    return 'Este directorio no es un repositorio de GitHub'
  }
  const first = s.split('\n').find(l => l.trim() !== '')
  return first ? first.trim().slice(0, 140) : fallback
}

export function checksOf(state: string | null | undefined): Checks {
  switch (state) {
    case 'SUCCESS': return 'ok'
    case 'FAILURE': case 'ERROR': return 'failed'
    case 'PENDING': case 'EXPECTED': return 'running'
    default: return 'none'
  }
}

const mergeableOf = (m: unknown): Mergeable => (m === 'MERGEABLE' || m === 'CONFLICTING' ? m : 'UNKNOWN')

type RawIssue = {
  number: number; title: string; url: string
  labels?: Nodes<{ name: string; color: string }>
  assignees?: Nodes<{ login: string }>
  subIssuesSummary?: { total?: number; completed?: number } | null
  closedByPullRequestsReferences?: Nodes<{ number: number }>
}
type RawPr = {
  number: number; title: string; url: string; isDraft?: boolean
  headRefName: string; baseRefName: string; mergeable?: string
  commits?: Nodes<{ commit?: { statusCheckRollup?: { state?: string } | null } | null }>
}

/** Pasa la respuesta de `gh api graphql` al modelo del panel; lanza si trae errores o no es el JSON esperado. */
export function parseGraphql(stdout: string): Snapshot {
  const root = JSON.parse(stdout) as {
    data?: { repository?: { issues?: Nodes<RawIssue>; pullRequests?: Nodes<RawPr> } | null }
    errors?: { message?: string }[]
  }
  const repo = root.data?.repository
  if (!repo) throw new Error(root.errors?.[0]?.message ?? 'Respuesta sin repositorio')
  const issues: Issue[] = list(repo.issues).map(i => ({
    number: i.number,
    title: i.title,
    url: i.url,
    labels: list(i.labels).map(l => ({ name: l.name, color: l.color })),
    assignees: list(i.assignees).map(a => a.login),
    subTotal: i.subIssuesSummary?.total ?? 0,
    subDone: i.subIssuesSummary?.completed ?? 0,
    prNumber: list(i.closedByPullRequestsReferences)[0]?.number,
  }))
  const prs: Pr[] = list(repo.pullRequests).map(p => ({
    number: p.number,
    title: p.title,
    url: p.url,
    isDraft: p.isDraft === true,
    head: p.headRefName,
    base: p.baseRefName,
    mergeable: mergeableOf(p.mergeable),
    checks: checksOf(list(p.commits)[0]?.commit?.statusCheckRollup?.state),
  }))
  return { issues, prs }
}

// ── Reglas de los botones ────────────────────────────────────────────────────
export const canTake = (i: Issue) => i.assignees.length === 0

/** Merge sólo si es mergeable, no es borrador y los checks no fallaron. */
export const canMerge = (p: Pr) => p.mergeable === 'MERGEABLE' && !p.isDraft && p.checks !== 'failed'

export const canRetry = (p: Pr) => p.checks === 'failed'

// ── Textos ───────────────────────────────────────────────────────────────────

/** «hace 5 s», «hace 2 min»; «—» si nunca se leyó. */
export function ago(now: number, at: number): string {
  if (!at) return '—'
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`
}

/** Negro o blanco, el que se lea sobre el color de la etiqueta (hex sin #). */
export function labelFg(hex: string): string {
  const h = /^[0-9a-f]{6}$/i.test(hex) ? hex : '888888'
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? '#000000' : '#FFFFFF'
}

export const labelBg = (hex: string) => (/^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : '#888888')

// ── Dibujo: piezas puras ─────────────────────────────────────────────────────
export const C = {
  ok: '#6cc483', bad: '#e5675f', warn: '#d9a54a', muted: '#7d7b73', accent: '#d97757',
  border: '#3a3936', borderHover: '#6b6a65', borderBad: '#5a3533', pill: '#2a2a28',
} as const

/** Barra de sub-issues: hasta 10 celdas, `▰` hechas y `▱` por hacer. */
export function progressBar(done: number, total: number): { filled: string; empty: string; label: string } {
  if (!(total > 0)) return { filled: '', empty: '', label: '' }
  const d = Math.min(Math.max(done, 0), total)
  const cells = Math.min(total, 10)
  const f = Math.round((d / total) * cells)
  return { filled: '▰'.repeat(f), empty: '▱'.repeat(cells - f), label: `${d}/${total}` }
}

export type Status = { glyph: string; text: string; color?: string; dim?: boolean }

export function checkStatus(c: Checks): Status {
  switch (c) {
    case 'ok': return { glyph: '✓', text: 'checks', color: C.ok }
    case 'failed': return { glyph: '✗', text: 'checks fallaron', color: C.bad }
    case 'running': return { glyph: '◌', text: 'checks corriendo', color: C.warn }
    default: return { glyph: '', text: 'sin checks', dim: true }
  }
}

export function mergeStatus(m: Mergeable): Status {
  switch (m) {
    case 'MERGEABLE': return { glyph: '✓', text: 'mergeable', color: C.ok }
    case 'CONFLICTING': return { glyph: '⚠', text: 'conflictos', color: C.warn }
    default: return { glyph: '', text: 'calculando', dim: true }
  }
}

/** La tarjeta de un PR se pinta rojiza si fallaron los checks o hay conflictos. */
export const prIsBad = (p: Pr) => p.checks === 'failed' || p.mergeable === 'CONFLICTING'
