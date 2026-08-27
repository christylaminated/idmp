import { ObjectId } from 'mongodb'
import type { FieldDef, FormSchema, MoneyValue } from '../types.js'
import { dataCollection, nextSequence } from '../db.js'
import { unprocessable } from '../errors.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface CoerceOptions {
  /** On update, absent fields are left alone rather than treated as missing. */
  partial?: boolean
}

/**
 * The write path. Everything that must happen before data reaches MongoDB
 * happens here: structural validation, strict type coercion,
 * referential integrity across LINKED fields, and uniqueness.
 *
 * Nothing downstream re-checks any of it, so this is the only place that has
 * to be right.
 */
export async function coerceRecord(
  schema: FormSchema,
  input: Record<string, unknown>,
  opts: CoerceOptions = {},
): Promise<Record<string, unknown>> {
  const errors: string[] = []
  const ctx: Ctx = { appsId: schema.appsId, formId: schema.formId }
  const doc = await coerceFields(ctx, schema.fields, input ?? {}, errors, [], opts)

  // An unknown field is almost always a typo or a stale client. Silently
  // dropping it loses data with no signal; storing it breaks the type
  // guarantees every query depends on.
  for (const key of Object.keys(input ?? {})) {
    if (!schema.fields[key]) errors.push(`${key}: not a field on schema "${schema.formId}"`)
  }

  if (errors.length) throw unprocessable('Record rejected by validation', errors)
  return doc
}

interface Ctx {
  appsId: string
  formId: string
}

async function coerceFields(
  ctx: Ctx,
  fields: Record<string, FieldDef>,
  input: Record<string, unknown>,
  errors: string[],
  path: string[],
  opts: CoerceOptions,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}

  for (const [key, def] of Object.entries(fields)) {
    const where = [...path, key].join('.')
    const raw = input?.[key]

    if (def.fieldType === 'RELATED') {
      // Computed on read from the inverse LINKED. Accepting a value here would
      // create exactly the duplicated state RELATED exists to avoid.
      if (raw !== undefined) errors.push(`${where}: RELATED is read-only and cannot be written`)
      continue
    }

    if (def.fieldType === 'SEQUENCE') {
      if (opts.partial) continue // never regenerate on update
      const n = await nextSequence(ctx.appsId, ctx.formId, key)
      out[key] = formatSequence(def, n)
      continue
    }

    if (raw === undefined || raw === null || raw === '') {
      if (opts.partial) continue
      if (def.default !== undefined) {
        out[key] = def.default
        continue
      }
      if (def.required) errors.push(`${where}: required`)
      continue
    }

    if (def.allowMultiple) {
      const list = Array.isArray(raw) ? raw : [raw]
      const coerced: unknown[] = []
      for (let i = 0; i < list.length; i++) {
        const v = await coerceScalar(ctx, def, list[i], `${where}[${i}]`, errors, [...path, key], opts)
        if (v !== undefined) coerced.push(v)
      }
      out[key] = coerced
    } else {
      if (Array.isArray(raw)) {
        errors.push(`${where}: expected a single value (allowMultiple is false)`)
        continue
      }
      const v = await coerceScalar(ctx, def, raw, where, errors, [...path, key], opts)
      if (v !== undefined) out[key] = v
    }
  }

  return out
}

async function coerceScalar(
  ctx: Ctx,
  def: FieldDef,
  raw: unknown,
  where: string,
  errors: string[],
  path: string[],
  opts: CoerceOptions,
): Promise<unknown> {
  switch (def.fieldType) {
    case 'TEXT':
      return String(raw)

    case 'NUMERIC': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(n)) {
        errors.push(`${where}: "${String(raw)}" is not a number`)
        return undefined
      }
      return n
    }

    case 'BOOLEAN': {
      if (typeof raw === 'boolean') return raw
      const s = String(raw).trim().toLowerCase()
      if (s === 'true' || s === '1' || s === 'yes') return true
      if (s === 'false' || s === '0' || s === 'no') return false
      errors.push(`${where}: "${String(raw)}" is not a boolean`)
      return undefined
    }

    case 'DATE': {
      // Stored as a BSON date, not a string. Range filters on a string date
      // compare lexically and quietly return the wrong rows.
      const d = raw instanceof Date ? raw : new Date(String(raw))
      if (Number.isNaN(d.getTime())) {
        errors.push(`${where}: "${String(raw)}" is not a valid date`)
        return undefined
      }
      return d
    }

    case 'EMAIL': {
      const s = String(raw).trim()
      if (!EMAIL_RE.test(s)) {
        errors.push(`${where}: "${s}" is not a valid email address`)
        return undefined
      }
      return s
    }

    case 'MONEY':
      return coerceMoney(def, raw, where, errors)

    case 'LINKED':
      return coerceLinked(ctx.appsId, def, raw, where, errors)

    case 'EMBED': {
      if (typeof raw !== 'object' || raw === null) {
        errors.push(`${where}: expected an object`)
        return undefined
      }
      return coerceFields(
        ctx,
        def.embeddedFormSchema!.fields,
        raw as Record<string, unknown>,
        errors,
        path,
        opts,
      )
    }

    default:
      return raw
  }
}

/**
 * Accepts a number (29.99), a numeric string, or an already-shaped money
 * object, and always stores integer minor units.
 */
export function coerceMoney(def: FieldDef, raw: unknown, where: string, errors: string[]): MoneyValue | undefined {
  const currencyCode = def.currencyCode ?? 'USD'
  const fractionDigits = def.fractionDigits ?? 2

  if (typeof raw === 'object' && raw !== null && 'centAmount' in raw) {
    const m = raw as Partial<MoneyValue>
    if (!Number.isFinite(m.centAmount)) {
      errors.push(`${where}: centAmount must be a number`)
      return undefined
    }
    return {
      centAmount: Math.round(m.centAmount as number),
      currencyCode: m.currencyCode ?? currencyCode,
      fractionDigits: m.fractionDigits ?? fractionDigits,
    }
  }

  const cleaned = String(raw).replace(/[$,\s]/g, '')
  const amount = Number(cleaned)
  if (!Number.isFinite(amount)) {
    errors.push(`${where}: "${String(raw)}" is not a monetary amount`)
    return undefined
  }

  return {
    centAmount: Math.round(amount * 10 ** fractionDigits),
    currencyCode,
    fractionDigits,
  }
}

/**
 * Referential integrity inside a document store: a LINKED value is only
 * accepted once the target record has been confirmed to exist.
 */
async function coerceLinked(
  appsId: string,
  def: FieldDef,
  raw: unknown,
  where: string,
  errors: string[],
): Promise<ObjectId | undefined> {
  const id = String(raw)
  if (!ObjectId.isValid(id)) {
    errors.push(`${where}: "${id}" is not a valid record id`)
    return undefined
  }

  const oid = new ObjectId(id)
  const exists = await dataCollection(appsId, def.linkedFormId!).countDocuments({ _id: oid }, { limit: 1 })
  if (!exists) {
    errors.push(`${where}: no record ${id} exists in "${def.linkedFormId}"`)
    return undefined
  }

  return oid
}

function formatSequence(def: FieldDef, n: number): string {
  const padded = String(n).padStart(def.padding ?? 4, '0')
  return def.prefix ? `${def.prefix}${padded}` : padded
}

/**
 * 1:1 is `allowMultiple: false` plus `unique: true` on a LINKED field. A unique
 * index can enforce it, but only for scalars — so check it explicitly and
 * return a message that names the conflict rather than surfacing E11000.
 */
export async function assertLinkUniqueness(
  schema: FormSchema,
  doc: Record<string, unknown>,
  excludeId?: ObjectId,
): Promise<void> {
  const errors: string[] = []

  for (const [key, def] of Object.entries(schema.fields)) {
    if (def.fieldType !== 'LINKED' || !def.unique) continue
    const value = doc[key]
    if (value === undefined) continue

    const query: Record<string, unknown> = { [key]: value }
    if (excludeId) query._id = { $ne: excludeId }

    const clash = await dataCollection(schema.appsId, schema.formId).findOne(query, { projection: { _id: 1 } })
    if (clash) {
      errors.push(
        `${key}: already linked by record ${String(clash._id)} — ` +
          `this is a one-to-one relationship`,
      )
    }
  }

  if (errors.length) throw unprocessable('Record rejected by validation', errors)
}
