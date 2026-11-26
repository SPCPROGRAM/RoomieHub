import { useEffect, useState } from 'react';
import { ImageOff, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { formatDate } from '@/domain/dates';
import type { MaintenanceReport } from '@/domain/types';
import type { Household } from '@/hooks/useHousehold';
import { features } from '@/config/features';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { addReportPhotos, MAX_PHOTOS } from './photos';
import { PhotoButtons } from './PhotoPicker';
import { PRIORITY_TONE, STATUS_TONE } from './tones';
import { STATUSES } from './ReportFormSheet';


function Photo({ path, onRemove, canRemove }: { path: string; onRemove: () => void; canRemove: boolean }) {
  const { t } = useTranslation();
  const { repo } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    repo
      .photoUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [repo, path]);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl bg-sunken">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        </a>
      ) : failed ? (
        <div className="grid h-full place-items-center text-subtle" title={t('errors.photo_unavailable')}>
          <ImageOff className="h-5 w-5" />
        </div>
      ) : (
        <div className="grid h-full place-items-center">
          <Spinner />
        </div>
      )}
      {canRemove && (
        <button type="button" onClick={onRemove} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white" aria-label={t('maintenance.removePhoto')}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ReportDetailSheet({ h, report, onClose, onEdit }: { h: Household; report: MaintenanceReport | null; onClose: () => void; onEdit: (r: MaintenanceReport) => void }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  if (!report) return null;

  const costs = h.snap.expenses.filter((e) => e.maintenance_report_id === report.id);
  const totalCost = costs.reduce((s, e) => s + e.amount, 0);
  const history = h.snap.activity.filter((a) => a.entity_type === 'maintenance_report' && a.entity_id === report.id);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    const selected = [...files];
    setUploading(true);
    const r = await h.run((repo) => addReportPhotos(repo, h, report, selected));
    if (r.ok && r.value > 0) toast.success(t('maintenance.photosAdded', { count: r.value }));
    setUploading(false);
  };

  const removePhoto = (path: string) =>
    h.run(async (repo) => {
      await repo.updateReport(report.id, { photo_paths: report.photo_paths.filter((p) => p !== path) });
      await repo.deletePhoto(path).catch(() => undefined);
    });

  const remove = async () => {
    if (!(await confirm({ title: t('common.delete'), message: t('maintenance.deleteConfirm'), danger: true, confirmLabel: t('common.delete') }))) return;
    const r = await h.run(async (repo) => {
      await repo.deleteReport(report.id);
      await Promise.all(report.photo_paths.map((p) => repo.deletePhoto(p).catch(() => undefined)));
    });
    if (r.ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="lg"
      title={report.title}
      description={`${t('maintenance.reportedBy', { name: h.fullNameOf(report.reported_by) })} · ${formatDate(report.occurred_on, h.intl, { dateStyle: 'medium' })}${report.location ? ` · ${report.location}` : ''}`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto hover:text-rose-600" icon={<Trash2 className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => void remove()}>
            {t('common.delete')}
          </Button>
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => onEdit(report)}>
            {t('common.edit')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PRIORITY_TONE[report.priority]}>{t(`maintenance.priorities.${report.priority}`)}</Badge>
          <span className="text-sm text-muted">
            {t('maintenance.responsible')}: <span className="font-medium text-ink">{h.fullNameOf(report.responsible_id)}</span>
          </span>
          <div className="ml-auto w-44">
            <Select
              aria-label={t('maintenance.changeStatus')}
              value={report.status}
              disabled={!h.canWrite}
              className="h-9 text-sm"
              onChange={(e) => void h.run((repo) => repo.updateReport(report.id, { status: e.target.value as MaintenanceReport['status'] }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`maintenance.statuses.${s}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Badge tone={STATUS_TONE[report.status]} className="sr-only">
          {t(`maintenance.statuses.${report.status}`)}
        </Badge>
        {report.description && <p className="whitespace-pre-line text-sm text-ink">{report.description}</p>}

        <section>
          <h3 className="mb-2 text-sm font-semibold">
            {t('maintenance.photos')} <span className="font-normal text-muted">({report.photo_paths.length}/{MAX_PHOTOS})</span>
          </h3>
          {report.photo_paths.length < MAX_PHOTOS && (
            <div className="mb-3">
              <PhotoButtons onPick={(files) => void upload(files)} loading={uploading} disabled={!h.canWrite} />
            </div>
          )}
          {report.photo_paths.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {report.photo_paths.map((p) => (
                <Photo key={p} path={p} canRemove={h.canWrite} onRemove={() => void removePhoto(p)} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-subtle">{t('maintenance.photosHint')}</p>
          )}
          {h.mode === 'demo' && <p className="mt-2 text-xs text-subtle">{t('demo.photosNote')}</p>}
        </section>

        {features.finances && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {t('maintenance.repairCosts')}
              {totalCost > 0 && <span className="tabular ml-2 font-normal text-muted">{h.money(totalCost)}</span>}
            </h3>
            <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => navigate(`/finances?report=${report.id}`)}>
              {t('maintenance.addRepairCost')}
            </Button>
          </div>
          {costs.length === 0 ? (
            <p className="text-xs text-subtle">{t('maintenance.noRepairCosts')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {costs.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {e.description}
                    <span className="ml-2 text-xs text-muted">
                      {formatDate(e.spent_on, h.intl)} · {t('finances.paidByName', { name: h.nameOf(e.paid_by) })}
                    </span>
                  </span>
                  <span className="tabular font-medium">{h.money(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t('maintenance.history')}</h3>
          <ActivityFeed h={h} items={history} />
        </section>
      </div>
    </Sheet>
  );
}
