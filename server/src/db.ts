import { MongoClient, Db, Collection } from 'mongodb'
import type { AppsInfo, FormSchema } from './types.js'

let client: MongoClient
let database: Db

export async function connect(uri: string, dbName: string): Promise<Db> {
  client = new MongoClient(uri)
  await client.connect()
  database = client.db(dbName)

  await apps().createIndex({ appsId: 1 }, { unique: true })
  await schemas().createIndex({ appsId: 1, formId: 1 }, { unique: true })

  return database
}

export async function disconnect(): Promise<void> {
  await client?.close()
}

export function db(): Db {
  if (!database) throw new Error('Database not connected')
  return database
}

export const apps = (): Collection<AppsInfo> => db().collection<AppsInfo>('apps_info')
export const schemas = (): Collection<FormSchema> => db().collection<FormSchema>('form_schema')
export const counters = () => db().collection('_counters')

/**
 * Records live in a collection per (app, schema), created on the fly when a
 * schema is finalized. This is the "new collections are created dynamically,
 * with no migration scripts needed" claim.
 */
export function dataCollectionName(appsId: string, formId: string): string {
  return `data_${appsId}_${formId}`
}

export function dataCollection(appsId: string, formId: string) {
  return db().collection(dataCollectionName(appsId, formId))
}

/** Atomic counter behind the SEQUENCE field type. */
export async function nextSequence(appsId: string, formId: string, fieldId: string): Promise<number> {
  const key = `${appsId}.${formId}.${fieldId}`
  const res = await counters().findOneAndUpdate(
    { _id: key as never },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  return (res as { seq: number } | null)?.seq ?? 1
}
