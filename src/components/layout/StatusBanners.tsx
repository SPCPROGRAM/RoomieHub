import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FlaskConical, RefreshCw, RotateCcw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRelative } from '@/domain/dates';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferences } from '@/providers/PreferencesProvider';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '../ui/Button';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { intl } = usePreferences();
  const { online, fromCache, snapshot } = useApartment();
  const { mode } = useAuth();
  if (mode === 'demo' || (online && !fromCache)) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {t('offline.banner')}
        {snapshot && <span className="ml-1 opacity-75">{t('offline.lastSync', { when: formatRelative(snapshot.fetchedAt, intl) })}</span>}
      </span>
    </div>
  );
}

export function DemoBanner() {
  const { t } = useTranslation();
  const { mode, resetDemo, exitDemo } = useAuth();
  const { refresh } = useApartment();
  const toast = useToast();
  if (mode !== 'demo') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-violet-100 px-4 py-2 text-xs font-medium text-violet-900 dark:bg-violet-500/15 dark:text-violet-200">
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t('demo.banner')}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
        onClick={() => {
          resetDemo();
          void refresh();
          toast.success(t('demo.resetDone'));
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {t('demo.reset')}
      </button>
      <button type="button" className="underline-offset-2 hover:underline" onClick={() => void exitDemo()}>
        {t('demo.exit')}
      </button>
    </div>
  );
}

/** Service-worker lifecycle: offers to reload when a new version is ready. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // look for new versions every hour while the app stays open
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast.info(t('pwa.offlineReady'));
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast, t]);

  if (!needRefresh) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-sm animate-slide-up items-center gap-3 rounded-2xl border border-line bg-elevated px-4 py-3 text-sm shadow-float lg:bottom-6 lg:left-auto lg:right-6">
      <RefreshCw className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
      <span className="flex-1">{t('pwa.updateAvailable')}</span>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        {t('pwa.update')}
      </Button>
      <button type="button" className="text-xs text-muted" onClick={() => setNeedRefresh(false)}>
        {t('common.close')}
      </button>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install app" button shown when the browser allows installing the PWA (Android Chrome, desktop). */
export function InstallButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!event) return null;
  return (
    <Button
      variant="soft"
      size="sm"
      className={className}
      title={t('pwa.installHint')}
      onClick={async () => {
        await event.prompt();
        await event.userChoice;
        setEvent(null);
      }}
    >
      {t('pwa.install')}
    </Button>
  );
}
