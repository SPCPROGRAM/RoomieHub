import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { toErrorCode } from '@/services/errors';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: string, action?: Toast['action']) => void;
  error: (errorOrMessage: unknown) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string, action?: Toast['action']) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, kind, message, action }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, action) => push('success', m, action),
      info: (m) => push('info', m),
      error: (e) => {
        if (typeof e === 'string') return push('error', e);
        const code = toErrorCode(e);
        if (code === 'unknown' && import.meta.env.DEV) console.error(e);
        push('error', t(`errors.${code}`, { defaultValue: t('errors.generic') }));
      },
    }),
    [push, t],
  );

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const Icon = icons[toast.kind];
          return (
            <div
              key={toast.id}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-slide-up items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-float',
                'border-line bg-elevated text-ink',
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', toast.kind === 'success' && 'text-emerald-500', toast.kind === 'error' && 'text-rose-500', toast.kind === 'info' && 'text-sky-500')} aria-hidden />
              <span className="min-w-0 flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  className="font-semibold text-brand-600 dark:text-brand-300"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button type="button" onClick={() => dismiss(toast.id)} className="text-subtle hover:text-ink" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
