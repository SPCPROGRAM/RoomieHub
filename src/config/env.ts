// Public client configuration. Only values that are safe in a browser bundle belong here.

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** True when the Supabase project is configured; otherwise only demo mode is offered. */
  supabaseConfigured: /^https?:\/\//.test(url) && anonKey.length > 20,
  // empty → the domain the app is served from (works on any Vercel URL without rebuilding)
  appUrl: ((import.meta.env.VITE_APP_URL ?? '').trim() || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, ''),
  demoEnabled: (import.meta.env.VITE_ENABLE_DEMO ?? 'true') !== 'false',
} as const;
