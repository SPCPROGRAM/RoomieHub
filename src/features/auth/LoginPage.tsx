import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { env } from '@/config/env';
import { loginSchema, type LoginValues } from '@/domain/schemas';
import { useAuth } from '@/providers/AuthProvider';
import { SupabaseRepository } from '@/services/supabaseRepository';
import { toErrorCode } from '@/services/errors';
import { AuthLayout } from './AuthLayout';
import { DemoEntry } from './DemoEntry';

export function LoginPage() {
  const { t } = useTranslation();
  const { repo } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      // the login form always talks to the real backend, even if a demo session was active before
      const target = repo.mode === 'supabase' ? repo : new SupabaseRepository();
      await target.signIn(values.email, values.password);
      if (repo.mode !== 'supabase') {
        localStorage.removeItem('rh.mode');
        window.location.assign('/');
      }
    } catch (e) {
      setError(t(`errors.${toErrorCode(e)}`, { defaultValue: t('errors.generic') }));
    }
  });

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        env.supabaseConfigured && (
          <>
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
              {t('auth.register')}
            </Link>
          </>
        )
      }
    >
      {!env.supabaseConfigured ? (
        <div className="space-y-4">
          <Alert tone="info" icon={<Info className="h-4 w-4" />}>
            {t('auth.notConfigured')}
          </Alert>
          <DemoEntry />
        </div>
      ) : (
        <>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label={t('auth.email')} error={formState.errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="email" inputMode="email" {...register('email')} />}
            </Field>
            <Field label={t('auth.password')} error={formState.errors.password?.message}>
              {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
            </Field>
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                {t('auth.forgot')}
              </Link>
            </div>
            <Button type="submit" size="lg" block loading={formState.isSubmitting}>
              {t('auth.login')}
            </Button>
          </form>
          {env.demoEnabled && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-subtle">
                <span className="h-px flex-1 bg-line" />
                {t('auth.or')}
                <span className="h-px flex-1 bg-line" />
              </div>
              <DemoEntry />
            </>
          )}
        </>
      )}
    </AuthLayout>
  );
}
