# agent-monitor

Panel en vivo para Claude Code que muestra tus subagentes. Cada uno es un Clawd, la mascota de Claude Code:

```
 ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝
```

Cada tarjeta muestra:

- **Estado**: trabajando, espera tu respuesta (`!` que titila), terminó (duerme, con una `z`) o falló (gris). Un agente que terminó se oculta si en 30 segundos no recibe otra instrucción; la tarjeta muestra la cuenta regresiva.
- **Modelo**: por ejemplo «Sonnet 5.5».
- **Tokens y costo estimado** en US$.
- **Barra de contexto**: verde, amarilla o roja según lo lleno que esté.

## Skins

El skin de Clawd cambia en vivo según lo que hace el agente:

| Skin | Cuándo | Animación |
| --- | --- | --- |
| **research** · investigando | Sus últimas herramientas son sobre todo de búsqueda o lectura (`Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`) | Explorador que marcha con una bandera que flamea; al terminar, la bandera cae |
| **developer** · programando | Sus últimas herramientas son sobre todo de escritura (`Edit`, `Write`) o comandos (`Bash`) | Audífonos y laptop: teclea con un brazo y luego con el otro, y el código corre en pantalla |
| **auditor** · auditando | Su tipo o su tarea habla de revisar, auditar, seguridad o QA | Gafas con un barrido rojo y un portapapeles que se va marcando |
| **base** | Antes de su primera herramienta | Camina y parpadea |

## Modelos

Cuanto más caro el modelo, más destaca, sin tocar el borde de la tarjeta (que es del estado):

| Modelo | Etiqueta | Clawd |
| --- | --- | --- |
| Haiku | gris tenue | normal |
| Sonnet | `● Sonnet` con punto azul | normal |
| Opus | `◆ Opus` violeta en negrita | dos chispas que titilan |
| Fable | `✦ Fable` dorado en negrita | halo dorado que late y chispas |

Si hay Opus o Fable trabajando, el encabezado los cuenta: `◆ 1 Opus · ✦ 1 Fable activos`.

La ventana de contexto y el costo salen de `hooks/models.ts`, con los precios de lista de la API de Anthropic (Bedrock y Vertex cobran aparte, así que el costo es estimado). Los modelos actuales tienen 1M de contexto; Haiku 4.5 y los anteriores, 200k.

Para ver todos los skins en todos los estados, genera la vista previa y abre `docs/catalogo.html`:

```bash
node scripts/catalogo.ts
```

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

- Los costos son estimados con precios de lista por modelo; no son tu factura (con un plan de suscripción, no pagas por token).
- Haiku 5.5 cobra 5× por encima de 100k tokens de prompt; el panel lo tiene en cuenta.

## Licencia

MIT. Ver [LICENSE](../../LICENSE).
