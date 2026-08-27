import type { FastifyInstance } from 'fastify'
import { generator, hasGenerator } from '../llm/index.js'
import { getSchema, listSchemas } from '../services/schemas.js'
import { badRequest } from '../errors.js'

export default async function aiRoutes(app: FastifyInstance) {
  /**
   * Natural language to a set of blueprint schemas.
   *
   * Deliberately does not deploy: the user reviews and edits types in the
   * Blueprint Visualizer before anything is created. Deployment is a
   * separate, explicit call.
   */
  app.post('/ai/generate', async (req) => {
    const { prompt } = req.body as { prompt?: string }
    if (!prompt?.trim()) throw badRequest('prompt is required')

    const started = Date.now()
    const schemas = await generator().generate(prompt.trim())

    return {
      appsId: schemas[0]?.appsId,
      schemas,
      generator: generator().name,
      elapsedMs: Date.now() - started,
    }
  })

  /** The tutor. Explains a whole app, one schema, one field, or a follow-up question. */
  app.post('/ai/explain', async (req) => {
    const body = req.body as {
      appsId?: string
      formId?: string
      fieldId?: string
      question?: string
      schema?: unknown
    }

    let subject = body.schema

    if (!subject && body.appsId) {
      subject = body.formId ? await getSchema(body.appsId, body.formId) : await listSchemas(body.appsId)
    }

    if (!subject) throw badRequest('Provide a schema, or an appsId (optionally with formId)')

    const text = await generator().explain({
      schema: subject,
      fieldId: body.fieldId,
      question: body.question,
    })

    return { explanation: text, generator: generator().name }
  })

  app.get('/ai/status', async () => ({
    configured: hasGenerator(),
    generator: hasGenerator() ? generator().name : null,
  }))
}
