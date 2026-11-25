import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, History, Pencil, Plus, Receipt, RotateCcw, ShoppingBasket, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { CategoryTag } from '@/components/shared/CategoryTag';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { formatRelative } from '@/domain/dates';
import { formatAmountPlain, parseMoneyInput } from '@/domain/money';
import { shoppingSchema, type ShoppingValues } from '@/domain/schemas';
import type { ShoppingItem } from '@/domain/types';
import { useHousehold, type Household } from '@/hooks/useHousehold';
import { cn } from '@/lib/cn';

function formatQty(q: number, intl: string) {
  return new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(q);
}

function ItemSheet({ h, open, onClose, item }: { h: Household; open: boolean; onClose: () => void; item: ShoppingItem | null }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState } = useForm<ShoppingValues>({ resolver: zodResolver(shoppingSchema) });

  useEffect(() => {
    if (!open) return;
    reset({
      name: item?.name ?? '',
      quantity: item ? String(item.quantity) : '1',
      unit: item?.unit ?? '',
      categoryId: item?.category_id ?? '',
      assignedTo: item?.assigned_to ?? '',
      estimatedPrice: item?.estimated_price ? formatAmountPlain(item.estimated_price, h.intl) : '',
      notes: item?.notes ?? '',
    });
  }, [open, item, reset, h.intl]);

  const onSubmit = handleSubmit(async (v) => {
    const input = {
      name: v.name.trim(),
      quantity: Number(v.quantity.replace(',', '.')),
      unit: v.unit.trim() || null,
      category_id: v.categoryId || null,
      assigned_to: v.assignedTo || null,
      estimated_price: v.estimatedPrice ? parseMoneyInput(v.estimatedPrice) : null,
      notes: v.notes.trim() || null,
    };
    const r = await h.run((repo) => (item ? repo.updateShoppingItem(item.id, input) : repo.createShoppingItem(h.snap.apartment.id, input)), { success: t('shopping.saved') });
    if (r.ok) onClose();
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item ? t('shopping.editItem') : t('shopping.newItem')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="shopping-form" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="shopping-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('shopping.name')} error={formState.errors.name?.message}>
          {(p) => <Input {...p} placeholder={t('shopping.namePlaceholder')} {...register('name')} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('shopping.quantity')} error={formState.errors.quantity?.message}>
            {(p) => <Input {...p} inputMode="decimal" {...register('quantity')} />}
          </Field>
          <Field label={t('shopping.unit')} optional error={formState.errors.unit?.message}>
            {(p) => <Input {...p} placeholder={t('shopping.unitPlaceholder')} {...register('unit')} />}
          </Field>
          <Field label={t('common.category')}>
            {(p) => (
              <Select {...p} {...register('categoryId')}>
                <option value="">{t('common.noCategory')}</option>
                {h.categoriesOf('shopping').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('shopping.assignedTo')}>
            {(p) => (
              <Select {...p} {...register('assignedTo')}>
                <option value="">{t('common.nobody')}</option>
                {h.orderedMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {h.fullNameOf(m.user_id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t('shopping.estimatedPrice')} optional error={formState.errors.estimatedPrice?.message}>
          {(p) => <MoneyInput {...p} currency={h.snap.apartment.currency} locale={h.intl} {...register('estimatedPrice')} />}
        </Field>
        <Field label={t('shopping.notes')} optional error={formState.errors.notes?.message}>
          {(p) => <Textarea {...p} {...register('notes')} />}
        </Field>
      </form>
    </Sheet>
  );
}

export default function ShoppingPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState('');

  const pending = h.snap.shopping.filter((i) => i.status === 'pending');
  const purchased = h.snap.shopping.filter((i) => i.status === 'purchased').sort((a, b) => (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''));
  const estimate = pending.reduce((s, i) => s + (i.estimated_price ?? 0), 0);

  // group pending items by category for faster shopping in the store
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of pending) {
    const key = item.category_id ?? '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const quickAdd = async () => {
    const name = quick.trim();
    if (!name) return;
    const r = await h.run((repo) =>
      repo.createShoppingItem(h.snap.apartment.id, { name: name.slice(0, 80), quantity: 1, unit: null, category_id: null, assigned_to: null, estimated_price: null, notes: null }),
    );
    if (r.ok) setQuick('');
  };

  const remove = async (item: ShoppingItem) => {
    if (await confirm({ title: t('common.delete'), message: t('shopping.deleteConfirm'), danger: true, confirmLabel: t('common.delete') })) {
      await h.run((repo) => repo.deleteShoppingItem(item.id));
    }
  };

  const row = (item: ShoppingItem) => {
    const assignee = item.assigned_to ? h.memberById.get(item.assigned_to) : undefined;
    const done = item.status === 'purchased';
    return (
      <li key={item.id} className="group flex items-center gap-3 py-3">
        <button
          type="button"
          aria-label={done ? t('shopping.markPending') : t('shopping.markPurchased')}
          aria-pressed={done}
          disabled={!h.canWrite}
          onClick={() => void h.run((repo) => repo.setPurchased(item, !done, h.userId))}
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition-all active:scale-90 disabled:opacity-40',
            done ? 'border-brand-500 bg-brand-500 text-white' : 'border-line text-transparent hover:border-brand-400 hover:text-brand-400',
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium', done && 'text-muted')}>
            {item.name}
            <span className="tabular ml-2 text-sm font-normal text-muted">
              {formatQty(item.quantity, h.intl)} {item.unit ?? ''}
            </span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {done ? (
              <span>{t('shopping.purchasedBy', { name: h.nameOf(item.purchased_by), when: item.purchased_at ? formatRelative(item.purchased_at, h.intl) : '' })}</span>
            ) : (
              <>
                {item.estimated_price ? <span className="tabular">{h.money(item.estimated_price)}</span> : null}
                {item.notes && <span className="truncate">{item.notes}</span>}
              </>
            )}
          </div>
        </div>
        {!done && assignee && <Avatar name={assignee.profile.display_name} color={assignee.profile.avatar_color} size="sm" />}
        <div className="flex gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {done ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!h.canWrite}
              title={t('shopping.buyAgain')}
              aria-label={t('shopping.buyAgain')}
              onClick={() =>
                void h.run((repo) =>
                  repo.createShoppingItem(h.snap.apartment.id, {
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    category_id: item.category_id,
                    assigned_to: null,
                    estimated_price: item.estimated_price,
                    notes: null,
                  }),
                )
              }
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!h.canWrite} onClick={() => { setEditing(item); setOpen(true); }} aria-label={t('common.edit')}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-rose-600" disabled={!h.canWrite} onClick={() => void remove(item)} aria-label={t('common.delete')}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t('shopping.title')}
        subtitle={t('shopping.subtitle')}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => { setEditing(null); setOpen(true); }}>
            {t('shopping.newItem')}
          </Button>
        }
      />
      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void quickAdd();
        }}
      >
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('shopping.quickAdd')} aria-label={t('shopping.quickAdd')} maxLength={80} disabled={!h.canWrite} />
        <Button type="submit" size="icon" className="h-11 w-11" disabled={!h.canWrite || !quick.trim()} aria-label={t('common.add')}>
          <Plus className="h-5 w-5" />
        </Button>
      </form>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label={t('shopping.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: t('shopping.pending'), count: pending.length },
            { value: 'history', label: t('shopping.history'), count: purchased.length },
          ]}
        />
        {tab === 'pending' && estimate > 0 && <span className="tabular text-sm text-muted">{t('shopping.estimatedTotal', { amount: h.money(estimate) })}</span>}
      </div>

      {tab === 'pending' &&
        (pending.length === 0 ? (
          <Card>
            <EmptyState icon={<ShoppingBasket className="h-6 w-6" />} title={t('shopping.empty')} hint={t('shopping.emptyHint')} />
          </Card>
        ) : (
          <div className="space-y-4">
            {[...groups].map(([catId, items]) => (
              <Card key={catId || 'none'}>
                <CardBody className="py-2">
                  <CategoryTag category={catId ? h.categoryById.get(catId) : null} className="mt-2 font-semibold uppercase tracking-wider" />
                  <ul className="divide-y divide-line">{items.map(row)}</ul>
                </CardBody>
              </Card>
            ))}
          </div>
        ))}

      {tab === 'history' && (
        <Card>
          <CardBody className="py-2">
            {purchased.length === 0 ? (
              <EmptyState compact icon={<History className="h-5 w-5" />} title={t('shopping.noHistory')} />
            ) : (
              <>
                <ul className="divide-y divide-line">{purchased.slice(0, 100).map(row)}</ul>
                <div className="border-t border-line py-3">
                  <Button variant="soft" size="sm" icon={<Receipt className="h-4 w-4" />} onClick={() => navigate('/finances?new=1')} disabled={!h.canWrite}>
                    {t('shopping.registerExpense')}
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <ItemSheet h={h} open={open} onClose={() => setOpen(false)} item={editing} />
    </>
  );
}
