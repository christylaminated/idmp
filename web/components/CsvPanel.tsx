'use client'

import { useRef, useState } from 'react'
import { api } from '@/lib/api'
import { columnsToFields, inferColumns, parseCsv, rowsToRecords, type InferredColumn } from '@/lib/csv'
import { FIELD_TYPES, type FieldType } from '@/lib/types'
import { TypeBadge } from './TypePill'
import { Callout } from './Section'
import { Spinner, Upload, Warning } from './Icons'

export function CsvPanel({
  defaultAppsId,
  onImported,
}: {
  defaultAppsId: string
  onImported: (appsId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [columns, setColumns] = useState<InferredColumn[]>([])
  const [appsId, setAppsId] = useState(defaultAppsId)
  const [formId, setFormId] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null)
  const [error, setError] = useState<string[] | null>(null)

  const ingest = (file: File) => {
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result))
      if (parsed.length < 2) {
        setError(['That file has no data rows.'])
        return
      }
      const base = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]/g, '')
      setFileName(file.name)
      setRows(parsed)
      setColumns(inferColumns(parsed))
      setFormId(base.charAt(0).toUpperCase() + base.slice(1) || 'Imported')
      if (!appsId) setAppsId(base || 'ImportedData')
    }
    reader.readAsText(file)
  }

  const deploy = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setProgress('Creating schema…')
      const report = await api.deploy(appsId, [{ appsId, formId, description: `Imported from ${fileName}`, fields: columnsToFields(columns) }])
      if (report.failed.length) {
        setError(report.failed.flatMap((f) => (Array.isArray(f.errors) ? f.errors.map(String) : [String(f.errors)])))
        return
      }

      const records = rowsToRecords(rows, columns)
      let ok = 0
      let failed = 0
      for (let i = 0; i < records.length; i++) {
        setProgress(`Importing rows… ${i + 1} of ${records.length}`)
        try {
          await api.insert(appsId, formId, records[i])
          ok++
        } catch {
          failed++
        }
      }
      setResult({ ok, failed })
      onImported(appsId)
    } catch (err) {
      const e = err as { lines?: string[]; message: string }
      setError(e.lines ?? [e.message])
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const control = 'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-idmp-accent'

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) ingest(f)
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? 'border-idmp-accent bg-blue-50/60' : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) ingest(f)
          }}
        />
        <Upload className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 font-semibold text-slate-800">
          {fileName || 'Drop a CSV file or click to upload'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          IDMP infers field types from your column headers and sample values
        </p>
      </div>

      {columns.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5 text-left font-medium">Column name</th>
                  <th className="px-3 py-2.5 text-left font-medium">Inferred type</th>
                  <th className="px-3 py-2.5 text-left font-medium">Sample value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {columns.map((c, i) => (
                  <tr key={c.fieldId}>
                    <td className="px-5 py-2.5 text-slate-800">
                      {c.column}
                      {c.warning ? (
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                          <Warning className="h-3.5 w-3.5 shrink-0" />
                          {c.warning}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={c.fieldType}
                        onChange={(e) =>
                          setColumns((p) =>
                            p.map((x, j) => (j === i ? { ...x, fieldType: e.target.value as FieldType } : x)),
                          )
                        }
                        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 outline-none focus:border-idmp-accent"
                      >
                        {FIELD_TYPES.filter((t) => t !== 'EMBED' && t !== 'RELATED' && t !== 'LINKED').map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <span className="ml-2">
                        <TypeBadge type={c.fieldType} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[13px] text-slate-500">{c.sample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap gap-4">
              <label className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">App</span>
                <input value={appsId} onChange={(e) => setAppsId(e.target.value)} className={control} />
              </label>
              <label className="space-y-1.5">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Collection</span>
                <input value={formId} onChange={(e) => setFormId(e.target.value)} className={control} />
              </label>
              <p className="self-end pb-2 text-sm text-slate-500">
                {rows.length - 1} row{rows.length - 1 === 1 ? '' : 's'} will be imported
              </p>
            </div>

            <div className="flex items-center gap-3">
              {progress ? <span className="text-sm text-slate-500">{progress}</span> : null}
              <button
                type="button"
                onClick={() => {
                  setColumns([])
                  setRows([])
                  setFileName('')
                  setResult(null)
                  setError(null)
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={deploy}
                disabled={busy || !appsId || !formId}
                className="inline-flex items-center gap-2 rounded-lg bg-idmp-blue px-5 py-2 font-semibold text-white transition hover:bg-idmp-blue/90 disabled:opacity-40"
              >
                {busy ? <Spinner /> : null}
                Deploy & import
              </button>
            </div>
          </div>
        </>
      ) : null}

      {result ? (
        <Callout tone={result.failed ? 'warn' : 'ok'}>
          Imported {result.ok} row{result.ok === 1 ? '' : 's'} into <code className="font-mono">{formId}</code>
          {result.failed ? ` — ${result.failed} rejected by validation.` : '. Every row was typed and validated on the way in.'}
        </Callout>
      ) : null}

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
    </div>
  )
}
