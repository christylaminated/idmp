import type { FastifyInstance } from 'fastify'
import { principalOf } from '../auth.js'
import { getSchema } from '../services/schemas.js'
import * as Records from '../services/records.js'
import { runQuery } from '../services/query.js'
import type { QueryRequest } from '../types.js'

export default async function dataRoutes(app: FastifyInstance) {
  /**
   * Insert when `fields` is present, list when it is not. The shape comes from
   * the original API and is kept so existing clients and the agent docs stay
   * accurate.
   */
  app.post('/form/data', async (req, reply) => {
    const { userId } = principalOf(req)
    const body = req.body as { appsId: string; formId: string; fields?: Record<string, unknown> }
    const schema = await getSchema(body.appsId, body.formId)

    if (body.fields) {
      const created = await Records.createRecord(schema, body.fields, { userId })
      return reply.code(201).send(created)
    }

    const rows = await runQuery(schema, { appsId: body.appsId, formId: body.formId }, { ownerId: userId })
    const resolved = await Records.resolveRelated(schema, rows as Record<string, unknown>[])
    const labels = await Records.resolveLinkLabels(schema, resolved)
    return { records: resolved, labels }
  })

  app.put('/form/data', async (req) => {
    const { userId } = principalOf(req)
    const body = req.body as { appsId: string; formId: string; _id: string; fields: Record<string, unknown> }
    const schema = await getSchema(body.appsId, body.formId)
    return Records.updateRecord(schema, body._id, body.fields, { userId })
  })

  app.delete('/form/data/:appsId/:formId/:id', async (req, reply) => {
    const { appsId, formId, id } = req.params as { appsId: string; formId: string; id: string }
    const schema = await getSchema(appsId, formId)
    await Records.deleteRecord(schema, id)
    return reply.code(204).send()
  })

  /** Filters, sort, and aggregations. The no-code query interface talks to this. */
  app.post('/form/data/query', async (req) => {
    const { userId } = principalOf(req)
    const body = req.body as QueryRequest
    const schema = await getSchema(body.appsId, body.formId)

    const result = await runQuery(schema, body, { ownerId: userId })

    if (!Array.isArray(result)) return result

    const resolved = await Records.resolveRelated(schema, result as Record<string, unknown>[])
    const labels = await Records.resolveLinkLabels(schema, resolved)
    return { records: resolved, labels, count: resolved.length }
  })

  /**
   * Options for a LINKED field's dropdown. This is what makes selecting a
   * non-existent target impossible in the generated forms rather than merely
   * rejected after the fact.
   */
  app.get('/form/options/:appsId/:formId/:fieldId', async (req) => {
    const { appsId, formId, fieldId } = req.params as { appsId: string; formId: string; fieldId: string }
    const schema = await getSchema(appsId, formId)
    const def = schema.fields[fieldId]

    if (!def || def.fieldType !== 'LINKED') {
      return { options: [] }
    }

    const target = await getSchema(appsId, def.linkedFormId!)
    const rows = await runQuery(target, { appsId, formId: def.linkedFormId!, limit: 500 })

    return {
      linkedFormId: def.linkedFormId,
      options: (rows as Record<string, unknown>[]).map((r) => ({
        value: String(r._id),
        label: Records.labelFor(target, r),
      })),
    }
  })
}
