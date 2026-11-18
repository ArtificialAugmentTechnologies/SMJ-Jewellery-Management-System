import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Pencil, Phone, ShoppingBag, UserPlus } from 'lucide-react';
import { useI18n } from '../i18n';
import { useToast } from '../context/AppProviders';
import { api, ApiError } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { digitsOnly, formatDate, formatMoney, num } from '../lib/format';
import type { Customer, CustomerDetail } from '../lib/types';
import { Button, Card, CardHeader, DataTable, Input, Modal, PageHeader, PageLoader, StatCard } from '../components/ui';
import { PaymentBadge } from '../components/badges';
import { NewCustomerModal } from './RetailPage';

export default function CustomersPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(search);
  const { data, loading, reload } = useAsync(
    () => api.get<{ data: Customer[]; total: number }>('/customers', { search: debounced, limit }),
    [debounced, limit],
  );

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={
          <Button icon={UserPlus} onClick={() => setAdding(true)}>
            {t('customers.add')}
          </Button>
        }
      />
      <Card>
        <Input
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapClassName="mb-4 sm:w-96"
          aria-label={t('common.search')}
        />
        <DataTable
          rows={data?.data ?? []}
          loading={loading && !data}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
          empty={t('common.noData')}
          columns={[
            { key: 'n', header: t('common.name'), render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'm', header: t('common.mobile'), render: (r) => r.mobileNumber },
            { key: 'e', header: t('common.email'), render: (r) => r.email ?? '—', hideSm: true },
            { key: 'b', header: t('customers.bills'), align: 'right', render: (r) => r.invoiceCount ?? 0, hideSm: true },
            { key: 't', header: t('customers.totalPurchases'), align: 'right', render: (r) => formatMoney(r.totalPurchases) },
            { key: 'l', header: t('customers.lastPurchase'), render: (r) => (r.lastPurchase ? formatDate(r.lastPurchase, lang) : '—'), hideSm: true },
          ]}
        />
        {data && data.data.length < data.total && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{t('common.showing', { count: data.data.length, total: data.total })}</span>
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 50)}>
              {t('common.loadMore')}
            </Button>
          </div>
        )}
      </Card>
      <NewCustomerModal
        open={adding}
        mobile=""
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          reload();
        }}
      />
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: c, loading, reload } = useAsync(() => api.get<{ data: CustomerDetail }>(`/customers/${id}`).then((r) => r.data), [id]);
  if (loading && !c) return <PageLoader />;
  if (!c) return null;

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('customers.title')}
      </Link>
      <PageHeader
        title={c.name}
        subtitle={t('customers.since', { date: formatDate(c.createdAt, lang) })}
        actions={
          <>
            <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
            <Button icon={ShoppingBag} onClick={() => navigate('/retail')}>
              {t('dashboard.newRetailBill')}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="flex items-center gap-2 text-sm text-ink">
            <Phone className="h-4 w-4 text-muted" /> {c.mobileNumber}
          </p>
          <p className="mt-2 flex items-center gap-2 truncate text-sm text-ink">
            <Mail className="h-4 w-4 text-muted" /> {c.email || '—'}
          </p>
        </Card>
        <StatCard label={t('customers.bills')} value={c.stats.invoice_count} tone="blue" />
        <StatCard label={t('customers.totalPurchases')} value={formatMoney(c.stats.total_purchases)} tone="gold" />
        <StatCard label={t('dashboard.outstanding')} value={formatMoney(c.stats.outstanding)} tone={num(c.stats.outstanding) > 0 ? 'rose' : 'green'} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('retail.purchaseHistory')} />
          <DataTable
            rows={c.invoices}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/billing/${r.id}`)}
            empty={t('retail.noPurchases')}
            columns={[
              { key: 'n', header: t('invoice.number'), render: (r) => <span className="font-medium">{r.invoice_number}</span> },
              { key: 'd', header: t('common.date'), render: (r) => formatDate(r.invoice_date, lang) },
              { key: 't', header: t('totals.grandTotal'), align: 'right', render: (r) => formatMoney(r.grand_total) },
              { key: 's', header: t('common.status'), render: (r) => <PaymentBadge status={r.payment_status} /> },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title={t('retail.previousPurchases')} />
          <DataTable
            rows={c.purchasedProducts}
            rowKey={(r) => r.id}
            empty={t('retail.noPurchases')}
            columns={[
              {
                key: 'p',
                header: t('invoice.product'),
                render: (r) => (
                  <div>
                    <p className="font-medium">{r.product_name}</p>
                    <p className="text-xs text-muted">
                      {t(`categories.${r.category}`)} · {r.invoice_number}
                    </p>
                  </div>
                ),
              },
              { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3) },
              { key: 'q', header: t('invoice.qty'), align: 'right', render: (r) => r.quantity },
              { key: 'a', header: t('invoice.amount'), align: 'right', render: (r) => formatMoney(r.total_amount) },
            ]}
          />
        </Card>
      </div>
      <EditCustomerModal
        customer={editing ? c : null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          reload();
        }}
      />
    </div>
  );
}

function EditCustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const { t, te } = useI18n();
  const notify = useToast();
  const [form, setForm] = useState({ name: '', email: '', mobile_number: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<number | null>(null);
  if ((customer?.id ?? null) !== openedFor) {
    setOpenedFor(customer?.id ?? null);
    if (customer) setForm({ name: customer.name, email: customer.email ?? '', mobile_number: customer.mobileNumber });
    setErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('errors.required');
    if (!/^[0-9]{10}$/.test(form.mobile_number)) errs.mobile = t('errors.invalid_mobile');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api.patch(`/customers/${customer.id}`, { ...form, email: form.email || null });
      notify(t('customers.saved'));
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_mobile') setErrors({ mobile: t('errors.duplicate_mobile') });
      else notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!customer}
      onClose={onClose}
      title={t('customers.edit')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-customer" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="edit-customer" onSubmit={submit} className="space-y-3">
        <Input label={t('common.name')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <Input label={t('common.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input
          label={t('common.mobile')}
          required
          prefix="+91"
          inputMode="numeric"
          value={form.mobile_number}
          onChange={(e) => setForm({ ...form, mobile_number: digitsOnly(e.target.value) })}
          error={errors.mobile}
        />
      </form>
    </Modal>
  );
}
