import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { joinSchema } from '@/domain/schemas';
import type { InvitationPreview, UUID } from '@/domain/types';
import { useAuth } from '@/providers/AuthProvider';
import { toErrorCode } from '@/services/errors';

type JoinInput = z.input<typeof joinSchema>;
type JoinOutput = z.output<typeof joinSchema>;

export function JoinForm({ initialCode = '', onJoined }: { initialCode?: string; onJoined: (apartmentId: UUID) => void }) {
  const { t } = useTranslation();
  const { repo } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const { register, handleSubmit, formState, watch } = useForm<JoinInput, unknown, JoinOutput>({
    resolver: zodResolver(joinSchema),
    defaultValues: { code: initialCode },
  });
  const raw = watch('code');

  useEffect(() => {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setPreview(null);
    if (code.length !== 10) return;
    let cancelled = false;
    repo
      .previewInvitation(code)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [raw, repo]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setError(null);
    try {
      const id = await repo.acceptInvitation(code);
      sessionStorage.removeItem('rh.pendingJoin');
      onJoined(id);
    } catch (e) {
      setError(t(`errors.${toErrorCode(e)}`, { defaultValue: t('errors.generic') }));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label={t('onboarding.code')} error={formState.errors.code?.message}>
        {(p) => <Input {...p} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCD2345EF" className="font-mono tracking-[0.2em] uppercase" {...register('code')} />}
      </Field>
      {preview &&
        (preview.valid ? (
          <Alert tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
            {t('onboarding.preview', { name: preview.apartment_name, count: preview.member_count, max: preview.max_members })}
          </Alert>
        ) : (
          <Alert tone="warning">{t('onboarding.invalidLink')}</Alert>
        ))}
      <Button type="submit" block loading={formState.isSubmitting}>
        {t('onboarding.join')}
      </Button>
    </form>
  );
}
