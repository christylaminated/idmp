'use client'

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { formatValue, isMoney, formatMoney, operatorsFor, type FormSchema } from '@/lib/types'
import { Callout } from './Section'
import { Spinner } from './Icons'

interface Condition {
  field: string
  operator: string
  value: string
}

/**
 * The no-code query builder. Every control is driven by the deployed schema,
 * so the operators offered for a field are the ones its type supports and a
 * user cannot construct a query the API will reject.
 */
export function QueryPanel({ appsId, schemas }: { appsId: string; schemas: FormSchema[] }) {
  const [formId, setFormId] = useState(schemas[0]?.formId ?? '')
  const [conditions, setConditions] = useState<Condition[]>([])
  const [join, setJoin] = useState<'AND' | 'OR'>('AND')
  const [aggType, setAggType] = useState<'' | 'COUNT' | 'SUM' | 'AVG'>('')
  const [aggField, setAggField] = useState('')
  const [groupBy, setGroupBy] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string[] | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [labels, setLabels] = useState<Record<string, Record<string, string>>>({})
  const [agg, setAgg] = useState<{ value?: unknown; groups?: Array<{ key: unknown; value: unknown }>; groupBy?: string } | null>(null)

  const schema = useMemo(() => schemas.find((s) => s.formId === formId), [schemas, formId])

  const queryable = useMemo(
    () =>
      schema
        ? Object.entries(schema.fields).filter(
            ([, f]) => !f.deprecated && f.fieldType !== 'RELATED' && f.fieldType !== 'EMBED',
          )
        : [],
    [schema],
  )

  const numericFields = useMemo(
    () => queryable.filter(([, f]) => f.fieldType === 'NUMERIC' || f.fieldType === 'MONEY'),
    [queryable],
  )

  useEffect(() => {
    setConditions([])
    setAggType('')
    setAggField('')
    setGroupBy('')
    setSortField('')
    setRows(null)
    setAgg(null)
    setError(null)
  }, [formId])

  const run = async () => {
    if (!schema) return
    setBusy(true)
    setError(null)
    setRows(null)
    setAgg(null)

    const leaves = conditions
      .filter((c) => c.field && c.value !== '')
      .map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.operator === 'IN' ? c.value.split(',').map((s) => s.trim()) : c.value,
      }))

    const body: Record<string, unknown> = { appsId, formId }
    if (leaves.length === 1) body.filter = leaves[0]
    else if (leaves.length > 1) body.filter = { operator: join, conditions: leaves }
    if (aggType) body.aggregation = { type: aggType, field: aggField || undefined, groupBy: groupBy || undefined }
    if (sortField && !aggType) body.sort = { field: sortField, direction: sortDir }

    try {
      const res = await api.query(body)
      if ('records' in res) {
        setRows(res.records)
        setLabels(res.labels ?? {})
      } else {
        setAgg(res)
      }
    } catch (err) {
      const e = err as { lines?: string[]; message: string }
      setError(e.lines ?? [e.message])
    } finally {
      setBusy(false)
    }
  }

  if (!schema) return <Callout tone="info">Deploy a schema first.</Callout>

  const control = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-idmp-accent'

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Find records in</span>
          <select value={formId} onChange={(e) => setFormId(e.target.value)} className={control}>
            {schemas.map((s) => (
              <option key={s.formId} value={s.formId}>
                {s.formId}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 space-y-2">
          {conditions.map((c, i) => {
            const def = schema.fields[c.field]
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-right text-xs uppercase text-slate-400">
                  {i === 0 ? 'where' : join.toLowerCase()}
                </span>
                <select
                  value={c.field}
                  onChange={(e) => {
                    const nextField = e.target.value
                    const allowed = operatorsFor(schema.fields[nextField].fieldType)
                    setConditions((p) =>
                      p.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              field: nextField,
                              operator: allowed.some((a) => a.value === x.operator) ? x.operator : allowed[0].value,
                            }
                          : x,
                      ),
                    )
                  }}
                  className={`${control} font-mono text-[13px]`}
                >
                  {queryable.map(([k]) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>

                <select
                  value={c.operator}
                  onChange={(e) => setConditions((p) => p.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))}
                  className={control}
                >
                  {(def ? operatorsFor(def.fieldType) : []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {def?.fieldType === 'BOOLEAN' ? (
                  <select
                    value={c.value}
                    onChange={(e) => setConditions((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    className={control}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={def?.fieldType === 'DATE' ? 'date' : 'text'}
                    value={c.value}
                    placeholder={def?.fieldType === 'MONEY' ? '50.00' : 'value'}
                    onChange={(e) => setConditions((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    className={`${control} w-40`}
                  />
                )}

                {def?.fieldType === 'MONEY' ? (
                  <span className="text-[11px] text-slate-400">compared as {def.currencyCode ?? 'USD'}, not text</span>
                ) : null}

                <button
                  type="button"
                  onClick={() => setConditions((p) => p.filter((_, j) => j !== i))}
                  className="rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  remove
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() =>
                setConditions((p) => [
                  ...p,
                  { field: queryable[0][0], operator: operatorsFor(queryable[0][1].fieldType)[0].value, value: '' },
                ])
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              + Add condition
            </button>
            {conditions.length > 1 ? (
              <select value={join} onChange={(e) => setJoin(e.target.value as 'AND' | 'OR')} className={control}>
                <option value="AND">match all (AND)</option>
                <option value="OR">match any (OR)</option>
              </select>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
          <span className="text-slate-500">Summarise</span>
          <select value={aggType} onChange={(e) => setAggType(e.target.value as never)} className={control}>
            <option value="">no — list the records</option>
            <option value="COUNT">COUNT</option>
            <option value="SUM">SUM</option>
            <option value="AVG">AVG</option>
          </select>

          {aggType === 'SUM' || aggType === 'AVG' ? (
            <select value={aggField} onChange={(e) => setAggField(e.target.value)} className={`${control} font-mono text-[13px]`}>
              <option value="">choose a number field…</option>
              {numericFields.map(([k]) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          ) : null}

          {aggType ? (
            <>
              <span className="text-slate-500">grouped by</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={`${control} font-mono text-[13px]`}>
                <option value="">nothing</option>
                {queryable.map(([k]) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="ml-2 text-slate-500">ordered by</span>
              <select value={sortField} onChange={(e) => setSortField(e.target.value)} className={`${control} font-mono text-[13px]`}>
                <option value="">nothing</option>
                {queryable.map(([k]) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {sortField ? (
                <select value={sortDir} onChange={(e) => setSortDir(e.target.value as never)} className={control}>
                  <option value="ASC">ascending</option>
                  <option value="DESC">descending</option>
                </select>
              ) : null}
            </>
          )}

          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-idmp-blue px-5 py-2 font-semibold text-white transition hover:bg-idmp-blue/90 disabled:opacity-40"
          >
            {busy ? <Spinner /> : null}
            Run query
          </button>
        </div>
      </div>

      {error ? (
        <Callout tone="error">
          <ul className="list-disc space-y-0.5 pl-5">
            {error.map((l, i) => (
              <li key={i} className="font-mono text-xs">
                {l}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {agg ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          {agg.groups ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2 text-left font-medium">{agg.groupBy}</th>
                  <th className="px-3 py-2 text-left font-medium">{aggType}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agg.groups.map((g, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-[13px] text-slate-700">
                      {labels[agg.groupBy ?? '']?.[String(g.key)] ?? String(g.key)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {isMoney(g.value) ? formatMoney(g.value) : String(g.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-3xl font-bold text-idmp-blue">
              {isMoney(agg.value) ? formatMoney(agg.value) : String(agg.value)}
              <span className="ml-3 text-sm font-normal text-slate-400">
                {aggType}
                {aggField ? ` of ${aggField}` : ''}
              </span>
            </p>
          )}
        </div>
      ) : null}

      {rows ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">
            {rows.length} record{rows.length === 1 ? '' : 's'}
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Nothing matched.</p>
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
                    <tr key={i} className="hover:bg-slate-50/70">
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
      ) : null}
    </div>
  )
}
