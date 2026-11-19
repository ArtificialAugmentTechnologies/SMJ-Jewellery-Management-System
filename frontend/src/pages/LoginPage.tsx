import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { Alert, Button, Input } from '../components/ui';
import { LanguageToggle, Logo, ThemeToggle } from '../components/layout/AppLayout';

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

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <div className="gold-gradient absolute inset-0" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #fff 0, transparent 35%), radial-gradient(circle at 80% 70%, #e9ddff 0, transparent 40%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <span className="font-display text-2xl font-semibold">{t('app.name')}</span>
          </div>
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight">{t('app.tagline')}</h1>
            <p className="mt-4 max-w-md text-white/85">
              {t('nav.retail')} · {t('nav.wholesale')} · {t('nav.stock')} · {t('nav.reports')}
            </p>
          </div>
          <p className="text-sm text-white/75">© {new Date().getFullYear()} {t('app.name')}</p>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end gap-2 p-4">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <form onSubmit={onSubmit} className="animate-slide-up w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <Logo size={64} />
              <p className="mt-3 font-display text-2xl font-semibold text-ink">{t('app.name')}</p>
            </div>
            <h2 className="font-display text-3xl font-semibold text-ink">{t('auth.title')}</h2>
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
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-4 w-4 text-gold-600" />
              {t('auth.secureNote')}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
