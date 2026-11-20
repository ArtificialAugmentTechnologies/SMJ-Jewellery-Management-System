import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { api, getToken, setToken } from '../lib/api';
import type { GoldRate, User } from '../lib/types';

/* ---------------------------------------------------------------- Theme ---- */

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('smj.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const value = useMemo(
    () => ({ theme, setTheme: setThemeState, toggle: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside provider');
  return ctx;
}

/* ---------------------------------------------------------------- Toasts --- */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
const ToastContext = createContext<{ notify: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = ++counter.current;
      setToasts((ts) => [...ts.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const tones = {
    success: 'border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
    error: 'border-red-300 dark:border-red-800 text-red-800 dark:text-red-200',
    info: 'border-gold-300 dark:border-gold-800 text-ink',
  };
  return (
    <ToastContext.Provider value={useMemo(() => ({ notify }), [notify])}>
      {children}
      <div className="no-print fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={`animate-slide-up flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-lg ${tones[t.kind]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx.notify;
}

/* ------------------------------------------------------------------ Auth --- */

interface AuthValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Mobile sign-in, second step: exchange the one-time code for a session. */
  loginWithOtp: (mobile: string, otp: string) => Promise<User>;
  logout: () => void;
}
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('smj:unauthorized', onUnauthorized);
    return () => window.removeEventListener('smj:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const loginWithOtp = useCallback(async (mobile: string, otp: string) => {
    const r = await api.post<{ token: string; user: User }>('/auth/otp/verify', { mobile, otp });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAdmin: user?.role === 'admin', login, loginWithOtp, logout }),
    [user, loading, login, loginWithOtp, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

/* ------------------------------------------------------------ Gold rate --- */

interface RateValue {
  rate: GoldRate | null;
  loading: boolean;
  refresh: () => Promise<GoldRate | null>;
}
const RateContext = createContext<RateValue | null>(null);

/** Shares today's rate across the app; billing forms always read the latest value from here. */
export function RateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [rate, setRate] = useState<GoldRate | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ data: GoldRate | null }>('/gold-rates/current');
      setRate(r.data);
      return r.data;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    refresh().catch(() => undefined);
    // Pick up rate changes made on other counters.
    const timer = setInterval(() => refresh().catch(() => undefined), 60_000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  return <RateContext.Provider value={useMemo(() => ({ rate, loading, refresh }), [rate, loading, refresh])}>{children}</RateContext.Provider>;
}

export function useRate() {
  const ctx = useContext(RateContext);
  if (!ctx) throw new Error('useRate outside provider');
  return ctx;
}
