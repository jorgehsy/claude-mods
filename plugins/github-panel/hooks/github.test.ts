import { test, expect } from 'claude-code/testing'
import { progressBar, checkStatus, mergeStatus, prIsBad, parseRepo, parseGraphql, canMerge, canRetry, canTake, checksOf, ago, ghError, labelFg } from './github.ts'
import type { Pr, Issue } from '../types'

const pr = (o: Partial<Pr> = {}): Pr => ({
  number: 1, title: 't', url: 'u', isDraft: false, head: 'h', base: 'main', mergeable: 'MERGEABLE', checks: 'ok', ...o,
})

test('parseRepo lee nameWithOwner y rechaza lo demás', async () => {
  expect(parseRepo('{"nameWithOwner":"jorgehsy/claude-mods"}')).toBe('jorgehsy/claude-mods')
  expect(parseRepo('{"nameWithOwner":"solo"}')).toBe(null)
  expect(parseRepo('no es json')).toBe(null)
})

test('parseGraphql convierte issues y PR', async () => {
  const out = parseGraphql(JSON.stringify({ data: { repository: {
    issues: { nodes: [{
      number: 7, title: 'Falla', url: 'https://x/7',
      labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
      assignees: { nodes: [] },
      subIssuesSummary: { total: 3, completed: 1 },
      closedByPullRequestsReferences: { nodes: [{ number: 9, url: 'https://x/9' }] },
    }] },
    pullRequests: { nodes: [{
      number: 9, title: 'Arregla', url: 'https://x/9', isDraft: true, headRefName: 'fix', baseRefName: 'main',
      mergeable: 'CONFLICTING',
      commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
    }, {
      number: 10, title: 'Sin checks', url: 'https://x/10', isDraft: false, headRefName: 'a', baseRefName: 'main',
      mergeable: 'ALGO', commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    }] },
  } } }))
  expect(out.issues[0]).toEqual({
    number: 7, title: 'Falla', url: 'https://x/7', labels: [{ name: 'bug', color: 'd73a4a' }],
    assignees: [], subTotal: 3, subDone: 1, prNumber: 9,
  })
  expect(out.prs[0]).toMatchObject({ number: 9, isDraft: true, head: 'fix', mergeable: 'CONFLICTING', checks: 'failed' })
  expect(out.prs[1]).toMatchObject({ mergeable: 'UNKNOWN', checks: 'none' })
})

test('parseGraphql con repo vacío da listas vacías y con errores lanza', async () => {
  expect(parseGraphql('{"data":{"repository":{"issues":{"nodes":[]},"pullRequests":{"nodes":[]}}}}')).toEqual({ issues: [], prs: [] })
  expect(() => parseGraphql('{"data":{"repository":null},"errors":[{"message":"Could not resolve"}]}')).toThrow('Could not resolve')
  expect(() => parseGraphql('basura')).toThrow()
})

test('checksOf traduce el estado del rollup', async () => {
  expect(checksOf('SUCCESS')).toBe('ok')
  expect(checksOf('ERROR')).toBe('failed')
  expect(checksOf('PENDING')).toBe('running')
  expect(checksOf(undefined)).toBe('none')
})

test('Merge sólo si es mergeable, no es borrador y los checks no fallaron', async () => {
  expect(canMerge(pr())).toBe(true)
  expect(canMerge(pr({ checks: 'none' }))).toBe(true)
  expect(canMerge(pr({ checks: 'running' }))).toBe(true)
  expect(canMerge(pr({ checks: 'failed' }))).toBe(false)
  expect(canMerge(pr({ isDraft: true }))).toBe(false)
  expect(canMerge(pr({ mergeable: 'CONFLICTING' }))).toBe(false)
  expect(canMerge(pr({ mergeable: 'UNKNOWN' }))).toBe(false)
})

test('Reintentar sólo con checks fallidos; Tomarlo sólo sin asignado', async () => {
  expect(canRetry(pr({ checks: 'failed' }))).toBe(true)
  expect(canRetry(pr())).toBe(false)
  const i = { assignees: [] } as unknown as Issue
  expect(canTake(i)).toBe(true)
  expect(canTake({ ...i, assignees: ['jorge'] })).toBe(false)
})

test('ago, ghError y labelFg', async () => {
  expect(ago(10_000, 0)).toBe('—')
  expect(ago(15_000, 10_000)).toBe('hace 5 s')
  expect(ago(190_000, 10_000)).toBe('hace 3 min')
  expect(ghError('You are not logged into any GitHub hosts. Run gh auth login')).toMatch(/gh auth login/)
  expect(ghError('none of the git remotes configured for this repository point to a known GitHub host')).toMatch(/no es un repositorio/)
  expect(ghError('')).toBe('No se pudo leer GitHub')
  expect(labelFg('ffffff')).toBe('#000000')
  expect(labelFg('000000')).toBe('#FFFFFF')
})

test('progressBar escala a 10 celdas y se omite sin sub-issues', async () => {
  expect(progressBar(0, 0)).toEqual({ filled: '', empty: '', label: '' })
  expect(progressBar(4, 10)).toEqual({ filled: '▰▰▰▰', empty: '▱▱▱▱▱▱', label: '4/10' })
  expect(progressBar(1, 3)).toEqual({ filled: '▰', empty: '▱▱', label: '1/3' })
  expect(progressBar(10, 20)).toEqual({ filled: '▰▰▰▰▰', empty: '▱▱▱▱▱', label: '10/20' })
  expect(progressBar(9, 3).label).toBe('3/3')
})

test('checkStatus y mergeStatus eligen glifo, texto y color', async () => {
  expect(checkStatus('ok')).toEqual({ glyph: '✓', text: 'checks', color: '#6cc483' })
  expect(checkStatus('failed').color).toBe('#e5675f')
  expect(checkStatus('running').glyph).toBe('◌')
  expect(checkStatus('none')).toEqual({ glyph: '', text: 'sin checks', dim: true })
  expect(mergeStatus('MERGEABLE').text).toBe('mergeable')
  expect(mergeStatus('CONFLICTING')).toEqual({ glyph: '⚠', text: 'conflictos', color: '#d9a54a' })
  expect(mergeStatus('UNKNOWN').dim).toBe(true)
})

test('prIsBad marca checks fallidos o conflictos', async () => {
  expect(prIsBad(pr())).toBe(false)
  expect(prIsBad(pr({ checks: 'failed' }))).toBe(true)
  expect(prIsBad(pr({ mergeable: 'CONFLICTING' }))).toBe(true)
})
