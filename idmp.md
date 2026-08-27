# IDMP API reference

You are talking to IDMP, a platform that deploys databases from a description.
This file is the whole interface — read it, then call the endpoints.

**Base URL:** `http://localhost:4441/no-code-db-api`
(replace with the deployed host)

**Auth:** send `Authorization: Bearer <API_KEY>` if the server has keys
configured. If it does not, requests work without a header.

---

## What IDMP gives you

A database you do not have to provision. You describe entities as *schemas*;
IDMP validates them, creates the collections, and enforces types, relationships,
and constraints on every write. There is no migration step and no SQL.

Use it when the user wants data persisted and there is no database yet.

## Before you design anything

Check whether this project already has an app:

```bash
curl -s $BASE/apps
```

If one matches the project, add schemas to it rather than creating a second app.

---

## Concepts

```
App      a namespace, e.g. "ECommerceApp"   (appsId, CamelCase)
Schema   one entity, like a table           (formId, PascalCase singular)
Record   one row, a JSON document
```

## Field types

| Type | Use for | Required extras |
|---|---|---|
| `TEXT` | names, descriptions, status values | |
| `NUMERIC` | counts and quantities — never money | |
| `BOOLEAN` | flags | |
| `DATE` | dates and timestamps | |
| `MONEY` | any price, cost, or total | `currencyCode`, `fractionDigits` |
| `EMAIL` | email addresses | |
| `SEQUENCE` | auto-assigned ids | optional `prefix`, `padding` |
| `LINKED` | a reference to another schema | `linkedFormId` |
| `RELATED` | the read-only inverse of a LINKED | `relatedFormId`, `relatedFieldId` |
| `EMBED` | a nested object with no identity of its own | `embeddedFormSchema` |

Every field also accepts `required`, `unique`, `allowMultiple`, and `default`.

### Rules that will reject your schema if you break them

- Each field's `fieldId` must equal its key in the `fields` object.
- `MONEY` must carry `currencyCode` and `fractionDigits` (use `"USD"` and `2`).
- `LINKED` must name an existing schema in the same app — or one you are
  deploying in the same batch.
- `RELATED` must point at a field that is genuinely a `LINKED` pointing back.
- Field types are immutable after creation. You cannot change one later.

### Modelling relationships

Never store a foreign key as `TEXT`. Use `LINKED`, on the "many" side:

```jsonc
{ "allowMultiple": false, "unique": true }   // one-to-one
{ "allowMultiple": false }                   // one-to-many
{ "allowMultiple": true }                    // many-to-many
```

A join or line-item entity (`OrderItem`, `Enrollment`) is its own schema with a
`LINKED` field to each side. Record a price on the line item rather than reading
it back from the product, so order history survives a price change.

---

## Endpoints

### Deploy a model — the one you usually want

`POST /form/schema/batch` creates the app if needed and deploys every schema in
dependency order. Send the whole model in one call; do not sort it yourself.

```bash
curl -X POST $BASE/form/schema/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "appsId": "ECommerceApp",
    "appsName": "E-Commerce Store",
    "schemas": [
      {
        "formId": "Customer",
        "description": "A person with an account in the store.",
        "fields": {
          "customerId":    { "fieldId": "customerId",    "fieldType": "SEQUENCE", "prefix": "CUS-", "padding": 4 },
          "customerName":  { "fieldId": "customerName",  "fieldType": "TEXT",  "required": true },
          "customerEmail": { "fieldId": "customerEmail", "fieldType": "EMAIL", "required": true, "unique": true },
          "orders":        { "fieldId": "orders", "fieldType": "RELATED", "relatedFormId": "Order", "relatedFieldId": "customerId" }
        }
      },
      {
        "formId": "Order",
        "description": "A completed purchase.",
        "fields": {
          "orderId":     { "fieldId": "orderId",     "fieldType": "SEQUENCE", "prefix": "ORD-", "padding": 4 },
          "customerId":  { "fieldId": "customerId",  "fieldType": "LINKED", "linkedFormId": "Customer", "required": true },
          "orderDate":   { "fieldId": "orderDate",   "fieldType": "DATE",  "required": true },
          "totalAmount": { "fieldId": "totalAmount", "fieldType": "MONEY", "required": true, "currencyCode": "USD", "fractionDigits": 2 },
          "status":      { "fieldId": "status",      "fieldType": "TEXT",  "required": true, "default": "pending" }
        }
      }
    ]
  }'
```

Response reports each schema separately:

```json
{
  "appsId": "ECommerceApp",
  "deployed": [
    { "formId": "Customer", "version": 1, "collection": "data_ECommerceApp_Customer" },
    { "formId": "Order",    "version": 1, "collection": "data_ECommerceApp_Order" }
  ],
  "failed": []
}
```

**Check `failed` before continuing.** A non-empty `failed` array means part of
your model was rejected; the entry carries the specific reasons.

### Insert a record

`POST /form/data`

```bash
curl -X POST $BASE/form/data \
  -H 'Content-Type: application/json' \
  -d '{
    "appsId": "ECommerceApp",
    "formId": "Order",
    "fields": {
      "customerId":  "6a908e38d9b9f562011b6059",
      "orderDate":   "2026-03-03",
      "totalAmount": 129.98
    }
  }'
```

Notes:
- `LINKED` values are the target record's `_id`. Insert the target first and keep
  the id.
- `MONEY` accepts a plain number (`129.98`); it is stored as integer minor units.
- Do not send `SEQUENCE` fields — they are assigned for you.
- Do not send `RELATED` fields — they are computed.

### List records

`POST /form/data` with no `fields`:

```bash
curl -X POST $BASE/form/data \
  -H 'Content-Type: application/json' \
  -d '{"appsId":"ECommerceApp","formId":"Customer"}'
```

Returns `{ records, labels }`. `RELATED` fields are resolved, and `labels` maps
each `LINKED` id to a human-readable name so you can render it.

### Query

`POST /form/data/query`

```jsonc
{
  "appsId": "ECommerceApp",
  "formId": "Order",
  "filter": { "field": "totalAmount", "operator": "GREATER_THAN", "value": 100 },
  "sort":   { "field": "orderDate", "direction": "DESC" },
  "limit":  50
}
```

Operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`,
`LESS_THAN`, `LESS_THAN_OR_EQUAL`, `IN` (array value), `LIKE` (text only, `%` is
the wildcard).

Combine with `AND` / `OR`:

```jsonc
{
  "filter": {
    "operator": "AND",
    "conditions": [
      { "field": "productPrice", "operator": "LESS_THAN", "value": 50 },
      { "field": "available",    "operator": "EQUALS",    "value": true }
    ]
  }
}
```

Write money filters as ordinary amounts (`50`, not `5000`) and dates as
`YYYY-MM-DD`. IDMP converts them to the stored representation for you.

Aggregate with `COUNT`, `SUM`, or `AVG`, optionally grouped:

```jsonc
{
  "appsId": "ECommerceApp",
  "formId": "Order",
  "filter":      { "field": "totalAmount", "operator": "GREATER_THAN", "value": 100 },
  "aggregation": { "type": "COUNT", "groupBy": "customerId" }
}
```

`SUM` and `AVG` need a `field`, and it must be `NUMERIC` or `MONEY`.

### Other endpoints

| | |
|---|---|
| `GET /apps` | list apps |
| `GET /apps/{appsId}/schemas` | list an app's schemas |
| `POST /form/schema` | create one schema |
| `PUT /form/schema` | evolve a schema (see below) |
| `PUT /form/data` | update a record (send `_id` and partial `fields`) |
| `DELETE /form/data/{appsId}/{formId}/{id}` | delete a record |
| `GET /form/options/{appsId}/{formId}/{fieldId}` | valid choices for a LINKED field |
| `GET /health` | liveness |

### Evolving a schema

`PUT /form/schema` with the complete field set. New fields must be optional or
carry a `default`. Changing a field's type is rejected. Omitted fields are
deprecated rather than deleted, and their data is kept.

---

## Errors

| Status | Meaning |
|---|---|
| `409` | already exists — for an app, this is usually fine, carry on |
| `422` | validation failed; `details` lists each problem |
| `404` | unknown app, schema, or record |

`422` responses are specific enough to act on without guessing:

```json
{
  "error": "Record rejected by validation",
  "details": ["customerId: no record 507f1f77bcf86cd799439011 exists in \"Customer\""]
}
```

---

## Recommended flow

1. `GET /apps` — reuse an existing app if one fits.
2. Design the full model. Decide relationship directions before writing JSON.
3. Show the user a plain-language summary of the entities and fields, and get
   confirmation before creating anything.
4. `POST /form/schema/batch` with every schema at once. Check `failed`.
5. Insert records parent-first, keeping each `_id` for the `LINKED` fields that
   reference it.
6. Query through `/form/data/query`. Do not attempt to reach MongoDB directly —
   the constraints live in this API, not in the database.
