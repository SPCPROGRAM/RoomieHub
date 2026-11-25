import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

let client: SupabaseClient | null = null;

/** Lazily created browser client (anon key only; RLS protects the data). */
export function getSupabase(): SupabaseClient {
  if (!env.supabaseConfigured) {
    throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
  }
  return client;
}
