// Quién es cada agente y qué está haciendo. Lógica pura, sin motor: se prueba suelta.
//
//   skin     → por su TIPO (quién es); no cambia mientras trabaja.
//   actividad → por sus últimas llamadas (qué hace ahora); es la etiqueta de la tarjeta.

import type { Role } from './skins.ts'

export const AUDIT = /review|audit|security|seguridad|vuln|qa\b|checker|reviewer|revis|auditor|evidence/i
const RESEARCH = /explore|plan|research|buscador|lector/i
const DEVELOPER = /develop|engineer|builder|constructor|coder|frontend|backend|prototyper|architect/i

const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])
const READS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch'])
export const RECENT = 6
export const MAX_FILES = 5

export type Kind = 'read' | 'write' | 'other'
export type FileKind = 'read' | 'write'
export type FileRef = { path: string; kind: FileKind }

/**
 * Qué fue una llamada. El motor marca `isReadOnly` con el mismo chequeo de sus
 * permisos: un `ls` o un `git diff` por Bash es lectura, un `pnpm build` no.
 */
export function kindOf(tool: string, isReadOnly: boolean | undefined): Kind {
  if (isReadOnly || READS.has(tool) || tool.startsWith('mcp__')) return 'read'
  if (WRITES.has(tool)) return 'write'
  return 'other'
}

/** El skin dice QUIÉN es: sólo mira el tipo (y la tarea, para el auditor). */
export function skinOf(type: string, description = ''): Role {
  if (AUDIT.test(`${type} ${description}`)) return 'auditor'
  if (RESEARCH.test(type)) return 'research'
  if (DEVELOPER.test(type)) return 'developer'
  return 'general'
}

/**
 * Qué hace ahora, de sus últimas llamadas: más escrituras que lecturas es
 * programar, si no investigar. Sin ninguna de las dos todavía, `null`. Un
 * auditor siempre audita.
 */
export function activityOf(tools: string[] | undefined, type = '', description = ''): Role | null {
  if (AUDIT.test(`${type} ${description}`)) return 'auditor'
  const kinds = (tools ?? []).filter(t => t === 'read' || t === 'write')
  if (kinds.length === 0) return null
  const writes = kinds.filter(t => t === 'write').length
  return writes > kinds.length - writes ? 'developer' : 'research'
}

// ── Dónde trabaja y qué toca ─────────────────────────────────────────────────
const WORKTREE = /^(.*\/\.claude\/worktrees\/([^/]+))(?:\/|$)/

/** Un worktree de Claude Code por la ruta que toca: nombre y raíz. */
export function worktreeOf(path: string | undefined): { name: string; root: string } | null {
  const m = path ? WORKTREE.exec(path) : null
  return m ? { name: m[2]!, root: m[1]! } : null
}

const baseName = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p

/** La ruta relativa al primer directorio que la contiene; si ninguno, sólo el nombre. */
export function relPath(path: string, bases: Array<string | undefined>): string {
  for (const b of bases) {
    if (!b) continue
    const dir = b.replace(/\/+$/, '')
    if (path.startsWith(`${dir}/`)) return path.slice(dir.length + 1)
  }
  return baseName(path)
}

/** El archivo que toca una herramienta, con qué intención; `null` si ninguno. */
export function fileOf(tool: string, input: Record<string, unknown>): FileRef | null {
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  if (tool === 'Grep' || tool === 'Glob') {
    const p = str(input.path)
    return p ? { path: p, kind: 'read' } : null
  }
  const p = str(input.file_path) ?? str(input.notebook_path)
  if (!p) return null
  return { path: p, kind: tool === 'Read' ? 'read' : tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit' ? 'write' : 'read' }
}

/**
 * Anota un archivo: de más viejo a más nuevo, sin repetidos y con los últimos
 * `MAX_FILES`. Una vez escrito, sigue marcado como escrito aunque se relea.
 */
export function addFile(files: FileRef[] | undefined, ref: FileRef): FileRef[] {
  const old = files ?? []
  const prev = old.find(f => f.path === ref.path)
  const kind: FileKind = prev?.kind === 'write' ? 'write' : ref.kind
  return [...old.filter(f => f.path !== ref.path), { path: ref.path, kind }].slice(-MAX_FILES)
}
