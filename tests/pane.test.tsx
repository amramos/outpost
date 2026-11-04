import { expect, test } from 'claude-code/testing'

import { pillSvg } from '../hooks/register'

const PANE = {
  plugin: 'outpost',
  component: 'Pane',
  requestId: 'agents',
  props: {
    title: 'Outpost',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const NOW = Date.now()
const LARA = '11111111-2222-4333-8444-555555555555'
const NADIA = '66666666-7777-4888-9999-000000000000'

function seed(extra: Record<string, { shape: string; value: unknown }> = {}) {
  const base: Record<string, { shape: string; value: unknown }> = {
    codex: {
      shape: 'ext-1',
      value: [
        { provider: 'codex', id: LARA, ref: 'C:/x/a.jsonl', cwd: 'D:/game', model: 'gpt-6.1-terra', title: 'Review', status: 'running', lastAction: '$ git status --short', updatedAt: NOW },
        { provider: 'opencode', id: NADIA, ref: NADIA, cwd: 'D:/game', title: 'Fix', status: 'completed', lastMessage: 'Fixed the **cascade** player.', updatedAt: NOW - 60_000 },
      ],
    },
    claude: {
      shape: 'claude-2',
      value: [
        {
          id: 'a1',
          name: 'Kratos',
          description: 'Build the save system',
          type: 'general-purpose',
          status: 'completed',
          model: 'claude-haiku-5-5',
          answer: 'Five labs, **one** repo',
          endedAt: NOW - 30_000,
        },
      ],
    },
    names: { shape: 'names-1', value: { [LARA]: 'Lara', [NADIA]: 'Nadia' } },
    ...extra,
  }
  return (_: unknown, e: unknown) => {
    const s = base[(e as { key: string }).key]
    // what the engine's state.get answers: a stored value, or none yet
    return { value: s ? { value: s, version: 1 } : { value: undefined, version: 0 } } as never
  }
}

test('the roster groups agents into Running and Recent, on desktop and terminal', async ($, on) => {
  on('state.get', seed())
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /^Running$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Recent$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Lara$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Kratos$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cascade/ })).toBeDefined()
    // a finished Claude agent previews its answer, Markdown stripped
    expect(await ui.find({ type: 'Text', text: /^Five labs, one repo$/ })).toBeDefined()
    // each row opens with its own › button
    expect(await ui.find({ type: 'Button', key: `open-codex:${LARA}` })).toBeDefined()
    await ui.unmount()
  }
})

test('a failed Codex run goes to Needs attention', async ($, on) => {
  on('state.get', seed({ failed: { shape: 'failed-1', value: { [NADIA]: 'usage limit reached' } } }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Needs attention$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /usage limit reached/ })).toBeDefined()
  await ui.unmount()
})

test('the session view shows bubbles, a fold and the composer', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'codex', id: NADIA } },
      timeline: {
        shape: 'tl-1',
        value: [
          { kind: 'turn', text: 'Turn started' },
          { kind: 'user', text: 'what is the biggest file?', t: new Date(NOW).toISOString() },
          { kind: 'cmd', text: 'Get-ChildItem -Recurse', status: 'completed' },
          { kind: 'cmd', text: 'Sort-Object Length', status: 'completed' },
          { kind: 'agent', text: 'The largest is **index.d.ts**.' },
          { kind: 'turn', text: 'Turn finished' },
        ],
      },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /biggest file/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Ran 2 commands/ })).toBeDefined()
  expect(await ui.find({ type: 'Input', key: 'send-0' })).toBeDefined()
  await ui.unmount()
})

test('an expanded step group draws one tidy row per step', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'opencode', id: NADIA } },
      // the group sits at timeline index 2, so its fold key is fold:<id>:2
      toggles: { shape: 'toggles-1', value: { [`fold:${NADIA}:2`]: true } },
      timeline: {
        shape: 'tl-1',
        value: [
          { kind: 'turn', text: 'Turn started' },
          { kind: 'user', text: 'read the scanner' },
          { kind: 'think', text: 'The user wants me to list files first, then read the script.' },
          { kind: 'tool', text: 'read', status: 'failed', detail: 'File not found: /workspace' },
          { kind: 'tool', text: 'read: C:\\work\\agent-test\\agents-scan.mjs', status: 'completed' },
          { kind: 'cmd', text: 'ls -la', status: 'completed', detail: 'agents-scan.mjs avatar.py' },
          { kind: 'agent', text: 'Done.' },
        ],
      },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', text: /Thinking · The user wants/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /File not found/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /…\/agent-test\/agents-scan\.mjs/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Shell$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /output/ })).toBeDefined()
  await ui.unmount()
})

// a 1×1 JPEG preview, as scripts/thumb.py would make it
const THUMB = { mime: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==', w: 400, h: 300 }

test('pictures: a generated image gets a card, an attachment shows in its bubble', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'codex', id: LARA } },
      thumbs: { shape: 'thumbs-1', value: { 'C:/gen/gavel.png': THUMB, 'C:/in/sketch.png': THUMB } },
      timeline: {
        shape: 'tl-1',
        value: [
          { kind: 'turn', text: 'Turn started' },
          { kind: 'user', text: 'make an icon like this', images: ['C:/in/sketch.png'] },
          { kind: 'image', text: 'a flat vector gavel icon', images: ['C:/gen/gavel.png'] },
          { kind: 'agent', text: 'Here it is.' },
        ],
      },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // each drawn picture has its own Open button, keyed by where it sits
  expect(await ui.find({ type: 'Button', key: 'open-g:2:0' })).toBeDefined() // generated card
  expect(await ui.find({ type: 'Button', key: 'open-u:1:0' })).toBeDefined() // attachment in the user bubble
  expect(await ui.find({ type: 'Text', text: /gavel icon/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Open full size/ })).toBeDefined()
  await ui.unmount()
})

test('attachments wait above the composer, with the 📎 buttons below', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'codex', id: LARA } },
      attachments: { shape: 'attach-1', value: { [LARA]: ['C:/Temp/outpost/paste-1.png'] } },
      thumbs: { shape: 'thumbs-1', value: { 'C:/Temp/outpost/paste-1.png': THUMB } },
      timeline: { shape: 'tl-1', value: [{ kind: 'agent', text: 'ready' }] },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^paste-1\.png$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'att-x-0' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'att-paste' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'att-pick' })).toBeDefined()
  await ui.unmount()
})

test('a reply shows the pictures it mentions, and a provider logo replaces the drawn icon', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'codex', id: LARA } },
      logos: { shape: 'logos-1', value: { codex: 'iVBORw0KGgo=' } },
      thumbs: { shape: 'thumbs-1', value: { 'C:/work/inverted-colors.png': THUMB } },
      timeline: {
        shape: 'tl-1',
        value: [{ kind: 'agent', text: 'Created [inverted-colors.png](C:/work/inverted-colors.png)', images: ['C:/work/inverted-colors.png'] }],
      },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'open-m:0:0' })).toBeDefined() // picture under the reply
  // the pill draws the logo in place of the icon
  expect(pillSvg('Codex', '#10a37f', '<path/>', false, 'iVBORw0KGgo=').source).toContain('data:image/png;base64,iVBORw0KGgo=')
  expect(pillSvg('Codex', '#10a37f', '<path/>').source).not.toContain('data:image/png')
  await ui.unmount()
})

test('an agent shows its assigned mascot', async ($, on) => {
  on(
    'state.get',
    seed({
      selected: { shape: 'sel-1', value: { provider: 'codex', id: LARA } },
      mascots: { shape: 'mascots-1', value: { '10_headphone_cat.png': 'TUFTQ09U' } },
      mascotPicks: { shape: 'picks-1', value: { lara: '10_headphone_cat.png' } },
      timeline: { shape: 'tl-1', value: [{ kind: 'agent', text: 'hi' }] },
    }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // the first picture in the session view is the header avatar
  const avatar = (await ui.find({ type: 'Svg' })) as unknown as { props?: { source?: string } } | undefined
  expect(avatar?.props?.source ?? '').toContain('data:image/png;base64,TUFTQ09U')
  await ui.unmount()
})

test('an empty roster says so', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }) as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No agents in this session yet/ })).toBeDefined()
  await ui.unmount()
})
