import type { FastifyInstance } from 'fastify'
import { principalOf } from '../auth.js'
import { ensureApp } from '../services/apps.js'
import * as Schemas from '../services/schemas.js'
import type { SchemaDraft } from '../validate/schema.js'

export default async function schemaRoutes(app: FastifyInstance) {
  app.post('/form/schema', async (req, reply) => {
    const { userId } = principalOf(req)
    const draft = req.body as SchemaDraft
    await ensureApp({ appsId: draft.appsId }, userId)
    const created = await Schemas.createSchema(draft, userId)
    return reply.code(201).send(created)
  })

  app.put('/form/schema', async (req) => {
    const { userId } = principalOf(req)
    return Schemas.updateSchema(req.body as SchemaDraft, userId)
  })

  /**
   * One-click deploy. Takes a whole generated model, orders it so every
   * reference resolves, and reports per-schema outcomes rather than failing
   * the batch on the first problem.
   */
  app.post('/form/schema/batch', async (req) => {
    const { userId } = principalOf(req)
    const body = req.body as {
      appsId: string
      appsName?: string
      description?: string
      schemas: SchemaDraft[]
    }

    await ensureApp({ appsId: body.appsId, appsName: body.appsName, description: body.description }, userId)
    return Schemas.deployBatch(body.appsId, body.schemas ?? [], userId)
  })

  app.get('/form/schema/:appsId/:formId', async (req) => {
    const { appsId, formId } = req.params as { appsId: string; formId: string }
    return Schemas.getSchema(appsId, formId)
  })

  app.delete('/form/schema/:appsId/:formId', async (req, reply) => {
    const { appsId, formId } = req.params as { appsId: string; formId: string }
    const dropData = (req.query as { dropData?: string }).dropData === 'true'
    await Schemas.deleteSchema(appsId, formId, dropData)
    return reply.code(204).send()
  })
}
