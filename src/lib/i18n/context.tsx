'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type Dict, type DictKey } from './en';
import { ar } from './ar';
import type { Lang } from '@/types/database.types';

const DICTS: Record<Lang, Dict> = { en, ar };
const STORAGE_KEY = 'salah-lang';

type I18nValue = {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'ar' || raw === 'en') return raw;
  } catch {
    /* ignore */
  }
  return 'en';
}

function applyDocument(lang: Lang) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredLang();
    setLangState(stored);
    applyDocument(stored);
    setHydrated(true);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    applyDocument(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => {
      const dict = DICTS[lang] ?? en;
      let text: string = dict[key] ?? en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [lang]
  );

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t,
      setLang,
    }),
    [lang, t, setLang]
  );

  // Avoid flashing wrong language on first paint after hydrate.
  if (!hydrated) {
    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
