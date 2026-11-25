import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Toggle } from '@/components/ui/Field';
import { env } from '@/config/env';
import type { Household } from '@/hooks/useHousehold';
import { currentPushSubscription, pushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';

type DeviceState = 'checking' | 'on' | 'off';

export function NotificationsCard({ h }: { h: Household }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { profile, refreshProfile } = useAuth();
  const [device, setDevice] = useState<DeviceState>('checking');
  const [busy, setBusy] = useState(false);

  const available = h.mode === 'supabase' && Boolean(env.vapidPublicKey) && pushSupported();

  useEffect(() => {
    if (!available) return setDevice('off');
    currentPushSubscription()
      .then((s) => setDevice(s ? 'on' : 'off'))
      .catch(() => setDevice('off'));
  }, [available]);

  const enable = async () => {
    setBusy(true);
    const r = await h.run(async (repo) => {
      const keys = await subscribeToPush(env.vapidPublicKey);
      await repo.savePushSubscription({ ...keys, userAgent: navigator.userAgent });
      return repo.sendTestNotification();
    });
    if (r.ok) {
      setDevice('on');
      toast.success(t('settings.notifications.enabledToast'));
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    const r = await h.run(async (repo) => {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await repo.deletePushSubscription(endpoint);
    });
    if (r.ok) setDevice('off');
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    const r = await h.run((repo) => repo.sendTestNotification());
    if (r.ok) toast.success(r.value > 0 ? t('settings.notifications.testSent') : t('settings.notifications.noDevices'));
    setBusy(false);
  };

  const setPref = (field: 'notify_daily' | 'notify_due' | 'notify_damage', value: boolean) =>
    h.run(async (repo) => {
      await repo.updateProfile(h.userId, { [field]: value });
      await refreshProfile();
    });

  return (
    <Card>
      <CardHeader title={t('settings.notifications.title')} subtitle={t('settings.notifications.subtitle')} icon={<Bell className="h-4.5 w-4.5" />} />
      <CardBody className="space-y-5">
        {h.mode === 'demo' ? (
          <Alert tone="info">{t('errors.demo_no_push')}</Alert>
        ) : !env.vapidPublicKey ? (
          <Alert tone="info">{t('settings.notifications.notConfigured')}</Alert>
        ) : !pushSupported() ? (
          <Alert tone="warning">{t('settings.notifications.unsupported')}</Alert>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {device === 'on' ? (
                <>
                  <Button variant="secondary" icon={<BellOff className="h-4 w-4" />} loading={busy} disabled={!h.canWrite} onClick={() => void disable()}>
                    {t('settings.notifications.disable')}
                  </Button>
                  <Button variant="soft" icon={<Send className="h-4 w-4" />} disabled={busy || !h.canWrite} onClick={() => void test()}>
                    {t('settings.notifications.test')}
                  </Button>
                </>
              ) : (
                <Button icon={<Bell className="h-4 w-4" />} loading={busy || device === 'checking'} disabled={!h.canWrite} onClick={() => void enable()}>
                  {t('settings.notifications.enable')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{device === 'on' ? t('settings.notifications.deviceOn') : t('settings.notifications.deviceOff')}</p>
          </div>
        )}

        <div className="space-y-4 border-t border-line pt-5">
          <Toggle
            checked={profile?.notify_daily !== false}
            disabled={!available || !h.canWrite}
            onChange={(v) => void setPref('notify_daily', v)}
            label={t('settings.notifications.daily')}
            description={t('settings.notifications.dailyHint')}
          />
          <Toggle
            checked={profile?.notify_due !== false}
            disabled={!available || !h.canWrite}
            onChange={(v) => void setPref('notify_due', v)}
            label={t('settings.notifications.due')}
            description={t('settings.notifications.dueHint')}
          />
          <Toggle
            checked={profile?.notify_damage !== false}
            disabled={!available || !h.canWrite}
            onChange={(v) => void setPref('notify_damage', v)}
            label={t('settings.notifications.damage')}
            description={t('settings.notifications.damageHint')}
          />
        </div>
      </CardBody>
    </Card>
  );
}
