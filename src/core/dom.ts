import { setIcon } from 'obsidian';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Icon button that never steals focus from the editor. */
export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: (e: MouseEvent, b: HTMLButtonElement) => void, cls?: string): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'vs-icon-btn' + (cls ? ' ' + cls : ''), attr: { 'aria-label': label } });
  setIcon(b, icon);
  b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e, b); });
  return b;
}

export type SegOption<T extends string> = [value: T, label: string, icon?: string];

export function segmented<T extends string>(parent: HTMLElement, options: SegOption<T>[], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = parent.createDiv('vs-seg');
  for (const [val, label, icon] of options) {
    const b = wrap.createEl('button', { cls: 'vs-seg-btn' + (val === value ? ' is-active' : ''), attr: { 'aria-label': label || val, 'data-value': val } });
    if (icon) setIcon(b.createSpan('vs-seg-ic'), icon);
    if (label) b.createSpan({ text: label });
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.vs-seg-btn').forEach((x) => x.removeClass('is-active'));
      b.addClass('is-active');
      onChange(val);
    });
  }
  return wrap;
}

export function iconSpan(parent: HTMLElement, icon: string, cls?: string): HTMLSpanElement {
  const s = parent.createSpan(cls);
  setIcon(s, icon);
  return s;
}

/** A button that asks for a second click before it acts. */
export function armedButton(button: HTMLElement, confirmLabel: string, act: () => void, resetMs = 2500): void {
  const original = button.textContent ?? '';
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (button.hasClass('is-armed')) { act(); return; }
    button.addClass('is-armed');
    if (confirmLabel && original) button.setText(confirmLabel);
    window.setTimeout(() => {
      button.removeClass('is-armed');
      if (confirmLabel && original) button.setText(original);
    }, resetMs);
  });
}

export const cssMix = (c: string, pct: number, other = 'transparent'): string => `color-mix(in srgb, ${c} ${pct}%, ${other})`;
export const cssString = (s: string): string => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
export const uid = (prefix = 'g'): string => prefix + Math.random().toString(36).slice(2, 8);

/** Event handlers may be async; errors are logged instead of becoming unhandled rejections. */
export const handler = <A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A): void => {
  void Promise.resolve(fn(...args)).catch((e) => console.error('[Damask]', e));
};
