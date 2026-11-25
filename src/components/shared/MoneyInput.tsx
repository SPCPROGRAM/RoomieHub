import { forwardRef, type InputHTMLAttributes } from 'react';
import { formatAmountPlain, parseMoneyInput } from '@/domain/money';
import { cn } from '@/lib/cn';
import { Input } from '../ui/Field';

/**
 * Text input for whole-unit money. Keeps what the person typed while editing and
 * re-groups thousands on blur (120000 -> 120.000). Validation happens in the zod schema.
 */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { currency?: string; locale?: string }>(function MoneyInput(
  { currency = 'COP', locale = 'es-CO', onBlur, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-subtle">$</span>
      <Input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={cn('tabular pl-7 pr-14', className)}
        onBlur={(e) => {
          const parsed = parseMoneyInput(e.target.value);
          if (parsed !== null) e.target.value = formatAmountPlain(parsed, locale);
          onBlur?.(e);
        }}
        {...props}
      />
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-subtle">{currency}</span>
    </div>
  );
});
