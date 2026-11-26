import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { CameraSheet, inAppCameraSupported } from './CameraSheet';

/** Two explicit buttons: camera (capture) and gallery. Calls onPick with the chosen files. */
export function PhotoButtons({ onPick, disabled, loading }: { onPick: (files: File[]) => void; disabled?: boolean; loading?: boolean }) {
  const { t } = useTranslation();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [cameraOpen, setCameraOpen] = useState(false);
  // after a failure (permission denied, no camera) use the system camera instead
  const [useSystemCamera, setUseSystemCamera] = useState(!inAppCameraSupported());
  const handle = (input: HTMLInputElement | null) => {
    const files = input?.files ? [...input.files] : [];
    if (input) input.value = ''; // allow picking the same photo again
    if (files.length) onPick(files);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.currentTarget)} data-testid="photo-camera" />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => handle(e.currentTarget)} data-testid="photo-gallery" />
      <Button size="sm" variant="soft" icon={<Camera className="h-4 w-4" />} disabled={disabled} loading={loading} onClick={() => (useSystemCamera ? cameraRef.current?.click() : setCameraOpen(true))}>
        {t('maintenance.takePhoto')}
      </Button>
      <Button size="sm" variant="secondary" icon={<ImagePlus className="h-4 w-4" />} disabled={disabled || loading} onClick={() => galleryRef.current?.click()}>
        {t('maintenance.choosePhotos')}
      </Button>
      <CameraSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => onPick([file])}
        onUnavailable={() => {
          setCameraOpen(false);
          setUseSystemCamera(true);
          toast.info(t('maintenance.cameraFallback'));
        }}
      />
    </div>
  );
}

/** Thumbnails of photos picked but not uploaded yet (report form). */
export function PendingPhotos({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const { t } = useTranslation();
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (files.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {urls.map((url, i) => (
        <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-sunken">
          <img src={url} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onRemove(i)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label={t('maintenance.removePhoto')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
