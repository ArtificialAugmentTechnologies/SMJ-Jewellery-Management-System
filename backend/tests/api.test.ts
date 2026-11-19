/**
 * End-to-end API tests. Runs the real Express app and the real SQL schema on an
 * embedded PostgreSQL engine (PGlite), so no Neon credentials are needed.
 *
 *   npm test
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pglite:memory';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.ADMIN_EMAIL = 'admin@smj.test';
process.env.ADMIN_PASSWORD = 'Admin12345';
process.env.ADMIN_NAME = 'Test Admin';

let base = '';
let server: Server;
let adminToken = '';
let staffToken = '';
let closeDb: () => Promise<void>;
let query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function api(method: string, url: string, body?: unknown, token = adminToken): Promise<{ status: number; body: Json }> {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

before(async () => {
  const silent = () => {};
  const db = await import('../src/config/db.js');
  const { migrate } = await import('../src/scripts/migrate.js');
  const { seed } = await import('../src/scripts/seed.js');
  const { createApp } = await import('../src/app.js');
  await migrate(silent);
  await migrate(silent); // idempotent
  await seed({ log: silent });
  closeDb = db.closeDb;
  query = db.getDbHandle().query;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server?.close();
  await closeDb?.();
});

describe('Database', () => {
  it('has exactly the 11 application tables in public schema', async () => {
    const rows = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      [
        'customers', 'gold_rates', 'invoice_items', 'invoices', 'payments', 'products',
        'stock_movements', 'users', 'wholesale_distribution_items', 'wholesale_distributions', 'wholesale_parties',
      ],
    );
  });

  it('passes the verification script (foreign keys, constraints, write test)', async () => {
    const { verifyDb } = await import('../src/scripts/verifyDb.js');
    assert.equal(await verifyDb(() => {}), true);
  });

  it('migrations and database/schema.sql produce an identical schema', async () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const { PGlite } = await import('@electric-sql/pglite');
    const fresh = new PGlite();
    await fresh.exec(fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8'));
    const shape = async (q: (sql: string) => Promise<unknown[]>) => ({
      columns: await q(`SELECT table_name || '.' || column_name || ' ' || data_type
                          || coalesce('(' || numeric_precision || ',' || numeric_scale || ')', '')
                          || ' null=' || is_nullable || ' default=' || coalesce(column_default, '') AS d
                        FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1`),
      constraints: await q(`SELECT conrelid::regclass || '.' || conname || ' ' || pg_get_constraintdef(oid) AS d
                            FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1`),
      indexes: await q(`SELECT indexdef AS d FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`),
    });
    const fromMigrations = await shape((s) => query(s));
    const fromSchemaFile = await shape(async (s) => (await fresh.query(s)).rows);
    await fresh.close();
    assert.deepEqual(fromMigrations, fromSchemaFile);
  });
});

describe('Security', () => {
  it('stores bcrypt password hashes, never plain text', async () => {
    const [u] = await query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE email = 'admin@smj.test'`);
    assert.match(u.password_hash, /^\$2[aby]\$12\$/);
  });

  it('rejects unauthenticated requests and bad tokens', async () => {
    assert.equal((await api('GET', '/customers', undefined, '')).status, 401);
    assert.equal((await api('GET', '/customers', undefined, 'not-a-token')).status, 401);
  });

  it('rejects wrong passwords', async () => {
    const r = await api('POST', '/auth/login', { email: 'admin@smj.test', password: 'wrong-password1' }, '');
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'invalid_credentials');
  });

  it('logs in the admin and returns a token without the password hash', async () => {
    const r = await api('POST', '/auth/login', { email: 'ADMIN@smj.test', password: 'Admin12345' }, '');
    assert.equal(r.status, 200);
    assert.equal(r.body.user.role, 'admin');
    assert.equal(r.body.user.passwordHash, undefined);
    adminToken = r.body.token;
  });

  it('admin creates a staff user; staff cannot use admin routes', async () => {
    const weak = await api('POST', '/users', { name: 'Weak', email: 'weak@smj.test', role: 'staff', password: 'short' });
    assert.equal(weak.status, 400);
    const c = await api('POST', '/users', { name: 'Kavya Staff', email: 'staff@smj.test', role: 'staff', password: 'Staff12345' });
    assert.equal(c.status, 201);
    const l = await api('POST', '/auth/login', { email: 'staff@smj.test', password: 'Staff12345' }, '');
    staffToken = l.body.token;
    assert.equal((await api('GET', '/users', undefined, staffToken)).status, 403);
    assert.equal((await api('POST', '/gold-rates', { gold_rate_per_gram: 1, silver_rate_per_gram: 1 }, staffToken)).status, 403);
    assert.equal((await api('POST', '/stock/inward', {}, staffToken)).status, 403);
    assert.equal((await api('POST', '/wholesale/parties', {}, staffToken)).status, 403);
    assert.equal((await api('GET', '/dashboard', undefined, staffToken)).status, 200);
  });

  it('validates input on the server', async () => {
    const r = await api('POST', '/customers', { name: '', mobile_number: '12ab' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'validation_error');
  });
});

describe('Retail sales workflow', () => {
  let customerId = 0;
  let chainId = 0;
  let rateId = 0;
  let invoiceId = 0;

  it('refuses to bill before a gold rate is set', async () => {
    const c = await api('POST', '/customers', { name: 'Temp', mobile_number: '9000000001' });
    const r = await api('POST', '/invoices/retail', {
      customer_id: c.body.data.id,
      items: [{ category: 'Ring', weight: '1', quantity: 1 }],
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'no_gold_rate');
  });

  it("admin sets today's gold and silver rate", async () => {
    const r = await api('POST', '/gold-rates', { gold_rate_per_gram: '7000', silver_rate_per_gram: 90.5 });
    assert.equal(r.status, 201);
    const cur = await api('GET', '/gold-rates/current', undefined, staffToken);
    assert.equal(cur.body.data.goldRatePerGram, '7000.00');
    assert.equal(cur.body.data.silverRatePerGram, '90.50');
    rateId = cur.body.data.id;
  });

  it('step 1: unknown mobile number is reported as a new customer', async () => {
    const r = await api('GET', '/customers/lookup?mobile=9876543210', undefined, staffToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.found, false);
  });

  it('registers a new customer and prevents duplicates by mobile number', async () => {
    const r = await api('POST', '/customers', { name: 'Lakshmi R', email: 'Lakshmi@Example.com', mobile_number: '+91 98765 43210' }, staffToken);
    assert.equal(r.status, 201);
    assert.equal(r.body.data.mobileNumber, '9876543210');
    assert.equal(r.body.data.email, 'lakshmi@example.com');
    customerId = r.body.data.id;
    const dup = await api('POST', '/customers', { name: 'Someone Else', mobile_number: '9876543210' }, staffToken);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'duplicate_mobile');
  });

  it('admin records stock inward for a product', async () => {
    const r = await api('POST', '/stock/inward', {
      product_name: 'Rope Chain 22K',
      category: 'Chain',
      metal: 'gold',
      weight: '10',
      quantity: 5,
      purchase_price: '65000',
      supplier_details: 'Chennai Bullion Traders',
    });
    assert.equal(r.status, 201);
    chainId = r.body.data.product.id;
    assert.equal(r.body.data.product.quantity, 5);
    // Second inward for the same name+category adds to the same product.
    const again = await api('POST', '/stock/inward', { product_name: 'rope chain 22k', category: 'Chain', weight: '10', quantity: 1, purchase_price: '65000' });
    assert.equal(again.body.data.product.id, chainId);
    assert.equal(again.body.data.product.quantity, 6);
  });

  it('rejects a discount larger than the item subtotal', async () => {
    const r = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Ring', product_name: 'Ring', weight: '1', quantity: 1, making_charges: '0', discount: '7001' }],
    }, staffToken);
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'discount_exceeds_amount');
  });

  it('rejects an overall discount that would make the total negative', async () => {
    const r = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Ring', product_name: 'Ring', weight: '1', quantity: 1 }],
      overall_discount: '7000.01',
    }, staffToken);
    assert.equal(r.status, 400);
  });

  it('generates and saves an invoice with exact server-side calculations', async () => {
    const r = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      gold_rate_id: rateId,
      items: [
        // manual item: 3.5 g x 7000 x 1 = 24500 + 500 - 100 = 24900
        { category: 'Ring', product_name: 'Stone Ring', description: 'Ruby stone', weight: '3.5', quantity: 1, making_charges: '500', discount: '100' },
        // inventory item: 10 g x 7000 x 2 = 140000 + 1000 = 141000
        { product_id: chainId, category: 'Chain', weight: '10', quantity: 2, making_charges: '1000', discount: '0' },
        // silver item uses the silver rate: 20 g x 90.50 x 1 = 1810
        { category: 'Anklet', metal: 'silver', product_name: 'Silver Kolusu', weight: '20', quantity: 1 },
      ],
      overall_discount: '200',
      payment: { amount: '10000', method: 'upi', reference: 'UPI123' },
    }, staffToken);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const inv = r.body.data;
    invoiceId = inv.id;
    assert.match(inv.invoiceNumber, /^SMJ-R-\d{4}-00001$/);
    assert.equal(inv.totalWeight, '43.500');
    assert.equal(inv.goldAmount, '166310.00');
    assert.equal(inv.makingCharges, '1500.00');
    assert.equal(inv.subtotal, '167810.00');
    assert.equal(inv.itemDiscount, '100.00');
    assert.equal(inv.overallDiscount, '200.00');
    assert.equal(inv.discount, '300.00');
    assert.equal(inv.grandTotal, '167510.00');
    assert.equal(inv.amountPaid, '10000.00');
    assert.equal(inv.paymentStatus, 'partial');
    assert.equal(inv.items.length, 3);
    assert.equal(inv.items[0].totalAmount, '24900.00');
    assert.equal(inv.items[1].goldRate, '7000.00');
    assert.equal(inv.items[2].goldRate, '90.50');
    assert.equal(inv.customer.name, 'Lakshmi R');
    assert.equal(inv.createdByName, 'Kavya Staff');
  });

  it('deducts inventory and logs a "sold" movement for inventory items', async () => {
    const p = await api('GET', `/products/${chainId}`);
    assert.equal(p.body.data.quantity, 4);
    const sold = p.body.data.movements.find((m: Json) => m.movementType === 'sold');
    assert.equal(sold.quantity, 2);
    assert.equal(sold.referenceId, invoiceId);
  });

  it('prevents selling more than available stock (and rolls back the whole invoice)', async () => {
    const before = await api('GET', '/invoices?type=retail');
    const r = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ product_id: chainId, category: 'Chain', weight: '10', quantity: 99 }],
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'insufficient_stock');
    const afterList = await api('GET', '/invoices?type=retail');
    assert.equal(afterList.body.total, before.body.total);
  });

  it('existing customer lookup returns details, purchase history and purchased products', async () => {
    const r = await api('GET', '/customers/lookup?mobile=9876543210', undefined, staffToken);
    assert.equal(r.body.found, true);
    assert.equal(r.body.data.name, 'Lakshmi R');
    assert.equal(r.body.data.email, 'lakshmi@example.com');
    assert.equal(r.body.data.invoices.length, 1);
    assert.equal(r.body.data.purchasedProducts.length, 3);
  });

  it('new bills use an updated rate; old invoices keep their original rate', async () => {
    await api('POST', '/gold-rates', { gold_rate_per_gram: '7200', silver_rate_per_gram: '92' });
    const stale = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      gold_rate_id: rateId,
      items: [{ category: 'Ring', product_name: 'Ring', weight: '1', quantity: 1 }],
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'rate_changed');
    const fresh = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Ring', product_name: 'Ring', weight: '1', quantity: 1 }],
    });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.body.data.items[0].goldRate, '7200.00');
    assert.equal(fresh.body.data.paymentStatus, 'unpaid');
    const old = await api('GET', `/invoices/${invoiceId}`);
    assert.equal(old.body.data.goldRatePerGram, '7000.00');
    assert.equal(old.body.data.items[0].goldRate, '7000.00');
    assert.equal(old.body.data.grandTotal, '167510.00');
    const history = await api('GET', '/gold-rates');
    assert.equal(history.body.data.length, 2);
  });

  it('optional GST: 3% on the taxable value, rounded to the paisa', async () => {
    // 2 g x 7200 = 14400 + 600 making = 15000; item discount 1500 -> 13500; invoice discount 500 -> 13000
    // GST 3% of 13000 = 390.00 -> grand total 13390.00
    const r = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Chain', product_name: 'GST Chain', weight: '2', quantity: 1, making_charges: '600', discount: '1500' }],
      overall_discount: '500',
      gst_rate: '3',
      payment: { amount: '13390', method: 'cash' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.subtotal, '15000.00');
    assert.equal(r.body.data.discount, '2000.00');
    assert.equal(r.body.data.gstRate, '3.00');
    assert.equal(r.body.data.gstAmount, '390.00');
    assert.equal(r.body.data.grandTotal, '13390.00');
    assert.equal(r.body.data.paymentStatus, 'paid');
    // No GST when the box is not ticked
    const noGst = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Ring', product_name: 'No GST Ring', weight: '1', quantity: 1 }],
    });
    assert.equal(noGst.body.data.gstAmount, '0.00');
    assert.equal(noGst.body.data.grandTotal, '7200.00');
    // A rate above 28% is rejected
    const bad = await api('POST', '/invoices/retail', {
      customer_id: customerId,
      items: [{ category: 'Ring', product_name: 'Bad', weight: '1', quantity: 1 }],
      gst_rate: '30',
    });
    assert.equal(bad.status, 400);
  });

  it('records payments and prevents over-payment', async () => {
    const over = await api('POST', `/invoices/${invoiceId}/payments`, { amount: '157510.01', method: 'cash' });
    assert.equal(over.status, 400);
    const ok = await api('POST', `/invoices/${invoiceId}/payments`, { amount: '157510', method: 'cash' }, staffToken);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.paymentStatus, 'paid');
    assert.equal(ok.body.data.payments.length, 2);
  });

  it('completed invoices cannot be edited or deleted through the API', async () => {
    assert.equal((await api('PATCH', `/invoices/${invoiceId}`, { grand_total: 1 })).status, 404);
    assert.equal((await api('DELETE', `/invoices/${invoiceId}`)).status, 404);
  });

  it('billing history supports search and filters', async () => {
    const all = await api('GET', '/invoices');
    assert.equal(all.body.total, 4);
    assert.equal((await api('GET', '/invoices?search=98765')).body.total, 4);
    assert.equal((await api('GET', '/invoices?invoice_number=00001')).body.total, 1);
    assert.equal((await api('GET', '/invoices?type=wholesale')).body.total, 0);
    assert.equal((await api('GET', '/invoices?payment_status=unpaid')).body.total, 2);
    assert.equal((await api('GET', `/invoices?from=${new Date(Date.now() + 86400000).toISOString()}`)).body.total, 0);
    assert.equal((await api('GET', `/invoices?customer_id=${customerId}`)).body.total, 4);
  });
});

describe('Wholesale workflow', () => {
  let partyId = 0;
  let shopkeeperId = 0;
  let lineMemberId = 0;
  let ringId = 0;
  let distributionId = 0;

  it('registers a party, a shopkeeper and a line member', async () => {
    const p = await api('POST', '/wholesale/parties', { name: 'Sri Murugan Traders', mobile_number: '9840011111', address: 'Madurai', party_type: 'party' });
    const s = await api('POST', '/wholesale/parties', { name: 'Ganesh Jewel Shop', mobile_number: '9840022222', party_type: 'shopkeeper' });
    const l = await api('POST', '/wholesale/parties', { name: 'Ravi Kumar', mobile_number: '9840033333', party_type: 'line_member' });
    assert.equal(p.status, 201);
    assert.equal(s.status, 201);
    assert.equal(l.status, 201);
    partyId = p.body.data.id;
    shopkeeperId = s.body.data.id;
    lineMemberId = l.body.data.id;
    const dup = await api('POST', '/wholesale/parties', { name: 'Dup', mobile_number: '9840033333', party_type: 'line_member' });
    assert.equal(dup.status, 409);
    const edit = await api('PATCH', `/wholesale/parties/${partyId}`, { address: 'Madurai Main Bazaar' });
    assert.equal(edit.body.data.address, 'Madurai Main Bazaar');
    const lms = await api('GET', '/wholesale/parties?type=line_member', undefined, staffToken);
    assert.equal(lms.body.data.length, 1);
  });

  it('issues 50 items to a line member (stock outward)', async () => {
    const inward = await api('POST', '/stock/inward', { product_name: 'Ladies Ring 22K', category: 'Ring', weight: '2.5', quantity: 60, purchase_price: '17000' });
    ringId = inward.body.data.product.id;
    const tooMany = await api('POST', '/stock/outward', { party_id: lineMemberId, items: [{ product_id: ringId, quantity: 61 }] });
    assert.equal(tooMany.status, 409);
    const r = await api('POST', '/stock/outward', {
      party_id: lineMemberId,
      items: [{ product_id: ringId, quantity: 50 }],
      purpose: 'Village line sales',
      received_by: 'Ravi Kumar',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    distributionId = r.body.data.id;
    assert.equal(r.body.data.total_items_issued, 50);
    assert.equal(r.body.data.items[0].remaining, 50);
    assert.equal(r.body.data.items[0].weight, '125.000');
    const p = await api('GET', `/products/${ringId}`);
    assert.equal(p.body.data.quantity, 10);
  });

  it('records 20 sold, then 30 returned, leaving 0 remaining', async () => {
    const dist = await api('GET', `/wholesale/distributions/${distributionId}`);
    const itemId = dist.body.data.items[0].id;
    const sold = await api('POST', `/wholesale/distributions/${distributionId}/settle`, { items: [{ item_id: itemId, sold: 20 }] });
    assert.equal(sold.status, 200);
    assert.equal(sold.body.data.items[0].remaining, 30);
    assert.equal(sold.body.data.status, 'partially_settled');

    const over = await api('POST', `/wholesale/distributions/${distributionId}/settle`, { items: [{ item_id: itemId, sold: 1, returned: 30 }] });
    assert.equal(over.status, 400);
    assert.equal(over.body.error.code, 'exceeds_remaining');

    const ret = await api('POST', `/wholesale/distributions/${distributionId}/settle`, {
      items: [{ item_id: itemId, returned: 30 }],
      received_by: 'Store Manager',
    });
    assert.equal(ret.status, 200);
    const item = ret.body.data.items[0];
    assert.equal(item.quantityIssued, 50);
    assert.equal(item.quantitySold, 20);
    assert.equal(item.quantityReturned, 30);
    assert.equal(item.remaining, 0);
    assert.equal(ret.body.data.status, 'closed');
    assert.ok(ret.body.data.last_return_date);

    // Returned items are back in store stock.
    const p = await api('GET', `/products/${ringId}`);
    assert.equal(p.body.data.quantity, 40);
  });

  it('database CHECK constraint blocks sold + returned > issued even outside the API', async () => {
    await assert.rejects(
      query(`UPDATE wholesale_distribution_items SET quantity_sold = quantity_sold + 1 WHERE distribution_id = $1`, [distributionId]),
      /wdi_balance_chk/,
    );
  });

  it('keeps a complete stock movement history', async () => {
    const r = await api('GET', `/stock/movements?product_id=${ringId}`);
    const types = r.body.data.map((m: Json) => `${m.movement_type}:${m.quantity}`).sort();
    assert.deepEqual(types, ['inward:60', 'outward:50', 'returned:30', 'sold:20']);
    const dist = await api('GET', `/wholesale/distributions/${distributionId}`);
    assert.equal(dist.body.data.history.length, 3);
    const party = await api('GET', `/wholesale/parties/${lineMemberId}`);
    assert.equal(party.body.data.stats.stock_issued, 50);
    assert.equal(party.body.data.stats.stock_remaining, 0);
  });

  it('stock summary reconciles: in - out + returned - store sales = available', async () => {
    const r = await api('GET', '/stock/summary');
    const s = r.body.data;
    // Inward: chain 6 + rings 60 = 66. Outward 50. Returned 30. Retail sold from store: 2.
    assert.equal(Number(s.total_in), 66);
    assert.equal(Number(s.total_out), 50);
    assert.equal(Number(s.returned), 30);
    assert.equal(Number(s.sold), 22); // 2 retail + 20 by line member
    assert.equal(Number(s.available), 44); // 4 chains + 40 rings
    assert.equal(Number(s.with_parties), 0);
  });

  it('creates a wholesale invoice for a shopkeeper with outstanding balance', async () => {
    const r = await api('POST', '/invoices/wholesale', {
      party_id: shopkeeperId,
      items: [{ product_id: ringId, category: 'Ring', weight: '2.5', quantity: 10, making_charges: '2000' }],
      payment: { amount: '50000', method: 'bank_transfer' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.data.invoiceNumber, /^SMJ-W-/);
    // 2.5 x 7200 x 10 = 180000 + 2000
    assert.equal(r.body.data.grandTotal, '182000.00');
    assert.equal(r.body.data.party.name, 'Ganesh Jewel Shop');
    const shop = await api('GET', `/wholesale/parties/${shopkeeperId}`);
    assert.equal(shop.body.data.stats.outstanding, '132000.00');
    const retailForParty = await api('POST', '/invoices/retail', { party_id: shopkeeperId, items: [] });
    assert.equal(retailForParty.status, 400);
  });

  it('second distribution via party + line member, partial settlement', async () => {
    const r = await api('POST', '/wholesale/distributions', {
      party_id: partyId,
      line_member_id: lineMemberId,
      items: [{ product_id: ringId, quantity: 5 }],
    });
    assert.equal(r.status, 201);
    const list = await api('GET', `/wholesale/distributions?party_id=${partyId}`, undefined, staffToken);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].line_member_name, 'Ravi Kumar');
  });
});

describe('Dashboard and reports', () => {
  it('dashboard returns totals, current rate and recent transactions', async () => {
    const r = await api('GET', '/dashboard', undefined, staffToken);
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.equal(Number(d.total_customers), 2);
    assert.equal(Number(d.retail_count), 4);
    assert.equal(Number(d.wholesale_count), 1);
    assert.equal(d.currentRate.goldRatePerGram, '7200.00');
    assert.equal(d.recentTransactions.length, 5);
  });

  for (const report of [
    'daily-sales', 'monthly-sales', 'retail-sales', 'wholesale-sales', 'customer-history',
    'product-sales', 'stock-inward', 'stock-outward', 'returned-items', 'outstanding-payments',
  ]) {
    it(`report: ${report}`, async () => {
      const r = await api('GET', `/reports/${report}?from=2020-01-01&to=2100-01-01`, undefined, staffToken);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(Array.isArray(r.body.data));
      assert.ok(r.body.data.length > 0, `${report} returned no rows`);
    });
  }

  it('daily sales totals add up', async () => {
    const r = await api('GET', '/reports/daily-sales');
    assert.equal(Number(r.body.data[0].grand_total), 167510 + 7200 + 13390 + 7200 + 182000);
  });

  it('unknown report is rejected', async () => {
    assert.equal((await api('GET', '/reports/drop-tables')).status, 400);
  });
});
