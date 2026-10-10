import { test, expect } from 'claude-code/testing'
import { SKINS, svgOf, cellsOf, withTier, COLS, ROWS, type Mood } from './skins.ts'

const MOODS: Mood[] = ['work', 'wait', 'sleep', 'dead']
const FPS_OK = [1, 2, 4, 8]

test('cada skin anima cada estado dentro de los límites del motor', async () => {
  for (const skin of Object.values(SKINS)) {
    for (const mood of MOODS) {
      const anim = skin.animate(mood)
      expect(anim.frames.length).toBeGreaterThan(0)
      // El escritorio rechaza un Svg de más de 131072 caracteres.
      expect(svgOf(anim, mood, 104).length).toBeLessThan(131072)
      expect(svgOf(anim, mood, 104, 123_456).length).toBeLessThan(131072)
      for (const f of anim.frames) expect(cellsOf(f).length).toBe(COLS * ROWS * 3)
    }
  }
})

test('trabajando, los cuatro skins se mueven', async () => {
  for (const role of ['research', 'developer', 'auditor', 'general'] as const) {
    expect(SKINS[role].animate('work').frames.length).toBeGreaterThanOrEqual(2)
    expect(SKINS[role].animate('work').frames.length).toBeGreaterThan(4)
  }
})

test('los fps son 8, 4, 2 o 1, también con el nivel del modelo', async () => {
  for (const skin of Object.values(SKINS)) {
    for (const mood of MOODS) {
      const anim = skin.animate(mood)
      expect(FPS_OK).toContain(anim.fps)
      for (const tier of ['low', 'mid', 'high', 'top'] as const) {
        for (const surface of ['term', 'svg'] as const) {
          expect(FPS_OK).toContain(withTier(anim, tier, mood, surface).fps)
        }
      }
    }
  }
})

test('con phaseMs cada animación lleva begin negativo y el ciclo empalma', async () => {
  for (const skin of Object.values(SKINS)) {
    for (const mood of MOODS) {
      const anim = skin.animate(mood)
      const svg = svgOf(anim, mood, 104, 1234)
      const animates = svg.match(/<animate(Transform)? [^>]*>/g) ?? []
      for (const a of animates) expect(a.includes('begin="-')).toBe(true)
      // Sin fase, no hay begin.
      expect(svgOf(anim, mood, 104).includes('begin=')).toBe(false)
    }
  }
  // Mismo ciclo, otra hora: el desfase es el resto de la duración.
  const anim = SKINS.general.animate('work')
  const a = svgOf(anim, 'work', 104, 0)
  const b = svgOf(anim, 'work', 104, 1000)
  expect(a.includes('begin="-0.000s"')).toBe(true)
  expect(b.includes('begin="-0.000s"')).toBe(true) // 8 cuadros a 8 fps = 1 s
})

test('el cuadro final empalma con el primero (sin extremos repetidos)', async () => {
  for (const role of ['research', 'developer', 'auditor', 'general', 'base'] as const) {
    const { frames } = SKINS[role].animate('work')
    for (let i = 0; i < frames.length; i++) {
      // Dos cuadros seguidos idénticos serían un tartamudeo.
      expect(JSON.stringify(frames[i])).not.toBe(JSON.stringify(frames[(i + 1) % frames.length]))
    }
  }
})
