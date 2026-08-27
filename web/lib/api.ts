import type { AppsInfo, DeployReport, FormSchema, SchemaDraft } from './types'

const BASE = process.env.NEXT_PUBLIC_IDMP_API ?? 'http://localhost:4441/no-code-db-api'

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
  /** Flattens the API's `details` array into something a user can act on. */
  get lines(): string[] {
    if (Array.isArray(this.details)) return this.details.map(String)
    if (this.details) return [JSON.stringify(this.details)]
    return [this.message]
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Cannot reach the IDMP API at ${BASE}. Is the server running?`)
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText, (body as { details?: unknown }).details)
  }
  return body as T
}

export const api = {
  health: () => request<{ status: string; database: string }>('/health'),

  aiStatus: () => request<{ configured: boolean; generator: string | null }>('/ai/status'),

  generate: (prompt: string) =>
    request<{ appsId: string; schemas: SchemaDraft[]; generator: string; elapsedMs: number }>('/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  explain: (input: { appsId?: string; formId?: string; fieldId?: string; question?: string; schema?: unknown }) =>
    request<{ explanation: string }>('/ai/explain', { method: 'POST', body: JSON.stringify(input) }),

  listApps: () => request<AppsInfo[]>('/apps'),

  listSchemas: (appsId: string) => request<FormSchema[]>(`/apps/${appsId}/schemas`),

  deploy: (appsId: string, schemas: SchemaDraft[], appsName?: string) =>
    request<DeployReport>('/form/schema/batch', {
      method: 'POST',
      body: JSON.stringify({ appsId, appsName, schemas }),
    }),

  insert: (appsId: string, formId: string, fields: Record<string, unknown>) =>
    request<Record<string, unknown>>('/form/data', {
      method: 'POST',
      body: JSON.stringify({ appsId, formId, fields }),
    }),

  list: (appsId: string, formId: string) =>
    request<{ records: Record<string, unknown>[]; labels: Record<string, Record<string, string>> }>('/form/data', {
      method: 'POST',
      body: JSON.stringify({ appsId, formId }),
    }),

  query: (body: Record<string, unknown>) =>
    request<
      | { records: Record<string, unknown>[]; labels: Record<string, Record<string, string>>; count: number }
      | { aggregation: string; value?: unknown; groups?: Array<{ key: unknown; value: unknown }>; groupBy?: string }
    >('/form/data/query', { method: 'POST', body: JSON.stringify(body) }),

  options: (appsId: string, formId: string, fieldId: string) =>
    request<{ linkedFormId: string; options: Array<{ value: string; label: string }> }>(
      `/form/options/${appsId}/${formId}/${fieldId}`,
    ),
}

export { BASE as API_BASE }
