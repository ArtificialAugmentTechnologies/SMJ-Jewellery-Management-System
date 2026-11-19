import { useI18n } from '../../i18n';
import { formatDateTime, formatMoney, formatWeight, num } from '../../lib/format';
import { STORE } from '../../lib/store';
import type { Invoice } from '../../lib/types';
import { PaymentBadge } from '../badges';
import { Logo } from '../layout/AppLayout';
import { cx } from '../ui';

/** Printable invoice. Rendered on screen and printed via window.print(). */
export default function InvoiceView({ invoice, draft = false }: { invoice: Invoice; draft?: boolean }) {
  const { t, lang } = useI18n();
  const owner = invoice.customer ?? invoice.party;
  const balance = num(invoice.grandTotal) - num(invoice.amountPaid);

  return (
    <article className={cx('print-area relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-8', draft && 'border-dashed')}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-gold-400 pb-4">
        <div className="flex items-center gap-3">
          <Logo size={52} />
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">{STORE.name}</h2>
            <p className="text-xs text-muted">
              {[STORE.address, STORE.phone, STORE.email].filter(Boolean).join(' · ')}
            </p>
            {STORE.gstin && <p className="text-xs text-muted">GSTIN: {STORE.gstin}</p>}
          </div>
        </div>
        <div className="text-right">
          {draft && (
            <span className="mb-1.5 inline-block rounded-md border border-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t('retail.draft')}
            </span>
          )}
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
            {invoice.invoiceType === 'retail' ? t('invoice.retailTitle') : t('invoice.wholesaleTitle')}
          </p>
          <p className="tabular text-sm font-semibold text-ink">{invoice.invoiceNumber}</p>
        </div>
      </header>

      <section className="grid gap-4 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('invoice.billedTo')}</p>
          <p className="mt-1 font-semibold text-ink">{owner?.name}</p>
          <p className="text-muted">{t('common.mobile')}: {owner?.mobileNumber}</p>
          {owner?.email && <p className="text-muted">{owner.email}</p>}
          {invoice.party?.address && <p className="text-muted">{invoice.party.address}</p>}
          {invoice.party && <p className="text-xs text-muted">{t(`partyTypes.${invoice.party.partyType}`)}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-muted">
            {t('invoice.date')}: <span className="font-medium text-ink">{formatDateTime(invoice.invoiceDate, lang)}</span>
          </p>
          <p className="text-muted">
            {t('payment.status')}: <PaymentBadge status={invoice.paymentStatus} />
          </p>
          <p className="mt-1 text-xs text-muted">
            {t('invoice.rateNote', { gold: num(invoice.goldRatePerGram).toFixed(2), silver: num(invoice.silverRatePerGram).toFixed(2) })}
          </p>
        </div>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-y border-line bg-gold-50/70 text-xs uppercase tracking-wide text-gold-900 dark:bg-gold-900/20 dark:text-gold-200">
              <th className="px-2 py-2 text-left">{t('invoice.sNo')}</th>
              <th className="px-2 py-2 text-left">{t('invoice.product')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.weight')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.qty')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.rate')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.goldAmount')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.making')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.discount')}</th>
              <th className="px-2 py-2 text-right">{t('invoice.amount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoice.items.map((it, i) => (
              <tr key={it.id ?? i} className="tabular">
                <td className="px-2 py-2 text-muted">{i + 1}</td>
                <td className="px-2 py-2">
                  <p className="font-medium text-ink">{it.productName}</p>
                  <p className="text-xs text-muted">
                    {t(`categories.${it.category}`)} · {t(`metals.${it.metal}`)}
                    {it.description ? ` · ${it.description}` : ''}
                  </p>
                </td>
                <td className="px-2 py-2 text-right">{num(it.weight).toFixed(3)}</td>
                <td className="px-2 py-2 text-right">{it.quantity}</td>
                <td className="px-2 py-2 text-right">{formatMoney(it.goldRate)}</td>
                <td className="px-2 py-2 text-right">{formatMoney(it.goldAmount)}</td>
                <td className="px-2 py-2 text-right">{formatMoney(it.makingCharges)}</td>
                <td className="px-2 py-2 text-right">{num(it.discount) ? `− ${formatMoney(it.discount)}` : '—'}</td>
                <td className="px-2 py-2 text-right font-semibold text-ink">{formatMoney(it.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
        <div className="text-sm text-muted sm:max-w-xs">
          {invoice.notes && (
            <p>
              <span className="font-medium text-ink">{t('common.notes')}:</span> {invoice.notes}
            </p>
          )}
          {invoice.createdByName && (
            <p className="mt-2 text-xs">
              {t('invoice.preparedBy')}: {invoice.createdByName}
            </p>
          )}
        </div>
        <dl className="tabular w-full space-y-1 text-sm sm:w-80">
          <Row label={t('totals.totalWeight')} value={formatWeight(invoice.totalWeight)} />
          <Row label={t('totals.goldAmount')} value={formatMoney(invoice.goldAmount)} />
          <Row label={t('totals.makingCharges')} value={formatMoney(invoice.makingCharges)} />
          <Row label={t('totals.subtotal')} value={formatMoney(invoice.subtotal)} />
          <Row label={t('totals.itemDiscount')} value={`− ${formatMoney(invoice.itemDiscount)}`} />
          <Row label={t('totals.overallDiscountShort')} value={`− ${formatMoney(invoice.overallDiscount)}`} />
          {num(invoice.gstAmount) > 0 && (
            <>
              <Row label={t('totals.taxable')} value={formatMoney(num(invoice.subtotal) - num(invoice.discount))} />
              <Row label={`${t('totals.cgst')} (${num(invoice.gstRate) / 2}%)`} value={formatMoney(cgst(invoice))} />
              <Row label={`${t('totals.sgst')} (${num(invoice.gstRate) / 2}%)`} value={formatMoney(num(invoice.gstAmount) - cgst(invoice))} />
            </>
          )}
          <div className="flex justify-between border-t-2 border-gold-400 pt-2 text-base font-semibold text-ink">
            <dt>{t('totals.grandTotal')}</dt>
            <dd>{formatMoney(invoice.grandTotal)}</dd>
          </div>
          <Row label={t('payment.paid')} value={formatMoney(invoice.amountPaid)} />
          <Row label={t('payment.balance')} value={formatMoney(balance)} strong={balance > 0} />
        </dl>
      </section>

      <footer className="mt-12 grid grid-cols-2 gap-8 text-xs text-muted">
        <div className="border-t border-line pt-2">{t('invoice.customerSignature')}</div>
        <div className="border-t border-line pt-2 text-right">{t('invoice.signature')}</div>
        <p className="col-span-2 text-center font-medium text-gold-700 dark:text-gold-300">{t('invoice.thankYou')}</p>
      </footer>
    </article>
  );
}

/** CGST gets the larger half when the paise split is odd (matches the billing screen). */
export function cgst(inv: Pick<Invoice, 'gstAmount'>) {
  const p = Math.round(num(inv.gstAmount) * 100);
  return (p - Math.floor(p / 2)) / 100;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink'}>{value}</dd>
    </div>
  );
}
