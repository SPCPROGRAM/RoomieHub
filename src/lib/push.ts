import { AppError } from '@/services/errors';

/** Web Push needs a service worker, the Push API and notifications (Android Chrome: yes; iOS: only installed PWA). */
export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The service worker only exists in the production build (not in `npm run dev`). */
async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new AppError('push_unavailable')), timeoutMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Ask permission and subscribe this device. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushKeys> {
  if (!pushSupported() || !vapidPublicKey) throw new AppError('push_unavailable');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new AppError('push_denied');
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidPublicKey) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new AppError('push_unavailable');
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Unsubscribe this device; returns the endpoint so the server copy can be deleted too. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const sub = await currentPushSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
