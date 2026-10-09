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
}

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': { rows: Record<string, AgentRow>; frame: number; opened: boolean }
  }
}
