import { dataCollection, db, schemas } from '../db.js'
import { conflict, notFound } from '../errors.js'
import type { FieldDef, FormSchema } from '../types.js'
import { diffSchema, splitRelatedFields, topoSort, validateSchemaDraft, type SchemaDraft } from '../validate/schema.js'

export async function listSchemas(appsId: string): Promise<FormSchema[]> {
  return schemas().find({ appsId }, { sort: { createdAt: 1 } }).toArray()
}

export async function getSchema(appsId: string, formId: string): Promise<FormSchema> {
  const schema = await schemas().findOne({ appsId, formId })
  if (!schema) throw notFound(`Schema "${formId}" not found in app "${appsId}"`)
  return schema
}

/**
 * Provisions the collection backing a schema and the indexes its constraints
 * need. Called the moment a schema is finalized — this is the "collections are
 * created dynamically, no migration scripts" behaviour.
 */
async function provision(schema: FormSchema): Promise<void> {
  const name = `data_${schema.appsId}_${schema.formId}`
  const existing = await db().listCollections({ name }).toArray()
  if (!existing.length) await db().createCollection(name)

  const coll = dataCollection(schema.appsId, schema.formId)
  for (const [key, def] of Object.entries(schema.fields)) {
    if (def.deprecated) continue
    if (def.unique && def.fieldType !== 'LINKED') {
      // Partial index so records predating the field don't collide on null.
      await coll
        .createIndex({ [key]: 1 }, { unique: true, partialFilterExpression: { [key]: { $exists: true } } })
        .catch(() => undefined)
    }
    // Every LINKED field is a reverse-lookup target for some RELATED field.
    if (def.fieldType === 'LINKED') {
      await coll.createIndex({ [key]: 1 }).catch(() => undefined)
    }
  }
  if (schema.ownerScoped) await coll.createIndex({ createdBy: 1 }).catch(() => undefined)
}

export async function createSchema(draft: SchemaDraft, userId: string): Promise<FormSchema> {
  const existing = await schemas().findOne({ appsId: draft.appsId, formId: draft.formId })
  if (existing) throw conflict(`Schema "${draft.formId}" already exists in app "${draft.appsId}"`)

  const siblings = await listSchemas(draft.appsId)
  const byId = new Map(siblings.map((s) => [s.formId, s]))
  const validated = validateSchemaDraft(draft, (formId) => byId.get(formId))

  const now = new Date()
  const doc: FormSchema = {
    appsId: validated.appsId,
    formId: validated.formId,
    description: validated.description,
    fields: validated.fields,
    semantic: validated.semantic ?? {},
    version: 1,
    deprecated: false,
    ownerScoped: validated.ownerScoped ?? false,
    createdBy: userId,
    createdAt: now,
    createdAtIsoLocal: now.toISOString(),
  }

  const res = await schemas().insertOne(doc as never)
  doc.hexId = String(res.insertedId)
  await schemas().updateOne({ _id: res.insertedId }, { $set: { hexId: doc.hexId } })

  await provision(doc)
  return doc
}

/**
 * Schema evolution without a migration.
 *
 * New fields are additive and optional, so every record already stored stays
 * valid. Type changes are refused outright. Removals are soft: the field is
 * marked deprecated and its data is left in place, because dropping a column
 * is not reversible and a no-code user cannot be expected to have a backup.
 */
export async function updateSchema(draft: SchemaDraft, userId: string): Promise<FormSchema> {
  const current = await getSchema(draft.appsId, draft.formId)

  const siblings = await listSchemas(draft.appsId)
  const byId = new Map(siblings.map((s) => [s.formId, s]))
  const validated = validateSchemaDraft(draft, (formId) => byId.get(formId))

  const diff = diffSchema(current.fields, validated.fields)

  const merged: Record<string, FieldDef> = { ...validated.fields }
  for (const key of diff.deprecated) {
    merged[key] = { ...current.fields[key], deprecated: true }
  }

  const res = await schemas().findOneAndUpdate(
    { appsId: draft.appsId, formId: draft.formId },
    {
      $set: {
        fields: merged,
        description: validated.description ?? current.description,
        semantic: validated.semantic ?? current.semantic,
        ownerScoped: validated.ownerScoped ?? current.ownerScoped,
        version: current.version + 1,
        updatedAt: new Date(),
        updatedBy: userId,
      },
    },
    { returnDocument: 'after' },
  )

  if (!res) throw notFound(`Schema "${draft.formId}" not found`)
  await provision(res)
  return res
}

export interface DeployReport {
  appsId: string
  deployed: Array<{ formId: string; version: number; collection: string }>
  failed: Array<{ formId: string; errors: unknown }>
}

/**
 * One-click deploy of a whole generated model.
 *
 * Two passes, because the relationship types have opposite ordering needs:
 * LINKED requires its target to exist first, so schemas are created in
 * dependency order with RELATED fields held back; RELATED requires the LINKED
 * that points back at it, so those are applied afterwards once every schema is
 * in place. A model with mutual references deploys cleanly either way.
 */
export async function deployBatch(
  appsId: string,
  drafts: SchemaDraft[],
  userId: string,
): Promise<DeployReport> {
  const report: DeployReport = { appsId, deployed: [], failed: [] }

  const split = drafts.map((d) => splitRelatedFields({ ...d, appsId }))
  const ordered = topoSort(split.map((s) => s.base))

  for (const base of ordered) {
    try {
      const existing = await schemas().findOne({ appsId, formId: base.formId })
      const saved = existing ? await updateSchema(base, userId) : await createSchema(base, userId)
      report.deployed.push({
        formId: saved.formId,
        version: saved.version,
        collection: `data_${appsId}_${saved.formId}`,
      })
    } catch (err) {
      report.failed.push({
        formId: base.formId,
        errors: (err as { details?: unknown; message: string }).details ?? (err as Error).message,
      })
    }
  }

  // Second pass: attach the inverse-relationship fields.
  for (const { base, related } of split) {
    if (!Object.keys(related).length) continue
    if (report.failed.some((f) => f.formId === base.formId)) continue
    try {
      const saved = await getSchema(appsId, base.formId)
      await updateSchema({ ...base, fields: { ...saved.fields, ...related } }, userId)
    } catch (err) {
      report.failed.push({
        formId: base.formId,
        errors: (err as { details?: unknown; message: string }).details ?? (err as Error).message,
      })
    }
  }

  return report
}

export async function deleteSchema(appsId: string, formId: string, dropData = false): Promise<void> {
  await schemas().deleteOne({ appsId, formId })
  if (dropData) await dataCollection(appsId, formId).drop().catch(() => undefined)
}
