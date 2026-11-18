import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageMinus, Pencil, Plus, Receipt, Store, Truck, UserRound, Users } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { api, ApiError } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { digitsOnly, formatDate, formatInt, formatMoney, num } from '../lib/format';
import type { DistributionRow, Party, PartyType } from '../lib/types';
import { Badge, Button, Card, DataTable, Input, Modal, PageHeader, Tabs, Textarea } from '../components/ui';
import { DistributionBadge } from '../components/badges';

type Tab = PartyType | 'distributions';

export default function WholesalePage() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'party';
  const setTab = (k: Tab) => setParams({ tab: k }, { replace: true });

  return (
    <div>
      <PageHeader
        title={t('wholesale.title')}
        subtitle={t('wholesale.subtitle')}
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" icon={PackageMinus} onClick={() => navigate('/stock?tab=outward')}>
                {t('wholesale.issueStock')}
              </Button>
            )}
            <Button icon={Receipt} onClick={() => navigate('/wholesale/new-bill')}>
              {t('wholesale.newBill')}
            </Button>
          </>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'party', label: t('partyTypesPlural.party'), icon: Users },
          { key: 'shopkeeper', label: t('partyTypesPlural.shopkeeper'), icon: Store },
          { key: 'line_member', label: t('partyTypesPlural.line_member'), icon: UserRound },
          { key: 'distributions', label: t('wholesale.distributions'), icon: Truck },
        ]}
      />
      {tab === 'distributions' ? <DistributionList /> : <PartyList key={tab} type={tab} />}
    </div>
  );
}

function PartyList({ type }: { type: PartyType }) {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [editing, setEditing] = useState<Party | null | 'new'>(null);
  const { data, loading, reload } = useAsync(
    () => api.get<{ data: Party[] }>('/wholesale/parties', { type, search: debounced }).then((r) => r.data),
    [type, debounced],
  );
  const typeLabel = t(`partyTypes.${type}`);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder={t('common.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapClassName="w-full sm:w-72"
          aria-label={t('common.search')}
        />
        {isAdmin && (
          <Button icon={Plus} onClick={() => setEditing('new')}>
            {t('wholesale.add', { type: typeLabel })}
          </Button>
        )}
      </div>
      <DataTable
        rows={data ?? []}
        loading={loading && !data}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/wholesale/parties/${r.id}`)}
        empty={t('wholesale.noRecords', { type: t(`partyTypesPlural.${type}`) })}
        columns={[
          {
            key: 'name',
            header: t('common.name'),
            render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted">{r.mobile_number}</p>
              </div>
            ),
          },
          { key: 'issued', header: type === 'shopkeeper' ? t('wholesale.stockReceived') : t('wholesale.stockIssued'), align: 'right', render: (r) => formatInt(r.stock_issued) },
          { key: 'sold', header: t('wholesale.stockSold'), align: 'right', render: (r) => formatInt(r.stock_sold), hideSm: true },
          { key: 'ret', header: t('wholesale.stockReturned'), align: 'right', render: (r) => formatInt(r.stock_returned), hideSm: true },
          { key: 'rem', header: t('wholesale.remaining'), align: 'right', render: (r) => <span className="font-semibold">{formatInt(r.stock_remaining)}</span> },
          { key: 'sales', header: t('wholesale.salesTotal'), align: 'right', render: (r) => formatMoney(r.sales_total), hideSm: true },
          {
            key: 'out',
            header: t('wholesale.outstanding'),
            align: 'right',
            render: (r) => <span className={num(r.outstanding) > 0 ? 'font-medium text-red-600 dark:text-red-400' : ''}>{formatMoney(r.outstanding)}</span>,
          },
          {
            key: 'status',
            header: t('common.status'),
            hideSm: true,
            render: (r) => <Badge tone={r.is_active ? 'green' : 'slate'}>{r.is_active ? t('common.active') : t('common.inactive')}</Badge>,
          },
          ...(isAdmin
            ? [
                {
                  key: 'act',
                  header: '',
                  align: 'right' as const,
                  render: (r: Party) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(r);
                      }}
                      className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
                      aria-label={t('common.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ),
                },
              ]
            : []),
        ]}
      />
      <PartyFormModal
        type={type}
        party={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </Card>
  );
}

export function PartyFormModal({
  type,
  party,
  open,
  onClose,
  onSaved,
}: {
  type: PartyType;
  party: Party | null;
  open: boolean;
  onClose: () => void;
  onSaved: (p: Party) => void;
}) {
  const { t, te } = useI18n();
  const notify = useToast();
  const [form, setForm] = useState({ name: '', mobile_number: '', email: '', address: '', is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const marker = open ? `${party?.id ?? 'new'}` : null;
  if (marker !== openedFor) {
    setOpenedFor(marker);
    if (open) {
      setForm({
        name: party?.name ?? '',
        mobile_number: party?.mobile_number ?? '',
        email: party?.email ?? '',
        address: party?.address ?? '',
        is_active: party?.is_active ?? true,
      });
      setErrors({});
    }
  }
  const typeLabel = t(`partyTypes.${type}`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('errors.required');
    if (!/^[0-9]{10}$/.test(form.mobile_number)) errs.mobile = t('errors.invalid_mobile');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = t('errors.invalid_email');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { name: form.name, mobile_number: form.mobile_number, email: form.email || null, address: form.address || null };
      const r = party
        ? await api.patch<{ data: Party }>(`/wholesale/parties/${party.id}`, { ...body, is_active: form.is_active })
        : await api.post<{ data: Party }>('/wholesale/parties', { ...body, party_type: type });
      notify(t('wholesale.saved', { type: typeLabel }));
      onSaved(r.data);
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
      title={party ? t('wholesale.editTitle', { type: typeLabel }) : t('wholesale.add', { type: typeLabel })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="party-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="party-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Input label={t('common.name')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} maxLength={150} wrapClassName="sm:col-span-2" />
        <Input
          label={t('common.mobile')}
          required
          inputMode="numeric"
          prefix="+91"
          value={form.mobile_number}
          onChange={(e) => setForm({ ...form, mobile_number: digitsOnly(e.target.value) })}
          error={errors.mobile}
        />
        <Input label={t('common.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
        <Textarea label={t('common.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} wrapClassName="sm:col-span-2" maxLength={500} />
        {party && (
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-gold-600" />
            {t('common.active')}
          </label>
        )}
      </form>
    </Modal>
  );
}

export function DistributionList({ partyId }: { partyId?: number }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const { data, loading } = useAsync(
    () => api.get<{ data: DistributionRow[] }>('/wholesale/distributions', { party_id: partyId, status, limit: 200 }).then((r) => r.data),
    [partyId, status],
  );
  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'open', 'partially_settled', 'closed'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s ? 'border-gold-400 bg-gold-50 text-gold-800 dark:bg-gold-900/30 dark:text-gold-200' : 'border-line text-muted'}`}
          >
            {s ? t(`distributionStatus.${s}`) : t('common.all')}
          </button>
        ))}
      </div>
      <DataTable
        rows={data ?? []}
        loading={loading && !data}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/wholesale/distributions/${r.id}`)}
        empty={t('common.noData')}
        columns={[
          { key: 'id', header: '#', render: (r) => <span className="font-medium">#{r.id}</span> },
          {
            key: 'party',
            header: t('distribution.issuedTo'),
            render: (r) => (
              <div>
                <p className="font-medium">{r.party_name}</p>
                <p className="text-xs text-muted">
                  {t(`partyTypes.${r.party_type}`)}
                  {r.line_member_name ? ` · ${r.line_member_name}` : ''}
                </p>
              </div>
            ),
          },
          { key: 'date', header: t('distribution.distributionDate'), render: (r) => formatDate(r.distribution_date, lang), hideSm: true },
          { key: 'taken', header: t('distribution.itemsTaken'), align: 'right', render: (r) => r.total_items_issued },
          { key: 'sold', header: t('distribution.itemsSold'), align: 'right', render: (r) => formatInt(r.total_sold), hideSm: true },
          { key: 'ret', header: t('distribution.itemsReturned'), align: 'right', render: (r) => formatInt(r.total_returned), hideSm: true },
          { key: 'rem', header: t('distribution.remainingItems'), align: 'right', render: (r) => <span className="font-semibold">{formatInt(r.total_remaining)}</span> },
          { key: 'status', header: t('common.status'), render: (r) => <DistributionBadge status={r.status} /> },
        ]}
      />
    </Card>
  );
}
