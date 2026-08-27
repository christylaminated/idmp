'use client'

const LINKS = [
  { href: '#prompt', label: 'AI Prompt' },
  { href: '#blueprint', label: 'Blueprint' },
  { href: '#data', label: 'Data Entry' },
  { href: '#query', label: 'Query' },
  { href: '#csv', label: 'CSV' },
  { href: '#api', label: 'API' },
]

export function Nav({ status }: { status: 'checking' | 'up' | 'down' }) {
  const dot = status === 'up' ? 'bg-emerald-500' : status === 'down' ? 'bg-red-500' : 'bg-slate-300'
  const label = status === 'up' ? 'API connected' : status === 'down' ? 'API unreachable' : 'Connecting'

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="text-lg font-extrabold tracking-tight text-idmp-blue">
          IDMP
        </a>
        <nav className="hidden gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <span className="flex items-center gap-2 text-xs text-slate-500" title={label}>
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </div>
    </header>
  )
}
