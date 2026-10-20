// Shapes returned by the TickTick Open API (https://developer.ticktick.com).
// Only the fields this plugin reads are listed.

export interface TTChecklistItem { id?: string; title: string; status: number }

export interface TTTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  desc?: string;
  status: number;
  priority?: number;
  dueDate?: string | null;
  startDate?: string | null;
  isAllDay?: boolean;
  timeZone?: string;
  completedTime?: string;
  repeatFlag?: string;
  reminders?: string[];
  tags?: string[];
  items?: TTChecklistItem[];
  parentId?: string;
  focusSummaries?: { pomoCount?: number; pomoDuration?: number; stopwatchDuration?: number; estimatedPomo?: number }[];
  deleted?: number;
  /** set locally while a create is in flight */
  _pending?: boolean;
}

export interface TTProject {
  id: string;
  name: string;
  color?: string;
  closed?: boolean;
  kind?: string;
  viewMode?: string;
  groupId?: string;
  /** set locally for the inbox, which the API does not list */
  inbox?: boolean;
}

export interface TTFocus {
  id: string;
  type: 0 | 1;
  startTime: string;
  endTime?: string;
  duration?: number;
  pauseDuration?: number;
  taskId?: string;
  note?: string;
  tasks?: { taskId?: string; title?: string }[];
}

export interface TTHabit {
  id: string;
  name: string;
  color?: string;
  goal?: number;
  step?: number;
  unit?: string;
  type?: string;
  status?: number;
  totalCheckIns?: number;
  encouragement?: string;
  repeatRule?: string;
}

export interface TTCheckin { stamp: number; value?: number; goal?: number; status?: number }

export interface TTCache {
  projects: TTProject[];
  tasks: TTTask[];
  completed: TTTask[];
  focus: TTFocus[];
  habits: TTHabit[];
  /** habitId -> stamp -> check-in */
  checkins: Record<string, Record<number, TTCheckin>>;
  tags: { name: string; label?: string }[];
  groups?: { id: string; name: string }[];
  countdowns?: { name: string; date?: number | string; color?: string }[];
  fetchOk?: string[];
  habitsOk?: boolean;
  syncedAt: number;
  fullAt: number;
}

export const emptyCache = (): TTCache => ({ projects: [], tasks: [], completed: [], focus: [], habits: [], checkins: {}, tags: [], syncedAt: 0, fullAt: 0 });
