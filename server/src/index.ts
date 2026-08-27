import { loadEnv } from './env.js'

// Must run before anything reads process.env below.
const envFiles = loadEnv()

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { connect, disconnect } from './db.js'
import { isOpenMode, loadKeys } from './auth.js'
import { ApiError } from './errors.js'
import { setGenerator } from './llm/index.js'
import { createGeminiGenerator } from './llm/gemini.js'
import appsRoutes from './routes/apps.js'
import schemaRoutes from './routes/schema.js'
import dataRoutes from './routes/data.js'
import aiRoutes from './routes/ai.js'

const PORT = Number(process.env.PORT ?? 4441)
const HOST = process.env.HOST ?? '127.0.0.1'
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'
const MONGO_DB = process.env.MONGODB_DB ?? 'idmp'
const PREFIX = '/no-code-db-api'

async function main() {
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider()

  await app.register(cors, { origin: true })

  // Every rejection the validation layers raise carries a status and, where
  // it helps, a list of specific problems. Surface both rather than a bare 500.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({
        error: err.message,
        details: err.details,
        statusCode: err.statusCode,
      })
    }
    app.log.error(err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return reply.code(500).send({ error: message, statusCode: 500 })
  })

  loadKeys(process.env.IDMP_API_KEYS)

  if (process.env.GEMINI_API_KEY) {
    setGenerator(
      createGeminiGenerator({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL,
      }),
    )
  }

  // `MONGODB_URI=memory` boots a throwaway MongoDB in-process, so the whole
  // system runs with nothing installed. Data does not survive a restart.
  let uri = MONGO_URI
  let memoryServer: { stop(): Promise<unknown> } | undefined
  if (MONGO_URI === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const mem = await MongoMemoryServer.create()
    uri = mem.getUri()
    memoryServer = mem
    app.log.warn('Using an in-memory MongoDB — all data is discarded on shutdown')
  }

  await connect(uri, MONGO_DB)

  await app.register(
    async (scoped) => {
      scoped.get('/health', async () => ({
        status: 'ok',
        database: MONGO_DB,
        auth: isOpenMode() ? 'open' : 'api-key',
      }))
      await scoped.register(appsRoutes)
      await scoped.register(schemaRoutes)
      await scoped.register(dataRoutes)
      await scoped.register(aiRoutes)
    },
    { prefix: PREFIX },
  )

  await app.listen({ port: PORT, host: HOST })

  app.log.info(`IDMP API on http://${HOST}:${PORT}${PREFIX}`)
  if (envFiles.length) app.log.info(`Loaded env from ${envFiles.join(', ')}`)
  if (isOpenMode()) app.log.warn('Running with no API keys configured — all requests are attributed to usr_local')
  if (process.env.GEMINI_API_KEY) {
    app.log.info(`Schema generation enabled (${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'})`)
  } else {
    app.log.warn('GEMINI_API_KEY not set — /ai/generate and /ai/explain will fail')
  }

  const shutdown = async () => {
    await app.close()
    await disconnect()
    await memoryServer?.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
