import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Input } from './Field';
import { Sheet } from './Sheet';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Require typing this exact text before confirming (for destructive actions). */
  typeToConfirm?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setTyped('');
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current(value);
    setOpts(null);
  };

  const blocked = Boolean(opts?.typeToConfirm) && typed.trim() !== opts?.typeToConfirm;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={opts !== null}
        onClose={() => close(false)}
        title={opts?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>
              {opts?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        {opts?.message && <div className="text-sm text-muted">{opts.message}</div>}
        {opts?.typeToConfirm && (
          <Input className="mt-4" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={opts.typeToConfirm} aria-label={opts.typeToConfirm} />
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
