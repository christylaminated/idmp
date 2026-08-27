/**
 * End-to-end exercise of the validation, deployment, and query pipeline
 * against a real MongoDB. No HTTP, no LLM — just the layers that have to be
 * correct for the system to behave as documented.
 *
 * Run:  npm test
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import { connect, disconnect } from './db.js'
import { deployBatch, getSchema, updateSchema } from './services/schemas.js'
import { createRecord, resolveRelated } from './services/records.js'
import { runQuery } from './services/query.js'
import type { SchemaDraft } from './validate/schema.js'
import { ApiError } from './errors.js'

let passed = 0
let failed = 0

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`, extra ?? '')
  }
}

async function rejects(name: string, fn: () => Promise<unknown>, matcher: (msg: string) => boolean) {
  try {
    await fn()
    check(name, false, 'expected a rejection, got success')
  } catch (err) {
    const detail =
      err instanceof ApiError
        ? `${err.message} ${err.details ? JSON.stringify(err.details) : ''}`
        : String(err)
    check(name, matcher(detail), detail)
  }
}

const APP = 'TestApp'
const USER = 'usr_test'

const model: SchemaDraft[] = [
  {
    appsId: APP,
    formId: 'Order',
    description: 'A purchase.',
    fields: {
      orderId: { fieldId: 'orderId', fieldType: 'SEQUENCE', prefix: 'ORD-', padding: 4 },
      // Declared before Customer exists, to prove the deploy reorders them.
      customerId: { fieldId: 'customerId', fieldType: 'LINKED', linkedFormId: 'Customer', required: true },
      orderDate: { fieldId: 'orderDate', fieldType: 'DATE', required: true },
      totalAmount: { fieldId: 'totalAmount', fieldType: 'MONEY', required: true, currencyCode: 'USD', fractionDigits: 2 },
    },
  },
  {
    appsId: APP,
    formId: 'Customer',
    description: 'A buyer.',
    fields: {
      customerId: { fieldId: 'customerId', fieldType: 'SEQUENCE', prefix: 'CUS-', padding: 4 },
      customerName: { fieldId: 'customerName', fieldType: 'TEXT', required: true },
      customerEmail: { fieldId: 'customerEmail', fieldType: 'EMAIL', required: true, unique: true },
      orders: { fieldId: 'orders', fieldType: 'RELATED', relatedFormId: 'Order', relatedFieldId: 'customerId' },
    },
  },
  {
    appsId: APP,
    formId: 'Cart',
    description: 'One per customer.',
    fields: {
      cartId: { fieldId: 'cartId', fieldType: 'SEQUENCE' },
      customerId: {
        fieldId: 'customerId',
        fieldType: 'LINKED',
        linkedFormId: 'Customer',
        required: true,
        unique: true,
      },
    },
  },
]

async function main() {
  const mongo = await MongoMemoryServer.create()
  await connect(mongo.getUri(), 'idmp_test')

  console.log('\nDeployment')
  const report = await deployBatch(APP, model, USER)
  check('all schemas deploy', report.failed.length === 0, report.failed)
  check(
    'LINKED targets deploy before their dependents',
    report.deployed.findIndex((d) => d.formId === 'Customer') <
      report.deployed.findIndex((d) => d.formId === 'Order'),
    report.deployed.map((d) => d.formId),
  )

  const customerSchema = await getSchema(APP, 'Customer')
  const orderSchema = await getSchema(APP, 'Order')
  const cartSchema = await getSchema(APP, 'Cart')
  check('RELATED field survives the second pass', customerSchema.fields.orders?.fieldType === 'RELATED')

  console.log('\nSchema validation')
  await rejects(
    'LINKED to a non-existent schema is refused',
    () =>
      deployBatch(
        APP,
        [
          {
            appsId: APP,
            formId: 'Broken',
            fields: { ref: { fieldId: 'ref', fieldType: 'LINKED', linkedFormId: 'Nope' } },
          },
        ],
        USER,
      ).then((r) => {
        if (r.failed.length) throw new ApiError(422, 'failed', r.failed)
        return r
      }),
    (m) => m.includes('does not exist'),
  )

  await rejects(
    'changing a field type is refused',
    () =>
      updateSchema(
        {
          appsId: APP,
          formId: 'Customer',
          fields: { ...customerSchema.fields, customerName: { fieldId: 'customerName', fieldType: 'NUMERIC' } },
        },
        USER,
      ),
    (m) => m.includes('immutable'),
  )

  await rejects(
    'a new required field with no default is refused',
    () =>
      updateSchema(
        {
          appsId: APP,
          formId: 'Customer',
          fields: { ...customerSchema.fields, phone: { fieldId: 'phone', fieldType: 'TEXT', required: true } },
        },
        USER,
      ),
    (m) => m.includes('cannot be required'),
  )

  const versionBefore = (await getSchema(APP, 'Customer')).version
  const evolved = await updateSchema(
    {
      appsId: APP,
      formId: 'Customer',
      fields: { ...customerSchema.fields, phone: { fieldId: 'phone', fieldType: 'TEXT' } },
    },
    USER,
  )
  check(
    'adding an optional field bumps the version',
    evolved.version === versionBefore + 1,
    `${versionBefore} -> ${evolved.version}`,
  )

  console.log('\nRecord validation and coercion')
  const ada = await createRecord(
    await getSchema(APP, 'Customer'),
    { customerName: 'Ada Lovelace', customerEmail: 'ada@example.com' },
    { userId: USER },
  )
  check('SEQUENCE is generated server-side', ada.customerId === 'CUS-0001', ada.customerId)

  const grace = await createRecord(
    await getSchema(APP, 'Customer'),
    { customerName: 'Grace Hopper', customerEmail: 'grace@example.com' },
    { userId: USER },
  )
  check('SEQUENCE increments', grace.customerId === 'CUS-0002', grace.customerId)

  await rejects(
    'a malformed email is refused',
    async () =>
      createRecord(await getSchema(APP, 'Customer'), { customerName: 'X', customerEmail: 'not-an-email' }, { userId: USER }),
    (m) => m.includes('not a valid email'),
  )

  await rejects(
    'a duplicate unique value is refused',
    async () =>
      createRecord(
        await getSchema(APP, 'Customer'),
        { customerName: 'Impostor', customerEmail: 'ada@example.com' },
        { userId: USER },
      ),
    (m) => m.toLowerCase().includes('already exists'),
  )

  await rejects(
    'a LINKED reference to a non-existent record is refused',
    () =>
      createRecord(
        orderSchema,
        { customerId: '507f1f77bcf86cd799439011', orderDate: '2026-03-01', totalAmount: 10 },
        { userId: USER },
      ),
    (m) => m.includes('no record'),
  )

  await rejects(
    'a required field cannot be omitted',
    () => createRecord(orderSchema, { customerId: String(ada._id), totalAmount: 10 }, { userId: USER }),
    (m) => m.includes('required'),
  )

  await rejects(
    'an unknown field is refused',
    () =>
      createRecord(
        orderSchema,
        { customerId: String(ada._id), orderDate: '2026-03-01', totalAmount: 10, nonsense: 1 },
        { userId: USER },
      ),
    (m) => m.includes('not a field'),
  )

  await rejects(
    'a RELATED field cannot be written',
    async () =>
      createRecord(
        await getSchema(APP, 'Customer'),
        { customerName: 'Z', customerEmail: 'z@example.com', orders: ['x'] },
        { userId: USER },
      ),
    (m) => m.includes('read-only'),
  )

  console.log('\nMoney storage')
  const o1 = await createRecord(
    orderSchema,
    { customerId: String(ada._id), orderDate: '2026-03-03', totalAmount: 129.98 },
    { userId: USER },
  )
  check(
    'MONEY is stored as integer minor units',
    (o1.totalAmount as { centAmount: number }).centAmount === 12998,
    o1.totalAmount,
  )
  check('DATE is stored as a Date, not a string', o1.orderDate instanceof Date, typeof o1.orderDate)

  await createRecord(
    orderSchema,
    { customerId: String(ada._id), orderDate: '2026-03-04', totalAmount: 49.99 },
    { userId: USER },
  )
  await createRecord(
    orderSchema,
    { customerId: String(grace._id), orderDate: '2026-03-05', totalAmount: 419.0 },
    { userId: USER },
  )
  await createRecord(
    orderSchema,
    { customerId: String(grace._id), orderDate: '2026-03-06', totalAmount: 34.99 },
    { userId: USER },
  )

  console.log('\nOne-to-one enforcement')
  await createRecord(cartSchema, { customerId: String(ada._id) }, { userId: USER })
  await rejects(
    'a second cart for the same customer is refused',
    () => createRecord(cartSchema, { customerId: String(ada._id) }, { userId: USER }),
    (m) => m.includes('one-to-one'),
  )

  console.log('\nQuery')
  // Written as a plain dollar amount, the way the UI sends it.
  const over100 = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    filter: { field: 'totalAmount', operator: 'GREATER_THAN', value: 100 },
  })) as Record<string, unknown>[]
  check('MONEY range filter returns the right rows', over100.length === 2, over100.length)

  // The failure mode this guards against: a string comparison would put
  // "49.99" above "100" lexically and quietly return the wrong set.
  check(
    'MONEY filter did not fall back to string comparison',
    over100.every((r) => (r.totalAmount as { centAmount: number }).centAmount > 10000),
    over100.map((r) => r.totalAmount),
  )

  const sorted = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    sort: { field: 'totalAmount', direction: 'ASC' },
  })) as Record<string, unknown>[]
  check(
    'sort by MONEY orders numerically',
    JSON.stringify(sorted.map((r) => (r.totalAmount as { centAmount: number }).centAmount)) ===
      JSON.stringify([3499, 4999, 12998, 41900]),
    sorted.map((r) => r.totalAmount),
  )

  const compound = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    filter: {
      operator: 'AND',
      conditions: [
        { field: 'totalAmount', operator: 'GREATER_THAN', value: 40 },
        { field: 'totalAmount', operator: 'LESS_THAN', value: 200 },
      ],
    },
  })) as Record<string, unknown>[]
  check('compound AND filter works', compound.length === 2, compound.length)

  const dateRange = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    filter: { field: 'orderDate', operator: 'GREATER_THAN_OR_EQUAL', value: '2026-03-05' },
  })) as Record<string, unknown>[]
  check('DATE range filter works', dateRange.length === 2, dateRange.length)

  const count = await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    aggregation: { type: 'COUNT' },
  })
  check('COUNT aggregation', (count as { value: number }).value === 4, count)

  // Orders over $100, grouped by customer, counted.
  const grouped = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    filter: { field: 'totalAmount', operator: 'GREATER_THAN', value: 100 },
    aggregation: { type: 'COUNT', groupBy: 'customerId' },
  })) as { groups: Array<{ key: unknown; value: number }> }
  check('grouped COUNT returns one row per customer', grouped.groups.length === 2, grouped.groups)

  const sum = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    aggregation: { type: 'SUM', field: 'totalAmount' },
  })) as { value: { centAmount: number; currencyCode: string } }
  check('SUM over MONEY re-wraps as money', sum.value.centAmount === 63396 && sum.value.currencyCode === 'USD', sum.value)

  const avg = (await runQuery(orderSchema, {
    appsId: APP,
    formId: 'Order',
    aggregation: { type: 'AVG', field: 'totalAmount' },
  })) as { value: { centAmount: number } }
  check('AVG over MONEY', avg.value.centAmount === 15849, avg.value)

  await rejects(
    'aggregating a TEXT field is refused',
    async () =>
      runQuery(await getSchema(APP, 'Customer'), {
        appsId: APP,
        formId: 'Customer',
        aggregation: { type: 'SUM', field: 'customerName' },
      }),
    (m) => m.includes('NUMERIC or MONEY'),
  )

  await rejects(
    'LIKE on a non-text field is refused',
    () =>
      runQuery(orderSchema, {
        appsId: APP,
        formId: 'Order',
        filter: { field: 'totalAmount', operator: 'LIKE', value: 'x' },
      }),
    (m) => m.includes('LIKE is only valid'),
  )

  const like = (await runQuery(await getSchema(APP, 'Customer'), {
    appsId: APP,
    formId: 'Customer',
    filter: { field: 'customerName', operator: 'LIKE', value: 'ada' },
  })) as Record<string, unknown>[]
  check('LIKE is case-insensitive and matches', like.length === 1, like.length)

  const injection = (await runQuery(await getSchema(APP, 'Customer'), {
    appsId: APP,
    formId: 'Customer',
    filter: { field: 'customerName', operator: 'LIKE', value: '.*' },
  })) as Record<string, unknown>[]
  check('regex metacharacters in LIKE are escaped', injection.length === 0, injection.length)

  console.log('\nRELATED resolution')
  const customers = (await runQuery(await getSchema(APP, 'Customer'), {
    appsId: APP,
    formId: 'Customer',
  })) as Record<string, unknown>[]
  const withRelated = await resolveRelated(await getSchema(APP, 'Customer'), customers)
  const adaRow = withRelated.find((c) => c.customerEmail === 'ada@example.com')!
  check('RELATED resolves the inverse of a LINKED', (adaRow.orders as unknown[]).length === 2, adaRow.orders)
  const graceRow = withRelated.find((c) => c.customerEmail === 'grace@example.com')!
  check('RELATED is per-record, not shared', (graceRow.orders as unknown[]).length === 2, graceRow.orders)

  console.log(`\n${passed} passed, ${failed} failed\n`)

  await disconnect()
  await mongo.stop()
  process.exit(failed ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\nHarness crashed:', err?.details ?? err)
  process.exit(1)
})
