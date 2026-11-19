import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, Lock, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { Alert, Button, Input } from '../components/ui';
import { CREDIT, LanguageToggle, ThemeToggle } from '../components/layout/AppLayout';
import { Guilloche, Medallion } from '../components/login/Medallion';

const INSCRIPTION = 'SMJ Jewellery · Silver · Gold · SMJ Jewellery · Silver · Gold ·';

export default function LoginPage() {
  const { t, te } = useI18n();
  const { user, login } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = await login(email, password);
      notify(t('auth.welcome', { name: u.name }));
      const to = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(to, { replace: true });
    } catch (err) {
      setError(te(err));
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { icon: ShoppingBag, label: t('nav.retail') },
    { icon: Truck, label: t('nav.wholesale') },
    { icon: Boxes, label: t('nav.stock') },
    { icon: BarChart3, label: t('nav.reports') },
  ];

  return (
    <div className="login-page relative flex min-h-screen flex-col overflow-hidden">
      {/* Engraved guilloché background */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <Guilloche dense className="login-bg-rosette h-[115vmax] w-[115vmax] shrink-0" strokeWidth={0.7} />
      </div>

      <header className="relative z-10 flex justify-end gap-2 p-4 sm:px-8">
        <LanguageToggle />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 sm:px-6">
        <div className="login-card grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(43,23,72,0.45)] lg:grid-cols-[1.05fr_1fr]">
          {/* Brand panel */}
          <section className="login-panel relative overflow-hidden px-6 py-10 text-white sm:px-10 sm:py-12 lg:py-14">
            <div className="relative flex h-full flex-col items-center justify-center text-center">
              <Medallion inscription={INSCRIPTION} className="mx-auto h-36 w-36 shrink-0 sm:h-44 sm:w-44 lg:h-52 lg:w-52" />
              <h1 className="login-rise mt-12 font-display text-3xl font-semibold sm:text-4xl [animation-delay:150ms]">{t('app.name')}</h1>
              <p className="login-rise mt-1 text-sm text-white/80 sm:text-base [animation-delay:250ms]">{t('app.tagline')}</p>
              <ul className="mt-8 hidden w-full max-w-sm grid-cols-2 gap-2.5 sm:grid">
                {features.map(({ icon: Icon, label }, i) => (
                  <li
                    key={label}
                    className="login-rise flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-left text-sm text-white/90"
                    style={{ animationDelay: `${350 + i * 100}ms` }}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#f3dc9a]" />
                    <span className="truncate">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Sign-in form */}
          <section className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 lg:py-14">
            <form onSubmit={onSubmit} className="mx-auto w-full max-w-sm">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-gold-200 dark:bg-gold-900/40 dark:text-gold-200 dark:ring-gold-800">
                <Lock className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-3xl font-semibold text-ink">{t('auth.title')}</h2>
              <p className="mt-2 text-sm text-muted">{t('auth.subtitle')}</p>
              <div className="mt-8 space-y-4">
                {error && <Alert tone="error">{error}</Alert>}
                <Input
                  label={t('auth.email')}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  prefix="@"
                />
                <Input
                  label={t('auth.password')}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" size="lg" loading={loading} className="w-full" icon={loading ? undefined : Lock}>
                  {loading ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
              </div>
              <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold-600" />
                {t('auth.secureNote')}
              </p>
            </form>
          </section>
        </div>
      </main>

      <footer className="relative z-10 px-4 py-4 text-center">
        <p className="whitespace-nowrap text-[11px] text-muted sm:text-xs">
          <span className="max-sm:hidden">
            © {new Date().getFullYear()} {t('app.name')} ·{' '}
          </span>
          {CREDIT}
        </p>
      </footer>
    </div>
  );
}
