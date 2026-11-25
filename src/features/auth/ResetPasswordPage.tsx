import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { resetSchema, type ResetValues } from '@/domain/schemas';
import { FullScreenLoader } from '@/router/guards';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { toErrorCode } from '@/services/errors';
import { AuthLayout } from './AuthLayout';

/** Reached from the recovery email: Supabase opens a temporary session, then we set the new password. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { repo, user, initializing } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });

  if (initializing) return <FullScreenLoader />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await repo.updatePassword(v.password);
      toast.success(t('auth.resetDone'));
      navigate('/', { replace: true });
    } catch (e) {
      setError(t(`errors.${toErrorCode(e)}`, { defaultValue: t('errors.generic') }));
    }
  });

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      {!user || repo.mode !== 'supabase' ? (
        <Alert tone="warning">{t('auth.resetNoSession')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={formState.errors.password?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
          </Field>
          <Field label={t('auth.confirmPassword')} error={formState.errors.confirm?.message}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
          </Field>
          <Button type="submit" size="lg" block loading={formState.isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
