import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Building2, ChevronsUpDown, LogOut, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useApartment } from '@/providers/ApartmentProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Logo, LogoMark } from '../brand/Logo';
import { Avatar } from '../ui/Avatar';
import { PageSkeleton } from '../ui/Feedback';
import { Sheet } from '../ui/Sheet';
import { NAV_ITEMS } from './navItems';
import { LanguageSwitch, ThemeSwitch } from './PreferenceControls';
import { ReminderWatcher } from './ReminderWatcher';
import { DemoBanner, InstallButton, OfflineBanner } from './StatusBanners';

function ApartmentSwitcher() {
  const { t } = useTranslation();
  const { apartments, apartmentId, selectApartment, snapshot } = useApartment();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const current = snapshot?.apartment ?? apartments.find((a) => a.id === apartmentId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:bg-sunken"
        aria-label={t('onboarding.switchApartment')}
      >
        <Building2 className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.name}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('onboarding.switchApartment')} size="sm">
        <ul className="space-y-2">
          {apartments.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  selectApartment(a.id);
                  setOpen(false);
                  navigate('/');
                }}
                className={cn('flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left', a.id === apartmentId ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-line hover:bg-sunken')}
              >
                <Building2 className="h-4 w-4 text-brand-600" aria-hidden />
                <span className="font-medium">{a.name}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="w-full rounded-xl border border-dashed border-line px-4 py-3 text-sm font-medium text-muted hover:bg-sunken"
              onClick={() => {
                setOpen(false);
                navigate('/onboarding');
              }}
            >
              {t('onboarding.createTitle')} / {t('onboarding.joinTitle')}
            </button>
          </li>
        </ul>
      </Sheet>
    </>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-5 lg:flex">
      <Logo className="px-2" />
      <div className="mt-6">
        <ApartmentSwitcher />
      </div>
      <nav aria-label={t('nav.mainNav')} className="mt-6 flex-1 space-y-1">
        {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200' : 'text-muted hover:bg-sunken hover:text-ink',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
        <InstallButton className="w-full" />
        <div className="flex items-center gap-3 rounded-xl px-2 py-1">
          {profile && <Avatar name={profile.display_name} color={profile.avatar_color} size="sm" />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{profile?.display_name}</span>
          <button type="button" onClick={() => void signOut()} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-sunken hover:text-ink" title={t('nav.signOut')} aria-label={t('nav.signOut')}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { profile } = useAuth();
  const { snapshot } = useApartment();
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center gap-3 px-4">
        <LogoMark className="h-8 w-8" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{snapshot?.apartment.name}</span>
        <NavLink to="/settings" aria-label={profile?.display_name ?? 'profile'}>
          {profile && <Avatar name={profile.display_name} color={profile.avatar_color} size="sm" />}
        </NavLink>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV_ITEMS.filter((i) => i.primary);
  const secondary = NAV_ITEMS.filter((i) => !i.primary);
  const moreActive = secondary.some((i) => location.pathname.startsWith(i.to));

  const itemClass = (active: boolean) =>
    cn('flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium transition-colors', active ? 'text-brand-700 dark:text-brand-300' : 'text-subtle');

  return (
    <>
      <nav aria-label={t('nav.mainNav')} className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {primary.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => itemClass(isActive)}>
              {({ isActive }) => (
                <>
                  <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-brand-50 dark:bg-brand-500/15')}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  {t(labelKey)}
                </>
              )}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className={itemClass(moreActive)} aria-haspopup="dialog">
            <span className={cn('grid h-7 w-12 place-items-center rounded-full', moreActive && 'bg-brand-50 dark:bg-brand-500/15')}>
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </span>
            {t('nav.more')}
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} size="sm">
        <div className="grid grid-cols-2 gap-3">
          {secondary.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn('flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm font-medium', isActive ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200' : 'border-line hover:bg-sunken')
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t(labelKey)}
            </NavLink>
          ))}
        </div>
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <ApartmentSwitcher />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
          <InstallButton className="w-full" />
          <button type="button" onClick={() => void signOut()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-medium text-muted hover:bg-sunken">
            <LogOut className="h-4 w-4" aria-hidden />
            {t('nav.signOut')}
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <DemoBanner />
        <OfflineBanner />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <ReminderWatcher />
    </div>
  );
}
