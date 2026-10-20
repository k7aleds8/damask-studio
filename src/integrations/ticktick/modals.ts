import { Modal, moment, Notice, setIcon, type App } from 'obsidian';
import type DamaskStudio from '../../main';
import { segmented, handler } from '../../core/dom';
import { dir, language, m, t } from '../../i18n';
import { timeZone, ttTime, type TickTickClient } from './client';
import type { TTHabit, TTProject, TTTask } from './types';

export const PRIORITIES = [0, 1, 3, 5] as const;
export const priorityColor = (p: number): string => ({ 0: 'var(--dm-faint)', 1: 'var(--qh-c1)', 3: 'var(--qh-c2)', 5: 'var(--qh-c3)' } as Record<number, string>)[p] ?? 'var(--dm-faint)';
export const priorityName = (p: number): string => t(`ticktick.priority.${({ 0: 'none', 1: 'low', 3: 'medium', 5: 'high' } as Record<number, 'none' | 'low' | 'medium' | 'high'>)[p] ?? 'none'}`);

const SWATCHES = ['#054239', '#428177', '#b9a779', '#988561', '#6b1f2a', '#a67b7c', '#3d3a3b', '#edebe0'];

/** Most Arabic-speaking countries rest Friday–Saturday, so the work-day preset follows the UI language. */
const WORKDAYS = () => (language() === 'ar' ? 'SU,MO,TU,WE,TH' : 'MO,TU,WE,TH,FR');

const repeatOptions = (): [string, string][] => [
  ['', t('ticktick.repeat.none')],
  ['RRULE:FREQ=DAILY;INTERVAL=1', t('ticktick.repeat.daily')],
  ['RRULE:FREQ=WEEKLY;INTERVAL=1', t('ticktick.repeat.weekly')],
  [`RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=${WORKDAYS()}`, t('ticktick.repeat.workdays')],
  ['RRULE:FREQ=MONTHLY;INTERVAL=1', t('ticktick.repeat.monthly')],
  ['RRULE:FREQ=YEARLY;INTERVAL=1', t('ticktick.repeat.yearly')],
];
const reminderOptions = (): [string, string][] => [
  ['', t('ticktick.remind.none')],
  ['TRIGGER:PT0S', t('ticktick.remind.atTime')],
  ['TRIGGER:-PT5M', t('ticktick.remind.m5')],
  ['TRIGGER:-PT30M', t('ticktick.remind.m30')],
  ['TRIGGER:-PT1H', t('ticktick.remind.h1')],
  ['TRIGGER:-P1D', t('ticktick.remind.d1')],
  ['TRIGGER:P0DT9H0M0S', t('ticktick.remind.morning')],
];

export const openInTickTick = (x: TTTask) => window.open(`https://ticktick.com/webapp/#p/${x.projectId}/tasks/${x.id}`);

export class TaskEditModal extends Modal {
  private d: TTTask;
  private isNew: boolean;

  constructor(app: App, private plugin: DamaskStudio, private task: TTTask | null) {
    super(app);
    this.isNew = !task;
    this.d = task ? structuredClone(task) : { id: '', title: '', content: '', status: 0, priority: 0, tags: [], items: [], projectId: plugin.ticktick!.defaultProjectId() };
  }

  private get tt(): TickTickClient { return this.plugin.ticktick!; }

  onOpen(): void {
    const d = this.d;
    const c = this.contentEl;
    this.modalEl.addClass('vs-modal', 'tt-edit-modal');
    c.addClass('tt-root');
    c.setAttr('dir', dir());
    c.style.setProperty('--pri', priorityColor(d.priority ?? 0));

    const top = c.createDiv('tt-ed-top');
    const check = top.createDiv({ cls: 'tt-check tt-ed-check', attr: { 'aria-label': t('ticktick.task.complete') } });
    if (this.isNew) check.hide();
    else check.addEventListener('click', () => { this.close(); void this.tt.complete(this.task!); });
    const title = top.createEl('textarea', { cls: 'tt-ed-title', attr: { rows: 1, dir: 'auto', placeholder: t('ticktick.task.titlePlaceholder') } });
    title.value = d.title ?? '';

    const grid = c.createDiv('tt-ed-grid');
    const main = grid.createDiv('tt-ed-main');
    const content = main.createEl('textarea', { cls: 'tt-ed-content', attr: { rows: 4, dir: 'auto', placeholder: t('ticktick.task.notesPlaceholder') } });
    content.value = d.content || d.desc || '';

    main.createDiv({ cls: 'tt-ed-label', text: t('ticktick.task.subtasks') });
    const subs = main.createDiv('tt-ed-subs');
    const drawSubs = () => {
      subs.empty();
      (d.items ?? []).forEach((it, i) => {
        const r = subs.createDiv('tt-ed-sub' + (it.status === 1 ? ' is-done' : ''));
        r.createDiv('tt-mini-check').addEventListener('click', () => { it.status = it.status === 1 ? 0 : 1; drawSubs(); });
        const input = r.createEl('input', { type: 'text', attr: { dir: 'auto' } });
        input.value = it.title;
        input.addEventListener('input', () => { it.title = input.value; });
        const x = r.createEl('button', { cls: 'tt-act' });
        setIcon(x, 'x');
        x.addEventListener('click', () => { d.items!.splice(i, 1); drawSubs(); });
      });
      const add = subs.createEl('input', { type: 'text', cls: 'tt-ed-subadd', attr: { placeholder: t('ticktick.task.addSubtask'), dir: 'auto' } });
      add.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !add.value.trim()) return;
        d.items = d.items ?? [];
        d.items.push({ title: add.value.trim(), status: 0 });
        drawSubs();
        subs.querySelector<HTMLInputElement>('.tt-ed-subadd')?.focus();
      });
    };
    drawSubs();

    if (!this.isNew) {
      main.createDiv({ cls: 'tt-ed-label', text: t('ticktick.task.comments') });
      const box = main.createDiv('tt-ed-comments');
      box.createDiv({ cls: 'qh-muted', text: t('common.loading') });
      const drawComments = async () => {
        const list = await this.tt.comments(this.task!);
        box.empty();
        for (const x of list) {
          const r = box.createDiv('tt-ed-comment');
          r.createDiv({ text: x.title });
          r.createDiv({ cls: 'qh-row-meta', text: x.createdTime ? m(x.createdTime).fromNow() : '' });
          const del = r.createEl('button', { cls: 'tt-act is-danger' });
          setIcon(del, 'trash-2');
          del.addEventListener('click', handler(async () => {
            await this.tt.deleteComment(this.task!, x.id).catch((e: Error) => new Notice(e.message));
            void drawComments();
          }));
        }
        const input = box.createEl('input', { type: 'text', cls: 'tt-ed-subadd', attr: { placeholder: t('ticktick.task.addComment'), dir: 'auto' } });
        input.addEventListener('keydown', handler(async (e) => {
          if (e.key !== 'Enter' || !input.value.trim()) return;
          const v = input.value.trim();
          input.value = '';
          await this.tt.addComment(this.task!, v).catch((er: Error) => new Notice(er.message));
          void drawComments();
        }));
      };
      void drawComments();
    }

    const side = grid.createDiv('tt-ed-side');
    const field = (label: string, icon: string) => {
      const f = side.createDiv('tt-ed-field');
      const h = f.createDiv('tt-ed-label');
      setIcon(h.createSpan(), icon);
      h.createSpan({ text: label });
      return f;
    };
    const list = field(t('ticktick.task.list'), 'list').createEl('select');
    for (const p of this.tt.openProjects()) list.createEl('option', { value: p.id, text: p.name });
    list.value = d.projectId;

    const dueField = field(t('ticktick.task.due'), 'calendar');
    const due = d.dueDate ? moment(d.dueDate) : null;
    const dateIn = dueField.createEl('input', { type: 'date' });
    const timeIn = dueField.createEl('input', { type: 'time' });
    if (due) {
      dateIn.value = due.clone().locale('en').format('YYYY-MM-DD');
      if (d.isAllDay === false) timeIn.value = due.format('HH:mm');
    }
    const quick = dueField.createDiv('tt-ed-quick');
    for (const [label, n] of [[t('ticktick.when.today'), 0], [t('ticktick.when.tomorrow'), 1], [t('ticktick.when.in3'), 3], [t('ticktick.when.week'), 7], [t('ticktick.when.none'), null]] as [string, number | null][]) {
      quick.createEl('button', { text: label }).addEventListener('click', () => {
        if (n == null) { dateIn.value = ''; timeIn.value = ''; } else dateIn.value = moment().add(n, 'days').locale('en').format('YYYY-MM-DD');
      });
    }

    const pri = field(t('ticktick.task.priority'), 'flag').createDiv('tt-ed-pri');
    for (const v of PRIORITIES) {
      const b = pri.createEl('button', { cls: (d.priority ?? 0) === v ? 'is-active' : '', text: priorityName(v) });
      b.style.setProperty('--pc', priorityColor(v));
      b.addEventListener('click', () => {
        d.priority = v;
        pri.querySelectorAll('button').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
        c.style.setProperty('--pri', priorityColor(v));
      });
    }

    const repeat = field(t('ticktick.task.repeat'), 'repeat').createEl('select');
    for (const [v, l] of repeatOptions()) repeat.createEl('option', { value: v, text: l });
    repeat.value = repeatOptions().some((x) => x[0] === (d.repeatFlag ?? '')) ? d.repeatFlag ?? '' : '';
    if (d.repeatFlag && !repeat.value) { repeat.createEl('option', { value: d.repeatFlag, text: t('ticktick.custom') }); repeat.value = d.repeatFlag; }

    const remind = field(t('ticktick.task.reminder'), 'bell').createEl('select');
    for (const [v, l] of reminderOptions()) remind.createEl('option', { value: v, text: l });
    const r0 = d.reminders?.[0] ?? '';
    remind.value = reminderOptions().some((x) => x[0] === r0) ? r0 : '';
    if (r0 && !remind.value) { remind.createEl('option', { value: r0, text: t('ticktick.custom') }); remind.value = r0; }

    const tagField = field(t('ticktick.task.tags'), 'tag');
    const tags = tagField.createEl('input', { type: 'text', attr: { placeholder: t('ticktick.task.tagsPlaceholder'), dir: 'auto' } });
    tags.value = (d.tags ?? []).join(', ');
    const known = tagField.createDiv('tt-ed-tags');
    for (const x of (this.tt.cache.tags ?? []).slice(0, 12)) {
      known.createEl('button', { text: '#' + (x.label || x.name) }).addEventListener('click', () => {
        const cur = splitTags(tags.value);
        if (!cur.includes(x.name)) cur.push(x.name);
        tags.value = cur.join(', ');
      });
    }

    const fs = d.focusSummaries?.[0];
    if (fs) {
      const minutes = Math.round(((fs.pomoDuration ?? 0) + (fs.stopwatchDuration ?? 0)) / 60);
      field(t('ticktick.task.focus'), 'timer').createDiv({ cls: 'qh-muted', text: t('ticktick.task.focusSummary', { pomos: fs.pomoCount ?? 0, minutes }) + (fs.estimatedPomo ? ' · ' + t('ticktick.task.estimate', { n: fs.estimatedPomo }) : '') });
    }

    const foot = c.createDiv('tt-ed-foot');
    const save = foot.createEl('button', { cls: 'mod-cta', text: this.isNew ? t('common.add') : t('common.save') });
    if (!this.isNew) {
      foot.createEl('button', { text: '▶ ' + t('pomodoro.modes.pomo') }).addEventListener('click', () => {
        const P = this.plugin.pomodoro;
        if (P) { P.setTask(this.task!.title, this.task!.id); P.setMode('pomo'); P.start(); }
        this.close();
      });
      foot.createEl('button', { text: t('ticktick.openInApp') }).addEventListener('click', () => openInTickTick(this.task!));
      const del = foot.createEl('button', { cls: 'mod-warning', text: t('common.delete') });
      del.addEventListener('click', () => {
        if (del.hasClass('is-armed')) { this.close(); void this.tt.remove(this.task!); }
        else { del.addClass('is-armed'); del.setText(t('common.confirmDelete')); }
      });
    }
    const build = (): Partial<TTTask> => {
      const patch: Partial<TTTask> = {
        title: title.value.trim(),
        content: content.value,
        priority: d.priority ?? 0,
        tags: splitTags(tags.value),
        items: (d.items ?? []).filter((i) => i.title?.trim()).map((i) => ({ ...i })),
        repeatFlag: repeat.value || '',
        reminders: remind.value ? [remind.value] : [],
      };
      if (dateIn.value) {
        const when = moment(dateIn.value + (timeIn.value ? ' ' + timeIn.value : ''), timeIn.value ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD');
        Object.assign(patch, { dueDate: ttTime(when), startDate: ttTime(when), isAllDay: !timeIn.value, timeZone: d.timeZone || timeZone() });
      } else if (d.dueDate) Object.assign(patch, { dueDate: null, startDate: null });
      return patch;
    };
    save.addEventListener('click', handler(async () => {
      const patch = build();
      if (!patch.title) { title.focus(); return; }
      this.close();
      if (this.isNew) {
        patch.projectId = list.value;
        if (!patch.repeatFlag) delete patch.repeatFlag;
        await this.tt.create(patch);
        return;
      }
      if (list.value !== this.task!.projectId) await this.tt.moveTask(this.task!, list.value);
      await this.tt.update(this.task!, patch);
    }));
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click(); });
    window.setTimeout(() => title.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}

const splitTags = (s: string) => s.split(/[،,]/).map((x) => x.trim()).filter(Boolean);

function swatchPicker(parent: HTMLElement, initial: string, onPick: (c: string) => void, custom: boolean): void {
  let color = initial;
  const box = parent.createDiv('tt-swatches');
  const draw = () => {
    box.empty();
    for (const col of SWATCHES) {
      const b = box.createDiv('tt-sw' + (col === color ? ' is-active' : ''));
      b.style.background = col;
      b.addEventListener('click', () => { color = col; onPick(col); draw(); });
    }
    if (custom) {
      const pick = box.createEl('input', { type: 'color' });
      pick.value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#b9a779';
      pick.addEventListener('input', () => { color = pick.value; onPick(pick.value); });
    }
  };
  draw();
}

export class ListModal extends Modal {
  constructor(app: App, private plugin: DamaskStudio, private project: TTProject | null) { super(app); }

  onOpen(): void {
    const c = this.contentEl;
    this.modalEl.addClass('vs-modal');
    c.addClass('tt-root');
    c.setAttr('dir', dir());
    c.createEl('h3', { text: this.project ? t('ticktick.lists.edit') : t('ticktick.lists.new') });
    const name = c.createEl('input', { type: 'text', cls: 'tt-input', attr: { placeholder: t('ticktick.lists.name'), dir: 'auto' } });
    name.value = this.project?.name ?? '';
    let color = this.project?.color || SWATCHES[0];
    let view = this.project?.viewMode || 'list';
    c.createDiv({ cls: 'tt-ed-label', text: t('common.color') });
    swatchPicker(c, color, (v) => { color = v; }, true);
    c.createDiv({ cls: 'tt-ed-label', text: t('ticktick.lists.viewMode') });
    segmented(c, [['list', t('ticktick.lists.modeList'), 'list'], ['kanban', t('ticktick.lists.modeKanban'), 'columns-3'], ['timeline', t('ticktick.lists.modeTimeline'), 'gantt-chart']], view, (v) => { view = v; });
    const row = c.createDiv('vs-row-end');
    row.createEl('button', { cls: 'mod-cta', text: this.project ? t('common.save') : t('common.create') }).addEventListener('click', handler(async () => {
      const n = name.value.trim();
      if (!n) { name.focus(); return; }
      this.close();
      const tt = this.plugin.ticktick!;
      if (this.project) await tt.updateProject(this.project, { name: n, color, viewMode: view });
      else await tt.createProject({ name: n, color, viewMode: view });
    }));
    window.setTimeout(() => name.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}

export class HabitModal extends Modal {
  constructor(app: App, private plugin: DamaskStudio, private habit: TTHabit | null) { super(app); }

  onOpen(): void {
    const c = this.contentEl;
    this.modalEl.addClass('vs-modal');
    c.addClass('tt-root');
    c.setAttr('dir', dir());
    c.createEl('h3', { text: this.habit ? t('ticktick.habits.edit') : t('ticktick.habits.new') });
    const name = c.createEl('input', { type: 'text', cls: 'tt-input', attr: { placeholder: t('ticktick.habits.name'), dir: 'auto' } });
    name.value = this.habit?.name ?? '';
    const cheer = c.createEl('input', { type: 'text', cls: 'tt-input', attr: { placeholder: t('ticktick.habits.encouragement'), dir: 'auto' } });
    cheer.value = this.habit?.encouragement ?? '';
    let color = this.habit?.color || SWATCHES[2];
    let freq = this.habit?.repeatRule || 'RRULE:FREQ=DAILY;INTERVAL=1';
    c.createDiv({ cls: 'tt-ed-label', text: t('common.color') });
    swatchPicker(c, color, (v) => { color = v; }, false);
    c.createDiv({ cls: 'tt-ed-label', text: t('ticktick.task.repeat') });
    const weekend = WORKDAYS() === 'SU,MO,TU,WE,TH' ? 'FR,SA' : 'SA,SU';
    segmented(c, [
      ['RRULE:FREQ=DAILY;INTERVAL=1', t('ticktick.repeat.daily')],
      [`RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=${WORKDAYS()}`, t('ticktick.repeat.workdays')],
      [`RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=${weekend}`, t('ticktick.repeat.weekends')],
    ], freq, (v) => { freq = v; });
    const row = c.createDiv('vs-row-end');
    const tt = this.plugin.ticktick!;
    row.createEl('button', { cls: 'mod-cta', text: this.habit ? t('common.save') : t('common.create') }).addEventListener('click', handler(async () => {
      const n = name.value.trim();
      if (!n) return;
      this.close();
      const data = { name: n, color, repeatRule: freq, encouragement: cheer.value.trim() };
      if (this.habit) await tt.updateHabit(this.habit, data);
      else await tt.createHabit(data);
    }));
    if (this.habit) {
      row.createEl('button', { text: t('ticktick.habits.archive') }).addEventListener('click', handler(async () => {
        this.close();
        await tt.updateHabit(this.habit!, { status: 1 });
        tt.cache.habits = tt.cache.habits.filter((x) => x !== this.habit);
        tt.emit();
      }));
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

export class TrashModal extends Modal {
  constructor(app: App, private plugin: DamaskStudio) { super(app); }
  onOpen(): void { this.draw(); }
  onClose(): void { this.contentEl.empty(); }

  private draw(): void {
    const c = this.contentEl;
    const mirror = this.plugin.ticktickMirror!;
    c.empty();
    c.addClass('tt-root', 'tm-trash');
    c.setAttr('dir', dir());
    c.createEl('h3', { text: t('ticktick.trash.title') });
    c.createEl('p', { cls: 'qh-muted', text: t('ticktick.trash.intro') });
    if (!mirror.st.trash.length) { c.createDiv({ cls: 'qh-empty', text: t('ticktick.trash.empty') }); return; }
    const list = c.createDiv('tm-trash-list');
    for (const e of mirror.st.trash.slice(0, 120)) {
      const r = list.createDiv('tm-trash-row');
      const tt = r.createDiv('tm-trash-t');
      tt.createDiv({ cls: 'tm-trash-name', text: (e.kind === 'habit' ? t('ticktick.trash.habit') + ' ' : '') + (e.data.t || e.data.name || '') });
      tt.createDiv({ cls: 'qh-row-meta', text: [e.list, e.why, m(e.at).fromNow()].filter(Boolean).join(' · ') });
      const b = r.createEl('button', { text: t('ticktick.trash.restore') });
      b.addEventListener('click', handler(async () => { b.disabled = true; await mirror.restore(e); this.draw(); }));
    }
    c.createDiv({ cls: 'qh-muted', text: t('ticktick.trash.count', { count: mirror.st.trash.length }) });
  }
}

