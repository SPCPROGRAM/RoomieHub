/** An error whose message is an i18n key under "errors.". */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'AppError';
  }
}

export class OfflineError extends AppError {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

const KNOWN_CODES = [
  'invitation_not_found',
  'invitation_invalid',
  'apartment_full',
  'owner_must_transfer',
  'cannot_remove_self',
  'swap_requires_same_week',
  'swap_requires_pending',
  'swap_same_person',
  'participants_required',
  'participants_duplicated',
  'expense_shares_mismatch',
  'too_many_apartments',
  'not_a_member',
  'forbidden',
] as const;

/** Map Supabase / Postgres / network errors to a stable i18n code. */
export function toErrorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  const e = error as { message?: string; code?: string; status?: number; name?: string } | null;
  const message = e?.message ?? String(error);

  for (const code of KNOWN_CODES) if (message.includes(code)) return code;

  if (/invalid login credentials/i.test(message)) return 'invalid_credentials';
  if (/email not confirmed/i.test(message)) return 'email_not_confirmed';
  if (/user already registered|already been registered/i.test(message)) return 'user_exists';
  if (/rate limit|too many requests/i.test(message) || e?.status === 429) return 'rate_limited';
  if (/password/i.test(message) && /weak|short|least/i.test(message)) return 'weak_password';
  if (/failed to fetch|network|load failed/i.test(message)) return 'network';
  if (e?.code === '42501' || /row-level security|permission denied/i.test(message)) return 'forbidden';
  if (e?.code === '23505' || /duplicate key/i.test(message)) return 'duplicate';
  if (e?.code === '23503') return 'reference';
  if (e?.code === '23514') return 'constraint';
  return 'unknown';
}
