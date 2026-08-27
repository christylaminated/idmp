'use client'

import { Check, Spinner } from './Icons'

export function DeployBar({
  count,
  state,
  onDeploy,
}: {
  count: number
  state: 'idle' | 'deploying' | 'deployed'
  onDeploy: () => void
}) {
  const dot =
    state === 'deployed' ? 'bg-emerald-500' : state === 'deploying' ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'

  const status =
    state === 'deployed' ? 'deployed and live' : state === 'deploying' ? 'deploying…' : 'ready to deploy'

  return (
    <div className="sticky bottom-4 z-30 mt-6 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
      <span className="flex items-center gap-2.5 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <strong className="font-semibold text-slate-900">
          {count} schema{count === 1 ? '' : 's'}
        </strong>
        <span className="text-slate-400">· {status}</span>
      </span>

      <button
        type="button"
        onClick={onDeploy}
        disabled={state !== 'idle' || count === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-idmp-green px-5 py-2.5 font-semibold text-white transition hover:bg-idmp-green/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === 'deploying' ? <Spinner /> : <Check />}
        {state === 'deployed' ? 'Deployed' : 'Deploy All to IDMP'}
      </button>
    </div>
  )
}
