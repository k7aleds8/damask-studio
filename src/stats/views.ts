import { setIcon } from 'obsidian';
import { formatNumber, m, t, weekdayNames } from '../i18n';
import type { Widgets } from '../ui/widgets';
import { bucketOf, dayKey, groupByBucket, streak, type FocusItem, type TaskItem } from './types';

const series = (i: number) => `var(--qh-c${(i % 5) + 1})`;

export interface TaskStatsOptions {
  /** offered on the overdue card when the source can reschedule */
  moveOverdueToToday?: (items: TaskItem[]) => Promise<void>;
  open?: (task: TaskItem) => void;
}

/** Everything about finished and open tasks, from any source. */
export function renderTaskStats(root: HTMLElement, w: Widgets, open: TaskItem[], allDone: TaskItem[], opts: TaskStatsOptions = {}): void {
  const g = root.createDiv('qh-grid');
  // only tasks with a known completion date can go on a timeline
  const done = allDone.filter((x) => x.completedAt != null).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const now = m();
  const weekStart = now.clone().startOf('week');
  const at = (x: TaskItem) => m(x.completedAt);
  const thisWeek = done.filter((x) => at(x).isAfter(weekStart)).length;
  const lastWeek = done.filter((x) => at(x).isAfter(weekStart.clone().subtract(1, 'week')) && at(x).isBefore(weekStart)).length;
  const run = streak(new Set(done.map((x) => dayKey(x.completedAt ?? 0))));
  const last30 = done.filter((x) => at(x).isAfter(now.clone().subtract(30, 'days'))).length;
  const G = groupByBucket(open);

  w.kpi(g, { n: thisWeek, label: t('stats.tasks.doneThisWeek'), sub: t(thisWeek >= lastWeek ? 'stats.vsLastWeekUp' : 'stats.vsLastWeekDown', { n: Math.abs(thisWeek - lastWeek) }), art: 'report', tone: 1 });
  w.kpi(g, { n: open.length, label: t('stats.tasks.open', { count: open.length }), sub: t('stats.tasks.overdueCount', { count: G.overdue.length }), art: 'list', tone: 2 });
  w.kpi(g, { n: run, label: t('stats.tasks.streak', { count: run }), sub: t('stats.tasks.streakSub'), art: 'flame', tone: 3 });
  w.kpi(g, { n: +(last30 / 30).toFixed(1), label: t('stats.tasks.perDay'), sub: t('stats.last30'), art: 'target', tone: 4 });

  const per: Record<string, number> = {};
  for (const x of done) { const k = dayKey(x.completedAt ?? 0); per[k] = (per[k] ?? 0) + 1; }
  w.heatGrid(w.card(g, 8, t('stats.tasks.heatmap')), per, 26, t('stats.units.tasksDone'));

  const urgent = (x: TaskItem) => ['overdue', 'today', 'tomorrow'].includes(bucketOf(x.due, x.allDay));
  const important = (x: TaskItem) => (x.priority || 0) >= 3;
  const quadrants: [string, string, TaskItem[], string][] = [
    [t('stats.matrix.do'), t('stats.matrix.doSub'), open.filter((x) => important(x) && urgent(x)), 'var(--qh-c3)'],
    [t('stats.matrix.plan'), t('stats.matrix.planSub'), open.filter((x) => important(x) && !urgent(x)), 'var(--qh-c1)'],
    [t('stats.matrix.delegate'), t('stats.matrix.delegateSub'), open.filter((x) => !important(x) && urgent(x)), 'var(--qh-c2)'],
    [t('stats.matrix.drop'), t('stats.matrix.dropSub'), open.filter((x) => !important(x) && !urgent(x)), 'var(--dm-faint)'],
  ];
  const eis = w.card(g, 4, t('stats.matrix.title')).createDiv('tt-eis');
  for (const [title, sub, list, color] of quadrants) {
    const q = eis.createDiv('tt-q');
    q.style.setProperty('--qc', color);
    const h = q.createDiv('tt-q-head');
    h.createSpan({ cls: 'tt-q-n', text: formatNumber(list.length) });
    const tt = h.createDiv();
    tt.createDiv({ cls: 'tt-q-t', text: title });
    tt.createDiv({ cls: 'tt-q-s', text: sub });
    for (const x of list.slice(0, 3)) q.createDiv({ cls: 'tt-q-item', text: x.title });
  }

  const weeks = new Array<number>(12).fill(0);
  for (const x of done) {
    const i = now.clone().endOf('week').diff(at(x), 'weeks');
    if (i >= 0 && i < 12) weeks[11 - i]++;
  }
  w.vbars(w.card(g, 6, t('stats.tasks.weekly')), weeks, weeks.map((_, i) => now.clone().subtract(11 - i, 'weeks').startOf('week').format('D MMM')), 'var(--dm-accent2)', t('stats.units.task'));

  const hours = new Array<number>(24).fill(0);
  for (const x of done) hours[at(x).hour()]++;
  w.radial(w.card(g, 3, t('stats.tasks.hours')), hours, t('stats.units.task'));

  const wd = new Array<number>(7).fill(0);
  for (const x of done) wd[at(x).day()]++;
  const names = weekdayNames();
  const first = m().startOf('week').day();
  const order = Array.from({ length: 7 }, (_, i) => (first + i) % 7);
  w.hbars(w.card(g, 3, t('stats.tasks.weekdays')), order.map((i) => [names[i], wd[i]]), 'var(--dm-accent)');

  const byList: Record<string, { name: string; color: string; n: number }> = {};
  for (const x of open) {
    const k = x.list.id;
    byList[k] = byList[k] ?? { name: x.list.name, color: x.list.color, n: 0 };
    byList[k].n++;
  }
  w.shareBar(w.card(g, 4, t('stats.tasks.byList')), Object.values(byList).sort((a, b) => b.n - a.n).slice(0, 8).map((x, i) => [x.name, x.n, x.color || series(i)]), t('stats.units.open'));

  const ac = w.card(g, 4, t('stats.tasks.overdueAge'));
  const ages: [string, number][] = [[t('stats.age.d2'), 0], [t('stats.age.d7'), 0], [t('stats.age.d30'), 0], [t('stats.age.older'), 0]];
  for (const x of G.overdue) {
    const a = now.diff(m(x.due), 'days');
    ages[a <= 2 ? 0 : a <= 7 ? 1 : a <= 30 ? 2 : 3][1]++;
  }
  w.hbars(ac, ages, 'var(--dm-accent3)');
  if (G.overdue.length && opts.moveOverdueToToday) {
    const b = ac.createEl('button', { cls: 'qh-link', text: t('stats.tasks.moveOverdue', { count: G.overdue.length }) });
    b.addEventListener('click', () => void opts.moveOverdueToToday!(G.overdue));
  }

  const tc = w.card(g, 4, t('stats.tasks.tags'));
  const tags: Record<string, number> = {};
  for (const x of done) for (const tag of x.tags) tags[tag] = (tags[tag] ?? 0) + 1;
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (topTags.length) w.hbars(tc, topTags.map(([k, v]) => ['#' + k, v]), 'var(--dm-accent2)');
  else w.empty(tc, t('stats.tasks.noTags'));

  const recent = w.card(g, 12, t('stats.tasks.recent')).createDiv('tt-recent');
  for (const x of done.slice(0, 12)) {
    const r = recent.createDiv('tt-rdone');
    setIcon(r.createSpan(), 'check');
    r.createSpan({ cls: 'tt-rdone-t', text: x.title });
    r.createSpan({ cls: 'qh-row-meta', text: at(x).fromNow() });
    if (opts.open && x.path) { r.addClass('is-link'); r.addEventListener('click', () => opts.open!(x)); }
  }
  if (!done.length) w.empty(recent, t('stats.tasks.noneDone'));
}

const hm = (minutes: number) => (minutes >= 60
  ? t('stats.units.hoursMinutes', { h: Math.floor(minutes / 60), m: String(Math.round(minutes % 60)).padStart(2, '0') })
  : t('stats.units.minutesShort', { n: Math.round(minutes) }));

/** Focus analytics for any session source. */
export function renderFocusStats(root: HTMLElement, w: Widgets, sessions: FocusItem[], emptyHint: string): void {
  const g = root.createDiv('qh-grid');
  if (!sessions.length) { w.empty(w.card(g, 12, t('stats.focus.title')), emptyHint); return; }
  const now = m();
  const weekStart = now.clone().startOf('week');
  const at = (f: FocusItem) => m(f.start);
  const sum = (list: FocusItem[]) => list.reduce((a, f) => a + f.minutes, 0);
  const week = sessions.filter((f) => at(f).isAfter(weekStart));
  const lastWeek = sessions.filter((f) => at(f).isAfter(weekStart.clone().subtract(1, 'week')) && at(f).isBefore(weekStart));
  const d30 = sessions.filter((f) => at(f).isAfter(now.clone().subtract(30, 'days')));
  const longest = sessions.reduce((a, f) => Math.max(a, f.minutes), 0);
  const delta = sum(week) - sum(lastWeek);

  w.kpi(g, { n: hm(sum(week)), label: t('stats.focus.thisWeek'), sub: t(delta >= 0 ? 'stats.focus.vsUp' : 'stats.focus.vsDown', { time: hm(Math.abs(delta)) }), art: 'timer', tone: 1 });
  w.kpi(g, { n: hm(sum(d30) / 30), label: t('stats.focus.daily'), sub: t('stats.last30'), art: 'hourglass', tone: 2 });
  w.kpi(g, { n: d30.length, label: t('stats.focus.sessions', { count: d30.length }), sub: t('stats.last30'), art: 'layers', tone: 4 });
  w.kpi(g, { n: hm(longest), label: t('stats.focus.longest'), sub: t('stats.focus.allKept'), art: 'medal', tone: 3 });

  const days = Array.from({ length: 30 }, (_, i) => now.clone().subtract(29 - i, 'days'));
  w.vbars(w.card(g, 8, t('stats.focus.perDay')), days.map((d) => Math.round(sum(sessions.filter((f) => at(f).isSame(d, 'day'))))), days.map((d) => d.format('D/M')), 'var(--dm-accent)', t('stats.units.minute'), 5);

  const hours = new Array<number>(24).fill(0);
  for (const f of sessions) hours[at(f).hour()] += f.minutes;
  w.radial(w.card(g, 4, t('stats.focus.when')), hours.map(Math.round), t('stats.units.minute'));

  const per: Record<string, number> = {};
  for (const f of sessions) {
    const k = f.task || t('stats.focus.noTask');
    per[k] = (per[k] ?? 0) + f.minutes;
  }
  w.hbars(w.card(g, 6, t('stats.focus.topTasks')), Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]), 'var(--dm-accent2)', t('stats.units.minuteShort'));

  w.shareBar(w.card(g, 6, t('stats.focus.kinds')), [
    [t('pomodoro.modes.pomo'), Math.round(sum(sessions.filter((f) => f.kind === 'pomo'))), 'var(--qh-c1)'],
    [t('pomodoro.modes.stopwatch'), Math.round(sum(sessions.filter((f) => f.kind === 'stopwatch'))), 'var(--qh-c2)'],
  ], t('stats.units.minute'));

  const pd: Record<string, number> = {};
  for (const f of sessions) { const k = dayKey(f.start); pd[k] = (pd[k] ?? 0) + Math.round(f.minutes); }
  w.heatGrid(w.card(g, 12, t('stats.focus.heatmap')), pd, 13, t('stats.units.focusMinute'));
}

