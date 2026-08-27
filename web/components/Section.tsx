import type { ReactNode } from 'react'

const TONES = {
  blue: 'bg-blue-50 text-idmp-blue',
  purple: 'bg-purple-50 text-idmp-purple',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
} as const

export function Section({
  id,
  eyebrow,
  tone = 'blue',
  title,
  intro,
  icon,
  children,
}: {
  id?: string
  eyebrow: string
  tone?: keyof typeof TONES
  title: string
  intro?: ReactNode
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-slate-200 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${TONES[tone]}`}
        >
          {icon}
          {eyebrow}
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
        {intro ? <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500">{intro}</div> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

export function Callout({ tone, children }: { tone: 'error' | 'warn' | 'ok' | 'info'; children: ReactNode }) {
  const cls = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>
}
