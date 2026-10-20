// Small building blocks for preview scenes. Everything is drawn as a quiet
// skeleton (bars instead of words) so a scene reads the same in any language,
// and colours come from the theme so the preview looks like the user's vault.
import { setIcon } from 'obsidian';
import { svg } from '../../core/dom';

// varied but fixed widths, so skeleton text looks written rather than ruled
const WIDTHS = [92, 76, 86, 62, 88, 70, 95, 56, 81];

export function lines(parent: HTMLElement, n: number, from = 0, cls = ''): HTMLElement {
  const box = parent.createDiv('dm-pv-lines' + (cls ? ' ' + cls : ''));
  for (let i = 0; i < n; i++) bar(box, WIDTHS[(i + from) % WIDTHS.length]);
  return box;
}

export function bar(parent: HTMLElement, width: number, cls = ''): HTMLElement {
  const b = parent.createDiv('dm-pv-line' + (cls ? ' ' + cls : ''));
  b.setCssProps({ '--w': width + '%' });
  return b;
}

export function icon(parent: HTMLElement, name: string, cls = 'dm-pv-ic'): HTMLElement {
  const s = parent.createSpan(cls);
  setIcon(s, name);
  return s;
}

/** A note page: a title bar and room for content. */
export function page(parent: HTMLElement, cls = ''): HTMLElement {
  const p = parent.createDiv('dm-pv-page' + (cls ? ' ' + cls : ''));
  bar(p, 42, 'is-title');
  return p;
}

/** A tiny landscape. `sketch` draws it as an Excalidraw-style line drawing. */
export function picture(parent: HTMLElement, sketch = false, cls = ''): HTMLElement {
  const f = parent.createDiv('dm-pv-pic' + (sketch ? ' is-sketch' : '') + (cls ? ' ' + cls : ''));
  const s = svg('svg', { viewBox: '0 0 120 72', preserveAspectRatio: 'xMidYMid slice' }, f);
  svg('rect', { width: 120, height: 72, class: 'dm-pv-sky' }, s);
  svg('circle', { cx: 88, cy: 21, r: 8, class: 'dm-pv-sun' }, s);
  svg('path', { d: 'M-2 74 L34 33 L54 52 L75 27 L122 74 Z', class: 'dm-pv-hill' }, s);
  svg('path', { d: 'M-2 74 L22 55 L41 66 L63 47 L94 74 Z', class: 'dm-pv-hill2' }, s);
  return f;
}

export function menu(parent: HTMLElement, items: [icon: string, width: number, cls?: string][], cls = ''): HTMLElement {
  const m = parent.createDiv('dm-pv-menu' + (cls ? ' ' + cls : ''));
  for (const [ic, w, c] of items) {
    const row = m.createDiv('dm-pv-mi' + (c ? ' ' + c : ''));
    icon(row, ic);
    bar(row, w);
  }
  return m;
}

/** The floating layout bar that appears over an embed. */
export function toolbar(parent: HTMLElement): HTMLElement {
  const t = parent.createDiv('dm-pv-toolbar');
  for (const n of ['align-right', 'align-center', 'align-left', 'square', 'maximize-2']) icon(t, n);
  return t;
}

export function ribbon(parent: HTMLElement, icons: string[]): HTMLElement {
  const r = parent.createDiv('dm-pv-ribbon');
  for (const n of icons) icon(r, n, 'dm-pv-ic dm-pv-rib');
  return r;
}

/** A file explorer: depth 0 rows are top-level folders. */
export function explorer(parent: HTMLElement, rows: [depth: number, folder: boolean, width: number][]): HTMLElement[] {
  const box = parent.createDiv('dm-pv-tree');
  return rows.map(([depth, folder, w]) => {
    const row = box.createDiv('dm-pv-row' + (depth ? '' : ' is-top') + (folder ? ' is-folder' : ''));
    row.setCssProps({ '--depth': String(depth) });
    icon(row, folder ? 'folder' : 'file-text');
    bar(row, w);
    return row;
  });
}

/** Two layers that cross-fade when the stage gets `is-b`. */
export function layers(parent: HTMLElement): [HTMLElement, HTMLElement] {
  return [parent.createDiv('dm-pv-layer dm-pv-a'), parent.createDiv('dm-pv-layer dm-pv-b')];
}
