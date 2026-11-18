export type Role = 'admin' | 'staff';
export type Category = 'Tumbler' | 'Chain' | 'Anklet' | 'Ring';
export type Metal = 'gold' | 'silver';
export type PartyType = 'party' | 'shopkeeper' | 'line_member';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
export type MovementType = 'inward' | 'outward' | 'sold' | 'returned';

export const CATEGORIES: Category[] = ['Tumbler', 'Chain', 'Anklet', 'Ring'];
export const METALS: Metal[] = ['gold', 'silver'];
export const PARTY_TYPES: PartyType[] = ['party', 'shopkeeper', 'line_member'];
export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'other'];

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface GoldRate {
  id: number;
  goldRatePerGram: string;
  silverRatePerGram: string;
  effectiveDate: string;
  createdAt: string;
  updatedByName?: string | null;
}

export interface Customer {
  id: number;
  name: string;
  email: string | null;
  mobileNumber: string;
  createdAt: string;
  invoiceCount?: number;
  totalPurchases?: string;
  lastPurchase?: string | null;
}

export interface CustomerDetail extends Customer {
  stats: { invoice_count: number; total_purchases: string; outstanding: string };
  invoices: {
    id: number;
    invoice_number: string;
    invoice_date: string;
    total_weight: string;
    grand_total: string;
    amount_paid: string;
    payment_status: PaymentStatus;
  }[];
  purchasedProducts: {
    id: number;
    product_name: string;
    category: Category;
    metal: Metal;
    weight: string;
    quantity: number;
    total_amount: string;
    invoice_number: string;
    invoice_date: string;
    invoice_id: number;
  }[];
}

export interface Product {
  id: number;
  productName: string;
  category: Category;
  metal: Metal;
  description: string | null;
  weight: string;
  quantity: number;
  purchasePrice: string;
  createdAt: string;
  updatedAt: string;
}

export interface Party {
  id: number;
  name: string;
  mobile_number: string;
  email: string | null;
  address: string | null;
  party_type: PartyType;
  is_active: boolean;
  created_at: string;
  stock_issued: number | string;
  stock_sold: number | string;
  stock_returned: number | string;
  stock_remaining: number | string;
  sales_total: string;
  outstanding: string;
}

export interface InvoiceItem {
  id: number;
  productId: number | null;
  productName: string;
  category: Category;
  metal: Metal;
  description: string | null;
  weight: string;
  quantity: number;
  goldRate: string;
  goldAmount: string;
  makingCharges: string;
  discount: string;
  totalAmount: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  invoiceType: 'retail' | 'wholesale';
  invoiceDate: string;
  goldRatePerGram: string;
  silverRatePerGram: string;
  totalWeight: string;
  goldAmount: string;
  makingCharges: string;
  subtotal: string;
  itemDiscount: string;
  overallDiscount: string;
  discount: string;
  grandTotal: string;
  amountPaid: string;
  paymentStatus: PaymentStatus;
  notes: string | null;
  createdByName: string | null;
  customer: { id: number; name: string; mobileNumber: string; email: string | null } | null;
  party: { id: number; name: string; mobileNumber: string; email: string | null; address: string | null; partyType: PartyType } | null;
  items: InvoiceItem[];
  payments: {
    id: number;
    amount: string;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    paymentReference: string | null;
    receivedByName: string | null;
  }[];
}

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  invoice_type: 'retail' | 'wholesale';
  invoice_date: string;
  total_weight: string;
  grand_total: string;
  amount_paid: string;
  payment_status: PaymentStatus;
  owner_name: string;
  owner_mobile: string;
}

export interface DistributionItem {
  id: number;
  productId: number;
  productName: string;
  category: Category;
  metal: Metal;
  quantityIssued: number;
  quantitySold: number;
  quantityReturned: number;
  remaining: number;
  weight: string;
}

export interface Distribution {
  id: number;
  party_id: number;
  party_name: string;
  party_type: PartyType;
  party_mobile?: string;
  line_member_id: number | null;
  line_member_name: string | null;
  issued_by_name: string | null;
  received_by: string | null;
  total_items_issued: number;
  distribution_date: string;
  last_return_date: string | null;
  status: 'open' | 'partially_settled' | 'closed';
  purpose: string | null;
  remarks: string | null;
  items: DistributionItem[];
  history: Movement[];
}

export interface DistributionRow {
  id: number;
  distribution_date: string;
  status: Distribution['status'];
  purpose: string | null;
  total_items_issued: number;
  last_return_date: string | null;
  received_by: string | null;
  party_id: number;
  party_name: string;
  party_type: PartyType;
  line_member_name: string | null;
  issued_by_name: string | null;
  total_sold: number | string;
  total_returned: number | string;
  total_remaining: number | string;
  total_weight: string;
}

export interface Movement {
  id: number;
  movement_type: MovementType;
  quantity: number;
  weight: string;
  movement_date: string;
  remarks: string | null;
  product_name: string;
  category?: Category;
  created_by_name?: string | null;
  to_party_name?: string | null;
  from_party_name?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  invoice_number?: string | null;
  unit_price?: string | null;
  supplier_details?: string | null;
}
