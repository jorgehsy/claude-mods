import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Info } from '../types'
import { bar, compact, level, modelName } from './format.ts'

const isOpen = atom({ plugin: 'devtools', key: 'isOpen' } as const, false)
const info = atom({ plugin: 'devtools', key: 'info' } as const, { model: '', effort: '', style: '', tokens: 0, window: 0 } as Info)

/** Cada acceso de la tarjeta: el botón y el comando del mod que abre. Para sumar uno, agrégalo aquí. */
const TOOLS = [
  { key: 'agentes', label: 'Agentes', command: 'agent-monitor' },
  { key: 'github', label: 'GitHub', command: 'github-panel' },
]

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      const settings = await $.settings.read()
      const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
      await update($, info, v => ({
        ...v,
        model,
        effort: v.effort || text(settings.effortLevel),
        style: v.style || text(settings.outputStyle),
        tokens: usage.context.tokens ?? 0,
        window: usage.context.window,
      }))
    } catch (err) {
      $.ui.log(`devtools: no se pudo leer la sesión: ${String(err)}`, { to: 'debug' })
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const { tokens = 0, window } = e.context
    await update($, info, v => (v.tokens === tokens && v.window === window ? v : { ...v, tokens, window }))
    return next(e)
  })

  // Sólo el bucle principal: los subagentes llevan su propio modelo y effort.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const effort = e.effort === undefined ? '' : String(e.effort)
      await update($, info, v => (v.model === e.model && v.effort === effort ? v : { ...v, model: e.model, effort }))
    }
    return yield* next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const style = e.outputStyle?.name ?? ''
    await update($, info, v => (v.style === style ? v : { ...v, style }))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const open = await read($, isOpen)
    const now = await read($, info)
    const toggle = () => update($, isOpen, v => !v)

    const launch = async (command: string) => {
      await update($, isOpen, () => false)
      try {
        await $.command.run({ command })
      } catch (err) {
        $.ui.toast(`devtools: no se pudo abrir /${command}`)
        $.ui.log(`devtools: /${command} falló: ${String(err)}`, { to: 'debug' })
      }
    }

    const percent = now.window > 0 ? Math.round((now.tokens / now.window) * 100) : 0
    const cells = bar(percent)
    const facts = [now.model && modelName(now.model), now.effort, now.style].filter(Boolean)

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" width="100%">
          <Box gap={1} flexShrink={1}>
            <Text>
              <Text color={level(percent)}>{cells.full}</Text>
              <Text dimColor>{cells.empty}</Text>
            </Text>
            <Text dimColor>
              {now.window > 0 ? `${compact(now.tokens)}/${compact(now.window)} (${percent}%)` : 'contexto —'}
            </Text>
            {facts.map((f, i) => (
              <Text key={`f${i}`} dimColor>· {f}</Text>
            ))}
          </Box>
          <Button key="devtools" label={open ? 'devtools ▴' : 'devtools ▾'} dimColor={!open} onPress={toggle} />
        </Box>
        {open && (
          <Box borderStyle="round" borderDimColor flexDirection="column" paddingX={1} alignSelf="flex-end">
            <Text dimColor>Paneles</Text>
            <Box gap={1}>
              {TOOLS.map(t => (
                <Button key={t.key} label={t.label} onPress={() => launch(t.command)} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
