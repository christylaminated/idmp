import { ApiError } from '../errors.js'
import type { SchemaDraft } from '../validate/schema.js'

/**
 * The provider seam. Generation and explanation are the only two things IDMP
 * asks a model to do; anything that implements these two calls can be dropped
 * in.
 */
export interface SchemaGenerator {
  readonly name: string
  /** Natural language to a set of interconnected schema drafts sharing one appsId. */
  generate(prompt: string): Promise<SchemaDraft[]>
  /** Plain-language explanation of a schema, a single field, or a follow-up question. */
  explain(input: ExplainInput): Promise<string>
}

export interface ExplainInput {
  schema: unknown
  /** When set, explain just this field rather than the whole schema. */
  fieldId?: string
  /** A follow-up question from the user, answered in the same plain register. */
  question?: string
}

let active: SchemaGenerator | undefined

export function setGenerator(g: SchemaGenerator): void {
  active = g
}

export function generator(): SchemaGenerator {
  if (!active) {
    // A missing key is a configuration state, not a crash — say so with a
    // status the client can act on rather than a 500.
    throw new ApiError(
      503,
      'Schema generation is not configured on this server. ' +
        'Set GEMINI_API_KEY in .env and restart the API (see README).',
    )
  }
  return active
}

export function hasGenerator(): boolean {
  return Boolean(active)
}
