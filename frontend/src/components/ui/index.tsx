/**
 * Reusable UI components for the SMJ Jewellery design system.
 * All colours come from theme tokens so light / dark mode work everywhere.
 */
import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Loader2, X, type LucideIcon } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

/* ----------------------------------------------------------- Button --- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}

const variants: Record<Variant, string> = {
  primary:
    'gold-gradient text-white shadow-sm shadow-gold-700/20 hover:brightness-105 active:brightness-95 border border-gold-600/40',
  secondary: 'bg-gold-50 text-gold-800 border border-gold-200 hover:bg-gold-100 dark:bg-gold-900/30 dark:text-gold-200 dark:border-gold-800 dark:hover:bg-gold-900/50',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-red-600 text-white hover:bg-red-700 border border-red-700',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------ Field --- */

const controlBase =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400 disabled:bg-surface-2 disabled:text-muted';

interface FieldWrapProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldWrap({ label, hint, error, required, id, children, className }: FieldWrapProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
          {required && <span className="text-gold-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapClassName?: string;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, wrapClassName, className, id, required, prefix, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={inputId} className={wrapClassName}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          className={cx(controlBase, 'h-10', prefix && 'pl-8', error && 'border-red-400 focus:ring-red-300', className)}
          {...rest}
        />
      </div>
    </FieldWrap>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapClassName?: string;
  options: { value: string | number; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export function Select({ label, hint, error, wrapClassName, className, id, required, options, placeholder, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={selectId} className={wrapClassName}>
      <select
        id={selectId}
        required={required}
        className={cx(controlBase, 'h-10 pr-8', error && 'border-red-400', className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  wrapClassName?: string;
}

export function Textarea({ label, hint, error, wrapClassName, className, id, required, ...rest }: TextareaProps) {
  const autoId = useId();
  const tid = id ?? autoId;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={tid} className={wrapClassName}>
      <textarea id={tid} required={required} rows={2} className={cx(controlBase, 'py-2', className)} {...rest} />
    </FieldWrap>
  );
}

/* ------------------------------------------------------------- Card --- */

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface shadow-sm shadow-gold-900/[0.03]', padded && 'p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon: Icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------- PageHeader --- */

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------------------------------- StatCard --- */

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'gold',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: 'gold' | 'green' | 'blue' | 'rose' | 'slate';
}) {
  const tones = {
    gold: 'bg-gold-50 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    slate: 'bg-stone-100 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300',
  };
  return (
    <Card className="animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className="tabular mt-2 truncate text-2xl font-semibold text-ink">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        {Icon && (
          <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ Badge --- */

type BadgeTone = 'gold' | 'green' | 'amber' | 'red' | 'slate' | 'blue';
export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    gold: 'bg-gold-100 text-gold-800 dark:bg-gold-900/50 dark:text-gold-200',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    slate: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}

/* ------------------------------------------------------------ Table --- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Hide on small screens. */
  hideSm?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  loading,
  onRowClick,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string | number;
  empty?: ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
}) {
  const alignCls = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-full text-sm">
        <thead className="bg-surface-2/70">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(
                  'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap',
                  alignCls(c.align),
                  c.hideSm && 'hidden md:table-cell',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-muted">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx('bg-surface transition-colors', onRowClick && 'cursor-pointer hover:bg-gold-50/60 dark:hover:bg-gold-900/20')}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx('px-3 py-2.5 align-middle text-ink', alignCls(c.align), c.hideSm && 'hidden md:table-cell', c.className)}
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && <tfoot className="border-t border-line bg-surface-2/50">{footer}</tfoot>}
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ Modal --- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'animate-slide-up relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Tabs --- */

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: K; label: ReactNode; icon?: LucideIcon }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="no-print mb-5 -mx-1 overflow-x-auto">
      <div role="tablist" className="inline-flex min-w-full gap-1 rounded-xl border border-line bg-surface-2/60 p-1 sm:min-w-0">
        {tabs.map((tab) => {
          const active = tab.key === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={cx(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all',
                active ? 'bg-surface text-gold-800 shadow-sm dark:text-gold-200' : 'text-muted hover:text-ink',
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Misc ---- */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-gold-600', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-50 text-gold-600 dark:bg-gold-900/30">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function InfoRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export function Alert({ tone = 'info', children, icon: Icon }: { tone?: 'info' | 'warning' | 'error'; children: ReactNode; icon?: LucideIcon }) {
  const tones = {
    info: 'border-gold-200 bg-gold-50 text-gold-900 dark:border-gold-800 dark:bg-gold-900/20 dark:text-gold-100',
    warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100',
    error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100',
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="flex-1">{children}</div>
    </div>
  );
}
