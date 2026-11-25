import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { env } from '@/config/env';
import { forgotSchema, type ForgotValues } from '@/domain/schemas';
import { toErrorCode } from '@/services/errors';
import { SupabaseRepository } from '@/services/supabaseRepository';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await new SupabaseRepository().requestPasswordReset(v.email);
      setSent(true);
    } catch (e) {
      const code = toErrorCode(e);
      // never reveal whether an account exists: only surface transport/rate errors
      if (code === 'network' || code === 'rate_limited') setError(t(`errors.${code}`));
      else setSent(true);
    }
  });

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotSubtitle')}
      footer={
        <Link to="/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
          {t('common.back')}
        </Link>
      }
    >
      {!env.supabaseConfigured ? (
        <Alert tone="info">{t('auth.notConfigured')}</Alert>
      ) : sent ? (
        <Alert tone="success" icon={<MailCheck className="h-4 w-4" />}>
          {t('auth.linkSent')}
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('auth.email')} error={formState.errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
          </Field>
          <Button type="submit" size="lg" block loading={formState.isSubmitting}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
