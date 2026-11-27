import { test, expect } from 'claude-code/testing'

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const SNAP = JSON.stringify({ data: { repository: {
  issues: { nodes: [{ number: 4, title: 'Sin dueño', url: 'https://x/4', labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
    assignees: { nodes: [] }, subIssuesSummary: { total: 2, completed: 1 }, closedByPullRequestsReferences: { nodes: [] } }] },
  pullRequests: { nodes: [{ number: 8, title: 'Listo', url: 'https://x/8', isDraft: false, headRefName: 'feat', baseRefName: 'main',
    mergeable: 'MERGEABLE', commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] } }] },
} } })

async function mount($: any) {
  return $.ui.mount({ plugin: 'github-panel', surface: 'terminal', component: 'Pane', requestId: 'github-panel', props: { bodyColumns: 60 } as any })
}

test('el panel lista issues y PR con sus botones', async ($, on) => {
  on('process.run', async (_$: any, e: any) => ({ value: ok(e.argv.includes('graphql') ? SNAP : '{"nameWithOwner":"o/r"}') }) as any)
  on('session.start', async () => ({ cwd: '/r' }) as any)
  on('session.cwd', async () => ({ value: '/r' }) as any)
  on('clock.every', async () => ({ value: () => {} }) as any)
  on('command.register', async () => ({ value: undefined }) as any)
  on('ui.open', async () => ({ value: undefined }) as any)
  on('clock.now', async () => ({ value: 5000 }) as any)
  await $.session.start({ cwd: "/r", surface: "terminal", isInteractive: true })
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  for (const s of ['Issues', 'Pull requests', 'sin asignar', 'Tomarlo', 'Merge', 'feat', 'https://x/4', 'https://x/8']) {
    expect(tree.includes(s)).toBe(true)
  }
  expect(tree.includes('Reintentar checks')).toBe(false)
  await ui.unmount()
})

test('sin gh o fuera de GitHub muestra una línea de error, no se cae', async ($, on) => {
  on('session.start', async () => ({ cwd: '/r' }) as any)
  on('session.cwd', async () => ({ value: '/r' }) as any)
  on('clock.every', async () => ({ value: () => {} }) as any)
  on('command.register', async () => ({ value: undefined }) as any)
  on('ui.open', async () => ({ value: undefined }) as any)
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: 'none of the git remotes point to a known GitHub host', isStdoutTruncated: false, isStderrTruncated: false } }) as any)
  await $.session.start({ cwd: "/r", surface: "terminal", isInteractive: true })
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /no es un repositorio de GitHub/ })).toBeDefined()
  await ui.unmount()
})

test('Merge pide confirmación y Sí corre gh pr merge --squash --delete-branch', async ($, on) => {
  const calls: string[][] = []
  on('process.run', async (_$: any, e: any) => {
    calls.push(e.argv)
    return { value: ok(e.argv.includes('graphql') ? SNAP : '{"nameWithOwner":"o/r"}') } as any
  })
  on('session.start', async () => ({ cwd: '/r' }) as any)
  on('session.cwd', async () => ({ value: '/r' }) as any)
  on('clock.every', async () => ({ value: () => {} }) as any)
  on('command.register', async () => ({ value: undefined }) as any)
  on('ui.open', async () => ({ value: undefined }) as any)
  on('clock.now', async () => ({ value: 5000 }) as any)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  const ui = await mount($)
  await ui.press({ key: 'merge-8' })
  expect(await ui.find({ type: 'Text', text: /¿Mergear #8\?/ })).toBeDefined()
  expect(calls.some(a => a.includes('merge'))).toBe(false)
  await ui.press({ key: 'merge-8' })
  expect(calls.some(a => a.join(' ').includes('pr merge 8 --squash --delete-branch'))).toBe(true)
  await ui.unmount()
})

test('fuera de un repo detecta los repos hijos y cambia entre ellos', async ($, on) => {
  const calls: { argv: readonly string[]; cwd?: string }[] = []
  const fail = { exitCode: 1, stdout: '', stderr: 'fatal: not a git repository', isStdoutTruncated: false, isStderrTruncated: false }
  const names: Record<string, string> = { web: 'o/api', mobile: 'o/app' }
  on('process.run', async (_$: any, e: any) => {
    const cwd = e.init?.cwd as string | undefined
    calls.push({ argv: e.argv, cwd })
    if (e.argv.includes('graphql')) return { value: ok(SNAP) } as any
    const name = cwd ? names[cwd.split('/').pop()!] : undefined
    return { value: name ? ok(JSON.stringify({ nameWithOwner: name })) : fail } as any
  })
  on('fs.list', async () => ({ value: [
    { name: 'web', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: 'mobile', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: '.claude', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: 'web-worktrees', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    { name: 'notas.md', kind: 'file', size: 1, mtimeMs: 0, isLink: false },
  ] }) as any)
  on('session.start', async () => ({ cwd: '/w' }) as any)
  on('session.cwd', async () => ({ value: '/w' }) as any)
  on('clock.every', async () => ({ value: () => {} }) as any)
  on('command.register', async () => ({ value: undefined }) as any)
  on('ui.open', async () => ({ value: undefined }) as any)
  on('clock.now', async () => ({ value: 5000 }) as any)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.includes('o/api')).toBe(true)
  expect(tree.includes('o/app')).toBe(true)
  expect(calls.some(c => c.cwd?.endsWith('web-worktrees'))).toBe(false)
  const gql = (n: string) => calls.filter(c => c.argv.includes('graphql') && c.argv.includes(`name=${n}`))
  expect(gql('api').length > 0).toBe(true)
  await ui.press({ key: 'repo-o/app' })
  const last = gql('app').pop()
  // Absoluta: la sesión puede cambiar de carpeta después de detectar.
  expect(last?.cwd).toBe('/w/mobile')
  await ui.unmount()
})

