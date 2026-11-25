import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@/domain/types';
import en from './locales/en';
import es from './locales/es';

export const LANGUAGE_KEY = 'rh.lang';

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'es';
  return nav.toLowerCase().startsWith('en') ? 'en' : 'es';
}

/** BCP-47 tag used for number/date formatting. */
export function intlLocale(lang: string): string {
  return lang === 'en' ? 'en-US' : 'es-CO';
}

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: detectLocale(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

export default i18n;
