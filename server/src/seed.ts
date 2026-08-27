/**
 * Seeds a five-schema e-commerce model, populated with enough records that
 * the filters and aggregations in the query builder return something
 * meaningful.
 *
 * It exercises every field type and both relationship kinds: SEQUENCE ids,
 * MONEY totals, a one-to-one cart, one-to-many orders, a join entity, and a
 * RELATED inverse.
 *
 * Talks to the running API over HTTP rather than to MongoDB directly, so it
 * works the same whether the server is backed by a real database or by the
 * in-memory one.
 *
 * Run:  npm run seed          (with the server already running)
 */
import type { SchemaDraft } from './validate/schema.js'

const BASE = process.env.IDMP_API ?? 'http://127.0.0.1:4441/no-code-db-api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify((json as { details?: unknown }).details ?? json)}`)
  }
  return json as T
}

const APP = 'ECommerceApp'

const schemas: SchemaDraft[] = [
  {
    appsId: APP,
    formId: 'Product',
    description: 'An item offered for sale.',
    fields: {
      productId: { fieldId: 'productId', fieldType: 'SEQUENCE', prefix: 'PRD-', padding: 4 },
      productName: { fieldId: 'productName', fieldType: 'TEXT', required: true },
      sku: { fieldId: 'sku', fieldType: 'TEXT', required: true, unique: true },
      productPrice: {
        fieldId: 'productPrice',
        fieldType: 'MONEY',
        required: true,
        currencyCode: 'USD',
        fractionDigits: 2,
      },
      stockQty: { fieldId: 'stockQty', fieldType: 'NUMERIC', required: true },
      available: { fieldId: 'available', fieldType: 'BOOLEAN', default: true },
    },
  },
  {
    appsId: APP,
    formId: 'Customer',
    description: 'A person with an account in the store.',
    fields: {
      customerId: { fieldId: 'customerId', fieldType: 'SEQUENCE', prefix: 'CUS-', padding: 4 },
      customerName: { fieldId: 'customerName', fieldType: 'TEXT', required: true },
      customerEmail: { fieldId: 'customerEmail', fieldType: 'EMAIL', required: true, unique: true },
      // Inverse of Order.customerId. Never stored; resolved on read.
      orders: {
        fieldId: 'orders',
        fieldType: 'RELATED',
        relatedFormId: 'Order',
        relatedFieldId: 'customerId',
      },
    },
  },
  {
    appsId: APP,
    formId: 'ShoppingCart',
    description: "A customer's active cart.",
    fields: {
      cartId: { fieldId: 'cartId', fieldType: 'SEQUENCE', prefix: 'CRT-', padding: 4 },
      // One cart per customer: allowMultiple false plus unique is the 1:1 case.
      customerId: {
        fieldId: 'customerId',
        fieldType: 'LINKED',
        linkedFormId: 'Customer',
        required: true,
        allowMultiple: false,
        unique: true,
      },
      updatedOn: { fieldId: 'updatedOn', fieldType: 'DATE' },
    },
  },
  {
    appsId: APP,
    formId: 'Order',
    description: 'A completed purchase placed by a customer.',
    fields: {
      orderId: { fieldId: 'orderId', fieldType: 'SEQUENCE', prefix: 'ORD-', padding: 4 },
      // Many orders per customer.
      customerId: {
        fieldId: 'customerId',
        fieldType: 'LINKED',
        linkedFormId: 'Customer',
        required: true,
        allowMultiple: false,
      },
      orderDate: { fieldId: 'orderDate', fieldType: 'DATE', required: true },
      totalAmount: {
        fieldId: 'totalAmount',
        fieldType: 'MONEY',
        required: true,
        currencyCode: 'USD',
        fractionDigits: 2,
      },
      status: { fieldId: 'status', fieldType: 'TEXT', required: true, default: 'pending' },
    },
  },
  {
    appsId: APP,
    formId: 'OrderItem',
    description: 'A single product line within an order.',
    fields: {
      orderItemId: { fieldId: 'orderItemId', fieldType: 'SEQUENCE', prefix: 'ITM-', padding: 4 },
      orderId: { fieldId: 'orderId', fieldType: 'LINKED', linkedFormId: 'Order', required: true },
      productId: { fieldId: 'productId', fieldType: 'LINKED', linkedFormId: 'Product', required: true },
      quantity: { fieldId: 'quantity', fieldType: 'NUMERIC', required: true },
      // Locked in at purchase time so order history survives price changes.
      unitPrice: {
        fieldId: 'unitPrice',
        fieldType: 'MONEY',
        required: true,
        currencyCode: 'USD',
        fractionDigits: 2,
      },
    },
  },
]

const products = [
  { productName: 'Wireless Mouse', sku: 'WM-001', productPrice: 29.99, stockQty: 150, available: true },
  { productName: 'USB-C Hub', sku: 'UH-002', productPrice: 49.99, stockQty: 85, available: true },
  { productName: 'Desk Lamp', sku: 'DL-003', productPrice: 34.99, stockQty: 60, available: true },
  { productName: 'Mechanical Keyboard', sku: 'MK-004', productPrice: 89.99, stockQty: 40, available: true },
  { productName: '4K Monitor', sku: 'MN-005', productPrice: 329.0, stockQty: 12, available: true },
  { productName: 'Laptop Stand', sku: 'LS-006', productPrice: 44.5, stockQty: 0, available: false },
]

const customers = [
  { customerName: 'Ada Lovelace', customerEmail: 'ada@example.com' },
  { customerName: 'Grace Hopper', customerEmail: 'grace@example.com' },
  { customerName: 'Alan Turing', customerEmail: 'alan@example.com' },
]

async function main() {
  try {
    await fetch(`${BASE}/health`).then((r) => {
      if (!r.ok) throw new Error()
    })
  } catch {
    console.error(`Cannot reach the IDMP API at ${BASE}.`)
    console.error('Start it first:  npm run dev:memory')
    process.exit(1)
  }

  console.log(`Deploying ${schemas.length} schemas to "${APP}"...`)
  const report = await post<{
    deployed: Array<{ formId: string; version: number; collection: string }>
    failed: Array<{ formId: string; errors: unknown }>
  }>('/form/schema/batch', { appsId: APP, appsName: 'E-Commerce Store', schemas })

  for (const d of report.deployed) console.log(`  ok   ${d.formId} -> ${d.collection} (v${d.version})`)
  for (const f of report.failed) console.log(`  FAIL ${f.formId}`, JSON.stringify(f.errors))
  if (report.failed.length) process.exit(1)

  const insert = (formId: string, fields: Record<string, unknown>) =>
    post<{ _id: string }>('/form/data', { appsId: APP, formId, fields })

  const productIds: string[] = []
  for (const p of products) productIds.push((await insert('Product', p))._id)
  console.log(`  ${productIds.length} products`)

  const customerIds: string[] = []
  for (const c of customers) customerIds.push((await insert('Customer', c))._id)
  console.log(`  ${customerIds.length} customers`)

  for (const customerId of customerIds) {
    await insert('ShoppingCart', { customerId, updatedOn: new Date().toISOString() })
  }
  console.log(`  ${customerIds.length} carts (one per customer, enforced 1:1)`)

  // Enough orders above and below $100 that a price filter is not trivially
  // everything or nothing.
  const orderPlan = [
    { customer: 0, total: 129.98, items: [[0, 2, 29.99], [2, 2, 34.99]] },
    { customer: 0, total: 49.99, items: [[1, 1, 49.99]] },
    { customer: 1, total: 419.0, items: [[4, 1, 329.0], [3, 1, 89.99]] },
    { customer: 1, total: 179.98, items: [[3, 2, 89.99]] },
    { customer: 1, total: 34.99, items: [[2, 1, 34.99]] },
    { customer: 2, total: 109.98, items: [[1, 1, 49.99], [0, 2, 29.99]] },
  ]

  let itemCount = 0
  for (const [i, plan] of orderPlan.entries()) {
    const order = await insert('Order', {
      customerId: customerIds[plan.customer],
      orderDate: new Date(Date.UTC(2026, 2, 3 + i)).toISOString().slice(0, 10),
      totalAmount: plan.total,
      status: i % 3 === 0 ? 'shipped' : 'pending',
    })

    for (const [productIdx, qty, price] of plan.items) {
      await insert('OrderItem', {
        orderId: order._id,
        productId: productIds[productIdx],
        quantity: qty,
        unitPrice: price,
      })
      itemCount++
    }
  }
  console.log(`  ${orderPlan.length} orders, ${itemCount} order items`)

  console.log(`\nSeed complete. Open http://localhost:3000 to see it.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
