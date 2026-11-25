import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@/domain/types';
import { intlLocale, LANGUAGE_KEY } from '@/i18n';

export type ThemePreference = 'light' | 'dark' | 'system';
const THEME_KEY = 'rh.theme';

interface Preferences {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
  language: Locale;
  setLanguage: (l: Locale) => void;
  /** BCP-47 tag for Intl formatting (es-CO / en-US). */
  intl: string;
}

const PreferencesContext = createContext<Preferences | null>(null);

function readTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [theme, setThemeState] = useState<ThemePreference>(readTheme);
  const language: Locale = i18n.language === 'en' ? 'en' : 'es';

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1312' : '#0f766e');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // ignore
    }
  }, []);

  const setLanguage = useCallback(
    (l: Locale) => {
      void i18n.changeLanguage(l);
      try {
        localStorage.setItem(LANGUAGE_KEY, l);
      } catch {
        // ignore
      }
    },
    [i18n],
  );

  const value = useMemo(() => ({ theme, setTheme, language, setLanguage, intl: intlLocale(language) }), [theme, setTheme, language, setLanguage]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside <PreferencesProvider>');
  return ctx;
}
