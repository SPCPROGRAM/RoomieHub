import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

const PREFIX = 'rh.draft.';

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * Saves a form's text values while the person types, so they survive the browser being killed
 * in the background (Android does this when another app, like the camera, needs memory).
 * Only active while `enabled`; call clearDraft(key) after saving or discarding.
 */
export function useFormDraft<T extends FieldValues>(key: string, form: UseFormReturn<T>, enabled: boolean) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    const sub = form.watch((values, { type }) => {
      if (type !== 'change') return; // only what the person typed, not programmatic resets
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        try {
          localStorage.setItem(PREFIX + key, JSON.stringify(values));
        } catch {
          // storage full: drafts are best-effort
        }
      }, 300);
    });
    return () => {
      window.clearTimeout(timer.current);
      sub.unsubscribe();
    };
  }, [key, form, enabled]);
}
