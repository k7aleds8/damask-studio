import { TFolder, type App } from 'obsidian';
import { cssMix as mix, cssString as q } from '../../core/dom';
import { communityPlugin } from '../../core/internals';
import { isRtl, t } from '../../i18n';
import type { StudioSettings } from '../../settings/types';

export interface Preset { name: () => string; colors: string[]; swatch?: string[] }

export const HEADING_PRESETS: Record<string, Preset> = {
  damask: { name: () => t('appearance.presets.damask'), colors: ['#b9a779', '#7ea69c', '#edebe0', '#b9a779', '#a67b7c', '#c8c4b8'] },
  ember: { name: () => t('appearance.presets.ember'), colors: ['#ff3b3b', '#ff6a4d', '#ff9466', '#ffb38a', '#ffd0b0', '#e6e6e6'] },
  rainbow: { name: () => t('appearance.presets.rainbow'), colors: ['#ff5c7a', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'] },
  ocean: { name: () => t('appearance.presets.ocean'), colors: ['#4dd4ff', '#3fb8ff', '#5c9dff', '#7f8cff', '#9d7cff', '#c3b5ff'] },
  emerald: { name: () => t('appearance.presets.emerald'), colors: ['#2ee59d', '#3ccf91', '#5bc0a0', '#76b5b0', '#8fa9c0', '#a7a0cf'] },
  gold: { name: () => t('appearance.presets.gold'), colors: ['#ffd166', '#f4b860', '#e9a15b', '#d98d58', '#c47b55', '#b06d50'] },
  sunset: { name: () => t('appearance.presets.sunset'), colors: ['#ff6b6b', '#f06595', '#cc5de8', '#845ef7', '#5c7cfa', '#339af0'] },
  mono: { name: () => t('appearance.presets.mono'), colors: ['#f1f3f5', '#dee2e6', '#ced4da', '#adb5bd', '#868e96', '#868e96'] },
};

export const FOLDER_PRESETS: Record<string, Preset> = {
  damask: {
    name: () => t('appearance.presets.followTheme'),
    colors: Array.from({ length: 9 }, (_, i) => `var(--dm-folder-${i + 1})`),
    swatch: ['#b9a779', '#7ea69c', '#a67b7c', '#edebe0', '#988561', '#428177', '#6b1f2a'],
  },
  vivid: { name: () => t('appearance.presets.vivid'), colors: ['#52eea3', '#51e1e9', '#54b6f8', '#437cf3', '#9446f8', '#c952ed', '#e54f9b', '#e3365e', '#515768'] },
  ember: { name: () => t('appearance.presets.ember'), colors: ['#ff4d4d', '#ff7a45', '#ffa940', '#ffc53d', '#f759ab', '#9254de', '#597ef7', '#36cfc9', '#8c8c8c'] },
  pastel: { name: () => t('appearance.presets.pastel'), colors: ['#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9', '#d0bfff', '#99e9f2', '#fcc2d7', '#ffd8a8', '#ced4da'] },
  ocean: { name: () => t('appearance.presets.ocean'), colors: ['#66d9e8', '#4dabf7', '#748ffc', '#9775fa', '#3bc9db', '#38d9a9', '#69db7c', '#a9e34b', '#868e96'] },
};

export const topFolders = (app: App): string[] =>
  app.vault.getRoot().children.filter((f): f is TFolder => f instanceof TFolder && !f.name.startsWith('.')).map((f) => f.path).sort();

export function applyFolderPreset(app: App, S: StudioSettings, id: string): void {
  const P = FOLDER_PRESETS[id];
  if (!P) return;
  topFolders(app).forEach((p, i) => { S.folders.colors[p] = P.colors[Math.min(i, P.colors.length - 1)]; });
}

export function folderCss(S: StudioSettings): string {
  const F = S.folders;
  if (!S.modules.folders || !F.enabled) return '';
  const out: string[] = [];
  // parents first, so a subfolder's own color wins over the inherited one
  const entries = Object.entries(F.colors).filter(([, c]) => c).sort((a, b) => a[0].split('/').length - b[0].split('/').length);
  for (const [p, c] of entries) {
    const self = `.nav-folder-title[data-path=${q(p)}]`;
    const inside = `.nav-folder-title[data-path^=${q(p + '/')}]`;
    out.push(`body.vs-folders-on ${self}, body.vs-folders-on ${inside} {
  color: ${c};${F.bold ? ' font-weight: 600;' : ''}
  --nav-item-color-hover: ${mix(c, 70, 'var(--text-normal)')};
  --nav-item-background-hover: ${mix(c, 16)};
  --nav-collapse-icon-color: ${mix(c, 60)};
}`);
    if (F.iconColor) out.push(`body.vs-folders-on ${self} .iconize-icon, body.vs-folders-on ${inside} .iconize-icon { color: ${c}; }`);
    if (F.colorFiles) out.push(`body.vs-folders-on .nav-file-title[data-path^=${q(p + '/')}] {
  color: ${mix(c, 55, 'var(--text-normal)')};
  --nav-item-background-hover: ${mix(c, 14)};
  --nav-item-background-active: ${mix(c, 22)};
  --nav-item-color-active: ${mix(c, 35, 'var(--text-normal)')};
}`);
    if (F.guides) out.push(`body.vs-folders-on .nav-folder:has(> ${self}) > .nav-folder-children { --nav-indentation-guide-color: ${mix(c, 45)}; border-inline-start-color: ${mix(c, 45)}; }`);
    if (F.pill && !p.includes('/')) out.push(`body.vs-folders-on ${self} { background: ${mix(c, 12)}; border-radius: 8px; margin-block: 2px; }`);
  }
  for (const [p, c] of Object.entries(F.fileColors)) {
    if (c) out.push(`body.vs-folders-on .nav-file-title[data-path=${q(p)}] { color: ${c}; font-weight: 600; }`);
  }
  return out.join('\n');
}

export function headingCss(S: StudioSettings): string {
  const H = S.headings;
  if (!S.modules.headings || !H.enabled) return '';
  const out = [`body.vs-headings-on { ${H.colors.map((x, i) => `--h${i + 1}-color: ${x};`).join(' ')} }`];
  const toward = isRtl() ? 'to left' : 'to right';
  for (let i = 1; i <= 6; i++) {
    const col = H.colors[i - 1];
    const text = `body.vs-headings-on .markdown-rendered h${i}, body.vs-headings-on .cm-header-${i}, body.vs-headings-on .HyperMD-header-${i} .cm-header`;
    // heading colors have to beat the theme's own per-level colors, hence !important
    let rule = `color: ${col} !important;`;
    if (H.gradient) rule += ` background-image: linear-gradient(${toward}, ${col}, ${mix(col, 45, 'var(--text-normal)')}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;`;
    if (H.glow) rule += ` text-shadow: 0 0 14px ${mix(col, 45)};`;
    out.push(`${text} { ${rule} }`);
    if (H.scale && H.scale !== 1) out.push(`body.vs-headings-on .markdown-rendered h${i}, body.vs-headings-on .HyperMD-header-${i} { font-size: calc(var(--h${i}-size, 1.2em) * ${H.scale}); }`);
    const line = `body.vs-headings-on .markdown-rendered h${i}, body.vs-headings-on .markdown-source-view.mod-cm6 .cm-line.HyperMD-header-${i}`;
    if (H.style === 'bar') out.push(`${line} { border-inline-start: 4px solid ${col}; padding-inline-start: 12px !important; background-image: none !important; border-bottom: none !important; border-radius: 2px; }`);
    else if (H.style === 'underline') out.push(`${line} { background-image: linear-gradient(${toward}, ${col}, transparent 85%) !important; background-size: 100% 2px !important; background-position: bottom !important; background-repeat: no-repeat !important; padding-bottom: 4px; }`);
    else if (H.style === 'pill') out.push(`${line} { background: ${mix(col, 12)} !important; border-radius: 10px; padding: 4px 14px !important; border-bottom: none !important; }`);
    else if (H.style === 'clean') out.push(`${line} { background-image: none !important; border-bottom: none !important; } ${line}::after, ${line}::before { display: none !important; }`);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------ palette variants */

export interface Variant { id: string; mode: 'dark' | 'light'; bg: string; bg2: string; text: string; accent: string; accent2: string; accent3: string; h1: string; h2: string }

export const VARIANTS: Variant[] = [
  { id: 'forest', mode: 'dark', bg: '#002623', bg2: '#001b19', text: '#edebe0', accent: '#b9a779', accent2: '#7ea69c', accent3: '#a67b7c', h1: '#b9a779', h2: '#7ea69c' },
  { id: 'charcoal', mode: 'dark', bg: '#161616', bg2: '#101010', text: '#edebe0', accent: '#b9a779', accent2: '#7ea69c', accent3: '#a67b7c', h1: '#b9a779', h2: '#edebe0' },
  { id: 'umber', mode: 'dark', bg: '#260f14', bg2: '#1b0a0e', text: '#edebe0', accent: '#b9a779', accent2: '#b38f8e', accent3: '#7ea69c', h1: '#b9a779', h2: '#b38f8e' },
  { id: 'midnight', mode: 'dark', bg: '#161616', bg2: '#0a1f1d', text: '#edebe0', accent: '#7ea69c', accent2: '#b9a779', accent3: '#a67b7c', h1: '#7ea69c', h2: '#b9a779' },
  { id: 'wheat', mode: 'light', bg: '#edebe0', bg2: '#e3dfd1', text: '#161616', accent: '#054239', accent2: '#6b1f2a', accent3: '#6e6149', h1: '#4a151e', h2: '#054239' },
  { id: 'paper', mode: 'light', bg: '#ffffff', bg2: '#f5f4ee', text: '#161616', accent: '#6b1f2a', accent2: '#054239', accent3: '#6e6149', h1: '#002623', h2: '#6b1f2a' },
  { id: 'daylight', mode: 'light', bg: '#f6f9f8', bg2: '#e6efed', text: '#002623', accent: '#054239', accent2: '#6b1f2a', accent3: '#6e6149', h1: '#054239', h2: '#4a151e' },
];

export const THEME_NAME = 'Damask';

interface StyleSettingsManager { getSetting(section: string, id: string): unknown; setSetting(section: string, id: string, value: unknown): void }

/**
 * The theme also offers its palettes in Style Settings. Both pickers must
 * agree, otherwise two palette classes end up on <body> at once, so the
 * plugin's choice is written through to Style Settings when it is installed.
 */
function syncStyleSettings(app: App, S: StudioSettings): void {
  const ss = communityPlugin(app, 'obsidian-style-settings') as { settingsManager?: StyleSettingsManager } | null;
  const m = ss?.settingsManager;
  if (!m) return;
  for (const [id, value] of [['dm-dark-palette', `dm-dark-${S.theme.dark}`], ['dm-light-palette', `dm-light-${S.theme.light}`]]) {
    if (m.getSetting('damask-theme', id) !== value) m.setSetting('damask-theme', id, value);
  }
}

interface ClassTarget { addClass(...classes: string[]): void; removeClass(...classes: string[]): void }

const PALETTE_CLASSES = VARIANTS.map((v) => `dm-${v.mode}-${v.id}`);

export function applyVariant(app: App, S: StudioSettings, body: ClassTarget = document.body): void {
  if (!S.modules.variants) { clearVariant(app, body); return; }
  syncStyleSettings(app, S);
  body.removeClass(...PALETTE_CLASSES);
  body.addClass(`dm-dark-${S.theme.dark}`, `dm-light-${S.theme.light}`);
}

/**
 * Take the palette classes back off the page. While Style Settings is running
 * they are its classes too (we keep its choice in sync), so they stay put and
 * the user's palette survives this plugin being switched off.
 */
export function clearVariant(app: App, body: ClassTarget = document.body): void {
  if (communityPlugin(app, 'obsidian-style-settings')) return;
  body.removeClass(...PALETTE_CLASSES);
}

/* ------------------------------------------------------------ note styles */

export interface NoteStyleGroup { name: string; single?: boolean; items: [cls: string, label: string][] }

export function noteStyleGroups(S: StudioSettings): NoteStyleGroup[] {
  const groups: NoteStyleGroup[] = [{
    name: t('appearance.noteStyles.layout'),
    items: [['dm-lined', t('appearance.noteStyles.lined')], ['vs-wide', t('appearance.noteStyles.wide')], ['vs-justify', t('appearance.noteStyles.justify')]],
  }];
  const custom = S.noteStyles.map((x) => x.split('|')).filter((x) => x[0]?.trim()).map(([c, l]) => [c.trim(), (l || c).trim()] as [string, string]);
  if (custom.length) groups.push({ name: t('appearance.noteStyles.custom'), items: custom });
  return groups;
}
