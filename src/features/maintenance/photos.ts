import type { MaintenanceReport } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { compressImage } from '@/lib/image';
import { AppError } from '@/services/errors';
import type { Repository } from '@/services/repository';

export const MAX_PHOTOS = 6;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // storage bucket limit

/**
 * Resize + re-encode as JPEG (smaller, no GPS metadata). If the phone's browser can't decode the
 * image (some formats/devices), fall back to the original file when the bucket accepts it.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > 25 * 1024 * 1024) throw new AppError('photo_too_large');
  try {
    return await compressImage(file);
  } catch {
    if (ALLOWED.includes(file.type) && file.size <= MAX_BYTES) return file;
    throw new AppError('photo_unsupported');
  }
}

/** Upload photos for a report and append their paths. Returns how many were added. */
export async function addReportPhotos(repo: Repository, h: Household, report: Pick<MaintenanceReport, 'id' | 'photo_paths'>, files: File[]): Promise<number> {
  const room = Math.max(0, MAX_PHOTOS - report.photo_paths.length);
  const paths: string[] = [];
  for (const file of files.slice(0, room)) {
    const blob = await preparePhoto(file);
    paths.push(await repo.uploadPhoto(h.snap.apartment.id, report.id, blob));
  }
  if (paths.length) await repo.updateReport(report.id, { photo_paths: [...report.photo_paths, ...paths] });
  return paths.length;
}
