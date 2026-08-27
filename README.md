# IDMP

From a sentence to a live, queryable database.

Describe your data in plain English, or drop in a CSV. IDMP generates a
validated schema, deploys live MongoDB collections with typed relationships,
generates type-safe entry forms, and gives you a no-code query interface.

It is API-first, so an AI coding agent can create and deploy a database from
inside an editor — see [`idmp.md`](./idmp.md).

> **You need a Gemini API key** for the prompt panel and the tutor. It is free
> and goes in `.env` — see [Setup](#setup) step 2. Everything else (deploying
> schemas, forms, querying, CSV import) works without one.

---

## What it does

Concretely, given a sentence or a spreadsheet it will:

1. **Generate a schema.** A prompt goes to a model, which returns a set of
   interconnected entities with field types, relationships, and constraints
   already chosen. A CSV instead gets one entity, with a type inferred per
   column from its actual values.
2. **Let you correct it.** Every field's type, target, and constraints are
   editable in the browser before anything is created.
3. **Deploy it.** One call creates every MongoDB collection and index, ordered
   so that a schema is never created before something it references.
4. **Enforce it.** Every write afterwards is validated, coerced to the declared
   types, and checked for referential integrity before it reaches the database.
5. **Generate forms for it.** Each field renders the input its type calls for,
   including dropdowns of live records for relationships.
6. **Query it.** Filters, AND/OR, sorting, and COUNT/SUM/AVG with grouping,
   with values compared using each field's real type.
7. **Explain it.** A tutor describes any schema or field in plain language and
   answers follow-ups.

The part that carries the weight is step 4. The schema is not documentation —
it is enforced at the API layer, which is what makes typed relationships and
referential integrity work inside a document store with no relational engine
underneath.

### What happens when you press Deploy

```
POST /form/schema/batch  { appsId, schemas: [...] }
   │
   ├─ create the app if it does not exist
   ├─ split RELATED fields off each schema        (they need a second pass)
   ├─ topologically sort by LINKED dependency     (targets before dependents)
   │
   ├─ for each schema, in that order:
   │     validate the definition
   │        · fieldId matches its key
   │        · MONEY has currency + fractionDigits
   │        · LINKED target exists
   │        · EMBED recurses
   │     create collection data_<App>_<Form>
   │     create unique indexes for unique:true
   │     create an index on every LINKED field    (RELATED reads use it)
   │
   ├─ second pass: attach RELATED fields, now that their inverse exists
   │     · target field must exist, be LINKED, and point back here
   │
   └─ return per-schema outcomes; one bad schema does not fail the batch
```

---

## Tech stack

| | |
|---|---|
| **API** | [Fastify 5](https://fastify.dev) on Node, TypeScript, ESM |
| **Database** | MongoDB 6 via the official driver — or an in-process one for zero setup |
| **Web** | [Next.js 14](https://nextjs.org) App Router, React 18, TypeScript |
| **Styling** | Tailwind CSS 3, no component library |
| **Icons** | Inline SVG, no icon package |
| **Model** | Google Gemini, behind a swappable interface |
| **Tests** | TypeScript harness against a real MongoDB (`mongodb-memory-server`) |

Runtime dependencies total four packages: `fastify`, `@fastify/cors`,
`mongodb`, and `next`/`react`.

---

## Setup

### What you need

- **Node 18.17 or newer** (`node -v`)
- **Nothing else.** No MongoDB install, no Docker — the API can start its own
  database in-process.

### 1. Install

```bash
git clone https://github.com/christylaminated/idmp.git
cd idmp
npm run install:all
```

### 2. Configure — add your API key

```bash
cp .env.example .env
```

**Then open `.env` and put your Gemini API key in it:**

```
GEMINI_API_KEY=AIzaSy...your key here
```

Get one free at **<https://aistudio.google.com/apikey>** — sign in with a Google
account, click *Create API key*, copy it in. No billing details required.

Without it the app still runs, but the prompt panel and the Explain buttons
will not work; the page shows a warning, and those two endpoints return `503`.

Two things people trip on:

- **`.env` goes in the repo root**, next to `.env.example` — not in `server/`
  or `web/`. One file configures both.
- **Restart the API after editing it.** It reads the file once at startup.
  You will see `Schema generation enabled (gemini-2.5-flash)` in the log once
  the key is picked up.

`.env` is gitignored, so your key is never committed.

### 3. Run

Two terminals, from the repo root:

```bash
# terminal 1 — API on :4441
npm run dev:api
```

```bash
# terminal 2 — web app on :3000
npm run dev:web
```

Open **<http://localhost:3000>** — with the `http://`, since browsers
autocomplete `localhost:3000` to `https://`, which a dev server cannot serve.

### 4. Load sample data (optional)

With the API running, in a third terminal:

```bash
npm run seed
```

Deploys a five-schema e-commerce model — Product, Customer, ShoppingCart,
Order, OrderItem — with products, customers, and orders, so the forms and
query builder have something to work with. Re-run it after restarting the API
if you are using the default in-memory database.

---

## Configuration

All of it lives in `.env` at the repo root. Restart the affected server after a
change. Real environment variables override the file, so `PORT=5000 npm run
dev:api` works.

| Variable | Default | What it does |
|---|---|---|
| `GEMINI_API_KEY` | *(empty)* | Enables prompt-to-schema generation and the tutor |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Change if that model name is retired |
| `MONGODB_URI` | `memory` | `memory` starts a throwaway database in-process; or give a real MongoDB URI |
| `MONGODB_DB` | `idmp` | Database name |
| `PORT` | `4441` | API port |
| `HOST` | `127.0.0.1` | `0.0.0.0` to expose on your network — only alongside `IDMP_API_KEYS` |
| `IDMP_API_KEYS` | *(unset)* | Unset means **no authentication at all** |
| `NEXT_PUBLIC_IDMP_API` | `http://localhost:4441/no-code-db-api` | Where the browser sends requests |

**Persisting data.** The default `MONGODB_URI=memory` discards everything when
the API stops. Point it at a real MongoDB (`mongodb://127.0.0.1:27017`, or an
Atlas string) to keep it. Nothing else changes.

**Authentication.** There is none by default: any request is accepted, writes
are attributed to `usr_local`, and any caller can read everything. Fine on
localhost, unsafe anywhere reachable by others. Set `IDMP_API_KEYS` to
comma-separated `key:userId` pairs to require `Authorization: Bearer <key>`.
Note the web app sends no key, so turning this on secures the API but stops the
browser UI from working.

---

## Using the app

The page runs top to bottom as one flow.

**Type a prompt. Get a database.** Describe what you want to store, or click an
example. The model returns a set of interconnected schemas. *Needs a key.*

**Blueprint Visualizer.** Every schema as a field table. Before deployment you
can change any field's type inline, retarget a relationship, and toggle
Required/Unique. **Explain** asks the tutor about a schema or field. *Explain
needs a key.*

**Deploy All to IDMP.** Creates every collection and index in one pass, ordered
so references resolve. Reload the page and the schemas are still there.

**Forms generated from the schema.** Each input matches its field type — a
currency box for money, a date picker for dates, and for a relationship, a
dropdown of live records so an invalid reference cannot be entered.

**Query it without writing anything.** Add conditions, combine with AND/OR,
sort, or summarise with COUNT/SUM/AVG grouped by any field. The operators
offered depend on the field's type.

**Import from CSV.** Each column gets an inferred type from its sample values,
anything ambiguous is flagged, and every type stays editable before deploy.
Then the schema is created and every row imported through the same validation
as a hand-typed record. Needs no key.

Screenshots of each panel are in [`screenshots/`](./screenshots).

---

## How it works

```
   prompt or CSV
        │
        ▼
   web/ (Next.js)      ── prompt, blueprint, forms, query, tutor
        │  REST
        ▼
   server/ (Fastify)   ── validation · type coercion · referential
        │                 integrity · query compilation
        ▼
     MongoDB           ── apps_info · form_schema · data_<App>_<Form>
```

Agents call the same REST layer directly, so a record inserted from an editor
gets identical treatment to one typed into a form.

### Three layers

| Layer | What it is |
|---|---|
| **App** | A namespace grouping related schemas and records (`ECommerceApp`) |
| **Schema** | The structure of one entity, like a table (`Order`) |
| **Record** | A JSON document in the collection that schema created |

### Field types

| Type | Stored as | Notes |
|---|---|---|
| `TEXT` | string | |
| `NUMERIC` | number | |
| `BOOLEAN` | boolean | accepts `true/false`, `yes/no`, `1/0` |
| `DATE` | BSON date | never a string, so range filters compare correctly |
| `MONEY` | `{centAmount, currencyCode, fractionDigits}` | integer minor units |
| `EMAIL` | string | format-validated |
| `SEQUENCE` | string | server-assigned, atomic; `prefix` + padding gives `ORD-0001` |
| `EMBED` | nested object | recursive, up to 4 levels |
| `LINKED` | ObjectId(s) | a typed reference to another schema |
| `RELATED` | *(never stored)* | the inverse of a LINKED, resolved on read |

Cardinality comes from two flags on a `LINKED` field:

```jsonc
{ "allowMultiple": false, "unique": true }   // one-to-one
{ "allowMultiple": false }                   // one-to-many
{ "allowMultiple": true }                    // many-to-many
```

`RELATED` is the read-only inverse: `Customer.orders` declared as
`RELATED → Order.customerId` returns that customer's orders on every read
without storing anything. Both are validated when the schema is created — a
`LINKED` target must already exist, and a `RELATED` field must point at a
`LINKED` that genuinely points back.

Money is stored as an integer, so `$29.99` becomes
`{centAmount: 2999, currencyCode: "USD", fractionDigits: 2}` and a filter
written as `price < 50` is rewritten to `price.centAmount < 5000` before it
reaches the database. Stored as text, `"49.99" < "100"` is false and the query
returns a wrong answer with no error.

### What every write goes through

1. **Structural** — unknown fields rejected, `required` enforced
2. **Type coercion** — strict, per the table above
3. **Referential integrity** — every `LINKED` target confirmed to exist
4. **Uniqueness** — including 1:1, where no second record may link to a
   claimed target
5. `SEQUENCE` generated server-side; `RELATED` rejected as read-only

Failures return `422` with a list you can show a user directly:

```json
{
  "error": "Record rejected by validation",
  "details": ["customerId: no record 507f1f77bcf86cd799439011 exists in \"Customer\""]
}
```

### Schema evolution

`PUT /form/schema` diffs old against new. A new field must be optional or carry
a default, so existing records stay valid. Changing a type is always rejected.
A removed field is deprecated rather than deleted, and its data is kept. The
version increments on every change.

---

## The REST API

Base URL `http://localhost:4441/no-code-db-api`. [`idmp.md`](./idmp.md) has full
request bodies.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness, storage, auth mode |
| `GET` | `/apps` | list apps |
| `POST` | `/apps` | create an app |
| `GET` | `/apps/{appsId}/schemas` | list an app's schemas |
| `POST` | `/form/schema/batch` | **deploy a whole model at once**, in dependency order |
| `POST` | `/form/schema` | create one schema |
| `PUT` | `/form/schema` | evolve a schema |
| `POST` | `/form/data` | insert a record, or list them when `fields` is omitted |
| `PUT` | `/form/data` | update a record |
| `DELETE` | `/form/data/{appsId}/{formId}/{id}` | delete a record |
| `POST` | `/form/data/query` | filters, sorting, aggregations |
| `GET` | `/form/options/{appsId}/{formId}/{fieldId}` | valid choices for a relationship field |
| `POST` | `/ai/generate` | prompt to schemas |
| `POST` | `/ai/explain` | tutor explanation or follow-up |
| `GET` | `/ai/status` | whether a model key is configured |

Errors: `422` with a `details` array, `409` for conflicts, `404` for unknown
ids, `503` when a model key is missing.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run install:all` | install both workspaces |
| `npm run dev:api` | API on :4441, hot reload |
| `npm run dev:web` | web app on :3000 |
| `npm run seed` | deploy and populate the sample model |
| `npm test` | full test suite — 33 checks against a real MongoDB |
| `npm run build` | production build of both |

**Production build.** Set `MONGODB_URI` to a real database first. If the API is
not on `localhost:4441`, set `NEXT_PUBLIC_IDMP_API` **before** building the web
app; it is baked in at build time.

```bash
npm run build
npm start --workspace=@idmp/server
npm start --workspace=@idmp/web
```

---

## Project layout

```
idmp/
├── .env.example              template — copy to .env and add your key
├── idmp.md                   API reference written for AI agents
├── screenshots/              every panel, captured from a running instance
│
├── server/                   the API  ·  Fastify + MongoDB
│   └── src/
│       ├── index.ts          startup: env, Mongo, routes, error handling
│       ├── env.ts            reads .env from the repo root
│       ├── db.ts             connection, collection naming, SEQUENCE counters
│       ├── types.ts          the field-type model and the query contract
│       ├── auth.ts           API key → user id (off unless configured)
│       ├── errors.ts         ApiError and the status codes it maps to
│       │
│       ├── validate/
│       │   ├── schema.ts     schema rules, evolution diffing, topological sort
│       │   └── record.ts     the write pipeline: coercion, links, uniqueness
│       │
│       ├── services/
│       │   ├── apps.ts       app CRUD
│       │   ├── schemas.ts    provisioning, indexes, evolution, batch deploy
│       │   ├── records.ts    writes, RELATED resolution, link labels
│       │   └── query.ts      filter tree → $match, aggregations, sorting
│       │
│       ├── llm/
│       │   ├── index.ts      the SchemaGenerator interface — the swap point
│       │   ├── prompts.ts    generation contract and tutor persona
│       │   └── gemini.ts     the Gemini implementation
│       │
│       ├── routes/           apps · schema · data · ai
│       ├── seed.ts           sample e-commerce model  (npm run seed)
│       └── test.ts           33 end-to-end checks     (npm test)
│
└── web/                      the UI  ·  Next.js + Tailwind
    ├── app/
    │   ├── page.tsx          the whole demo, in order
    │   ├── layout.tsx        html shell and metadata
    │   └── globals.css       Tailwind entry
    ├── lib/
    │   ├── api.ts            typed client for the REST layer
    │   ├── types.ts          field types, formatting, operator rules
    │   └── csv.ts            Excel-faithful parsing + column type inference
    └── components/
        ├── TypePill.tsx      the field-type visual language, in one file
        ├── SchemaCard.tsx    a schema as an editable field table
        ├── PromptPanel.tsx   prompt → schemas
        ├── DeployBar.tsx     the one-click deploy control
        ├── DataEntryPanel.tsx  forms generated from a schema
        ├── QueryPanel.tsx    the no-code query builder
        ├── CsvPanel.tsx      upload, inference, import
        ├── TutorPanel.tsx    explanations and follow-ups
        ├── ApiPanel.tsx      copyable REST examples
        ├── Hero.tsx  Nav.tsx  Section.tsx  Icons.tsx
```

### Where to look first

| If you want to… | Read |
|---|---|
| understand the data model | `server/src/types.ts` |
| see what the API enforces on a write | `server/src/validate/record.ts` |
| see why a money filter is correct | `server/src/services/query.ts` → `coerceFilterValue` |
| change how relationships deploy | `server/src/services/schemas.ts` → `deployBatch` |
| change the prompt sent to the model | `server/src/llm/prompts.ts` |
| use a different model provider | `server/src/llm/index.ts` |
| restyle a field type | `web/components/TypePill.tsx` |
| change the page or its order | `web/app/page.tsx` |

---

## Extending it

**Add a field type.** Four places, in this order:

1. `server/src/types.ts` — add it to `FIELD_TYPES` and any extra props on
   `FieldDef`
2. `server/src/validate/schema.ts` — a case in `validateField` for whatever the
   type requires
3. `server/src/validate/record.ts` — a case in `coerceScalar` for how a value
   is coerced and stored
4. `server/src/services/query.ts` — a case in `coerceFilterValue` if it is
   filterable, and `operatorsFor` in `web/lib/types.ts` for which operators
   apply

Then `web/components/TypePill.tsx` for its colour and `DataEntryPanel.tsx` for
its input. The tests in `server/src/test.ts` are the fastest way to check it.

**Change the model provider.** Implement two methods and register it:

```ts
interface SchemaGenerator {
  generate(prompt: string): Promise<SchemaDraft[]>
  explain(input: ExplainInput): Promise<string>
}
```

`server/src/llm/gemini.ts` is the reference implementation; call
`setGenerator()` in `index.ts` with yours. The prompts in `llm/prompts.ts` are
provider-agnostic and port unchanged.

**Change what the model produces.** `llm/prompts.ts` holds both system prompts.
`GENERATE_SYSTEM` is a hard contract because its output feeds straight into
schema validation — anything the model gets wrong surfaces as a rejection the
user has to interpret, so it is written to over-specify.

**Add an endpoint.** A file in `server/src/routes/`, registered in `index.ts`.
Throw `ApiError` subclasses from `errors.ts` and the error handler formats them.

---

## Known limitations

Worth knowing before you build on this.

**No sign-in.** The web app has no login and sends no credentials. Turning on
`IDMP_API_KEYS` secures the API but breaks the browser UI. The data model is
ready for it — every document carries `createdBy`, and schemas support an
`ownerScoped` flag that filters reads to the caller — but nothing establishes a
user identity from the browser.

**The default database is ephemeral.** `MONGODB_URI=memory` exists so the
project runs on a clean machine. It is not a real deployment target.

**No enum type.** A status field is `TEXT`, so nothing stops a typo like
`shppied`. Either add an `ENUM` type or an `allowedValues` constraint on `TEXT`
— see *Extending it*.

**Deletes are unguarded.** `DELETE /form/data/...` removes a record even if
`LINKED` fields elsewhere point at it, leaving dangling references. Writes
check referential integrity; deletes do not.

**Batch deploy is not atomic.** Each schema is reported independently, so a
partial failure leaves some collections created and others not. Re-running is
safe — existing schemas take the update path.

**Query depth.** Filters address one collection. There is no join across
schemas beyond `RELATED` resolving a single inverse. `IN` and `LIKE` are not
composable with each other beyond AND/OR.

**CSV import is row-at-a-time.** Every row is a separate HTTP request, so a
large file is slow. A bulk endpoint would be the fix.

**The model call is unbatched and unretried.** One request per generation, no
backoff. A transient failure surfaces to the user.

**No pagination in the UI.** The query panel caps at the API default (200
records, 1000 max). The API accepts `limit`/`skip`; the UI does not send them.

---

## Troubleshooting

**The page won't load.** Use `http://localhost:3000`, not `https://`.

**"Cannot reach the IDMP API" banner.** The API is not running. Check terminal
1, then `curl localhost:4441/no-code-db-api/health`.

**The prompt panel warns about a missing key.** Expected until you set
`GEMINI_API_KEY` in `.env` **and restart the API**.

**"API key not valid" from Gemini.** The key reached Google and was rejected.
If the error mentions the model instead, set `GEMINI_MODEL` to a current one.

**Data vanished after a restart.** Expected with `MONGODB_URI=memory`. Run
`npm run seed` again, or use a real MongoDB.

**Port already in use.** Change `PORT` in `.env` and update
`NEXT_PUBLIC_IDMP_API` to match. For the web app, `npm run dev:web -- -p 3001`.

**A record was rejected.** That is validation working. The response lists each
problem by field, and the UI shows them under the form.
