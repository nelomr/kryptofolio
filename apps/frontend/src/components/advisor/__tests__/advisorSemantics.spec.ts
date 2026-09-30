import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { ADVISOR_FAILURE_CODES, ADVISOR_PROVIDER_FAILURE_KINDS, ADVISOR_TOOL_NAMES } from '@kryptofolio/shared-types'
import { AdvisorStreamError } from '@/core/domain/models/AdvisorEntities'
import { en } from '@/i18n/dictionaries/en'
import { es } from '@/i18n/dictionaries/es'
import {
  createControlledPort,
  failed,
  providersFailed,
  mountPanel,
  refused,
  resetPanel,
  send,
  token,
  toolResult,
  toolStart,
} from './advisorTestKit'

vi.mock('@/composables/useI18n', async () => {
  const { translateEnglish } = await import('./i18nMock')
  return { useI18n: () => ({ t: translateEnglish }) }
})

const sources = import.meta.glob<string>(['../*.vue', '../*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  resetPanel()
})

type Finish = (run: ReturnType<typeof createControlledPort>['lastRun']) => void

async function panelAfter(finish: Finish) {
  const harness = createControlledPort()
  wrapper = await mountPanel(harness.port)
  await send(wrapper, 'hello')
  harness.lastRun.push(token('partial'))
  finish(harness.lastRun)
  await flushPromises()
  return wrapper
}

describe('state to semantic token', () => {
  const surfaces: ReadonlyArray<readonly [string, string, Finish, string]> = [
    ['refused', 'advisor-refused', (run) => run.push(refused('reason')), 'bg-info-soft'],
    ['NO_MODEL_AVAILABLE', 'advisor-failed', (run) => run.push(failed('NO_MODEL_AVAILABLE')), 'bg-warning-soft'],
    ['VAULT_LOCKED', 'advisor-failed', (run) => run.push(failed('VAULT_LOCKED')), 'bg-warning-soft'],
    ['ALL_PROVIDERS_FAILED', 'advisor-failed', (run) => run.push(providersFailed('network')), 'bg-loss-soft'],
    ['ALL_PROVIDERS_FAILED, rejected key', 'advisor-failed', (run) => run.push(providersFailed('auth-rejected')), 'bg-loss-soft'],
    ['INTERNAL_ERROR', 'advisor-failed', (run) => run.push(failed('INTERNAL_ERROR')), 'bg-loss-soft'],
    [
      'transport-lost',
      'advisor-transport',
      (run) => run.fail(new AdvisorStreamError('lost', { kind: 'network' })),
      'bg-loss-soft',
    ],
  ]

  it.each(surfaces)('%s uses exactly %s', async (_state, testId, finish, surface) => {
    const panel = await panelAfter(finish)
    const classes = panel.find(`[data-testid="${testId}"]`).classes()
    const used = classes.filter((cls) => /^bg-(info|warning|loss)-soft$/.test(cls))
    expect(used).toEqual([surface])
  })

  it('user-aborted is muted text with no tinted surface at all', async () => {
    const panel = await panelAfter(() => undefined)
    await panel.find('[data-testid="advisor-stop"]').trigger('click')
    await flushPromises()
    const classes = panel.find('[data-testid="advisor-stopped"]').classes()
    expect(classes).toContain('text-muted')
    expect(classes.some((cls) => /^bg-/.test(cls))).toBe(false)
  })
})

describe('profit and loss colours never paint prose', () => {
  const PROSE_COLOR = '[class*="text-profit"], [class*="text-loss"]'

  /** Text-bearing elements that are, or sit inside, an element coloured with profit or loss. */
  function proseElementsWithColor(root: Element): string[] {
    return Array.from(root.querySelectorAll('*'))
      .filter((el) =>
        Array.from(el.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''),
      )
      .filter((el) => el.closest(PROSE_COLOR) !== null)
      .map((el) => el.outerHTML.slice(0, 80))
  }

  it('flags a coloured prose element, so the clean results below are not vacuous', () => {
    const probe = document.createElement('div')
    probe.innerHTML = '<div class="text-loss"><p>You lost 3%</p></div><p class="text-fg">ok</p>'
    expect(proseElementsWithColor(probe)).toHaveLength(1)
  })

  it('an answer full of gains and losses is not coloured', async () => {
    const panel = await panelAfter((run) => {
      run.push(token(' gained `+12.5%` and lost `-3.1%`, a **net** gain of 9.4%.'))
      run.end()
    })
    expect(proseElementsWithColor(panel.element)).toEqual([])
  })

  it('tool rows, refusals, failures and notes are not coloured as prose either', async () => {
    const panel = await panelAfter((run) => {
      run.push(toolStart('c1', 'portfolio_summary'))
      run.push(toolResult('c1', 'portfolio_summary'))
      run.push(refused('reason'))
    })
    expect(proseElementsWithColor(panel.element)).toEqual([])
  })

  it('profit and loss text colours appear in no panel source except the finished-tool check icon', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('AdvisorToolActivity.vue'))
      .filter(([, source]) => /(?<![\w-])text-(profit|loss)\b/.test(source))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

describe('copy goes through the dictionaries', () => {
  const keyLiteral = /\bt\(\s*['"`](advisor\.[\w.]+)['"`]/g
  const keyFamily = /\bt\(\s*`(advisor\.[\w.]*)\$\{/g

  const literalKeys = new Set<string>()
  const families = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(keyLiteral)) literalKeys.add(match[1])
    for (const match of source.matchAll(keyFamily)) families.add(match[1])
  }
  const returnedKeys = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/'(advisor\.[\w.]+)'/g)) returnedKeys.add(match[1])
  }

  const advisorKeys = (dictionary: Record<string, string>) =>
    Object.keys(dictionary).filter((key) => key.startsWith('advisor.'))

  it('finds the keys the panel uses, including the ones it derives from closed vocabularies', () => {
    expect(literalKeys.size).toBeGreaterThan(5)
    // A new derived family fails here until the dictionary tests below cover it.
    expect([...families].sort()).toEqual(['advisor.failed.', 'advisor.tool.', 'advisor.tool.status.'])
  })

  it.each([
    ['en', en],
    ['es', es],
  ] as const)('%s carries every literal key the panel references', (_name, dictionary) => {
    const missing = [...literalKeys, ...returnedKeys].filter((key) => dictionary[key] === undefined)
    expect(missing).toEqual([])
  })

  it.each([
    ['en', en],
    ['es', es],
  ] as const)('%s carries a tool name for every advisor tool', (_name, dictionary) => {
    const missing = ADVISOR_TOOL_NAMES.filter((tool) => dictionary[`advisor.tool.${tool}`] === undefined)
    expect(missing).toEqual([])
  })

  it.each([
    ['en', en],
    ['es', es],
  ] as const)('%s carries a label for every tool status', (_name, dictionary) => {
    const missing = ['running', 'finished', 'failed', 'interrupted'].filter(
      (status) => dictionary[`advisor.tool.status.${status}`] === undefined,
    )
    expect(missing).toEqual([])
  })

  it.each([
    ['en', en],
    ['es', es],
  ] as const)('%s carries a title and body for every failure code', (_name, dictionary) => {
    const missing = ADVISOR_FAILURE_CODES.flatMap((code) =>
      ['title', 'body'].map((part) => `advisor.failed.${code}.${part}`),
    ).filter((key) => dictionary[key] === undefined)
    expect(missing).toEqual([])
  })

  it.each([
    ['en', en],
    ['es', es],
  ] as const)('%s carries a title and body for every provider failure kind that has its own text', (_name, dictionary) => {
    const missing = ADVISOR_PROVIDER_FAILURE_KINDS.filter((kind) => kind !== 'unknown')
      .flatMap((kind) => ['title', 'body'].map((part) => `advisor.failed.ALL_PROVIDERS_FAILED.${kind}.${part}`))
      .filter((key) => dictionary[key] === undefined)
    expect(missing).toEqual([])
  })

  it('en and es carry the same advisor keys', () => {
    expect(advisorKeys(es).sort()).toEqual(advisorKeys(en).sort())
  })

  function hardcodedTemplateText(source: string): string[] {
    const template = /<template>([\s\S]*)<\/template>/.exec(source)?.[1] ?? ''
    const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '')
    return [...withoutComments.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)]
      .map((match) => match[1].trim())
      .filter((text) => text !== '')
  }

  it('flags literal template text, so a clean result below is not vacuous', () => {
    expect(hardcodedTemplateText('<template><p>Hello there</p><p>{{ t(\'k\') }}</p></template>')).toEqual(['Hello there'])
  })

  it('has no hard-coded user-visible text in any panel template', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => path.endsWith('.vue'))
      .flatMap(([path, source]) => hardcodedTemplateText(source).map((text) => `${path}: ${text}`))
    expect(offenders).toEqual([])
  })
})
