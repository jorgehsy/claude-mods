# claude-mods

Catálogo de mods para [Claude Code](https://claude.com/claude-code) de Jorge Simoes. Funcionan en la terminal y en la app de escritorio.

## Agregar el catálogo

Una sola vez:

```bash
claude plugin marketplace add jorgehsy/claude-mods
```

Después instala el mod que quieras:

```bash
claude plugin install <mod>@jorge-mods --scope user
```

## Mods

| Mod | Qué hace |
| --- | --- |
| [agent-monitor](plugins/agent-monitor) | Panel en vivo de subagentes con un Clawd por agente que cambia de skin según lo que hace (research, developer, auditor) y destaca los modelos caros (Opus, Fable): estado, tokens, costo y contexto. |
| [github-panel](plugins/github-panel) | Panel en vivo de GitHub con los issues y PR abiertos del repo: tomar un issue, mergear un PR y reintentar checks fallidos. |
| [devtools](plugins/devtools) | Barra encima del prompt: a la izquierda el contexto usado, el modelo, el effort y el output style; a la derecha el botón `devtools` con accesos a los paneles de Agentes y GitHub. |

## Actualizar

```bash
claude plugin marketplace update jorge-mods
claude plugin update <mod>@jorge-mods
```

Después escribe `/reload-plugins` en la sesión abierta.

## Agregar un mod nuevo

1. Crea su carpeta en `plugins/<mod>/`, con `.claude-plugin/plugin.json` y `hooks/`.
2. Agrégalo a `plugins` en `.claude-plugin/marketplace.json`, con `"source": "./plugins/<mod>"`.
3. Agrega su fila a la tabla de arriba.
4. Revisa con `claude plugin validate .` y con `claude plugin validate plugins/<mod>`.

Para que un cambio les llegue a los demás, sube `version` en el `plugin.json` del mod.

## Licencia

MIT
