import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, PackageMinus, Pencil, Phone, Receipt } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatDate, formatDateTime, formatInt, formatMoney, num } from '../lib/format';
import type { Movement, Party, PartyType, PaymentStatus } from '../lib/types';
import { Badge, Button, Card, DataTable, PageHeader, PageLoader, StatCard, Tabs } from '../components/ui';
import { MovementBadge, PaymentBadge } from '../components/badges';
import { DistributionList, PartyFormModal } from './WholesalePage';

interface PartyDetail {
  id: number;
  name: string;
  mobileNumber: string;
  email: string | null;
  address: string | null;
  partyType: PartyType;
  isActive: boolean;
  createdAt: string;
  stats: {
    stock_issued: number | string;
    stock_sold: number | string;
    stock_returned: number | string;
    stock_remaining: number | string;
    invoice_count: number;
    sales_total: string;
    paid_total: string;
    outstanding: string;
  };
  invoices: { id: number; invoice_number: string; invoice_date: string; total_weight: string; grand_total: string; amount_paid: string; payment_status: PaymentStatus }[];
  movements: Movement[];
}

type Tab = 'distributions' | 'sales' | 'movements';

export default function PartyDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('distributions');
  const [editOpen, setEditOpen] = useState(false);
  const { data: p, loading, reload } = useAsync(() => api.get<{ data: PartyDetail }>(`/wholesale/parties/${id}`).then((r) => r.data), [id]);

  if (loading && !p) return <PageLoader />;
  if (!p) return null;
  const typeLabel = t(`partyTypes.${p.partyType}`);
  const s = p.stats;

  return (
    <div>
      <Link to={`/wholesale?tab=${p.partyType}`} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t(`partyTypesPlural.${p.partyType}`)}
      </Link>
      <PageHeader
        title={p.name}
        subtitle={t('wholesale.detailsTitle', { type: typeLabel })}
        actions={
          <>
            {isAdmin && (
              <>
                <Button variant="outline" icon={Pencil} onClick={() => setEditOpen(true)}>
                  {t('common.edit')}
                </Button>
                <Button variant="outline" icon={PackageMinus} onClick={() => navigate(`/stock?tab=outward&party=${p.id}`)}>
                  {t('wholesale.issueStock')}
                </Button>
              </>
            )}
            <Button icon={Receipt} onClick={() => navigate(`/wholesale/new-bill?party=${p.id}`)}>
              {t('wholesale.newBill')}
            </Button>
          </>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge tone="gold">{typeLabel}</Badge>
          <Badge tone={p.isActive ? 'green' : 'slate'}>{p.isActive ? t('common.active') : t('common.inactive')}</Badge>
          <span className="flex items-center gap-1.5 text-ink">
            <Phone className="h-4 w-4 text-muted" /> {p.mobileNumber}
          </span>
          {p.email && (
            <span className="flex items-center gap-1.5 text-ink">
              <Mail className="h-4 w-4 text-muted" /> {p.email}
            </span>
          )}
          {p.address && (
            <span className="flex items-center gap-1.5 text-ink">
              <MapPin className="h-4 w-4 text-muted" /> {p.address}
            </span>
          )}
        </div>
      </Card>

      <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={p.partyType === 'shopkeeper' ? t('wholesale.stockReceived') : t('wholesale.stockDistributed')}
          value={formatInt(s.stock_issued)}
          tone="blue"
        />
        <StatCard label={t('wholesale.stockSold')} value={formatInt(s.stock_sold)} tone="gold" />
        <StatCard label={t('wholesale.stockReturned')} value={formatInt(s.stock_returned)} tone="slate" />
        <StatCard label={t('distribution.remainingItems')} value={formatInt(s.stock_remaining)} sub={t('distribution.formula')} tone="green" />
        <StatCard label={t('wholesale.salesTotal')} value={formatMoney(s.sales_total)} sub={t('dashboard.invoicesCount', { count: s.invoice_count })} tone="gold" />
        <StatCard label={t('wholesale.outstanding')} value={formatMoney(s.outstanding)} tone={num(s.outstanding) > 0 ? 'rose' : 'green'} />
      </section>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'distributions', label: t('wholesale.distributions') },
          { key: 'sales', label: t('wholesale.salesTransactions') },
          { key: 'movements', label: t('wholesale.transactionHistory') },
        ]}
      />

      {tab === 'distributions' && <DistributionList partyId={p.id} />}
      {tab === 'sales' && (
        <Card>
          <DataTable
            rows={p.invoices}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/billing/${r.id}`)}
            empty={t('common.noData')}
            columns={[
              { key: 'n', header: t('invoice.number'), render: (r) => <span className="font-medium">{r.invoice_number}</span> },
              { key: 'd', header: t('common.date'), render: (r) => formatDate(r.invoice_date, lang) },
              { key: 'w', header: t('totals.totalWeight'), align: 'right', render: (r) => num(r.total_weight).toFixed(3), hideSm: true },
              { key: 't', header: t('totals.grandTotal'), align: 'right', render: (r) => formatMoney(r.grand_total) },
              { key: 'b', header: t('payment.balance'), align: 'right', render: (r) => formatMoney(num(r.grand_total) - num(r.amount_paid)) },
              { key: 's', header: t('common.status'), render: (r) => <PaymentBadge status={r.payment_status} /> },
            ]}
          />
        </Card>
      )}
      {tab === 'movements' && (
        <Card>
          <DataTable
            rows={p.movements}
            rowKey={(r) => r.id}
            empty={t('common.noData')}
            columns={[
              { key: 'd', header: t('common.date'), render: (r) => formatDateTime(r.movement_date, lang) },
              { key: 'type', header: t('stock.movementType'), render: (r) => <MovementBadge type={r.movement_type} /> },
              { key: 'p', header: t('stock.product'), render: (r) => r.product_name },
              { key: 'q', header: t('items.quantity'), align: 'right', render: (r) => r.quantity },
              { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3), hideSm: true },
              { key: 'r', header: t('common.remarks'), render: (r) => <span className="text-muted">{r.remarks}</span>, hideSm: true },
            ]}
          />
        </Card>
      )}

      <PartyFormModal
        type={p.partyType}
        open={editOpen}
        party={{ id: p.id, name: p.name, mobile_number: p.mobileNumber, email: p.email, address: p.address, party_type: p.partyType, is_active: p.isActive } as Party}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />
    </div>
  );
}
