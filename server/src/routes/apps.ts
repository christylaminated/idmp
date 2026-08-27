import type { FastifyInstance } from 'fastify'
import { principalOf } from '../auth.js'
import * as Apps from '../services/apps.js'
import { listSchemas } from '../services/schemas.js'

export default async function appsRoutes(app: FastifyInstance) {
  app.post('/apps', async (req, reply) => {
    const { userId } = principalOf(req)
    const body = req.body as { appsId: string; appsName?: string; description?: string }
    const created = await Apps.createApp(body, userId)
    return reply.code(201).send(created)
  })

  app.get('/apps', async () => Apps.listApps())

  app.get('/apps/:appsId', async (req) => {
    const { appsId } = req.params as { appsId: string }
    return Apps.getApp(appsId)
  })

  app.get('/apps/:appsId/schemas', async (req) => {
    const { appsId } = req.params as { appsId: string }
    return listSchemas(appsId)
  })

  app.put('/apps', async (req) => {
    const body = req.body as { appsId: string } & Record<string, unknown>
    return Apps.updateApp(body.appsId, body)
  })

  app.delete('/apps/:appsId', async (req, reply) => {
    const { appsId } = req.params as { appsId: string }
    await Apps.deleteApp(appsId)
    return reply.code(204).send()
  })
}
