/**
 * Runs the real SQL migrations on an in-process PostgreSQL (PGlite) with a minimal
 * stand-in for the pieces Supabase provides (auth schema, auth.uid(), roles, default grants).
 * This lets us verify schema, triggers, RPCs and RLS without Docker or a cloud project.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  -- Newer Supabase projects do NOT auto-grant table privileges to anon/authenticated,
  -- so the migrations must grant what they need explicitly (no default privileges here).
  create publication supabase_realtime;
`;

export interface TestDb {
  db: PGlite;
  /** Run SQL as a signed-in user (RLS enforced). */
  as<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as the superuser (bypasses RLS) — for setup and assertions. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(id: string, email: string, displayName: string): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }

  const admin = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  const as = async <T,>(userId: string, sql: string, params: unknown[] = []) => {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await tx.exec('set local role authenticated');
      const result = await tx.query<T>(sql, params);
      return result.rows;
    });
  };

  const createUser = async (id: string, email: string, displayName: string) => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id,
      email,
      JSON.stringify({ display_name: displayName }),
    ]);
  };

  return { db, as, admin, createUser };
}
