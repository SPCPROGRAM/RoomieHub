import { useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';

export function inAppCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Camera inside the app (getUserMedia). Opening Android's camera app sends RoomieHub to the
 * background, and Android may kill it to free memory, losing the form in progress. Staying in
 * the page avoids that. If the camera can't be opened, `onUnavailable` lets the caller fall back
 * to the system camera.
 */
export function CameraSheet({ open, onClose, onCapture, onUnavailable }: { open: boolean; onClose: () => void; onCapture: (file: File) => void; onUnavailable: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onUnavailable();
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
    // onUnavailable is a callback from the parent; re-running on its identity would restart the camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  useEffect(() => {
    if (open) setTaken(0);
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        setTaken((n) => n + 1);
      },
      'image/jpeg',
      0.85,
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('maintenance.takePhoto')}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" icon={<RefreshCcw className="h-4 w-4" />} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
            {t('maintenance.switchCamera')}
          </Button>
          <Button variant="secondary" icon={<Check className="h-4 w-4" />} onClick={onClose}>
            {taken > 0 ? t('maintenance.cameraDone', { count: taken }) : t('common.close')}
          </Button>
          <Button icon={<Camera className="h-4 w-4" />} disabled={!ready} onClick={capture}>
            {t('maintenance.capture')}
          </Button>
        </>
      }
    >
      <div className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-2xl bg-black sm:aspect-video">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner className="text-white" />
          </div>
        )}
      </div>
    </Sheet>
  );
}
