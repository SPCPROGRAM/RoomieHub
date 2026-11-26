import { Bot, Code2, ExternalLink, Heart, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '@/components/brand/Logo';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { APP_VERSION, CHANGELOG, CREDITS } from '@/config/changelog';
import { formatDate } from '@/domain/dates';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferences } from '@/providers/PreferencesProvider';

export default function AboutPage() {
  const { t } = useTranslation();
  const { intl, language } = usePreferences();
  const { mode } = useAuth();

  return (
    <>
      <PageHeader title={t('about.title')} />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-col items-center bg-brand-900 px-6 py-8 text-center text-white">
              <LogoMark className="h-16 w-16" />
              <p className="mt-4 text-xl font-semibold tracking-tight">RoomieHub</p>
              <p className="mt-1 text-sm text-brand-100">{t('app.tagline')}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="tabular rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{t('about.version', { version: APP_VERSION })}</span>
                {CHANGELOG[0]?.channel === 'beta' && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-bold uppercase text-amber-950">Beta</span>}
              </div>
            </div>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  <Code2 className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs text-muted">{t('about.madeBy')}</p>
                  <p className="text-[15px] font-semibold">{CREDITS.author}</p>
                </div>
              </div>
              <a href={CREDITS.github} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-sunken">
                <ExternalLink className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">{t('about.github')}</span>
                  <span className="block truncate font-medium">{CREDITS.github.replace('https://', '')}</span>
                </span>
              </a>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                  <Bot className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs text-muted">{t('about.coDeveloper')}</p>
                  <p className="text-[15px] font-semibold">{CREDITS.coDeveloper}</p>
                </div>
              </div>
              <p className="text-xs text-muted">{t('about.coDeveloperNote', { author: CREDITS.author })}</p>
              <p className="flex items-start gap-2 text-sm text-muted">
                <Heart className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                {t('about.credits', { author: CREDITS.author })}
              </p>
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t('about.betaNote', { author: CREDITS.author })}</p>
              <p className="text-xs text-subtle">
                {t('settings.mode')}: {mode === 'supabase' ? t('settings.modeSupabase') : t('settings.modeDemo')}
              </p>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title={t('about.whatsNew')} icon={<Sparkles className="h-4.5 w-4.5" />} />
          <CardBody>
            <ol className="space-y-6">
              {CHANGELOG.map((release, i) => (
                <li key={release.version} className="relative border-l-2 border-line pl-5">
                  <span className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-line'}`} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="tabular text-[15px] font-semibold">v{release.version}</h2>
                    {release.channel === 'beta' && <Badge tone="warning">Beta</Badge>}
                    {i === 0 && <Badge tone="brand">{t('about.current')}</Badge>}
                    <span className="text-xs text-muted">{t('about.released', { date: formatDate(release.date, intl, { dateStyle: 'long' }) })}</span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {release.changes[language].map((change) => (
                      <li key={change} className="flex gap-2 text-sm text-ink">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                        {change}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
