import { Plugin, type TAbstractFile, type TFile, type WorkspaceLeaf } from 'obsidian';
import { VaultPaths } from './core/vault-paths';
import { setLanguage, t } from './i18n';
import { AppearanceFeature, EmbedsFeature, type Feature, HabitsFeature, HomeFeature, InserterFeature, PomodoroFeature, TickTickFeature } from './features';
import { TickTickFocusSource, TickTickTaskSource } from './integrations/ticktick/source';
import { TASK_CENTER_VIEW, TaskCenterView } from './integrations/ticktick/ui';
import { HomeDashboard } from './modules/home/dashboard';
import { registerInserterHooks } from './modules/inserter/gallery';
import { findLegacyNotes } from './modules/health/legacy';
import { FOCUS_VIEW, FocusView } from './modules/pomodoro/panel';
import { fromLegacy, readLegacy, upgrade } from './settings/migrate';
import type { StudioSettings } from './settings/types';
import { LocalFocusSource, VaultTaskSource } from './stats/vault-source';
import type { FocusSource, TaskSource } from './stats/types';
import { NoteStyleModal } from './ui/note-style';
import { OnboardingModal } from './ui/onboarding';
import { STUDIO_VIEW, StudioSettingTab, StudioView } from './ui/studio';
import { PreviewController } from './ui/preview/controller';

type FeatureId = 'home' | 'inserter' | 'embeds' | 'appearance' | 'pomodoro' | 'habits' | 'ticktick';

export default class DamasceneStudio extends Plugin {
  settings!: StudioSettings;
  paths!: VaultPaths;
  vaultTasks!: VaultTaskSource;
  private features = new Map<FeatureId, Feature>();
  private homes = new Set<HomeDashboard>();
  /** notes still using Qomra's class names, found once after a migration */
  legacyNotes: TFile[] = [];
  previews!: PreviewController;

  async onload(): Promise<void> {
    await this.loadSettings();
    setLanguage(this.settings.language);
    this.previews = new PreviewController(this);
    this.paths = new VaultPaths(this.app, () => this.settings);
    this.vaultTasks = new VaultTaskSource(this.app, this.paths, () => (this.settings.integrations.ticktick && this.settings.ticktick.mirror.on ? this.settings.ticktick.mirror.folder : null));

    this.registerView(STUDIO_VIEW, (leaf) => new StudioView(leaf, this));
    this.registerView(TASK_CENTER_VIEW, (leaf) => new TaskCenterView(leaf, this));
    this.registerView(FOCUS_VIEW, (leaf) => new FocusView(leaf, this));
    this.addSettingTab(new StudioSettingTab(this.app, this));
    this.addRibbonIcon('palette', t('studio.title'), () => void this.openStudio());
    this.addCommand({ id: 'open-studio', name: t('commands.openStudio'), callback: () => void this.openStudio() });
    this.addCommand({ id: 'health-check', name: t('commands.health'), callback: () => void this.openStudio('health') });
    this.addCommand({
      id: 'note-style', name: t('commands.noteStyle'),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (f?.extension !== 'md') return false;
        if (!checking) new NoteStyleModal(this.app, this, f).open();
        return true;
      },
    });

    // the old name stays registered so existing home notes keep rendering
    for (const lang of ['damascene-home', 'qomra-home']) {
      this.registerMarkdownCodeBlockProcessor(lang, (_src, el, ctx) => {
        if (!this.settings.modules.home) { el.setText(t('home.disabled')); return; }
        const home = new HomeDashboard(this, el, ctx.sourcePath);
        ctx.addChild(home);
        this.homes.add(home);
        home.register(() => this.homes.delete(home));
      });
    }
    registerInserterHooks(this);
    this.registerEvent(this.app.vault.on('rename', (f, old) => void this.onRename(f, old)));

    this.syncFeatures();
    this.app.workspace.onLayoutReady(() => {
      if (!this.settings.firstRunDone) window.setTimeout(() => new OnboardingModal(this.app, this).open(), 1500);
      if (this.settings.legacy) {
        window.setTimeout(() => void findLegacyNotes(this.app).then((files) => {
          this.legacyNotes = files;
          if (!files.length) { this.settings.legacy = false; void this.saveSettings(); }
          this.refreshStudio();
        }), 5000);
      }
    });
  }

  onunload(): void {
    for (const f of this.features.values()) f.unload();
    this.features.clear();
  }

  /* ------------------------------------------------------------ settings */

  private async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Record<string, unknown> | null;
    if (saved) { this.settings = upgrade(saved); return; }
    const legacy = await readLegacy(this.app);
    this.settings = legacy ? fromLegacy(this.app, legacy) : upgrade({});
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  /** Save, then bring every feature, stylesheet and open view in line with the settings. */
  async apply(): Promise<void> {
    await this.saveSettings();
    setLanguage(this.settings.language);
    this.syncFeatures();
    (this.features.get('appearance') as AppearanceFeature | undefined)?.apply();
    this.embeds?.refreshAll();
    this.refreshHomes(true);
    this.refreshTaskCenters();
  }

  private syncFeatures(): void {
    const S = this.settings;
    const want: Record<FeatureId, boolean> = {
      home: S.modules.home,
      inserter: S.modules.inserter,
      embeds: S.modules.embeds,
      appearance: S.modules.folders || S.modules.headings || S.modules.variants,
      pomodoro: S.modules.pomodoro,
      habits: true,
      ticktick: S.integrations.ticktick,
    };
    const make: Record<FeatureId, () => Feature> = {
      home: () => new HomeFeature(this),
      inserter: () => new InserterFeature(this),
      embeds: () => new EmbedsFeature(this),
      appearance: () => new AppearanceFeature(this),
      pomodoro: () => new PomodoroFeature(this),
      habits: () => new HabitsFeature(this),
      ticktick: () => new TickTickFeature(this),
    };
    for (const id of Object.keys(want) as FeatureId[]) {
      const has = this.features.get(id);
      if (want[id] && !has) {
        const f = make[id]();
        f.load();
        this.features.set(id, f);
      } else if (!want[id] && has) {
        has.unload();
        this.features.delete(id);
      }
    }
  }

  /** Unload and load a feature again, e.g. after an option that changes its ribbon icon. */
  reloadFeature(id: FeatureId): void {
    const f = this.features.get(id);
    if (!f) return;
    f.unload();
    this.features.delete(id);
    this.syncFeatures();
  }

  /* ------------------------------------------------------------ feature access */

  private feature<T extends Feature>(id: FeatureId): T | undefined { return this.features.get(id) as T | undefined; }

  get embeds() { return this.feature<EmbedsFeature>('embeds')?.manager ?? null; }
  get pomodoro() { return this.feature<PomodoroFeature>('pomodoro')?.engine ?? null; }
  get ticktick() { return this.feature<TickTickFeature>('ticktick')?.client ?? null; }
  get ticktickMirror() { return this.feature<TickTickFeature>('ticktick')?.mirror ?? null; }
  get ticktickUi() { return this.feature<TickTickFeature>('ticktick')?.ui ?? null; }
  rescheduleTickTick(): void { this.feature<TickTickFeature>('ticktick')?.schedule(); }

  /** Tasks come from TickTick when it is connected, otherwise from `- [ ]` lines in the vault. */
  taskSource(): TaskSource {
    const tt = this.ticktick;
    return tt?.active ? new TickTickTaskSource(tt) : this.vaultTasks;
  }

  focusSource(): FocusSource {
    const tt = this.ticktick;
    return tt?.active ? new TickTickFocusSource(tt) : new LocalFocusSource(() => this.settings.pomodoro.log);
  }

  /* ------------------------------------------------------------ navigation */

  async openHome(): Promise<void> {
    await this.app.workspace.openLinkText(this.paths.home, '', false);
  }

  private async reveal(type: string, where: 'tab' | 'right'): Promise<WorkspaceLeaf> {
    let leaf = this.app.workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = (where === 'right' ? this.app.workspace.getRightLeaf(false) : null) ?? this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  async openStudio(tab?: string): Promise<void> {
    if (tab) { this.settings.ui.tab = tab; await this.saveSettings(); }
    const leaf = await this.reveal(STUDIO_VIEW, 'right');
    (leaf.view as StudioView).render?.();
  }

  async openTaskCenter(): Promise<void> {
    if (!this.ticktick) { await this.openStudio('integrations'); return; }
    await this.reveal(TASK_CENTER_VIEW, 'tab');
  }

  /** With TickTick on, focus lives in the Task Center; otherwise in its own view. */
  async openFocus(): Promise<void> {
    if (this.ticktick?.active) {
      this.settings.ticktick.tab = 'focus';
      await this.openTaskCenter();
      this.refreshTaskCenters();
      return;
    }
    await this.reveal(FOCUS_VIEW, 'tab');
  }

  /** Redraw open dashboards; background refreshes skip one under the pointer so it doesn't jump. */
  refreshHomes(force = false): void {
    for (const h of [...this.homes]) {
      if (!h.el.isConnected) { this.homes.delete(h); continue; }
      if (!force && h.el.matches(':hover')) continue;
      try { h.render(); } catch (e) { console.error('[Damascene] home', e); }
    }
  }

  refreshTaskCenters(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(TASK_CENTER_VIEW)) {
      const v = leaf.view as TaskCenterView;
      if (this.settings.ticktick.tab !== 'app') v.draw?.();
    }
  }

  refreshStudio(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(STUDIO_VIEW)) (leaf.view as StudioView).render?.();
  }

  private async onRename(f: TAbstractFile, old: string): Promise<void> {
    let changed = this.embeds?.renamed(f.path, old) ?? false;
    for (const map of [this.settings.folders.colors, this.settings.folders.fileColors]) {
      for (const k of Object.keys(map)) {
        if (k === old || k.startsWith(old + '/')) {
          map[f.path + k.slice(old.length)] = map[k];
          delete map[k];
          changed = true;
        }
      }
    }
    if (this.settings.paths.home === old) { this.settings.paths.home = f.path; changed = true; }
    if (changed) await this.apply();
  }
}
