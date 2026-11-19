import { useState, type FormEvent } from 'react';
import { BarChart3, FileDown, FileText, Play } from 'lucide-react';
import { useI18n } from '../i18n';
import { useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { dateInputToIso, digitsOnly, formatDate, formatDateTime, formatMoney, num, toDateInput } from '../lib/format';
import { downloadCsv, downloadTablePdf } from '../lib/exporters';
import { Button, Card, DataTable, EmptyState, Input, PageHeader, Select } from '../components/ui';
import { PaymentBadge } from '../components/badges';
import en from '../i18n/en';

const REPORTS = [
  'daily-sales',
  'monthly-sales',
  'retail-sales',
  'wholesale-sales',
  'customer-history',
  'product-sales',
  'stock-inward',
  'stock-outward',
  'returned-items',
  'outstanding-payments',
] as const;
type ReportName = (typeof REPORTS)[number];

const MONEY = new Set(['gst_amount', 'retail_total', 'wholesale_total', 'discount', 'grand_total', 'amount_paid', 'gold_amount', 'making_charges', 'gold_rate', 'total_amount', 'unit_price', 'balance']);
const WEIGHT = new Set(['total_weight', 'weight']);
const DATES = new Set(['invoice_date', 'movement_date']);
const INTS = new Set(['invoices', 'quantity']);
const HIDDEN = new Set<string>();

type Row = Record<string, unknown>;

export default function ReportsPage() {
  const { t, te, lang } = useI18n();
  const notify = useToast();
  const monthStart = new Date();
  monthStart.setDate(1);
  const [report, setReport] = useState<ReportName>('daily-sales');
  const [from, setFrom] = useState(toDateInput(monthStart));
  const [to, setTo] = useState(toDateInput());
  const [type, setType] = useState('');
  const [mobile, setMobile] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ranFor, setRanFor] = useState<ReportName>('daily-sales');
  const [loading, setLoading] = useState(false);

  const supportsType = ['daily-sales', 'monthly-sales', 'product-sales', 'outstanding-payments'].includes(report);

  async function run(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const r = await api.get<{ data: Row[] }>(`/reports/${report}`, {
        from: dateInputToIso(from),
        to: dateInputToIso(to, 1),
        type: supportsType ? type : undefined,
        mobile: report === 'customer-history' && mobile.length === 10 ? mobile : undefined,
      });
      setRows(r.data);
      setRanFor(report);
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setLoading(false);
    }
  }

  const columns = rows && rows.length ? Object.keys(rows[0]).filter((c) => !HIDDEN.has(c)) : [];
  const label = (col: string, english = false) => (english ? (en.reports.columns as Record<string, string>)[col] ?? col : t(`reports.columns.${col}`));

  const display = (col: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (MONEY.has(col)) return formatMoney(v);
    if (WEIGHT.has(col)) return num(v).toFixed(3);
    if (DATES.has(col)) return formatDateTime(v, lang);
    if (col === 'category') return t(`categories.${v}`);
    if (col === 'metal') return t(`metals.${v}`);
    if (col === 'invoice_type') return t(`invoiceTypes.${v}`);
    return String(v);
  };
  const plain = (col: string, v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (MONEY.has(col)) return num(v).toFixed(2);
    if (WEIGHT.has(col)) return num(v).toFixed(3);
    if (DATES.has(col)) return formatDateTime(v);
    return String(v);
  };

  const fileBase = `${ranFor}-${from || 'all'}-to-${to || 'all'}`;
  const totalsRow = () => {
    if (!rows) return null;
    const sums: Record<string, number> = {};
    for (const c of columns) if (MONEY.has(c) || WEIGHT.has(c) || INTS.has(c)) sums[c] = rows.reduce((a, r) => a + num(r[c]), 0);
    if (!Object.keys(sums).length || columns.includes('gold_rate')) return null;
    return sums;
  };
  const sums = totalsRow();

  return (
    <div>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />
      <Card className="mb-5">
        <form onSubmit={run} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Select
            label={t('reports.select')}
            value={report}
            onChange={(e) => {
              setReport(e.target.value as ReportName);
              setRows(null);
            }}
            options={REPORTS.map((r) => ({ value: r, label: t(`reports.names.${r}`) }))}
            wrapClassName="lg:col-span-2"
          />
          <Input label={t('common.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label={t('common.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {supportsType && (
            <Select
              label={t('reports.salesType')}
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder={t('common.all')}
              options={[
                { value: 'retail', label: t('invoiceTypes.retail') },
                { value: 'wholesale', label: t('invoiceTypes.wholesale') },
              ]}
            />
          )}
          {report === 'customer-history' && (
            <Input label={t('reports.mobileFilter')} inputMode="numeric" value={mobile} onChange={(e) => setMobile(digitsOnly(e.target.value))} />
          )}
          <div className="flex items-end">
            <Button type="submit" icon={Play} loading={loading} className="w-full">
              {t('reports.run')}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {rows === null ? (
          <EmptyState icon={BarChart3} title={t(`reports.names.${report}`)}>
            {t('reports.run')}
          </EmptyState>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">{t(`reports.names.${ranFor}`)}</h2>
                <p className="text-sm text-muted">
                  {from ? formatDate(dateInputToIso(from), lang) : '…'} – {to ? formatDate(dateInputToIso(to), lang) : '…'} · {t('reports.rows', { count: rows.length })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  icon={FileDown}
                  disabled={!rows.length}
                  onClick={() => downloadCsv(fileBase, columns.map((c) => label(c, true)), rows.map((r) => columns.map((c) => plain(c, r[c]))))}
                >
                  {t('common.exportCsv')}
                </Button>
                <Button
                  variant="secondary"
                  icon={FileText}
                  disabled={!rows.length}
                  onClick={() =>
                    downloadTablePdf({
                      title: (en.reports.names as Record<string, string>)[ranFor],
                      subtitle: `${from || '…'} to ${to || '…'}`,
                      headers: columns.map((c) => label(c, true)),
                      rows: rows.map((r) => columns.map((c) => plain(c, r[c]))),
                      filename: fileBase,
                      numericColumns: columns.map((c, i) => (MONEY.has(c) || WEIGHT.has(c) || INTS.has(c) ? i : -1)).filter((i) => i >= 0),
                    })
                  }
                >
                  {t('common.exportPdf')}
                </Button>
              </div>
            </div>
            <DataTable
              rows={rows}
              rowKey={(_, i) => i}
              empty={t('common.noData')}
              columns={columns.map((c) => ({
                key: c,
                header: label(c),
                align: MONEY.has(c) || WEIGHT.has(c) || INTS.has(c) ? ('right' as const) : ('left' as const),
                render: (r: Row) =>
                  c === 'payment_status' ? (
                    <PaymentBadge status={r[c] as 'paid' | 'partial' | 'unpaid'} />
                  ) : (
                    <span className={MONEY.has(c) || WEIGHT.has(c) ? 'tabular whitespace-nowrap' : ''}>{display(c, r[c])}</span>
                  ),
              }))}
              footer={
                sums && rows.length > 0 ? (
                  <tr>
                    {columns.map((c, i) => (
                      <td key={c} className={`px-3 py-2.5 text-sm font-semibold text-ink ${c in sums ? 'tabular text-right whitespace-nowrap' : ''}`}>
                        {c in sums ? (MONEY.has(c) ? formatMoney(sums[c]) : WEIGHT.has(c) ? sums[c].toFixed(3) : sums[c]) : i === 0 ? t('common.total') : ''}
                      </td>
                    ))}
                  </tr>
                ) : undefined
              }
            />
          </>
        )}
      </Card>
    </div>
  );
}
