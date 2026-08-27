import { apps, schemas } from '../db.js'
import { conflict, notFound } from '../errors.js'
import type { AppsInfo } from '../types.js'

export async function createApp(
  input: { appsId: string; appsName?: string; description?: string },
  userId: string,
): Promise<AppsInfo> {
  const existing = await apps().findOne({ appsId: input.appsId })
  if (existing) throw conflict(`App "${input.appsId}" already exists`)

  const doc: AppsInfo = {
    appsId: input.appsId,
    appsName: input.appsName ?? input.appsId,
    description: input.description,
    createdBy: userId,
    createdAt: new Date(),
  }
  await apps().insertOne(doc as never)
  return doc
}

/** Create-or-return. The deploy path calls this on every run; a re-deploy is not an error. */
export async function ensureApp(
  input: { appsId: string; appsName?: string; description?: string },
  userId: string,
): Promise<AppsInfo> {
  const existing = await apps().findOne({ appsId: input.appsId })
  if (existing) return existing
  return createApp(input, userId)
}

export async function listApps(): Promise<AppsInfo[]> {
  return apps().find({}, { sort: { createdAt: -1 } }).toArray()
}

export async function getApp(appsId: string): Promise<AppsInfo> {
  const app = await apps().findOne({ appsId })
  if (!app) throw notFound(`App "${appsId}" not found`)
  return app
}

export async function updateApp(appsId: string, patch: Partial<AppsInfo>): Promise<AppsInfo> {
  const { appsId: _ignored, createdBy, createdAt, ...rest } = patch
  const res = await apps().findOneAndUpdate({ appsId }, { $set: rest }, { returnDocument: 'after' })
  if (!res) throw notFound(`App "${appsId}" not found`)
  return res
}

export async function deleteApp(appsId: string): Promise<void> {
  await schemas().deleteMany({ appsId })
  await apps().deleteOne({ appsId })
}
