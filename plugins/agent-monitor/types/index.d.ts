export type AgentRow = {
  id: string
  type: string
  description: string
  status: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  context: number
  usd: number
  /** Qué fueron sus últimas llamadas ('read' | 'write' | 'other'), de la más vieja a la más nueva. */
  tools: string[]
  /** Cuándo dejó de trabajar (ms); sin valor mientras trabaja o espera. */
  endedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': { rows: Record<string, AgentRow>; frame: number; opened: boolean; now: number }
  }
}
