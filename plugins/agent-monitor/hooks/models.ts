// Ventana de contexto y precio de lista por modelo (API de Anthropic, USD por
// millón de tokens). Fuente: tabla de modelos de la referencia de la API al
// 2026-10-06. Bedrock y Vertex cobran aparte: el costo del panel es estimado.
//
// Se busca por prefijo del id, de lo más específico a lo más general.

export type ModelInfo = {
  /** Tokens de entrada que caben. */
  window: number
  /** [entrada, salida, lectura de caché, escritura de caché] */
  price: [number, number, number, number]
}

const M = 1_000_000
const K200 = 200_000
// Escritura de caché a 1,25× la entrada (TTL de 5 minutos).
const p = (inp: number, out: number, read: number): ModelInfo['price'] => [inp, out, read, inp * 1.25]

const TABLE: Array<[string, ModelInfo]> = [
  ['fable-5-1', { window: M, price: p(10, 50, 0.25) }],
  ['mythos-5-1', { window: M, price: p(10, 50, 0.25) }],
  ['fable-5', { window: M, price: p(10, 50, 1) }],
  ['mythos-5', { window: M, price: p(10, 50, 1) }],
  ['opus-5-5', { window: M, price: p(4, 20, 0.2) }],
  ['opus-5', { window: M, price: p(5, 25, 0.5) }],
  ['opus-4-8', { window: M, price: p(5, 25, 0.5) }],
  ['opus-4-7', { window: M, price: p(5, 25, 0.5) }],
  ['opus-4-6', { window: M, price: p(5, 25, 0.5) }],
  ['opus-4-5', { window: K200, price: p(5, 25, 0.5) }],
  ['opus', { window: K200, price: p(15, 75, 1.5) }],
  ['sonnet-5-5', { window: M, price: p(2, 10, 0.2) }],
  ['sonnet-5', { window: M, price: p(2, 10, 0.2) }],
  ['sonnet-4-6', { window: M, price: p(3, 15, 0.3) }],
  ['sonnet', { window: K200, price: p(3, 15, 0.3) }],
  ['haiku-5-5', { window: M, price: p(0.1, 0.5, 0.01) }],
  ['haiku-4-5', { window: K200, price: p(1, 5, 0.1) }],
  ['haiku', { window: K200, price: p(1, 5, 0.1) }],
]

const UNKNOWN: ModelInfo = { window: K200, price: p(3, 15, 0.3) }

export function modelInfo(model: string): ModelInfo {
  const id = model.toLowerCase()
  const hit = TABLE.find(([key]) => id.includes(key))?.[1] ?? UNKNOWN
  // Un sufijo [1m] fuerza la ventana de un millón.
  return /\[1m\]/.test(id) ? { ...hit, window: M } : hit
}

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

/** Costo en USD de un paso. Haiku 5.5 cobra 5× por encima de 100k tokens de prompt. */
export function costOf(model: string, u: Usage): number {
  let [inp, out, read, write] = modelInfo(model).price
  const prompt = u.input + u.cacheRead + u.cacheWrite
  if (/haiku-5-5/i.test(model) && prompt > 100_000) {
    inp *= 5; out *= 5; read *= 5; write *= 5
  }
  return (u.input * inp + u.output * out + u.cacheRead * read + u.cacheWrite * write) / M
}

// ── Nivel de costo: cuánto destaca el modelo en el panel ────────────────────
export type Tier = 'low' | 'mid' | 'high' | 'top'

export function tierOf(model: string): Tier {
  const id = model.toLowerCase()
  if (/fable|mythos/.test(id)) return 'top'
  if (/opus/.test(id)) return 'high'
  if (/haiku/.test(id)) return 'low'
  return 'mid'
}

/** Cómo se escribe el modelo: Haiku apagado, Sonnet normal, Opus violeta, Fable dorado. */
export const TIER_STYLE: Record<Tier, { mark: string; color?: string; bold: boolean; dim: boolean }> = {
  low: { mark: '', dim: true, bold: false },
  mid: { mark: '● ', color: '#6B8AFD', dim: false, bold: false },
  high: { mark: '◆ ', color: '#A78BFA', dim: false, bold: true },
  top: { mark: '✦ ', color: '#F2C14E', dim: false, bold: true },
}
