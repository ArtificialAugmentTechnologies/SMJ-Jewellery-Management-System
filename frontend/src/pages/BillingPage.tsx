import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileDown, Lock, Printer, Wallet } from 'lucide-react';
import { useI18n } from '../i18n';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { dateInputToIso, formatDateTime, formatMoney, formatWeight, num } from '../lib/format';
import { downloadCsv, downloadInvoicePdf } from '../lib/exporters';
import { PAYMENT_METHODS, type Invoice, type InvoiceRow, type PaymentMethod } from '../lib/types';
import { Button, Card, CardHeader, DataTable, Input, Modal, PageHeader, PageLoader, Select } from '../components/ui';
import { PaymentBadge, TypeBadge } from '../components/badges';
import InvoiceView from '../components/billing/InvoiceView';

interface ListResponse {
  data: InvoiceRow[];
  total: number;
  sum_grand_total: string;
  sum_weight: string;
}

export default function BillingPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(50);
  const dSearch = useDebounced(search);
  const dNo = useDebounced(invoiceNo);
  const { data, loading } = useAsync(
    () =>
      api.get<ListResponse>('/invoices', {
        search: dSearch,
        invoice_number: dNo,
        type,
        payment_status: status,
        from: dateInputToIso(from),
        to: dateInputToIso(to, 1),
        limit,
      }),
    [dSearch, dNo, type, status, from, to, limit],
  );
  const rows = data?.data ?? [];

  const clear = () => {
    setSearch('');
    setInvoiceNo('');
    setType('');
    setStatus('');
    setFrom('');
    setTo('');
  };

  function exportCsv() {
    downloadCsv(
      `billing-history-${new Date().toISOString().slice(0, 10)}`,
      ['Invoice Number', 'Type', 'Customer / Party', 'Mobile', 'Invoice Date', 'Total Weight (g)', 'Grand Total', 'Paid', 'Payment Status'],
      rows.map((r) => [r.invoice_number, r.invoice_type, r.owner_name, r.owner_mobile, formatDateTime(r.invoice_date), num(r.total_weight).toFixed(3), num(r.grand_total).toFixed(2), num(r.amount_paid).toFixed(2), r.payment_status]),
    );
  }

  return (
    <div>
      <PageHeader
        title={t('billing.title')}
        subtitle={t('billing.subtitle')}
        actions={
          <Button variant="outline" icon={FileDown} onClick={exportCsv} disabled={!rows.length}>
            {t('common.exportCsv')}
          </Button>
        }
      />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input label={t('billing.customerName')} placeholder={t('billing.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} wrapClassName="lg:col-span-2" />
          <Input label={t('billing.invoiceNumber')} placeholder="SMJ-R-…" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          <Select
            label={t('billing.invoiceType')}
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder={t('common.all')}
            options={[
              { value: 'retail', label: t('invoiceTypes.retail') },
              { value: 'wholesale', label: t('invoiceTypes.wholesale') },
            ]}
          />
          <Input label={t('common.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={t('common.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select
            label={t('payment.status')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder={t('common.all')}
            options={(['paid', 'partial', 'unpaid'] as const).map((s) => ({ value: s, label: t(`paymentStatus.${s}`) }))}
          />
          <div className="flex items-end lg:col-span-5">
            <Button variant="ghost" size="sm" onClick={clear}>
              {t('common.clear')}
            </Button>
            {data && (
              <p className="tabular ml-auto text-sm text-muted">
                {t('billing.totals', { count: data.total, weight: formatWeight(data.sum_weight), amount: formatMoney(data.sum_grand_total) })}
              </p>
            )}
          </div>
        </div>
        <DataTable
          rows={rows}
          loading={loading && !data}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/billing/${r.id}`)}
          empty={t('common.noData')}
          columns={[
            { key: 'n', header: t('billing.invoiceNumber'), render: (r) => <span className="font-medium whitespace-nowrap">{r.invoice_number}</span> },
            {
              key: 'c',
              header: t('billing.customerName'),
              render: (r) => (
                <div>
                  <p>{r.owner_name}</p>
                  <p className="text-xs text-muted md:hidden">{r.owner_mobile}</p>
                </div>
              ),
            },
            { key: 'm', header: t('common.mobile'), render: (r) => r.owner_mobile, hideSm: true },
            { key: 'd', header: t('invoice.date'), render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.invoice_date, lang)}</span>, hideSm: true },
            { key: 'ty', header: t('common.type'), render: (r) => <TypeBadge type={r.invoice_type} />, hideSm: true },
            { key: 'w', header: t('totals.totalWeight'), align: 'right', render: (r) => num(r.total_weight).toFixed(3), hideSm: true },
            { key: 'g', header: t('totals.grandTotal'), align: 'right', render: (r) => <span className="tabular font-medium">{formatMoney(r.grand_total)}</span> },
            { key: 's', header: t('payment.status'), render: (r) => <PaymentBadge status={r.payment_status} /> },
          ]}
        />
        {data && rows.length < data.total && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{t('common.showing', { count: rows.length, total: data.total })}</span>
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 50)}>
              {t('common.loadMore')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

export function InvoicePage() {
  const { id } = useParams();
  const { t, te, lang } = useI18n();
  const notify = useToast();
  const { data: inv, loading, setData, error } = useAsync(() => api.get<{ data: Invoice }>(`/invoices/${id}`).then((r) => r.data), [id]);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !inv) return <PageLoader />;
  if (!inv) return <p className="py-10 text-center text-muted">{error ? te(error) : t('invoice.notFound')}</p>;
  const balance = num(inv.grandTotal) - num(inv.amountPaid);

  async function addPayment(e: FormEvent) {
    e.preventDefault();
    if (!inv) return;
    if (!(num(amount) > 0) || num(amount) > balance + 0.0001) {
      notify(t('payment.exceeds'), 'error');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ data: Invoice }>(`/invoices/${inv.id}/payments`, { amount, method, reference: reference || null });
      setData(r.data);
      setPayOpen(false);
      setAmount('');
      setReference('');
      notify(t('payment.recorded'));
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/billing" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('billing.title')}
      </Link>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button icon={Printer} onClick={() => window.print()}>
          {t('common.print')}
        </Button>
        <Button variant="secondary" icon={Download} onClick={() => downloadInvoicePdf(inv)}>
          {t('common.downloadPdf')}
        </Button>
        {balance > 0 && (
          <Button
            variant="outline"
            icon={Wallet}
            onClick={() => {
              setAmount(balance.toFixed(2));
              setPayOpen(true);
            }}
          >
            {t('payment.record')}
          </Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" /> {t('invoice.immutable')}
        </span>
      </div>
      <InvoiceView invoice={inv} />

      <Card className="no-print mt-5">
        <CardHeader title={t('payment.history')} />
        <DataTable
          rows={inv.payments}
          rowKey={(r) => r.id}
          empty={t('payment.noPayments')}
          columns={[
            { key: 'd', header: t('common.date'), render: (r) => formatDateTime(r.paymentDate, lang) },
            { key: 'm', header: t('payment.method'), render: (r) => t(`paymentMethods.${r.paymentMethod}`) },
            { key: 'r', header: t('payment.reference'), render: (r) => r.paymentReference ?? '—', hideSm: true },
            { key: 'u', header: t('stock.recordedBy'), render: (r) => r.receivedByName ?? '—', hideSm: true },
            { key: 'a', header: t('invoice.amount'), align: 'right', render: (r) => <span className="tabular font-medium">{formatMoney(r.amount)}</span> },
          ]}
        />
      </Card>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('payment.record')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="pay-form" loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="pay-form" onSubmit={addPayment} className="space-y-3">
          <p className="tabular text-sm text-muted">
            {t('payment.balance')}: <span className="font-semibold text-ink">{formatMoney(balance)}</span>
          </p>
          <Input label={t('payment.amount')} type="number" min="0.01" step="0.01" max={balance.toFixed(2)} required value={amount} onChange={(e) => setAmount(e.target.value)} prefix="₹" />
          <Select label={t('payment.method')} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`paymentMethods.${m}`) }))} />
          <Input label={t('payment.reference')} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </form>
      </Modal>
    </div>
  );
}
