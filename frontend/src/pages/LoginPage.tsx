import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useI18n } from '../i18n';
import { useAuth, useToast } from '../context/AppProviders';
import { api } from '../lib/api';
import { digitsOnly } from '../lib/format';
import { Alert, Button, Input } from '../components/ui';
import { CREDIT, LanguageToggle, ThemeToggle } from '../components/layout/AppLayout';
import { Guilloche, Medallion } from '../components/login/Medallion';

type Mode = 'email' | 'mobile';

export default function LoginPage() {
  const { t, te } = useI18n();
  const { user, login, loginWithOtp } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  // The code issued by the server. No SMS gateway is connected, so it is shown on the page (demo mode).
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function done(name: string) {
    notify(t('auth.welcome', { name }));
    const to = (location.state as { from?: string } | null)?.from ?? '/';
    navigate(to, { replace: true });
  }

  async function attempt(fn: () => Promise<void>) {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(te(err));
    } finally {
      setLoading(false);
    }
  }

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    attempt(async () => done((await login(email, password)).name));
  };

  const requestOtp = () => {
    setSending(true);
    attempt(async () => {
      const r = await api.post<{ otp: string }>('/auth/otp/request', { mobile });
      setDemoOtp(r.otp);
      setOtp('');
    }).finally(() => setSending(false));
  };

  const onOtpSubmit = (e: FormEvent) => {
    e.preventDefault();
    attempt(async () => {
      const u = await loginWithOtp(mobile, otp);
      setDemoOtp(null);
      done(u.name);
    });
  };

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setDemoOtp(null);
    setOtp('');
    setPassword('');
  }

  const otpStep = mode === 'mobile' && demoOtp !== null;

  return (
    <div className="login-page relative flex min-h-screen flex-col overflow-hidden">
      {/* Engraved guilloché background */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <Guilloche dense className="login-bg-rosette h-[115vmax] w-[115vmax] shrink-0" strokeWidth={0.7} />
      </div>

      {/* z-30 keeps the language menu above the sign-in card */}
      <header className="relative z-30 flex justify-end gap-2 p-4 sm:px-8">
        <LanguageToggle />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-2 sm:px-6">
        <div className="login-card grid w-full max-w-5xl overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(43,23,72,0.45)] lg:grid-cols-[1.05fr_1fr]">
          {/* Brand panel */}
          <section className="login-panel relative overflow-hidden px-6 py-10 text-white sm:px-10 sm:py-12 lg:py-14">
            <div className="relative flex h-full flex-col items-center justify-center text-center">
              <Medallion className="mx-auto h-36 w-36 shrink-0 sm:h-44 sm:w-44 lg:h-52 lg:w-52" />
              <h1 className="login-rise mt-12 font-display text-3xl font-semibold sm:text-4xl [animation-delay:150ms]">{t('app.name')}</h1>
              <p className="login-rise mt-1 text-sm text-white/80 sm:text-base [animation-delay:250ms]">{t('app.tagline')}</p>
              <figure className="login-rise mt-8 flex w-full max-w-sm items-center gap-3 [animation-delay:400ms]">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#f3dc9a]/70" />
                <blockquote className="max-w-[17rem] font-display text-base italic leading-snug text-[#f3dc9a] sm:text-lg">
                  “{t('auth.quote')}”
                </blockquote>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#f3dc9a]/70" />
              </figure>
            </div>
          </section>

          {/* Sign-in form */}
          <section className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 lg:py-14">
            <div className="mx-auto w-full max-w-sm">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 text-gold-700 ring-1 ring-gold-200 dark:bg-gold-900/40 dark:text-gold-200 dark:ring-gold-800">
                {mode === 'email' ? <Lock className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
              </span>
              <h2 className="mt-4 font-display text-3xl font-semibold text-ink">{t('auth.title')}</h2>
              <p className="mt-2 text-sm text-muted">{mode === 'email' ? t('auth.subtitle') : t('auth.otpHint')}</p>

              {mode === 'email' && (
                <form onSubmit={onEmailSubmit} className="mt-8 space-y-4">
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
                </form>
              )}

              {mode === 'mobile' && (
                <form onSubmit={onOtpSubmit} className="mt-8 space-y-4">
                  {error && <Alert tone="error">{error}</Alert>}
                  <div className="flex items-end gap-2">
                    <Input
                      label={t('auth.mobile')}
                      prefix="+91"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      required
                      maxLength={10}
                      placeholder="10-digit mobile"
                      value={mobile}
                      onChange={(e) => {
                        setMobile(digitsOnly(e.target.value).slice(0, 10));
                        // A code belongs to the number it was sent to.
                        setDemoOtp(null);
                        setOtp('');
                      }}
                      wrapClassName="min-w-0 flex-1"
                    />
                    <Button
                      variant={otpStep ? 'outline' : 'secondary'}
                      onClick={() => requestOtp()}
                      loading={sending}
                      disabled={mobile.length !== 10 || loading}
                      className="h-10 shrink-0 whitespace-nowrap"
                    >
                      {sending ? t('auth.sendingOtp') : otpStep ? t('auth.resend') : t('auth.sendOtp')}
                    </Button>
                  </div>
                  {otpStep && <p className="animate-fade-in -mt-2 text-xs text-emerald-600 dark:text-emerald-400">{t('auth.otpSent', { mobile })}</p>}
                  <Input
                    label={t('auth.otp')}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    disabled={!otpStep}
                    maxLength={6}
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(digitsOnly(e.target.value).slice(0, 6))}
                    className="tabular text-center text-lg font-semibold tracking-[0.5em] placeholder:text-sm placeholder:font-normal placeholder:tracking-[0.3em]"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    loading={loading && !sending}
                    disabled={!otpStep || otp.length !== 6}
                    className="w-full"
                    icon={loading ? undefined : KeyRound}
                  >
                    {loading && !sending ? t('auth.signingIn') : t('auth.verify')}
                  </Button>
                  {/* Demo one-time code (no SMS gateway connected) */}
                  {otpStep && (
                    <p className="animate-fade-in text-center text-xs text-emerald-600 dark:text-emerald-400">
                      {t('auth.demoOtp')}: <span className="tabular font-semibold tracking-widest">{demoOtp}</span>
                    </p>
                  )}
                </form>
              )}

              {/* Login another way */}
              <div className="mt-7">
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="h-px flex-1 bg-line" />
                  {t('auth.otherWay')}
                  <span className="h-px flex-1 bg-line" />
                </div>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  icon={mode === 'email' ? Smartphone : Mail}
                  onClick={() => switchMode(mode === 'email' ? 'mobile' : 'email')}
                >
                  {mode === 'email' ? t('auth.withMobile') : t('auth.withEmail')}
                </Button>
              </div>

              <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold-600" />
                {t('auth.secureNote')}
              </p>
            </div>
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
