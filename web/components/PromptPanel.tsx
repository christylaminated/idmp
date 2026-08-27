'use client'

import { useState } from 'react'
import { Arrow, Spinner, Sparkle } from './Icons'
import { Callout } from './Section'

const EXAMPLES = [
  {
    label: 'Online Store',
    prompt:
      'I am starting an online store. I need to manage products, customer accounts, shopping carts, and order processing with line items. Products have a name, price, stock quantity, and category. Orders belong to a customer and track a total amount and a status.',
  },
  {
    label: 'Hospital System',
    prompt:
      'I need to manage patients, doctors, and appointments for a clinic. Patients have a name, email, and date of birth. Doctors have a name and a specialty. Each appointment links one patient to one doctor at a scheduled time, with a visit fee.',
  },
  {
    label: 'School Management',
    prompt:
      'I run a school. I need students, teachers, courses, and enrollments. Each course has a teacher. Students enroll in many courses, and I want to record a grade for each enrollment.',
  },
  {
    label: 'Hotel Booking',
    prompt:
      'I manage a small hotel. I need rooms with a nightly rate and capacity, guests with contact details, and reservations linking a guest to a room over a date range with a total price.',
  },
  {
    label: 'Restaurant',
    prompt:
      'I run a restaurant. I need menu items with prices and categories, tables, and orders. Each order belongs to a table and contains several menu items with quantities.',
  },
]

export function PromptPanel({
  onGenerated,
  aiConfigured,
}: {
  onGenerated: (r: { appsId: string; schemas: unknown[]; elapsedMs: number }) => void
  aiConfigured: boolean | null
}) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string[] | null>(null)

  const generate = async () => {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { api } = await import('@/lib/api')
      const result = await api.generate(prompt)
      onGenerated(result as never)
      document.getElementById('blueprint')?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      const e = err as { lines?: string[]; message: string }
      setError(e.lines ?? [e.message])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-idmp-blue/70 bg-white p-6 shadow-sm">
        <label
          htmlFor="prompt"
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-idmp-blue"
        >
          <Sparkle className="h-3.5 w-3.5" />
          Describe your database in plain English
        </label>

        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate()
          }}
          rows={4}
          placeholder="e.g. I need to manage patients, doctors, and appointments for a dental clinic..."
          className="mt-3 w-full resize-y rounded-lg border border-slate-300 p-3 text-[15px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-idmp-accent focus:ring-2 focus:ring-idmp-accent/20"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Try:</span>
          {EXAMPLES.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={() => setPrompt(e.prompt)}
              className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-idmp-blue transition hover:bg-blue-100"
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="text-xs text-slate-400">Cmd/Ctrl + Enter to generate</span>
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-idmp-blue px-5 py-2.5 font-semibold text-white transition hover:bg-idmp-blue/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Spinner /> : null}
            {busy ? 'Generating schema...' : 'Generate Schema'}
            {busy ? null : <Arrow />}
          </button>
        </div>
      </div>

      {aiConfigured === false ? (
        <Callout tone="warn">
          No model key is configured on the API server, so generation will fail. Set{' '}
          <code className="font-mono text-xs">GEMINI_API_KEY</code> and restart it &mdash; or skip ahead and use the
          CSV import, which needs no model.
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="error">
          <p className="font-semibold">Generation failed</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {error.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  )
}
