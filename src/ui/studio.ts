import { ItemView, MarkdownView, Notice, PluginSettingTab, Setting, setIcon, TFolder, type App, type WorkspaceLeaf } from 'obsidian';
import type DamaskStudio from '../main';
import { iconButton, segmented, handler } from '../core/dom';
import {
  baseMode, currentTheme, dailyNoteSettings, isPluginEnabled, isSnippetOn, openPluginSettings, openWithDefaultApp, pluginManifests,
  setBaseMode, setPluginEnabled, setSnippet, setTheme, snippetNames, themeInstalled, css,
} from '../core/internals';
import { dir, formatNumber, isRtl, LANGUAGES, t } from '../i18n';
import { applyFolderPreset, FOLDER_PRESETS, HEADING_PRESETS, THEME_NAME, VARIANTS } from '../modules/appearance/styles';
import { healthChecks, useExcalidrawFont, vaultStats, type Check } from '../modules/health/checks';
import { GalleryModal } from '../modules/inserter/gallery';
import { HabitsManagerModal } from '../modules/habits/manager';
import { TrashModal } from '../integrations/ticktick/modals';
import { TICKTICK } from '../integrations/ticktick/client';
import type { ModuleId } from '../settings/types';
import { renderNoteStyle } from './note-style';
import type { SceneId } from './preview/timeline';

export const STUDIO_VIEW = 'damask-studio';

interface Tab { id: string; icon: string; label: () => string; show?: (p: DamaskStudio) => boolean; draw: (ui: StudioUI, body: HTMLElement) => void }

const TABS: Tab[] = [
  { id: 'dashboard', icon: 'layout-dashboard', label: () => t('studio.tabs.dashboard'), draw: (ui, b) => ui.dashboard(b) },
  { id: 'modules', icon: 'toggle-right', label: () => t('studio.tabs.modules'), draw: (ui, b) => ui.modulesTab(b) },
  { id: 'integrations', icon: 'plug', label: () => t('studio.tabs.integrations'), draw: (ui, b) => ui.integrationsTab(b) },
  { id: 'vault', icon: 'folder-cog', label: () => t('studio.tabs.vault'), draw: (ui, b) => ui.vaultTab(b) },
  { id: 'theme', icon: 'swatch-book', label: () => t('studio.tabs.theme'), draw: (ui, b) => ui.themeTab(b) },
  { id: 'embeds', icon: 'image', label: () => t('studio.tabs.embeds'), show: (p) => p.settings.modules.embeds, draw: (ui, b) => ui.embedsTab(b) },
  { id: 'folders', icon: 'folder-tree', label: () => t('studio.tabs.folders'), show: (p) => p.settings.modules.folders, draw: (ui, b) => ui.foldersTab(b) },
  { id: 'headings', icon: 'heading', label: () => t('studio.tabs.headings'), show: (p) => p.settings.modules.headings, draw: (ui, b) => ui.headingsTab(b) },
  { id: 'note', icon: 'brush', label: () => t('studio.tabs.note'), draw: (ui, b) => renderNoteStyle(b.createDiv('vs-card'), ui.p, ui.app.workspace.getActiveFile()) },
  { id: 'snippets', icon: 'file-code-2', label: () => t('studio.tabs.snippets'), draw: (ui, b) => ui.snippetsTab(b) },
  { id: 'plugins', icon: 'puzzle', label: () => t('studio.tabs.plugins'), draw: (ui, b) => ui.pluginsTab(b) },
  { id: 'health', icon: 'stethoscope', label: () => t('studio.tabs.health'), show: (p) => p.settings.modules.health, draw: (ui, b) => ui.healthTab(b) },
];

const MODULES: { id: ModuleId; icon: string }[] = [
  { id: 'home', icon: 'home' },
  { id: 'inserter', icon: 'square-plus' },
  { id: 'embeds', icon: 'image' },
  { id: 'folders', icon: 'folder-tree' },
  { id: 'headings', icon: 'heading' },
  { id: 'variants', icon: 'swatch-book' },
  { id: 'pomodoro', icon: 'timer' },
  { id: 'health', icon: 'stethoscope' },
];

/** The control panel. The same UI renders in the side view and in Settings. */
export class StudioUI {
  private showSubfolders = false;
  constructor(readonly p: DamaskStudio, private root: HTMLElement) {}

  get app(): App { return this.p.app; }
  get S() { return this.p.settings; }

  render(): void {
    const r = this.root;
    r.empty();
    r.addClass('vs-root');
    r.setAttr('dir', dir());
    const head = r.createDiv('vs-head');
    setIcon(head.createDiv('vs-logo').createDiv('vs-logo-ic'), 'palette');
    const ht = head.createDiv('vs-head-text');
    ht.createDiv({ cls: 'vs-title', text: t('studio.title') });
    ht.createDiv({ cls: 'vs-sub', text: t('studio.subtitle') });
    r.createDiv('vs-rule');
    const visible = TABS.filter((x) => !x.show || x.show(this.p));
    if (!visible.some((x) => x.id === this.S.ui.tab)) this.S.ui.tab = 'dashboard';
    const tabs = r.createDiv('vs-tabs');
    for (const tab of visible) {
      const b = tabs.createEl('button', { cls: 'vs-tab' + (this.S.ui.tab === tab.id ? ' is-active' : '') });
      setIcon(b.createSpan('vs-tab-ic'), tab.icon);
      b.createSpan({ cls: 'vs-tab-l', text: tab.label() });
      b.addEventListener('click', handler(async () => { this.S.ui.tab = tab.id; await this.p.saveSettings(); this.render(); }));
    }
    const body = r.createDiv('vs-body');
    (visible.find((x) => x.id === this.S.ui.tab) ?? visible[0]).draw(this, body);
    this.p.previews.sweep();
  }

  card(parent: HTMLElement, title: string, icon?: string, desc?: string): HTMLElement {
    const c = parent.createDiv('vs-card');
    const h = c.createDiv('vs-card-head');
    if (icon) setIcon(h.createSpan('vs-card-ic'), icon);
    h.createSpan({ cls: 'vs-card-title', text: title });
    if (desc) c.createDiv({ cls: 'vs-muted vs-card-desc', text: desc });
    return c;
  }

  /** Animated preview of what changing this row does; `value` is read when the preview opens. */
  private preview(s: Setting, scene: SceneId, value: () => string | number | boolean): Setting {
    const name = s.nameEl.textContent ?? '';
    this.p.previews.attach(s, { scene, name, value: () => { const v = value(); return typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v); } });
    return s;
  }

  /** Save and re-apply everything, then redraw this panel. */
  private async commit(redraw = true): Promise<void> {
    await this.p.apply();
    if (redraw) this.render();
  }

  /* ------------------------------------------------------------ dashboard */

  dashboard(b: HTMLElement): void {
    const s = vaultStats(this.p);
    const g = b.createDiv('vs-stats vs-ledger');
    const items: [number, string, string][] = [
      [s.notes, t('studio.stats.notes', { count: s.notes }), 'file-text'],
      [s.diagrams, t('studio.stats.diagrams', { count: s.diagrams }), 'pen-tool'],
      [s.links, t('studio.stats.links', { count: s.links }), 'link'],
      [s.tags, t('studio.stats.tags', { count: s.tags }), 'tag'],
      [s.folders, t('studio.stats.folders', { count: s.folders }), 'folder'],
      [s.plugins, t('studio.stats.plugins', { count: s.plugins }), 'puzzle'],
    ];
    for (const [n, label, icon] of items) {
      const c = g.createDiv('vs-stat');
      setIcon(c.createDiv('vs-stat-ic'), icon);
      c.createDiv({ cls: 'vs-stat-n', text: formatNumber(n) });
      c.createDiv({ cls: 'vs-stat-l', text: label });
    }
    if (this.S.modules.health) {
      const warns = healthChecks(this.p).filter((c) => c.level === 'warn');
      const hc = this.card(b, warns.length ? t('studio.health.attention', { count: warns.length }) : t('studio.health.good'), warns.length ? 'alert-triangle' : 'shield-check');
      hc.addClass('vs-status', warns.length ? 'is-warn' : 'is-ok');
      for (const w of warns.slice(0, 4)) this.checkRow(hc, w);
      hc.createEl('button', { cls: 'vs-link', text: t('studio.health.openFull') }).addEventListener('click', () => { this.S.ui.tab = 'health'; this.render(); });
    }

    const qa = this.card(b, t('studio.quick.title'), 'zap');
    const grid = qa.createDiv('vs-quick');
    const Q = (icon: string, label: string, act: () => void) => {
      const x = grid.createEl('button', { cls: 'vs-q' });
      setIcon(x.createSpan('vs-q-ic'), icon);
      x.createSpan({ cls: 'vs-q-l', text: label });
      setIcon(x.createSpan('vs-q-go'), isRtl() ? 'chevron-left' : 'chevron-right');
      x.addEventListener('click', act);
    };
    if (this.S.modules.home) Q('home', t('studio.quick.home'), () => void this.p.openHome());
    if (this.S.modules.inserter) Q('square-plus', t('studio.quick.gallery'), () => new GalleryModal(this.app, this.p, this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null).open());
    Q('brush', t('studio.quick.noteStyle'), () => { this.S.ui.tab = 'note'; this.render(); });
    if (this.S.modules.pomodoro) Q('timer', t('studio.quick.focus'), () => void this.p.openFocus());
    Q('list-checks', t('habits.manage'), () => new HabitsManagerModal(this.app, this.p).open());
    if (this.p.ticktick) Q('check-check', t('commands.taskCenter'), () => void this.p.openTaskCenter());
    if (this.S.modules.embeds) Q('image', this.S.embeds.toolbar ? t('studio.quick.hideEmbedBar') : t('studio.quick.showEmbedBar'), handler(async () => { this.S.embeds.toolbar = !this.S.embeds.toolbar; await this.commit(); }));
    Q('refresh-cw', t('studio.quick.reloadSnippets'), () => { void css(this.app)?.readSnippets?.(); new Notice(t('common.done')); });

    if (this.S.modules.embeds) this.card(b, t('studio.tips.embedsTitle'), 'mouse-pointer-click', t('studio.tips.embeds')).addClass('vs-marginalia');
    if (!this.p.paths.homeFile() && this.S.modules.home) {
      const hc = this.card(b, t('studio.homeMissing.title'), 'home', t('studio.homeMissing.desc', { path: this.p.paths.home }));
      hc.createEl('button', { cls: 'mod-cta', text: t('studio.homeMissing.create') }).addEventListener('click', () => void createHomeNote(this.p).then(() => this.render()));
    }
  }

  checkRow(parent: HTMLElement, c: Check): void {
    const row = parent.createDiv('vs-check vs-' + c.level);
    setIcon(row.createDiv('vs-check-ic'), { warn: 'alert-triangle', info: 'info', ok: 'check-circle-2' }[c.level]);
    const body = row.createDiv('vs-check-body');
    body.createDiv({ cls: 'vs-check-title', text: c.title });
    if (c.detail) body.createDiv({ cls: 'vs-muted', text: c.detail });
    if (c.list?.length) {
      const d = body.createEl('details');
      d.createEl('summary', { text: t('studio.health.showList', { count: c.list.length }) });
      const ul = d.createEl('ul', { cls: 'vs-list' });
      for (const it of c.list.slice(0, 200)) ul.createEl('li', { text: it.label }).addEventListener('click', () => void this.app.workspace.openLinkText(it.path, '', false));
    }
    if (c.fix) {
      const btn = row.createEl('button', { cls: 'mod-cta vs-fix', text: c.fixLabel ?? t('health.fix') });
      btn.addEventListener('click', handler(async () => {
        btn.disabled = true;
        try { await c.fix!(); new Notice(t('studio.health.fixed', { title: c.title })); } catch (e) { console.error(e); new Notice(t('studio.health.fixFailed', { error: (e as Error).message })); }
        window.setTimeout(() => this.render(), 300);
      }));
    }
  }

  /* ------------------------------------------------------------ modules */

  modulesTab(b: HTMLElement): void {
    const c = this.card(b, t('studio.modules.title'), 'toggle-right', t('studio.modules.desc'));
    for (const m of MODULES) {
      const s = new Setting(c).setName(t(`studio.modules.items.${m.id}.name`)).setDesc(t(`studio.modules.items.${m.id}.desc`));
      const ic = s.nameEl.createSpan('vs-mod-ic');
      setIcon(ic, m.icon);
      s.nameEl.prepend(ic);
      s.addToggle((x) => x.setValue(this.S.modules[m.id]).onChange(async (v) => { this.S.modules[m.id] = v; await this.commit(); }));
      this.preview(s, `mod.${m.id}`, () => this.S.modules[m.id]);
    }
    const i = this.card(b, t('studio.integrations.title'), 'plug', t('studio.modules.integrationsHint'));
    const tt = new Setting(i).setName(TICKTICK).setDesc(t('studio.integrations.ticktick.desc'))
      .addToggle((x) => x.setValue(this.S.integrations.ticktick).onChange(async (v) => { this.S.integrations.ticktick = v; await this.commit(); }))
      .addExtraButton((x) => x.setIcon('settings').setTooltip(t('studio.integrations.configure')).onClick(() => { this.S.ui.tab = 'integrations'; this.render(); }));
    this.preview(tt, 'mod.ticktick', () => this.S.integrations.ticktick);
  }

  /* ------------------------------------------------------------ integrations */

  integrationsTab(b: HTMLElement): void {
    const S = this.S;
    const c = this.card(b, TICKTICK, 'check-check', t('studio.integrations.ticktick.long'));
    new Setting(c).setName(t('studio.integrations.enable')).setDesc(t('studio.integrations.ticktick.enableDesc'))
      .addToggle((x) => x.setValue(S.integrations.ticktick).onChange(async (v) => { S.integrations.ticktick = v; await this.commit(); }));
    const tt = this.p.ticktick;
    const ui = this.p.ticktickUi;
    if (!S.integrations.ticktick || !tt || !ui) {
      c.createDiv({ cls: 'vs-note', text: t('studio.integrations.offNote') });
      return;
    }
    if (!tt.token) {
      ui.connect(c.createDiv('tt-root'), () => this.render());
      return;
    }
    c.createDiv({ cls: 'vs-muted', text: tt.error ? '⚠ ' + tt.error : tt.cache.syncedAt ? t('ticktick.status.connected', { lists: tt.cache.projects.length, tasks: tt.cache.tasks.length }) : t('ticktick.status.never') });
    new Setting(c).setName(t('studio.integrations.ticktick.center')).addButton((x) => x.setButtonText(t('common.open')).setCta().onClick(() => void this.p.openTaskCenter()));
    new Setting(c).setName(t('studio.integrations.ticktick.interval')).setDesc(t('studio.integrations.ticktick.intervalDesc')).addDropdown((d) => {
      for (const v of ['5', '10', '15', '30', '60']) d.addOption(v, v);
      d.setValue(String(S.ticktick.interval)).onChange(async (v) => { S.ticktick.interval = +v; await this.p.saveSettings(); this.p.rescheduleTickTick(); });
    });
    new Setting(c).setName(t('studio.integrations.ticktick.doneToDaily')).setDesc(t('studio.integrations.ticktick.doneToDailyDesc', { heading: t('ticktick.doneHeading') }))
      .addToggle((x) => x.setValue(S.ticktick.doneToDaily).onChange(async (v) => { S.ticktick.doneToDaily = v; await this.p.saveSettings(); }));
    new Setting(c).setName(t('studio.integrations.ticktick.onHome')).setDesc(t('studio.integrations.ticktick.onHomeDesc'))
      .addToggle((x) => x.setValue(S.ticktick.onHome).onChange(async (v) => { S.ticktick.onHome = v; await this.commit(false); }));
    new Setting(c).setName(t('studio.integrations.ticktick.fullSync')).setDesc(t('studio.integrations.ticktick.fullSyncDesc'))
      .addButton((x) => x.setButtonText(t('studio.integrations.ticktick.fullSyncBtn')).onClick(() => void tt.sync({ full: true })));
    new Setting(c).setName(t('studio.integrations.ticktick.disconnect')).setDesc(t('studio.integrations.ticktick.disconnectDesc'))
      .addButton((x) => x.setButtonText(t('studio.integrations.ticktick.disconnectBtn')).setClass('mod-warning').onClick(() => { tt.disconnect(); this.render(); }));

    const mc = this.card(b, t('studio.integrations.mirror.title'), 'refresh-ccw-dot', t('studio.integrations.mirror.desc'));
    const MS = S.ticktick.mirror;
    new Setting(mc).setName(t('studio.integrations.mirror.tasks')).setDesc(t('studio.integrations.mirror.tasksDesc'))
      .addToggle((x) => x.setValue(MS.on).onChange(async (v) => { MS.on = v; await this.p.saveSettings(); if (v) void tt.sync(); }));
    new Setting(mc).setName(t('studio.integrations.mirror.folder'))
      .addText((x) => x.setValue(MS.folder).onChange(async (v) => { MS.folder = v.trim() || 'TickTick'; await this.p.saveSettings(); }));
    new Setting(mc).setName(t('studio.integrations.mirror.habits')).setDesc(t('studio.integrations.mirror.habitsDesc'))
      .addToggle((x) => x.setValue(MS.habits).onChange(async (v) => { MS.habits = v; await this.p.saveSettings(); if (v) void tt.sync(); }));
    new Setting(mc).setName(t('studio.integrations.mirror.keepDone')).addDropdown((d) => {
      for (const v of ['3', '7', '14', '30']) d.addOption(v, v);
      d.setValue(String(MS.keepDone || 7)).onChange(async (v) => { MS.keepDone = +v; await this.p.saveSettings(); });
    });
    new Setting(mc).addButton((x) => x.setButtonText(t('ticktick.syncNow')).setCta().onClick(() => void tt.sync()))
      .addButton((x) => x.setButtonText(t('ticktick.trash.button', { count: this.p.ticktickMirror?.st.trash.length ?? 0 })).onClick(() => new TrashModal(this.app, this.p).open()));
  }

  /* ------------------------------------------------------------ vault setup */

  vaultTab(b: HTMLElement): void {
    const S = this.S;
    const lang = this.card(b, t('studio.vault.language'), 'languages', t('studio.vault.languageDesc'));
    new Setting(lang).setName(t('studio.vault.language')).addDropdown((d) => {
      d.addOption('auto', t('studio.vault.followObsidian'));
      for (const l of LANGUAGES) d.addOption(l.code, l.native);
      d.setValue(S.language).onChange(async (v) => { S.language = v; await this.commit(); new Notice(t('studio.vault.languageReload')); });
    });
    new Setting(lang).setName(t('preview.setting')).setDesc(t('preview.settingDesc'))
      .addToggle((x) => x.setValue(S.ui.previews).onChange(async (v) => { S.ui.previews = v; if (!v) this.p.previews.close(); await this.commit(); }));

    const c = this.card(b, t('studio.vault.title'), 'folder-cog', t('studio.vault.desc'));
    const folders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && f.path !== '/').map((f) => f.path).sort();
    const text = (name: string, desc: string, key: 'home' | 'quotes' | 'questions' | 'inbox' | 'templates' | 'excalidrawFont' | 'dailyFolder' | 'dailyFormat', placeholder = '') => {
      new Setting(c).setName(name).setDesc(desc).addText((x) => {
        x.setPlaceholder(placeholder).setValue(S.paths[key]).onChange(async (v) => { S.paths[key] = v.trim(); await this.p.saveSettings(); });
        x.inputEl.setAttr('dir', 'auto');
        if (key !== 'home' && key !== 'excalidrawFont' && key !== 'dailyFormat') {
          const list = x.inputEl.parentElement!.createEl('datalist', { attr: { id: 'dm-folders-' + key } });
          for (const f of folders) list.createEl('option', { value: f });
          x.inputEl.setAttr('list', 'dm-folders-' + key);
        }
      });
    };
    const auto = dailyNoteSettings(this.app);
    text(t('studio.vault.home'), t('studio.vault.homeDesc'), 'home', 'Home.md');
    text(t('studio.vault.dailyFolder'), t('studio.vault.dailyAuto', { folder: auto.folder || '/', format: auto.format }), 'dailyFolder', auto.folder);
    text(t('studio.vault.dailyFormat'), t('studio.vault.dailyFormatDesc'), 'dailyFormat', auto.format);
    text(t('studio.vault.quotes'), t('studio.vault.quotesDesc'), 'quotes');
    text(t('studio.vault.questions'), t('studio.vault.questionsDesc'), 'questions');
    text(t('studio.vault.inbox'), t('studio.vault.inboxDesc'), 'inbox');
    text(t('studio.vault.templates'), t('studio.vault.templatesDesc'), 'templates');
    new Setting(c).setName(t('studio.vault.excluded')).setDesc(t('studio.vault.excludedDesc')).addTextArea((x) => x
      .setValue(S.paths.excluded.join('\n'))
      .onChange(async (v) => { S.paths.excluded = v.split('\n').map((s) => s.trim()).filter(Boolean); await this.p.saveSettings(); }));

    const hm = this.card(b, t('studio.home.title'), 'home', t('studio.home.desc'));
    new Setting(hm).setName(t('studio.home.reading')).addToggle((x) => x.setValue(S.home.readingMode).onChange(async (v) => { S.home.readingMode = v; await this.p.saveSettings(); }));
    new Setting(hm).setName(t('studio.home.startup')).addToggle((x) => x.setValue(S.home.openOnStartup).onChange(async (v) => { S.home.openOnStartup = v; await this.p.saveSettings(); }));
    new Setting(hm).setName(t('studio.home.hijri')).addToggle((x) => x.setValue(S.home.hijri).onChange(async (v) => { S.home.hijri = v; await this.commit(false); }));
    if (!this.p.paths.homeFile()) new Setting(hm).setName(t('studio.homeMissing.title')).addButton((x) => x.setButtonText(t('studio.homeMissing.create')).setCta().onClick(() => void createHomeNote(this.p).then(() => this.render())));
    new Setting(hm).setName(t('habits.manage')).addButton((x) => x.setButtonText(t('common.open')).onClick(() => new HabitsManagerModal(this.app, this.p).open()));
  }

  /* ------------------------------------------------------------ theme */

  themeTab(b: HTMLElement): void {
    const T = this.S.theme;
    const head = this.card(b, t('studio.theme.title'), 'swatch-book', t('studio.theme.desc'));
    if (!themeInstalled(this.app, THEME_NAME)) head.createDiv({ cls: 'vs-note', text: t('studio.theme.missing') });
    else if (currentTheme(this.app) !== THEME_NAME) {
      head.createEl('button', { cls: 'mod-cta', text: t('studio.theme.activate') }).addEventListener('click', () => { setTheme(this.app, THEME_NAME); window.setTimeout(() => this.render(), 300); });
    }
    new Setting(head).setName(t('studio.theme.mode')).then((s) => segmented(s.controlEl, [['dark', t('studio.theme.dark'), 'moon'], ['light', t('studio.theme.light'), 'sun'], ['system', t('studio.theme.system'), 'monitor']], baseMode(this.app), (v) => setBaseMode(this.app, v)));
    if (this.S.modules.variants) {
      for (const mode of ['dark', 'light'] as const) {
        const c = this.card(b, mode === 'dark' ? t('studio.theme.darkVariants') : t('studio.theme.lightVariants'), mode === 'dark' ? 'moon' : 'sun');
        const grid = c.createDiv('vs-variants');
        for (const v of VARIANTS.filter((x) => x.mode === mode)) {
          const card = grid.createDiv('vs-variant' + (T[mode] === v.id ? ' is-active' : ''));
          const pv = card.createDiv('vs-vprev');
          pv.style.background = v.bg;
          pv.style.color = v.text;
          const side = pv.createDiv('vs-vside');
          side.style.background = v.bg2;
          for (let i = 0; i < 3; i++) {
            const l = side.createDiv('vs-vnav');
            l.style.background = i === 1 ? v.accent : v.text;
            l.style.opacity = i === 1 ? '.9' : '.25';
          }
          const body = pv.createDiv('vs-vbody');
          const h1 = body.createDiv({ cls: 'vs-vh1', text: t('studio.theme.sample.h1') });
          h1.style.color = v.h1;
          h1.style.borderBottom = '2px solid ' + v.h1;
          const h2 = body.createDiv({ cls: 'vs-vh2', text: t('studio.theme.sample.h2') });
          h2.style.color = v.h2;
          h2.style.borderInlineStart = '3px solid ' + v.h2;
          body.createDiv({ cls: 'vs-vtxt', text: t('studio.theme.sample.text') }).style.color = v.text;
          const quote = body.createDiv({ cls: 'vs-vq', text: t('studio.theme.sample.quote') });
          quote.style.borderInlineStart = '3px solid ' + v.accent;
          quote.style.background = v.accent + '22';
          const chips = body.createDiv('vs-vchips');
          for (const col of [v.accent, v.accent2, v.accent3]) chips.createSpan('vs-vchip').style.background = col;
          const label = card.createDiv('vs-vlabel');
          label.createSpan({ text: t(`studio.theme.variants.${v.id}` as 'studio.theme.variants.forest') });
          if (T[mode] === v.id) setIcon(label.createSpan('vs-vcheck'), 'check');
          card.addEventListener('click', handler(async () => {
            T[mode] = v.id;
            const bm = baseMode(this.app);
            if (bm !== mode && bm !== 'system') setBaseMode(this.app, mode);
            await this.commit();
          }));
        }
      }
    }
    const sync = this.card(b, t('studio.theme.syncTitle'), 'link-2');
    if (this.S.modules.folders) new Setting(sync).setName(t('studio.theme.foldersFollow')).setDesc(t('studio.theme.foldersFollowDesc')).addButton((x) => x.setButtonText(t('studio.theme.link')).onClick(async () => { applyFolderPreset(this.app, this.S, 'damask'); await this.commit(false); new Notice(t('common.done')); }));
    new Setting(sync).setName(t('studio.theme.excalidrawFont')).setDesc(this.S.paths.excalidrawFont || t('studio.theme.excalidrawFontUnset')).addButton((x) => x.setButtonText(t('studio.theme.useFont')).onClick(async () => new Notice((await useExcalidrawFont(this.p)) ? t('studio.theme.fontDone') : t('studio.theme.fontMissing'))));
    if (this.S.modules.inserter) {
      const ins = this.card(b, t('studio.insert.title'), 'square-plus', t('studio.insert.desc'));
      this.preview(new Setting(ins).setName(t('studio.insert.menu')).addToggle((x) => x.setValue(this.S.insert.menu).onChange(async (v) => { this.S.insert.menu = v; await this.p.saveSettings(); })), 'ins.menu', () => this.S.insert.menu);
      this.preview(new Setting(ins).setName(t('studio.insert.suggest')).addToggle((x) => x.setValue(this.S.insert.suggest).onChange(async (v) => { this.S.insert.suggest = v; await this.p.saveSettings(); })), 'ins.suggest', () => this.S.insert.suggest);
      this.preview(new Setting(ins).setName(t('studio.insert.ribbon')).addToggle((x) => x.setValue(this.S.insert.ribbon).onChange(async (v) => { this.S.insert.ribbon = v; await this.p.saveSettings(); this.p.reloadFeature('inserter'); })), 'ins.ribbon', () => this.S.insert.ribbon);
      new Setting(ins).setName(t('blocks.gallery.title')).addButton((x) => x.setButtonText(t('common.open')).setCta().onClick(() => new GalleryModal(this.app, this.p, this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null).open()));
    }
  }

  /* ------------------------------------------------------------ embeds */

  embedsTab(b: HTMLElement): void {
    const E = this.S.embeds;
    const c = this.card(b, t('studio.embeds.title'), 'image', t('studio.embeds.desc'));
    this.preview(new Setting(c).setName(t('studio.embeds.enabled')).addToggle((x) => x.setValue(E.enabled).onChange(async (v) => { E.enabled = v; await this.commit(false); })), 'emb.enabled', () => E.enabled);
    this.preview(new Setting(c).setName(t('studio.embeds.toolbar')).addToggle((x) => x.setValue(E.toolbar).onChange(async (v) => { E.toolbar = v; await this.p.saveSettings(); })), 'emb.toolbar', () => E.toolbar);
    this.preview(new Setting(c).setName(t('studio.embeds.trigger')).setDesc(t('studio.embeds.triggerDesc')).then((s) => segmented(s.controlEl, [['hover', t('studio.embeds.onHover')], ['alt', t('studio.embeds.withAlt')]], E.toolbarTrigger, handler(async (v) => { E.toolbarTrigger = v; await this.p.saveSettings(); }))), 'emb.trigger', () => E.toolbarTrigger);
    this.preview(new Setting(c).setName(t('studio.embeds.images')).addToggle((x) => x.setValue(E.includeImages).onChange(async (v) => { E.includeImages = v; await this.commit(false); })), 'emb.images', () => E.includeImages);
    for (const kind of ['excalidraw', 'image'] as const) {
      const d = E.defaults[kind];
      const k = this.card(b, kind === 'excalidraw' ? t('studio.embeds.defaultDrawings') : t('studio.embeds.defaultImages'), kind === 'excalidraw' ? 'pen-tool' : 'image');
      this.preview(new Setting(k).setName(t('embeds.align')).then((s) => segmented(s.controlEl, [['right', t('embeds.right'), 'align-right'], ['center', t('embeds.center'), 'align-center'], ['left', t('embeds.left'), 'align-left']], d.align, handler(async (v) => { d.align = v; await this.commit(false); }))), 'emb.align', () => d.align);
      const ws = new Setting(k).setName(t('embeds.width')).setDesc(t('embeds.widthDesc'));
      let wv: HTMLElement;
      ws.addSlider((sl) => sl.setLimits(0, 100, 5).setValue(d.width).onChange(async (v) => { d.width = v; wv.textContent = v ? `${v}%` : t('embeds.auto'); await this.commit(false); }));
      wv = ws.controlEl.createSpan({ cls: 'vs-val', text: d.width ? `${d.width}%` : t('embeds.auto') });
      this.preview(ws, 'emb.width', () => d.width);
      const ms = new Setting(k).setName(t('embeds.maxWidth'));
      let mv: HTMLElement;
      ms.addSlider((sl) => sl.setLimits(0, 1600, 20).setValue(d.maxWidth).onChange(async (v) => { d.maxWidth = v; mv.textContent = v ? `${v}px` : '∞'; await this.commit(false); }));
      mv = ms.controlEl.createSpan({ cls: 'vs-val', text: d.maxWidth ? `${d.maxWidth}px` : '∞' });
      this.preview(ms, 'emb.maxWidth', () => d.maxWidth);
      this.preview(new Setting(k).setName(t('embeds.frame')).then((s) => segmented(s.controlEl, [['none', t('embeds.none')], ['card', t('embeds.frames.card')], ['glass', t('embeds.frames.glass')], ['outline', t('embeds.frames.outline')], ['polaroid', t('embeds.frames.polaroid')]], d.frame, handler(async (v) => { d.frame = v; await this.commit(false); }))), 'emb.frame', () => d.frame);
      this.preview(new Setting(k).setName(t('embeds.shadow')).addToggle((x) => x.setValue(!!d.shadow).onChange(async (v) => { d.shadow = v; await this.commit(false); })), 'emb.shadow', () => !!d.shadow);
      this.preview(new Setting(k).setName(t('embeds.invertName')).then((s) => segmented(s.controlEl, [['none', t('embeds.none')], ['dark', t('embeds.inDark')], ['always', t('embeds.always')]], d.invert || 'none', handler(async (v) => { d.invert = v; await this.commit(false); }))), 'emb.invert', () => d.invert || 'none');
    }
    const keys = Object.keys(E.layouts);
    const list = this.card(b, t('studio.embeds.custom'), 'list', keys.length ? t('studio.embeds.customDesc') : t('studio.embeds.customNone'));
    for (const key of keys) {
      const L = E.layouts[key];
      const [note, target] = key.split('::');
      const row = list.createDiv('vs-lrow');
      row.createSpan({ cls: 'vs-lname', text: target.split('/').pop()!.replace(/\.md$/, '') });
      row.createSpan({ cls: 'vs-pill', text: note === '*' ? t('studio.embeds.everywhere') : note.split('/').pop()!.replace(/\.md$/, '') });
      row.createSpan({ cls: 'vs-muted', text: [L.align, L.width ? `${L.width}%` : '', L.frame && L.frame !== 'none' ? L.frame : '', L.float && L.float !== 'none' ? 'float' : ''].filter(Boolean).join(' · ') });
      if (note !== '*') row.addEventListener('click', () => void this.app.workspace.openLinkText(note, '', false));
      iconButton(row, 'trash-2', t('common.delete'), handler(async () => { delete E.layouts[key]; await this.commit(); }));
    }
  }

  /* ------------------------------------------------------------ folders */

  foldersTab(b: HTMLElement): void {
    const F = this.S.folders;
    const c = this.card(b, t('studio.folders.title'), 'folder-tree', t('studio.folders.desc'));
    const toggle = (name: string, key: 'enabled' | 'colorFiles' | 'guides' | 'iconColor' | 'bold' | 'pill') =>
      new Setting(c).setName(name).addToggle((x) => x.setValue(F[key]).onChange(async (v) => { F[key] = v; await this.commit(false); }));
    toggle(t('studio.folders.enabled'), 'enabled');
    toggle(t('studio.folders.files'), 'colorFiles');
    toggle(t('studio.folders.guides'), 'guides');
    toggle(t('studio.folders.icons'), 'iconColor');
    toggle(t('studio.folders.bold'), 'bold');
    toggle(t('studio.folders.pill'), 'pill');
    const pr = this.card(b, t('studio.folders.presets'), 'palette', t('studio.folders.presetsDesc'));
    const pg = pr.createDiv('vs-presets');
    for (const [id, P] of Object.entries(FOLDER_PRESETS)) {
      const x = pg.createEl('button', { cls: 'vs-preset' });
      const sw = x.createDiv('vs-swatches');
      for (const col of (P.swatch ?? P.colors).slice(0, 7)) sw.createSpan('vs-sw').style.background = col;
      x.createSpan({ text: P.name() });
      x.addEventListener('click', handler(async () => { applyFolderPreset(this.app, this.S, id); await this.commit(); }));
    }
    const lc = this.card(b, t('studio.folders.list'), 'palette');
    new Setting(lc).setName(t('studio.folders.sub')).addToggle((x) => x.setValue(this.showSubfolders).onChange((v) => { this.showSubfolders = v; this.render(); }));
    const all = this.app.vault.getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && f.path !== '/' && !f.path.startsWith('.'))
      .map((f) => f.path)
      .filter((p) => (this.showSubfolders ? p.split('/').length <= 3 : !p.includes('/')))
      .sort();
    for (const p of all) {
      const depth = p.split('/').length - 1;
      const s = new Setting(lc).setName((depth ? '　'.repeat(depth) + '└ ' : '') + p.split('/').pop());
      s.settingEl.addClass('vs-folder-row');
      s.nameEl.setAttr('dir', 'auto');
      const dot = s.nameEl.createSpan('vs-dot');
      dot.style.background = F.colors[p] || 'transparent';
      s.addColorPicker((cp) => cp.setValue(/^#/.test(F.colors[p] || '') ? F.colors[p] : '#888888').onChange(async (v) => { F.colors[p] = v; dot.style.background = v; await this.commit(false); }));
      s.addExtraButton((x) => x.setIcon('x').setTooltip(depth ? t('studio.folders.inherit') : t('studio.folders.noColor')).onClick(async () => { delete F.colors[p]; await this.commit(); }));
    }
    const fc = this.card(b, t('studio.folders.files2'), 'star', t('studio.folders.files2Desc'));
    for (const [p, col] of Object.entries(F.fileColors)) {
      new Setting(fc).setName(p)
        .addColorPicker((cp) => cp.setValue(/^#/.test(col) ? col : '#b9a779').onChange(async (v) => { F.fileColors[p] = v; await this.commit(false); }))
        .addExtraButton((x) => x.setIcon('trash-2').onClick(async () => { delete F.fileColors[p]; await this.commit(); }));
    }
    new Setting(fc).setName(t('studio.folders.addCurrent')).addButton((x) => x.setButtonText(t('common.add')).onClick(async () => {
      const f = this.app.workspace.getActiveFile();
      if (!f) { new Notice(t('studio.openFileFirst')); return; }
      F.fileColors[f.path] = 'var(--dm-accent)';
      await this.commit();
    }));
  }

  /* ------------------------------------------------------------ headings */

  headingsTab(b: HTMLElement): void {
    const H = this.S.headings;
    const c = this.card(b, t('studio.headings.title'), 'heading', t('studio.headings.desc'));
    new Setting(c).setName(t('studio.headings.enabled')).addToggle((x) => x.setValue(H.enabled).onChange(async (v) => { H.enabled = v; await this.commit(false); }));
    const pg = c.createDiv('vs-presets');
    for (const [id, P] of Object.entries(HEADING_PRESETS)) {
      const x = pg.createEl('button', { cls: 'vs-preset' + (H.preset === id ? ' is-active' : '') });
      const sw = x.createDiv('vs-swatches');
      for (const col of P.colors) sw.createSpan('vs-sw').style.background = col;
      x.createSpan({ text: P.name() });
      x.addEventListener('click', handler(async () => { H.preset = id; H.colors = [...P.colors]; await this.commit(); }));
    }
    const preview = c.createDiv('vs-hprev');
    const drawPreview = () => {
      preview.empty();
      H.colors.forEach((col, i) => {
        const d = preview.createDiv({ cls: `vs-hp vs-hp${i + 1}`, text: t('studio.headings.sample', { n: i + 1 }) });
        d.style.color = col;
        if (H.style === 'bar') d.style.borderInlineStart = '4px solid ' + col;
        if (H.style === 'pill') d.style.background = `color-mix(in srgb, ${col} 12%, transparent)`;
        if (H.style === 'underline') d.style.borderBottom = '2px solid ' + col;
        if (H.glow) d.style.textShadow = `0 0 14px color-mix(in srgb, ${col} 45%, transparent)`;
      });
    };
    drawPreview();
    for (let i = 0; i < 6; i++) new Setting(c).setName('H' + (i + 1)).addColorPicker((cp) => cp.setValue(H.colors[i]).onChange(async (v) => { H.colors[i] = v; H.preset = 'custom'; drawPreview(); await this.commit(false); }));
    new Setting(c).setName(t('studio.headings.style')).then((s) => segmented(s.controlEl, [['none', t('studio.headings.styles.theme')], ['clean', t('studio.headings.styles.clean')], ['bar', t('studio.headings.styles.bar')], ['underline', t('studio.headings.styles.underline')], ['pill', t('studio.headings.styles.pill')]], H.style, handler(async (v) => { H.style = v; drawPreview(); await this.commit(false); })));
    new Setting(c).setName(t('studio.headings.gradient')).addToggle((x) => x.setValue(H.gradient).onChange(async (v) => { H.gradient = v; await this.commit(false); }));
    new Setting(c).setName(t('studio.headings.glow')).addToggle((x) => x.setValue(H.glow).onChange(async (v) => { H.glow = v; drawPreview(); await this.commit(false); }));
    const ss = new Setting(c).setName(t('studio.headings.size'));
    let sv: HTMLElement;
    ss.addSlider((sl) => sl.setLimits(0.8, 1.4, 0.05).setValue(H.scale || 1).onChange(async (v) => { H.scale = v; sv.textContent = `${Math.round(v * 100)}%`; await this.commit(false); }));
    sv = ss.controlEl.createSpan({ cls: 'vs-val', text: `${Math.round((H.scale || 1) * 100)}%` });
  }

  /* ------------------------------------------------------------ snippets & plugins */

  snippetsTab(b: HTMLElement): void {
    const c = this.card(b, t('studio.snippets.title'), 'file-code-2', t('studio.snippets.desc'));
    const list = snippetNames(this.app).sort();
    if (!list.length) c.createDiv({ cls: 'vs-empty', text: t('studio.snippets.none') });
    for (const n of list) {
      const s = new Setting(c).setName(n);
      s.nameEl.setAttr('dir', 'auto');
      s.addToggle((x) => x.setValue(isSnippetOn(this.app, n)).onChange((v) => setSnippet(this.app, n, v)));
    }
    new Setting(c)
      .addButton((x) => x.setButtonText(t('studio.snippets.reload')).onClick(async () => { await css(this.app)?.readSnippets?.(); this.render(); }))
      .addButton((x) => x.setButtonText(t('studio.snippets.openFolder')).onClick(() => openWithDefaultApp(this.app, `${this.app.vault.configDir}/snippets`)));
  }

  pluginsTab(b: HTMLElement): void {
    const man = pluginManifests(this.app).sort((a, x) => a.name.localeCompare(x.name));
    const c = this.card(b, t('studio.plugins.title', { count: man.length }), 'puzzle', t('studio.plugins.desc'));
    const q = c.createEl('input', { type: 'search', cls: 'vs-input', attr: { placeholder: t('common.search') } });
    const box = c.createDiv();
    const draw = () => {
      box.empty();
      const term = q.value.trim().toLowerCase();
      for (const m of man) {
        if (term && !`${m.name} ${m.id} ${m.description}`.toLowerCase().includes(term)) continue;
        const s = new Setting(box).setName(m.name).setDesc(m.description);
        s.nameEl.setAttr('dir', 'auto');
        s.nameEl.createSpan({ cls: 'vs-ver', text: ' v' + m.version });
        s.addExtraButton((x) => x.setIcon('settings').setTooltip(t('studio.plugins.settings')).onClick(() => openPluginSettings(this.app, m.id)));
        s.addToggle((x) => x.setValue(isPluginEnabled(this.app, m.id)).setDisabled(m.id === this.p.manifest.id).onChange(async (v) => {
          await setPluginEnabled(this.app, m.id, v);
          new Notice((v ? t('studio.plugins.enabled') : t('studio.plugins.disabled')) + ' ' + m.name);
        }));
      }
    };
    q.addEventListener('input', draw);
    draw();
  }

  healthTab(b: HTMLElement): void {
    const checks = healthChecks(this.p);
    const c = this.card(b, t('studio.health.title'), 'stethoscope', t('studio.health.desc'));
    const fixable = checks.filter((x) => x.fix && x.level === 'warn');
    if (fixable.length > 1) {
      c.createEl('button', { cls: 'mod-cta', text: t('studio.health.fixAll', { count: fixable.length }) }).addEventListener('click', handler(async () => {
        for (const x of fixable) { try { await x.fix!(); } catch (e) { console.error(e); } }
        new Notice(t('common.done'));
        window.setTimeout(() => this.render(), 300);
      }));
    }
    for (const level of ['warn', 'info', 'ok'] as const) for (const x of checks.filter((k) => k.level === level)) this.checkRow(c, x);
    new Setting(c).addButton((x) => x.setButtonText(t('studio.health.recheck')).onClick(() => this.render()));
  }
}

const HOME_TEMPLATE = '```damask-home\n```\n';

export async function createHomeNote(p: DamaskStudio): Promise<void> {
  const path = p.paths.home;
  if (p.app.vault.getAbstractFileByPath(path)) return;
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (folder && !p.app.vault.getAbstractFileByPath(folder)) await p.app.vault.createFolder(folder);
  await p.app.vault.create(path, `---\ncssclasses: [dm-home]\n---\n${HOME_TEMPLATE}`);
  await p.openHome();
}

export class StudioView extends ItemView {
  private ui: StudioUI | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: DamaskStudio) { super(leaf); }
  getViewType(): string { return STUDIO_VIEW; }
  getDisplayText(): string { return t('studio.title'); }
  getIcon(): string { return 'palette'; }

  async onOpen(): Promise<void> {
    this.ui = new StudioUI(this.plugin, this.contentEl);
    this.ui.render();
    this.registerEvent(this.app.workspace.on('file-open', () => { if (this.plugin.settings.ui.tab === 'note') this.ui?.render(); }));
  }

  render(): void { this.ui?.render(); }
  async onClose(): Promise<void> { this.contentEl.empty(); }
}

export class StudioSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DamaskStudio) { super(app, plugin); }
  display(): void { new StudioUI(this.plugin, this.containerEl).render(); }
}
