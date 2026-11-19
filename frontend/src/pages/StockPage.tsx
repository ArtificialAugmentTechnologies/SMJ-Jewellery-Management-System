import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, CheckCircle2, FileDown, History, Plus, RotateCcw, ShoppingCart, Trash2, Users } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { dateInputToIso, formatDateTime, formatInt, formatWeight, num, toDateTimeInput } from '../lib/format';
import { downloadCsv } from '../lib/exporters';
import { CATEGORIES, METALS, type Category, type Metal, type Movement, type MovementType, type Party, type Product } from '../lib/types';
import { Alert, Button, Card, CardHeader, DataTable, Input, PageHeader, Select, StatCard, Tabs, Textarea } from '../components/ui';
import { MovementBadge } from '../components/badges';

type Tab = 'history' | 'inward' | 'outward';

interface Summary {
  total_in: number | string;
  total_in_weight: string;
  total_out: number | string;
  total_out_weight: string;
  sold: number | string;
  sold_weight: string;
  returned: number | string;
  returned_weight: string;
  available: number | string;
  available_weight: string;
  with_parties: number | string;
  byCategory: { category: Category; products: number; quantity: number | string; weight: string }[];
}

export default function StockPage() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || (isAdmin ? 'inward' : 'history');
  const [version, setVersion] = useState(0);
  const { data: s } = useAsync(() => api.get<{ data: Summary }>('/stock/summary').then((r) => r.data), [version]);
  const bump = () => setVersion((v) => v + 1);

  return (
    <div>
      <PageHeader title={t('stock.title')} subtitle={t('stock.subtitle')} />
      {s && (
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label={t('stock.totalIn')} value={formatInt(s.total_in)} sub={formatWeight(s.total_in_weight)} icon={ArrowDownToLine} tone="green" />
          <StatCard label={t('stock.totalOut')} value={formatInt(s.total_out)} sub={formatWeight(s.total_out_weight)} icon={ArrowUpFromLine} tone="blue" />
          <StatCard label={t('stock.available')} value={formatInt(s.available)} sub={formatWeight(s.available_weight)} icon={Boxes} tone="gold" />
          <StatCard label={t('stock.sold')} value={formatInt(s.sold)} sub={formatWeight(s.sold_weight)} icon={ShoppingCart} tone="gold" />
          <StatCard label={t('stock.returned')} value={formatInt(s.returned)} sub={formatWeight(s.returned_weight)} icon={RotateCcw} tone="slate" />
          <StatCard label={t('stock.withParties')} value={formatInt(s.with_parties)} icon={Users} tone="rose" />
        </section>
      )}
      <Tabs<Tab>
        value={tab}
        onChange={(k) => setParams({ tab: k }, { replace: true })}
        tabs={[
          ...(isAdmin
            ? [
                { key: 'inward' as const, label: t('stock.inward'), icon: ArrowDownToLine },
                { key: 'outward' as const, label: t('stock.outward'), icon: ArrowUpFromLine },
              ]
            : []),
          { key: 'history', label: t('stock.history'), icon: History },
        ]}
      />
      {tab === 'inward' && isAdmin && <InwardForm onSaved={bump} />}
      {tab === 'outward' && isAdmin && <OutwardForm onSaved={bump} preselectParty={Number(params.get('party')) || null} />}
      {tab === 'history' && <MovementHistory version={version} />}
      {s && tab === 'history' && s.byCategory.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={t('stock.byCategory')} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {s.byCategory.map((c) => (
              <div key={c.category} className="rounded-xl bg-surface-2/70 p-3">
                <p className="text-sm font-medium text-ink">{t(`categories.${c.category}`)}</p>
                <p className="tabular mt-1 text-xl font-semibold text-ink">
                  {formatInt(c.quantity)} <span className="text-sm font-normal text-muted">{t('common.pieces')}</span>
                </p>
                <p className="text-xs text-muted">{formatWeight(c.weight)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function InwardForm({ onSaved }: { onSaved: () => void }) {
  const { t, te } = useI18n();
  const notify = useToast();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const { data: products, reload } = useAsync(() => api.get<{ data: Product[] }>('/products', { limit: 500 }).then((r) => r.data), []);
  const blank = {
    product_id: '',
    product_name: '',
    category: 'Ring' as Category,
    metal: 'silver' as Metal,
    description: '',
    weight: '',
    quantity: '',
    purchase_price: '',
    supplier_details: '',
    date: toDateTimeInput(),
    remarks: '',
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);

  function pickProduct(id: string) {
    const p = products?.find((x) => x.id === Number(id));
    setF({ ...f, product_id: id, weight: p ? String(num(p.weight)) : f.weight, purchase_price: p ? String(num(p.purchasePrice)) : f.purchase_price });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/stock/inward', {
        ...(mode === 'existing'
          ? { product_id: Number(f.product_id) }
          : { product_name: f.product_name, category: f.category, metal: f.metal, description: f.description || null }),
        weight: f.weight,
        quantity: Number(f.quantity),
        purchase_price: f.purchase_price || '0',
        supplier_details: f.supplier_details || null,
        date: new Date(f.date).toISOString(),
        remarks: f.remarks || null,
      });
      notify(t('stock.inwardSaved'));
      setF({ ...blank, date: toDateTimeInput() });
      reload();
      onSaved();
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t('stock.inward')} icon={ArrowDownToLine} />
      <div className="mb-4 inline-flex rounded-lg border border-line p-0.5 text-sm">
        {(['existing', 'new'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 font-medium ${mode === m ? 'bg-gold-100 text-gold-900 dark:bg-gold-900/50 dark:text-gold-100' : 'text-muted'}`}
          >
            {m === 'existing' ? t('stock.existingProduct') : t('stock.newProduct')}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mode === 'existing' ? (
          <Select
            label={t('stock.product')}
            required
            value={f.product_id}
            onChange={(e) => pickProduct(e.target.value)}
            placeholder={t('stock.selectProduct')}
            options={(products ?? []).map((p) => ({ value: p.id, label: `${p.productName} (${t(`categories.${p.category}`)}) · ${p.quantity}` }))}
            wrapClassName="sm:col-span-2"
          />
        ) : (
          <>
            <Input label={t('items.productName')} required value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} maxLength={150} />
            <Select
              label={t('items.category')}
              required
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value as Category })}
              options={CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            />
            <Select
              label={t('items.metal')}
              value={f.metal}
              onChange={(e) => setF({ ...f, metal: e.target.value as Metal })}
              options={METALS.map((m) => ({ value: m, label: t(`metals.${m}`) }))}
            />
            <Input label={t('items.description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </>
        )}
        <Input label={t('items.weightPerPiece')} type="number" min="0.001" step="0.001" required value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
        <Input label={t('items.quantity')} type="number" min="1" step="1" required value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        <Input label={t('stock.purchasePrice')} type="number" min="0" step="0.01" value={f.purchase_price} onChange={(e) => setF({ ...f, purchase_price: e.target.value })} />
        <Input label={t('common.date')} type="datetime-local" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <Textarea label={t('stock.supplier')} value={f.supplier_details} onChange={(e) => setF({ ...f, supplier_details: e.target.value })} wrapClassName="sm:col-span-2" maxLength={500} />
        <Textarea label={t('common.remarks')} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} wrapClassName="sm:col-span-2" maxLength={500} />
        <div className="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-4">
          <p className="tabular text-sm text-muted">
            {f.weight && f.quantity ? `${t('totals.totalWeight')}: ${formatWeight(num(f.weight) * num(f.quantity))}` : ''}
          </p>
          <Button type="submit" icon={CheckCircle2} loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function OutwardForm({ onSaved, preselectParty }: { onSaved: () => void; preselectParty: number | null }) {
  const { t, te } = useI18n();
  const notify = useToast();
  const navigate = useNavigate();
  const { data: products } = useAsync(() => api.get<{ data: Product[] }>('/products', { in_stock: 'true', limit: 500 }).then((r) => r.data), []);
  const { data: parties } = useAsync(() => api.get<{ data: Party[] }>('/wholesale/parties', { active: 'true' }).then((r) => r.data), []);
  const [partyId, setPartyId] = useState(preselectParty ? String(preselectParty) : '');
  const [lineMemberId, setLineMemberId] = useState('');
  const [lines, setLines] = useState([{ product_id: '', quantity: '' }]);
  const [date, setDate] = useState(toDateTimeInput());
  const [purpose, setPurpose] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const party = parties?.find((p) => p.id === Number(partyId));
  const lineMembers = (parties ?? []).filter((p) => p.party_type === 'line_member' && p.id !== Number(partyId));
  const lineErrors = lines.map((l) => {
    const p = products?.find((x) => x.id === Number(l.product_id));
    if (p && Number(l.quantity) > p.quantity) return t('items.notEnoughStock', { count: p.quantity });
    return null;
  });
  const duplicate = new Set(lines.map((l) => l.product_id).filter(Boolean)).size !== lines.filter((l) => l.product_id).length;
  const totalWeight = lines.reduce((a, l) => {
    const p = products?.find((x) => x.id === Number(l.product_id));
    return a + (p ? num(p.weight) * num(l.quantity) : 0);
  }, 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lineErrors.some(Boolean) || duplicate) return;
    setSaving(true);
    try {
      const r = await api.post<{ data: { id: number } }>('/stock/outward', {
        party_id: Number(partyId),
        line_member_id: lineMemberId ? Number(lineMemberId) : null,
        items: lines.filter((l) => l.product_id && Number(l.quantity) > 0).map((l) => ({ product_id: Number(l.product_id), quantity: Number(l.quantity) })),
        distribution_date: new Date(date).toISOString(),
        purpose: purpose || null,
        received_by: receivedBy || null,
        remarks: remarks || null,
      });
      notify(t('stock.outwardSaved'));
      onSaved();
      navigate(`/wholesale/distributions/${r.data.id}`);
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={t('stock.outward')} icon={ArrowUpFromLine} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={t('stock.recipient')}
            hint={t('stock.recipientHint')}
            required
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            placeholder="—"
            options={(parties ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${t(`partyTypes.${p.party_type}`)}` }))}
            wrapClassName="sm:col-span-2"
          />
          <Select
            label={t('distribution.lineMemberOptional')}
            value={lineMemberId}
            onChange={(e) => setLineMemberId(e.target.value)}
            placeholder="—"
            disabled={party?.party_type === 'line_member'}
            options={lineMembers.map((p) => ({ value: p.id, label: p.name }))}
            wrapClassName="sm:col-span-2"
          />
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_auto] items-start gap-2">
              <Select
                label={i === 0 ? t('stock.product') : undefined}
                aria-label={t('stock.product')}
                required
                value={l.product_id}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}
                placeholder={t('stock.selectProduct')}
                options={(products ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.productName} · ${num(p.weight).toFixed(3)} g · ${t('items.available', { count: p.quantity })}`,
                }))}
              />
              <Input
                label={i === 0 ? t('items.quantity') : undefined}
                aria-label={t('items.quantity')}
                type="number"
                min="1"
                step="1"
                required
                value={l.quantity}
                onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                error={lineErrors[i]}
              />
              <button
                type="button"
                onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
                className={`rounded-lg p-2.5 text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 ${i === 0 ? 'mt-6' : ''}`}
                aria-label={t('common.remove')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {duplicate && <Alert tone="error">{t('errors.duplicate_product')}</Alert>}
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => setLines([...lines, { product_id: '', quantity: '' }])}>
            {t('stock.addLine')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label={t('stock.issueDate')} type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label={t('distribution.receivedBy')} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} maxLength={120} />
          <Input label={t('distribution.purpose')} value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={255} />
          <Input label={t('common.remarks')} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tabular text-sm text-muted">
            {t('totals.totalWeight')}: {formatWeight(totalWeight)} · {lines.reduce((a, l) => a + num(l.quantity), 0)} {t('common.pieces')}
          </p>
          <Button type="submit" icon={ArrowUpFromLine} loading={saving} disabled={!partyId || lineErrors.some(Boolean) || duplicate}>
            {t('wholesale.issueStock')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MovementHistory({ version }: { version: number }) {
  const { t, lang } = useI18n();
  const [type, setType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(100);
  const { data, loading } = useAsync(
    () =>
      api.get<{ data: Movement[]; total: number }>('/stock/movements', {
        type,
        from: dateInputToIso(from),
        to: dateInputToIso(to, 1),
        limit,
      }),
    [type, from, to, limit, version],
  );
  const rows = data?.data ?? [];

  function exportCsv() {
    downloadCsv(
      `stock-movements-${new Date().toISOString().slice(0, 10)}`,
      ['Date', 'Movement', 'Product', 'Category', 'Quantity', 'Weight (g)', 'Party', 'Reference', 'Recorded By', 'Remarks'],
      rows.map((r) => [
        formatDateTime(r.movement_date),
        r.movement_type,
        r.product_name,
        r.category ?? '',
        r.quantity,
        num(r.weight).toFixed(3),
        r.to_party_name ?? r.from_party_name ?? '',
        r.invoice_number ?? (r.reference_type === 'distribution' ? `Distribution #${r.reference_id}` : ''),
        r.created_by_name ?? '',
        r.remarks ?? '',
      ]),
    );
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label={t('stock.movementType')}
          value={type}
          onChange={(e) => setType(e.target.value as MovementType | '')}
          placeholder={t('common.all')}
          options={(['inward', 'outward', 'sold', 'returned'] as const).map((m) => ({ value: m, label: t(`movementTypes.${m}`) }))}
          wrapClassName="w-40"
        />
        <Input label={t('common.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} wrapClassName="w-40" />
        <Input label={t('common.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} wrapClassName="w-40" />
        <Button variant="outline" icon={FileDown} onClick={exportCsv} disabled={!rows.length} className="ml-auto">
          {t('common.exportCsv')}
        </Button>
      </div>
      <DataTable
        rows={rows}
        loading={loading && !data}
        rowKey={(r) => r.id}
        empty={t('common.noData')}
        columns={[
          { key: 'd', header: t('common.date'), render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.movement_date, lang)}</span> },
          { key: 't', header: t('stock.movementType'), render: (r) => <MovementBadge type={r.movement_type} /> },
          {
            key: 'p',
            header: t('stock.product'),
            render: (r) => (
              <div>
                <p className="font-medium">{r.product_name}</p>
                {r.category && <p className="text-xs text-muted">{t(`categories.${r.category}`)}</p>}
              </div>
            ),
          },
          { key: 'q', header: t('items.quantity'), align: 'right', render: (r) => r.quantity },
          { key: 'w', header: t('invoice.weight'), align: 'right', render: (r) => num(r.weight).toFixed(3), hideSm: true },
          { key: 'party', header: t('stock.party'), render: (r) => r.to_party_name ?? r.from_party_name ?? '—', hideSm: true },
          {
            key: 'ref',
            header: t('stock.reference'),
            hideSm: true,
            render: (r) =>
              r.reference_type === 'invoice' && r.reference_id ? (
                <Link to={`/billing/${r.reference_id}`} className="text-gold-700 hover:underline dark:text-gold-300">
                  {r.invoice_number}
                </Link>
              ) : r.reference_type === 'distribution' && r.reference_id ? (
                <Link to={`/wholesale/distributions/${r.reference_id}`} className="text-gold-700 hover:underline dark:text-gold-300">
                  #{r.reference_id}
                </Link>
              ) : (
                <span className="text-muted">{r.supplier_details ?? '—'}</span>
              ),
          },
          { key: 'u', header: t('stock.recordedBy'), render: (r) => r.created_by_name ?? '—', hideSm: true },
        ]}
      />
      {data && rows.length < data.total && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{t('common.showing', { count: rows.length, total: data.total })}</span>
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 100)}>
            {t('common.loadMore')}
          </Button>
        </div>
      )}
    </Card>
  );
}
