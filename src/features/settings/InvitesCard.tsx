import { useState } from 'react';
import { Copy, Link2, Share2, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { env } from '@/config/env';
import { formatDateTime } from '@/domain/dates';
import type { Invitation } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { useToast } from '@/providers/ToastProvider';

export function inviteLink(code: string) {
  return `${env.appUrl || window.location.origin}/join/${code}`;
}

export function InvitesCard({ h }: { h: Household }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const full = h.activeMembers.length >= h.snap.apartment.max_members;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.info(text);
    }
  };

  const share = async (inv: Invitation) => {
    const url = inviteLink(inv.code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'RoomieHub', text: `${h.snap.apartment.name} · ${inv.code}`, url });
        return;
      } catch {
        // cancelled: fall back to copy
      }
    }
    await copy(url);
  };

  return (
    <Card>
      <CardHeader title={t('settings.invite')} subtitle={t('settings.inviteDescription')} icon={<UserPlus className="h-4.5 w-4.5" />} />
      <CardBody className="space-y-4">
        {full ? (
          <Alert tone="info">{t('settings.full')}</Alert>
        ) : (
          <Button
            icon={<Link2 className="h-4 w-4" />}
            loading={creating}
            disabled={!h.canWrite}
            onClick={async () => {
              setCreating(true);
              await h.run((repo) => repo.createInvitation(h.snap.apartment.id, { days: 7, maxUses: Math.max(1, Math.min(2, h.snap.apartment.max_members - h.activeMembers.length)) }));
              setCreating(false);
            }}
          >
            {t('settings.createInvite')}
          </Button>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t('settings.activeInvites')}</p>
          {h.snap.invitations.length === 0 ? (
            <p className="text-sm text-muted">{h.fromCache ? t('offline.blocked') : t('settings.noInvites')}</p>
          ) : (
            <ul className="space-y-2">
              {h.snap.invitations.map((inv) => (
                <li key={inv.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <code className="tabular flex-1 font-mono text-lg font-semibold tracking-[0.2em]">{inv.code}</code>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void copy(inv.code)} aria-label={t('common.copy')} title={t('common.copy')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void share(inv)} aria-label={t('common.share')} title={t('common.share')}>
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:text-rose-600"
                      disabled={!h.canWrite}
                      onClick={() => void h.run((repo) => repo.revokeInvitation(inv.id), { success: t('settings.revoked') })}
                      aria-label={t('settings.revoke')}
                      title={t('settings.revoke')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-1 break-all text-xs text-muted">{inviteLink(inv.code)}</p>
                  <p className="mt-1 text-xs text-subtle">{t('settings.expires', { date: formatDateTime(inv.expires_at, h.intl, { dateStyle: 'medium', timeStyle: 'short' }), uses: inv.uses, max: inv.max_uses })}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
