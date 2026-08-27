/**
 * IDMP field-type model.
 *
 * Ten typed field kinds. Five scalar, one format-validated scalar, one
 * server-generated, one nesting, and two relationship types. This is the
 * hybrid field-type schema model: relational structure
 * (typed references, cardinality, referential integrity) expressed inside a
 * document store, with no relational engine underneath.
 */
export const FIELD_TYPES = [
  'TEXT',
  'NUMERIC',
  'BOOLEAN',
  'DATE',
  'MONEY',
  'EMAIL',
  'SEQUENCE',
  'EMBED',
  'LINKED',
  'RELATED',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export interface EmbeddedFormSchema {
  fields: Record<string, FieldDef>
}

export interface FieldDef {
  fieldId: string
  fieldType: FieldType
  description?: string

  /** Rejected on create if absent. Never applied to SEQUENCE or RELATED. */
  required?: boolean
  /** Backed by a real unique index on the collection. */
  unique?: boolean
  default?: unknown
  /** Array-valued. For LINKED this is what turns 1:N into N:N. */
  allowMultiple?: boolean

  /** MONEY. Defaults to USD / 2 when the generator omits them. */
  currencyCode?: string
  fractionDigits?: number

  /** SEQUENCE. `prefix` + zero-padded counter, e.g. ORD-0001. */
  prefix?: string
  padding?: number

  /** LINKED: the formId this field points at. */
  linkedFormId?: string

  /** RELATED: the LINKED field elsewhere that points back at us. */
  relatedFormId?: string
  relatedFieldId?: string

  /** EMBED. Recursive. */
  embeddedFormSchema?: EmbeddedFormSchema

  /** Soft-removed by a schema update. Retained so existing data stays readable. */
  deprecated?: boolean
}

/**
 * Money is stored as an integer minor unit, never a float and never a string.
 * This is what makes range filters (`price < $50.00`) correct — the whole
 * point of S4. A text store returns wrong rows for the same query.
 */
export interface MoneyValue {
  centAmount: number
  currencyCode: string
  fractionDigits: number
}

export interface AppsInfo {
  appsId: string
  appsName: string
  description?: string
  createdBy: string
  createdAt: Date
}

export interface FormSchema {
  appsId: string
  formId: string
  description?: string
  fields: Record<string, FieldDef>
  semantic?: Record<string, unknown>
  version: number
  deprecated: boolean
  ownerScoped: boolean
  createdBy: string
  createdAt: Date
  createdAtIsoLocal?: string
  hexId?: string
}

/* ------------------------------------------------------------------ */
/* Query contract                                                      */
/* ------------------------------------------------------------------ */

export const LEAF_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'IN',
  'LIKE',
] as const

export type LeafOperator = (typeof LEAF_OPERATORS)[number]
export type Operator = LeafOperator | 'AND' | 'OR'

export interface LeafFilter {
  field: string
  operator: LeafOperator
  value: unknown
}

export interface CompoundFilter {
  operator: 'AND' | 'OR'
  conditions: Filter[]
}

export type Filter = LeafFilter | CompoundFilter

export function isCompound(f: Filter): f is CompoundFilter {
  return (f as CompoundFilter).operator === 'AND' || (f as CompoundFilter).operator === 'OR'
}

export type AggregationType = 'COUNT' | 'SUM' | 'AVG'

export interface Aggregation {
  type: AggregationType
  /** Required for SUM and AVG. Ignored by COUNT. */
  field?: string
  /** Optional group key, e.g. count orders per customerId. */
  groupBy?: string
}

export interface SortSpec {
  field: string
  direction?: 'ASC' | 'DESC'
}

export interface QueryRequest {
  appsId: string
  formId: string
  filter?: Filter
  aggregation?: Aggregation
  sort?: SortSpec
  limit?: number
  skip?: number
}
