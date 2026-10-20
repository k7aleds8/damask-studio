import { TFile, TFolder } from 'obsidian';
import type DamaskStudio from '../../main';
import { communityPlugin, currentTheme, isPluginEnabled, pluginManifests, setPluginEnabled, setTheme, themeInstalled } from '../../core/internals';
import { t } from '../../i18n';
import { THEME_NAME } from '../appearance/styles';
import { updateLegacyNotes } from './legacy';

export interface Check {
  level: 'warn' | 'info' | 'ok';
  title: string;
  detail?: string;
  fix?: () => unknown;
  fixLabel?: string;
  list?: { path: string; label: string }[];
}

type ExcalidrawSettings = { previewMatchObsidianTheme?: boolean; exportWithBackground?: boolean; experimentalEnableFourthFont?: boolean; experimantalFourthFont?: string };

/**
 * Checks never change anything by themselves. Each one that can be fixed
 * offers a button, because quietly editing other plugins' settings is not
 * something a plugin should do.
 */
export function healthChecks(plugin: DamaskStudio): Check[] {
  const app = plugin.app;
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const theme = currentTheme(app);

  const legacy = plugin.legacyNotes;
  if (legacy.length) {
    add({
      level: 'warn', title: t('health.legacyNotes.title', { count: legacy.length }), detail: t('health.legacyNotes.detail'),
      fix: async () => { await updateLegacyNotes(app, legacy); plugin.legacyNotes = []; }, fixLabel: t('health.legacyNotes.fix'),
      list: legacy.map((f) => ({ path: f.path, label: f.path })),
    });
  }
  if (isPluginEnabled(app, 'vault-studio')) {
    add({ level: 'warn', title: t('health.oldPlugin.title'), detail: t('health.oldPlugin.detail'), fix: () => setPluginEnabled(app, 'vault-studio', false), fixLabel: t('health.disable') });
  }
  if (themeInstalled(app, THEME_NAME) && theme !== THEME_NAME) {
    add({ level: 'info', title: t('health.themeOff.title'), detail: t('health.themeOff.detail', { theme: theme || t('health.defaultTheme') }), fix: () => setTheme(app, THEME_NAME), fixLabel: t('health.themeOff.fix') });
  }
  if (theme === THEME_NAME && !pluginManifests(app).some((m) => m.id === 'obsidian-style-settings')) {
    add({ level: 'info', title: t('health.styleSettings.title'), detail: t('health.styleSettings.detail') });
  }

  const ex = communityPlugin(app, 'obsidian-excalidraw-plugin') as { settings?: ExcalidrawSettings; saveSettings?: () => Promise<void> } | null;
  if (ex?.settings && (!ex.settings.previewMatchObsidianTheme || ex.settings.exportWithBackground)) {
    add({ level: 'info', title: t('health.excalidrawBg.title'), detail: t('health.excalidrawBg.detail'), fix: () => fixExcalidrawBackground(plugin), fixLabel: t('health.fix') });
  }
  const font = ex?.settings?.experimantalFourthFont;
  if (ex?.settings?.experimentalEnableFourthFont && font && !app.vault.getAbstractFileByPath(font)) {
    const own = plugin.settings.paths.excalidrawFont;
    add({
      level: 'warn', title: t('health.excalidrawFont.title'), detail: t('health.excalidrawFont.detail', { path: font }),
      ...(own && app.vault.getAbstractFileByPath(own) ? { fix: () => useExcalidrawFont(plugin), fixLabel: t('health.excalidrawFont.fix') } : {}),
    });
  }

  const tp = communityPlugin(app, 'templater-obsidian') as { settings?: { trigger_on_file_creation?: boolean } } | null;
  if (tp?.settings && !tp.settings.trigger_on_file_creation && plugin.paths.folder('templates')) {
    add({ level: 'info', title: t('health.templater.title'), detail: t('health.templater.detail'), fix: () => fixTemplater(plugin), fixLabel: t('health.enable') });
  }

  const excluded = (p: string) => plugin.paths.isExcluded(p);
  const broken: Check['list'] = [];
  for (const [src, links] of Object.entries(app.metadataCache.unresolvedLinks ?? {})) {
    if (excluded(src)) continue;
    for (const l of Object.keys(links)) broken.push({ path: src, label: `${src.replace(/\.md$/, '')}  →  [[${l}]]` });
  }
  if (broken.length) add({ level: 'info', title: t('health.broken.title', { count: broken.length }), detail: t('health.broken.detail'), list: broken });

  const inbox = plugin.paths.folderPath('inbox');
  const root = app.vault.getRoot().children.filter((f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path !== plugin.paths.home);
  if (root.length && inbox) {
    add({
      level: 'info', title: t('health.root.title', { count: root.length }), detail: t('health.root.detail', { folder: inbox }),
      fix: async () => {
        for (const f of root) {
          const dest = `${inbox}/${f.name}`;
          if (!app.vault.getAbstractFileByPath(dest)) await app.fileManager.renameFile(f, dest);
        }
      },
      fixLabel: t('health.root.fix'),
      list: root.map((f) => ({ path: f.path, label: f.path })),
    });
  }

  const empty = app.vault.getMarkdownFiles().filter((f) => f.stat.size === 0 && !excluded(f.path));
  if (empty.length) add({ level: 'info', title: t('health.empty.title', { count: empty.length }), list: empty.map((f) => ({ path: f.path, label: f.path })) });

  const linked = new Set<string>();
  for (const targets of Object.values(app.metadataCache.resolvedLinks ?? {})) for (const k of Object.keys(targets)) linked.add(k);
  const orphans = app.vault.getMarkdownFiles().filter((f) => /\.excalidraw\.md$/.test(f.path) && !linked.has(f.path) && !excluded(f.path));
  if (orphans.length) add({ level: 'info', title: t('health.orphanDiagrams.title', { count: orphans.length }), detail: t('health.orphanDiagrams.detail'), list: orphans.map((f) => ({ path: f.path, label: f.path })) });

  if (!checks.some((c) => c.level === 'warn')) add({ level: 'ok', title: t('health.allGood.title'), detail: t('health.allGood.detail') });
  return checks;
}

export async function fixExcalidrawBackground(plugin: DamaskStudio): Promise<void> {
  const ex = communityPlugin(plugin.app, 'obsidian-excalidraw-plugin') as { settings?: ExcalidrawSettings & { width?: string }; saveSettings?: () => Promise<void> } | null;
  if (!ex?.settings) return;
  ex.settings.previewMatchObsidianTheme = true;
  ex.settings.exportWithBackground = false;
  await ex.saveSettings?.();
}

/** Point Excalidraw's fourth font slot at the font file chosen in Vault setup. */
export async function useExcalidrawFont(plugin: DamaskStudio): Promise<boolean> {
  const ex = communityPlugin(plugin.app, 'obsidian-excalidraw-plugin') as { settings?: ExcalidrawSettings; saveSettings?: () => Promise<void> } | null;
  const path = plugin.settings.paths.excalidrawFont;
  if (!ex?.settings || !path || !(plugin.app.vault.getAbstractFileByPath(path) instanceof TFile)) return false;
  ex.settings.experimentalEnableFourthFont = true;
  // sic: the Excalidraw plugin spells this key "experimantal"
  ex.settings.experimantalFourthFont = path;
  await ex.saveSettings?.();
  return true;
}

async function fixTemplater(plugin: DamaskStudio): Promise<void> {
  const tp = communityPlugin(plugin.app, 'templater-obsidian') as { settings?: { trigger_on_file_creation?: boolean }; save_settings?: () => Promise<void>; saveSettings?: () => Promise<void>; event_handler?: { update_trigger_file_on_creation?: () => void } } | null;
  if (!tp?.settings) return;
  tp.settings.trigger_on_file_creation = true;
  await (tp.save_settings ?? tp.saveSettings)?.call(tp);
  try { tp.event_handler?.update_trigger_file_on_creation?.(); } catch { /* older Templater */ }
}

export function vaultStats(plugin: DamaskStudio) {
  const app = plugin.app;
  const md = app.vault.getMarkdownFiles();
  let links = 0;
  for (const targets of Object.values(app.metadataCache.resolvedLinks ?? {})) links += Object.values(targets).reduce((a, b) => a + b, 0);
  const tags = Object.keys((app.metadataCache as unknown as { getTags?: () => Record<string, number> }).getTags?.() ?? {}).length;
  const diagrams = md.filter((f) => /\.excalidraw\.md$/.test(f.path)).length;
  const folders = app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder).length;
  const plugins = pluginManifests(app).filter((m) => isPluginEnabled(app, m.id)).length;
  return { notes: md.length - diagrams, diagrams, links, tags, folders, plugins };
}
