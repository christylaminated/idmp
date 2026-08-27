import type { FastifyRequest } from 'fastify'
import { unauthorized } from './errors.js'

/**
 * Deliberately minimal, but real: an API key resolves to a stable user id that
 * gets stamped onto every document as `createdBy`. Schemas flagged
 * `ownerScoped` then filter every read by that id, which is the whole
 * multi-tenancy story.
 *
 * Keys come from IDMP_API_KEYS as `key:userId` pairs, comma separated.
 * With none configured the server runs open and attributes writes to
 * `usr_local` — convenient for a demo, wrong for anything else.
 */
export interface Principal {
  userId: string
}

const keyring = new Map<string, string>()
let openMode = true

export function loadKeys(raw?: string): void {
  keyring.clear()
  const entries = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const entry of entries) {
    const [key, userId] = entry.split(':')
    if (key && userId) keyring.set(key, userId)
  }
  openMode = keyring.size === 0
}

export function isOpenMode(): boolean {
  return openMode
}

export function principalOf(req: FastifyRequest): Principal {
  if (openMode) return { userId: 'usr_local' }

  const header = req.headers.authorization ?? ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : (req.headers['x-api-key'] as string | undefined)
  const userId = key ? keyring.get(key) : undefined
  if (!userId) throw unauthorized()

  return { userId }
}
