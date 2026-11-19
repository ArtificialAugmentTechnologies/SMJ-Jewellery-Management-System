import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, Clock, Coins, Gem, IndianRupee, PackagePlus, Receipt, ShoppingBag, Truck, Users, Wallet } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatDateTime, formatInt, formatMoney, formatWeight, num } from '../lib/format';
import type { GoldRate, InvoiceRow } from '../lib/types';
import { Button, Card, CardHeader, DataTable, PageHeader, PageLoader, StatCard } from '../components/ui';
import { PaymentBadge, TypeBadge } from '../components/badges';

interface Summary {
  total_customers: number;
  total_products: number;
  available_stock: number | string;
  available_weight: string;
  retail_count: number;
  retail_total: string;
  wholesale_count: number;
  wholesale_total: string;
  today_sales: string;
  outstanding: string;
  active_parties: number;
  currentRate: GoldRate | null;
  recentTransactions: InvoiceRow[];
}

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => api.get<{ data: Summary }>('/dashboard').then((r) => r.data), []);

  if (loading && !data) return <PageLoader />;
  const d = data;
  const rate = d?.currentRate;

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      {/* Today's rates */}
      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="gold-gradient relative overflow-hidden rounded-2xl p-5 text-white shadow-md shadow-gold-800/20 lg:col-span-2 sm:p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-white/85">
                <Coins className="h-4 w-4" /> {t('rate.todaySilver')}
              </p>
              <p className="tabular mt-2 font-display text-4xl font-semibold sm:text-5xl">
                {rate ? formatMoney(rate.silverRatePerGram) : t('rate.notSet')}
              </p>
              <p className="text-sm text-white/80">{t('rate.perGram')}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs font-medium text-white/85">{t('rate.todayGold')}</p>
              <p className="tabular mt-1 text-2xl font-semibold">{rate ? formatMoney(rate.goldRatePerGram) : '—'}</p>
              <p className="text-xs text-white/80">{t('rate.perGram')}</p>
            </div>
          </div>
          <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-white/85">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {rate ? t('rate.updatedAt', { date: formatDateTime(rate.effectiveDate, lang) }) : t('rate.notSetHint')}
            </span>
            {isAdmin && (
              <Link to="/gold-rate" className="rounded-lg bg-white/20 px-3 py-1.5 font-medium text-white transition hover:bg-white/30">
                {t('rate.update')}
              </Link>
            )}
          </div>
        </div>
        <Card>
          <CardHeader title={t('dashboard.quickActions')} />
          <div className="grid gap-2">
            <Button icon={ShoppingBag} onClick={() => navigate('/retail')} className="justify-start">
              {t('dashboard.newRetailBill')}
            </Button>
            <Button variant="secondary" icon={Truck} onClick={() => navigate('/wholesale/new-bill')} className="justify-start">
              {t('dashboard.newWholesaleBill')}
            </Button>
            {isAdmin && (
              <Button variant="outline" icon={PackagePlus} onClick={() => navigate('/stock')} className="justify-start">
                {t('dashboard.stockInward')}
              </Button>
            )}
          </div>
        </Card>
      </section>

      {d && (
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('dashboard.totalCustomers')} value={formatInt(d.total_customers)} icon={Users} tone="blue" />
          <StatCard
            label={t('dashboard.retailSales')}
            value={formatMoney(d.retail_total)}
            sub={t('dashboard.invoicesCount', { count: d.retail_count })}
            icon={ShoppingBag}
            tone="gold"
          />
          <StatCard
            label={t('dashboard.wholesaleSales')}
            value={formatMoney(d.wholesale_total)}
            sub={`${t('dashboard.invoicesCount', { count: d.wholesale_count })} · ${t('dashboard.activeParties', { count: d.active_parties })}`}
            icon={Truck}
            tone="green"
          />
          <StatCard label={t('dashboard.totalProducts')} value={formatInt(d.total_products)} icon={Gem} tone="slate" />
          <StatCard
            label={t('dashboard.availableStock')}
            value={`${formatInt(d.available_stock)} ${t('common.pieces')}`}
            sub={formatWeight(d.available_weight)}
            icon={Boxes}
            tone="blue"
          />
          <StatCard label={t('dashboard.todaySales')} value={formatMoney(d.today_sales)} icon={IndianRupee} tone="gold" />
          <StatCard
            label={t('dashboard.outstanding')}
            value={formatMoney(d.outstanding)}
            icon={Wallet}
            tone={num(d.outstanding) > 0 ? 'rose' : 'green'}
          />
          <StatCard
            label={t('nav.billing')}
            value={formatInt(num(d.retail_count) + num(d.wholesale_count))}
            icon={Receipt}
            tone="slate"
          />
        </section>
      )}

      <Card>
        <CardHeader
          title={t('dashboard.recentTransactions')}
          actions={
            <Link to="/billing" className="inline-flex items-center gap-1 text-sm font-medium text-gold-700 hover:underline dark:text-gold-300">
              {t('dashboard.viewAll')} <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <DataTable
          rows={d?.recentTransactions ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/billing/${r.id}`)}
          empty={t('common.noData')}
          columns={[
            { key: 'no', header: t('billing.invoiceNumber'), render: (r) => <span className="font-medium">{r.invoice_number}</span> },
            { key: 'name', header: t('common.name'), render: (r) => r.owner_name },
            { key: 'type', header: t('common.type'), render: (r) => <TypeBadge type={r.invoice_type} />, hideSm: true },
            { key: 'date', header: t('common.date'), render: (r) => formatDateTime(r.invoice_date, lang), hideSm: true },
            { key: 'total', header: t('totals.grandTotal'), align: 'right', render: (r) => <span className="tabular font-medium">{formatMoney(r.grand_total)}</span> },
            { key: 'status', header: t('common.status'), render: (r) => <PaymentBadge status={r.payment_status} /> },
          ]}
        />
      </Card>
    </div>
  );
}
