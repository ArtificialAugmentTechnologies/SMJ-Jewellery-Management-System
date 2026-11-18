/**
 * Drizzle ORM table definitions. These mirror database/schema.sql exactly;
 * the SQL file (applied through backend/migrations) is the source of truth
 * for constraints and indexes.
 */
import {
  pgTable,
  integer,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  mobileNumber: varchar('mobile_number', { length: 15 }),
  role: varchar('role', { length: 20 }).notNull().default('staff'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const customers = pgTable('customers', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }),
  mobileNumber: varchar('mobile_number', { length: 10 }).notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const goldRates = pgTable('gold_rates', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  goldRatePerGram: numeric('gold_rate_per_gram', { precision: 12, scale: 2 }).notNull(),
  silverRatePerGram: numeric('silver_rate_per_gram', { precision: 12, scale: 2 }).notNull(),
  effectiveDate: ts('effective_date').notNull().defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  productName: varchar('product_name', { length: 150 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  metal: varchar('metal', { length: 10 }).notNull().default('gold'),
  description: text('description'),
  weight: numeric('weight', { precision: 10, scale: 3 }).notNull().default('0'),
  quantity: integer('quantity').notNull().default(0),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const wholesaleParties = pgTable('wholesale_parties', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  name: varchar('name', { length: 150 }).notNull(),
  mobileNumber: varchar('mobile_number', { length: 10 }).notNull(),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  partyType: varchar('party_type', { length: 20 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  invoiceNumber: varchar('invoice_number', { length: 30 }).notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id),
  partyId: integer('party_id').references(() => wholesaleParties.id),
  invoiceType: varchar('invoice_type', { length: 10 }).notNull(),
  invoiceDate: ts('invoice_date').notNull().defaultNow(),
  goldRateId: integer('gold_rate_id').references(() => goldRates.id),
  goldRatePerGram: numeric('gold_rate_per_gram', { precision: 12, scale: 2 }).notNull(),
  silverRatePerGram: numeric('silver_rate_per_gram', { precision: 12, scale: 2 }).notNull(),
  totalWeight: numeric('total_weight', { precision: 12, scale: 3 }).notNull().default('0'),
  goldAmount: numeric('gold_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  makingCharges: numeric('making_charges', { precision: 14, scale: 2 }).notNull().default('0'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  itemDiscount: numeric('item_discount', { precision: 14, scale: 2 }).notNull().default('0'),
  overallDiscount: numeric('overall_discount', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 14, scale: 2 }).notNull().default('0'),
  amountPaid: numeric('amount_paid', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentStatus: varchar('payment_status', { length: 10 }).notNull().default('unpaid'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  productId: integer('product_id').references(() => products.id),
  productName: varchar('product_name', { length: 150 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  metal: varchar('metal', { length: 10 }).notNull().default('gold'),
  description: text('description'),
  weight: numeric('weight', { precision: 10, scale: 3 }).notNull(),
  quantity: integer('quantity').notNull(),
  goldRate: numeric('gold_rate', { precision: 12, scale: 2 }).notNull(),
  goldAmount: numeric('gold_amount', { precision: 14, scale: 2 }).notNull(),
  makingCharges: numeric('making_charges', { precision: 14, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
});

export const wholesaleDistributions = pgTable('wholesale_distributions', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  partyId: integer('party_id').notNull().references(() => wholesaleParties.id),
  lineMemberId: integer('line_member_id').references(() => wholesaleParties.id),
  issuedBy: integer('issued_by').references(() => users.id),
  receivedBy: varchar('received_by', { length: 120 }),
  totalItemsIssued: integer('total_items_issued').notNull(),
  distributionDate: ts('distribution_date').notNull().defaultNow(),
  lastReturnDate: ts('last_return_date'),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  purpose: varchar('purpose', { length: 255 }),
  remarks: text('remarks'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const wholesaleDistributionItems = pgTable('wholesale_distribution_items', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  distributionId: integer('distribution_id')
    .notNull()
    .references(() => wholesaleDistributions.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantityIssued: integer('quantity_issued').notNull(),
  quantitySold: integer('quantity_sold').notNull().default(0),
  quantityReturned: integer('quantity_returned').notNull().default(0),
  weight: numeric('weight', { precision: 12, scale: 3 }).notNull().default('0'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const stockMovements = pgTable('stock_movements', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  productId: integer('product_id').notNull().references(() => products.id),
  movementType: varchar('movement_type', { length: 10 }).notNull(),
  quantity: integer('quantity').notNull(),
  weight: numeric('weight', { precision: 12, scale: 3 }).notNull().default('0'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
  supplierDetails: text('supplier_details'),
  fromPartyId: integer('from_party_id').references(() => wholesaleParties.id),
  toPartyId: integer('to_party_id').references(() => wholesaleParties.id),
  referenceType: varchar('reference_type', { length: 30 }),
  referenceId: integer('reference_id'),
  movementDate: ts('movement_date').notNull().defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
  remarks: text('remarks'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull(),
  paymentDate: ts('payment_date').notNull().defaultNow(),
  paymentReference: varchar('payment_reference', { length: 120 }),
  receivedBy: integer('received_by').references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const CATEGORIES = ['Tumbler', 'Chain', 'Anklet', 'Ring'] as const;
export const METALS = ['gold', 'silver'] as const;
export const PARTY_TYPES = ['party', 'shopkeeper', 'line_member'] as const;
export const USER_ROLES = ['admin', 'staff', 'party', 'shopkeeper', 'line_member'] as const;
export const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'other'] as const;
