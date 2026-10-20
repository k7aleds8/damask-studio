import { ItemView, setIcon, type WorkspaceLeaf } from 'obsidian';
import type DamasceneStudio from '../../main';
import { svg, uid, handler } from '../../core/dom';
import { dir, t } from '../../i18n';
import { renderFocusStats } from '../../stats/views';
import { Widgets } from '../../ui/widgets';
import type { PomoMode } from './engine';

export interface PomoTaskChoice { title: string; ticktickId?: string; group: string }

/** The timer dial with its controls. `mini` is the compact version on the home page. */
export function renderPomodoro(parent: HTMLElement, plugin: DamasceneStudio, choices: PomoTaskChoice[], mini: boolean, rerender: () => void): HTMLElement {
  const P = plugin.pomodoro!;
  const s = P.st;
  const c = parent.createDiv(`tt-pomo${mini ? ' is-mini' : ''} is-${s.mode}${s.running ? ' is-running' : ''}${s.pausedAt ? ' is-paused' : ''}`);
  if (!mini) {
    const modes = c.createDiv('tt-pomo-modes');
    for (const mode of ['pomo', 'short', 'long', 'stopwatch'] as PomoMode[]) {
      const b = modes.createEl('button', { cls: s.mode === mode ? 'is-active' : '', text: t(`pomodoro.modes.${mode}`) });
      b.disabled = s.running && s.mode !== mode;
      b.addEventListener('click', () => { P.setMode(mode); rerender(); });
    }
  }
  const size = mini ? 150 : 250;
  const R = mini ? 64 : 108;
  const C = 2 * Math.PI * R;
  const dial = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'tt-pomo-ring' }, c);
  const grad = svg('linearGradient', { id: uid('pg'), x1: 0, y1: 0, x2: 1, y2: 1 }, svg('defs', {}, dial));
  svg('stop', { offset: '0', style: 'stop-color:var(--dm-accent)' }, grad);
  svg('stop', { offset: '1', style: 'stop-color:var(--dm-accent2)' }, grad);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const r1 = R + (mini ? 9 : 14);
    const r2 = r1 + (i % 5 ? 3 : 7);
    svg('line', {
      x1: size / 2 + r1 * Math.sin(a), y1: size / 2 - r1 * Math.cos(a), x2: size / 2 + r2 * Math.sin(a), y2: size / 2 - r2 * Math.cos(a),
      style: `stroke:var(--dm-faint);stroke-width:${i % 5 ? 1 : 1.6};opacity:${i % 5 ? 0.35 : 0.7}`,
    }, dial);
  }
  const stroke = mini ? 8 : 12;
  svg('circle', { cx: size / 2, cy: size / 2, r: R, style: `fill:none;stroke:var(--qh-track);stroke-width:${stroke}` }, dial);
  const arc = svg('circle', { cx: size / 2, cy: size / 2, r: R, transform: `rotate(-90 ${size / 2} ${size / 2})`, style: `fill:none;stroke:var(--qh-primary);stroke-width:${stroke};stroke-linecap:round;transition:stroke-dasharray .4s` }, dial);
  const time = svg('text', { x: size / 2, y: size / 2 + (mini ? 8 : 12), 'text-anchor': 'middle', class: 'tt-pomo-time' + (mini ? ' is-mini' : '') }, dial);
  const label = svg('text', { x: size / 2, y: size / 2 + (mini ? 28 : 44), 'text-anchor': 'middle', class: 'qh-donut-l' }, dial);
  const update = () => {
    if (!c.isConnected) { off(); return; }
    const r = P.remaining();
    time.textContent = `${String(Math.floor(r / 60e3)).padStart(2, '0')}:${String(Math.floor(r / 1000) % 60).padStart(2, '0')}`;
    label.textContent = t(`pomodoro.dial.${P.st.mode}`) + (P.st.pausedAt ? ' · ' + t('pomodoro.paused') : '');
    arc.style.strokeDasharray = `${(C * Math.max(0.0001, P.progress())).toFixed(1)} ${C.toFixed(1)}`;
  };
  const off = P.on((tickOnly) => { if (tickOnly) update(); });
  update();

  const select = c.createDiv('tt-pomo-task').createEl('select');
  select.createEl('option', { value: '', text: t('pomodoro.noTask') });
  const groups = new Map<string, PomoTaskChoice[]>();
  for (const ch of choices) groups.set(ch.group, [...(groups.get(ch.group) ?? []), ch]);
  for (const [group, list] of groups) {
    const og = select.createEl('optgroup');
    og.label = group;
    for (const ch of list) og.createEl('option', { value: ch.ticktickId ? 'tt:' + ch.ticktickId : 'v:' + ch.title, text: ch.title });
  }
  select.value = s.taskId ? 'tt:' + s.taskId : s.task ? 'v:' + s.task : '';
  select.addEventListener('change', () => {
    const v = select.value;
    const ch = choices.find((x) => (x.ticktickId ? 'tt:' + x.ticktickId : 'v:' + x.title) === v);
    P.setTask(ch?.title ?? '', ch?.ticktickId ?? '');
  });

  const btns = c.createDiv('tt-pomo-btns');
  const B = (icon: string, title: string, act: () => unknown, cls = '') => {
    const b = btns.createEl('button', { cls: 'tt-pomo-btn ' + cls, attr: { 'aria-label': title } });
    setIcon(b, icon);
    b.addEventListener('click', handler(async () => { await act(); rerender(); }));
  };
  if (!s.running) B('play', t('pomodoro.start'), () => P.start(), 'is-main');
  else if (s.pausedAt) B('play', t('pomodoro.resume'), () => P.start(), 'is-main');
  else B('pause', t('pomodoro.pause'), () => P.pause(), 'is-main');
  if (s.running) {
    B('square', t('pomodoro.finish'), () => P.stop(true));
    B('x', t('pomodoro.discard'), () => P.stop(false));
  }
  if (!mini) {
    const today = P.today();
    const goal = P.cfg.dailyGoal || 8;
    const dots = c.createDiv('tt-pomo-dots');
    for (let i = 0; i < Math.max(goal, today.count); i++) dots.createSpan(i < today.count ? 'is-on' : '');
    c.createDiv({ cls: 'qh-muted tt-pomo-sum', text: t('pomodoro.todaySummary', { done: today.count, goal, minutes: today.minutes }) });
  }
  return c;
}

/** Timer settings shown beside the big dial. */
export function renderPomodoroSettings(parent: HTMLElement, plugin: DamasceneStudio): void {
  const cfg = plugin.settings.pomodoro;
  const box = parent.createDiv('tt-focus-cfg');
  box.createDiv({ cls: 'tt-ed-label', text: t('pomodoro.settings.title') });
  const num = (label: string, key: 'work' | 'short' | 'long' | 'longEvery' | 'dailyGoal', min: number, max: number) => {
    const r = box.createDiv('tt-cfg-row');
    r.createSpan({ text: label });
    const input = r.createEl('input', { type: 'number', attr: { min, max } });
    input.value = String(cfg[key]);
    input.addEventListener('change', handler(async () => {
      cfg[key] = Math.max(min, Math.min(max, +input.value || cfg[key]));
      await plugin.saveSettings();
    }));
  };
  num(t('pomodoro.settings.work'), 'work', 5, 120);
  num(t('pomodoro.settings.short'), 'short', 1, 30);
  num(t('pomodoro.settings.long'), 'long', 5, 60);
  num(t('pomodoro.settings.longEvery'), 'longEvery', 2, 8);
  num(t('pomodoro.settings.dailyGoal'), 'dailyGoal', 1, 20);
  const toggle = (label: string, key: 'autoBreak' | 'autoWork' | 'sound') => {
    const r = box.createDiv('tt-cfg-row');
    r.createSpan({ text: label });
    const sw = r.createDiv('qh-toggle' + (cfg[key] ? ' is-on' : ''));
    sw.addEventListener('click', handler(async () => {
      cfg[key] = !cfg[key];
      sw.toggleClass('is-on', cfg[key]);
      await plugin.saveSettings();
    }));
  };
  toggle(t('pomodoro.settings.autoBreak'), 'autoBreak');
  toggle(t('pomodoro.settings.autoWork'), 'autoWork');
  toggle(t('pomodoro.settings.sound'), 'sound');
  box.createDiv({ cls: 'qh-muted', text: plugin.ticktick?.active ? t('pomodoro.settings.savedBoth') : t('pomodoro.settings.savedLocal') });
}

export const FOCUS_VIEW = 'damascene-focus';

/** Stand-alone timer and focus stats, used when no task app is connected. */
export class FocusView extends ItemView {
  private off: (() => void) | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: DamasceneStudio) { super(leaf); }
  getViewType(): string { return FOCUS_VIEW; }
  getDisplayText(): string { return t('pomodoro.viewTitle'); }
  getIcon(): string { return 'timer'; }

  async onOpen(): Promise<void> {
    await this.render();
    this.off = this.plugin.pomodoro!.on((tickOnly) => { if (!tickOnly) void this.render(); });
  }

  async onClose(): Promise<void> {
    this.off?.();
    this.contentEl.empty();
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.addClass('qh-root', 'tt-root', 'tt-view');
    el.setAttr('dir', dir());
    const w = new Widgets();
    const top = el.createDiv('tt-focus-top');
    const open = await this.plugin.taskSource().open();
    const choices = open.slice(0, 60).map((x) => ({ title: x.title, ticktickId: this.plugin.ticktick?.active ? x.id : undefined, group: x.list.name }));
    renderPomodoro(top, this.plugin, choices, false, () => void this.render());
    renderPomodoroSettings(top.createDiv('tt-focus-side'), this.plugin);
    renderFocusStats(el, w, this.plugin.focusSource().sessions(), t('stats.focus.emptyLocal'));
    el.createDiv({ cls: 'qh-muted', text: t('pomodoro.sessionsKept', { count: this.plugin.settings.pomodoro.log.length }) });
  }
}
