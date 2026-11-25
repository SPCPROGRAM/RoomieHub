import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { upcomingReminders } from '@/domain/calendar';
import { useApartment } from '@/providers/ApartmentProvider';
import { useToast } from '@/providers/ToastProvider';

const FIRED_KEY = 'rh.firedReminders';

/**
 * In-app reminders: while RoomieHub is open, checks every 30 s for calendar reminders that are
 * due and shows a system notification (if permitted) or a toast. Background push while the app
 * is closed would need a push server (see docs/ARCHITECTURE.md).
 */
export function ReminderWatcher() {
  const { t } = useTranslation();
  const { snapshot } = useApartment();
  const toast = useToast();

  useEffect(() => {
    if (!snapshot) return;
    const check = () => {
      const fired = new Set<string>(JSON.parse(sessionStorage.getItem(FIRED_KEY) ?? '[]') as string[]);
      const now = new Date();
      // anything that became due in the last minute (or is due in the next 30 s)
      const due = upcomingReminders(snapshot.events, new Date(now.getTime() - 60_000), 90_000);
      for (const r of due) {
        const key = `${r.event.id}@${r.occursOn}`;
        if (fired.has(key)) continue;
        fired.add(key);
        const text = t('calendar.reminderFired', { title: r.event.title });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('RoomieHub', { body: text, icon: '/pwa-192x192.png', tag: key });
          } catch {
            toast.info(text);
          }
        } else {
          toast.info(text);
        }
      }
      sessionStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-200)));
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [snapshot, t, toast]);

  return null;
}
