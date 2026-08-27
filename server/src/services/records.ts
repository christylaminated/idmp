import { ObjectId } from 'mongodb'
import { dataCollection } from '../db.js'
import { conflict, notFound, unprocessable } from '../errors.js'
import type { FieldDef, FormSchema } from '../types.js'
import { assertLinkUniqueness, coerceRecord } from '../validate/record.js'
import { getSchema } from './schemas.js'

export interface WriteContext {
  userId: string
}

export async function createRecord(
  schema: FormSchema,
  fields: Record<string, unknown>,
  ctx: WriteContext,
): Promise<Record<string, unknown>> {
  const doc = await coerceRecord(schema, fields)
  await assertLinkUniqueness(schema, doc)

  const payload = {
    ...doc,
    createdBy: ctx.userId,
    createdAt: new Date(),
  }

  try {
    const res = await dataCollection(schema.appsId, schema.formId).insertOne(payload as never)
    return { _id: res.insertedId, ...payload }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const key = Object.keys((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {})[0]
      throw conflict(`A record with this ${key ?? 'value'} already exists`, { field: key })
    }
    throw err
  }
}

export async function updateRecord(
  schema: FormSchema,
  id: string,
  fields: Record<string, unknown>,
  ctx: WriteContext,
): Promise<Record<string, unknown>> {
  if (!ObjectId.isValid(id)) throw unprocessable(`"${id}" is not a valid record id`)
  const oid = new ObjectId(id)

  const doc = await coerceRecord(schema, fields, { partial: true })
  await assertLinkUniqueness(schema, doc, oid)

  const res = await dataCollection(schema.appsId, schema.formId).findOneAndUpdate(
    { _id: oid },
    { $set: { ...doc, updatedBy: ctx.userId, updatedAt: new Date() } },
    { returnDocument: 'after' },
  )

  if (!res) throw notFound(`Record ${id} not found in "${schema.formId}"`)
  return res
}

export async function deleteRecord(schema: FormSchema, id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw unprocessable(`"${id}" is not a valid record id`)
  await dataCollection(schema.appsId, schema.formId).deleteOne({ _id: new ObjectId(id) })
}

/**
 * Resolves every RELATED field on a page of records.
 *
 * RELATED is the inverse of a LINKED and is never stored, so it has to be
 * computed. The cost of doing that naively is an extra query per record per
 * field; instead each field is resolved once for the whole page with a single
 * `$in`, then stitched back on. One extra round trip per RELATED field,
 * regardless of page size.
 */
export async function resolveRelated(
  schema: FormSchema,
  records: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const relatedFields = Object.entries(schema.fields).filter(
    ([, def]) => def.fieldType === 'RELATED' && !def.deprecated,
  )
  if (!relatedFields.length || !records.length) return records

  const ids = records.map((r) => r._id as ObjectId).filter(Boolean)

  for (const [key, def] of relatedFields) {
    const rows = await dataCollection(schema.appsId, def.relatedFormId!)
      .find({ [def.relatedFieldId!]: { $in: ids } })
      .toArray()

    const bucket = new Map<string, Record<string, unknown>[]>()
    for (const row of rows) {
      // The inverse field may itself be array-valued (the N:N case), so a
      // single row can belong to several parents.
      const raw = row[def.relatedFieldId!]
      const owners = Array.isArray(raw) ? raw : [raw]
      for (const owner of owners) {
        const k = String(owner)
        if (!bucket.has(k)) bucket.set(k, [])
        bucket.get(k)!.push(row)
      }
    }

    for (const record of records) {
      record[key] = bucket.get(String(record._id)) ?? []
    }
  }

  return records
}

/**
 * Expands LINKED ids into a short human-readable label, so a form dropdown or
 * a results table can show "Ada Lovelace" instead of an ObjectId.
 */
export async function resolveLinkLabels(
  schema: FormSchema,
  records: Record<string, unknown>[],
): Promise<Record<string, Record<string, string>>> {
  const labels: Record<string, Record<string, string>> = {}
  const linked = Object.entries(schema.fields).filter(([, d]) => d.fieldType === 'LINKED' && !d.deprecated)

  for (const [key, def] of linked) {
    const ids = records
      .flatMap((r) => (Array.isArray(r[key]) ? (r[key] as unknown[]) : [r[key]]))
      .filter(Boolean) as ObjectId[]
    if (!ids.length) continue

    const target = await getSchema(schema.appsId, def.linkedFormId!).catch(() => undefined)
    if (!target) continue

    const rows = await dataCollection(schema.appsId, def.linkedFormId!)
      .find({ _id: { $in: ids } })
      .toArray()

    labels[key] = {}
    for (const row of rows) labels[key][String(row._id)] = labelFor(target, row)
  }

  return labels
}

/** Picks the most human field available: first TEXT, else EMAIL, else SEQUENCE, else the id. */
export function labelFor(schema: FormSchema, row: Record<string, unknown>): string {
  const pick = (types: FieldDef['fieldType'][]) =>
    Object.entries(schema.fields).find(([k, d]) => types.includes(d.fieldType) && row[k])?.[0]

  const key = pick(['TEXT']) ?? pick(['EMAIL']) ?? pick(['SEQUENCE'])
  return key ? String(row[key]) : String(row._id)
}
