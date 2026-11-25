import type { Tone } from '@/components/ui/Badge';
import type { ReportPriority, ReportStatus } from '@/domain/types';

export const STATUS_TONE: Record<ReportStatus, Tone> = { open: 'danger', in_progress: 'warning', resolved: 'success', closed: 'neutral' };
export const PRIORITY_TONE: Record<ReportPriority, Tone> = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };
