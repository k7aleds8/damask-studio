// Decides when a preview shows and where. On a desktop it floats beside the
// panel after a short hover, so moving the mouse never shifts the layout; on
// touch screens the play button opens it inline under the row instead.
import { Platform, setIcon, type Setting } from 'obsidian';
import type DamasceneStudio from '../../main';
import { iconButton, uid } from '../../core/dom';
import { dir, t, type MessageKey } from '../../i18n';
import { Player, renderStill, valueLabel } from './engine';
import { SCENES } from './scenes';
import { LOOP, targetValue, type SceneId } from './timeline';

export interface PreviewSpec {
  scene: SceneId;
  /** the option's own name, used as the preview title */
  name: string;
  /** the current value as the scene understands it; 'on' / 'off' for toggles */
  value(): string;
}

interface Open {
  spec: PreviewSpec;
  row: HTMLElement;
  box: HTMLElement;
  pinned: boolean;
  inline: boolean;
  /** the value under the pointer or slider, previewed instead of the default target */
  hint: string | null;
  player: Player | null;
  from: string;
  to: string;
}

const HOVER_DELAY = 450;
const LEAVE_GRACE = 220;

export class PreviewController {
  private open: Open | null = null;
  private openTimer = 0;
  private closeTimer = 0;

  constructor(private plugin: DamasceneStudio) {
    plugin.registerDomEvent(document, 'keydown', (e) => { if (e.key === 'Escape' && this.open) this.close(); });
    // a pinned preview closes on a click anywhere else, like any popover
    plugin.registerDomEvent(document, 'pointerdown', (e) => {
      const o = this.open;
      const at = e.target as Node;
      if (o && !o.inline && !o.box.contains(at) && !o.row.contains(at)) this.close();
    }, true);
    plugin.registerDomEvent(document, 'scroll', () => {
      if (!this.open || this.open.inline) return;
      if (this.open.pinned) this.place(); else this.close();
    }, true);
    plugin.registerDomEvent(document, 'visibilitychange', () => (document.hidden ? this.open?.player?.pause() : this.open?.player?.play()));
    plugin.registerDomEvent(window, 'resize', () => this.place());
    plugin.register(() => this.close());
  }

  private get touch(): boolean { return Platform.isMobile || !window.matchMedia('(hover: hover)').matches; }

  /** Give a settings row a play button and the hover/focus behaviour. */
  attach(setting: Setting, spec: PreviewSpec): void {
    if (!this.plugin.settings.ui.previews) return;
    const row = setting.settingEl;
    row.addClass('dm-pv-host');
    const btn = setting.nameEl.createEl('button', { cls: 'dm-pv-btn', attr: { 'aria-label': t('preview.show'), type: 'button' } });
    setIcon(btn, 'play');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const o = this.open;
      if (o && o.row === row && (o.pinned || o.inline)) this.close();
      else this.show(row, spec, true, null);
    });

    if (!this.touch) {
      row.addEventListener('mouseenter', () => this.intend(row, spec, null));
      row.addEventListener('mouseleave', () => this.leave(row));
      row.addEventListener('focusin', (e) => { if (e.target !== btn && this.open?.row !== row) this.show(row, spec, false, null); });
      row.addEventListener('focusout', (e) => {
        if (this.open?.row === row && !this.open.pinned && !row.contains(e.relatedTarget as Node)) this.close();
      });
      // over a choice, preview that option rather than the next one along
      row.addEventListener('mouseover', (e) => {
        const seg = (e.target as HTMLElement).closest('.vs-seg-btn');
        const v = seg?.getAttribute('data-value');
        if (v) this.hint(row, spec, v);
      });
    }
    row.addEventListener('input', (e) => {
      const r = e.target as HTMLInputElement;
      if (r.type === 'range') this.hint(row, spec, r.value);
    });
    // after a real change the preview starts from the new value
    for (const type of ['click', 'change']) row.addEventListener(type, () => window.setTimeout(() => this.refresh(), 80));

    // the panel redrew itself and replaced the row this preview belonged to
    const o = this.open;
    if (o && o.spec.scene === spec.scene && !o.row.isConnected) {
      o.row = row;
      o.spec = spec;
      row.addClass('is-previewing');
      row.setAttr('aria-describedby', o.box.id);
      if (o.inline) row.after(o.box);
      this.refresh();
      this.place();
    }
  }

  /** Close a preview whose row disappeared, e.g. after switching tabs. */
  sweep(): void {
    if (this.open && !this.open.row.isConnected) this.close();
  }

  close(): void {
    window.clearTimeout(this.openTimer);
    window.clearTimeout(this.closeTimer);
    const o = this.open;
    if (!o) return;
    o.player?.destroy();
    o.box.remove();
    o.row.removeAttribute('aria-describedby');
    o.row.removeClass('is-previewing');
    this.open = null;
  }

  /** Test hook: freeze the open preview at a moment of its loop. */
  seek(ms: number): boolean {
    if (!this.open?.player) return false;
    this.open.player.seek(ms);
    return true;
  }

  private intend(row: HTMLElement, spec: PreviewSpec, hint: string | null): void {
    window.clearTimeout(this.closeTimer);
    if (this.open?.row === row) return;
    window.clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(() => this.show(row, spec, false, hint), HOVER_DELAY);
  }

  private leave(row: HTMLElement): void {
    window.clearTimeout(this.openTimer);
    if (this.open?.row === row && !this.open.pinned) this.closeTimer = window.setTimeout(() => this.close(), LEAVE_GRACE);
  }

  private hint(row: HTMLElement, spec: PreviewSpec, value: string): void {
    if (this.open?.row === row) {
      if (this.open.hint === value) return;
      this.open.hint = value;
      this.refresh();
    } else if (!this.touch) this.intend(row, spec, value);
  }

  private show(row: HTMLElement, spec: PreviewSpec, pinned: boolean, hint: string | null): void {
    window.clearTimeout(this.openTimer);
    window.clearTimeout(this.closeTimer);
    if (this.open?.row === row) {
      this.open.pinned ||= pinned;
      return;
    }
    this.close();
    const inline = this.touch;
    const box = inline ? createDiv() : row.doc.body.createDiv();
    if (inline) row.after(box);
    box.addClass('dm-pv-panel', inline ? 'is-inline' : 'is-floating');
    box.setAttr('dir', dir());
    box.setAttr('role', 'tooltip');
    box.id = uid('dm-pv-');
    row.setAttr('aria-describedby', box.id);
    row.addClass('is-previewing');
    if (!inline) {
      box.addEventListener('mouseenter', () => window.clearTimeout(this.closeTimer));
      box.addEventListener('mouseleave', () => { if (!this.open?.pinned) this.closeTimer = window.setTimeout(() => this.close(), LEAVE_GRACE); });
    }
    this.open = { spec, row, box, pinned, inline, hint, player: null, from: '', to: '' };
    this.refresh();
    this.place();
  }

  /** Redraw when the value or the previewed target changed. */
  private refresh(): void {
    const o = this.open;
    if (!o) return;
    const scene = SCENES[o.spec.scene];
    const from = o.spec.value();
    const to = targetValue(scene, from, o.hint);
    if (o.box.hasChildNodes() && o.from === from && o.to === to) return;
    o.player?.destroy();
    o.player = null;
    o.box.empty();
    o.from = from;
    o.to = to;

    const head = o.box.createDiv('dm-pv-head');
    setIcon(head.createSpan('dm-pv-head-ic'), 'clapperboard');
    head.createSpan({ cls: 'dm-pv-name', text: o.spec.name });
    if (o.pinned || o.inline) iconButton(head, 'x', t('preview.close'), () => this.close(), 'dm-pv-close');

    const reduced = o.box.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) renderStill(o.box, scene, from, to);
    else o.player = new Player(o.box, scene, from, to);

    const states = o.box.createDiv('dm-pv-states');
    const pill = (label: string, v: string) => {
      const p = states.createDiv('dm-pv-state');
      p.createSpan({ cls: 'dm-pv-state-k', text: label });
      p.createSpan({ cls: 'dm-pv-state-v', text: valueLabel(scene, v) });
      return p;
    };
    const now = pill(t('preview.now'), from);
    setIcon(states.createSpan('dm-pv-arrow'), dir() === 'rtl' ? 'arrow-left' : 'arrow-right');
    const after = pill(t('preview.after'), to);
    o.box.createDiv({ cls: 'dm-pv-cap', text: t(`preview.scenes.${o.spec.scene}` as MessageKey) });

    if (o.player) {
      const fill = o.box.createDiv('dm-pv-prog').createDiv('dm-pv-prog-fill');
      o.player.onTick = (ms, phase) => {
        if (!o.row.isConnected) { this.close(); return; }
        fill.setCssProps({ '--p': (ms / LOOP).toFixed(3) });
        now.toggleClass('is-lit', phase === 'from');
        after.toggleClass('is-lit', phase === 'to');
      };
    } else {
      now.addClass('is-lit');
      after.addClass('is-lit');
    }
  }

  /** Float beside the panel on the side with room, level with the row. */
  private place(): void {
    const o = this.open;
    if (!o || o.inline) return;
    const rr = o.row.getBoundingClientRect();
    if (!rr.width) return;
    const panel = (o.row.closest('.vs-root') ?? o.row).getBoundingClientRect();
    const win = o.box.win;
    const W = o.box.offsetWidth, H = o.box.offsetHeight, gap = 14, m = 8;
    const vw = win.innerWidth, vh = win.innerHeight;
    const roomLeft = panel.left - gap - m, roomRight = vw - panel.right - gap - m;
    // face the middle of the window: a right sidebar opens to its left
    const preferLeft = panel.left + panel.width / 2 > vw / 2;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let side: 'left' | 'right' | 'below' | 'above';
    if ((preferLeft ? roomLeft : roomRight) >= W) side = preferLeft ? 'left' : 'right';
    else if ((preferLeft ? roomRight : roomLeft) >= W) side = preferLeft ? 'right' : 'left';
    else side = 'below';
    let x: number, y: number, nub: number;
    if (side === 'left' || side === 'right') {
      x = side === 'left' ? panel.left - gap - W : panel.right + gap;
      y = clamp(rr.top + rr.height / 2 - H / 2, m, vh - H - m);
      nub = clamp(rr.top + rr.height / 2 - y, 18, H - 18);
    } else {
      x = clamp(rr.left + rr.width / 2 - W / 2, m, vw - W - m);
      y = rr.bottom + 10;
      if (y + H > vh - m) { y = Math.max(m, rr.top - 10 - H); side = 'above'; }
      nub = clamp(rr.left + rr.width / 2 - x, 18, W - 18);
    }
    o.box.setAttr('data-side', side);
    o.box.setCssProps({ '--x': `${Math.round(x)}px`, '--y': `${Math.round(y)}px`, '--nub': `${Math.round(nub)}px` });
  }
}
