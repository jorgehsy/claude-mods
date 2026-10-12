/** `claude-opus-5-5[1m]` → `Opus 5.5`; lo que no reconoce lo deja como vino. */
export function modelName(id: string): string {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id)
  if (!m) return id
  const family = m[1][0].toUpperCase() + m[1].slice(1)
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`
}

/** 184000 → `184k`, 1000000 → `1M`. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Barra de `cells` celdas llenas según `percent` (0 a 100). */
export function bar(percent: number, cells = 10): { full: string; empty: string } {
  const n = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
  return { full: '█'.repeat(n), empty: '░'.repeat(cells - n) }
}

/** Color del tema según qué tan llena está la ventana. */
export function level(percent: number): 'success' | 'warning' | 'error' {
  return percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'
}
