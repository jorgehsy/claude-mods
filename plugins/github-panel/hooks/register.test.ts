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

const TREE = JSON.stringify({ data: { repository: {
  issues: { nodes: [
    { number: 1, title: 'Mapa', url: 'https://x/1', subIssuesSummary: { total: 2, completed: 0 } },
    { number: 5, title: 'Impresoras', url: 'https://x/5', parent: { number: 1 }, blocking: { nodes: [{ number: 9 }] },
      blockedBy: { nodes: [{ number: 3, title: 'Red local', state: 'OPEN' }] } },
    { number: 9, title: 'Cola', url: 'https://x/9', parent: { number: 1 },
      blockedBy: { nodes: [{ number: 5, title: 'Impresoras', state: 'OPEN' }] } },
    { number: 3, title: 'Red local', url: 'https://x/3', blockedBy: { nodes: [{ number: 2, title: 'Cableado', state: 'CLOSED' }] } },
  ] },
  pullRequests: { nodes: [] },
} } })

test('los issues se dibujan en árbol y la cadena de bloqueos baja varios niveles', async ($, on) => {
  on('process.run', async (_$: any, e: any) => ({ value: ok(e.argv.includes('graphql') ? TREE : '{"nameWithOwner":"o/r"}') }) as any)
  on('session.start', async () => ({ cwd: '/r' }) as any)
  on('clock.every', async () => ({ value: () => {} }) as any)
  on('command.register', async () => ({ value: undefined }) as any)
  on('ui.open', async () => ({ value: undefined }) as any)
  on('clock.now', async () => ({ value: 5000 }) as any)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  for (const s of ['bloqueado por', '#5 Impresoras', '#3 Red local', '#2 Cableado', 'bloquea #9']) {
    expect(tree.includes(s)).toBe(true)
  }
  // #9 ← #5 ← #3 ← #2: el orden de dibujo baja por la cadena.
  expect(tree.indexOf('https://x/1') < tree.indexOf('https://x/5')).toBe(true)
  // #9 cuelga de #5, que lo bloquea, en vez de ser su hermano.
  expect(tree.indexOf('https://x/5') < tree.indexOf('https://x/9')).toBe(true)
  await ui.unmount()
})
