import type { FieldDef, FieldType } from '@/lib/types'

/**
 * One component carries the whole field-type visual language. Every table,
 * form, and inferred-column list reads its colours from here, so a new field
 * type is styled in exactly one place.
 */
const STYLES: Record<FieldType, string> = {
  SEQUENCE: 'bg-violet-50 text-violet-700 ring-violet-200',
  TEXT: 'bg-blue-50 text-blue-700 ring-blue-200',
  NUMERIC: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MONEY: 'bg-amber-50 text-amber-800 ring-amber-200',
  DATE: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  EMAIL: 'bg-sky-50 text-sky-700 ring-sky-200',
  BOOLEAN: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  LINKED: 'bg-pink-50 text-pink-700 ring-pink-200',
  RELATED: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  EMBED: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export function TypePill({ field }: { field: FieldDef }) {
  const label =
    field.fieldType === 'LINKED'
      ? `LINKED → ${field.linkedFormId ?? '?'}`
      : field.fieldType === 'RELATED'
        ? `RELATED ← ${field.relatedFormId ?? '?'}`
        : field.fieldType

  return (
    <span
      className={`inline-block font-mono text-[11px] leading-5 px-2 rounded ring-1 ring-inset whitespace-nowrap ${STYLES[field.fieldType]}`}
    >
      {label}
    </span>
  )
}

export function TypeBadge({ type }: { type: FieldType }) {
  return (
    <span className={`inline-block font-mono text-[11px] leading-5 px-2 rounded ring-1 ring-inset ${STYLES[type]}`}>
      {type}
    </span>
  )
}

/** The Notes column: constraints stated the way a non-technical reader can act on. */
export function NotePills({ field }: { field: FieldDef }) {
  const notes: Array<{ text: string; cls: string }> = []

  if (field.fieldType === 'SEQUENCE') notes.push({ text: 'Auto-generated', cls: 'bg-blue-50 text-blue-700' })
  if (field.fieldType === 'RELATED') notes.push({ text: 'Read-only', cls: 'bg-slate-100 text-slate-600' })
  if (field.required) notes.push({ text: 'Required', cls: 'bg-red-50 text-red-700' })
  if (field.unique) notes.push({ text: 'Unique', cls: 'bg-purple-50 text-purple-700' })
  if (field.allowMultiple && field.fieldType !== 'RELATED')
    notes.push({ text: 'Multiple', cls: 'bg-teal-50 text-teal-700' })
  if (field.fieldType === 'LINKED' && field.unique && !field.allowMultiple)
    notes.push({ text: 'One-to-one', cls: 'bg-indigo-50 text-indigo-700' })

  if (!notes.length) return <span className="text-slate-300 text-xs">&mdash;</span>

  return (
    <span className="flex flex-wrap gap-1">
      {notes.map((n) => (
        <span key={n.text} className={`text-[11px] leading-5 px-2 rounded ${n.cls}`}>
          {n.text}
        </span>
      ))}
    </span>
  )
}
