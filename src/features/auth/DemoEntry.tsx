import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { env } from '@/config/env';
import { useAuth } from '@/providers/AuthProvider';
import { DEMO_USERS } from '@/services/demoSeed';

/** "Explore the demo": signs in as one of three fictitious roomies, data stays in this browser. */
export function DemoEntry() {
  const { t } = useTranslation();
  const { enterDemo } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!env.demoEnabled) return null;
  return (
    <>
      <Button variant="secondary" block icon={<FlaskConical className="h-4 w-4" />} onClick={() => setOpen(true)}>
        {t('demo.explore')}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('demo.explore')} description={t('demo.banner')} size="sm">
        <p className="mb-3 text-sm font-medium">{t('demo.chooseRoomie')}</p>
        <ul className="space-y-2">
          {DEMO_USERS.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-brand-400 hover:bg-sunken"
                onClick={async () => {
                  await enterDemo(u.id);
                  setOpen(false);
                  navigate('/', { replace: true });
                }}
              >
                <Avatar name={u.display_name} color={u.avatar_color} />
                <span className="font-medium">{u.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
