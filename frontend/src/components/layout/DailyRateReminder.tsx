import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlarmClock, Info } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useAuth, useRate, useToast } from '../../context/AppProviders';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney, num } from '../../lib/format';
import type { GoldRate } from '../../lib/types';
import { Button, Input, Modal } from '../ui';

/** Rates roll over every day at 07:00 India Standard Time (UTC+05:30, no daylight saving). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ROLLOVER_HOUR_IST = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'smj.rateReminder.dismissedCycle';
/** Fired by the rate pill to reopen the reminder after "Remind me later". */
export const OPEN_RATE_REMINDER_EVENT = 'smj:open-rate-reminder';

/** Start (epoch ms) of the current rate day: the most recent 07:00 IST at or before `now`. */
export function rateDayStart(now = Date.now()) {
  const ist = new Date(now + IST_OFFSET_MS); // UTC fields of this Date = IST wall clock
  let start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), ROLLOVER_HOUR_IST) - IST_OFFSET_MS;
  if (start > now) start -= DAY_MS;
  return start;
}

/** True when no rate has been entered since the latest 07:00 IST rollover. */
export function isRateStale(rate: GoldRate | null, now = Date.now()) {
  if (!rate) return true;
  return new Date(rate.effectiveDate).getTime() < rateDayStart(now);
}

function readDismissed() {
  try {
    return Number(sessionStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Pops up once the daily 07:00 IST rollover has passed and today's rate has not been entered.
 * Admins can enter the rate right here; staff are told to ask an administrator.
 */
export function DailyRateReminder() {
  const { t, te, lang } = useI18n();
  const { isAdmin } = useAuth();
  const { rate, loading, refresh } = useRate();
  const notify = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [dismissedCycle, setDismissedCycle] = useState(readDismissed);
  const [silver, setSilver] = useState('');
  const [gold, setGold] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-check every minute so the reminder appears at 07:00 even if the site is left open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const reopen = () => {
      setDismissedCycle(0);
      try {
        sessionStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(OPEN_RATE_REMINDER_EVENT, reopen);
    return () => window.removeEventListener(OPEN_RATE_REMINDER_EVENT, reopen);
  }, []);

  const cycle = rateDayStart(now);
  const open = !loading && isRateStale(rate, now) && dismissedCycle !== cycle;

  // Silver must be entered; gold is optional (blank keeps the last gold rate).
  useEffect(() => {
    if (open) {
      setSilver('');
      setGold('');
    }
  }, [open, rate]);

  const later = useCallback(() => {
    setDismissedCycle(cycle);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(cycle));
    } catch {
      /* ignore */
    }
  }, [cycle]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/gold-rates', {
        gold_rate_per_gram: gold || null,
        silver_rate_per_gram: silver,
        effective_date: new Date().toISOString(),
      });
      notify(t('rate.saved'));
      await refresh();
      setNow(Date.now());
    } catch (err) {
      notify(te(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  const lastRate = rate && (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">
      <p className="text-xs text-muted">{t('reminder.lastRate', { date: formatDateTime(rate.effectiveDate, lang) })}</p>
      <p className="tabular mt-1 font-medium text-ink">
        {t('rate.silver')} {formatMoney(rate.silverRatePerGram)} · {t('rate.gold')} {formatMoney(rate.goldRatePerGram)}
      </p>
    </div>
  );

  return (
    <Modal open={open} onClose={later} title={t('reminder.title')} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <AlarmClock className="h-5 w-5" />
          </span>
          <p className="text-sm text-ink">{isAdmin ? t('reminder.body') : t('reminder.staffBody')}</p>
        </div>
        {lastRate}
        {isAdmin ? (
          <form onSubmit={save} className="space-y-3">
            <Input
              label={t('rate.silverRate')}
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={silver}
              onChange={(e) => setSilver(e.target.value)}
              prefix="₹"
              placeholder={rate ? String(num(rate.silverRatePerGram)) : ''}
            />
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
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={later}>
                {t('reminder.later')}
              </Button>
              <Button type="submit" loading={saving}>
                {t('reminder.save')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Info className="h-4 w-4 shrink-0" />
              {t('common.adminOnly')}
            </p>
            <Button onClick={later}>{t('common.close')}</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
