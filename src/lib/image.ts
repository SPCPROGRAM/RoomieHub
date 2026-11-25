/**
 * Downscale and re-encode a photo as JPEG before uploading (phone photos are often 4–10 MB).
 * Also strips EXIF metadata such as GPS location, because the canvas does not copy it.
 */
export async function compressImage(file: File, maxDimension = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('encode_failed');
  return blob;
}
