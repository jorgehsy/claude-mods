# agent-monitor

Panel en vivo para Claude Code que muestra tus subagentes. Cada uno es un Clawd, la mascota de Claude Code:

```
 ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
```

Cada tarjeta muestra:

- **Estado**: trabajando (Clawd camina), espera tu respuesta (parpadea y muestra un `!`), terminó (duerme) o falló (gris).
- **Modelo**: por ejemplo «Sonnet 5.5».
- **Tokens y costo estimado** en US$.
- **Barra de contexto**: verde, amarilla o roja según lo lleno que esté.

El accesorio de Clawd depende del tipo de agente: gorra (desarrollo), boina (diseño), antena (exploración), visera (revisión) o nada (general).

Funciona en la **terminal** y en la **app de escritorio** (pestaña Code).

## Instalar

```bash
claude plugin marketplace add jorgehsy/claude-mods
claude plugin install agent-monitor@jorge-mods --scope user
```

Desde ahí carga en todas tus sesiones, en la terminal y en la app de escritorio.

## Usar

- **Terminal**: escribe `/agent-monitor`. Con una ventana de 144 columnas o más, el panel se abre solo con el primer subagente.
- **App de escritorio**: el panel se abre solo cuando arranca el primer subagente.

## Actualizar

```bash
claude plugin marketplace update jorge-mods
claude plugin update agent-monitor@jorge-mods
```

Después escribe `/reload-plugins` en la sesión abierta.

## Notas

- Los costos son estimados con precios de lista por modelo; no son tu factura.
- La ventana de contexto se asume de 200k tokens (1M si el modelo lleva `[1m]`).

## Licencia

MIT. Ver [LICENSE](../../LICENSE).
