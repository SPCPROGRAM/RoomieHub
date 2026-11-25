import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build (vite preview) in demo mode: no external services needed.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-CO',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
    env: { VITE_ENABLE_DEMO: 'true', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
});
