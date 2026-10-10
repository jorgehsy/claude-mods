import { test, expect } from 'claude-code/testing'
import { skinOf, activityOf, worktreeOf, relPath, fileOf, addFile, kindOf } from './roles.ts'

test('el skin sale del tipo, no de lo que lee o escribe', async () => {
  expect(skinOf('Explore', '')).toBe('research')
  expect(skinOf('Plan', '')).toBe('research')
  expect(skinOf('general-purpose', 'Busca dónde se usa X')).toBe('general')
  expect(skinOf('claude', '')).toBe('general')
  expect(skinOf('?', '')).toBe('general')
  expect(skinOf('Frontend Developer', '')).toBe('developer')
  expect(skinOf('Software Architect', '')).toBe('developer')
  expect(skinOf('Code Reviewer', '')).toBe('auditor')
  expect(skinOf('general-purpose', 'Audita la seguridad del login')).toBe('auditor')
  expect(skinOf('Security Engineer', '')).toBe('auditor')
  expect(skinOf('Evidence Collector', '')).toBe('auditor')
  expect(skinOf('Reality Checker', '')).toBe('auditor')
})

test('el auditor no se dispara por palabras que sólo contienen review o revis', async () => {
  expect(skinOf('general-purpose', 'Revisa y corrige el build')).not.toBe('auditor')
  expect(skinOf('Frontend Developer', 'Arregla el preview del dashboard')).toBe('developer')
  expect(activityOf(['write', 'write'], 'general-purpose', 'Revisa y corrige el build')).toBe('developer')
})

test('la actividad sale de las últimas llamadas', async () => {
  expect(activityOf([])).toBeNull()
  expect(activityOf(['other', 'other'])).toBeNull()
  expect(activityOf(['read', 'read', 'write'])).toBe('research')
  expect(activityOf(['read', 'write', 'write'])).toBe('developer')
  expect(activityOf(['write', 'read'])).toBe('research')
  // Un auditor siempre audita, haga lo que haga.
  expect(activityOf(['write', 'write'], 'Code Reviewer')).toBe('auditor')
  expect(activityOf([], 'Code Reviewer')).toBe('auditor')
})

test('kindOf distingue lectura, escritura y el resto', async () => {
  expect(kindOf('Read', undefined)).toBe('read')
  expect(kindOf('Bash', true)).toBe('read')
  expect(kindOf('Bash', false)).toBe('write')
  expect(kindOf('Edit', undefined)).toBe('write')
  expect(kindOf('TodoWrite', undefined)).toBe('other')
  expect(kindOf('mcp__x__get_message', undefined)).toBe('read')
  expect(kindOf('mcp__x__send_message', undefined)).toBe('write')
  expect(kindOf('mcp__x__send_message', true)).toBe('read')
  expect(kindOf('mcp__x__foo', undefined)).toBe('other')
})

test('detecta el worktree por la ruta', async () => {
  expect(worktreeOf('/r/app/.claude/worktrees/agent-a1b2/src/x.ts')).toEqual({ name: 'agent-a1b2', root: '/r/app/.claude/worktrees/agent-a1b2' })
  expect(worktreeOf('/r/app/.claude/worktrees/agent-a1b2')).toEqual({ name: 'agent-a1b2', root: '/r/app/.claude/worktrees/agent-a1b2' })
  expect(worktreeOf('/r/app/src/x.ts')).toBeNull()
  expect(worktreeOf(undefined)).toBeNull()
})

test('rutas relativas a la raíz, al cwd o a la sesión; si no, el nombre', async () => {
  const wt = '/r/app/.claude/worktrees/w1'
  expect(relPath(`${wt}/src/a.ts`, [wt, '/r/app'])).toBe('src/a.ts')
  expect(relPath('/r/app/src/b.ts', [undefined, '/r/app/'])).toBe('src/b.ts')
  expect(relPath('/otro/lugar/c.ts', [wt, '/r/app'])).toBe('c.ts')
  expect(relPath('/r/appx/d.ts', ['/r/app'])).toBe('d.ts')
})

test('el archivo que toca cada herramienta', async () => {
  expect(fileOf('Read', { file_path: '/a/b.ts' })).toEqual({ path: '/a/b.ts', kind: 'read' })
  expect(fileOf('Edit', { file_path: '/a/b.ts' })).toEqual({ path: '/a/b.ts', kind: 'write' })
  expect(fileOf('MultiEdit', { file_path: '/a/b.ts' })).toEqual({ path: '/a/b.ts', kind: 'write' })
  expect(fileOf('NotebookEdit', { notebook_path: '/a/n.ipynb' })).toEqual({ path: '/a/n.ipynb', kind: 'write' })
  expect(fileOf('Grep', { path: '/a/src', pattern: 'x' })).toEqual({ path: '/a/src', kind: 'read' })
  expect(fileOf('Glob', { pattern: '*.ts' })).toBeNull()
  expect(fileOf('Bash', { command: 'ls' })).toBeNull()
})

test('los últimos 5 archivos distintos, sin repetir', async () => {
  let files = addFile(undefined, { path: '/a/1', kind: 'read' })
  for (const n of [2, 3, 4, 5, 6]) files = addFile(files, { path: `/a/${n}`, kind: 'read' })
  expect(files.map(f => f.path)).toEqual(['/a/2', '/a/3', '/a/4', '/a/5', '/a/6'])
  files = addFile(files, { path: '/a/3', kind: 'write' })
  expect(files.map(f => f.path)).toEqual(['/a/2', '/a/4', '/a/5', '/a/6', '/a/3'])
  files = addFile(files, { path: '/a/3', kind: 'read' })
  expect(files.at(-1)).toEqual({ path: '/a/3', kind: 'write' })
})
