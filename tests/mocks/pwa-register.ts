// Test double for 'virtual:pwa-register/react' (provided by vite-plugin-pwa at build time).
import { useState } from 'react';

export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: async () => {},
  };
}
