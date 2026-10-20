import { handler } from '../../core/dom';
import { MarkdownRenderChild, setIcon, TFile } from 'obsidian';
import type DamaskStudio from '../../main';
import { hasCommand, openGlobalSearch, runCommand } from '../../core/internals';
import { dir, formatNumber, formatPercent, hijriDate, m, t } from '../../i18n';
import { renderFocusStats, renderTaskStats } from '../../stats/views';
import type { TaskItem } from '../../stats/types';
import { Widgets } from '../../ui/widgets';
import { GalleryModal } from '../inserter/gallery';
import { HabitsManagerModal } from '../habits/manager';
import { renderPomodoro } from '../pomodoro/panel';
import { HomeData } from './data';

/**
 * The dashboard drawn by a ```damask-home``` code block. Each card reads
 * only what it needs, and anything tied to a folder that this vault does not
 * have is simply left out.
 */
export class HomeDashboard extends MarkdownRenderChild {
  private D!: HomeData;
  private w!: Widgets;
  private clockTimer = 0;

  constructor(private plugin: DamaskStudio, el: HTMLElement, private sourcePath: string) {
    super(el);
  }

  get el(): HTMLElement { return this.containerEl; }
  private get app() { return this.plugin.app; }

  onload(): void { this.render(); }
  onunload(): void { window.clearInterval(this.clockTimer); }

  render(): void {
    const el = this.el;
    el.empty();
    el.addClass('qh-root');
    el.setAttr('dir', dir());
    window.clearInterval(this.clockTimer);
    this.D = new HomeData(this.app, this.plugin.paths);
    this.w = new Widgets();
    const g = el.createDiv('qh-grid');
    const tt = this.plugin.ticktick?.active && this.plugin.settings.ticktick.onHome ? this.plugin.ticktickUi : null;

    this.hero(g);
    this.today(g);

    if (tt) {
      this.w.band(g, t('home.bands.tasks'), t('home.bands.tasksTickTick'));
      tt.mountHome(g.createDiv('qh-s12 tt-home-holder is-compact'), this);
    } else {
      this.w.band(g, t('home.bands.tasks'), t('home.bands.tasksVault'));
      void this.vaultTasks(g, 8);
      if (this.plugin.settings.modules.pomodoro && this.plugin.pomodoro) this.miniFocus(g);
    }

    this.w.band(g, t('home.bands.stats'), tt ? t('home.bands.statsTickTick') : t('home.bands.statsVault'));
    void this.stats(g);

    this.w.band(g, t('home.bands.habits'), tt && this.plugin.settings.ticktick.mirror.habits ? t('home.bands.habitsSynced') : t('home.bands.habitsVault'));
    this.habitsCard(g);
    if (tt) tt.mountHabits(g.createDiv('qh-s12 tt-home-holder tt-root'), this);

    this.w.band(g, t('home.bands.vault'), t('home.bands.vaultSub'));
    this.kpis(g);
    this.heatmap(g);
    this.foldersCard(g);
    this.learning(g);
    this.recent(g);
    this.suggestions(g);
    if (tt) void this.vaultTasks(g, 4);
    this.growth(g);
    this.tagsCard(g);
    this.gallery(g);
    this.footer(g);
  }

  private open(path: string, line?: number): void {
    void this.app.workspace.openLinkText(path, this.sourcePath, false, line != null ? { eState: { line } } : undefined);
  }

  /* ------------------------------------------------------------ hero */

  private hero(g: HTMLElement): void {
    const c = this.w.card(g, 8, null, 'qh-hero');
    const now = m();
    const h = now.hour();
    const greet = h < 5 ? t('home.greet.night') : h < 12 ? t('home.greet.morning') : h < 17 ? t('home.greet.afternoon') : t('home.greet.evening');
    const top = c.createDiv('qh-hero-top');
    const left = top.createDiv();
    left.createDiv({ cls: 'qh-greet', text: greet });
    const hijri = this.plugin.settings.home.hijri ? hijriDate(new Date()) : '';
    left.createDiv({ cls: 'qh-date', text: now.format(t('home.dateFormat')) + (hijri ? '  ·  ' + hijri : '') });
    const clock = top.createDiv({ cls: 'qh-clock', text: now.format('HH:mm') });
    this.clockTimer = window.setInterval(() => { if (clock.isConnected) clock.textContent = m().format('HH:mm'); }, 30000);
    this.registerInterval(this.clockTimer);

    const search = c.createDiv('qh-search');
    setIcon(search.createSpan('qh-search-ic'), 'search');
    search.createSpan({ text: t('home.search') });
    search.addEventListener('click', () => {
      if (!runCommand(this.app, 'omnisearch:show-modal')) runCommand(this.app, 'switcher:open');
    });

    void this.quoteOfDay(c.createDiv('qh-quote'));

    const acts = c.createDiv('qh-actions');
    const A = (icon: string, label: string, fn: () => void) => {
      const b = acts.createEl('button', { cls: 'qh-act' });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.addEventListener('click', fn);
    };
    A('calendar-plus', t('home.actions.today'), () => this.openDaily());
    if (hasCommand(this.app, 'templater-obsidian:create-new-note-from-template')) {
      A('file-plus-2', t('home.actions.fromTemplate'), () => runCommand(this.app, 'templater-obsidian:create-new-note-from-template'));
    }
    if (this.D.inFolder(this.plugin.paths.folderPath('questions')).length) A('dice-5', t('home.actions.randomQuestion'), () => this.randomQuestion());
    if (this.plugin.settings.modules.inserter) A('square-plus', t('home.actions.gallery'), () => new GalleryModal(this.app, this.plugin, null).open());
    if (this.plugin.settings.modules.pomodoro) A('timer', t('home.actions.focus'), () => void this.plugin.openFocus());

    const D = this.D;
    const newThisWeek = D.notes.filter((f) => m().diff(D.created(f), 'days') < 7).length;
    const editedThisWeek = D.files.filter((f) => m().diff(m(f.stat.mtime), 'days') < 7).length;
    let journaled = 0;
    for (let i = 0; i < 30; i++) if (D.daily(m().subtract(i, 'day'))) journaled++;
    const strip = c.createDiv('qh-hero-stats');
    const stats: [number, string][] = [
      [newThisWeek, t('home.hero.newNotes', { count: newThisWeek })],
      [editedThisWeek, t('home.hero.edited', { count: editedThisWeek })],
      [journaled, t('home.hero.journaled', { count: journaled })],
    ];
    if (D.diagrams.length) stats.push([D.diagrams.length, t('home.hero.diagrams', { count: D.diagrams.length })]);
    for (const [n, label] of stats) {
      const x = strip.createDiv('qh-hs');
      x.createDiv({ cls: 'qh-hs-n', text: formatNumber(n) });
      x.createDiv({ cls: 'qh-hs-l', text: label });
    }
  }

  private openDaily(): void {
    if (!runCommand(this.app, 'periodic-notes:open-daily-note')) runCommand(this.app, 'daily-notes');
  }

  private async quoteOfDay(box: HTMLElement): Promise<void> {
    const quotes = this.D.inFolder(this.plugin.paths.folderPath('quotes')).sort((a, b) => a.path.localeCompare(b.path));
    if (!quotes.length) { box.remove(); return; }
    const f = quotes[m().dayOfYear() % quotes.length];
    const raw = await this.app.vault.cachedRead(f);
    // quotes are expected as a blockquote; callout header lines are skipped
    const body = raw.replace(/^---[\s\S]*?---/, '').split('\n').filter((l) => /^>/.test(l) && !/\[!/.test(l)).map((l) => l.replace(/^>\s?/, '')).join(' ').trim();
    if (!body) { box.remove(); return; }
    const plain = stripInline(body);
    const fm = this.D.fm(f);
    box.createDiv({ cls: 'qh-quote-t', text: plain.length > 260 ? plain.slice(0, 257) + '…' : plain });
    const who = [fm.author ?? fm.creator, fm.source ? String(fm.source).replace(/[[\]"]/g, '') : ''].filter(Boolean).join(' · ');
    if (who) box.createDiv({ cls: 'qh-quote-a', text: who });
    box.addEventListener('click', () => this.open(f.path));
  }

  private randomQuestion(): void {
    const qa = this.D.inFolder(this.plugin.paths.folderPath('questions'));
    if (qa.length) this.open(qa[Math.floor(Math.random() * qa.length)].path);
  }

  /* ------------------------------------------------------------ today */

  private today(g: HTMLElement): void {
    const habits = this.plugin.settings.habits;
    const c = this.w.card(g, 4, t('home.today.title'), 'qh-today');
    const f = this.D.daily(m().startOf('day'));
    if (!f) {
      this.w.empty(c, t('home.today.noNote'));
      c.createEl('button', { cls: 'mod-cta', text: t('home.today.create') }).addEventListener('click', () => this.openDaily());
      return;
    }
    if (!habits.length) {
      this.w.empty(c, t('home.today.noHabits'));
      c.createEl('button', { cls: 'qh-link', text: t('home.today.addHabits') }).addEventListener('click', () => new HabitsManagerModal(this.app, this.plugin).open());
      c.createEl('button', { cls: 'qh-link qh-link-2', text: t('home.today.openNote') }).addEventListener('click', () => this.open(f.path));
      return;
    }
    const fm = this.D.fm(f);
    const met = (h: (typeof habits)[number], v: unknown) => (h.bool ? v === true : v != null && v !== '' && (h.better === 'less' ? Number(v) <= (h.goal ?? 0) : Number(v) >= (h.goal ?? 0)));
    const done = habits.filter((h) => met(h, fm[h.key])).length;
    const top = c.createDiv('qh-today-top');
    this.w.ring(top, done / habits.length, 70, 'var(--dm-accent)', `${formatNumber(done)}/${formatNumber(habits.length)}`);
    const tt = top.createDiv();
    tt.createDiv({ cls: 'qh-today-t', text: done === habits.length ? t('home.today.complete') : t('home.today.goals') });
    tt.createDiv({ cls: 'qh-muted', text: t('home.today.hint') });
    const list = c.createDiv('qh-habits');
    const save = (key: string, val: unknown) => this.app.fileManager.processFrontMatter(f, (x: Record<string, unknown>) => { x[key] = val; });
    for (const h of habits) {
      const row = list.createDiv('qh-h');
      setIcon(row.createSpan('qh-h-ic'), h.icon || 'repeat');
      row.createSpan({ cls: 'qh-h-n', text: h.name });
      const v: unknown = fm[h.key];
      if (h.bool) {
        const sw = row.createDiv('qh-toggle' + (v === true ? ' is-on' : ''));
        sw.addEventListener('click', handler(async () => {
          const nv = !sw.hasClass('is-on');
          sw.toggleClass('is-on', nv);
          row.toggleClass('is-ok', nv);
          await save(h.key, nv);
        }));
        if (v === true) row.addClass('is-ok');
        continue;
      }
      const st = row.createDiv('qh-step');
      const minus = st.createEl('button', { text: '−' });
      const empty = v == null || v === '';
      const val = st.createSpan({ cls: 'qh-step-v', text: empty ? '–' : formatNumber(Number(v)) });
      const plus = st.createEl('button', { text: '+' });
      let cur = empty ? 0 : Number(v);
      const mark = () => row.toggleClass('is-ok', h.better === 'less' ? cur <= (h.goal ?? 0) : cur >= (h.goal ?? 0));
      const bump = async (d: number) => {
        cur = Math.max(0, Math.min(h.max ?? 999, +(cur + d).toFixed(2)));
        val.textContent = formatNumber(cur);
        mark();
        await save(h.key, cur);
      };
      minus.addEventListener('click', () => void bump(-(h.step ?? 1)));
      plus.addEventListener('click', () => void bump(h.step ?? 1));
      if (!empty) mark();
      row.createSpan({ cls: 'qh-h-goal', text: `${h.better === 'less' ? '≤' : '≥'} ${formatNumber(h.goal ?? 0)} ${h.unit ?? ''}` });
    }
    c.createEl('button', { cls: 'qh-link', text: t('home.today.openNote') }).addEventListener('click', () => this.open(f.path));
    c.createEl('button', { cls: 'qh-link qh-link-2', text: t('habits.manage') }).addEventListener('click', () => new HabitsManagerModal(this.app, this.plugin).open());
  }

  /* ------------------------------------------------------------ tasks without an app */

  private async vaultTasks(g: HTMLElement, span: number): Promise<void> {
    const c = this.w.card(g, span, t('home.vaultTasks.title'), 'qh-tasks-card');
    if (this.plugin.ticktick?.active) c.createDiv({ cls: 'qh-muted qh-note-sub', text: t('home.vaultTasks.sendHint') });
    const list = c.createDiv('qh-tasks');
    list.createDiv({ cls: 'qh-muted', text: t('common.loading') });
    const source = this.plugin.vaultTasks;
    const open = (await source.open()).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
    list.empty();
    if (!open.length) { this.w.empty(list, t('home.vaultTasks.none')); return; }
    for (const x of open.slice(0, span >= 8 ? 12 : 9)) this.vaultTaskRow(list, x);
    if (open.length > 12) list.createDiv({ cls: 'qh-muted', text: t('home.vaultTasks.more', { count: open.length - 12 }) });
  }

  private vaultTaskRow(list: HTMLElement, x: TaskItem): void {
    const r = list.createDiv('qh-task');
    const box = r.createDiv('qh-check');
    const tx = r.createDiv('qh-task-t');
    tx.createDiv({ text: x.title });
    const meta = [x.path?.split('/').pop()?.replace(/\.md$/, '') ?? ''];
    if (x.due) meta.push(m(x.due).format(x.allDay ? 'ddd D MMM' : 'ddd D MMM, HH:mm'));
    tx.createDiv({ cls: 'qh-row-meta', text: meta.filter(Boolean).join(' · ') });
    box.addEventListener('click', handler(async () => {
      await this.plugin.vaultTasks.complete(x);
      r.addClass('is-done');
      window.setTimeout(() => r.remove(), 600);
    }));
    tx.addEventListener('click', () => x.path && this.open(x.path, x.line));
    const tt = this.plugin.ticktick;
    if (tt?.active) {
      const up = r.createEl('button', { cls: 'tt-act', attr: { 'aria-label': t('ticktick.sendTo') } });
      setIcon(up, 'arrow-up-right');
      up.addEventListener('click', handler(async () => {
        await this.plugin.ticktickUi?.sendLine(x.title, x.path);
        up.addClass('is-sent');
        setIcon(up, 'check');
      }));
    }
  }

  private miniFocus(g: HTMLElement): void {
    const c = this.w.card(g, 4, t('home.focus.title'), 'qh-focus-card');
    void this.plugin.vaultTasks.open().then((open) => {
      const choices = open.slice(0, 40).map((x) => ({ title: x.title, group: x.list.name }));
      const holder = c.createDiv('tt-root');
      const draw = () => { holder.empty(); renderPomodoro(holder, this.plugin, choices, true, draw); };
      draw();
    });
    c.createEl('button', { cls: 'qh-link', text: t('home.focus.open') }).addEventListener('click', () => void this.plugin.openFocus());
  }

  /* ------------------------------------------------------------ stats */

  private async stats(g: HTMLElement): Promise<void> {
    const holder = g.createDiv('qh-s12 qh-stats-holder');
    const tasks = this.plugin.taskSource();
    const [open, done] = await Promise.all([tasks.open(), tasks.completed()]);
    const w = new Widgets();
    renderTaskStats(holder, w, open, done, {
      open: (x) => x.path && this.open(x.path, x.line),
      moveOverdueToToday: tasks.id === 'ticktick' ? (items) => this.plugin.ticktickUi!.moveToToday(items.map((x) => x.id)) : undefined,
    });
    if (this.plugin.settings.modules.pomodoro || this.plugin.ticktick?.active) {
      const empty = this.plugin.focusSource().id === 'ticktick' ? t('stats.focus.emptyTickTick') : t('stats.focus.emptyLocal');
      renderFocusStats(holder, w, this.plugin.focusSource().sessions(), empty);
    }
  }

  /* ------------------------------------------------------------ habits */

  private habitsCard(g: HTMLElement): void {
    const habits = this.plugin.settings.habits;
    const c = this.w.card(g, 12, t('home.habits.title'), 'qh-habits-card');
    if (!habits.length) {
      this.w.empty(c, t('home.habits.none'));
      c.createEl('button', { cls: 'qh-link', text: t('home.today.addHabits') }).addEventListener('click', () => new HabitsManagerModal(this.app, this.plugin).open());
      return;
    }
    const rows = this.D.habits(habits, 30);
    if (!Object.values(rows).some((r) => r.some((v) => v != null))) this.w.empty(c, t('home.habits.noValues'));
    const grid = c.createDiv('qh-hm');
    for (const h of habits) {
      const vals = rows[h.key];
      const nums = vals.filter((v): v is number => v != null);
      const cell = grid.createDiv('qh-hm-cell');
      const hd = cell.createDiv('qh-hm-head');
      setIcon(hd.createSpan(), h.icon || 'repeat');
      hd.createSpan({ text: h.name });
      if (h.bool) {
        const yes = nums.filter((v) => v === 1).length;
        hd.createSpan({ cls: 'qh-hm-avg', text: nums.length ? formatPercent(yes / nums.length) : '–' });
        const strip = cell.createDiv('qh-hm-strip');
        vals.forEach((v, i) => {
          const d = strip.createDiv(v === 1 ? 'is-on' : v === 0 ? 'is-off' : '');
          this.w.tipOn(d, m().subtract(29 - i, 'day').format('D MMM') + (v === 1 ? ' ✓' : v === 0 ? ' ✗' : ' —'));
        });
        continue;
      }
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const good = avg == null ? null : h.better === 'less' ? avg <= (h.goal ?? 0) : avg >= (h.goal ?? 0);
      const a = hd.createSpan({ cls: 'qh-hm-avg', text: avg == null ? '–' : `${formatNumber(+avg.toFixed(1))} ${h.unit ?? ''}` });
      if (good != null) a.addClass(good ? 'is-good' : 'is-bad');
      this.w.sparkline(cell, vals, { w: 220, h: 46, goal: h.goal, color: good === false ? 'var(--dm-accent3)' : 'var(--dm-accent2)' });
    }
    c.createEl('button', { cls: 'qh-link', text: t('habits.manage') }).addEventListener('click', () => new HabitsManagerModal(this.app, this.plugin).open());
  }

  /* ------------------------------------------------------------ vault */

  private kpis(g: HTMLElement): void {
    const D = this.D;
    const weekly = D.weekly(12);
    this.w.kpi(g, { n: D.notes.length, label: t('home.kpi.notes', { count: D.notes.length }), sub: t('home.kpi.notesSub', { n: weekly[weekly.length - 1] }), art: 'docs', tone: 1 });
    this.w.kpi(g, { n: D.links, label: t('home.kpi.links', { count: D.links }), sub: t('home.kpi.linksSub', { n: (D.links / Math.max(1, D.notes.length)).toFixed(1) }), art: 'link', tone: 2 });
    const qa = D.inFolder(this.plugin.paths.folderPath('questions'));
    if (qa.length) {
      const month = qa.filter((f) => D.created(f).isSame(m(), 'month')).length;
      this.w.kpi(g, { n: qa.length, label: t('home.kpi.questions', { count: qa.length }), sub: t('home.kpi.monthSub', { n: month }), art: 'qa', tone: 4 });
    } else {
      const tags = Object.keys((this.app.metadataCache as unknown as { getTags?: () => Record<string, number> }).getTags?.() ?? {}).length;
      this.w.kpi(g, { n: tags, label: t('home.kpi.tags', { count: tags }), sub: t('home.kpi.tagsSub'), art: 'layers', tone: 4 });
    }
    const run = D.journalStreak();
    this.w.kpi(g, { n: run, label: t('home.kpi.streak', { count: run }), sub: t('home.kpi.streakSub'), art: 'flame', tone: 3 });
  }

  private heatmap(g: HTMLElement): void {
    const c = this.w.card(g, 8, t('home.heatmap.title'), 'qh-heat-card');
    const res = this.w.heatGrid(c, this.D.activity(), 26, t('home.heatmap.unit'), (day, cell) => { if (this.D.daily(day)) cell.addClass('has-daily'); });
    const foot = c.createDiv('qh-heat-foot');
    foot.createSpan({ text: t('home.heatmap.summary', { days: res.activeDays, total: res.total }) + (res.best ? ' · ' + t('home.heatmap.peak', { date: res.best.format('D MMM') }) : '') });
    this.w.heatLegend(foot);
  }

  private foldersCard(g: HTMLElement): void {
    const c = this.w.card(g, 4, t('home.folders.title'));
    const all = this.D.folders(t('home.folders.root'));
    const top = all.slice(0, 5);
    const rest = all.slice(5).reduce((a, b) => a + b[1], 0);
    const rows: [string, number, string][] = top.map(([name, n], i) => [name.replace(/^\d+\s*/, ''), n, `var(--qh-c${i + 1})`]);
    if (rest) rows.push([t('home.folders.others'), rest, 'var(--qh-track-strong)']);
    this.w.shareBar(c, rows, t('home.folders.unit'));
  }

  /** Books and courses, when notes carry `type: book` / `type: course` properties. */
  private learning(g: HTMLElement): void {
    const books = this.D.byType('book');
    const courses = this.D.byType('course');
    if (!books.length && !courses.length) return;
    const c = this.w.card(g, 4, t('home.learning.title'));
    const status = (s: string) => books.filter((b) => String(this.D.fm(b).status ?? '').toLowerCase() === s);
    const parts: [string, string, string][] = [['done', t('home.learning.done'), 'var(--dm-accent2)'], ['reading', t('home.learning.reading'), 'var(--dm-accent)'], ['to read', t('home.learning.later'), 'var(--dm-faint)']];
    if (books.length) {
      const seg = c.createDiv('qh-stack');
      for (const [k, label, color] of parts) {
        const n = status(k).length;
        if (!n) continue;
        const d = seg.createDiv();
        d.style.flex = String(n);
        d.style.background = color;
        this.w.tipOn(d, `${label}: ${formatNumber(n)}`);
      }
      c.createDiv({ cls: 'qh-muted', text: t('home.learning.books', { done: status('done').length, reading: status('reading').length, later: status('to read').length }) });
      for (const b of status('reading').slice(0, 3)) {
        const r = c.createDiv('qh-item');
        setIcon(r.createSpan(), 'book-open');
        r.createSpan({ text: b.basename });
        r.addEventListener('click', () => this.open(b.path));
      }
    }
    const progress = (f: TFile) => { let p = Number(this.D.fm(f).progress) || 0; if (p > 0 && p <= 1) p *= 100; return p; };
    const running = courses.filter((x) => String(this.D.fm(x).status ?? '').toLowerCase() === 'in progress').sort((a, b) => progress(b) - progress(a));
    if (running.length) c.createDiv({ cls: 'qh-sub', text: t('home.learning.courses') });
    for (const x of running.slice(0, 5)) {
      const p = progress(x);
      const r = c.createDiv('qh-prog');
      r.addEventListener('click', () => this.open(x.path));
      const top = r.createDiv('qh-prog-top');
      top.createSpan({ text: x.basename });
      top.createSpan({ cls: 'qh-prog-p', text: formatPercent(p / 100) });
      r.createDiv('qh-meter').createDiv().style.width = `${Math.min(100, p)}%`;
    }
  }

  private recent(g: HTMLElement): void {
    const c = this.w.card(g, 4, t('home.recent.title'));
    const paths = this.app.workspace.getLastOpenFiles().filter((p) => p !== this.sourcePath).slice(0, 8);
    if (!paths.length) this.w.empty(c, t('home.recent.none'));
    for (const p of paths) {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) continue;
      const r = c.createDiv('qh-row');
      r.addEventListener('click', () => this.open(p));
      setIcon(r.createSpan('qh-row-ic'), /excalidraw/.test(p) ? 'pen-tool' : f.extension === 'base' ? 'database' : 'file-text');
      const tt = r.createDiv('qh-row-t');
      tt.createDiv({ cls: 'qh-row-name', text: f.basename.replace(/\.excalidraw$/, '') });
      tt.createDiv({ cls: 'qh-row-meta', text: (f.parent && f.parent.path !== '/' ? f.parent.name + ' · ' : '') + m(f.stat.mtime).fromNow() });
    }
  }

  private suggestions(g: HTMLElement): void {
    const c = this.w.card(g, 4, t('home.suggest.title'), 'qh-suggest');
    const D = this.D;
    const S: { icon: string; title: string; desc: string; act: () => void; tone?: string }[] = [];
    if (!D.daily(m())) S.push({ icon: 'calendar-plus', title: t('home.suggest.startToday'), desc: t('home.suggest.startTodayDesc'), act: () => this.openDaily(), tone: 'accent' });
    const qa = D.inFolder(this.plugin.paths.folderPath('questions')).sort((a, b) => a.stat.mtime - b.stat.mtime);
    if (qa.length) {
      const pick = qa[m().dayOfYear() % Math.min(10, qa.length)];
      S.push({ icon: 'repeat', title: t('home.suggest.review', { name: pick.basename }), desc: t('home.suggest.untouched', { when: m(pick.stat.mtime).fromNow() }), act: () => this.open(pick.path) });
    }
    for (const b of D.byType('book').filter((x) => String(D.fm(x).status ?? '').toLowerCase() === 'reading').slice(0, 1)) {
      S.push({ icon: 'book-open', title: t('home.suggest.keepReading', { name: b.basename }), desc: t('home.suggest.keepReadingDesc'), act: () => this.open(b.path) });
    }
    const inbox = D.inFolder(this.plugin.paths.folderPath('inbox'));
    if (inbox.length) S.push({ icon: 'inbox', title: t('home.suggest.inbox', { count: inbox.length }), desc: t('home.suggest.inboxDesc'), act: () => this.open(inbox[0].path), tone: 'warn' });
    const stale = D.notes
      .filter((f) => !this.plugin.paths.isDaily(f.path) && (D.backlinks[f.path] ?? 0) >= 3 && m().diff(m(f.stat.mtime), 'days') > 45)
      .sort((a, b) => (D.backlinks[b.path] ?? 0) - (D.backlinks[a.path] ?? 0));
    if (stale.length) S.push({ icon: 'hourglass', title: t('home.suggest.revisit', { name: stale[0].basename }), desc: t('home.suggest.revisitDesc', { count: D.backlinks[stale[0].path] ?? 0 }), act: () => this.open(stale[0].path) });
    const orphans = D.orphans();
    if (orphans.length) S.push({ icon: 'unlink', title: t('home.suggest.orphans', { count: orphans.length }), desc: t('home.suggest.orphansDesc'), act: () => this.open(orphans[0].path) });
    const broken = D.unresolvedCount();
    if (broken) S.push({ icon: 'link-2-off', title: t('home.suggest.broken', { count: broken }), desc: t('home.suggest.brokenDesc'), act: () => void this.plugin.openStudio('health'), tone: 'warn' });
    const diagram = D.diagrams[m().dayOfYear() % Math.max(1, D.diagrams.length)];
    if (diagram) S.push({ icon: 'pen-tool', title: t('home.suggest.diagram', { name: diagram.basename.replace(/\.excalidraw$/, '') }), desc: t('home.suggest.diagramDesc'), act: () => this.open(diagram.path) });
    if (!S.length) this.w.empty(c, t('home.suggest.none'));
    for (const s of S.slice(0, 6)) {
      const r = c.createDiv('qh-sg' + (s.tone ? ' is-' + s.tone : ''));
      r.addEventListener('click', s.act);
      setIcon(r.createSpan('qh-sg-ic'), s.icon);
      const tt = r.createDiv();
      tt.createDiv({ cls: 'qh-sg-t', text: s.title });
      tt.createDiv({ cls: 'qh-sg-d', text: s.desc });
    }
  }

  private growth(g: HTMLElement): void {
    const { cum, counts, labels } = this.D.monthlyCumulative(12);
    this.w.growth(this.w.card(g, 6, t('home.growth.title')), cum, counts, labels, t('home.folders.unit'));
  }

  private tagsCard(g: HTMLElement): void {
    const tags = this.D.tags(9);
    if (!tags.length) return;
    const c = this.w.card(g, 6, t('home.tags.title'));
    const box = c.createDiv('qh-bars');
    const mx = Math.max(1, ...tags.map((x) => x[1]));
    tags.forEach(([tag, n], i) => {
      const r = box.createDiv('qh-bar-row');
      r.addEventListener('click', () => openGlobalSearch(this.app, 'tag:' + tag));
      r.createSpan({ cls: 'qh-bar-l', text: tag });
      const fill = r.createDiv('qh-bar').createDiv();
      fill.style.width = `${(n / mx) * 100}%`;
      fill.style.background = `var(--dm-folder-${(i % 9) + 1})`;
      r.createSpan({ cls: 'qh-bar-n', text: formatNumber(n) });
    });
  }

  private gallery(g: HTMLElement): void {
    if (!this.D.diagrams.length) return;
    const strip = this.w.card(g, 12, t('home.diagrams.title'), 'qh-gal').createDiv('qh-strip');
    const sorted = [...this.D.diagrams].sort((a, b) => (this.D.backlinks[b.path] ?? 0) - (this.D.backlinks[a.path] ?? 0));
    for (const f of sorted) {
      const chip = strip.createDiv('qh-chip');
      setIcon(chip.createSpan(), 'pen-tool');
      chip.createSpan({ text: f.basename.replace(/\.excalidraw$/, '') });
      chip.addEventListener('click', () => this.open(f.path));
    }
  }

  private footer(g: HTMLElement): void {
    const c = this.w.card(g, 12, null, 'qh-foot');
    for (const f of this.D.bases().slice(0, 8)) {
      c.createSpan({ cls: 'qh-foot-l', text: f.basename }).addEventListener('click', () => this.open(f.path));
    }
    c.createSpan({ cls: 'qh-foot-l', text: t('home.footer.studio') }).addEventListener('click', () => void this.plugin.openStudio());
    c.createSpan({ cls: 'qh-foot-l qh-foot-r', text: t('home.footer.refresh') }).addEventListener('click', () => this.render());
  }
}

/** Plain text from a line of Markdown: links keep their label, emphasis marks go. */
function stripInline(md: string): string {
  return md
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, target: string, label: string) => label || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|==|~~)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
