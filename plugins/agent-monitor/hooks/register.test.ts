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
