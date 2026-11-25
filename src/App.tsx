import type { ReactNode } from 'react';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { UpdatePrompt } from '@/components/layout/StatusBanners';
import { ApartmentProvider } from '@/providers/ApartmentProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { PreferencesProvider } from '@/providers/PreferencesProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import type { Repository } from '@/services/repository';

/** All app-wide providers. The router is rendered inside (see main.tsx / tests). */
export function AppProviders({ children, repository, withServiceWorker = true }: { children: ReactNode; repository?: Repository; withServiceWorker?: boolean }) {
  return (
    <PreferencesProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider repository={repository}>
            <ApartmentProvider>
              {children}
              {withServiceWorker && <UpdatePrompt />}
            </ApartmentProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </PreferencesProvider>
  );
}
