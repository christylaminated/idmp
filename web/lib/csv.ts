/**
 * Excel-faithful CSV parsing and column type inference.
 *
 * The parser is carried over from the original IDMP frontend, which handled
 * the cases a naive split does not: a BOM, a `sep=;` hint line, quoted fields
 * containing the delimiter or a newline, `""` as an escaped quote, and mixed
 * line endings. Inference is rewritten — the original checked NUMERIC before
 * MONEY, so a price column could never be detected as money.
 */
import type { FieldDef, FieldType } from './types'

const stripBOM = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

function extractSepHint(content: string): { delimiter: string | null; body: string } {
  const nl = content.search(/\r?\n/)
  const firstLine = (nl === -1 ? content : content.slice(0, nl)).trim()
  if (/^sep=.$/i.test(firstLine)) {
    const delimiter = firstLine[4]
    const skip = content[nl] === '\r' && content[nl + 1] === '\n' ? 2 : 1
    return { delimiter, body: nl === -1 ? '' : content.slice(nl + skip) }
  }
  return { delimiter: null, body: content }
}

/** Scores candidate delimiters by how consistent a column count they produce. */
export function detectDelimiter(content: string): string {
  const candidates = [',', ';', '\t', '|']
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 50)
  if (!lines.length) return ','

  const splitQuoted = (line: string, d: string): number => {
    let count = 1
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') i++
        else inQuotes = !inQuotes
      } else if (c === d && !inQuotes) count++
    }
    return count
  }

  let best = { d: ',', score: -Infinity }
  for (const d of candidates) {
    const counts = lines.map((l) => splitQuoted(l, d))
    const sorted = [...counts].sort((a, b) => a - b)
    const mode = sorted[Math.floor(sorted.length / 2)] || 1
    const variance = -counts.reduce((s, c) => s + Math.abs(c - mode), 0)
    const score = variance + (mode > 1 ? 1000 : -1000)
    if (score > best.score) best = { d, score }
  }
  return best.d
}

export function parseCsv(content: string, userDelimiter?: string): string[][] {
  const stripped = stripBOM(content)
  const { delimiter: hinted, body } = extractSepHint(stripped)
  const delimiter = userDelimiter ?? hinted ?? detectDelimiter(body)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((c) => c !== '')) rows.push(row)
    row = []
  }

  while (i < body.length) {
    const char = body[i]
    const next = body[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += char
      i++
      continue
    }

    if (char === '"' && field === '') inQuotes = true
    else if (char === delimiter) pushField()
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && next === '\n') i++
      pushRow()
    } else field += char
    i++
  }

  if (field !== '' || row.length) pushRow()
  return rows
}

const MONEY_RE = /^-?[$€£]?\s?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^-?[$€£]?\s?\d+\.\d{2}$/
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Order matters. Money is checked before plain numbers, because every money
 * value is also a valid number and the more specific reading is the useful
 * one. Booleans come first because `0` and `1` are ambiguous.
 */
function detectType(value: string): FieldType {
  const v = value.trim()
  if (!v) return 'TEXT'

  const lower = v.toLowerCase()
  if (lower === 'true' || lower === 'false' || lower === 'yes' || lower === 'no') return 'BOOLEAN'
  if (EMAIL_RE.test(v)) return 'EMAIL'
  if (/[$€£]/.test(v) && MONEY_RE.test(v)) return 'MONEY'
  if (MONEY_RE.test(v) && /\.\d{2}$/.test(v)) return 'MONEY'
  if (!Number.isNaN(Number(v.replace(/,/g, '')))) return 'NUMERIC'
  if (ISO_DATE_RE.test(v) || SLASH_DATE_RE.test(v)) return 'DATE'
  return 'TEXT'
}

export interface InferredColumn {
  column: string
  fieldId: string
  fieldType: FieldType
  sample: string
  /** Set when a column was mixed enough that the winning type is a judgement call. */
  warning?: string
}

/** Column names come from a spreadsheet, so normalise them into valid field ids. */
function toFieldId(header: string, index: number): string {
  const cleaned = header
    .trim()
    .replace(/[^A-Za-z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, '')
  const withLead = /^[A-Za-z]/.test(cleaned) ? cleaned : `col${cleaned}`
  return withLead || `column${index + 1}`
}

/**
 * A column takes a type only when at least 90% of its non-empty values agree.
 * Below that the column is stored as text and the disagreement is surfaced,
 * because silently coercing the minority to null loses data without telling
 * anyone.
 */
export function inferColumns(rows: string[][]): InferredColumn[] {
  if (!rows.length) return []
  const [headers, ...dataRows] = rows

  return headers.map((header, col) => {
    const values = dataRows.map((r) => r[col] ?? '').filter((v) => v.trim() !== '')
    const counts = new Map<FieldType, number>()
    for (const v of values) {
      const t = detectType(v)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }

    let fieldType: FieldType = 'TEXT'
    let warning: string | undefined

    if (values.length) {
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
      const [topType, topCount] = ranked[0]
      if (topCount / values.length >= 0.9) {
        fieldType = topType
        if (topCount < values.length) {
          warning = `${values.length - topCount} of ${values.length} values are not ${topType.toLowerCase()}`
        }
      } else {
        warning = `mixed types (${ranked.map(([t, c]) => `${c} ${t.toLowerCase()}`).join(', ')}) — stored as text`
      }
    }

    return {
      column: header,
      fieldId: toFieldId(header, col),
      fieldType,
      sample: dataRows.find((r) => (r[col] ?? '').trim() !== '')?.[col] ?? '',
      warning,
    }
  })
}

export function columnsToFields(columns: InferredColumn[]): Record<string, FieldDef> {
  const fields: Record<string, FieldDef> = {}
  for (const c of columns) {
    fields[c.fieldId] = {
      fieldId: c.fieldId,
      fieldType: c.fieldType,
      ...(c.fieldType === 'MONEY' ? { currencyCode: 'USD', fractionDigits: 2 } : {}),
    }
  }
  return fields
}

/** Maps each CSV row onto the inferred field ids, leaving coercion to the API. */
export function rowsToRecords(rows: string[][], columns: InferredColumn[]): Record<string, unknown>[] {
  return rows.slice(1).map((row) => {
    const record: Record<string, unknown> = {}
    columns.forEach((c, i) => {
      const raw = (row[i] ?? '').trim()
      if (raw !== '') record[c.fieldId] = raw
    })
    return record
  })
}
