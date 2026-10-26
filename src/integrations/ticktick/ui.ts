import { handler } from '../../core/dom';
import { Component, ItemView, Modal, Notice, Platform, setIcon, type App, type WorkspaceLeaf } from 'obsidian';
import { moment } from '../../core/time';
import type { Moment } from 'moment';
import type DamaskStudio from '../../main';
import { dir, formatNumber, formatPercent, m, t } from '../../i18n';
import { renderFocusStats, renderTaskStats } from '../../stats/views';
import { bucketOf, type Bucket } from '../../stats/types';
import { Widgets } from '../../ui/widgets';
import { renderPomodoro, renderPomodoroSettings, type PomoTaskChoice } from '../../modules/pomodoro/panel';
import { series, themedColor, timeZone, ttStamp, ttTime, type TickTickClient } from './client';
import { HabitModal, ListModal, PRIORITIES, priorityColor, TaskEditModal, TrashModal } from './modals';
import { parseQuickAdd } from './quick-add';
import { focusMinutes, TickTickFocusSource, toTaskItem } from './source';
import type { TTTask } from './types';

export const TASK_CENTER_VIEW = 'damask-task-center';
type Tab = 'tasks' | 'lists' | 'focus' | 'habits' | 'stats' | 'app' | 'help';
type Groups = ReturnType<TickTickUI['groups']>;
type Filter = (list: TTTask[]) => TTTask[];

/** Every TickTick screen: the Task Center tabs and the pieces embedded on Home. */
export class TickTickUI {
  filter: string | null = null;

  constructor(private plugin: DamaskStudio) {}

  get tt(): TickTickClient { return this.plugin.ticktick!; }
  get S() { return this.plugin.settings.ticktick; }
  get app(): App { return this.plugin.app; }

  groups() {
    const g: Record<Bucket, TTTask[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], none: [] };
    for (const x of this.tt.cache.tasks) if (!x.parentId) g[bucketOf(this.tt.due(x)?.valueOf(), x.isAllDay !== false)].push(x);
    const by = (a: TTTask, b: TTTask) => (b.priority ?? 0) - (a.priority ?? 0) || (this.tt.due(a)?.valueOf() ?? 0) - (this.tt.due(b)?.valueOf() ?? 0);
    for (const k of Object.keys(g) as Bucket[]) g[k].sort(by);
    return g;
  }

  private doneToday(): TTTask[] { return this.tt.cache.completed.filter((x) => moment(x.completedTime).isSame(moment(), 'day')); }
  private status(): string {
    if (this.tt.busy) return t('ticktick.status.syncing');
    if (this.tt.error) return '⚠ ' + this.tt.error;
    return this.tt.cache.syncedAt ? t('ticktick.status.synced', { when: m(this.tt.cache.syncedAt).fromNow() }) : t('ticktick.status.never');
  }

  /* ------------------------------------------------------------ actions used elsewhere */

  async sendLine(text: string, path?: string): Promise<void> {
    const q = parseQuickAdd(text, this.tt.cache.projects);
    const x: Partial<TTTask> = {
      title: q.title || text,
      projectId: q.projectId || this.tt.defaultProjectId(),
      content: path ? `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(path)}` : '',
    };
    if (q.dueDate) Object.assign(x, { dueDate: ttTime(q.dueDate), startDate: ttTime(q.dueDate), isAllDay: q.isAllDay });
    if (q.priority) x.priority = q.priority;
    if (q.tags.length) x.tags = q.tags;
    await this.tt.create(x);
  }

  async moveToToday(ids: string[]): Promise<void> {
    for (const id of ids) {
      const x = this.tt.cache.tasks.find((y) => y.id === id);
      if (x) await this.tt.setDay(x, moment());
    }
  }

  /** Render into `holder` now and again on every sync, until the owner unloads. */
  private live(holder: HTMLElement, owner: Component, draw: () => void, skipWhile: string): void {
    const run = () => { holder.empty(); try { draw(); } catch (e) { console.error(e); } };
    run();
    const off = this.tt.on(() => { if (!holder.isConnected) { off(); return; } if (!holder.matches(skipWhile)) run(); });
    owner.register(off);
  }

  mountHome(holder: HTMLElement, owner: Component): void {
    this.live(holder, owner, () => this.homeSection(holder), ':focus-within');
  }

  mountHabits(holder: HTMLElement, owner: Component): void {
    this.live(holder, owner, () => this.habitsGrid(holder, new Widgets()), ':hover');
  }

  /* ------------------------------------------------------------ building blocks */

  quickAdd(parent: HTMLElement): HTMLInputElement {
    const box = parent.createDiv('tt-qa');
    const row = box.createDiv('tt-qa-row');
    setIcon(row.createSpan('tt-qa-ic'), 'plus');
    const input = row.createEl('input', { type: 'text', cls: 'tt-qa-input', attr: { placeholder: t('ticktick.quickAdd.placeholder'), dir: 'auto' } });
    const select = row.createEl('select', { cls: 'tt-qa-list' });
    for (const p of this.tt.openProjects()) select.createEl('option', { value: p.id, text: p.name });
    if (this.S.defaultProject) select.value = this.S.defaultProject;
    const add = row.createEl('button', { cls: 'mod-cta tt-qa-btn', text: t('common.add') });
    const chips = box.createDiv('tt-qa-chips');
    const preview = () => {
      chips.empty();
      const r = parseQuickAdd(input.value, this.tt.cache.projects);
      for (const [icon, label] of r.chips) {
        const c = chips.createSpan('tt-chip');
        setIcon(c.createSpan(), icon);
        c.createSpan({ text: label });
      }
      if (!r.chips.length && input.value) chips.createSpan({ cls: 'qh-muted', text: t('ticktick.quickAdd.hint') });
      return r;
    };
    const go = async () => {
      const r = preview();
      if (!r.title) return;
      const x: Partial<TTTask> = { title: r.title, projectId: r.projectId || select.value };
      if (r.dueDate) Object.assign(x, { dueDate: ttTime(r.dueDate), startDate: ttTime(r.dueDate), isAllDay: r.isAllDay });
      if (r.priority) x.priority = r.priority;
      if (r.tags.length) x.tags = r.tags;
      input.value = '';
      chips.empty();
      await this.tt.create(x);
    };
    input.addEventListener('input', preview);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } });
    select.addEventListener('change', handler(async () => { this.S.defaultProject = select.value; await this.plugin.saveSettings(); }));
    add.addEventListener('click', () => void go());
    return input;
  }

  private dragTask(el: HTMLElement, x: TTTask): void {
    el.setAttr('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/tt-task', x.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      el.addClass('is-dragging');
      document.body.addClass('tt-dragging');
    });
    el.addEventListener('dragend', () => { el.removeClass('is-dragging'); document.body.removeClass('tt-dragging'); });
  }

  private dropZone(el: HTMLElement, onDrop: (x: TTTask) => void): void {
    el.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('text/tt-task')) { e.preventDefault(); el.addClass('is-over'); } });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget as Node)) el.removeClass('is-over'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.removeClass('is-over');
      const x = this.tt.cache.tasks.find((y) => y.id === e.dataTransfer?.getData('text/tt-task'));
      if (x) onDrop(x);
    });
  }

  private burst(el: HTMLElement): void {
    const b = el.createDiv('tt-burst');
    for (let i = 0; i < 8; i++) b.createSpan().style.setProperty('--a', `${i * 45}deg`);
    window.setTimeout(() => b.remove(), 700);
  }

  taskRow(parent: HTMLElement, x: TTTask, opts: { noList?: boolean; noDue?: boolean } = {}): HTMLElement {
    const P = this.plugin.pomodoro;
    const r = parent.createDiv('tt-task' + (x._pending ? ' is-pending' : '') + (P?.st.running && P.st.taskId === x.id ? ' is-focus' : ''));
    r.style.setProperty('--pri', priorityColor(x.priority ?? 0));
    this.dragTask(r, x);
    const check = r.createDiv({ cls: 'tt-check', attr: { 'aria-label': t('ticktick.task.complete') } });
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      r.addClass('is-done');
      this.burst(check);
      window.setTimeout(() => void this.tt.complete(x), 380);
    });
    const body = r.createDiv('tt-task-body');
    body.createDiv({ cls: 'tt-task-title', text: x.title });
    const meta = body.createDiv('tt-task-meta');
    const p = this.tt.project(x.projectId);
    if (p && !opts.noList) {
      const c = meta.createSpan('tt-list');
      c.createSpan('tt-dot').style.background = this.tt.projectColor(p);
      c.createSpan({ text: p.name });
    }
    const due = this.tt.due(x);
    if (due && !opts.noDue) {
      const late = bucketOf(due.valueOf(), x.isAllDay !== false) === 'overdue';
      meta.createSpan({
        cls: 'tt-due' + (late ? ' is-overdue' : ''),
        text: late ? t('ticktick.task.lateBy', { time: m(due).fromNow(true) }) : m(due).format(x.isAllDay === false ? 'ddd D MMM, HH:mm' : 'ddd D MMM'),
      });
    } else if (due && x.isAllDay === false) meta.createSpan({ cls: 'tt-due', text: due.format('HH:mm') });
    if (x.repeatFlag) setIcon(meta.createSpan('tt-mi'), 'repeat');
    if (x.reminders?.length) setIcon(meta.createSpan('tt-mi'), 'bell');
    if (x.items?.length) {
      const done = x.items.filter((i) => i.status === 1).length;
      const pr = meta.createSpan('tt-subprog');
      pr.createSpan({ text: `${done}/${x.items.length}` });
      pr.createSpan('tt-subbar').createSpan().style.width = `${(done / x.items.length) * 100}%`;
    }
    const fs = x.focusSummaries?.[0];
    if (fs?.pomoCount) meta.createSpan({ cls: 'tt-mi', text: '🍅' + fs.pomoCount });
    for (const tag of (x.tags ?? []).slice(0, 3)) meta.createSpan({ cls: 'tt-tag', text: '#' + tag });

    const acts = r.createDiv('tt-acts');
    const A = (icon: string, label: string, act: (b: HTMLButtonElement) => void, cls = '') => {
      const b = acts.createEl('button', { cls: 'tt-act ' + cls, attr: { 'aria-label': label } });
      setIcon(b, icon);
      b.addEventListener('click', (e) => { e.stopPropagation(); act(b); });
    };
    if (P) A('play', t('ticktick.task.startPomo'), () => { P.setTask(x.title, x.id); P.setMode('pomo'); P.start(); new Notice(t('pomodoro.notices.started', { title: x.title })); });
    A('sun', t('ticktick.task.toToday'), () => void this.tt.setDay(x, moment()));
    A('calendar-plus', t('ticktick.task.postpone'), () => void this.tt.postpone(x, 1));
    A('flag', t('ticktick.task.cyclePriority'), () => void this.tt.update(x, { priority: PRIORITIES[(PRIORITIES.indexOf((x.priority ?? 0) as 0) + 1) % 4] }));
    A('trash-2', t('ticktick.task.deleteTwice'), (b) => {
      if (b.hasClass('is-armed')) void this.tt.remove(x);
      else { b.addClass('is-armed'); window.setTimeout(() => b.removeClass('is-armed'), 2500); }
    }, 'is-danger');
    body.addEventListener('click', () => new TaskEditModal(this.app, this.plugin, x).open());
    return r;
  }

  private column(parent: HTMLElement, title: string, icon: string, list: TTTask[], cls: string, onDrop: ((x: TTTask) => void) | null, hint?: string, total?: number): HTMLElement {
    const c = parent.createDiv('tt-col ' + cls);
    const h = c.createDiv('tt-col-head');
    setIcon(h.createSpan('tt-col-ico'), icon);
    h.createSpan({ text: title });
    h.createSpan({ cls: 'tt-col-n', text: formatNumber(total ?? list.length) });
    const box = c.createDiv('tt-col-list');
    if (!list.length) box.createDiv({ cls: 'tt-empty', text: hint ?? t('ticktick.dropHere') });
    for (const x of list) this.taskRow(box, x);
    if (onDrop) this.dropZone(c, onDrop);
    else c.addClass('no-drop');
    return c;
  }

  private choices(): PomoTaskChoice[] {
    const G = this.groups();
    const out: PomoTaskChoice[] = [];
    const add = (group: string, list: TTTask[]) => { for (const x of list) out.push({ title: x.title, ticktickId: x.id, group }); };
    add(t('pomodoro.groups.now'), [...G.overdue, ...G.today]);
    add(t('pomodoro.groups.next'), [...G.tomorrow, ...G.week]);
    add(t('pomodoro.groups.rest'), [...G.later, ...G.none]);
    return out;
  }

  /* ------------------------------------------------------------ home */

  private homeSection(el: HTMLElement): void {
    const w = new Widgets();
    const g = el.createDiv('qh-grid');
    const c = w.card(g, 12, t('ticktick.home.title'), 'tt-home');
    const head = c.querySelector<HTMLElement>('.qh-card-head')!;
    head.createSpan({ cls: 'tt-status', text: this.status() });
    head.createEl('button', { cls: 'qh-link tt-open', text: t('ticktick.home.openCenter') }).addEventListener('click', () => void this.plugin.openTaskCenter());
    const sync = head.createEl('button', { cls: 'tt-sync' + (this.tt.busy ? ' is-busy' : ''), attr: { 'aria-label': t('ticktick.syncNow') } });
    setIcon(sync, 'refresh-cw');
    sync.addEventListener('click', () => void this.tt.sync());
    this.quickAdd(c);
    const G = this.groups();
    const lay = c.createDiv('tt-home-lay');
    const cols = lay.createDiv('tt-cols tt-cols-3');
    const col = (title: string, icon: string, list: TTTask[], cls: string, drop: ((x: TTTask) => void) | null) => {
      const x = this.column(cols, title, icon, list.slice(0, 6), cls, drop, cls === 'is-overdue' ? t('ticktick.nothingLate') : t('ticktick.empty'), list.length);
      if (list.length > 6) x.createEl('button', { cls: 'qh-link', text: t('ticktick.more', { count: list.length - 6 }) }).addEventListener('click', () => void this.plugin.openTaskCenter());
    };
    col(t('ticktick.cols.overdue'), 'alarm-clock-off', G.overdue, 'is-overdue', null);
    col(t('ticktick.cols.today'), 'sun', G.today, 'is-today', (x) => void this.tt.setDay(x, moment()));
    col(t('ticktick.cols.upcoming'), 'calendar-range', [...G.tomorrow, ...G.week], '', (x) => void this.tt.setDay(x, moment().add(1, 'day')));
    const side = lay.createDiv('tt-home-side');
    if (this.plugin.pomodoro) {
      const holder = side.createDiv();
      const draw = () => { holder.empty(); renderPomodoro(holder, this.plugin, this.choices(), true, draw); };
      draw();
    }
    const next = this.countdowns().find((x) => !x.d.isBefore(moment(), 'day'));
    if (next) {
      const k = side.createDiv('tt-cd is-mini');
      k.style.setProperty('--lc', themedColor(next.color, 0));
      k.createDiv({ cls: 'tt-cd-n', text: formatNumber(next.d.diff(moment().startOf('day'), 'days')) });
      k.createDiv({ cls: 'tt-cd-l', text: t('ticktick.countdown.until') });
      k.createDiv({ cls: 'tt-cd-t', text: next.name });
    }
    const foot = c.createDiv('tt-home-foot');
    const done = this.doneToday();
    const total = done.length + G.today.length + G.overdue.length;
    const prog = foot.createDiv('tt-today-prog');
    w.ring(prog, total ? done.length / total : 0, 46, 'var(--dm-accent2)', formatNumber(done.length));
    prog.createDiv({ cls: 'qh-muted', text: t('ticktick.home.progress', { done: done.length, total }) });
    const days = Array.from({ length: 14 }, (_, i) => moment().subtract(13 - i, 'days'));
    const sp = foot.createDiv('tt-home-spark');
    sp.createDiv({ cls: 'qh-muted', text: t('ticktick.home.doneSpark') });
    w.sparkline(sp, days.map((d) => this.tt.cache.completed.filter((x) => moment(x.completedTime).isSame(d, 'day')).length), { w: 260, h: 40, color: 'var(--dm-accent2)' });
    const sp2 = foot.createDiv('tt-home-spark');
    sp2.createDiv({ cls: 'qh-muted', text: t('ticktick.home.focusSpark') });
    w.sparkline(sp2, days.map((d) => Math.round(this.tt.cache.focus.filter((f) => f.startTime && moment(f.startTime).isSame(d, 'day')).reduce((a, f) => a + focusMinutes(f), 0))), { w: 260, h: 40, color: 'var(--dm-accent)' });
  }

  private countdowns() {
    return (this.tt.cache.countdowns ?? [])
      .map((x) => {
        const s = String(x.date ?? '');
        return { ...x, d: s.length === 8 ? moment(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, 'YYYY-MM-DD') : null };
      })
      .filter((x): x is typeof x & { d: Moment } => !!x.d)
      .sort((a, b) => a.d.valueOf() - b.d.valueOf());
  }

  /* ------------------------------------------------------------ task center tabs */

  render(el: HTMLElement, tab: Tab, rerender: () => void): void {
    el.empty();
    el.addClass('qh-root', 'tt-root');
    el.setAttr('dir', dir());
    if (!this.tt.active) { this.connect(el, rerender); return; }
    this.header(el, tab, rerender);
    const body = el.createDiv('tt-body');
    const w = new Widgets();
    switch (tab) {
      case 'lists': this.listsTab(body, w); break;
      case 'focus': this.focusTab(body, w, rerender); break;
      case 'habits': this.habitsTab(body, w); break;
      case 'stats': renderTaskStats(body, w, this.tt.cache.tasks.filter((x) => !x.parentId).map((x) => toTaskItem(this.tt, x, false)), this.tt.cache.completed.map((x) => toTaskItem(this.tt, x, true)), { moveOverdueToToday: (items) => this.moveToToday(items.map((x) => x.id)) }); break;
      case 'app': this.appTab(body); break;
      case 'help': this.helpTab(body, w); break;
      default: this.tasksTab(body, rerender);
    }
  }

  /** Token screen, also used inside the control panel. */
  connect(el: HTMLElement, after: () => void): void {
    const w = new Widgets();
    const c = w.card(el.createDiv('qh-grid'), 12, t('ticktick.connect.title'), 'tt-connect');
    if (!this.plugin.settings.integrations.ticktick) {
      c.createDiv({ cls: 'tt-connect-lead', text: t('ticktick.connect.disabled') });
      c.createEl('button', { cls: 'mod-cta', text: t('ticktick.connect.openPanel') }).addEventListener('click', () => void this.plugin.openStudio('integrations'));
      return;
    }
    c.createDiv({ cls: 'tt-connect-lead', text: t('ticktick.connect.lead') });
    const steps = c.createEl('ol', { cls: 'tt-steps' });
    for (const s of [t('ticktick.connect.step1'), t('ticktick.connect.step2'), t('ticktick.connect.step3')]) steps.createEl('li', { text: s });
    const row = c.createDiv('tt-token-row');
    const input = row.createEl('input', { type: 'password', cls: 'tt-input', attr: { placeholder: t('ticktick.connect.placeholder'), dir: 'ltr', autocomplete: 'off' } });
    const btn = row.createEl('button', { cls: 'mod-cta', text: t('ticktick.connect.connect') });
    row.createEl('button', { text: t('ticktick.connect.openSettings') }).addEventListener('click', () => window.open('https://ticktick.com/webapp/#settings/account'));
    const msg = c.createDiv('qh-muted');
    c.createDiv({ cls: 'tt-safe', text: t('ticktick.connect.privacy') });
    btn.addEventListener('click', handler(async () => {
      const v = input.value.trim();
      if (!v) return;
      btn.disabled = true;
      msg.setText(t('ticktick.connect.checking'));
      try {
        const n = await this.tt.test(v);
        msg.setText(t('ticktick.connect.ok', { count: n }));
        await this.tt.sync({ full: true });
        after();
      } catch (e) {
        msg.setText(t('ticktick.connect.failed', { error: (e as Error).message }));
        btn.disabled = false;
      }
    }));
  }

  private header(el: HTMLElement, tab: Tab, rerender: () => void): void {
    const h = el.createDiv('tt-head');
    const brand = h.createDiv('tt-brand').createDiv();
    brand.createDiv({ cls: 'tt-title', text: t('ticktick.center.title') });
    const st = brand.createDiv({ cls: 'tt-status', text: this.status() });
    if (this.tt.error) st.addClass('is-err');
    const tabs = h.createDiv('tt-tabs');
    const list: [Tab, string, string][] = [
      ['tasks', t('ticktick.tabs.tasks'), 'list-checks'],
      ['lists', t('ticktick.tabs.lists'), 'folder-kanban'],
      ['focus', t('ticktick.tabs.focus'), 'timer'],
      ['habits', t('ticktick.tabs.habits'), 'repeat'],
      ['stats', t('ticktick.tabs.stats'), 'bar-chart-3'],
      ['app', t('ticktick.tabs.app'), 'app-window'],
      ['help', '', 'life-buoy'],
    ];
    for (const [id, label, icon] of list) {
      const b = tabs.createEl('button', { cls: 'tt-tab' + (tab === id ? ' is-active' : ''), attr: { 'aria-label': label || t('ticktick.tabs.help') } });
      setIcon(b.createSpan(), icon);
      if (label) b.createSpan({ text: label });
      b.addEventListener('click', handler(async () => { this.S.tab = id; await this.plugin.saveSettings(); rerender(); }));
    }
    const sync = h.createEl('button', { cls: 'tt-sync' + (this.tt.busy ? ' is-busy' : ''), attr: { 'aria-label': t('ticktick.syncNow') } });
    setIcon(sync, 'refresh-cw');
    sync.addEventListener('click', () => void this.tt.sync());
  }

  private tasksTab(b: HTMLElement, rerender: () => void): void {
    const bar = b.createDiv('tt-toolbar');
    this.quickAdd(bar);
    const nb = bar.createDiv('tt-tool-right').createEl('button', { cls: 'tt-newbtn' });
    setIcon(nb.createSpan(), 'square-pen');
    nb.createSpan({ text: t('ticktick.task.detailed') });
    nb.addEventListener('click', () => new TaskEditModal(this.app, this.plugin, null).open());

    const view = this.S.view || 'board';
    const vs = b.createDiv('tt-viewbar');
    const seg = vs.createDiv('tt-views');
    for (const [id, label, icon] of [['board', t('ticktick.views.board'), 'columns-3'], ['week', t('ticktick.views.week'), 'calendar-days'], ['matrix', t('ticktick.views.matrix'), 'grid-2x2'], ['lists', t('ticktick.views.lists'), 'list-tree']] as const) {
      const x = seg.createEl('button', { cls: 'tt-view-btn' + (view === id ? ' is-active' : '') });
      setIcon(x.createSpan(), icon);
      x.createSpan({ text: label });
      x.addEventListener('click', handler(async () => { this.S.view = id; await this.plugin.saveSettings(); rerender(); }));
    }
    const fl = vs.createDiv('tt-filter');
    const counts: Record<string, number> = {};
    for (const x of this.tt.cache.tasks) counts[x.projectId] = (counts[x.projectId] ?? 0) + 1;
    fl.createEl('button', { cls: 'tt-fchip' + (!this.filter ? ' is-active' : ''), text: t('ticktick.filterAll', { n: this.tt.cache.tasks.length }) }).addEventListener('click', () => { this.filter = null; rerender(); });
    for (const p of this.tt.cache.projects.filter((x) => counts[x.id])) {
      const c = fl.createEl('button', { cls: 'tt-fchip' + (this.filter === p.id ? ' is-active' : '') });
      c.createSpan('tt-dot').style.background = this.tt.projectColor(p);
      c.createSpan({ text: `${p.name} ${formatNumber(counts[p.id])}` });
      c.addEventListener('click', () => { this.filter = p.id; rerender(); });
    }

    const G = this.groups();
    const F: Filter = (list) => (this.filter ? list.filter((x) => x.projectId === this.filter) : list);
    const done = this.doneToday();
    const total = done.length + G.today.length + G.overdue.length;
    const pulse = b.createDiv('tt-pulse');
    new Widgets().ring(pulse.createDiv('tt-pulse-ring'), total ? done.length / total : 0, 64, 'var(--dm-accent2)', formatNumber(done.length));
    const txt = pulse.createDiv('tt-pulse-t');
    txt.createDiv({ cls: 'tt-pulse-h', text: total ? (done.length >= total ? t('ticktick.pulse.allDone') : t('ticktick.pulse.progress', { done: done.length, total })) : t('ticktick.pulse.empty') });
    txt.createDiv({ cls: 'qh-muted', text: t('ticktick.pulse.summary', { overdue: G.overdue.length, tomorrow: G.tomorrow.length, later: G.week.length + G.later.length, none: G.none.length }) });
    if (G.overdue.length) {
      pulse.createEl('button', { cls: 'tt-ghost', text: t('ticktick.pulse.moveOverdue') }).addEventListener('click', () => void this.moveToToday(G.overdue.map((x) => x.id)));
    }

    const body = b.createDiv('tt-view-body');
    if (view === 'week') this.weekView(body, G, F);
    else if (view === 'matrix') this.matrixView(body, F);
    else if (view === 'lists') this.byListView(body);
    else this.boardView(body, G, F);

    if (done.length) {
      const d = b.createEl('details', { cls: 'tt-done-today' });
      d.createEl('summary', { text: t('ticktick.doneToday', { count: done.length }) });
      for (const x of done) {
        const r = d.createDiv('tt-rdone');
        setIcon(r.createSpan(), 'check');
        r.createSpan({ cls: 'tt-rdone-t', text: x.title });
        r.createSpan({ cls: 'qh-row-meta', text: moment(x.completedTime).format('HH:mm') });
      }
    }
  }

  private boardView(b: HTMLElement, G: Groups, F: Filter): void {
    const cols = b.createDiv('tt-cols');
    this.column(cols, t('ticktick.cols.overdue'), 'alarm-clock-off', F(G.overdue), 'is-overdue', null, t('ticktick.nothingLate'));
    this.column(cols, t('ticktick.cols.today'), 'sun', F(G.today), 'is-today', (x) => void this.tt.setDay(x, moment()));
    this.column(cols, t('ticktick.cols.tomorrow'), 'sunrise', F(G.tomorrow), '', (x) => void this.tt.setDay(x, moment().add(1, 'day')));
    this.column(cols, t('ticktick.cols.thisWeek'), 'calendar-range', F([...G.week, ...G.later]), '', (x) => void this.tt.setDay(x, moment().add(3, 'days')));
    this.column(cols, t('ticktick.cols.noDate'), 'inbox', F(G.none), '', (x) => void this.tt.setDay(x, null));
  }

  private weekView(b: HTMLElement, G: Groups, F: Filter): void {
    if (G.overdue.length) {
      const strip = b.createDiv('tt-ov-strip');
      strip.createSpan({ cls: 'tt-ov-label', text: t('ticktick.week.overdue', { count: G.overdue.length }) });
      for (const x of F(G.overdue)) this.taskRow(strip, x);
    }
    const wk = b.createDiv('tt-week');
    const weekend = m().localeData().firstDayOfWeek() === 6 ? [5, 6] : [0, 6];
    for (let i = 0; i < 7; i++) {
      const day = moment().add(i, 'days');
      const list = F(this.tt.cache.tasks.filter((x) => !x.parentId && this.tt.due(x)?.isSame(day, 'day'))).sort((a, b2) => (this.tt.due(a)?.valueOf() ?? 0) - (this.tt.due(b2)?.valueOf() ?? 0));
      const c = wk.createDiv('tt-day' + (i === 0 ? ' is-today' : '') + (weekend.includes(day.day()) ? ' is-weekend' : ''));
      const h = c.createDiv('tt-day-head');
      h.createDiv({ cls: 'tt-day-name', text: i === 0 ? t('ticktick.cols.today') : i === 1 ? t('ticktick.cols.tomorrow') : m(day).format('dddd') });
      h.createDiv({ cls: 'tt-day-num', text: day.format('D') });
      h.createDiv({ cls: 'tt-day-mon', text: m(day).format('MMMM') });
      c.createDiv('tt-day-load').createDiv().style.width = `${Math.min(100, (list.length / 6) * 100)}%`;
      const box = c.createDiv('tt-col-list');
      for (const x of list) this.taskRow(box, x, { noDue: true });
      if (!list.length) box.createDiv({ cls: 'tt-empty', text: t('ticktick.empty') });
      this.dropZone(c, (x) => void this.tt.setDay(x, day));
    }
    const none = F(G.none);
    if (none.length) {
      const strip = b.createDiv('tt-ov-strip is-none');
      strip.createSpan({ cls: 'tt-ov-label', text: t('ticktick.week.noDate', { count: none.length }) });
      for (const x of none) this.taskRow(strip, x);
    }
  }

  private matrixView(b: HTMLElement, F: Filter): void {
    const T = F(this.tt.cache.tasks.filter((x) => !x.parentId));
    const urgent = (x: TTTask) => { const d = this.tt.due(x); return !!d && d.isBefore(moment().add(1, 'day').endOf('day')); };
    const important = (x: TTTask) => (x.priority ?? 0) >= 3;
    const day = (n: number) => ttTime(moment().add(n, 'days').startOf('day'));
    const mx = b.createDiv('tt-matrix');
    mx.createDiv({ cls: 'tt-ax tt-ax-y', text: t('ticktick.matrix.important') });
    mx.createDiv({ cls: 'tt-ax tt-ax-x', text: t('ticktick.matrix.urgent') });
    const Q: [string, string, (x: TTTask) => boolean, string, (x: TTTask) => void][] = [
      [t('stats.matrix.do'), t('stats.matrix.doSub'), (x) => important(x) && urgent(x), 'var(--qh-c3)', (x) => void this.tt.update(x, { priority: Math.max(5, x.priority ?? 0), ...(urgent(x) ? {} : { dueDate: day(0), startDate: day(0), isAllDay: true }) })],
      [t('stats.matrix.plan'), t('stats.matrix.planSub'), (x) => important(x) && !urgent(x), 'var(--qh-c1)', (x) => void this.tt.update(x, { priority: Math.max(3, x.priority ?? 0), ...(urgent(x) ? { dueDate: day(7), startDate: day(7), isAllDay: true } : {}) })],
      [t('stats.matrix.delegate'), t('stats.matrix.delegateSub'), (x) => !important(x) && urgent(x), 'var(--qh-c2)', (x) => void this.tt.update(x, { priority: Math.min(1, x.priority ?? 0), ...(urgent(x) ? {} : { dueDate: day(0), startDate: day(0), isAllDay: true }) })],
      [t('stats.matrix.drop'), t('stats.matrix.dropSub'), (x) => !important(x) && !urgent(x), 'var(--dm-faint)', (x) => void this.tt.update(x, { priority: 0, ...(urgent(x) ? { dueDate: day(7), startDate: day(7), isAllDay: true } : {}) })],
    ];
    for (const [title, sub, test, color, drop] of Q) {
      const list = T.filter(test);
      const q = mx.createDiv('tt-mq');
      q.style.setProperty('--qc', color);
      const h = q.createDiv('tt-mq-head');
      h.createSpan({ cls: 'tt-q-n', text: formatNumber(list.length) });
      const tt = h.createDiv();
      tt.createDiv({ cls: 'tt-q-t', text: title });
      tt.createDiv({ cls: 'tt-q-s', text: sub });
      const box = q.createDiv('tt-col-list');
      for (const x of list) this.taskRow(box, x);
      if (!list.length) box.createDiv({ cls: 'tt-empty', text: t('ticktick.dropHere') });
      this.dropZone(q, drop);
    }
  }

  private byListView(b: HTMLElement): void {
    const wrap = b.createDiv('tt-bylist');
    const far = moment().add(10, 'y');
    for (const p of this.tt.openProjects().filter((x) => !this.filter || x.id === this.filter)) {
      const list = this.tt.cache.tasks.filter((x) => x.projectId === p.id && !x.parentId).sort((a, b2) => (this.tt.due(a) ?? far).valueOf() - (this.tt.due(b2) ?? far).valueOf());
      const done30 = this.tt.cache.completed.filter((x) => x.projectId === p.id && moment(x.completedTime).isAfter(moment().subtract(30, 'days'))).length;
      const color = this.tt.projectColor(p);
      const c = wrap.createDiv('tt-lgroup');
      c.style.setProperty('--lc', color);
      const h = c.createDiv('tt-lgroup-head');
      h.createSpan('tt-dot').style.background = color;
      h.createSpan({ cls: 'tt-lgroup-n', text: p.name });
      h.createSpan({ cls: 'qh-muted', text: t('ticktick.lists.summary', { open: list.length, done: done30 }) });
      const fill = h.createDiv('qh-meter tt-lgroup-bar').createDiv();
      fill.style.width = `${done30 + list.length ? (done30 / (done30 + list.length)) * 100 : 0}%`;
      fill.style.background = color;
      const box = c.createDiv('tt-col-list tt-lgrid');
      for (const x of list) this.taskRow(box, x, { noList: true });
      if (!list.length) box.createDiv({ cls: 'tt-empty', text: t('ticktick.lists.noneOpen') });
      this.dropZone(c, (x) => void this.tt.moveTask(x, p.id));
    }
  }

  private listsTab(b: HTMLElement, w: Widgets): void {
    const g = b.createDiv('qh-grid');
    const head = w.card(g, 12, t('ticktick.tabs.lists'), 'tt-lists-head');
    head.createDiv({ cls: 'qh-muted', text: t('ticktick.lists.intro') });
    head.createEl('button', { cls: 'mod-cta', text: t('ticktick.lists.add') }).addEventListener('click', () => new ListModal(this.app, this.plugin, null).open());
    const groupNames: Record<string, string> = {};
    for (const gr of this.tt.cache.groups ?? []) groupNames[gr.id] = gr.name;
    for (const p of this.tt.cache.projects.filter((x) => !x.closed)) {
      const open = this.tt.cache.tasks.filter((x) => x.projectId === p.id).length;
      const C = this.tt.cache.completed.filter((x) => x.projectId === p.id);
      const d30 = C.filter((x) => moment(x.completedTime).isAfter(moment().subtract(30, 'days'))).length;
      const spark = Array.from({ length: 14 }, (_, i) => C.filter((x) => moment(x.completedTime).isSame(moment().subtract(13 - i, 'days'), 'day')).length);
      const c = w.card(g, 4, null, 'tt-pcard');
      c.style.setProperty('--lc', this.tt.projectColor(p));
      const top = c.createDiv('tt-pcard-top');
      const ratio = d30 + open ? d30 / (d30 + open) : 0;
      w.ring(top, ratio, 58, 'var(--lc)', formatPercent(ratio));
      const nm = top.createDiv('tt-pcard-name');
      nm.createDiv({ text: p.name });
      const mode = ({ list: t('ticktick.lists.modeList'), kanban: t('ticktick.lists.modeKanban'), timeline: t('ticktick.lists.modeTimeline') } as Record<string, string>)[p.viewMode ?? 'list'] ?? t('ticktick.lists.modeList');
      nm.createDiv({ cls: 'qh-muted', text: [groupNames[p.groupId ?? ''], mode, p.inbox ? t('ticktick.inbox') : ''].filter(Boolean).join(' · ') });
      const st = c.createDiv('tt-pcard-stats');
      for (const [n, label] of [[open, t('ticktick.lists.open')], [d30, t('ticktick.lists.done30')], [C.length, t('ticktick.lists.doneAll')]] as [number, string][]) {
        const x = st.createDiv();
        x.createDiv({ cls: 'tt-pcard-n', text: formatNumber(n) });
        x.createDiv({ cls: 'qh-muted', text: label });
      }
      w.sparkline(c, spark, { w: 260, h: 36, color: 'var(--lc)' });
      if (p.inbox) continue;
      const acts = c.createDiv('tt-pcard-acts');
      acts.createEl('button', { text: t('common.edit') }).addEventListener('click', () => new ListModal(this.app, this.plugin, p).open());
      acts.createEl('button', { text: t('common.open') }).addEventListener('click', () => window.open(`https://ticktick.com/webapp/#p/${p.id}/tasks`));
      const del = acts.createEl('button', { cls: 'tt-danger', text: t('common.delete') });
      del.addEventListener('click', () => {
        if (del.hasClass('is-armed')) { void this.tt.deleteProject(p); return; }
        del.addClass('is-armed');
        del.setText(t('ticktick.lists.confirmDelete', { count: open }));
        window.setTimeout(() => { del.removeClass('is-armed'); del.setText(t('common.delete')); }, 3000);
      });
    }
    const cds = this.countdowns();
    if (cds.length) {
      const row = w.card(g, 12, t('ticktick.countdown.title')).createDiv('tt-countdowns');
      cds.forEach((x, i) => {
        const k = row.createDiv('tt-cd');
        k.style.setProperty('--lc', themedColor(x.color, i));
        const n = x.d.diff(moment().startOf('day'), 'days');
        k.createDiv({ cls: 'tt-cd-n', text: formatNumber(Math.abs(n)) });
        k.createDiv({ cls: 'tt-cd-l', text: n >= 0 ? t('ticktick.countdown.left', { count: n }) : t('ticktick.countdown.ago', { count: -n }) });
        k.createDiv({ cls: 'tt-cd-t', text: x.name });
      });
    }
  }

  private focusTab(b: HTMLElement, w: Widgets, rerender: () => void): void {
    if (this.plugin.pomodoro) {
      const top = b.createDiv('tt-focus-top');
      renderPomodoro(top, this.plugin, this.choices(), false, rerender);
      renderPomodoroSettings(top.createDiv('tt-focus-side'), this.plugin);
    }
    renderFocusStats(b, w, new TickTickFocusSource(this.tt).sessions(), t('stats.focus.emptyTickTick'));
  }

  private habitsTab(b: HTMLElement, w: Widgets): void {
    b.createDiv('tt-viewbar').createEl('button', { cls: 'mod-cta', text: t('ticktick.habits.add') }).addEventListener('click', () => new HabitModal(this.app, this.plugin, null).open());
    this.habitsGrid(b, w, true);
  }

  private habitsGrid(b: HTMLElement, w: Widgets, editable = false): void {
    const H = this.tt.cache.habits;
    const g = b.createDiv('qh-grid');
    if (!H.length) { w.empty(w.card(g, 12, t('ticktick.habits.title')), t('ticktick.habits.none')); return; }
    H.forEach((h, idx) => {
      const ci = this.tt.cache.checkins[h.id] ?? {};
      const goal = h.goal || 1;
      const ok = (s: number) => { const c = ci[s]; return !!c && (c.status === 2 || (c.value ?? 0) >= (c.goal ?? goal)); };
      let run = 0;
      for (let d = moment(); ; d = d.clone().subtract(1, 'day')) {
        if (ok(ttStamp(d))) run++;
        else if (!d.isSame(moment(), 'day')) break;
        if (run > 999) break;
      }
      let n30 = 0;
      for (let i = 0; i < 30; i++) if (ok(ttStamp(moment().subtract(i, 'days')))) n30++;
      const c = w.card(g, 4, null, 'tt-habit');
      c.style.setProperty('--hc', series(idx));
      const top = c.createDiv('tt-habit-top');
      const nm = top.createDiv();
      nm.createDiv({ cls: 'tt-habit-name', text: h.name });
      nm.createDiv({ cls: 'qh-muted', text: t('ticktick.habits.summary', { streak: run, pct: formatPercent(n30 / 30) }) + (h.totalCheckIns ? ' · ' + t('ticktick.habits.total', { count: h.totalCheckIns }) : '') });
      const on = ok(ttStamp(moment()));
      const btn = top.createEl('button', { cls: 'tt-habit-btn' + (on ? ' is-on' : ''), attr: { 'aria-label': on ? t('ticktick.habits.undoToday') : t('ticktick.habits.logToday') } });
      setIcon(btn, on ? 'check' : 'plus');
      btn.addEventListener('click', () => void this.tt.checkin(h, moment(), !on));
      w.ring(top, n30 / 30, 52, 'var(--hc)', formatPercent(n30 / 30));
      const grid = c.createDiv('tt-habit-grid');
      const start = moment().startOf('week').subtract(11, 'weeks');
      for (let wk = 0; wk < 12; wk++) {
        const col = grid.createDiv('tt-hcol');
        for (let d = 0; d < 7; d++) {
          const day = start.clone().add(wk * 7 + d, 'days');
          const cell = col.createDiv('tt-hcell');
          if (day.isAfter(moment(), 'day')) { cell.addClass('is-future'); continue; }
          const hit = ok(ttStamp(day));
          if (hit) cell.addClass('is-on');
          w.tipOn(cell, m(day).format('dddd D MMM') + (hit ? ' ✓' : ''));
          cell.addEventListener('click', () => void this.tt.checkin(h, day, !hit));
        }
      }
      if (editable) {
        const e = editButton(c);
        e.addEventListener('click', () => new HabitModal(this.app, this.plugin, h).open());
      }
    });
  }

  private appTab(b: HTMLElement): void {
    const wrap = b.createDiv('tt-app');
    if (Platform.isMobile) {
      wrap.createDiv({ cls: 'qh-empty', text: t('ticktick.app.desktopOnly') });
      wrap.createEl('button', { cls: 'mod-cta', text: t('ticktick.openInApp') }).addEventListener('click', () => window.open('https://ticktick.com/webapp'));
      return;
    }
    // Electron's <webview> keeps TickTick's own login in a separate session
    wrap.createEl('webview' as keyof HTMLElementTagNameMap, {
      cls: 'tt-webview',
      attr: { src: 'https://ticktick.com/webapp', partition: 'persist:damask-ticktick', allowpopups: '' },
    });
  }

  private helpTab(b: HTMLElement, w: Widgets): void {
    const g = b.createDiv('qh-grid');
    const syntax = w.card(g, 12, t('ticktick.help.syntax'));
    const table = syntax.createEl('table', { cls: 'tt-help' });
    for (const k of ['dates', 'weekdays', 'relative', 'exact', 'time', 'priority', 'list', 'tag'] as const) {
      const r = table.createEl('tr');
      r.createEl('td', { text: t(`ticktick.help.rows.${k}.example`) });
      r.createEl('td', { text: t(`ticktick.help.rows.${k}.meaning`) });
    }

    const mirror = this.plugin.ticktickMirror;
    if (mirror) {
      const mc = w.card(g, 12, t('ticktick.help.mirror'));
      const st = mirror.st;
      mc.createDiv({ cls: 'qh-muted', text: [mirror.lastRun ? t('ticktick.help.mirrorRan', { when: m(mirror.lastRun).fromNow() }) : t('ticktick.help.mirrorNever'), mirror.status ? '⚠ ' + mirror.status : '', st.pending.length ? t('ticktick.help.pending', { count: st.pending.length }) : ''].filter(Boolean).join(' · ') });
      const row = mc.createDiv('tt-ed-foot');
      row.createEl('button', { cls: 'mod-cta', text: t('ticktick.syncNow') }).addEventListener('click', () => void this.tt.sync());
      row.createEl('button', { text: t('ticktick.trash.button', { count: st.trash.length }) }).addEventListener('click', () => new TrashModal(this.app, this.plugin).open());
      if (st.pending.length) row.createEl('button', { cls: 'mod-warning', text: t('ticktick.help.reviewPending') }).addEventListener('click', () => { mirror.resetAsking(); mirror.askPending(); });
    }

    const dg = w.card(g, 12, t('ticktick.help.diagnostics'), 'tt-diag');
    dg.createDiv({ cls: 'qh-muted', text: t('ticktick.help.diagnosticsIntro') });
    const out = dg.createEl('pre', { cls: 'tt-diag-out' });
    const run = dg.createEl('button', { cls: 'mod-cta', text: t('ticktick.help.run') });
    dg.createEl('button', { text: t('ticktick.help.copy') }).addEventListener('click', () => { void navigator.clipboard.writeText(out.textContent ?? ''); new Notice(t('ticktick.help.copied')); });
    run.addEventListener('click', handler(async () => {
      run.disabled = true;
      out.setText('');
      const L = (s: string) => { out.textContent += s + '\n'; };
      const M = moment;
      L(`Damask Studio ${this.plugin.manifest.version} · ${new Date().toISOString()} · TZ ${timeZone()}`);
      const tests: [string, () => Promise<unknown>, (r: unknown) => string][] = [
        ['projects', () => this.tt.get('/project'), (r) => `${(r as unknown[] ?? []).length}`],
        ['inbox', () => this.tt.get('/project/inbox/data'), (r) => `${((r as { tasks?: unknown[] })?.tasks ?? []).length} tasks`],
        ['completed 7d', () => this.tt.post('/task/completed', { startDate: ttTime(M().subtract(7, 'days')), endDate: ttTime(M()) }), (r) => `${(r as unknown[] ?? []).length}`],
        ['focus 7d', () => this.tt.get(`/focus?from=${encodeURIComponent(ttTime(M().subtract(7, 'days')))}&to=${encodeURIComponent(ttTime(M()))}&type=0`), (r) => `${(r as unknown[] ?? []).length}`],
        ['habits', () => this.tt.get('/habit'), (r) => `${(r as unknown[] ?? []).length}`],
        ['tags', () => this.tt.get('/tag'), (r) => `${(r as unknown[] ?? []).length}`],
      ];
      for (const [name, fn, describe] of tests) {
        const t0 = Date.now();
        try { L(`✓ ${name} — ${describe(await fn())} (${Date.now() - t0}ms)`); } catch (e) { L(`✗ ${name} — ${(e as Error).message}`); }
      }
      const c = this.tt.cache;
      L(`— cache: ${c.tasks.length} open · ${c.completed.length} done · ${c.focus.length} focus · ${c.habits.length} habits · synced ${c.syncedAt ? new Date(c.syncedAt).toLocaleString() : 'never'}`);
      run.disabled = false;
    }));
  }
}

function editButton(c: HTMLElement): HTMLButtonElement {
  const e = c.createEl('button', { cls: 'tt-act tt-habit-edit', attr: { 'aria-label': t('common.edit') } });
  setIcon(e, 'pencil');
  return e;
}

export class TaskCenterView extends ItemView {
  private off: (() => void) | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: DamaskStudio) { super(leaf); }
  getViewType(): string { return TASK_CENTER_VIEW; }
  getDisplayText(): string { return t('ticktick.center.title'); }
  getIcon(): string { return 'check-check'; }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('tt-view');
    this.draw();
    const tt = this.plugin.ticktick;
    if (!tt) return;
    this.off = tt.on(() => { if (this.plugin.settings.ticktick.tab !== 'app') this.draw(); });
    if (tt.active && Date.now() - (tt.cache.syncedAt || 0) > 60e3) void tt.sync();
  }

  draw(): void {
    const ui = this.plugin.ticktickUi;
    if (!ui) {
      // the integration was switched off while this tab stayed open
      const el = this.contentEl;
      el.empty();
      el.setAttr('dir', dir());
      const c = el.createDiv('qh-root tt-root').createDiv('qh-empty');
      c.createDiv({ text: t('ticktick.connect.disabled') });
      c.createEl('button', { cls: 'mod-cta', text: t('ticktick.connect.openPanel') }).addEventListener('click', () => void this.plugin.openStudio('integrations'));
      return;
    }
    ui.render(this.contentEl, (this.plugin.settings.ticktick.tab || 'tasks') as Tab, () => this.draw());
  }

  async onClose(): Promise<void> { this.off?.(); this.contentEl.empty(); }
}

export class QuickAddModal extends Modal {
  constructor(app: App, private plugin: DamaskStudio) { super(app); }

  onOpen(): void {
    const c = this.contentEl;
    this.modalEl.addClass('vs-modal', 'tt-quick-modal');
    c.setAttr('dir', dir());
    if (!this.plugin.ticktick?.active) {
      c.createEl('h3', { text: t('ticktick.notConnected') });
      c.createEl('button', { cls: 'mod-cta', text: t('ticktick.connect.openPanel') }).addEventListener('click', () => { this.close(); void this.plugin.openStudio('integrations'); });
      return;
    }
    c.createEl('h3', { text: t('ticktick.task.new') });
    const input = this.plugin.ticktickUi!.quickAdd(c.createDiv('tt-root'));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.setTimeout(() => this.close(), 50); });
    window.setTimeout(() => input.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}
