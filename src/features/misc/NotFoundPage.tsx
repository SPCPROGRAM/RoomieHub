import { Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui/Feedback';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState
        icon={<Compass className="h-6 w-6" />}
        title={t('errors.notFoundPage')}
        action={
          <Link to="/" className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            {t('errors.goHome')}
          </Link>
        }
      />
    </div>
  );
}
