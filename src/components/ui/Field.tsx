import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const controlBase =
  'w-full rounded-xl border bg-surface px-3.5 text-[15px] text-ink placeholder:text-subtle transition-colors focus:outline-none focus:ring-4 disabled:opacity-60';
const controlOk = 'border-line focus:border-brand-500 focus:ring-brand-500/15';
const controlError = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** i18n key (e.g. "validation.required") or literal message. */
  error?: string;
  optional?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, optional, children, className }: FieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-subtle">({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error.includes('.') ? t(error) : error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, 'h-11', props['aria-invalid'] ? controlError : controlOk, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} rows={3} className={cn(controlBase, 'min-h-20 py-2.5', props['aria-invalid'] ? controlError : controlOk, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(controlBase, 'h-11 appearance-none pr-10', props['aria-invalid'] ? controlError : controlOk, className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  );
});

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-line',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
