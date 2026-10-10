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

El skin de Clawd dice **quién es** el agente: sale de su tipo (y de su tarea, para el auditor) y no cambia mientras trabaja.

| Skin | Tipo de agente | Animación |
| --- | --- | --- |
| **research** | `Explore`, `Plan`, researcher, buscador, lector | Explorador que marcha con una bandera que flamea; al terminar, la bandera cae |
| **developer** | developer, engineer, builder, coder, frontend, backend, prototyper, architect | Audífonos y laptop: teclea con un brazo y luego con el otro, y el código corre en pantalla |
| **auditor** | Su tipo o su tarea habla de review, audit, seguridad o QA (palabras completas) | Gafas con un barrido rojo y un portapapeles con un hallazgo que titila |
| **general** · generalista | `general-purpose`, `claude` y todo lo demás | Llave inglesa que oscila junto a una caja de herramientas |
| **base** | Sólo la mascota del panel vacío | Camina y parpadea |

La línea `◆` de la tarjeta dice **qué hace ahora**, según sus últimas llamadas: más escrituras que lecturas (`Edit`, `Write`, `Bash`) es «programando»; si no, «investigando». Un auditor siempre dice «auditando». Hasta su primera herramienta, la línea no aparece.

La animación empalma sin saltos: en el escritorio cada animación SVG lleva su fase atada a la hora del reloj, así que un re-dibujo del panel no la reinicia; en la terminal todos los skins usan 8, 4, 2 o 1 cuadros por segundo.

## Dónde y qué toca

A la derecha de cada tarjeta (debajo de la descripción si la terminal tiene menos de 70 columnas):

- **Dónde**: `⎇ rama` y `worktree <nombre>`. El worktree sale del `cwd` con que se lanzó el agente o de las rutas `.claude/worktrees/<nombre>/` que toca; la rama, de `git rev-parse --abbrev-ref HEAD` en su worktree o `cwd` (una vez por directorio) o, si no tiene, en el directorio de la sesión.
- **Archivos**: los últimos 5 distintos que leyó (`·`) o escribió (`✎`, en negrita), el más nuevo arriba, con la ruta relativa a su worktree, `cwd` o sesión (si queda fuera, sólo el nombre). Mientras no haya ninguno: «sin archivos todavía».

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
