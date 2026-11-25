import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ChevronRight, Crown, Info, KeyRound, LogOut, Palette, Trash2, UserMinus, UserRound, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { APP_VERSION } from '@/config/changelog';
import { PageHeader } from '@/components/layout/PageHeader';
import { LanguageSwitch, ThemeSwitch } from '@/components/layout/PreferenceControls';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { apartmentSchema, passwordSchema, profileSchema, type ApartmentValues, type ProfileValues } from '@/domain/schemas';
import type { PaletteColor } from '@/domain/types';
import { useHousehold } from '@/hooks/useHousehold';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { CategoriesCard, ColorPicker } from './CategoriesCard';
import { InvitesCard } from './InvitesCard';
import { NotificationsCard } from './NotificationsCard';

function ProfileCard() {
  const { t } = useTranslation();
  const h = useHousehold();
  const { profile, refreshProfile, repo } = useAuth();
  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });
  useEffect(() => {
    if (profile) reset({ displayName: profile.display_name, avatarColor: profile.avatar_color });
  }, [profile, reset]);
  const color = watch('avatarColor');
  const name = watch('displayName');

  const onSubmit = handleSubmit(async (v) => {
    const r = await h.run((r2) => r2.updateProfile(h.userId, { display_name: v.displayName.trim(), avatar_color: v.avatarColor as PaletteColor }), { success: t('settings.profileSaved') });
    if (r.ok) await refreshProfile();
  });

  return (
    <Card>
      <CardHeader title={t('settings.profile')} icon={<UserRound className="h-4.5 w-4.5" />} />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar name={name || '?'} color={color} size="lg" />
            <div className="min-w-0 text-sm text-muted">{repo.mode === 'supabase' ? '' : t('settings.modeDemo')}</div>
          </div>
          <Field label={t('auth.displayName')} error={formState.errors.displayName?.message}>
            {(p) => <Input {...p} {...register('displayName')} />}
          </Field>
          <Field label={t('settings.avatarColor')}>
            {() => <ColorPicker value={color ?? 'teal'} onChange={(c) => setValue('avatarColor', c, { shouldDirty: true })} label={t('settings.avatarColor')} />}
          </Field>
          <Button type="submit" loading={formState.isSubmitting} disabled={!h.canWrite}>
            {t('common.save')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function ApartmentCard() {
  const { t } = useTranslation();
  const h = useHousehold();
  const { reloadApartments } = useApartment();
  const { register, handleSubmit, reset, formState } = useForm<ApartmentValues>({ resolver: zodResolver(apartmentSchema) });
  useEffect(() => {
    reset({ name: h.snap.apartment.name, currency: h.snap.apartment.currency });
  }, [h.snap.apartment, reset]);
  const [maxMembers, setMaxMembers] = useState(String(h.snap.apartment.max_members));

  const onSubmit = handleSubmit(async (v) => {
    const r = await h.run((repo) => repo.updateApartment(h.snap.apartment.id, { name: v.name.trim(), currency: v.currency, max_members: Math.max(Number(maxMembers), h.activeMembers.length) }), { success: t('settings.apartmentSaved') });
    if (r.ok) await reloadApartments();
  });

  return (
    <Card>
      <CardHeader title={t('settings.apartment')} icon={<Building2 className="h-4.5 w-4.5" />} />
      <CardBody>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label={t('onboarding.apartmentName')} error={formState.errors.name?.message}>
            {(p) => <Input {...p} disabled={!h.isOwner} {...register('name')} />}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('onboarding.currency')} error={formState.errors.currency?.message}>
              {(p) => (
                <Select {...p} disabled={!h.isOwner} {...register('currency')}>
                  {['COP', 'USD', 'EUR', 'MXN'].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('settings.maxMembers')}>
              {(p) => (
                <Select {...p} disabled={!h.isOwner} value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)}>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n} disabled={n < h.activeMembers.length}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {h.isOwner && (
            <Button type="submit" loading={formState.isSubmitting} disabled={!h.canWrite}>
              {t('common.save')}
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function MembersCard() {
  const { t } = useTranslation();
  const h = useHousehold();
  const confirm = useConfirm();
  return (
    <Card>
      <CardHeader title={t('settings.members')} subtitle={`${h.activeMembers.length} ${t('common.of')} ${h.snap.apartment.max_members}`} icon={<Users className="h-4.5 w-4.5" />} />
      <CardBody>
        <ul className="space-y-2">
          {h.activeMembers.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <Avatar name={m.profile.display_name} color={m.profile.avatar_color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.profile.display_name}</span>
                <span className="text-xs text-muted">{m.user_id === h.userId ? t('common.you') : ''}</span>
              </span>
              <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'} icon={m.role === 'owner' ? <Crown className="h-3 w-3" /> : undefined}>
                {m.role === 'owner' ? t('settings.owner') : t('settings.memberRole')}
              </Badge>
              {h.isOwner && m.user_id !== h.userId && (
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t('settings.makeOwner')}
                    aria-label={t('settings.makeOwner')}
                    disabled={!h.canWrite}
                    onClick={async () => {
                      if (await confirm({ title: t('settings.makeOwner'), message: t('settings.makeOwnerConfirm', { name: m.profile.display_name }) })) {
                        await h.run((repo) => repo.transferOwnership(h.snap.apartment.id, m.user_id));
                      }
                    }}
                  >
                    <Crown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:text-rose-600"
                    title={t('settings.remove')}
                    aria-label={t('settings.remove')}
                    disabled={!h.canWrite}
                    onClick={async () => {
                      if (await confirm({ title: t('settings.remove'), message: t('settings.removeConfirm', { name: m.profile.display_name }), danger: true })) {
                        await h.run((repo) => repo.removeMember(h.snap.apartment.id, m.user_id));
                      }
                    }}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function AccountCard() {
  const { t } = useTranslation();
  const h = useHousehold();
  const { signOut } = useAuth();
  const { reloadApartments } = useApartment();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);

  const changePassword = async () => {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setPwError(parsed.error.issues[0]?.message ?? 'validation.required');
    setPwError(null);
    const r = await h.run((repo) => repo.updatePassword(password), { success: t('settings.passwordChanged') });
    if (r.ok) setPassword('');
  };

  const leave = async () => {
    if (!(await confirm({ title: t('settings.leave'), message: t('settings.leaveConfirm'), danger: true, confirmLabel: t('settings.leave') }))) return;
    const r = await h.run((repo) => repo.leaveApartment(h.snap.apartment.id));
    if (r.ok) {
      await reloadApartments();
      navigate('/onboarding');
    }
  };

  const destroy = async () => {
    const ok = await confirm({ title: t('settings.deleteApartment'), message: t('settings.deleteApartmentConfirm'), danger: true, confirmLabel: t('common.delete'), typeToConfirm: h.snap.apartment.name });
    if (!ok) return;
    const r = await h.run((repo) => repo.deleteApartment(h.snap.apartment.id));
    if (r.ok) {
      await reloadApartments();
      navigate('/onboarding');
    }
  };

  return (
    <Card>
      <CardHeader title={t('settings.account')} icon={<KeyRound className="h-4.5 w-4.5" />} />
      <CardBody className="space-y-5">
        {h.mode === 'supabase' && (
          <div className="space-y-2">
            <Field label={t('settings.changePassword')} hint={t('auth.passwordHint')} error={pwError ?? undefined}>
              {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <Button variant="secondary" size="sm" disabled={!password || !h.canWrite} onClick={() => void changePassword()}>
              {t('common.save')}
            </Button>
          </div>
        )}
        <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
          {t('nav.signOut')}
        </Button>
        <div className="space-y-3 rounded-xl border border-rose-200 p-4 dark:border-rose-500/30">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{t('settings.dangerZone')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!h.canWrite} onClick={() => void leave()}>
              {t('settings.leave')}
            </Button>
            {h.isOwner && (
              <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => void destroy()}>
                {t('settings.deleteApartment')}
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const h = useHousehold();
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <ProfileCard />
          <Card>
            <CardHeader title={t('settings.preferences')} icon={<Palette className="h-4.5 w-4.5" />} />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t('theme.label')}</span>
                <ThemeSwitch />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t('language.label')}</span>
                <LanguageSwitch />
              </div>
            </CardBody>
          </Card>
          <NotificationsCard h={h} />
          <MembersCard />
          <InvitesCard h={h} />
        </div>
        <div className="space-y-5">
          <ApartmentCard />
          <CategoriesCard h={h} />
          <AccountCard />
          <Link to="/about" className="block">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand-300">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                <Info className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{t('about.title')}</span>
                <span className="text-xs text-muted">{t('about.version', { version: APP_VERSION })} · {t('about.whatsNew')}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
            </Card>
          </Link>
        </div>
      </div>
    </>
  );
}
