import type { ReactNode } from 'react';
import { CalendarDays, ListChecks, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Logo } from '@/components/brand/Logo';
import { LanguageSwitch, ThemeSwitch } from '@/components/layout/PreferenceControls';

export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  const features = [
    { icon: ListChecks, text: t('chores.subtitle') },
    { icon: Wallet, text: t('finances.subtitle') },
    { icon: CalendarDays, text: t('calendar.subtitle') },
  ];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-900 p-12 text-brand-50 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <Logo className="[&>span:last-child]:text-white" />
        </div>
        <div className="relative max-w-md">
          <p className="text-4xl font-semibold leading-tight tracking-tight text-white">{t('app.tagline')}</p>
          <ul className="mt-10 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-brand-100">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200/70">RoomieHub</p>
      </section>

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeSwitch className="hidden sm:inline-flex" />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </div>
      </section>
    </div>
  );
}
