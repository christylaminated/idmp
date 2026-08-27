'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { formatValue, type FieldDef, type FormSchema } from '@/lib/types'
import { Callout } from './Section'
import { Spinner } from './Icons'

type Options = Record<string, Array<{ value: string; label: string }>>

/**
 * The generated form. Every input is chosen by field type, so the shape of the
 * data is constrained before submission rather than corrected afterwards.
 *
 * The LINKED case is the one that matters: it renders as a dropdown of live
 * records from the target collection, which makes selecting a customer who
 * does not exist impossible rather than merely rejected.
 */
export function DataEntryPanel({ appsId, schemas }: { appsId: string; schemas: FormSchema[] }) {
  const [formId, setFormId] = useState(schemas[0]?.formId ?? '')
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [options, setOptions] = useState<Options>({})
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[] | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const schema = useMemo(() => schemas.find((s) => s.formId === formId), [schemas, formId])

  const editable = useMemo(
    () =>
      schema
        ? Object.entries(schema.fields).filter(
            ([, f]) => !f.deprecated && f.fieldType !== 'RELATED' && f.fieldType !== 'EMBED',
          )
        : [],
    [schema],
  )

  // Dropdown options are fetched per LINKED field and refreshed after every
  // insert, so a record created a moment ago is immediately selectable.
  const loadOptions = async () => {
    if (!schema) return
    const linked = Object.entries(schema.fields).filter(([, f]) => f.fieldType === 'LINKED')
    const next: Options = {}
    for (const [key] of linked) {
      const res = await api.options(appsId, schema.formId, key).catch(() => ({ options: [] }))
      next[key] = res.options
    }
    setOptions(next)
  }

  const loadRows = async () => {
    if (!schema) return
    const res = await api.list(appsId, schema.formId).catch(() => ({ records: [], labels: {} }))
    setRows(res.records.slice(0, 8))
    setLabels(res.labels ?? {})
  }

  useEffect(() => {
    setValues({})
    setErrors(null)
    setOk(null)
    void loadOptions()
    void loadRows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, schemas])

  const submit = async () => {
    if (!schema) return
    setBusy(true)
    setErrors(null)
    setOk(null)
    try {
      await api.insert(appsId, schema.formId, values)
      setOk(`Saved to ${schema.formId}.`)
      setValues({})
      await loadRows()
      await loadOptions()
    } catch (err) {
      const e = err as { lines?: string[]; message: string }
      setErrors(e.lines ?? [e.message])
    } finally {
      setBusy(false)
    }
  }

  if (!schema) return <Callout tone="info">Deploy a schema first.</Callout>

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Collection</label>
        <select
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-idmp-accent"
        >
          {schemas.map((s) => (
            <option key={s.formId} value={s.formId}>
              {s.formId}
            </option>
          ))}
        </select>

        <div className="mt-5 space-y-4">
          {editable.map(([key, field]) => (
            <FieldInput
              key={key}
              fieldKey={key}
              field={field}
              value={values[key]}
              options={options[key]}
              onChange={(v) => setValues((p) => ({ ...p, [key]: v }))}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-idmp-blue px-4 py-2.5 font-semibold text-white transition hover:bg-idmp-blue/90 disabled:opacity-40"
        >
          {busy ? <Spinner /> : null}
          Save record
        </button>

        {ok ? (
          <div className="mt-4">
            <Callout tone="ok">{ok}</Callout>
          </div>
        ) : null}
        {errors ? (
          <div className="mt-4">
            <Callout tone="error">
              <p className="font-semibold">Rejected by the API before it reached the database</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {errors.map((l, i) => (
                  <li key={i} className="font-mono text-xs">
                    {l}
                  </li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
          {schema.formId} &mdash; {rows.length} most recent
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  {Object.keys(schema.fields)
                    .filter((k) => !schema.fields[k].deprecated)
                    .map((k) => (
                      <th key={k} className="whitespace-nowrap px-4 py-2 text-left font-medium">
                        {k}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {Object.keys(schema.fields)
                      .filter((k) => !schema.fields[k].deprecated)
                      .map((k) => (
                        <td key={k} className="whitespace-nowrap px-4 py-2 text-slate-700">
                          {labels[k]?.[String(r[k])] ?? formatValue(r[k])}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldInput({
  fieldKey,
  field,
  value,
  options,
  onChange,
}: {
  fieldKey: string
  field: FieldDef
  value: unknown
  options?: Array<{ value: string; label: string }>
  onChange: (v: unknown) => void
}) {
  const base =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-idmp-accent focus:ring-2 focus:ring-idmp-accent/15'

  const label = (
    <span className="flex items-baseline justify-between">
      <span className="font-mono text-[13px] text-slate-700">{fieldKey}</span>
      {field.required ? <span className="text-[11px] text-red-600">required</span> : null}
    </span>
  )

  if (field.fieldType === 'SEQUENCE') {
    return (
      <label className="block space-y-1.5">
        {label}
        <input
          disabled
          value={`assigned automatically${field.prefix ? ` (${field.prefix}0001)` : ''}`}
          className={`${base} cursor-not-allowed bg-slate-50 italic text-slate-400`}
        />
      </label>
    )
  }

  if (field.fieldType === 'LINKED') {
    const multiple = Boolean(field.allowMultiple)
    return (
      <label className="block space-y-1.5">
        {label}
        <select
          multiple={multiple}
          value={(multiple ? ((value as string[]) ?? []) : ((value as string) ?? '')) as never}
          onChange={(e) =>
            onChange(
              multiple ? Array.from(e.target.selectedOptions).map((o) => o.value) : e.target.value || undefined,
            )
          }
          className={`${base} ${multiple ? 'h-24' : ''}`}
        >
          {multiple ? null : <option value="">Select a {field.linkedFormId}…</option>}
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-400">
          {options?.length
            ? `${options.length} live ${field.linkedFormId} record${options.length === 1 ? '' : 's'} — no other value can be chosen`
            : `No ${field.linkedFormId} records yet. Create one first.`}
        </span>
      </label>
    )
  }

  if (field.fieldType === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-idmp-blue"
        />
        <span className="font-mono text-[13px] text-slate-700">{fieldKey}</span>
      </label>
    )
  }

  if (field.fieldType === 'MONEY') {
    return (
      <label className="block space-y-1.5">
        {label}
        <span className="flex overflow-hidden rounded-lg border border-slate-300 focus-within:border-idmp-accent">
          <span className="flex items-center bg-slate-50 px-3 text-sm font-medium text-slate-500">
            {field.currencyCode ?? 'USD'}
          </span>
          <input
            type="number"
            step={1 / 10 ** (field.fractionDigits ?? 2)}
            min={0}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="0.00"
            className="w-full px-3 py-2 text-sm outline-none"
          />
        </span>
      </label>
    )
  }

  const type =
    field.fieldType === 'NUMERIC'
      ? 'number'
      : field.fieldType === 'DATE'
        ? 'date'
        : field.fieldType === 'EMAIL'
          ? 'email'
          : 'text'

  return (
    <label className="block space-y-1.5">
      {label}
      <input
        type={type}
        step={field.fieldType === 'NUMERIC' ? 1 : undefined}
        value={(value as string) ?? ''}
        onChange={(e) =>
          onChange(
            e.target.value === ''
              ? undefined
              : field.fieldType === 'NUMERIC'
                ? Number(e.target.value)
                : e.target.value,
          )
        }
        className={base}
      />
    </label>
  )
}
