import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Minimal .env loader.
 *
 * Looks in the repo root first, then in server/, so a single .env at the top
 * of the project configures everything. Values already present in the real
 * environment always win, so `FOO=bar npm run dev` still overrides the file.
 */
export function loadEnv(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../.env'), // repo root
    resolve(here, '../.env'), // server/
  ]

  const loaded: string[] = []

  for (const path of candidates) {
    if (!existsSync(path)) continue
    loaded.push(path)

    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const eq = line.indexOf('=')
      if (eq === -1) continue

      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()

      // Strip matched surrounding quotes, if someone wrapped the value.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (key && value && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }

  return loaded
}
