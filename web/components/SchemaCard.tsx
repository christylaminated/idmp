'use client'

import { useState } from 'react'
import { FIELD_TYPES, type FieldDef, type FieldType, type SchemaDraft } from '@/lib/types'
import { NotePills, TypePill } from './TypePill'
import { Sparkle, Spinner } from './Icons'

const MONOGRAM = [
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
]

export function SchemaCard({
  schema,
  index,
  editable,
  siblings,
  onChange,
  onExplain,
}: {
  schema: SchemaDraft
  index: number
  editable: boolean
  siblings: string[]
  onChange?: (next: SchemaDraft) => void
  onExplain?: (fieldId?: string) => Promise<void>
}) {
  const [explaining, setExplaining] = useState<string | null>(null)

  const setField = (key: string, patch: Partial<FieldDef>) => {
    if (!onChange) return
    onChange({ ...schema, fields: { ...schema.fields, [key]: { ...schema.fields[key], ...patch } } })
  }

  const explain = async (fieldId?: string) => {
    if (!onExplain) return
    setExplaining(fieldId ?? '__schema__')
    try {
      await onExplain(fieldId)
    } finally {
      setExplaining(null)
    }
  }

  const entries = Object.entries(schema.fields).filter(([, f]) => !f.deprecated)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${MONOGRAM[index % MONOGRAM.length]}`}
        >
          {schema.formId.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-slate-900">{schema.formId}</h3>
          {schema.description ? <p className="truncate text-xs text-slate-500">{schema.description}</p> : null}
        </div>
        {onExplain ? (
          <button
            type="button"
            onClick={() => explain()}
            disabled={explaining !== null}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-sm font-semibold text-idmp-purple transition hover:bg-purple-100 disabled:opacity-50"
          >
            {explaining === '__schema__' ? <Spinner className="h-3.5 w-3.5" /> : <Sparkle className="h-3.5 w-3.5" />}
            Explain
          </button>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-400">
            <th className="px-5 py-2 text-left font-medium">Field</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Notes</th>
            {onExplain ? <th className="w-8 px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, field]) => (
            <tr key={key} className="align-middle hover:bg-slate-50/70">
              <td className="px-5 py-2.5 font-mono text-[13px] text-slate-800">{key}</td>
              <td className="px-3 py-2.5">
                {editable ? (
                  <select
                    value={field.fieldType}
                    onChange={(e) => {
                      const next = e.target.value as FieldType
                      setField(key, {
                        fieldType: next,
                        // Carry the defaults each type needs, so an inline edit
                        // never produces a schema the API will reject.
                        ...(next === 'MONEY' ? { currencyCode: 'USD', fractionDigits: 2 } : {}),
                        ...(next === 'LINKED' && !field.linkedFormId
                          ? { linkedFormId: siblings.find((s) => s !== schema.formId) }
                          : {}),
                      })
                    }}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 outline-none focus:border-idmp-accent"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TypePill field={field} />
                )}

                {editable && field.fieldType === 'LINKED' ? (
                  <select
                    value={field.linkedFormId ?? ''}
                    onChange={(e) => setField(key, { linkedFormId: e.target.value })}
                    className="ml-1 rounded border border-pink-200 bg-pink-50 px-1.5 py-0.5 font-mono text-[11px] text-pink-700 outline-none"
                  >
                    <option value="">target…</option>
                    {siblings.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                {editable ? (
                  <span className="flex gap-3 text-[11px] text-slate-600">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        disabled={field.fieldType === 'SEQUENCE' || field.fieldType === 'RELATED'}
                        onChange={(e) => setField(key, { required: e.target.checked })}
                        className="h-3 w-3 accent-idmp-blue"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(field.unique)}
                        disabled={field.fieldType === 'SEQUENCE' || field.fieldType === 'RELATED'}
                        onChange={(e) => setField(key, { unique: e.target.checked })}
                        className="h-3 w-3 accent-idmp-purple"
                      />
                      Unique
                    </label>
                  </span>
                ) : (
                  <NotePills field={field} />
                )}
              </td>
              {onExplain ? (
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    title={`Explain ${key}`}
                    onClick={() => explain(key)}
                    disabled={explaining !== null}
                    className="rounded p-1 text-slate-300 transition hover:bg-purple-50 hover:text-idmp-purple disabled:opacity-40"
                  >
                    {explaining === key ? <Spinner className="h-3.5 w-3.5" /> : <Sparkle className="h-3.5 w-3.5" />}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
