const STATS = [
  { value: '<15s', label: 'Prompt to\ndeployed DB' },
  { value: '0', label: 'Manual\nsteps' },
  { value: '10', label: 'Typed field\ntypes' },
  { value: '1:1 · 1:N\nN:N', label: 'Relationships' },
  { value: 'REST', label: 'Claude & Cursor\ncompatible' },
]

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden py-20 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:32px_32px]"
        style={{ maskImage: 'radial-gradient(ellipse 60% 50% at 50% 0%, #000 60%, transparent 100%)' }}
      />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-semibold text-idmp-blue">
          <span className="h-2 w-2 rounded-full bg-idmp-accent" />
          Hybrid Relational + NoSQL · No Manual Steps
        </span>

        <h1 className="mt-8 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">
          From a sentence to a
          <br />
          <span className="bg-gradient-to-r from-idmp-accent to-idmp-deep bg-clip-text text-transparent">
            live, queryable database.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500">
          Describe your data in plain English. IDMP generates a validated hybrid schema and deploys live
          collections with typed relationships &mdash; with no manual step in between.
        </p>

        <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-5 sm:divide-x">
          {STATS.map((s) => (
            <div key={s.label} className="px-4 py-5">
              <dt className="whitespace-pre-line text-xl font-bold text-idmp-blue">{s.value}</dt>
              <dd className="mt-1 whitespace-pre-line text-xs leading-snug text-slate-500">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
