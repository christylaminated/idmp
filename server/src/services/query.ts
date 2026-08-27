import { ObjectId } from 'mongodb'
import type { Aggregation, FieldDef, Filter, FormSchema, LeafFilter, QueryRequest, SortSpec } from '../types.js'
import { isCompound, LEAF_OPERATORS } from '../types.js'
import { dataCollection } from '../db.js'
import { unprocessable } from '../errors.js'

const OPS: Record<string, string> = {
  EQUALS: '$eq',
  NOT_EQUALS: '$ne',
  GREATER_THAN: '$gt',
  GREATER_THAN_OR_EQUAL: '$gte',
  LESS_THAN: '$lt',
  LESS_THAN_OR_EQUAL: '$lte',
  IN: '$in',
}

/**
 * Walks a possibly-dotted path through the schema, descending into EMBED
 * sub-schemas, and returns the field definition it lands on.
 */
export function resolveField(schema: FormSchema, path: string): { def: FieldDef; segments: string[] } {
  const segments = path.split('.')
  let fields = schema.fields
  let def: FieldDef | undefined

  for (let i = 0; i < segments.length; i++) {
    def = fields[segments[i]]
    if (!def) throw unprocessable(`Unknown field "${path}" on schema "${schema.formId}"`)
    if (i < segments.length - 1) {
      if (def.fieldType !== 'EMBED' || !def.embeddedFormSchema) {
        throw unprocessable(`Field "${segments.slice(0, i + 1).join('.')}" is ${def.fieldType}, not a nested object`)
      }
      fields = def.embeddedFormSchema.fields
    }
  }

  return { def: def!, segments }
}

/** Regex metacharacters in user input are an injection vector. Escape, then translate SQL-style wildcards. */
function likeToRegex(value: unknown): RegExp {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = escaped.replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(pattern, 'i')
}

/**
 * Rewrites the (path, value) pair of a leaf filter into the storage
 * representation of its field type.
 *
 * This is the step that makes S4's `price < $50.00` return the right rows.
 * MONEY lives at `price.centAmount` as an integer; comparing a float against
 * the wrapper object matches nothing, and comparing against a stringified
 * price compares lexically. Either way the query returns a plausible,
 * wrong answer — exactly the failure a typed store is supposed to prevent.
 */
function coerceFilterValue(def: FieldDef, path: string, value: unknown): { path: string; value: unknown } {
  const one = (v: unknown): unknown => {
    switch (def.fieldType) {
      case 'MONEY': {
        if (typeof v === 'object' && v !== null && 'centAmount' in v) return (v as { centAmount: number }).centAmount
        const n = Number(String(v).replace(/[$,\s]/g, ''))
        if (!Number.isFinite(n)) throw unprocessable(`"${String(v)}" is not a monetary amount`)
        return Math.round(n * 10 ** (def.fractionDigits ?? 2))
      }
      case 'NUMERIC': {
        const n = Number(v)
        if (!Number.isFinite(n)) throw unprocessable(`"${String(v)}" is not a number`)
        return n
      }
      case 'DATE': {
        const d = v instanceof Date ? v : new Date(String(v))
        if (Number.isNaN(d.getTime())) throw unprocessable(`"${String(v)}" is not a date`)
        return d
      }
      case 'BOOLEAN': {
        if (typeof v === 'boolean') return v
        return String(v).toLowerCase() === 'true'
      }
      case 'LINKED': {
        const s = String(v)
        return ObjectId.isValid(s) ? new ObjectId(s) : s
      }
      default:
        return v
    }
  }

  const nextPath = def.fieldType === 'MONEY' ? `${path}.centAmount` : path
  return { path: nextPath, value: Array.isArray(value) ? value.map(one) : one(value) }
}

/** Compiles the filter tree into a `$match` document. */
export function buildMatch(schema: FormSchema, filter?: Filter): Record<string, unknown> {
  if (!filter) return {}

  if (isCompound(filter)) {
    const conditions = filter.conditions ?? []
    if (!Array.isArray(conditions) || conditions.length === 0) {
      throw unprocessable(`${filter.operator} requires a non-empty "conditions" array`)
    }
    const compiled = conditions.map((c) => buildMatch(schema, c))
    return filter.operator === 'AND' ? { $and: compiled } : { $or: compiled }
  }

  const leaf = filter as LeafFilter
  if (!LEAF_OPERATORS.includes(leaf.operator)) {
    throw unprocessable(`Unknown operator "${leaf.operator}"`)
  }

  const { def } = resolveField(schema, leaf.field)

  if (def.fieldType === 'RELATED') {
    throw unprocessable(`Cannot filter on RELATED field "${leaf.field}" — it is derived at read time`)
  }

  if (leaf.operator === 'LIKE') {
    if (def.fieldType !== 'TEXT' && def.fieldType !== 'EMAIL') {
      throw unprocessable(`LIKE is only valid on TEXT and EMAIL fields, not ${def.fieldType}`)
    }
    return { [leaf.field]: { $regex: likeToRegex(leaf.value) } }
  }

  if (leaf.operator === 'IN' && !Array.isArray(leaf.value)) {
    throw unprocessable(`IN requires an array value`)
  }

  const { path, value } = coerceFilterValue(def, leaf.field, leaf.value)
  return { [path]: { [OPS[leaf.operator]]: value } }
}

function buildSort(schema: FormSchema, sort?: SortSpec): Record<string, 1 | -1> | undefined {
  if (!sort?.field) return undefined
  const { def } = resolveField(schema, sort.field)
  const path = def.fieldType === 'MONEY' ? `${sort.field}.centAmount` : sort.field
  return { [path]: sort.direction === 'DESC' ? -1 : 1 }
}

export interface AggregationResult {
  aggregation: string
  field?: string
  groupBy?: string
  /** Present when there is no groupBy. */
  value?: unknown
  /** Present when grouped. */
  groups?: Array<{ key: unknown; value: unknown }>
}

/**
 * COUNT, SUM and AVG, each optionally grouped. SUM and AVG over MONEY operate
 * on integer minor units and are re-wrapped as money, so the caller never sees
 * a bare number where a currency belongs.
 */
export async function runAggregation(
  schema: FormSchema,
  agg: Aggregation,
  match: Record<string, unknown>,
): Promise<AggregationResult> {
  const coll = dataCollection(schema.appsId, schema.formId)

  let valueExpr: Record<string, unknown>
  let moneyDef: FieldDef | undefined

  if (agg.type === 'COUNT') {
    valueExpr = { $sum: 1 }
  } else {
    if (!agg.field) throw unprocessable(`${agg.type} requires a "field"`)
    const { def } = resolveField(schema, agg.field)
    if (def.fieldType !== 'NUMERIC' && def.fieldType !== 'MONEY') {
      throw unprocessable(`${agg.type} requires a NUMERIC or MONEY field, but "${agg.field}" is ${def.fieldType}`)
    }
    if (def.fieldType === 'MONEY') moneyDef = def
    const path = def.fieldType === 'MONEY' ? `$${agg.field}.centAmount` : `$${agg.field}`
    valueExpr = agg.type === 'SUM' ? { $sum: path } : { $avg: path }
  }

  let groupKey: unknown = null
  if (agg.groupBy) {
    const { def } = resolveField(schema, agg.groupBy)
    groupKey = def.fieldType === 'MONEY' ? `$${agg.groupBy}.centAmount` : `$${agg.groupBy}`
  }

  const pipeline: Record<string, unknown>[] = []
  if (Object.keys(match).length) pipeline.push({ $match: match })
  pipeline.push({ $group: { _id: groupKey, value: valueExpr } })
  if (agg.groupBy) pipeline.push({ $sort: { value: -1 } })

  const rows = await coll.aggregate(pipeline).toArray()

  const wrap = (v: unknown) =>
    moneyDef
      ? {
          centAmount: Math.round(Number(v)),
          currencyCode: moneyDef.currencyCode ?? 'USD',
          fractionDigits: moneyDef.fractionDigits ?? 2,
        }
      : v

  if (!agg.groupBy) {
    return {
      aggregation: agg.type,
      field: agg.field,
      value: rows.length ? wrap(rows[0].value) : agg.type === 'COUNT' ? 0 : null,
    }
  }

  return {
    aggregation: agg.type,
    field: agg.field,
    groupBy: agg.groupBy,
    groups: rows.map((r) => ({ key: r._id, value: wrap(r.value) })),
  }
}

export interface QueryOptions {
  ownerId?: string
}

export async function runQuery(schema: FormSchema, req: QueryRequest, opts: QueryOptions = {}) {
  const match = buildMatch(schema, req.filter)

  // Row-level scoping: a schema marked ownerScoped only ever returns the
  // caller's own records, on every read path.
  if (schema.ownerScoped && opts.ownerId) {
    Object.assign(match, { createdBy: opts.ownerId })
  }

  if (req.aggregation) {
    return runAggregation(schema, req.aggregation, match)
  }

  const cursor = dataCollection(schema.appsId, schema.formId)
    .find(match)
    .skip(Math.max(0, req.skip ?? 0))
    .limit(Math.min(Math.max(1, req.limit ?? 200), 1000))

  const sort = buildSort(schema, req.sort)
  if (sort) cursor.sort(sort)

  return cursor.toArray()
}

export { OPS }
