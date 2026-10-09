import { test, expect } from 'claude-code/testing'
import { SKINS, svgOf, cellsOf, COLS, ROWS, type Mood } from './skins.ts'

const MOODS: Mood[] = ['work', 'wait', 'sleep', 'dead']

test('cada skin anima cada estado dentro de los límites del motor', async () => {
  for (const skin of Object.values(SKINS)) {
    for (const mood of MOODS) {
      const anim = skin.animate(mood)
      expect(anim.frames.length).toBeGreaterThan(0)
      // El escritorio rechaza un Svg de más de 131072 caracteres.
      expect(svgOf(anim, mood, 104).length).toBeLessThan(131072)
      for (const f of anim.frames) expect(cellsOf(f).length).toBe(COLS * ROWS * 3)
    }
  }
})

test('trabajando, los tres skins se mueven', async () => {
  for (const role of ['research', 'developer', 'auditor'] as const) {
    expect(SKINS[role].animate('work').frames.length).toBeGreaterThan(4)
  }
})
