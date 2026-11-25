import { occurrencesInRange } from '@/domain/calendar';
import { dateOfTimestamp } from '@/domain/dates';
import type { CalendarEvent, Chore, ChoreAssignment, ISODate, UUID } from '@/domain/types';

export type CalendarItem =
  | { type: 'event'; key: string; date: ISODate; event: CalendarEvent }
  | { type: 'chore'; key: string; date: ISODate; assignment: ChoreAssignment; chore: Chore | undefined };

/** All items to display between two dates, indexed by day. */
export function itemsByDay(params: {
  from: ISODate;
  to: ISODate;
  events: readonly CalendarEvent[];
  assignments: readonly ChoreAssignment[];
  chores: ReadonlyMap<UUID, Chore>;
  includeChores: boolean;
}): Map<ISODate, CalendarItem[]> {
  const map = new Map<ISODate, CalendarItem[]>();
  const push = (item: CalendarItem) => map.set(item.date, [...(map.get(item.date) ?? []), item]);

  for (const event of params.events) {
    for (const date of occurrencesInRange(event, params.from, params.to)) push({ type: 'event', key: `${event.id}@${date}`, date, event });
  }
  if (params.includeChores) {
    for (const a of params.assignments) {
      if (a.due_date >= params.from && a.due_date <= params.to && a.status !== 'skipped') {
        push({ type: 'chore', key: a.id, date: a.due_date, assignment: a, chore: params.chores.get(a.chore_id) });
      }
    }
  }
  for (const list of map.values()) {
    list.sort((x, y) => {
      if (x.type !== y.type) return x.type === 'event' ? -1 : 1;
      if (x.type === 'event' && y.type === 'event') {
        if (x.event.all_day !== y.event.all_day) return x.event.all_day ? -1 : 1;
        return new Date(x.event.starts_at).getHours() * 60 + new Date(x.event.starts_at).getMinutes() - (new Date(y.event.starts_at).getHours() * 60 + new Date(y.event.starts_at).getMinutes());
      }
      return 0;
    });
  }
  return map;
}

export function eventStartDate(e: CalendarEvent) {
  return dateOfTimestamp(e.starts_at);
}
