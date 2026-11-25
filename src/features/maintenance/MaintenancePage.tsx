import { useState } from 'react';
import { Camera, ChevronRight, MapPin, Plus, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { formatDate } from '@/domain/dates';
import type { MaintenanceReport } from '@/domain/types';
import { useHousehold } from '@/hooks/useHousehold';
import { features } from '@/config/features';
import { ReportDetailSheet } from './ReportDetailSheet';
import { ReportFormSheet } from './ReportFormSheet';
import { PRIORITY_TONE, STATUS_TONE } from './tones';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

export default function MaintenancePage() {
  const { t } = useTranslation();
  const h = useHousehold();
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceReport | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const isOpen = (r: MaintenanceReport) => r.status === 'open' || r.status === 'in_progress';
  const open = h.snap.reports.filter(isOpen).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.created_at.localeCompare(a.created_at));
  const closed = h.snap.reports.filter((r) => !isOpen(r));
  const list = filter === 'open' ? open : closed;
  const detail = detailId ? (h.snap.reports.find((r) => r.id === detailId) ?? null) : null;

  return (
    <>
      <PageHeader
        title={t('maintenance.title')}
        subtitle={t('maintenance.subtitle')}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} disabled={!h.canWrite} onClick={() => { setEditing(null); setFormOpen(true); }}>
            {t('maintenance.newReport')}
          </Button>
        }
      />
      <Segmented
        label={t('maintenance.title')}
        value={filter}
        onChange={setFilter}
        className="mb-5"
        options={[
          { value: 'open', label: t('maintenance.filterOpen'), count: open.length },
          { value: 'closed', label: t('maintenance.filterClosed'), count: closed.length },
        ]}
      />
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Wrench className="h-6 w-6" />} title={t('maintenance.empty')} hint={t('maintenance.emptyHint')} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((r) => {
            const cost = h.snap.expenses.filter((e) => e.maintenance_report_id === r.id).reduce((s, e) => s + e.amount, 0);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setDetailId(r.id)} className="block w-full text-left">
                  <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-brand-300">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                      <Wrench className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[r.status]}>{t(`maintenance.statuses.${r.status}`)}</Badge>
                        <Badge tone={PRIORITY_TONE[r.priority]}>{t(`maintenance.priorities.${r.priority}`)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{formatDate(r.occurred_on, h.intl)}</span>
                        {r.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {r.location}
                          </span>
                        )}
                        <span>
                          {t('maintenance.responsible')}: {h.nameOf(r.responsible_id)}
                        </span>
                        {r.photo_paths.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Camera className="h-3 w-3" aria-hidden />
                            {r.photo_paths.length}
                          </span>
                        )}
                        {features.finances && cost > 0 && <span className="tabular">{h.money(cost)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ReportFormSheet h={h} open={formOpen} onClose={() => setFormOpen(false)} report={editing} onCreated={(r) => setDetailId(r.id)} />
      {!formOpen && (
        <ReportDetailSheet
          h={h}
          report={detail}
          onClose={() => setDetailId(null)}
          onEdit={(r) => {
            setEditing(r);
            setFormOpen(true);
          }}
        />
      )}
    </>
  );
}
