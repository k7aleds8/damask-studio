import type { App, PluginManifest } from 'obsidian';

// Obsidian exposes these at runtime but not in the public typings. Everything
// that touches them goes through here so the casts live in one place.

interface CommunityPlugins {
  plugins: Record<string, { settings?: Record<string, unknown>; saveSettings?: () => Promise<void> } & Record<string, unknown>>;
  manifests: Record<string, PluginManifest>;
  enabledPlugins: Set<string>;
  enablePluginAndSave(id: string): Promise<void>;
  disablePluginAndSave(id: string): Promise<void>;
}

interface CustomCss {
  themes: Record<string, unknown>;
  snippets: string[];
  enabledSnippets: Set<string>;
  setCssEnabledStatus(name: string, on: boolean): void;
  setTheme(name: string): void;
  readSnippets?(): Promise<void>;
}

interface Internal {
  plugins: CommunityPlugins;
  customCss: CustomCss;
  commands: { executeCommandById(id: string): boolean; commands: Record<string, unknown> };
  setting: { open(): void; openTabById(id: string): void };
  internalPlugins: { getPluginById(id: string): { instance?: Record<string, unknown>; enabled?: boolean } | null };
  changeTheme?(theme: string): void;
  updateTheme?(): void;
  openWithDefaultApp?(path: string): void;
  vault: { getConfig(key: string): unknown; setConfig(key: string, value: unknown): void };
}

const inner = (app: App) => app as unknown as Internal;

export const runCommand = (app: App, id: string): boolean => {
  try {
    return inner(app).commands.executeCommandById(id);
  } catch {
    return false;
  }
};
export const hasCommand = (app: App, id: string): boolean => !!inner(app).commands.commands?.[id];

export const communityPlugin = (app: App, id: string) => inner(app).plugins?.plugins?.[id] ?? null;
export const isPluginEnabled = (app: App, id: string): boolean => !!inner(app).plugins?.enabledPlugins?.has(id);
export const pluginManifests = (app: App): PluginManifest[] => Object.values(inner(app).plugins?.manifests ?? {});
export async function setPluginEnabled(app: App, id: string, on: boolean): Promise<void> {
  const p = inner(app).plugins;
  if (on) await p.enablePluginAndSave(id);
  else await p.disablePluginAndSave(id);
}
export function openPluginSettings(app: App, id: string): void {
  const s = inner(app).setting;
  s?.open();
  s?.openTabById(id);
}

export const css = (app: App): CustomCss | null => inner(app).customCss ?? null;
export const snippetNames = (app: App): string[] => [...(css(app)?.snippets ?? [])];
export const isSnippetOn = (app: App, name: string): boolean => !!css(app)?.enabledSnippets?.has(name);
export const setSnippet = (app: App, name: string, on: boolean): void => css(app)?.setCssEnabledStatus(name, on);

export const getConfig = <T>(app: App, key: string): T | undefined => inner(app).vault.getConfig?.(key) as T | undefined;

export function currentTheme(app: App): string {
  return getConfig<string>(app, 'cssTheme') ?? '';
}
export function themeInstalled(app: App, name: string): boolean {
  return !!css(app)?.themes?.[name];
}
export function setTheme(app: App, name: string): void {
  css(app)?.setTheme(name);
}

export type BaseMode = 'dark' | 'light' | 'system';
export function baseMode(app: App): BaseMode {
  const v = getConfig<string>(app, 'theme') ?? 'obsidian';
  return v === 'moonstone' ? 'light' : v === 'system' ? 'system' : 'dark';
}
export function setBaseMode(app: App, mode: BaseMode): void {
  const a = inner(app);
  const v = mode === 'system' ? 'system' : mode === 'dark' ? 'obsidian' : 'moonstone';
  if (mode !== 'system' && a.changeTheme) a.changeTheme(v);
  else {
    a.vault.setConfig('theme', v);
    a.updateTheme?.();
  }
}

export function openGlobalSearch(app: App, query: string): void {
  const search = inner(app).internalPlugins.getPluginById('global-search')?.instance as { openGlobalSearch?: (q: string) => void } | undefined;
  search?.openGlobalSearch?.(query);
}

export function openWithDefaultApp(app: App, path: string): void {
  inner(app).openWithDefaultApp?.(path);
}

/** Daily-note location from the core Daily notes plugin or Periodic Notes. */
export function dailyNoteSettings(app: App): { folder: string; format: string } {
  const periodic = communityPlugin(app, 'periodic-notes')?.settings as { daily?: { folder?: string; format?: string; enabled?: boolean } } | undefined;
  if (isPluginEnabled(app, 'periodic-notes') && periodic?.daily?.enabled !== false && periodic?.daily) {
    return { folder: periodic.daily.folder ?? '', format: periodic.daily.format || 'YYYY-MM-DD' };
  }
  const core = inner(app).internalPlugins.getPluginById('daily-notes');
  const opts = (core?.instance as { options?: { folder?: string; format?: string } } | undefined)?.options;
  return { folder: opts?.folder ?? '', format: opts?.format || 'YYYY-MM-DD' };
}

export function ignoredFolders(app: App): string[] {
  return (getConfig<string[]>(app, 'userIgnoreFilters') ?? []).map((p) => p.replace(/\/$/, ''));
}
