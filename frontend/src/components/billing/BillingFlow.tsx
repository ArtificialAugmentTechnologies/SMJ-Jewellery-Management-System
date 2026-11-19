import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  History,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { useRate, useToast } from '../../context/AppProviders';
import { api, ApiError } from '../../lib/api';
import { calcLine, discountPaise, mgToNumber, paiseToNumber, paiseToString, toPaise, type DiscountMode } from '../../lib/money';
import { formatMoney, formatWeight } from '../../lib/format';
import { downloadInvoicePdf } from '../../lib/exporters';
import {
  CATEGORIES,
  METALS,
  PAYMENT_METHODS,
  type Category,
  type Invoice,
  type Metal,
  type PaymentMethod,
  type Product,
} from '../../lib/types';
import { Alert, Button, Card, CardHeader, Input, Select, Textarea, UnitToggle, cx } from '../ui';
import InvoiceView from './InvoiceView';

/* ------------------------------------------------------------- Stepper --- */

export function Stepper({ steps, current, onStepClick }: { steps: string[]; current: number; onStepClick?: (i: number) => void }) {
  return (
    <ol className="no-print mb-6 grid grid-cols-4 gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = onStepClick && i < current;
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              className={cx(
                'flex w-full flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors sm:flex-row sm:gap-3 sm:px-3 sm:text-left',
                active && 'border-gold-400 bg-gold-50 dark:border-gold-700 dark:bg-gold-900/30',
                done && 'border-line bg-surface hover:border-gold-300',
                !active && !done && 'border-line bg-surface opacity-60',
              )}
            >
              <span
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done ? 'bg-emerald-500 text-white' : active ? 'gold-gradient text-white' : 'bg-surface-2 text-muted',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cx('text-[11px] font-medium leading-tight sm:text-sm', active ? 'text-ink' : 'text-muted')}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------- Types --- */

interface DraftItem {
  key: number;
  product_id: number | null;
  product_name: string;
  category: Category;
  metal: Metal;
  description: string;
  weight: string;
  quantity: string;
  making_charges: string;
  /** What the user typed: a percentage (default) or a rupee amount, per `discount_mode`. */
  discount: string;
  discount_mode: DiscountMode;
  available?: number;
}

/** Line amounts in paise. A percentage discount applies to the item subtotal (gold + making). */
function computeLine(
  it: { weight: string; quantity: string | number; making_charges: string; discount: string; discount_mode: DiscountMode },
  rate: string,
) {
  const base = calcLine({ weight: it.weight, quantity: it.quantity, rate, making_charges: it.making_charges, discount: '0' });
  const discount = discountPaise(base.subtotal, it.discount, it.discount_mode);
  return { ...base, discount, total: base.subtotal - discount };
}
type LineCalc = ReturnType<typeof computeLine>;

/**
 * Bill totals. A percentage invoice discount applies to the amount after item discounts.
 * Optional GST applies to the taxable value (after all discounts). Mirrors the server calculation.
 */
function computeTotals(lines: LineCalc[], overallValue: string, overallMode: DiscountMode, gstRate: string | null) {
  const sum = (f: (c: LineCalc) => bigint) => lines.reduce((a, c) => a + f(c), 0n);
  const goldAmount = sum((c) => c.goldAmount);
  const making = sum((c) => c.making);
  const itemDiscount = sum((c) => c.discount);
  const subtotal = goldAmount + making;
  const overall = discountPaise(subtotal - itemDiscount, overallValue, overallMode);
  const discount = itemDiscount + overall;
  const taxable = subtotal - discount;
  const gst = gstRate ? discountPaise(taxable, gstRate, 'percent') : 0n;
  return {
    totalWeightMg: sum((c) => c.weightMg),
    goldAmount,
    making,
    subtotal,
    itemDiscount,
    overall,
    discount,
    taxable,
    gstRate: gstRate ?? '0',
    gst,
    grandTotal: taxable + gst,
  };
}

function DiscountToggle({ value, onChange }: { value: DiscountMode; onChange: (m: DiscountMode) => void }) {
  const { t } = useI18n();
  return (
    <UnitToggle<DiscountMode>
      label={t('items.discountType')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'percent', label: '%', title: t('items.discountPercent') },
        { value: 'amount', label: '₹', title: t('items.discountAmount') },
      ]}
    />
  );
}
export type BillTotals = ReturnType<typeof computeTotals>;

const pctTooHigh = (value: string, mode: DiscountMode) => mode === 'percent' && Number(value || 0) > 100;

type PayMode = 'full' | 'partial' | 'unpaid';

const emptyItem = (category: Category | '' = ''): Omit<DraftItem, 'key' | 'category'> & { category: Category | '' } => ({
  product_id: null,
  product_name: '',
  category,
  metal: 'gold',
  description: '',
  weight: '',
  quantity: '1',
  making_charges: '0',
  discount: '',
  discount_mode: 'percent',
});

let keySeq = 1;

/* ----------------------------------------------------------- Component --- */

export interface BillingOwner {
  id: number;
  name: string;
  mobileNumber: string;
  email: string | null;
  address?: string | null;
  partyType?: 'party' | 'shopkeeper' | 'line_member';
}

export default function BillingFlow({
  type,
  owner,
  ownerStepLabel,
  ownerCard,
  onChangeOwner,
  onNewBill,
}: {
  type: 'retail' | 'wholesale';
  owner: BillingOwner;
  ownerStepLabel: string;
  ownerCard: ReactNode;
  onChangeOwner: () => void;
  onNewBill: () => void;
}) {
  const { t, te } = useI18n();
  const notify = useToast();
  const { rate, refresh: refreshRate } = useRate();

  const [step, setStep] = useState(1); // 1 = products, 2 = discount/payment, 3 = bill
  const [items, setItems] = useState<DraftItem[]>([]);
  const [form, setForm] = useState(emptyItem());
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [stock, setStock] = useState<Product[]>([]);
  const [overallDiscount, setOverallDiscount] = useState('');
  const [overallMode, setOverallMode] = useState<DiscountMode>('percent');
  const [gstOn, setGstOn] = useState(false);
  const [gstRate, setGstRate] = useState('3');
  const [payMode, setPayMode] = useState<PayMode>('full');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Invoice | null>(null);

  const rateFor = (metal: Metal) => (rate ? (metal === 'silver' ? rate.silverRatePerGram : rate.goldRatePerGram) : '0');

  // Stock items for the chosen category.
  useEffect(() => {
    if (!form.category) {
      setStock([]);
      return;
    }
    api
      .get<{ data: Product[] }>('/products', { category: form.category, in_stock: 'true' })
      .then((r) => setStock(r.data))
      .catch(() => setStock([]));
  }, [form.category]);

  const lineCalcs = useMemo(
    () => items.map((it) => computeLine(it, rateFor(it.metal))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, rate],
  );
  const totals = useMemo(
    () => computeTotals(lineCalcs, overallDiscount, overallMode, gstOn ? gstRate || '0' : null),
    [lineCalcs, overallDiscount, overallMode, gstOn, gstRate],
  );
  const gstError = gstOn && !(Number(gstRate) > 0 && Number(gstRate) <= 28) ? t('totals.gstInvalid') : null;
  const formCalc = computeLine(form, rateFor(form.metal));

  const paidPaise = payMode === 'full' ? totals.grandTotal : payMode === 'partial' ? toPaise(payAmount || '0') : 0n;
  const overallError =
    pctTooHigh(overallDiscount, overallMode) ? t('items.percentTooHigh') : totals.grandTotal < 0n ? t('totals.discountTooHigh') : null;
  const payError =
    payMode === 'partial' && (paidPaise <= 0n || paidPaise > totals.grandTotal) ? t('payment.exceeds') : null;

  /* ---- item editor ---- */
  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function pickStock(productId: string) {
    if (!productId) {
      setForm((f) => ({ ...f, product_id: null, available: undefined }));
      return;
    }
    const p = stock.find((s) => s.id === Number(productId));
    if (!p) return;
    setForm((f) => ({
      ...f,
      product_id: p.id,
      product_name: p.productName,
      metal: p.metal,
      weight: Number(p.weight) > 0 ? String(Number(p.weight)) : f.weight,
      description: f.description || p.description || '',
      available: p.quantity,
    }));
  }

  function validateForm() {
    const e: Record<string, string> = {};
    if (!form.category) e.category = t('items.selectCategory');
    if (!(Number(form.weight) > 0)) e.weight = t('items.invalidWeight');
    if (!(Number(form.quantity) >= 1) || !Number.isInteger(Number(form.quantity))) e.quantity = t('items.invalidQuantity');
    if (pctTooHigh(form.discount, form.discount_mode)) e.discount = t('items.percentTooHigh');
    else if (formCalc.total < 0n) e.discount = t('items.discountTooHigh');
    if (form.product_id && form.available !== undefined) {
      const otherQty = items
        .filter((i) => i.product_id === form.product_id && i.key !== editingKey)
        .reduce((a, i) => a + Number(i.quantity), 0);
      if (Number(form.quantity) + otherQty > form.available) e.quantity = t('items.notEnoughStock', { count: form.available - otherQty });
    }
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  function submitItem() {
    if (!validateForm()) return;
    const item: DraftItem = {
      ...(form as DraftItem),
      key: editingKey ?? keySeq++,
      product_name: form.product_name.trim() || form.description.trim() || t(`categories.${form.category}`),
    };
    setItems((list) => (editingKey ? list.map((i) => (i.key === editingKey ? item : i)) : [...list, item]));
    setEditingKey(null);
    setForm(emptyItem(form.category));
    setFormErrors({});
    if (!editingKey) notify(t('items.added'), 'info');
  }

  function editItem(it: DraftItem) {
    setEditingKey(it.key);
    setForm({ ...it });
    setFormErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function removeItem(key: number) {
    setItems((list) => list.filter((i) => i.key !== key));
    if (editingKey === key) {
      setEditingKey(null);
      setForm(emptyItem());
    }
  }

  /* ---- draft + save ---- */
  const draftInvoice: Invoice = useMemo(
    () => ({
      id: 0,
      invoiceNumber: '—',
      invoiceType: type,
      invoiceDate: new Date().toISOString(),
      goldRatePerGram: rate?.goldRatePerGram ?? '0',
      silverRatePerGram: rate?.silverRatePerGram ?? '0',
      totalWeight: String(mgToNumber(totals.totalWeightMg)),
      goldAmount: String(paiseToNumber(totals.goldAmount)),
      makingCharges: String(paiseToNumber(totals.making)),
      subtotal: String(paiseToNumber(totals.subtotal)),
      itemDiscount: String(paiseToNumber(totals.itemDiscount)),
      overallDiscount: String(paiseToNumber(totals.overall)),
      discount: String(paiseToNumber(totals.discount)),
      gstRate: totals.gstRate,
      gstAmount: String(paiseToNumber(totals.gst)),
      grandTotal: String(paiseToNumber(totals.grandTotal)),
      amountPaid: String(paiseToNumber(paidPaise)),
      paymentStatus: paidPaise >= totals.grandTotal ? 'paid' : paidPaise > 0n ? 'partial' : 'unpaid',
      notes: notes || null,
      createdByName: null,
      customer: type === 'retail' ? { id: owner.id, name: owner.name, mobileNumber: owner.mobileNumber, email: owner.email } : null,
      party:
        type === 'wholesale'
          ? { id: owner.id, name: owner.name, mobileNumber: owner.mobileNumber, email: owner.email, address: owner.address ?? null, partyType: owner.partyType ?? 'party' }
          : null,
      items: items.map((it, i) => ({
        id: it.key,
        productId: it.product_id,
        productName: it.product_name,
        category: it.category,
        metal: it.metal,
        description: it.description || null,
        weight: it.weight,
        quantity: Number(it.quantity),
        goldRate: rateFor(it.metal),
        goldAmount: String(paiseToNumber(lineCalcs[i].goldAmount)),
        makingCharges: String(paiseToNumber(lineCalcs[i].making)),
        discount: String(paiseToNumber(lineCalcs[i].discount)),
        totalAmount: String(paiseToNumber(lineCalcs[i].total)),
      })),
      payments: [],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, totals, rate, notes, paidPaise, owner, type],
  );

  async function save() {
    if (!rate) return;
    setSaving(true);
    try {
      const body = {
        [type === 'retail' ? 'customer_id' : 'party_id']: owner.id,
        gold_rate_id: rate.id,
        // Percentages are converted to exact rupee amounts; the server stores and re-checks amounts.
        items: items.map((it, i) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          category: it.category,
          metal: it.metal,
          description: it.description || null,
          weight: it.weight,
          quantity: Number(it.quantity),
          making_charges: it.making_charges || '0',
          discount: paiseToString(lineCalcs[i].discount),
        })),
        overall_discount: paiseToString(totals.overall),
        gst_rate: gstOn ? gstRate : '0',
        payment: paidPaise > 0n ? { amount: paiseToString(paidPaise), method: payMethod, reference: payRef || null } : null,
        notes: notes || null,
      };
      const r = await api.post<{ data: Invoice }>(`/invoices/${type}`, body);
      setSaved(r.data);
      notify(t('retail.invoiceSaved', { number: r.data.invoiceNumber }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'rate_changed') {
        await refreshRate();
        notify(t('rate.changed'), 'error');
      } else {
        notify(te(err), 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  const steps = [ownerStepLabel, t('retail.steps.products'), t('retail.steps.discount'), t('retail.steps.bill')];
  const goToStep = (i: number) => {
    if (saved) return;
    if (i === 0) onChangeOwner();
    else setStep(i);
  };

  /* ------------------------------------------------------------ render --- */

  if (saved) {
    return (
      <div>
        <Stepper steps={steps} current={4} />
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <Button icon={Printer} onClick={() => window.print()}>
            {t('common.print')}
          </Button>
          <Button variant="secondary" icon={Download} onClick={() => downloadInvoicePdf(saved)}>
            {t('common.downloadPdf')}
          </Button>
          <Link to="/billing">
            <Button variant="outline" icon={History}>
              {t('retail.viewPrevious')}
            </Button>
          </Link>
          <Button variant="ghost" icon={Plus} onClick={onNewBill} className="ml-auto">
            {t('retail.newBill')}
          </Button>
        </div>
        <InvoiceView invoice={saved} />
      </div>
    );
  }

  return (
    <div>
      <Stepper steps={steps} current={step} onStepClick={goToStep} />

      <div className="no-print mb-4">{ownerCard}</div>

      {!rate && (
        <div className="mb-4">
          <Alert tone="warning" icon={AlertTriangle}>
            {t('rate.notSetHint')}
          </Alert>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
          <Card>
            <CardHeader title={editingKey ? t('items.updateProduct') : t('items.addProduct')} subtitle={t('items.formula')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t('items.category')}
                required
                value={form.category}
                onChange={(e) => setForm({ ...emptyItem(e.target.value as Category), making_charges: form.making_charges })}
                placeholder={t('items.selectCategory')}
                options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
                error={formErrors.category}
                wrapClassName="sm:col-span-2"
              />
              <Select
                label={t('items.fromStock')}
                hint={t('items.fromStockHint')}
                value={form.product_id ?? ''}
                onChange={(e) => pickStock(e.target.value)}
                disabled={!form.category}
                placeholder={t('items.manualEntry')}
                options={stock.map((p) => ({
                  value: p.id,
                  label: `${p.productName} · ${Number(p.weight).toFixed(3)} g · ${t('items.available', { count: p.quantity })}`,
                }))}
                wrapClassName="sm:col-span-2"
              />
              <Input
                label={t('items.productName')}
                value={form.product_name}
                onChange={(e) => setField('product_name', e.target.value)}
                maxLength={150}
                wrapClassName="sm:col-span-2"
              />
              <Textarea
                label={t('items.description')}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                maxLength={1000}
                wrapClassName="sm:col-span-2"
              />
              <Select
                label={t('items.metal')}
                value={form.metal}
                disabled={!!form.product_id}
                onChange={(e) => setField('metal', e.target.value as Metal)}
                options={METALS.map((m) => ({ value: m, label: t(`metals.${m}`) }))}
              />
              <Input label={t('items.rate')} value={formatMoney(rateFor(form.metal))} readOnly disabled />
              <Input
                label={t('items.weight')}
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={form.weight}
                onChange={(e) => setField('weight', e.target.value)}
                error={formErrors.weight}
              />
              <Input
                label={t('items.quantity')}
                required
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(e) => setField('quantity', e.target.value)}
                error={formErrors.quantity}
                hint={form.available !== undefined ? t('items.available', { count: form.available }) : undefined}
              />
              <Input
                label={t('items.makingCharges')}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.making_charges}
                onChange={(e) => setField('making_charges', e.target.value)}
              />
              <Input
                label={t('items.discount')}
                type="number"
                inputMode="decimal"
                min="0"
                max={form.discount_mode === 'percent' ? 100 : undefined}
                step="0.01"
                placeholder="0"
                value={form.discount}
                onChange={(e) => setField('discount', e.target.value)}
                error={formErrors.discount}
                hint={
                  form.discount_mode === 'percent' && formCalc.discount > 0n
                    ? `= ${formatMoney(paiseToNumber(formCalc.discount))}`
                    : undefined
                }
                suffix={<DiscountToggle value={form.discount_mode} onChange={(m) => setField('discount_mode', m)} />}
              />
            </div>
            <div className="tabular mt-4 grid grid-cols-3 gap-2 rounded-xl bg-surface-2/70 p-3 text-center text-xs">
              <div>
                <p className="text-muted">{t('items.goldAmount')}</p>
                <p className="mt-0.5 font-semibold text-ink">{formatMoney(paiseToNumber(formCalc.goldAmount))}</p>
              </div>
              <div>
                <p className="text-muted">{t('items.subtotal')}</p>
                <p className="mt-0.5 font-semibold text-ink">{formatMoney(paiseToNumber(formCalc.subtotal))}</p>
              </div>
              <div>
                <p className="text-muted">{t('items.itemTotal')}</p>
                <p className={cx('mt-0.5 font-semibold', formCalc.total < 0n ? 'text-red-600' : 'text-gold-700 dark:text-gold-300')}>
                  {formatMoney(paiseToNumber(formCalc.total))}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button icon={editingKey ? Check : Plus} onClick={submitItem} disabled={!rate} className="flex-1">
                {editingKey ? t('items.updateProduct') : t('items.addProduct')}
              </Button>
              {editingKey && (
                <Button
                  variant="outline"
                  icon={X}
                  onClick={() => {
                    setEditingKey(null);
                    setForm(emptyItem());
                  }}
                >
                  {t('common.cancel')}
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('items.title')} subtitle={`${items.length} · ${formatWeight(mgToNumber(totals.totalWeightMg))}`} />
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">{t('items.noItems')}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="tabular w-full min-w-[720px] text-sm">
                  <thead className="bg-surface-2/70 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('invoice.product')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.weight')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.qty')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.goldAmount')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.making')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.discount')}</th>
                      <th className="px-3 py-2 text-right">{t('invoice.amount')}</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.map((it, i) => (
                      <tr key={it.key} className={cx(editingKey === it.key && 'bg-gold-50 dark:bg-gold-900/20')}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{it.product_name}</p>
                          <p className="text-xs text-muted">
                            {t(`categories.${it.category}`)} · {t(`metals.${it.metal}`)} · {formatMoney(rateFor(it.metal))}/g
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right">{Number(it.weight).toFixed(3)}</td>
                        <td className="px-3 py-2 text-right">{it.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(paiseToNumber(lineCalcs[i].goldAmount))}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(paiseToNumber(lineCalcs[i].making))}</td>
                        <td className="px-3 py-2 text-right">
                          {formatMoney(paiseToNumber(lineCalcs[i].discount))}
                          {it.discount_mode === 'percent' && Number(it.discount) > 0 && (
                            <span className="block text-xs text-muted">({Number(it.discount)}%)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(paiseToNumber(lineCalcs[i].total))}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => editItem(it)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label={t('common.edit')}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => removeItem(it.key)} className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" aria-label={t('common.remove')}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {t('totals.grandTotal')}: <span className="tabular text-lg font-semibold text-ink">{formatMoney(paiseToNumber(totals.subtotal - totals.itemDiscount))}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" icon={ArrowLeft} onClick={onChangeOwner}>
                  {t('common.back')}
                </Button>
                <Button onClick={() => setStep(2)} disabled={items.length === 0 || !!editingKey}>
                  {t('common.next')} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('totals.summary')} />
            <TotalsSummary totals={totals} />
            <div className="mt-4 grid gap-4">
              <Input
                label={t('totals.overallDiscount')}
                type="number"
                inputMode="decimal"
                min="0"
                max={overallMode === 'percent' ? 100 : undefined}
                step="0.01"
                placeholder="0"
                value={overallDiscount}
                onChange={(e) => setOverallDiscount(e.target.value)}
                error={overallError}
                hint={overallMode === 'percent' && totals.overall > 0n ? `= ${formatMoney(paiseToNumber(totals.overall))}` : undefined}
                suffix={<DiscountToggle value={overallMode} onChange={setOverallMode} />}
              />
              <div className="rounded-xl border border-line p-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={gstOn}
                    onChange={(e) => setGstOn(e.target.checked)}
                    className="h-4 w-4 accent-gold-600"
                  />
                  {t('totals.applyGst')}
                </label>
                {gstOn && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      label={t('totals.gstRate')}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="28"
                      step="0.01"
                      value={gstRate}
                      onChange={(e) => setGstRate(e.target.value)}
                      error={gstError}
                      suffix="%"
                    />
                    <div className="tabular flex flex-col justify-end text-sm text-muted">
                      <span>
                        {t('totals.cgst')} {Number(gstRate || 0) / 2}%: {formatMoney(paiseToNumber(totals.gst - totals.gst / 2n))}
                      </span>
                      <span>
                        {t('totals.sgst')} {Number(gstRate || 0) / 2}%: {formatMoney(paiseToNumber(totals.gst / 2n))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title={t('payment.title')} />
            <div className="grid gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('payment.status')}>
                {(['full', 'partial', 'unpaid'] as PayMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={payMode === m}
                    onClick={() => setPayMode(m)}
                    className={cx(
                      'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      payMode === m ? 'border-gold-400 bg-gold-50 text-gold-900 dark:bg-gold-900/30 dark:text-gold-100' : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    {t(m === 'full' ? 'payment.payFull' : m === 'partial' ? 'payment.payPartial' : 'payment.payLater')}
                  </button>
                ))}
              </div>
              {payMode === 'partial' && (
                <Input
                  label={t('payment.amount')}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  error={payAmount ? payError : null}
                />
              )}
              {payMode !== 'unpaid' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label={t('payment.method')}
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentMethods.${m}`) }))}
                  />
                  <Input label={t('payment.reference')} value={payRef} onChange={(e) => setPayRef(e.target.value)} maxLength={120} />
                </div>
              )}
              <div className="tabular flex justify-between rounded-lg bg-surface-2/70 px-3 py-2 text-sm">
                <span className="text-muted">{t('payment.balance')}</span>
                <span className="font-semibold text-ink">{formatMoney(paiseToNumber(totals.grandTotal - (paidPaise > totals.grandTotal ? totals.grandTotal : paidPaise)))}</span>
              </div>
              <Textarea label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(1)}>
                {t('common.back')}
              </Button>
              <Button onClick={() => setStep(3)} disabled={!!overallError || !!payError || !!gstError}>
                {t('common.next')} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="no-print mb-4">
            <Alert>{t('retail.reviewHint')}</Alert>
          </div>
          <div className="no-print mb-4 flex flex-wrap gap-2">
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(2)}>
              {t('common.back')}
            </Button>
            <Button icon={Save} onClick={save} loading={saving} disabled={!rate || !!overallError || !!payError || !!gstError || items.length === 0}>
              {saving ? t('retail.savingInvoice') : t('retail.saveInvoice')}
            </Button>
            <Button variant="ghost" icon={Printer} disabled title={t('retail.saveInvoice')}>
              {t('common.print')}
            </Button>
            <Button variant="ghost" icon={Download} disabled title={t('retail.saveInvoice')}>
              {t('common.downloadPdf')}
            </Button>
          </div>
          <InvoiceView invoice={draftInvoice} draft />
        </div>
      )}
    </div>
  );
}

export function TotalsSummary({ totals }: { totals: BillTotals }) {
  const { t } = useI18n();
  const row = (label: string, value: string, cls = '') => (
    <div className={cx('flex justify-between py-1.5 text-sm', cls)}>
      <span className="text-muted">{label}</span>
      <span className="tabular font-medium text-ink">{value}</span>
    </div>
  );
  return (
    <div className="divide-y divide-line">
      {row(t('totals.totalWeight'), formatWeight(mgToNumber(totals.totalWeightMg)))}
      {row(t('totals.goldAmount'), formatMoney(paiseToNumber(totals.goldAmount)))}
      {row(t('totals.makingCharges'), formatMoney(paiseToNumber(totals.making)))}
      {row(t('totals.itemDiscount'), `− ${formatMoney(paiseToNumber(totals.itemDiscount))}`)}
      {row(t('totals.overallDiscountShort'), `− ${formatMoney(paiseToNumber(totals.overall))}`)}
      {row(t('totals.totalDiscount'), `− ${formatMoney(paiseToNumber(totals.discount))}`)}
      {totals.gst > 0n && (
        <>
          {row(t('totals.taxable'), formatMoney(paiseToNumber(totals.taxable)))}
          {row(`${t('totals.gst')} (${Number(totals.gstRate)}%)`, `+ ${formatMoney(paiseToNumber(totals.gst))}`)}
        </>
      )}
      <div className="flex items-baseline justify-between pt-3">
        <span className="font-semibold text-ink">{t('totals.grandTotal')}</span>
        <span className={cx('tabular text-2xl font-semibold', totals.grandTotal < 0n ? 'text-red-600' : 'text-gold-700 dark:text-gold-300')}>
          {formatMoney(paiseToNumber(totals.grandTotal))}
        </span>
      </div>
    </div>
  );
}
