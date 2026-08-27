'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { FormSchema, SchemaDraft } from '@/lib/types'
import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import { Section, Callout } from '@/components/Section'
import { PromptPanel } from '@/components/PromptPanel'
import { SchemaCard } from '@/components/SchemaCard'
import { DeployBar } from '@/components/DeployBar'
import { TutorPanel } from '@/components/TutorPanel'
import { DataEntryPanel } from '@/components/DataEntryPanel'
import { QueryPanel } from '@/components/QueryPanel'
import { CsvPanel } from '@/components/CsvPanel'
import { ApiPanel } from '@/components/ApiPanel'
import { Sparkle, Database, Upload, Check } from '@/components/Icons'

/**
 * The whole demo on one page, in the order you would actually use it:
 * describe it, review the blueprint, deploy it, put data in, query it, and
 * import a CSV into the same app.
 */
export default function Page() {
  const [health, setHealth] = useState<'checking' | 'up' | 'down'>('checking')
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)

  const [appsId, setAppsId] = useState('')
  const [drafts, setDrafts] = useState<SchemaDraft[]>([])
  const [elapsed, setElapsed] = useState<number | null>(null)

  const [deployState, setDeployState] = useState<'idle' | 'deploying' | 'deployed'>('idle')
  const [deployErrors, setDeployErrors] = useState<string[] | null>(null)
  const [deployed, setDeployed] = useState<FormSchema[]>([])

  const [tutorTitle, setTutorTitle] = useState('Schema Overview')
  const [tutorText, setTutorText] = useState('')
  const [tutorBusy, setTutorBusy] = useState(false)
  const [tutorContext, setTutorContext] = useState<{ formId?: string; fieldId?: string }>({})

  useEffect(() => {
    api
      .health()
      .then(() => setHealth('up'))
      .catch(() => setHealth('down'))
    api
      .aiStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false))
  }, [])

  const refreshDeployed = useCallback(async (id: string) => {
    const list = await api.listSchemas(id).catch(() => [])
    setDeployed(list)
    return list
  }, [])

  // If an app was already deployed in a previous session, pick it up so the
  // lower half of the page is usable without generating anything first.
  useEffect(() => {
    if (appsId) return
    api
      .listApps()
      .then(async (apps) => {
        if (!apps.length) return
        const first = apps[0].appsId
        const list = await refreshDeployed(first)
        if (list.length) {
          setAppsId(first)
          setDrafts(list)
          setDeployState('deployed')
        }
      })
      .catch(() => undefined)
  }, [appsId, refreshDeployed])

  const onGenerated = (r: { appsId: string; schemas: unknown[]; elapsedMs: number }) => {
    setAppsId(r.appsId)
    setDrafts(r.schemas as SchemaDraft[])
    setElapsed(r.elapsedMs)
    setDeployState('idle')
    setDeployErrors(null)
    setDeployed([])
    setTutorText('')
  }

  const deploy = async () => {
    setDeployState('deploying')
    setDeployErrors(null)
    try {
      const report = await api.deploy(appsId, drafts)
      if (report.failed.length) {
        setDeployErrors(
          report.failed.flatMap((f) =>
            Array.isArray(f.errors) ? f.errors.map((e) => `${f.formId}: ${e}`) : [`${f.formId}: ${String(f.errors)}`],
          ),
        )
      }
      const live = await refreshDeployed(appsId)
      setDeployState(live.length ? 'deployed' : 'idle')
      if (live.length) setDrafts(live)
    } catch (err) {
      const e = err as { lines?: string[]; message: string }
      setDeployErrors(e.lines ?? [e.message])
      setDeployState('idle')
    }
  }

  const explain = async (formId?: string, fieldId?: string, question?: string) => {
    setTutorBusy(true)
    setTutorTitle(fieldId ? `${formId}.${fieldId}` : formId ? formId : 'Schema Overview')
    setTutorContext({ formId, fieldId })
    try {
      const subject = formId ? drafts.find((d) => d.formId === formId) : drafts
      const res = await api.explain({ schema: subject, fieldId, question })
      setTutorText(res.explanation)
    } catch (err) {
      setTutorText(`The tutor is unavailable: ${(err as Error).message}`)
    } finally {
      setTutorBusy(false)
      document.getElementById('tutor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  const hasDrafts = drafts.length > 0
  const isLive = deployState === 'deployed' && deployed.length > 0

  return (
    <>
      <Nav status={health} />
      <main>
        <Hero />

        {health === 'down' ? (
          <div className="mx-auto max-w-5xl px-6 pb-8">
            <Callout tone="error">
              <p className="font-semibold">The IDMP API is not responding.</p>
              <p className="mt-1">
                Start it with <code className="font-mono text-xs">npm run dev:memory</code> in{' '}
                <code className="font-mono text-xs">server/</code>, then reload this page.
              </p>
            </Callout>
          </div>
        ) : null}

        <Section
          id="prompt"
          eyebrow="AI Prompt Interface"
          icon={<Sparkle className="h-3.5 w-3.5" />}
          title="Type a prompt. Get a database."
          intro="The model infers field types, relationships, and constraints automatically. Every schema is editable before deployment — nothing is created until you say so."
        >
          <PromptPanel onGenerated={onGenerated} aiConfigured={aiConfigured} />
        </Section>

        <Section
          id="blueprint"
          eyebrow="Blueprint Visualizer"
          tone="purple"
          icon={<Database className="h-3.5 w-3.5" />}
          title={isLive ? 'Your live schemas' : 'Review before anything is created'}
          intro={
            hasDrafts
              ? isLive
                ? 'These schemas are deployed. Each one backs a live collection, and every constraint below is enforced by the API before data reaches the database.'
                : 'Field types, constraints, and relationships at a glance. Change any type inline, then deploy the whole model in one click.'
              : 'Generate a schema above, or import a CSV further down, and it will appear here.'
          }
        >
          {hasDrafts ? (
            <>
              {elapsed !== null && !isLive ? (
                <p className="mb-4 text-sm text-slate-500">
                  <strong className="font-semibold text-slate-700">{drafts.length} schemas</strong> generated in{' '}
                  {(elapsed / 1000).toFixed(1)}s for app{' '}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{appsId}</code>
                </p>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-2">
                {drafts.map((s, i) => (
                  <SchemaCard
                    key={s.formId}
                    schema={s}
                    index={i}
                    editable={!isLive}
                    siblings={drafts.map((d) => d.formId)}
                    onChange={(next) => setDrafts((p) => p.map((x) => (x.formId === next.formId ? next : x)))}
                    onExplain={(fieldId) => explain(s.formId, fieldId)}
                  />
                ))}
              </div>

              {deployErrors ? (
                <div className="mt-5">
                  <Callout tone="error">
                    <p className="font-semibold">Some schemas were rejected</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {deployErrors.map((l, i) => (
                        <li key={i} className="font-mono text-xs">
                          {l}
                        </li>
                      ))}
                    </ul>
                  </Callout>
                </div>
              ) : null}

              <DeployBar count={drafts.length} state={deployState} onDeploy={deploy} />

              {isLive ? (
                <div className="mt-4">
                  <Callout tone="ok">
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {deployed.length} live collection{deployed.length === 1 ? '' : 's'} in{' '}
                      <code className="font-mono text-xs">{appsId}</code>. Reload this page and they will still be
                      here.
                    </span>
                  </Callout>
                </div>
              ) : null}
            </>
          ) : (
            <Callout tone="info">Nothing to show yet.</Callout>
          )}
        </Section>

        <Section
          id="tutor"
          eyebrow="LLM Tutor"
          tone="purple"
          icon={<Sparkle className="h-3.5 w-3.5" />}
          title="Ask why it was designed this way"
          intro="Every schema and every field can explain itself in plain language, and you can keep asking follow-up questions."
        >
          <TutorPanel
            title={tutorTitle}
            busy={tutorBusy}
            text={
              tutorText ||
              'Press Explain on any schema or field above, or ask a question below.'
            }
            onAsk={(q) => explain(tutorContext.formId, tutorContext.fieldId, q)}
          />
        </Section>

        <Section
          id="data"
          eyebrow="Type-safe data entry"
          tone="green"
          icon={<Database className="h-3.5 w-3.5" />}
          title="Forms generated from the schema"
          intro="Each input is chosen by field type — a currency field for money, a stepper for numbers, and a dropdown of live records for a relationship, so an invalid reference cannot be entered at all."
        >
          {isLive ? (
            <DataEntryPanel appsId={appsId} schemas={deployed} />
          ) : (
            <Callout tone="info">Deploy a model above to generate its forms.</Callout>
          )}
        </Section>

        <Section
          id="query"
          eyebrow="No-code query"
          icon={<Database className="h-3.5 w-3.5" />}
          title="Query it without writing anything"
          intro="Equality, range, and containment filters, combined with AND or OR, plus COUNT, SUM, and AVG with optional grouping. Values are compared using the field's real type, so a price range means what it says."
        >
          {isLive ? (
            <QueryPanel appsId={appsId} schemas={deployed} />
          ) : (
            <Callout tone="info">Deploy a model above to query it.</Callout>
          )}
        </Section>

        <Section
          id="csv"
          eyebrow="CSV Import"
          tone="amber"
          icon={<Upload className="h-3.5 w-3.5" />}
          title="Import from CSV — auto type inference"
          intro="Upload any CSV. IDMP infers a field type per column from your sample data, flags anything ambiguous, then deploys the schema and imports every row through the same validation as a hand-typed record."
        >
          <CsvPanel
            defaultAppsId={appsId}
            onImported={async (id) => {
              setAppsId(id)
              const live = await refreshDeployed(id)
              setDrafts(live)
              setDeployState('deployed')
            }}
          />
        </Section>

        <Section
          id="api"
          eyebrow="API"
          title="The same deployment, without the UI"
          intro="IDMP is API-first. Everything on this page is a REST call, which is what lets an AI coding agent create, validate, and deploy a database from inside an editor."
        >
          <ApiPanel />
        </Section>

        <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-400">
          IDMP — Intelligent Database Management Platform
        </footer>
      </main>
    </>
  )
}
