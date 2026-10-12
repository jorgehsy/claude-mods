import { test, expect } from 'claude-code/testing'

const band = ($: any) => $.ui.mount({ plugin: 'devtools', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as any })

test('el botón abre la tarjeta y cada acceso corre su comando', async ($, on) => {
  const ran: string[] = []
  on('command.run', async (_$: any, e: any) => { ran.push(e.command); return { text: '' } as any })
  const ui = await band($)
  expect(JSON.stringify(await ui.drawn())).toContain('devtools')
  expect(JSON.stringify(await ui.drawn())).not.toContain('Agentes')

  await ui.press({ key: 'devtools' })
  const open = JSON.stringify(await ui.drawn())
  expect(open).toContain('Agentes')
  expect(open).toContain('GitHub')

  await ui.press({ key: 'github' })
  expect(ran).toEqual(['github-panel'])
  expect(JSON.stringify(await ui.drawn())).not.toContain('Agentes')

  await ui.press({ key: 'devtools' })
  await ui.press({ key: 'agentes' })
  expect(ran).toEqual(['github-panel', 'agent-monitor'])
})

test('la barra muestra contexto, modelo, effort y estilo', async ($, on) => {
  on('session.start', async () => ({ cwd: '/r' }) as any)
  on('settings.read', async () => ({ value: { effortLevel: 'high', outputStyle: 'ELI5' } }) as any)
  on('session.model', async () => ({ value: 'claude-opus-5-5[1m]' }) as any)
  on('session.usage', async () => ({ value: { startedAt: 0, context: { tokens: 184000, window: 1000000, percent: 18 }, rateLimits: [] } }) as any)
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true } as any)
  const ui = await band($)
  const tree = JSON.stringify(await ui.drawn())
  for (const s of ['184k/1M (18%)', 'Opus 5.5', 'high', 'ELI5', '██']) expect(tree).toContain(s)
})
