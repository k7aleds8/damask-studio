import type { Moment } from 'moment';
import { m } from '../i18n';

/** A task as the stats pages see it, whichever app it came from. */
export interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  /** epoch ms */
  completedAt?: number;
  due?: number;
  allDay: boolean;
  priority: number;
  tags: string[];
  list: { id: string; name: string; color: string };
  /** where to jump when the task is clicked */
  path?: string;
  line?: number;
}

export interface FocusItem {
  start: number;
  /** minutes, pauses excluded */
  minutes: number;
  kind: 'pomo' | 'stopwatch';
  task?: string;
}

export interface TaskSource {
  readonly id: 'vault' | 'ticktick';
  open(): Promise<TaskItem[]>;
  completed(): Promise<TaskItem[]>;
}

export interface FocusSource {
  readonly id: 'local' | 'ticktick';
  sessions(): FocusItem[];
}

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export function bucketOf(due: number | undefined, allDay: boolean, now: Moment = m()): Bucket {
  if (due == null) return 'none';
  const d = m(due);
  const today = now.clone().startOf('day');
  if (!allDay ? d.isBefore(now) && !d.isSame(today, 'day') : d.isBefore(today, 'day')) return 'overdue';
  if (d.isBefore(today, 'day')) return 'overdue';
  if (d.isSame(today, 'day')) return 'today';
  if (d.isSame(today.clone().add(1, 'day'), 'day')) return 'tomorrow';
  if (d.diff(today, 'days') < 7) return 'week';
  return 'later';
}

export function groupByBucket<T extends { due?: number; allDay: boolean; priority: number }>(items: T[]): Record<Bucket, T[]> {
  const g: Record<Bucket, T[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], none: [] };
  for (const it of items) g[bucketOf(it.due, it.allDay)].push(it);
  const by = (a: T, b: T) => (b.priority || 0) - (a.priority || 0) || (a.due ?? 0) - (b.due ?? 0);
  for (const k of Object.keys(g) as Bucket[]) g[k].sort(by);
  return g;
}

export const dayKey = (t: number | Moment): string => m(t).locale('en').format('YYYY-MM-DD');

/** Consecutive days, ending today or yesterday, that appear in the set. */
export function streak(days: Set<string>, today: Moment = m()): number {
  let d = today.clone().startOf('day');
  if (!days.has(dayKey(d))) d = d.subtract(1, 'day');
  let n = 0;
  while (days.has(dayKey(d)) && n < 3650) { n++; d = d.subtract(1, 'day'); }
  return n;
}
