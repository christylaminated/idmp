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

export interface FieldDef {
  fieldId: string
  fieldType: FieldType
  description?: string
  required?: boolean
  unique?: boolean
  default?: unknown
  allowMultiple?: boolean
  currencyCode?: string
  fractionDigits?: number
  prefix?: string
  padding?: number
  linkedFormId?: string
  relatedFormId?: string
  relatedFieldId?: string
  embeddedFormSchema?: { fields: Record<string, FieldDef> }
  deprecated?: boolean
}

export interface SchemaDraft {
  appsId: string
  formId: string
  description?: string
  fields: Record<string, FieldDef>
}

export interface FormSchema extends SchemaDraft {
  _id?: string
  version: number
  deprecated: boolean
  ownerScoped: boolean
  createdBy: string
  createdAt: string
}

export interface AppsInfo {
  appsId: string
  appsName: string
  description?: string
}

export interface MoneyValue {
  centAmount: number
  currencyCode: string
  fractionDigits: number
}

export interface DeployReport {
  appsId: string
  deployed: Array<{ formId: string; version: number; collection: string }>
  failed: Array<{ formId: string; errors: unknown }>
}

export const OPERATORS = [
  { value: 'EQUALS', label: 'equals' },
  { value: 'NOT_EQUALS', label: 'does not equal' },
  { value: 'GREATER_THAN', label: 'is greater than' },
  { value: 'GREATER_THAN_OR_EQUAL', label: 'is at least' },
  { value: 'LESS_THAN', label: 'is less than' },
  { value: 'LESS_THAN_OR_EQUAL', label: 'is at most' },
  { value: 'IN', label: 'is one of' },
  { value: 'LIKE', label: 'contains' },
] as const

/** Operators that make sense for a given field type, so the builder cannot offer a nonsense query. */
export function operatorsFor(type: FieldType) {
  switch (type) {
    case 'TEXT':
    case 'EMAIL':
      return OPERATORS.filter((o) => ['EQUALS', 'NOT_EQUALS', 'LIKE', 'IN'].includes(o.value))
    case 'NUMERIC':
    case 'MONEY':
    case 'DATE':
      return OPERATORS.filter((o) => o.value !== 'LIKE')
    case 'BOOLEAN':
      return OPERATORS.filter((o) => ['EQUALS', 'NOT_EQUALS'].includes(o.value))
    default:
      return OPERATORS.filter((o) => ['EQUALS', 'NOT_EQUALS', 'IN'].includes(o.value))
  }
}

export function isMoney(v: unknown): v is MoneyValue {
  return typeof v === 'object' && v !== null && 'centAmount' in v
}

export function formatMoney(v: MoneyValue): string {
  const amount = v.centAmount / 10 ** v.fractionDigits
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: v.currencyCode }).format(amount)
  } catch {
    return `${amount.toFixed(v.fractionDigits)} ${v.currencyCode}`
  }
}

/** Renders any stored value for a results table or a record view. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (isMoney(v)) return formatMoney(v)
  if (Array.isArray(v)) return v.length ? `${v.length} linked` : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  // ISO timestamps come back as strings over JSON.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  return s
}
