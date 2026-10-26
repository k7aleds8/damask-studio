import { moment } from '../../core/time';
import type { FocusItem, FocusSource, TaskItem, TaskSource } from '../../stats/types';
import type { TickTickClient } from './client';
import type { TTFocus, TTTask } from './types';

export function toTaskItem(c: TickTickClient, x: TTTask, done: boolean): TaskItem {
  const p = c.project(x.projectId);
  const due = c.due(x);
  return {
    id: x.id,
    title: x.title,
    done,
    completedAt: x.completedTime ? moment(x.completedTime).valueOf() : undefined,
    due: due?.valueOf(),
    allDay: x.isAllDay !== false,
    priority: x.priority ?? 0,
    tags: x.tags ?? [],
    list: { id: x.projectId, name: p?.name ?? '?', color: c.projectColor(p) },
  };
}

export class TickTickTaskSource implements TaskSource {
  readonly id = 'ticktick' as const;
  constructor(private c: TickTickClient) {}
  open(): Promise<TaskItem[]> {
    return Promise.resolve(this.c.cache.tasks.filter((x) => !x.parentId).map((x) => toTaskItem(this.c, x, false)));
  }
  completed(): Promise<TaskItem[]> {
    return Promise.resolve(this.c.cache.completed.map((x) => toTaskItem(this.c, x, true)));
  }
}

export class TickTickFocusSource implements FocusSource {
  readonly id = 'ticktick' as const;
  constructor(private c: TickTickClient) {}
  sessions(): FocusItem[] {
    const titles: Record<string, string> = {};
    for (const x of [...this.c.cache.tasks, ...this.c.cache.completed]) titles[x.id] = x.title;
    return this.c.cache.focus
      .filter((f) => f.startTime)
      .map((f) => {
        const linked = f.tasks?.find((x) => x.title || x.taskId);
        const id = linked?.taskId ?? f.taskId;
        return {
          start: moment(f.startTime).valueOf(),
          minutes: focusMinutes(f),
          kind: f.type === 1 ? 'stopwatch' : 'pomo',
          task: linked?.title ?? (id ? titles[id] : undefined) ?? f.note,
        };
      });
  }
}

/**
 * TickTick reports `duration` in milliseconds and `pauseDuration` in seconds.
 * Records without a duration fall back to the time between start and end.
 */
export function focusMinutes(f: TTFocus): number {
  if (f.duration != null) return Math.max(0, f.duration / 60000);
  const span = moment(f.endTime).diff(moment(f.startTime), 'seconds') - (f.pauseDuration ?? 0);
  return Math.max(0, span / 60);
}
