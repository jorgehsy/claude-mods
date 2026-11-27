export type Label = { name: string; color: string }

export type Issue = {
  number: number
  title: string
  url: string
  labels: Label[]
  assignees: string[]
  subTotal: number
  subDone: number
  /** Número del PR que lo cierra, si hay uno. */
  prNumber?: number
}

export type Checks = 'ok' | 'failed' | 'running' | 'none'
export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'

export type Pr = {
  number: number
  title: string
  url: string
  isDraft: boolean
  head: string
  base: string
  mergeable: Mergeable
  checks: Checks
}

export type RepoRef = { name: string; dir: string }

export type Snapshot = { issues: Issue[]; prs: Pr[] }

declare module 'claude-code' {
  interface PluginState {
    'github-panel': {
      /** owner/repo del directorio de la sesión; vacío si no se detectó. */
      repo: string
      /** Carpeta donde corre `gh` para el repo elegido; vacío = la de la sesión. */
      dir: string
      /** Repos detectados: la carpeta de la sesión, o si no es un repo, sus carpetas hijas. */
      repos: RepoRef[]
      data: Snapshot | null
      /** Mensaje de una línea cuando no se pudo leer GitHub. */
      error: string
      /** Hora (ms) del último refresco; 0 si no hubo. */
      fetchedAt: number
      /** Hora del panel, al segundo: mueve el «hace N s». */
      now: number
      refreshing: boolean
      collapsed: { issues: boolean; prs: boolean }
      /** Botones con una acción en curso, por clave (`take-12`, `merge-3`, `retry-3`). */
      busy: Record<string, boolean>
      /** PR que espera la confirmación del merge. */
      confirm: number | null
      /** Resultado o error de la última acción de cada fila (`issue-12`, `pr-3`). */
      notes: Record<string, string>
    }
  }
}
