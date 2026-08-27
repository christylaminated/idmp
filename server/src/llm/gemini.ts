import type { ExplainInput, SchemaGenerator } from './index.js'
import { EXPLAIN_SYSTEM, GENERATE_SYSTEM } from './prompts.js'
import type { SchemaDraft } from '../validate/schema.js'
import { badRequest } from '../errors.js'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface GeminiConfig {
  apiKey: string
  model?: string
}

interface GeminiPart {
  text?: string
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>
  error?: { message?: string }
}

export function createGeminiGenerator(config: GeminiConfig): SchemaGenerator {
  const model = config.model ?? 'gemini-2.5-flash'

  async function call(
    system: string,
    user: string,
    opts: { json?: boolean; maxTokens?: number } = {},
  ): Promise<string> {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: opts.json ? 0.2 : 0.6,
          maxOutputTokens: opts.maxTokens ?? 4096,
          // Constrained decoding rather than a response schema: the field model
          // is recursive (EMBED contains fields that may contain EMBED), which
          // a fixed response schema cannot express. Asking for JSON output plus
          // an explicit contract in the system prompt gets the same robustness
          // without flattening the model.
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })

    const body = (await res.json().catch(() => ({}))) as GeminiResponse

    if (!res.ok) {
      throw badRequest(`Gemini request failed (${res.status}): ${body.error?.message ?? 'unknown error'}`)
    }

    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text.trim()) {
      throw badRequest(`Gemini returned an empty response (finishReason: ${body.candidates?.[0]?.finishReason ?? 'none'})`)
    }
    return text
  }

  return {
    name: `gemini:${model}`,

    async generate(prompt: string): Promise<SchemaDraft[]> {
      const raw = await call(GENERATE_SYSTEM, prompt, { json: true, maxTokens: 8192 })
      const parsed = parseJson(raw)

      const appsId = String(parsed.appsId ?? '').trim()
      const schemas = parsed.schemas
      if (!appsId) throw badRequest('Model response is missing appsId')
      if (!Array.isArray(schemas) || !schemas.length) throw badRequest('Model response contained no schemas')

      return schemas.map((s: Record<string, unknown>) => ({
        appsId,
        formId: String(s.formId ?? ''),
        description: s.description ? String(s.description) : undefined,
        fields: (s.fields ?? {}) as SchemaDraft['fields'],
      }))
    },

    async explain(input: ExplainInput): Promise<string> {
      const parts: string[] = []

      if (input.fieldId) {
        parts.push(`Explain only the "${input.fieldId}" field of this design, and why it was modelled that way.`)
      } else {
        parts.push('Explain what this design helps the owner keep track of, and why it is arranged this way.')
      }

      parts.push(`\nDesign:\n${JSON.stringify(input.schema, null, 2)}`)

      if (input.question) {
        parts.push(`\nThe user asks: "${input.question}"\nAnswer that question directly, in the same plain register.`)
      }

      return (await call(EXPLAIN_SYSTEM, parts.join('\n'), { maxTokens: 1024 })).trim()
    },
  }
}

/**
 * JSON-mode output is normally clean, but a truncated or fence-wrapped
 * response would otherwise surface as an unhelpful parse error. Strip fences,
 * then fall back to the outermost balanced object.
 */
function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        /* fall through */
      }
    }
    throw badRequest('Model returned malformed JSON', { snippet: cleaned.slice(0, 400) })
  }
}
