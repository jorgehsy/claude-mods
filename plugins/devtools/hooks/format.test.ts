import { test, expect } from 'claude-code/testing'
import { bar, compact, level, modelName } from './format.ts'

test('formatos de la barra', () => {
  expect(modelName('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(modelName('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(modelName('opus')).toBe('opus')
  expect(compact(200000)).toBe('200k')
  expect(compact(1500000)).toBe('1.5M')
  expect(bar(50)).toEqual({ full: '█████', empty: '░░░░░' })
  expect(level(90)).toBe('error')
  expect(level(10)).toBe('success')
})
