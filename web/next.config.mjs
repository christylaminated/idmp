import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Next only auto-loads .env files from this directory, but IDMP keeps a single
 * .env at the repo root so one file configures both the API and the web app.
 * Read it here so NEXT_PUBLIC_* values defined there actually reach the build.
 * Anything already in the real environment wins.
 */
function loadRootEnv() {
  const path = resolve(process.cwd(), '../.env')
  if (!existsSync(path)) return

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key && value && process.env[key] === undefined) process.env[key] = value
  }
}

loadRootEnv()

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_IDMP_API:
      process.env.NEXT_PUBLIC_IDMP_API ?? 'http://localhost:4441/no-code-db-api',
  },
}
