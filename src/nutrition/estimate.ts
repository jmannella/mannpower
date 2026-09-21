import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema'
import type { AiModel, Confidence, FoodItem } from '../domain/types'
import { isFoodItem } from '../domain/validate'
import { getSettings } from '../data/repo'
import { photoToBase64Jpeg } from './photo'

export type EstimateFailure = 'no_key' | 'offline' | 'auth' | 'rate_limit' | 'refused' | 'failed'

export type EstimateResult =
  | { ok: true; items: FoodItem[]; confidence: Confidence; note?: string }
  | { ok: false; reason: EstimateFailure; message: string }

export type EstimateContent =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'text'; text: string }

export interface EstimateRequest {
  model: AiModel
  system: string
  content: EstimateContent[]
  /** Send output_config.effort low. Haiku 4.5 rejects the field. */
  effort: boolean
  /** Opus 5 only: retry a mistaken safety decline on another model inside the same call. */
  fallbacks: boolean
}

export interface EstimateClient {
  send(req: EstimateRequest): Promise<{ stopReason: string | null; output: unknown }>
}

export interface EstimateDeps {
  getSettings(): Promise<{ anthropicKey?: string; aiModel: AiModel }>
  makeClient(apiKey: string): EstimateClient
  online(): boolean
  encodePhoto(photo: Blob): Promise<string>
}

export const SYSTEM_PROMPT = [
  'You estimate calories and macronutrients for meals logged in a personal fitness app.',
  'The user lives in Ontario, Canada. Prefer Canadian chains, products and portion sizes (Tim Hortons, not Dunkin).',
  'Assume a typical restaurant or packaged portion unless the description says otherwise.',
  'Split the meal into separate items, one per distinct food or drink. Put the quantity in amount, for example "2 large" or "1 cup".',
  'Set kind to alcohol for alcoholic drinks, drink for every other beverage, and food for everything else.',
  'Give one realistic middle estimate per number, never a range. Calories in kcal, everything else in grams.',
  'Set confidence to low when the description or photo is too vague to estimate well, and say why in note in one short sentence. Otherwise leave note empty.',
  'Never refuse a vague meal. Estimate it and flag it.',
].join(' ')

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'amount', 'kind', 'calories', 'protein', 'carbs', 'fat', 'fibre'],
  properties: {
    name: { type: 'string' },
    amount: { type: 'string' },
    kind: { type: 'string', enum: ['food', 'drink', 'alcohol'] },
    calories: { type: 'number' },
    protein: { type: 'number' },
    carbs: { type: 'number' },
    fat: { type: 'number' },
    fibre: { type: 'number' },
  },
} as const

export const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'confidence', 'note'],
  properties: {
    items: { type: 'array', items: ITEM_SCHEMA },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    note: { type: 'string' },
  },
} as const

export function buildRequest(model: AiModel, text: string, photoBase64?: string): EstimateRequest {
  const content: EstimateContent[] = []
  if (photoBase64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } })
  content.push({ type: 'text', text: text.trim() || 'Estimate the meal in this photo.' })
  return { model, system: SYSTEM_PROMPT, content, effort: model !== 'claude-haiku-4-5', fallbacks: model === 'claude-opus-5' }
}

const fail = (reason: EstimateFailure, message: string): EstimateResult => ({ ok: false, reason, message })
const BAD_REPLY = 'Claude sent back something the app could not read. Try again or enter the numbers by hand.'

export function parseEstimate(output: unknown): EstimateResult {
  if (typeof output !== 'object' || output === null) return fail('failed', BAD_REPLY)
  const o = output as { items?: unknown; confidence?: unknown; note?: unknown }
  if (!Array.isArray(o.items) || o.items.length === 0) return fail('failed', BAD_REPLY)
  const items = o.items.map((raw) => (typeof raw === 'object' && raw !== null && (raw as { amount?: unknown }).amount === '' ? { ...raw, amount: undefined } : raw))
  if (!items.every(isFoodItem)) return fail('failed', BAD_REPLY)
  if (o.confidence !== 'low' && o.confidence !== 'medium' && o.confidence !== 'high') return fail('failed', BAD_REPLY)
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined
  return { ok: true, items: items as FoodItem[], confidence: o.confidence, note }
}

/** The real client. Requests go straight from the phone to the Claude API with the key from Settings. */
export function sdkClient(
  apiKey: string,
  // Wrapped so fetch is called on the global; browsers throw "Illegal invocation" on a bare reference.
  // Also the injection seam wire level tests use to capture the real request without a network call.
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
): EstimateClient {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    fetch: fetchImpl,
    maxRetries: 1,
    timeout: 60_000,
  })
  return {
    async send(req) {
      const base = { model: req.model, max_tokens: 4000, system: req.system, messages: [{ role: 'user' as const, content: req.content }] }
      const effort = req.effort ? { effort: 'low' as const } : {}
      try {
        if (req.fallbacks) {
          const r = await client.beta.messages.parse({
            ...base,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { ...effort, format: betaJSONSchemaOutputFormat(ESTIMATE_SCHEMA) },
          })
          return { stopReason: r.stop_reason, output: r.parsed_output }
        }
        const r = await client.messages.parse({ ...base, output_config: { ...effort, format: jsonSchemaOutputFormat(ESTIMATE_SCHEMA) } })
        return { stopReason: r.stop_reason, output: r.parsed_output }
      } catch (err) {
        // A cut off reply is valid JSON syntax gone wrong, not an API error: parse() throws before the raw
        // stop_reason is reachable. Treat that specific failure as the truncation case, everything else
        // (Anthropic.APIError, connection errors) keeps propagating to estimateMeal's mapError.
        if (isStructuredOutputParseFailure(err)) return { stopReason: 'max_tokens', output: null }
        throw err
      }
    },
  }
}

function isStructuredOutputParseFailure(err: unknown): boolean {
  return err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError)
    && /Failed to parse structured output/.test(err.message)
}

const defaultDeps: EstimateDeps = {
  getSettings: async () => { const s = await getSettings(); return { anthropicKey: s.anthropicKey, aiModel: s.aiModel } },
  makeClient: sdkClient,
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  encodePhoto: (photo) => photoToBase64Jpeg(photo),
}

/** Fixed messages only, so nothing from the request (including the key) can leak into the UI. */
function mapError(err: unknown): EstimateResult {
  if (err instanceof Anthropic.APIConnectionError) return fail('offline', 'Could not reach Claude. Check your signal and try again.')
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401 || err.status === 403) return fail('auth', 'Claude rejected the API key. Check it in Settings.')
    if (err.status === 429) return fail('rate_limit', 'Claude is rate limiting this key, or the account is out of credit. Try again in a minute.')
    return fail('failed', `Claude returned an error (${err.status ?? 'unknown'}). Try again or enter the numbers by hand.`)
  }
  return fail('failed', 'The estimate did not work. Try again or enter the numbers by hand.')
}

export async function estimateMeal(input: { text: string; photo?: Blob }, deps: EstimateDeps = defaultDeps): Promise<EstimateResult> {
  if (!input.text.trim() && !input.photo) return fail('failed', 'Describe the meal or add a photo first.')
  const settings = await deps.getSettings()
  if (!settings.anthropicKey) return fail('no_key', 'Add your Anthropic API key in Settings to use Describe.')
  if (!deps.online()) return fail('offline', 'You are offline. Save the meal for later or enter the numbers by hand.')
  try {
    const photo = input.photo ? await deps.encodePhoto(input.photo) : undefined
    const reply = await deps.makeClient(settings.anthropicKey).send(buildRequest(settings.aiModel, input.text, photo))
    if (reply.stopReason === 'refusal') return fail('refused', 'Claude declined to estimate that. Enter the numbers by hand.')
    if (reply.stopReason === 'max_tokens') return fail('failed', 'The estimate was cut off. Try a shorter description.')
    return parseEstimate(reply.output)
  } catch (err) {
    return mapError(err)
  }
}
