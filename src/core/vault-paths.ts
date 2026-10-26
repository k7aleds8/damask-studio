import { normalizePath, TFile, TFolder, type App } from 'obsidian';
import { moment } from './time';
import type { Moment } from 'moment';
import type { StudioSettings } from '../settings/types';
import { dailyNoteSettings, ignoredFolders } from './internals';

/**
 * Every place the plugin looks for something in the vault. Nothing else in
 * the code should hardcode a folder name.
 */
export class VaultPaths {
  constructor(private app: App, private settings: () => StudioSettings) {}

  private get P() { return this.settings().paths; }

  get home(): string { return normalizePath(this.P.home || 'Home.md'); }
  homeFile(): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.home);
    return f instanceof TFile ? f : null;
  }

  daily(): { folder: string; format: string } {
    if (this.P.dailyFolder || this.P.dailyFormat) {
      const auto = dailyNoteSettings(this.app);
      return { folder: this.P.dailyFolder || auto.folder, format: this.P.dailyFormat || auto.format };
    }
    return dailyNoteSettings(this.app);
  }
  dailyPath(day: Moment): string {
    const { folder, format } = this.daily();
    const name = day.clone().locale('en').format(format);
    return normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
  }
  dailyFile(day: Moment): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.dailyPath(day));
    return f instanceof TFile ? f : null;
  }
  /** The day a daily note stands for, read back from its path. */
  dailyDate(path: string): Moment | null {
    const { folder, format } = this.daily();
    const prefix = folder ? normalizePath(folder) + '/' : '';
    if (!path.startsWith(prefix) || !path.endsWith('.md')) return null;
    const d = moment(path.slice(prefix.length, -3), format, true);
    return d.isValid() ? d : null;
  }

  isDaily(path: string): boolean {
    const { folder } = this.daily();
    return folder ? path.startsWith(normalizePath(folder) + '/') : false;
  }

  folder(kind: 'quotes' | 'questions' | 'inbox' | 'templates'): TFolder | null {
    const p = this.P[kind];
    if (!p) return null;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(p));
    return f instanceof TFolder ? f : null;
  }
  folderPath(kind: 'quotes' | 'questions' | 'inbox' | 'templates'): string | null {
    return this.folder(kind)?.path ?? null;
  }

  /** Folders whose notes never count in stats: user setting + Obsidian's excluded files. */
  excluded(): string[] {
    const own = this.P.excluded.map((p) => normalizePath(p));
    const tpl = this.folderPath('templates');
    return [...own, ...ignoredFolders(this.app), ...(tpl ? [tpl] : [])];
  }
  isExcluded(path: string): boolean {
    return this.excluded().some((p) => path === p || path.startsWith(p + '/'));
  }
}
