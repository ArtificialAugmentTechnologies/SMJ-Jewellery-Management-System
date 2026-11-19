import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Search, UserCheck, UserPlus } from 'lucide-react';
import { useI18n } from '../i18n';
import { useToast } from '../context/AppProviders';
import { api, ApiError } from '../lib/api';
import { digitsOnly, formatDate, formatMoney, num } from '../lib/format';
import type { Customer, CustomerDetail } from '../lib/types';
import { Button, Card, CardHeader, DataTable, Input, Modal, PageHeader } from '../components/ui';
import { PaymentBadge } from '../components/badges';
import BillingFlow, { Stepper } from '../components/billing/BillingFlow';

const MOBILE_RE = /^[0-9]{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RetailPage() {
  const { t } = useI18n();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [billKey, setBillKey] = useState(0);

  const reset = () => {
    setCustomer(null);
    setConfirmed(false);
    setBillKey((k) => k + 1);
  };

  return (
    <div>
      <PageHeader title={t('retail.title')} subtitle={t('retail.subtitle')} />
      {customer && confirmed ? (
        <BillingFlow
          key={billKey}
          type="retail"
          owner={customer}
          ownerStepLabel={t('retail.steps.customer')}
          ownerCard={<CustomerStrip customer={customer} onChange={() => setConfirmed(false)} />}
          onChangeOwner={() => setConfirmed(false)}
          onNewBill={reset}
        />
      ) : (
        <>
          <Stepper
            steps={[t('retail.steps.customer'), t('retail.steps.products'), t('retail.steps.discount'), t('retail.steps.bill')]}
            current={0}
          />
          <CustomerStep
            initial={customer}
            onSelect={(c) => {
              setCustomer(c);
              setConfirmed(true);
            }}
          />
        </>
      )}
    </div>
  );
}

function CustomerStrip({ customer, onChange }: { customer: CustomerDetail | Customer; onChange: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 !py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 font-semibold text-gold-800 dark:bg-gold-900/50 dark:text-gold-200">
          {customer.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="text-xs text-muted">{t('retail.billingFor')}</p>
          <p className="font-semibold text-ink">
            {customer.name} <span className="font-normal text-muted">· {customer.mobileNumber}</span>
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onChange}>
        {t('retail.changeCustomer')}
      </Button>
    </Card>
  );
}

function CustomerStep({ initial, onSelect }: { initial: CustomerDetail | null; onSelect: (c: CustomerDetail) => void }) {
  const { t, te, lang } = useI18n();
  const notify = useToast();
  const [mobile, setMobile] = useState(initial?.mobileNumber ?? '');
  const [found, setFound] = useState<CustomerDetail | null>(initial);
  const [searching, setSearching] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!MOBILE_RE.test(mobile)) {
      setMobileError(t('errors.invalid_mobile'));
      return;
    }
    setMobileError(null);
    setSearching(true);
    try {
      const r = await api.get<{ found: boolean; data: CustomerDetail | null }>('/customers/lookup', { mobile });
      setFound(r.data);
      if (!r.found) setShowNew(true);
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Card>
        <CardHeader title={t('retail.enterMobile')} icon={Phone} />
        <form onSubmit={search} className="space-y-3">
          <Input
            label={t('common.mobile')}
            inputMode="numeric"
            autoFocus
            placeholder="9876543210"
            value={mobile}
            onChange={(e) => {
              setMobile(digitsOnly(e.target.value));
              setFound(null);
            }}
            error={mobileError}
            hint={t('retail.mobileHint')}
            prefix="+91"
          />
          <Button type="submit" icon={Search} loading={searching} className="w-full">
            {t('retail.find')}
          </Button>
        </form>
      </Card>

      {found ? (
        <Card className="animate-fade-in">
          <CardHeader
            title={found.name}
            subtitle={t('retail.existingCustomer')}
            icon={UserCheck}
            actions={
              <Button icon={UserCheck} onClick={() => onSelect(found)}>
                {t('retail.useCustomer')}
              </Button>
            }
          />
          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2/70 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Phone className="h-3.5 w-3.5" /> {t('common.mobile')}
              </p>
              <p className="mt-1 font-medium text-ink">{found.mobileNumber}</p>
            </div>
            <div className="rounded-xl bg-surface-2/70 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Mail className="h-3.5 w-3.5" /> {t('common.email')}
              </p>
              <p className="mt-1 truncate font-medium text-ink">{found.email || '—'}</p>
            </div>
            <div className="rounded-xl bg-surface-2/70 p-3">
              <p className="text-xs text-muted">{t('retail.totalSpent')}</p>
              <p className="tabular mt-1 font-medium text-ink">
                {formatMoney(found.stats.total_purchases)} · {found.stats.invoice_count} {t('retail.visits')}
              </p>
            </div>
          </div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t('retail.previousPurchases')}</h3>
          <DataTable
            rows={found.purchasedProducts.slice(0, 10)}
            rowKey={(r) => r.id}
            empty={t('retail.noPurchases')}
            columns={[
              { key: 'p', header: t('invoice.product'), render: (r) => <span className="font-medium">{r.product_name}</span> },
              { key: 'c', header: t('items.category'), render: (r) => t(`categories.${r.category}`), hideSm: true },
              { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3) },
              { key: 'q', header: t('invoice.qty'), align: 'right', render: (r) => r.quantity },
              { key: 'd', header: t('common.date'), render: (r) => formatDate(r.invoice_date, lang), hideSm: true },
              { key: 'a', header: t('invoice.amount'), align: 'right', render: (r) => formatMoney(r.total_amount) },
            ]}
          />
          <h3 className="mb-2 mt-5 text-sm font-semibold text-ink">{t('retail.purchaseHistory')}</h3>
          <DataTable
            rows={found.invoices.slice(0, 10)}
            rowKey={(r) => r.id}
            empty={t('retail.noPurchases')}
            columns={[
              {
                key: 'n',
                header: t('invoice.number'),
                render: (r) => (
                  <Link to={`/billing/${r.id}`} className="font-medium text-gold-700 hover:underline dark:text-gold-300">
                    {r.invoice_number}
                  </Link>
                ),
              },
              { key: 'd', header: t('common.date'), render: (r) => formatDate(r.invoice_date, lang) },
              { key: 'w', header: t('totals.totalWeight'), align: 'right', render: (r) => num(r.total_weight).toFixed(3), hideSm: true },
              { key: 't', header: t('totals.grandTotal'), align: 'right', render: (r) => formatMoney(r.grand_total) },
              { key: 's', header: t('common.status'), render: (r) => <PaymentBadge status={r.payment_status} /> },
            ]}
          />
        </Card>
      ) : (
        <Card className="flex items-center justify-center">
          <div className="py-10 text-center text-sm text-muted">
            <UserPlus className="mx-auto mb-3 h-8 w-8 text-gold-500" />
            {t('retail.mobileHint')}
          </div>
        </Card>
      )}

      <NewCustomerModal
        open={showNew}
        mobile={mobile}
        onClose={() => setShowNew(false)}
        onCreated={(c) => {
          setShowNew(false);
          onSelect({
            ...c,
            stats: { invoice_count: 0, total_purchases: '0', outstanding: '0' },
            invoices: [],
            purchasedProducts: [],
          });
        }}
      />
    </div>
  );
}

export function NewCustomerModal({
  open,
  mobile,
  initialName = '',
  initialEmail = '',
  onClose,
  onCreated,
}: {
  open: boolean;
  mobile: string;
  /** Optional prefill (e.g. from what was searched on the Customers page). */
  initialName?: string;
  initialEmail?: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const { t, te } = useI18n();
  const notify = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mob, setMob] = useState(mobile);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  // Reset the form each time the modal opens.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName(initialName);
      setEmail(initialEmail);
      setMob(mobile);
      setErrors({});
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('errors.required');
    if (!MOBILE_RE.test(mob)) errs.mobile = t('errors.invalid_mobile');
    if (email && !EMAIL_RE.test(email)) errs.email = t('errors.invalid_email');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const r = await api.post<{ data: Customer }>('/customers', { name, email: email || null, mobile_number: mob });
      notify(t('retail.registered'));
      onCreated(r.data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_mobile') setErrors({ mobile: t('errors.duplicate_mobile') });
      else notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('retail.newCustomer')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="new-customer-form" icon={UserPlus} loading={saving}>
            {t('retail.register')}
          </Button>
        </>
      }
    >
      <form id="new-customer-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">{t('retail.newCustomerHint')}</p>
        <Input label={t('common.name')} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} autoFocus />
        <Input label={t('common.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} maxLength={255} />
        <Input
          label={t('common.mobile')}
          required
          inputMode="numeric"
          value={mob}
          onChange={(e) => setMob(digitsOnly(e.target.value))}
          error={errors.mobile}
          prefix="+91"
        />
      </form>
    </Modal>
  );
}
