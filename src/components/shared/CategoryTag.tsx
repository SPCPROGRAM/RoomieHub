import { useTranslation } from 'react-i18next';
import type { Category } from '@/domain/types';
import { cn } from '@/lib/cn';
import { paletteOf } from '@/lib/palette';

export function CategoryTag({ category, className }: { category: Category | null | undefined; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', className)}>
      <span className={cn('h-2 w-2 rounded-full', paletteOf(category?.color).dot)} aria-hidden />
      {category?.name ?? t('common.noCategory')}
    </span>
  );
}
