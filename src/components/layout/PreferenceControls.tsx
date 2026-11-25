import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { usePreferences, type ThemePreference } from '@/providers/PreferencesProvider';

export function ThemeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, setTheme } = usePreferences();
  const options: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: t('theme.light') },
    { value: 'dark', icon: Moon, label: t('theme.dark') },
    { value: 'system', icon: Monitor, label: t('theme.system') },
  ];
  return (
    <div role="radiogroup" aria-label={t('theme.label')} className={cn('inline-flex rounded-xl bg-sunken p-1', className)}>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={cn('grid h-8 w-9 place-items-center rounded-lg transition-colors', theme === value ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink')}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = usePreferences();
  return (
    <div role="radiogroup" aria-label={t('language.label')} className={cn('inline-flex items-center gap-1 rounded-xl bg-sunken p-1', className)}>
      <Languages className="mx-1.5 h-4 w-4 text-subtle" aria-hidden />
      {(['es', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={language === l}
          onClick={() => setLanguage(l)}
          className={cn('h-8 rounded-lg px-2.5 text-xs font-semibold uppercase transition-colors', language === l ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink')}
          title={t(`language.${l}`)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
