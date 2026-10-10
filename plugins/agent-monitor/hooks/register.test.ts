import { test, expect } from 'claude-code/testing'

test('el panel dibuja a Clawd en terminal (Raster) y en escritorio (Svg)', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'agent-monitor', surface, component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns: 40 } as any,
    })
    expect(await ui.find({ type: 'Text', text: /Agentes/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no hay subagentes/ })).toBeDefined()
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.includes(surface === 'terminal' ? '"Raster"' : '"Svg"')).toBe(true)
    await ui.unmount()
  }
})


test('la tarjeta muestra rama, worktree y archivos a la derecha (y debajo si es angosta)', async ($, on) => {
  // El estado sólo existe dentro de los hooks: lo siembra la propia llamada de herramienta.
  on('tool.call', async () => ({ result: 'ok', isReadOnly: true }) as any)
  await $.tool.call({ tool: 'Read', file_path: '/r/app/.claude/worktrees/agent-a1/src/b.ts', agentId: 'a1' } as any)
  for (const bodyColumns of [90, 40]) {
    const ui = await $.ui.mount({
      plugin: 'agent-monitor', surface: 'terminal', component: 'Pane', requestId: 'agent-monitor',
      props: { bodyColumns } as any,
    })
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.includes('agent-a1')).toBe(true)
    expect(tree.includes('src/b.ts')).toBe(true)
    // Ancho: columna a la derecha; angosta: debajo de la descripción, sin ancho fijo.
    expect(tree.includes('"width":')).toBe(bodyColumns >= 70)
    await ui.unmount()
  }
})
