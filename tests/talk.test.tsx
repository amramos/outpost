import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'outpost',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

const talk = (over: Record<string, unknown>) => ({
  shape: 'talk-1',
  value: { provider: 'claude', models: {}, sessions: {}, shared: false, autoApprove: false, ...over },
})

function seed(values: Record<string, { shape: string; value: unknown }>) {
  return (_: unknown, e: unknown) => {
    const s = values[(e as { key: string }).key]
    return { value: s ? { value: s, version: 1 } : { value: undefined, version: 0 } } as never
  }
}

test('the band offers provider and model pickers and the two toggles', async ($, on) => {
  on(
    'state.get',
    seed({
      talk: talk({ provider: 'codex', models: { codex: 'gpt-6.1-terra' } }),
      modelLists: { shape: 'models-1', value: { codex: ['gpt-6.1-sol', 'gpt-6.1-terra'] } },
    }),
  )
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Select', key: 'talk-provider' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'talk-model' })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Share with Claude/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Auto-approve tools/ })).toBeDefined()
  await ui.unmount()
})

test('a provider with hundreds of models still draws the band: a family picker, no list over 64', async ($, on) => {
  // opencode reports ~418 ids; a Select refuses more than 64 options, and the
  // band used to vanish (leaving no way back to Claude but /talk claude)
  const families = ['opencode', 'openrouter', 'google', 'anthropic', 'zai']
  const models = Array.from({ length: 418 }, (_, i) => `${families[i % families.length]}/model-${i}`)
  on(
    'state.get',
    seed({
      talk: talk({ provider: 'opencode', models: { opencode: 'openrouter/model-1' } }),
      modelLists: { shape: 'models-1', value: { opencode: models } },
    }),
  )
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const optionsOf = async (key: string) =>
    ((await ui.find({ type: 'Select', key })) as unknown as { props?: { options?: unknown[]; value?: string } } | undefined)?.props
  const family = await optionsOf('talk-family')
  const model = await optionsOf('talk-model')
  expect(family).toBeDefined()
  expect(model).toBeDefined()
  expect(family?.value).toBe('openrouter') // follows the chosen model
  expect((model?.options ?? []).length).toBeLessThanOrEqual(64)
  expect((family?.options ?? []).length).toBeLessThanOrEqual(64)
  expect(model?.value).toBe('openrouter/model-1')
  await ui.unmount()
})

test('with Claude selected the band is just the provider picker', async ($, on) => {
  on('state.get', seed({ talk: talk({}) }))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Select', key: 'talk-provider' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'talk-model' })).toBeUndefined()
  await ui.unmount()
})

test('a prompt goes to the chosen provider, not to Claude', async ($, on) => {
  on('state.get', seed({ talk: talk({ provider: 'codex', models: { codex: 'gpt-6.1-terra' } }) }))
  on('prompt.submit', (_, e) => ({ text: (e as { text: string }).text }))
  const result = (await $.prompt.submit({ text: 'refactor the scanner' } as never)) as { drop?: string; text?: string }
  expect(result.drop ?? '').toContain('Sent to Codex · gpt-6.1-terra. The reply appears in the Outpost pane.')
})

test('with Claude selected a prompt goes through untouched', async ($, on) => {
  on('state.get', seed({ talk: talk({}) }))
  on('prompt.submit', (_, e) => ({ text: (e as { text: string }).text }))
  const result = (await $.prompt.submit({ text: 'hello Claude' } as never)) as { drop?: string; text?: string }
  expect(result.drop).toBeUndefined()
  expect(result.text).toBe('hello Claude')
})
