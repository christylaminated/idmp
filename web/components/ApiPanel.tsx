'use client'

import { useState } from 'react'
import { API_BASE } from '@/lib/api'

const SNIPPETS: Record<string, string> = {
  'Deploy a model': `curl -X POST ${'{BASE}'}/form/schema/batch \\
  -H 'Content-Type: application/json' \\
  -d '{
    "appsId": "ECommerceApp",
    "schemas": [
      { "formId": "Customer", "fields": {
          "customerId":    { "fieldId": "customerId",    "fieldType": "SEQUENCE", "prefix": "CUS-" },
          "customerName":  { "fieldId": "customerName",  "fieldType": "TEXT",  "required": true },
          "customerEmail": { "fieldId": "customerEmail", "fieldType": "EMAIL", "required": true, "unique": true }
      }},
      { "formId": "Order", "fields": {
          "orderId":     { "fieldId": "orderId",     "fieldType": "SEQUENCE", "prefix": "ORD-" },
          "customerId":  { "fieldId": "customerId",  "fieldType": "LINKED", "linkedFormId": "Customer", "required": true },
          "totalAmount": { "fieldId": "totalAmount", "fieldType": "MONEY",  "currencyCode": "USD", "fractionDigits": 2 }
      }}
    ]
  }'`,

  'Insert a record': `curl -X POST ${'{BASE}'}/form/data \\
  -H 'Content-Type: application/json' \\
  -d '{
    "appsId": "ECommerceApp",
    "formId": "Order",
    "fields": {
      "customerId":  "<a real Customer _id>",
      "totalAmount": 129.98
    }
  }'`,

  'Query with an aggregation': `curl -X POST ${'{BASE}'}/form/data/query \\
  -H 'Content-Type: application/json' \\
  -d '{
    "appsId": "ECommerceApp",
    "formId": "Order",
    "filter":      { "field": "totalAmount", "operator": "GREATER_THAN", "value": 100 },
    "aggregation": { "type": "COUNT", "groupBy": "customerId" }
  }'`,
}

export function ApiPanel() {
  const [tab, setTab] = useState(Object.keys(SNIPPETS)[0])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.keys(SNIPPETS).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === k ? 'bg-idmp-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          </span>
          <span className="ml-1 font-mono text-xs text-slate-500">{API_BASE}</span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-slate-300">
          <code>{SNIPPETS[tab].replaceAll('{BASE}', API_BASE)}</code>
        </pre>
      </div>

      <p className="text-sm leading-relaxed text-slate-500">
        These are the same endpoints every panel above calls. An agent such as Claude Code or Cursor is handed{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">idmp.md</code> and
        works entirely through them &mdash; the validation, referential integrity, and type coercion are identical
        whether a request arrives from this page or from an editor.
      </p>
    </div>
  )
}
