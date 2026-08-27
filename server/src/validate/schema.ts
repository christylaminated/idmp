import { FIELD_TYPES, type FieldDef, type FieldType, type FormSchema } from '../types.js'
import { unprocessable } from '../errors.js'

export interface SchemaDraft {
  appsId: string
  formId: string
  description?: string
  fields: Record<string, FieldDef>
  semantic?: Record<string, unknown>
  ownerScoped?: boolean
}

/** Lookup for schemas that already exist, or are being deployed in the same batch. */
export type SchemaLookup = (formId: string) => FormSchema | SchemaDraft | undefined

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Validates a schema *definition* — before any record exists.
 *
 * The two relationship rules here are what make the deployment order matter:
 * a LINKED field cannot be created until its target schema exists, and a
 * RELATED field cannot be created unless a LINKED field somewhere else
 * genuinely points back. Both are checked here, once, rather than being
 * rediscovered on every write.
 */
export function validateSchemaDraft(draft: SchemaDraft, lookup: SchemaLookup): SchemaDraft {
  const errors: string[] = []

  if (!draft.appsId || !IDENT.test(draft.appsId)) {
    errors.push(`appsId "${draft.appsId}" must be alphanumeric and start with a letter`)
  }
  if (!draft.formId || !IDENT.test(draft.formId)) {
    errors.push(`formId "${draft.formId}" must be alphanumeric and start with a letter`)
  }
  if (!draft.fields || typeof draft.fields !== 'object' || Object.keys(draft.fields).length === 0) {
    errors.push('fields must be a non-empty object')
    throw unprocessable('Schema definition is invalid', errors)
  }

  const normalized: Record<string, FieldDef> = {}
  for (const [key, raw] of Object.entries(draft.fields)) {
    normalized[key] = validateField(draft, key, raw, lookup, errors, [])
  }

  if (errors.length) throw unprocessable('Schema definition is invalid', errors)

  return { ...draft, fields: normalized }
}

function validateField(
  draft: SchemaDraft,
  key: string,
  raw: FieldDef,
  lookup: SchemaLookup,
  errors: string[],
  path: string[],
): FieldDef {
  const where = [...path, key].join('.')

  if (!raw || typeof raw !== 'object') {
    errors.push(`${where}: field definition must be an object`)
    return { fieldId: key, fieldType: 'TEXT' }
  }

  // The generator is told every field key must equal its fieldId. Enforce it
  // rather than trusting it — a mismatch silently breaks form rendering.
  const field: FieldDef = { ...raw, fieldId: key }

  const type = field.fieldType as FieldType
  if (!FIELD_TYPES.includes(type)) {
    errors.push(`${where}: unknown fieldType "${String(field.fieldType)}" (expected one of ${FIELD_TYPES.join(', ')})`)
    return field
  }

  switch (type) {
    case 'MONEY':
      // The generator sometimes omits these. Defaulting beats rejecting: the
      // storage shape stays correct either way, and the prompt path stays robust.
      field.currencyCode = field.currencyCode ?? 'USD'
      field.fractionDigits = field.fractionDigits ?? 2
      if (!Number.isInteger(field.fractionDigits) || field.fractionDigits < 0 || field.fractionDigits > 6) {
        errors.push(`${where}: fractionDigits must be an integer between 0 and 6`)
      }
      break

    case 'SEQUENCE':
      // Server-assigned, so user-facing constraints are meaningless on it.
      delete field.required
      delete field.unique
      field.padding = field.padding ?? 4
      break

    case 'LINKED': {
      if (!field.linkedFormId) {
        errors.push(`${where}: LINKED requires linkedFormId`)
        break
      }
      if (field.linkedFormId === draft.formId) {
        // Self-reference is legal (e.g. Category.parentCategory) but only if
        // the schema is being created, since it resolves against itself.
        break
      }
      if (!lookup(field.linkedFormId)) {
        errors.push(
          `${where}: LINKED target "${field.linkedFormId}" does not exist in app "${draft.appsId}". ` +
            `Create it first, or deploy both in one batch.`,
        )
      }
      break
    }

    case 'RELATED': {
      if (!field.relatedFormId || !field.relatedFieldId) {
        errors.push(`${where}: RELATED requires relatedFormId and relatedFieldId`)
        break
      }
      const target = lookup(field.relatedFormId)
      if (!target) {
        errors.push(`${where}: RELATED target schema "${field.relatedFormId}" does not exist`)
        break
      }
      const inverse = target.fields[field.relatedFieldId]
      if (!inverse) {
        errors.push(`${where}: RELATED target field "${field.relatedFormId}.${field.relatedFieldId}" does not exist`)
        break
      }
      if (inverse.fieldType !== 'LINKED') {
        errors.push(
          `${where}: RELATED must point at a LINKED field, but ` +
            `"${field.relatedFormId}.${field.relatedFieldId}" is ${inverse.fieldType}`,
        )
        break
      }
      if (inverse.linkedFormId !== draft.formId) {
        errors.push(
          `${where}: inverse mismatch — "${field.relatedFormId}.${field.relatedFieldId}" ` +
            `links to "${inverse.linkedFormId}", not "${draft.formId}"`,
        )
      }
      // Always array-valued: the inverse of a reference is a set.
      field.allowMultiple = true
      break
    }

    case 'EMBED': {
      const sub = field.embeddedFormSchema
      if (!sub || typeof sub !== 'object' || !sub.fields || Object.keys(sub.fields).length === 0) {
        errors.push(`${where}: EMBED requires embeddedFormSchema with at least one field`)
        break
      }
      if (path.length >= 3) {
        errors.push(`${where}: EMBED nesting deeper than 4 levels is not supported`)
        break
      }
      const nested: Record<string, FieldDef> = {}
      for (const [k, v] of Object.entries(sub.fields)) {
        nested[k] = validateField(draft, k, v, lookup, errors, [...path, key])
      }
      field.embeddedFormSchema = { fields: nested }
      break
    }
  }

  return field
}

/**
 * Schema evolution without migrations, which only holds if three rules are
 * enforced together: types never change, new fields
 * are optional so existing records stay valid, and removals are soft so no
 * data is destroyed.
 */
export interface SchemaDiff {
  added: string[]
  deprecated: string[]
  unchanged: string[]
}

export function diffSchema(prev: Record<string, FieldDef>, next: Record<string, FieldDef>): SchemaDiff {
  const errors: string[] = []
  const added: string[] = []
  const deprecated: string[] = []
  const unchanged: string[] = []

  for (const [key, nextField] of Object.entries(next)) {
    const prevField = prev[key]
    if (!prevField) {
      // A new required field would invalidate every record already stored,
      // unless there is a default to backfill the read with.
      if (nextField.required && nextField.default === undefined) {
        errors.push(
          `${key}: a new field cannot be required without a default — ` +
            `existing records have no value for it`,
        )
      }
      added.push(key)
      continue
    }
    if (prevField.fieldType !== nextField.fieldType) {
      errors.push(
        `${key}: field types are immutable (${prevField.fieldType} to ${nextField.fieldType} is not allowed)`,
      )
      continue
    }
    unchanged.push(key)
  }

  for (const key of Object.keys(prev)) {
    if (!next[key]) deprecated.push(key)
  }

  if (errors.length) throw unprocessable('Schema update rejected', errors)

  return { added, deprecated, unchanged }
}

/**
 * Orders schemas so every LINKED target is created before the schema that
 * points at it. Cycles are tolerated — a cycle just means one of the links
 * resolves on a later pass, and the caller retries.
 */
export function topoSort<T extends SchemaDraft>(drafts: T[]): T[] {
  const byId = new Map(drafts.map((d) => [d.formId, d]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const out: T[] = []

  const deps = (draft: SchemaDraft): string[] => {
    const found = new Set<string>()
    const walk = (fields: Record<string, FieldDef>) => {
      for (const f of Object.values(fields)) {
        if (f?.fieldType === 'LINKED' && f.linkedFormId && f.linkedFormId !== draft.formId) {
          found.add(f.linkedFormId)
        } else if (f?.fieldType === 'EMBED' && f.embeddedFormSchema) {
          walk(f.embeddedFormSchema.fields)
        }
      }
    }
    walk(draft.fields)
    return [...found]
  }

  const visit = (formId: string) => {
    if (visited.has(formId) || visiting.has(formId)) return
    const draft = byId.get(formId)
    if (!draft) return
    visiting.add(formId)
    for (const dep of deps(draft)) visit(dep)
    visiting.delete(formId)
    visited.add(formId)
    out.push(draft)
  }

  for (const d of drafts) visit(d.formId)
  return out
}

/**
 * RELATED fields are resolved at read time and never stored, so a schema
 * carrying only RELATED additions still has to be applied after its inverse
 * exists. Split them out so a batch can deploy LINKED first, RELATED second.
 */
export function splitRelatedFields(draft: SchemaDraft): { base: SchemaDraft; related: Record<string, FieldDef> } {
  const base: Record<string, FieldDef> = {}
  const related: Record<string, FieldDef> = {}
  for (const [k, v] of Object.entries(draft.fields)) {
    if (v.fieldType === 'RELATED') related[k] = v
    else base[k] = v
  }
  return { base: { ...draft, fields: base }, related }
}
