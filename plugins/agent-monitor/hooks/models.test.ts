import { test, expect } from 'claude-code/testing'
import { modelInfo, costOf } from './models.ts'

test('ventana de contexto por modelo', async () => {
  expect(modelInfo('claude-sonnet-5-5').window).toBe(1_000_000)
  expect(modelInfo('claude-opus-5-5').window).toBe(1_000_000)
  expect(modelInfo('claude-fable-5-1').window).toBe(1_000_000)
  expect(modelInfo('claude-haiku-5-5').window).toBe(1_000_000)
  expect(modelInfo('claude-haiku-4-5-20251001').window).toBe(200_000)
  expect(modelInfo('claude-sonnet-4-5[1m]').window).toBe(1_000_000)
})

test('el prefijo más específico gana', async () => {
  expect(modelInfo('claude-opus-5-5').price[0]).toBe(4)
  expect(modelInfo('claude-opus-5').price[0]).toBe(5)
  expect(modelInfo('claude-fable-5-1').price[2]).toBe(0.25)
})

test('costo: un millón de entrada y uno de salida en Sonnet 5.5 son 12 USD', async () => {
  expect(costOf('claude-sonnet-5-5', { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(12)
})

test('Haiku 5.5 cobra 5× pasados 100k de prompt', async () => {
  const chico = costOf('claude-haiku-5-5', { input: 100_000, output: 0, cacheRead: 0, cacheWrite: 0 })
  const grande = costOf('claude-haiku-5-5', { input: 200_000, output: 0, cacheRead: 0, cacheWrite: 0 })
  const cent = (x: number) => Math.round(x * 1e6)
  expect(cent(chico)).toBe(cent(0.01))
  expect(cent(grande)).toBe(cent(0.1))
})
