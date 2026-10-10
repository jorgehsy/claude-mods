# github-panel

Panel en vivo para Claude Code con los issues y los pull requests abiertos del repositorio en que corre la sesión. Se abre solo al iniciar, o con `/github-panel`. Necesita la CLI [`gh`](https://cli.github.com) con sesión iniciada (`gh auth login`).

El título es el repo (`owner/repo`, de `gh repo view`). Arriba ves «hace N s» desde el último refresco y un botón `↻` para refrescar ya; se actualiza solo cada 30 s, sin llamadas encimadas. Cada sección se pliega al hacer clic en su encabezado.

## Instalar

```bash
claude plugin marketplace add jorgehsy/claude-mods
claude plugin install github-panel@jorge-mods --scope user
```

En Claude Code 2.1.275 o posterior también sirve: `/plugin install github-panel --marketplace jorgehsy/claude-mods`.

## Issues

`#número` y título (clic abre GitHub), etiquetas con su color, asignado (`@login` o «sin asignar»), sub-issues `hechos/total` y el PR que lo cierra (o «sin PR»).

- **Tomarlo** (sólo sin asignado): `gh issue edit N --add-assignee @me`.

## Pull requests

`#número` y título (borrador si lo es), `head → base`, estado de los checks y del merge.

- **Merge** (sólo si es mergeable, no es borrador y los checks no fallaron): pide «¿Mergear #N? Sí / No»; con Sí corre `gh pr merge N --squash --delete-branch`.
- **Reintentar checks** (sólo si fallaron): busca la última corrida fallida de la rama y corre `gh run rerun <id> --failed`.

Mientras una acción corre, su botón muestra «…»; al terminar, el resultado o el error queda en la fila y se refresca.

## Datos

Una sola llamada `gh api graphql` por refresco. Si falta `gh`, no hay sesión o el directorio no es un repo de GitHub, el panel muestra una línea con la causa.

## Desarrollo

```bash
claude plugin validate plugins/github-panel
tsc -p plugins/github-panel
claude plugin test plugins/github-panel
```

La lectura del JSON y las reglas de los botones están en `hooks/github.ts`, con pruebas en `hooks/github.test.ts`.
