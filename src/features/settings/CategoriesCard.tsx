import { useState } from 'react';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { categorySchema } from '@/domain/schemas';
import { PALETTE, type CategoryScope, type PaletteColor } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { features } from '@/config/features';
import { cn } from '@/lib/cn';
import { paletteOf } from '@/lib/palette';

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: PaletteColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition-shadow', paletteOf(c).dot, value === c && 'ring-2 ring-ink')}
        />
      ))}
    </div>
  );
}

export function CategoriesCard({ h }: { h: Household }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const scopes = (['chore', 'expense', 'shopping'] as const).filter((s) => s === 'chore' || (s === 'expense' ? features.finances : features.shopping));
  const [scope, setScope] = useState<CategoryScope>(scopes[0] ?? 'chore');
  const [name, setName] = useState('');
  const [color, setColor] = useState<PaletteColor>('teal');
  const [error, setError] = useState<string | null>(null);
  const list = h.categoriesOf(scope);

  const add = async () => {
    const parsed = categorySchema.safeParse({ name, color });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'validation.required');
    setError(null);
    const r = await h.run((repo) => repo.createCategory(h.snap.apartment.id, { scope, name: parsed.data.name, color }));
    if (r.ok) setName('');
  };

  return (
    <Card>
      <CardHeader title={t('settings.categories')} icon={<Tags className="h-4.5 w-4.5" />} />
      <CardBody className="space-y-4">
        {scopes.length > 1 && (
        <Segmented
          label={t('settings.categories')}
          value={scope}
          onChange={setScope}
          options={scopes.map((s) => ({ value: s, label: t(`settings.categoryScopes.${s}`) }))}
        />
        )}
        <ul className="space-y-1.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-sunken/60">
              <button
                type="button"
                className={cn('h-4 w-4 shrink-0 rounded-full', paletteOf(c.color).dot)}
                title={t('settings.color')}
                aria-label={t('settings.color')}
                disabled={!h.canWrite}
                onClick={() => {
                  const next = PALETTE[(PALETTE.indexOf(c.color) + 1) % PALETTE.length]!;
                  void h.run((repo) => repo.updateCategory(c.id, { color: next }));
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-rose-600"
                disabled={!h.canWrite}
                aria-label={t('common.delete')}
                onClick={async () => {
                  if (await confirm({ title: t('common.delete'), message: t('settings.deleteCategoryConfirm'), danger: true, confirmLabel: t('common.delete') })) {
                    await h.run((repo) => repo.deleteCategory(c.id));
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.newCategory')} aria-label={t('settings.categoryName')} maxLength={40} aria-invalid={Boolean(error)} />
            <Button size="icon" className="h-11 w-11" onClick={() => void add()} disabled={!h.canWrite || !name.trim()} aria-label={t('common.add')}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          {error && <p className="text-xs text-rose-600">{t(error)}</p>}
          <ColorPicker value={color} onChange={setColor} label={t('settings.color')} />
        </div>
      </CardBody>
    </Card>
  );
}
