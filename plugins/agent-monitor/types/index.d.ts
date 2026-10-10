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
  /** Directorio en que corre, si la llamada que lo lanzó lo fijó. */
  cwd?: string
  /** Nombre del worktree de Claude Code en que trabaja (`.claude/worktrees/<nombre>`). */
  worktree?: string
  /** Raíz de ese worktree, para mostrar las rutas relativas. */
  root?: string
  /** Rama de git de su worktree, su cwd o, en su defecto, la sesión. */
  branch?: string
  /** Los últimos archivos que leyó o escribió, del más viejo al más nuevo. */
  files: { path: string; kind: 'read' | 'write' }[]
  /** Cuándo dejó de trabajar (ms); sin valor mientras trabaja o espera. */
  endedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': { rows: Record<string, AgentRow>; frame: number; opened: boolean; now: number }
  }
}
