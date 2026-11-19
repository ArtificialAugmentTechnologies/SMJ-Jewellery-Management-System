import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en';
import ta from './ta';
import hi from './hi';

export type Lang = 'en' | 'ta' | 'hi';
export const LANGS: Lang[] = ['en', 'hi', 'ta'];
const dictionaries = { en, ta, hi } as const;
const STORAGE_KEY = 'smj.lang';

type Vars = Record<string, string | number>;

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
  /** Translates an API error code (errors.<code>) with a fallback message. */
  te: (err: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ta' || saved === 'hi') return saved;
  } catch {
    /* ignore */
  }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => interpolate(lookup(dictionaries[lang], key) ?? lookup(en, key) ?? key, vars),
    [lang],
  );

  const te = useCallback(
    (err: unknown) => {
      const e = err as { code?: string; message?: string };
      if (e?.code) {
        const translated = lookup(dictionaries[lang], `errors.${e.code}`);
        // Validation messages carry field-specific detail; show it in English mode.
        if (e.code === 'validation_error' && lang === 'en' && e.message) return e.message;
        if (translated) return translated;
      }
      return e?.message || t('errors.server_error');
    },
    [lang, t],
  );

  const value = useMemo(() => ({ lang, setLang, t, te }), [lang, setLang, t, te]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
