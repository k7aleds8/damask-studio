import type { App } from 'obsidian';
import { DEFAULT_SETTINGS } from './defaults';
import type { Habit, StudioSettings } from './types';
import { readLocal, writeLocal } from '../core/storage';

type Json = Record<string, unknown>;

export function deepMerge<T>(base: T, extra: unknown): T {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return structuredClone(base);
  const out: Json = Array.isArray(base) ? ([...(base as unknown[])] as unknown as Json) : { ...(base as Json) };
  for (const [k, v] of Object.entries(extra as Json)) {
    const b = (base as Json)?.[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) out[k] = deepMerge(b, v);
    else out[k] = v;
  }
  return out as T;
}

// the old theme exposed its palette as --qm-*; Damask renamed them to --dm-*
const renameVars = (s: string): string => s.replace(/--qm-/g, '--dm-');

const OLD_PLUGIN_DIR = 'plugins/vault-studio/data.json';
// this plugin was published as damascene-studio before it became Damask Studio
const PREVIOUS_PLUGIN_DIR = 'plugins/damascene-studio/data.json';
const OLD_LOCAL_KEYS: [string, string][] = [
  ['vs-tt-token', 'dm-tt-token'],
  ['vs-tt-cache', 'dm-tt-cache'],
  ['vs-tt-mirror', 'dm-tt-mirror'],
  ['vs-pomo', 'dm-pomo'],
];

/**
 * Settings written by the old "Vault Studio" plugin (version 1). Only ever
 * read once, on the first load of Damask Studio in that vault.
 */
export async function readLegacy(app: App): Promise<Json | null> {
  const path = `${app.vault.configDir}/${OLD_PLUGIN_DIR}`;
  try {
    if (!(await app.vault.adapter.exists(path))) return null;
    return JSON.parse(await app.vault.adapter.read(path)) as Json;
  } catch {
    return null;
  }
}

export function fromLegacy(app: App, old: Json): StudioSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  const o = old as {
    embeds?: StudioSettings['embeds'];
    folders?: StudioSettings['folders'];
    headings?: StudioSettings['headings'];
    insert?: StudioSettings['insert'];
    home?: Partial<StudioSettings['home']>;
    ticktick?: StudioSettings['ticktick'] & { pomo?: Partial<StudioSettings['pomodoro']> };
    theme?: { dark?: string; light?: string };
    habits?: Habit[];
  };
  if (o.embeds) s.embeds = deepMerge(s.embeds, o.embeds);
  if (o.folders) {
    s.folders = deepMerge(s.folders, o.folders);
    for (const map of [s.folders.colors, s.folders.fileColors]) for (const k of Object.keys(map)) map[k] = renameVars(map[k]);
  }
  if (o.headings) {
    s.headings = deepMerge(s.headings, o.headings);
    if (s.headings.preset === 'qomra') s.headings.preset = 'damask';
  }
  if (o.insert) s.insert = deepMerge(s.insert, o.insert);
  if (o.home) s.home = deepMerge(s.home, o.home);
  if (o.ticktick) {
    const { pomo, ...rest } = o.ticktick;
    s.ticktick = deepMerge(s.ticktick, rest);
    if (pomo) s.pomodoro = deepMerge(s.pomodoro, pomo);
  }
  if (o.theme) s.theme = { dark: o.theme.dark ?? s.theme.dark, light: o.theme.light ?? s.theme.light };
  if (Array.isArray(o.habits)) s.habits = o.habits;
  // the old note-style picker listed classes from these snippets; keep offering them
  const snippetClasses: [string, string][] = [
    ['page-white', 'ورق أبيض'], ['page-manila', 'ورق مانيلا'], ['page-blueprint', 'مخطط أزرق'], ['page-grid', 'شبكة مربعات'],
    ['pen-black', 'قلم أسود'], ['pen-gray', 'قلم رمادي'], ['pen-white', 'قلم أبيض'], ['pen-red', 'قلم أحمر'], ['pen-green', 'قلم أخضر'], ['pen-blue', 'قلم أزرق'], ['pen-purple', 'قلم بنفسجي'],
    ['minecraft', 'ماينكرافت'], ['osrs', 'رونسكيب'], ['japanese', 'خط ياباني'],
    ['center-titles', 'توسيط العناوين'], ['center-images', 'توسيط الصور'], ['image-borders', 'إطار للصور'], ['no-embed-border', 'بدون حد للتضمين'], ['recolor-images', 'تلوين الصور بلون القلم'],
  ];
  s.noteStyles = snippetClasses.map(([c, l]) => `${c}|${l}`);

  // the old plugin was Arabic-only and assumed this folder layout; keep it
  // working exactly as before where those folders exist
  s.language = 'ar';
  s.firstRunDone = true;
  s.legacy = true;
  s.home.hijri = true;
  s.modules.headings = s.headings.enabled;
  const has = (p: string) => !!app.vault.getAbstractFileByPath(p);
  if (has('00 Home.md')) s.paths.home = '00 Home.md';
  if (has('30 Knowledge/Quotes')) s.paths.quotes = '30 Knowledge/Quotes';
  if (has('30 Knowledge/Q&A')) s.paths.questions = '30 Knowledge/Q&A';
  if (has('00 Inbox')) s.paths.inbox = '00 Inbox';
  if (has('90 System/Templates')) s.paths.templates = '90 System/Templates';
  if (has('90 System/Fonts/itfQomraArabic-Medium.otf')) s.paths.excalidrawFont = '90 System/Fonts/itfQomraArabic-Medium.otf';
  if (has('_to_delete')) s.paths.excluded = ['_to_delete'];

  for (const [from, to] of OLD_LOCAL_KEYS) {
    const v = readLocal<unknown>(app, from);
    if (v != null && readLocal(app, to) == null) writeLocal(app, to, v);
  }
  const token = readLocal<{ t?: string }>(app, 'dm-tt-token');
  s.integrations.ticktick = !!token?.t;
  return s;
}

export function upgrade(saved: Json): StudioSettings {
  const s = deepMerge(DEFAULT_SETTINGS, saved);
  if (s.headings.preset === 'damascene') s.headings.preset = 'damask';
  return s;
}

/** Settings saved under the plugin's previous id; same shape, so upgrade() is enough. */
export async function readPreviousName(app: App): Promise<Json | null> {
  const path = `${app.vault.configDir}/${PREVIOUS_PLUGIN_DIR}`;
  try {
    if (!(await app.vault.adapter.exists(path))) return null;
    return JSON.parse(await app.vault.adapter.read(path)) as Json;
  } catch {
    return null;
  }
}
