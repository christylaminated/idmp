'use client'

import { useState } from 'react'
import { Sparkle, Spinner } from './Icons'

export function TutorPanel({
  title,
  text,
  busy,
  onAsk,
}: {
  title: string
  text: string
  busy: boolean
  onAsk: (question: string) => void
}) {
  const [question, setQuestion] = useState('')

  return (
    <div className="rounded-xl bg-gradient-to-br from-idmp-purple to-idmp-deep p-6 text-white shadow-md">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
          <Sparkle className="h-4 w-4" />
        </span>
        <h3 className="font-bold">LLM Tutor &mdash; {title}</h3>
      </div>

      <div className="mt-4 min-h-[3rem] whitespace-pre-line text-[15px] leading-relaxed text-purple-50">
        {busy ? (
          <span className="flex items-center gap-2 text-purple-200">
            <Spinner /> Thinking…
          </span>
        ) : (
          text
        )}
      </div>

      <form
        className="mt-5 flex gap-2 border-t border-white/15 pt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!question.trim() || busy) return
          onAsk(question.trim())
          setQuestion('')
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a follow-up — why is this a link instead of just the customer's name?"
          className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none transition placeholder:text-purple-200/70 focus:border-white/50"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-idmp-purple transition hover:bg-purple-50 disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  )
}
