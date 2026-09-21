import Anthropic from '@anthropic-ai/sdk'
import { buildRequest, estimateMeal, parseEstimate, type EstimateClient, type EstimateDeps, type EstimateRequest } from './estimate'

const goodOutput = {
  items: [
    { name: 'Farmers wrap', amount: '1', kind: 'food', calories: 640, protein: 27, carbs: 50, fat: 36, fibre: 3 },
    { name: 'Double double, large', amount: '1', kind: 'drink', calories: 270, protein: 5, carbs: 33, fat: 14, fibre: 0 },
  ],
  confidence: 'high',
  note: '',
}

function deps(patch: Partial<EstimateDeps> = {}, reply: { stopReason: string | null; output: unknown } | Error = { stopReason: 'end_turn', output: goodOutput }) {
  const sent: EstimateRequest[] = []
  const client: EstimateClient = { send: async (req) => { sent.push(req); if (reply instanceof Error) throw reply; return reply } }
  const d: EstimateDeps = {
    getSettings: async () => ({ anthropicKey: 'sk-test', aiModel: 'claude-opus-5' }),
    makeClient: () => client,
    online: () => true,
    encodePhoto: async () => 'BASE64JPEG',
    ...patch,
  }
  return { d, sent }
}

describe('buildRequest', () => {
  test('opus 5 gets low effort and server side fallbacks', () => {
    const r = buildRequest('claude-opus-5', 'two eggs and toast')
    expect(r).toMatchObject({ model: 'claude-opus-5', effort: true, fallbacks: true })
    expect(r.content).toEqual([{ type: 'text', text: 'two eggs and toast' }])
    expect(r.system).toContain('Canada')
  })

  test('sonnet keeps effort without fallbacks, haiku drops effort', () => {
    expect(buildRequest('claude-sonnet-5', 'x')).toMatchObject({ effort: true, fallbacks: false })
    expect(buildRequest('claude-haiku-4-5', 'x')).toMatchObject({ effort: false, fallbacks: false })
  })

  test('a photo goes first as a base64 jpeg block, and an empty note gets a default instruction', () => {
    const r = buildRequest('claude-opus-5', '  ', 'BASE64JPEG')
    expect(r.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64JPEG' } })
    expect(r.content[1]).toEqual({ type: 'text', text: 'Estimate the meal in this photo.' })
  })
})

describe('parseEstimate', () => {
  test('accepts a good reply and drops empty amounts and notes', () => {
    const r = parseEstimate({ ...goodOutput, items: [{ ...goodOutput.items[0], amount: '' }] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.items[0].amount).toBeUndefined()
      expect(r.note).toBeUndefined()
      expect(r.confidence).toBe('high')
    }
  })

  test.each([
    ['null', null],
    ['no items', { ...goodOutput, items: [] }],
    ['negative calories', { ...goodOutput, items: [{ ...goodOutput.items[0], calories: -1 }] }],
    ['bad confidence', { ...goodOutput, confidence: 'certain' }],
  ])('rejects %s', (_label, bad) => {
    expect(parseEstimate(bad)).toMatchObject({ ok: false, reason: 'failed' })
  })
})

describe('estimateMeal', () => {
  test('returns items from a good reply', async () => {
    const { d, sent } = deps()
    const r = await estimateMeal({ text: 'farmers wrap and a large double double' }, d)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items.map((i) => i.calories)).toEqual([640, 270])
    expect(sent[0].model).toBe('claude-opus-5')
  })

  test('passes low confidence and its note through', async () => {
    const { d } = deps({}, { stopReason: 'end_turn', output: { ...goodOutput, confidence: 'low', note: 'Portion size unclear.' } })
    const r = await estimateMeal({ text: 'some pasta' }, d)
    expect(r).toMatchObject({ ok: true, confidence: 'low', note: 'Portion size unclear.' })
  })

  test('sends the encoded photo', async () => {
    const { d, sent } = deps()
    await estimateMeal({ text: 'large', photo: new Blob(['x']) }, d)
    expect(sent[0].content[0]).toMatchObject({ type: 'image' })
  })

  test('no key, offline, and empty input never call the client', async () => {
    const noKey = deps({ getSettings: async () => ({ aiModel: 'claude-opus-5' }) })
    expect(await estimateMeal({ text: 'x' }, noKey.d)).toMatchObject({ ok: false, reason: 'no_key' })
    const offline = deps({ online: () => false })
    expect(await estimateMeal({ text: 'x' }, offline.d)).toMatchObject({ ok: false, reason: 'offline' })
    const empty = deps()
    expect(await estimateMeal({ text: '   ' }, empty.d)).toMatchObject({ ok: false, reason: 'failed' })
    expect(noKey.sent.length + offline.sent.length + empty.sent.length).toBe(0)
  })

  test('refusal and max_tokens stop reasons fail before the content is read', async () => {
    expect(await estimateMeal({ text: 'x' }, deps({}, { stopReason: 'refusal', output: null }).d)).toMatchObject({ ok: false, reason: 'refused' })
    expect(await estimateMeal({ text: 'x' }, deps({}, { stopReason: 'max_tokens', output: goodOutput }).d)).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('maps SDK errors', async () => {
    const api = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers())
    expect(await estimateMeal({ text: 'x' }, deps({}, api(401)).d)).toMatchObject({ ok: false, reason: 'auth' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(403)).d)).toMatchObject({ ok: false, reason: 'auth' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(429)).d)).toMatchObject({ ok: false, reason: 'rate_limit' })
    expect(await estimateMeal({ text: 'x' }, deps({}, api(500)).d)).toMatchObject({ ok: false, reason: 'failed' })
    expect(await estimateMeal({ text: 'x' }, deps({}, new Anthropic.APIConnectionError({ message: 'down' })).d)).toMatchObject({ ok: false, reason: 'offline' })
    expect(await estimateMeal({ text: 'x' }, deps({}, new Error('boom')).d)).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('failure messages never contain the key', async () => {
    const r = await estimateMeal({ text: 'x' }, deps({}, new Error('bad key sk-test')).d)
    expect(JSON.stringify(r)).not.toContain('sk-test')
  })
})
