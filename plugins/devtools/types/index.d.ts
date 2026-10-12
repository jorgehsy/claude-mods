/** Si la tarjeta con los accesos está abierta. */
export type IsOpen = boolean

/** Lo que la barra muestra a la izquierda. */
export type Info = {
  /** Modelo del bucle principal, tal como lo nombra el motor (`claude-opus-5-5`). */
  model: string
  /** Effort del último paso del bucle principal; vacío si el modelo no usa. */
  effort: string
  /** Output style elegido; vacío si es el de por defecto. */
  style: string
  /** Tokens de entrada de la última respuesta; 0 antes de la primera. */
  tokens: number
  /** Tamaño de la ventana de contexto del modelo. */
  window: number
}

declare module 'claude-code' {
  interface PluginState {
    devtools: {
      isOpen: IsOpen
      info: Info
    }
  }
}
