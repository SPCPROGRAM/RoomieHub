import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { features } from '@/config/features';
import { AppShell } from '@/components/layout/AppShell';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { NotFoundPage } from '@/features/misc/NotFoundPage';
import { JoinPage } from '@/features/onboarding/JoinPage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { RequireApartment, RequireAuth, RequireGuest } from './guards';

// Feature pages are code-split so the first load on a phone stays light.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ChoresPage = lazy(() => import('@/features/chores/ChoresPage'));
const FinancesPage = lazy(() => import('@/features/finances/FinancesPage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const ShoppingPage = lazy(() => import('@/features/shopping/ShoppingPage'));
const StatsPage = lazy(() => import('@/features/stats/StatsPage'));
const MaintenancePage = lazy(() => import('@/features/maintenance/MaintenancePage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

export const routes: RouteObject[] = [
  {
    element: <RequireGuest />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/join/:code', element: <JoinPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        element: (
          <RequireApartment>
            <AppShell />
          </RequireApartment>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'chores', element: <ChoresPage /> },
          // hidden modules redirect home (see src/config/features.ts)
          { path: 'finances', element: features.finances ? <FinancesPage /> : <Navigate to="/" replace /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'shopping', element: features.shopping ? <ShoppingPage /> : <Navigate to="/" replace /> },
          { path: 'stats', element: <StatsPage /> },
          { path: 'maintenance', element: <MaintenancePage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
