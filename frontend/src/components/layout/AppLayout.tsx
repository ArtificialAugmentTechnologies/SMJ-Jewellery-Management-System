import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  Coins,
  Gem,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Settings,
  ShoppingBag,
  Sun,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { LANGS, useI18n, type Lang } from '../../i18n';
import { useAuth, useRate, useTheme } from '../../context/AppProviders';
import { formatMoney } from '../../lib/format';
import { cx } from '../ui';
import { DailyRateReminder, OPEN_RATE_REMINDER_EVENT, isRateStale } from './DailyRateReminder';

/** Developer credit shown in the sidebar and on the login page (not translated: it is a company name). */
export const CREDIT = 'Created by Artificial Augment Technologies';

export function Logo({ size = 40 }: { size?: number }) {
  return <img src="/logo-mark.png" width={size} height={size} alt="SMJ Jewellery" className="shrink-0 rounded-lg object-cover" />;
}

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/retail', key: 'nav.retail', icon: ShoppingBag },
  { to: '/wholesale', key: 'nav.wholesale', icon: Truck },
  { to: '/customers', key: 'nav.customers', icon: Users },
  { to: '/products', key: 'nav.products', icon: Gem },
  { to: '/stock', key: 'nav.stock', icon: Boxes },
  { to: '/gold-rate', key: 'nav.goldRate', icon: Coins },
  { to: '/billing', key: 'nav.billing', icon: Receipt },
  { to: '/reports', key: 'nav.reports', icon: BarChart3 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
];

const LANG_LABELS: Record<Lang, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
};

/** Language dropdown listing every supported language. */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('common.language')}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
      >
        <Languages className="h-4 w-4 text-gold-600 dark:text-gold-300" />
        <span className={compact ? 'max-sm:hidden' : undefined}>{LANG_LABELS[lang].native}</span>
        <ChevronDown className={cx('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('common.language')}
          className="animate-fade-in absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-xl shadow-black/10"
        >
          {LANGS.map((l) => (
            <li key={l} role="option" aria-selected={lang === l}>
              <button
                type="button"
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  lang === l ? 'bg-gold-50 text-gold-800 dark:bg-gold-900/40 dark:text-gold-100' : 'text-ink hover:bg-surface-2',
                )}
              >
                <span className="font-medium">{LANG_LABELS[l].native}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  {l !== 'en' && LANG_LABELS[l].english}
                  {lang === l && <Check className="h-4 w-4 text-gold-600 dark:text-gold-300" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      onClick={toggle}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
      aria-label={theme === 'dark' ? t('common.light') : t('common.dark')}
      title={theme === 'dark' ? t('common.light') : t('common.dark')}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <Logo size={40} />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight text-white">{t('app.name')}</p>
          <p className="truncate text-xs text-white/70">{t('app.tagline')}</p>
        </div>
      </div>
      <div className="glow-line glow-line-light" aria-hidden />
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label={t('nav.menu')}>
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/25'
                  : 'text-white/75 hover:bg-white/10 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-[18px] w-[18px] shrink-0', isActive ? 'text-white' : '')} />
                <span className="truncate">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <p className="whitespace-nowrap px-3 pb-3 text-center text-[10px] tracking-tight text-white/60">{CREDIT}</p>
      <div className="border-t border-white/15 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
            {user?.name?.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-xs text-white/70">{user ? t(`roles.${user.role}`) : ''}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white" title={t('nav.signOut')} aria-label={t('nav.signOut')}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RatePill() {
  const { rate } = useRate();
  const { t } = useI18n();
  if (!rate) {
    return (
      <NavLink to="/gold-rate" className="hidden rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 sm:block dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        {t('rate.todayGold')}: {t('rate.notSet')}
      </NavLink>
    );
  }
  if (isRateStale(rate)) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_RATE_REMINDER_EVENT))}
        className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span className="max-sm:hidden">{t('reminder.due')}</span>
        <span className="tabular sm:hidden">{formatMoney(rate.silverRatePerGram)}</span>
      </button>
    );
  }
  return (
    <NavLink to="/gold-rate" className="flex items-center gap-3 rounded-lg border border-gold-200 bg-gold-50/70 px-3 py-1.5 text-xs dark:border-gold-800 dark:bg-gold-900/20">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-stone-400" />
        <span className="hidden text-muted md:inline">{t('rate.silver')}</span>
        <span className="tabular font-semibold text-gold-800 dark:text-gold-200">{formatMoney(rate.silverRatePerGram)}</span>
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="hidden text-muted md:inline">{t('rate.gold')}</span>
        <span className="tabular font-semibold text-ink">{formatMoney(rate.goldRatePerGram)}</span>
      </span>
    </NavLink>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 sidebar-gradient lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="animate-slide-up absolute inset-y-0 left-0 w-72 max-w-[85vw] sidebar-gradient shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 bg-bg/85 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink lg:hidden"
              aria-label={t('nav.menu')}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <Logo size={28} />
              <span className="font-display font-semibold text-ink max-[380px]:hidden">SMJ</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <RatePill />
              <LanguageToggle compact />
              <ThemeToggle />
            </div>
          </div>
          <div className="glow-line glow-line-brand" aria-hidden />
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
        <DailyRateReminder />
      </div>
    </div>
  );
}
