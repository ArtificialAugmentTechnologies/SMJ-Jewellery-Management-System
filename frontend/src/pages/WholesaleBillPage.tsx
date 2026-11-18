import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Users } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatMoney, num } from '../lib/format';
import type { Party } from '../lib/types';
import { Badge, Button, Card, CardHeader, Input, PageHeader } from '../components/ui';
import BillingFlow, { Stepper } from '../components/billing/BillingFlow';

export default function WholesaleBillPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const preselect = Number(params.get('party')) || null;
  const [selectedId, setSelectedId] = useState<number | null>(preselect);
  const [confirmed, setConfirmed] = useState(!!preselect);
  const [search, setSearch] = useState('');
  const [billKey, setBillKey] = useState(0);
  const { data: parties } = useAsync(() => api.get<{ data: Party[] }>('/wholesale/parties', { active: 'true' }).then((r) => r.data), []);

  const party = parties?.find((p) => p.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (parties ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.mobile_number.includes(q));
  }, [parties, search]);

  const owner = party && {
    id: party.id,
    name: party.name,
    mobileNumber: party.mobile_number,
    email: party.email,
    address: party.address,
    partyType: party.party_type,
  };

  return (
    <div>
      <Link to="/wholesale" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {t('wholesale.title')}
      </Link>
      <PageHeader title={t('wholesale.newBill')} subtitle={t('wholesale.newBillSubtitle')} />
      {owner && confirmed ? (
        <BillingFlow
          key={billKey}
          type="wholesale"
          owner={owner}
          ownerStepLabel={t('stock.party')}
          ownerCard={
            <Card className="flex flex-wrap items-center justify-between gap-3 !py-3">
              <div>
                <p className="text-xs text-muted">{t('retail.billingFor')}</p>
                <p className="font-semibold text-ink">
                  {owner.name} <span className="font-normal text-muted">· {owner.mobileNumber}</span>
                </p>
              </div>
              <Badge tone="gold">{t(`partyTypes.${owner.partyType}`)}</Badge>
            </Card>
          }
          onChangeOwner={() => setConfirmed(false)}
          onNewBill={() => {
            setConfirmed(false);
            setSelectedId(null);
            setBillKey((k) => k + 1);
          }}
        />
      ) : (
        <>
          <Stepper steps={[t('stock.party'), t('retail.steps.products'), t('retail.steps.discount'), t('retail.steps.bill')]} current={0} />
          <Card>
            <CardHeader
              title={t('wholesale.selectParty')}
              icon={Users}
              actions={
                <Button onClick={() => setConfirmed(true)} disabled={!party}>
                  {t('common.continue')} <ArrowRight className="h-4 w-4" />
                </Button>
              }
            />
            <Input placeholder={t('common.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} wrapClassName="mb-3 sm:w-80" aria-label={t('common.search')} />
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDoubleClick={() => {
                    setSelectedId(p.id);
                    setConfirmed(true);
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${selectedId === p.id ? 'border-gold-400 bg-gold-50 dark:bg-gold-900/30' : 'border-line hover:border-gold-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-ink">{p.name}</p>
                    <Badge tone="gold">{t(`partyTypes.${p.party_type}`)}</Badge>
                  </div>
                  <p className="text-xs text-muted">{p.mobile_number}</p>
                  {num(p.outstanding) > 0 && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {t('wholesale.outstanding')}: {formatMoney(p.outstanding)}
                    </p>
                  )}
                </button>
              ))}
              {parties && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted sm:col-span-2 xl:col-span-3">{t('common.noData')}</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
