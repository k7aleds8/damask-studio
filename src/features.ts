import { Component, debounce, MarkdownView, Notice, TFile, TFolder, type Command } from 'obsidian';
import type DamaskStudio from './main';
import { t } from './i18n';
import { TickTickClient } from './integrations/ticktick/client';
import { TickTickMirror } from './integrations/ticktick/mirror';
import { TrashModal } from './integrations/ticktick/modals';
import { QuickAddModal, TickTickUI } from './integrations/ticktick/ui';
import { applyVariant, clearVariant, folderCss, headingCss } from './modules/appearance/styles';
import { EmbedManager } from './modules/embeds/manager';
import { HabitsManagerModal } from './modules/habits/manager';
import { GalleryModal, inserterCommands } from './modules/inserter/gallery';
import { PomodoroEngine } from './modules/pomodoro/engine';

/**
 * A switchable part of the plugin. Everything it registers is undone when it
 * unloads, including commands and ribbon icons, so turning a module off in the
 * control panel leaves no trace until it is turned back on.
 */
export abstract class Feature extends Component {
  private commandIds: string[] = [];
  constructor(protected plugin: DamaskStudio) { super(); }

  protected command(cmd: Command): void {
    // addCommand prefixes cmd.id with the plugin id in place; removeCommand wants it bare
    const id = cmd.id;
    this.plugin.addCommand(cmd);
    this.commandIds.push(id);
  }

  protected ribbon(icon: string, title: string, cb: () => void): void {
    const el = this.plugin.addRibbonIcon(icon, title, cb);
    this.register(() => el.remove());
  }

  onunload(): void {
    for (const id of this.commandIds) this.plugin.removeCommand(id);
    this.commandIds = [];
  }
}

export class HomeFeature extends Feature {
  onload(): void {
    const p = this.plugin;
    const refresh = debounce(() => p.refreshHomes(), 4000, true);
    this.registerEvent(p.app.metadataCache.on('resolved', refresh));
    this.registerEvent(p.app.vault.on('create', refresh));
    this.registerEvent(p.app.vault.on('delete', refresh));
    this.registerEvent(p.app.workspace.on('file-open', (file) => {
      if (!p.settings.home.readingMode || !file || file.path !== p.paths.home) return;
      window.setTimeout(() => {
        const view = p.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file?.path !== p.paths.home || view.getMode() === 'preview') return;
        const st = view.leaf.getViewState();
        void view.leaf.setViewState({ ...st, state: { ...st.state, mode: 'preview' } });
      }, 30);
    }));
    this.command({ id: 'open-home', name: t('commands.openHome'), icon: 'home', callback: () => void p.openHome() });
    this.ribbon('home', t('commands.openHome'), () => void p.openHome());
    p.app.workspace.onLayoutReady(() => {
      if (p.settings.home.openOnStartup && !p.app.workspace.getActiveFile() && p.paths.homeFile()) void p.openHome();
    });
  }
}

export class InserterFeature extends Feature {
  onload(): void {
    for (const c of inserterCommands(this.plugin)) this.command(c);
    if (this.plugin.settings.insert.ribbon) {
      this.ribbon('square-plus', t('commands.gallery'), () => {
        const v = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!v) { new Notice(t('blocks.openNoteFirst')); return; }
        new GalleryModal(this.plugin.app, this.plugin, v.editor).open();
      });
    }
  }
}

export class EmbedsFeature extends Feature {
  manager: EmbedManager | null = null;
  onload(): void {
    this.manager = new EmbedManager(this.plugin);
    this.manager.start();
    this.command({
      id: 'toggle-embed-toolbar', name: t('commands.toggleEmbedToolbar'), icon: 'image',
      callback: async () => {
        const E = this.plugin.settings.embeds;
        E.toolbar = !E.toolbar;
        await this.plugin.saveSettings();
        new Notice(E.toolbar ? t('embeds.toolbarOn') : t('embeds.toolbarOff'));
      },
    });
    this.command({
      id: 'reset-note-embeds', name: t('commands.resetNoteEmbeds'),
      checkCallback: (checking) => {
        const f = this.plugin.app.workspace.getActiveFile();
        if (!f) return false;
        if (!checking) {
          const L = this.plugin.settings.embeds.layouts;
          for (const k of Object.keys(L)) if (k.startsWith(f.path + '::')) delete L[k];
          void this.plugin.saveSettings().then(() => this.manager?.refreshAll());
          new Notice(t('embeds.resetDone'));
        }
        return true;
      },
    });
  }
  onunload(): void {
    super.onunload();
    this.manager?.stop();
    this.manager = null;
  }
}

/**
 * Folder colors, heading colors and palette variants. Folder colors need one
 * selector per folder path, so they go in a constructed stylesheet rather
 * than in styles.css.
 */
export class AppearanceFeature extends Feature {
  private sheet: CSSStyleSheet | null = null;

  onload(): void {
    this.sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.sheet];
    this.apply();
    this.registerEvent(this.plugin.app.workspace.on('css-change', () => this.apply()));
    this.registerEvent(this.plugin.app.vault.on('create', (f) => { if (f instanceof TFolder) this.apply(); }));
  }

  apply(): void {
    const S = this.plugin.settings;
    this.sheet?.replaceSync([folderCss(S), headingCss(S)].join('\n'));
    document.body.toggleClass('vs-folders-on', S.modules.folders && S.folders.enabled);
    document.body.toggleClass('vs-headings-on', S.modules.headings && S.headings.enabled);
    applyVariant(this.plugin.app, S);
  }

  onunload(): void {
    super.onunload();
    if (this.sheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== this.sheet);
    this.sheet = null;
    document.body.removeClass('vs-folders-on', 'vs-headings-on');
    clearVariant(this.plugin.app);
  }
}

export class PomodoroFeature extends Feature {
  engine: PomodoroEngine | null = null;
  onload(): void {
    this.engine = new PomodoroEngine(this.plugin);
    this.command({ id: 'pomodoro-toggle', name: t('commands.pomodoroToggle'), icon: 'timer', callback: () => this.engine?.toggle() });
    this.command({ id: 'pomodoro-stop', name: t('commands.pomodoroStop'), icon: 'square', callback: () => void this.engine?.stop(true) });
    this.command({ id: 'open-focus', name: t('commands.openFocus'), icon: 'timer', callback: () => void this.plugin.openFocus() });
  }
  onunload(): void {
    super.onunload();
    this.engine?.destroy();
    this.engine = null;
  }
}

export class HabitsFeature extends Feature {
  onload(): void {
    this.command({ id: 'habits-manage', name: t('commands.manageHabits'), icon: 'list-checks', callback: () => new HabitsManagerModal(this.plugin.app, this.plugin).open() });
  }
}

export class TickTickFeature extends Feature {
  client!: TickTickClient;
  mirror!: TickTickMirror;
  ui!: TickTickUI;
  private timer = 0;

  onload(): void {
    const p = this.plugin;
    this.client = new TickTickClient(p);
    this.mirror = new TickTickMirror(p, this.client);
    this.ui = new TickTickUI(p);
    const C = this.client;
    const M = this.mirror;

    this.ribbon('check-check', t('commands.taskCenter'), () => void p.openTaskCenter());
    this.command({ id: 'tt-open', name: t('commands.taskCenter'), icon: 'check-check', callback: () => void p.openTaskCenter() });
    this.command({ id: 'tt-sync', name: t('commands.ttSync'), icon: 'refresh-cw', callback: () => void C.sync() });
    this.command({ id: 'tt-quick', name: t('commands.ttQuick'), icon: 'plus', callback: () => new QuickAddModal(p.app, p).open() });
    this.command({ id: 'tt-trash', name: t('commands.ttTrash'), icon: 'archive-restore', callback: () => new TrashModal(p.app, p).open() });
    this.command({
      id: 'tt-from-selection', name: t('commands.ttFromSelection'), icon: 'list-plus',
      editorCallback: (ed, view) => {
        const text = ed.getSelection() || ed.getLine(ed.getCursor().line).replace(/^\s*[-*+]\s(\[.\]\s)?/, '');
        if (text.trim()) void this.ui.sendLine(text, view.file?.path);
      },
    });
    this.registerEvent(p.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!C.active) return;
      menu.addItem((i) => i.setTitle(t('ticktick.sendTo')).setIcon('check-check').setSection('insert').onClick(() => {
        const text = editor.getSelection() || editor.getLine(editor.getCursor().line).replace(/^\s*[-*+]\s(\[.\]\s)?/, '');
        if (text.trim()) void this.ui.sendLine(text, view.file?.path);
      }));
    }));

    this.registerEvent(p.app.vault.on('modify', (f) => {
      if (M.isSelf(f.path)) return;
      if (M.S.on && M.inFolder(f.path)) M.schedule('local', 2500);
      else if (M.S.habits && p.paths.isDaily(f.path)) M.schedule('local', 4000);
    }));
    this.registerEvent(p.app.vault.on('create', (f) => { if (f instanceof TFile && M.S.on && M.inFolder(f.path) && !M.isSelf(f.path)) M.schedule('local', 4000); }));
    this.registerEvent(p.app.vault.on('delete', (f) => { if (f instanceof TFile && M.S.on && M.inFolder(f.path) && !M.isSelf(f.path)) M.onNoteDeleted(f); }));
    this.registerEvent(p.app.vault.on('rename', (f, old) => {
      for (const k of Object.keys(M.st.projects)) if (M.st.projects[k].path === old) M.st.projects[k].path = f.path;
      if (M.inFolder(f.path) || M.inFolder(old)) M.schedule('local', 2500);
    }));
    this.register(C.on(() => { if (!C.busy && !M.running && M.S.on) M.schedule('local', 3000); }));
    this.register(C.on(() => p.refreshTaskCenters()));

    this.schedule();
    p.app.workspace.onLayoutReady(() => { if (C.active) window.setTimeout(() => void C.sync(), 4000); });
  }

  schedule(): void {
    window.clearInterval(this.timer);
    const minutes = Math.max(5, this.plugin.settings.ticktick.interval || 10);
    this.timer = window.setInterval(() => { if (this.client.active && !document.hidden) void this.client.sync(); }, minutes * 60e3);
    this.registerInterval(this.timer);
  }

  onunload(): void {
    super.onunload();
    window.clearInterval(this.timer);
  }
}
