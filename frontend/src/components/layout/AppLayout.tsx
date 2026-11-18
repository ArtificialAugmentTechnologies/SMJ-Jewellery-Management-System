import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  Coins,
  Gem,
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
import { useI18n } from '../../i18n';
import { useAuth, useRate, useTheme } from '../../context/AppProviders';
import { formatMoney } from '../../lib/format';
import { cx } from '../ui';

export function Logo({ size = 40 }: { size?: number }) {
  return <img src="/logo.svg" width={size} height={size} alt="SMJ Jewellery" className="shrink-0" />;
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

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs font-medium" role="group" aria-label="Language">
      {(['en', 'ta'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cx(
            'rounded-md px-2.5 py-1.5 transition-colors',
            lang === l ? 'bg-gold-100 text-gold-800 dark:bg-gold-900/60 dark:text-gold-100' : 'text-muted hover:text-ink',
          )}
        >
          {l === 'en' ? (compact ? 'EN' : 'English') : 'தமிழ்'}
        </button>
      ))}
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
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={40} />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight text-ink">{t('app.name')}</p>
          <p className="truncate text-xs text-muted">{t('app.tagline')}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label={t('nav.menu')}>
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
                  ? 'bg-gold-100/80 text-gold-900 dark:bg-gold-900/40 dark:text-gold-100'
                  : 'text-muted hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-[18px] w-[18px] shrink-0', isActive ? 'text-gold-700 dark:text-gold-300' : '')} />
                <span className="truncate">{t(key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-semibold text-gold-800 dark:bg-gold-900/50 dark:text-gold-200">
            {user?.name?.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="text-xs text-muted">{user ? t(`roles.${user.role}`) : ''}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink" title={t('nav.signOut')} aria-label={t('nav.signOut')}>
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
  return (
    <NavLink to="/gold-rate" className="flex items-center gap-3 rounded-lg border border-gold-200 bg-gold-50/70 px-3 py-1.5 text-xs dark:border-gold-800 dark:bg-gold-900/20">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-gold-500" />
        <span className="hidden text-muted md:inline">{t('rate.gold')}</span>
        <span className="tabular font-semibold text-gold-800 dark:text-gold-200">{formatMoney(rate.goldRatePerGram)}</span>
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className="h-2 w-2 rounded-full bg-stone-400" />
        <span className="hidden text-muted md:inline">{t('rate.silver')}</span>
        <span className="tabular font-semibold text-ink">{formatMoney(rate.silverRatePerGram)}</span>
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
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="animate-slide-up absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-surface shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-muted hover:bg-surface-2"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
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
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
