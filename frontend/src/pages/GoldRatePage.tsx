import { useState, type FormEvent } from 'react';
import { Clock, Coins, History, Info, Lock } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useRate, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { formatDateTime, formatMoney, num, toDateTimeInput } from '../lib/format';
import type { GoldRate } from '../lib/types';
import { Alert, Button, Card, CardHeader, DataTable, Input, PageHeader } from '../components/ui';

export default function GoldRatePage() {
  const { t, te, lang } = useI18n();
  const { isAdmin } = useAuth();
  const { rate, refresh } = useRate();
  const notify = useToast();
  const { data: history, loading, reload } = useAsync(() => api.get<{ data: GoldRate[] }>('/gold-rates', { limit: 100 }).then((r) => r.data), []);
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [effective, setEffective] = useState(toDateTimeInput());
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/gold-rates', {
        // Gold is optional: left blank, the server keeps the previous gold rate.
        gold_rate_per_gram: gold || null,
        silver_rate_per_gram: silver,
        effective_date: new Date(effective).toISOString(),
      });
      notify(t('rate.saved'));
      setGold('');
      setSilver('');
      setEffective(toDateTimeInput());
      await Promise.all([refresh(), reload()]);
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('nav.goldRate')} subtitle={t('rate.historyNote')} />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('rate.current')} icon={Coins} />
          {rate ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gold-50 p-4 dark:bg-gold-900/30">
                  <p className="text-xs font-medium text-gold-800 dark:text-gold-200">{t('rate.todaySilver')}</p>
                  <p className="tabular mt-1 text-2xl font-semibold text-gold-900 dark:text-gold-100">{formatMoney(rate.silverRatePerGram)}</p>
                  <p className="text-xs text-muted">{t('rate.perGram')}</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="text-xs font-medium text-muted">{t('rate.todayGold')}</p>
                  <p className="tabular mt-1 text-2xl font-semibold text-ink">{formatMoney(rate.goldRatePerGram)}</p>
                  <p className="text-xs text-muted">{t('rate.perGram')}</p>
                </div>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Clock className="h-4 w-4" />
                {t('rate.updatedAt', { date: formatDateTime(rate.effectiveDate, lang) })}
                {rate.updatedByName ? ` · ${t('rate.updatedBy', { name: rate.updatedByName })}` : ''}
              </p>
            </>
          ) : (
            <Alert tone="warning">{t('rate.notSetHint')}</Alert>
          )}
        </Card>

        <Card>
          <CardHeader title={t('rate.update')} icon={isAdmin ? Coins : Lock} />
          {isAdmin ? (
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
              <Input label={t('rate.silverRate')} type="number" min="0.01" step="0.01" required value={silver} onChange={(e) => setSilver(e.target.value)} prefix="₹" placeholder={rate ? String(num(rate.silverRatePerGram)) : ''} />
              <Input
                label={t('rate.goldRateOptional')}
                type="number"
                min="0.01"
                step="0.01"
                required={!rate}
                value={gold}
                onChange={(e) => setGold(e.target.value)}
                prefix="₹"
                placeholder={rate ? String(num(rate.goldRatePerGram)) : ''}
                hint={rate ? t('rate.goldKeepHint', { rate: formatMoney(rate.goldRatePerGram) }) : undefined}
              />
              <Input
                label={t('rate.effectiveDate')}
                type="datetime-local"
                required
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
                hint={t('rate.effectiveHint')}
                wrapClassName="sm:col-span-2"
              />
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" loading={saving}>
                  {t('rate.update')}
                </Button>
              </div>
            </form>
          ) : (
            <Alert icon={Info}>{t('common.adminOnly')}</Alert>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t('rate.history')} icon={History} />
        <DataTable
          rows={history ?? []}
          loading={loading && !history}
          rowKey={(r) => r.id}
          empty={t('common.noData')}
          columns={[
            { key: 'd', header: t('rate.effectiveDate'), render: (r) => formatDateTime(r.effectiveDate, lang) },
            { key: 's', header: t('rate.silver'), align: 'right', render: (r) => <span className="tabular font-medium">{formatMoney(r.silverRatePerGram)}</span> },
            { key: 'g', header: t('rate.gold'), align: 'right', render: (r) => <span className="tabular">{formatMoney(r.goldRatePerGram)}</span> },
            { key: 'u', header: t('stock.recordedBy'), render: (r) => r.updatedByName ?? '—', hideSm: true },
            { key: 'c', header: t('common.date'), render: (r) => formatDateTime(r.createdAt, lang), hideSm: true },
          ]}
        />
      </Card>
    </div>
  );
}
