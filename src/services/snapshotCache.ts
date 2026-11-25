import type { Snapshot, UUID } from '@/domain/types';

/**
 * Read-only offline copy of the last snapshot the server confirmed, so the app can show
 * the household's data without a connection. It is never used to fake a successful write:
 * mutations always require the network (see ApartmentProvider). Cleared on sign-out.
 * Invitation codes are not cached.
 */
const PREFIX = 'rh.snapshot.';

export function saveSnapshot(userId: UUID, snapshot: Snapshot) {
  try {
    const { invitations: _omit, ...rest } = snapshot;
    localStorage.setItem(`${PREFIX}${userId}.${snapshot.apartment.id}`, JSON.stringify(rest));
  } catch {
    // storage full or unavailable: offline view simply won't be available
  }
}

export function loadSnapshot(userId: UUID, apartmentId: UUID): Snapshot | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${userId}.${apartmentId}`);
    if (!raw) return null;
    return { invitations: [], ...(JSON.parse(raw) as Omit<Snapshot, 'invitations'>) };
  } catch {
    return null;
  }
}

export function clearSnapshots() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
