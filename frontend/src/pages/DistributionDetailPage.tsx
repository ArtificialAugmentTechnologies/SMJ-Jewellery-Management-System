import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatDateTime, num, toDateTimeInput } from '../lib/format';
import type { Distribution } from '../lib/types';
import { Alert, Button, Card, CardHeader, DataTable, InfoRow, Input, PageHeader, PageLoader, Textarea } from '../components/ui';
import { DistributionBadge, MovementBadge } from '../components/badges';

export default function DistributionDetailPage() {
  const { id } = useParams();
  const { t, te, lang } = useI18n();
  const { isAdmin } = useAuth();
  const notify = useToast();
  const { data: d, loading, setData } = useAsync(
    () => api.get<{ data: Distribution }>(`/wholesale/distributions/${id}`).then((r) => r.data),
    [id],
  );
  const [qty, setQty] = useState<Record<number, { sold: string; returned: string }>>({});
  const [date, setDate] = useState(toDateTimeInput());
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading && !d) return <PageLoader />;
  if (!d) return null;

  const totals = d.items.reduce(
    (a, i) => ({
      issued: a.issued + i.quantityIssued,
      sold: a.sold + i.quantitySold,
      returned: a.returned + i.quantityReturned,
      remaining: a.remaining + i.remaining,
    }),
    { issued: 0, sold: 0, returned: 0, remaining: 0 },
  );

  const rowError = (itemId: number, remaining: number) => {
    const q = qty[itemId];
    if (!q) return null;
    const total = (Number(q.sold) || 0) + (Number(q.returned) || 0);
    return total > remaining ? t('distribution.exceeds', { count: remaining }) : null;
  };
  const hasErrors = d.items.some((i) => rowError(i.id, i.remaining));
  const hasInput = Object.values(qty).some((q) => Number(q.sold) > 0 || Number(q.returned) > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors || !hasInput || !d) return;
    setSaving(true);
    try {
      const r = await api.post<{ data: Distribution }>(`/wholesale/distributions/${d.id}/settle`, {
        items: Object.entries(qty)
          .map(([itemId, q]) => ({ item_id: Number(itemId), sold: Number(q.sold) || 0, returned: Number(q.returned) || 0 }))
          .filter((i) => i.sold > 0 || i.returned > 0),
        date: new Date(date).toISOString(),
        received_by: receivedBy || null,
        remarks: remarks || null,
      });
      setData(r.data);
      setQty({});
      setRemarks('');
      notify(t('distribution.recorded'));
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  const setItemQty = (itemId: number, field: 'sold' | 'returned', value: string) =>
    setQty((q) => ({ ...q, [itemId]: { sold: q[itemId]?.sold ?? '', returned: q[itemId]?.returned ?? '', [field]: value.replace(/\D/g, '') } }));

  return (
    <div>
      <Link to="/wholesale?tab=distributions" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('wholesale.distributions')}
      </Link>
      <PageHeader title={t('distribution.title', { id: d.id })} subtitle={d.purpose ?? undefined} actions={<DistributionBadge status={d.status} />} />

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <InfoRow
            label={t('distribution.issuedTo')}
            value={
              <Link to={`/wholesale/parties/${d.party_id}`} className="text-gold-700 hover:underline dark:text-gold-300">
                {d.party_name}
              </Link>
            }
          />
          <InfoRow label={t('common.type')} value={t(`partyTypes.${d.party_type}`)} />
          {d.line_member_name && <InfoRow label={t('distribution.lineMember')} value={d.line_member_name} />}
          <InfoRow label={t('distribution.distributionDate')} value={formatDateTime(d.distribution_date, lang)} />
          <InfoRow label={t('distribution.issuedBy')} value={d.issued_by_name ?? '—'} />
          <InfoRow label={t('distribution.receivedBy')} value={d.received_by ?? '—'} />
          <InfoRow label={t('distribution.lastReturn')} value={d.last_return_date ? formatDateTime(d.last_return_date, lang) : '—'} />
          {d.remarks && <InfoRow label={t('common.remarks')} value={d.remarks} />}
        </Card>
        <Card className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [t('distribution.itemsTaken'), totals.issued, 'text-ink'],
              [t('distribution.itemsSold'), totals.sold, 'text-gold-700 dark:text-gold-300'],
              [t('distribution.itemsReturned'), totals.returned, 'text-sky-700 dark:text-sky-300'],
              [t('distribution.remainingItems'), totals.remaining, totals.remaining === 0 ? 'text-emerald-600' : 'text-red-600'],
            ].map(([label, value, cls]) => (
              <div key={String(label)} className="rounded-xl bg-surface-2/70 p-3 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className={`tabular mt-1 text-3xl font-semibold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">{t('distribution.formula')}</p>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader title={isAdmin && totals.remaining > 0 ? t('distribution.record') : t('items.title')} subtitle={isAdmin && totals.remaining > 0 ? t('distribution.recordHint') : undefined} icon={ClipboardCheck} />
        <form onSubmit={submit}>
          <DataTable
            rows={d.items}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'p',
                header: t('stock.product'),
                render: (r) => (
                  <div>
                    <p className="font-medium">{r.productName}</p>
                    <p className="text-xs text-muted">
                      {t(`categories.${r.category}`)} · {num(r.weight).toFixed(3)} g
                    </p>
                  </div>
                ),
              },
              { key: 'i', header: t('distribution.itemsTaken'), align: 'right', render: (r) => r.quantityIssued },
              { key: 's', header: t('distribution.itemsSold'), align: 'right', render: (r) => r.quantitySold },
              { key: 'r', header: t('distribution.itemsReturned'), align: 'right', render: (r) => r.quantityReturned },
              { key: 'rem', header: t('distribution.remainingItems'), align: 'right', render: (r) => <span className="font-semibold">{r.remaining}</span> },
              ...(isAdmin && totals.remaining > 0
                ? [
                    {
                      key: 'sn',
                      header: t('distribution.soldNow'),
                      render: (r: Distribution['items'][number]) => (
                        <Input
                          aria-label={t('distribution.soldNow')}
                          inputMode="numeric"
                          disabled={r.remaining === 0}
                          value={qty[r.id]?.sold ?? ''}
                          onChange={(e) => setItemQty(r.id, 'sold', e.target.value)}
                          className="!h-9 w-20"
                          error={rowError(r.id, r.remaining)}
                        />
                      ),
                    },
                    {
                      key: 'rn',
                      header: t('distribution.returnedNow'),
                      render: (r: Distribution['items'][number]) => (
                        <Input
                          aria-label={t('distribution.returnedNow')}
                          inputMode="numeric"
                          disabled={r.remaining === 0}
                          value={qty[r.id]?.returned ?? ''}
                          onChange={(e) => setItemQty(r.id, 'returned', e.target.value)}
                          className="!h-9 w-20"
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
          {isAdmin && totals.remaining > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Input label={t('distribution.returnDate')} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input label={t('distribution.receivedBy')} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} maxLength={120} />
              <Textarea label={t('common.remarks')} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} rows={1} />
              <div className="sm:col-span-3 flex justify-end">
                <Button type="submit" icon={CheckCircle2} loading={saving} disabled={hasErrors || !hasInput}>
                  {t('distribution.record')}
                </Button>
              </div>
            </div>
          )}
          {totals.remaining === 0 && (
            <div className="mt-4">
              <Alert icon={CheckCircle2}>{t('distribution.settled')}</Alert>
            </div>
          )}
        </form>
      </Card>

      <Card>
        <CardHeader title={t('distribution.history')} />
        <DataTable
          rows={d.history}
          rowKey={(r) => r.id}
          empty={t('common.noData')}
          columns={[
            { key: 'd', header: t('common.date'), render: (r) => formatDateTime(r.movement_date, lang) },
            { key: 't', header: t('stock.movementType'), render: (r) => <MovementBadge type={r.movement_type} /> },
            { key: 'p', header: t('stock.product'), render: (r) => r.product_name },
            { key: 'q', header: t('items.quantity'), align: 'right', render: (r) => r.quantity },
            { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3), hideSm: true },
            { key: 'u', header: t('stock.recordedBy'), render: (r) => r.created_by_name ?? '—', hideSm: true },
            { key: 'r', header: t('common.remarks'), render: (r) => <span className="text-muted">{r.remarks}</span>, hideSm: true },
          ]}
        />
      </Card>
    </div>
  );
}
