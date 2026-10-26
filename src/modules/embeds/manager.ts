import { debounce, getLinkpath, MarkdownView, Notice, type App } from 'obsidian';
import type DamaskStudio from '../../main';
import { iconButton, handler } from '../../core/dom';
import { t } from '../../i18n';
import { EMBED_DEFAULT } from '../../settings/defaults';
import type { EmbedLayout } from '../../settings/types';
import { TextPromptModal } from '../../ui/modals';
import { EmbedModal } from './modal';

type Kind = 'excalidraw' | 'image';
const CLASSES = ['vs-embed', 'vs-has-w', 'vs-svg', 'vs-float-left', 'vs-float-right', 'vs-frame-card', 'vs-frame-glass', 'vs-frame-outline', 'vs-frame-polaroid', 'vs-shadow', 'vs-bg-paper', 'vs-bg-theme', 'vs-inv-dark', 'vs-inv-always'];

/**
 * Layout for images and Excalidraw drawings embedded in notes. Layouts are
 * stored per note ("note::target") or for every place a target appears
 * ("*::target"), and applied by watching the DOM, since embeds render lazily.
 */
export class EmbedManager {
  hovered: HTMLElement | null = null;
  private hideTimer = 0;
  private dragging = false;
  private observer: MutationObserver | null = null;
  private bar!: HTMLElement;
  private frame!: HTMLElement;
  private sizeTag!: HTMLElement;
  private widthLabel!: HTMLElement;
  private btn: Record<string, HTMLButtonElement> = {};
  private scan = debounce(() => this.scanNow(), 120, false);
  private onMove = (e: MouseEvent) => this.handleMove(e);
  private onScroll = () => { if (this.hovered && !this.dragging) this.position(); };

  constructor(private plugin: DamaskStudio) {}

  private get app(): App { return this.plugin.app; }
  get S() { return this.plugin.settings.embeds; }

  start(): void {
    this.observer = new MutationObserver((muts) => {
      if (this.dragging) return;
      for (const mu of muts) {
        if (!mu.addedNodes.length) continue;
        const target = mu.target as HTMLElement;
        if (target === this.bar || target === this.frame || this.bar.contains(target) || this.frame.contains(target)) continue;
        if (target.classList?.contains('vs-caption')) continue;
        this.scan();
        return;
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.plugin.registerEvent(this.app.workspace.on('layout-change', () => this.scan()));
    this.plugin.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scan()));
    this.buildOverlay();
    document.addEventListener('mousemove', this.onMove, { passive: true });
    document.addEventListener('scroll', this.onScroll, true);
    this.scanNow();
  }

  stop(): void {
    this.observer?.disconnect();
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('scroll', this.onScroll, true);
    this.bar?.remove();
    this.frame?.remove();
    document.querySelectorAll<HTMLElement>('.vs-embed').forEach((e) => this.clear(e));
  }

  private kindOf(e: HTMLElement): Kind | null {
    const src = (e.getAttribute('src') ?? '').split('#')[0].split('|')[0];
    if (/\.excalidraw(\.md)?$/i.test(src) || e.querySelector('.excalidraw-svg, .excalidraw-embedded-img') || e.classList.contains('excalidraw-embedded-img')) return 'excalidraw';
    if (e.classList.contains('image-embed') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(src)) return 'image';
    return null;
  }

  private notePathOf(e: HTMLElement): string | null {
    if (e.closest('.hover-popover')) return null;
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const v = leaf.view as MarkdownView;
      if (v.containerEl.contains(e)) return v.file?.path ?? null;
    }
    return null;
  }

  private targetOf(e: HTMLElement, notePath: string | null): string {
    const src = (e.getAttribute('src') ?? '').split('#')[0].split('|')[0];
    return this.app.metadataCache.getFirstLinkpathDest(getLinkpath(src), notePath ?? '')?.path ?? src;
  }

  layoutFor(kind: string, note: string, target: string): EmbedLayout {
    const base = this.S.defaults[kind as Kind] ?? EMBED_DEFAULT;
    return { ...EMBED_DEFAULT, ...base, ...(this.S.layouts['*::' + target] ?? {}), ...(note ? this.S.layouts[note + '::' + target] ?? {} : {}) };
  }

  private scanNow(): void {
    if (this.dragging) return;
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('.workspace .internal-embed'))) {
      const kind = this.kindOf(e);
      if (!kind || (kind === 'image' && !this.S.includeImages) || !this.S.enabled) {
        if (e.classList.contains('vs-embed')) this.clear(e);
        continue;
      }
      const src = e.getAttribute('src') ?? '';
      if (!e.dataset.vsKind || !e.dataset.vsNote || e.dataset.vsSrc !== src) {
        const note = this.notePathOf(e);
        Object.assign(e.dataset, { vsSrc: src, vsKind: kind, vsNote: note ?? '', vsTarget: this.targetOf(e, note) });
      }
      this.apply(e);
    }
  }

  refreshAll(): void {
    document.querySelectorAll<HTMLElement>('.internal-embed[data-vs-kind]').forEach((e) => { delete e.dataset.vsKind; });
    document.querySelectorAll<HTMLElement>('.vs-embed').forEach((e) => this.clear(e));
    this.scanNow();
  }

  private clear(e: HTMLElement): void {
    e.classList.remove(...CLASSES);
    for (const p of ['--vs-w', '--vs-max', '--vs-radius', '--vs-pad', 'margin-left', 'margin-right']) e.style.removeProperty(p);
    e.querySelector(':scope > .vs-caption')?.remove();
  }

  apply(e: HTMLElement, L: EmbedLayout = this.layoutFor(e.dataset.vsKind ?? '', e.dataset.vsNote ?? '', e.dataset.vsTarget ?? '')): void {
    e.classList.add('vs-embed');
    e.classList.toggle('vs-has-w', !!L.width);
    // SVGs have no intrinsic width worth keeping, so without a set width they fill the line
    e.classList.toggle('vs-svg', /\.svg$/i.test(e.dataset.vsTarget ?? '') || !!e.querySelector(':scope > img[src*=".svg"]'));
    e.style.setProperty('--vs-w', L.width ? `${L.width}%` : 'fit-content');
    e.style.setProperty('--vs-max', L.maxWidth ? `${L.maxWidth}px` : 'none');
    e.style.setProperty('--vs-radius', `${L.radius || 0}px`);
    e.style.setProperty('--vs-pad', `${L.padding || 0}px`);
    const fl = L.float || 'none';
    e.classList.toggle('vs-float-left', fl === 'left');
    e.classList.toggle('vs-float-right', fl === 'right');
    // left/right are physical: the toolbar icons are physical arrows in every language
    if (fl === 'none') {
      e.style.setProperty('margin-left', L.align === 'left' ? '0' : 'auto', 'important');
      e.style.setProperty('margin-right', L.align === 'right' ? '0' : 'auto', 'important');
    } else {
      e.style.removeProperty('margin-left');
      e.style.removeProperty('margin-right');
    }
    for (const f of ['card', 'glass', 'outline', 'polaroid']) e.classList.toggle('vs-frame-' + f, L.frame === f);
    e.classList.toggle('vs-shadow', !!L.shadow);
    e.classList.toggle('vs-bg-paper', L.bg === 'paper');
    e.classList.toggle('vs-bg-theme', L.bg === 'theme');
    e.classList.toggle('vs-inv-dark', L.invert === 'dark');
    e.classList.toggle('vs-inv-always', L.invert === 'always');
    let cap = e.querySelector<HTMLElement>(':scope > .vs-caption');
    if (L.caption) {
      cap = cap ?? e.createDiv({ cls: 'vs-caption', attr: { dir: 'auto' } });
      if (cap.textContent !== L.caption) cap.textContent = L.caption;
    } else cap?.remove();
  }

  async save(e: HTMLElement, patch: Partial<EmbedLayout>, scope: 'note' | 'global' = 'note'): Promise<void> {
    const note = e.dataset.vsNote ?? '';
    const target = e.dataset.vsTarget ?? '';
    const key = (scope === 'global' || !note ? '*' : note) + '::' + target;
    this.S.layouts[key] = { ...(this.S.layouts[key] ?? {}), ...patch };
    await this.plugin.saveSettings();
    document.querySelectorAll<HTMLElement>('.vs-embed').forEach((x) => { if (x.dataset.vsTarget === target) this.apply(x); });
    this.updateBar();
  }

  async reset(e: HTMLElement): Promise<void> {
    delete this.S.layouts[`${e.dataset.vsNote}::${e.dataset.vsTarget}`];
    await this.plugin.saveSettings();
    this.apply(e);
    this.updateBar();
  }

  private current(): EmbedLayout {
    const e = this.hovered;
    return e ? this.layoutFor(e.dataset.vsKind ?? '', e.dataset.vsNote ?? '', e.dataset.vsTarget ?? '') : EMBED_DEFAULT;
  }

  private buildOverlay(): void {
    // the toolbar is laid out left-to-right in every language so the arrows match
    this.bar = document.body.createDiv({ cls: 'vs-bar', attr: { dir: 'ltr' } });
    this.frame = document.body.createDiv('vs-frame');
    const left = this.frame.createDiv('vs-handle vs-handle-l');
    const right = this.frame.createDiv('vs-handle vs-handle-r');
    this.sizeTag = this.frame.createDiv('vs-size-tag');
    left.addEventListener('mousedown', (ev) => this.startDrag(ev, 'left'));
    right.addEventListener('mousedown', (ev) => this.startDrag(ev, 'right'));
    const B = this.bar;
    const set = (patch: Partial<EmbedLayout>) => () => { if (this.hovered) void this.save(this.hovered, patch); };
    this.btn.left = iconButton(B, 'align-left', t('embeds.bar.left'), set({ align: 'left', float: 'none' }));
    this.btn.center = iconButton(B, 'align-center', t('embeds.bar.center'), set({ align: 'center', float: 'none' }));
    this.btn.right = iconButton(B, 'align-right', t('embeds.bar.right'), set({ align: 'right', float: 'none' }));
    B.createSpan('vs-sep');
    iconButton(B, 'minus', t('embeds.bar.smaller'), () => this.stepWidth(-10));
    this.widthLabel = B.createSpan({ cls: 'vs-wlabel', text: t('embeds.auto'), attr: { 'aria-label': t('embeds.bar.widthToggle') } });
    this.widthLabel.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    this.widthLabel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (this.hovered) void this.save(this.hovered, { width: this.current().width ? 0 : 100 });
    });
    iconButton(B, 'plus', t('embeds.bar.larger'), () => this.stepWidth(10));
    B.createSpan('vs-sep');
    this.btn.float = iconButton(B, 'wrap-text', t('embeds.bar.float'), () => {
      const L = this.current();
      const next = ({ none: 'right', right: 'left', left: 'none' } as const)[L.float || 'none'];
      if (this.hovered) void this.save(this.hovered, { float: next, width: next !== 'none' && (!L.width || L.width > 60) ? 45 : L.width });
    });
    this.btn.frame = iconButton(B, 'square', t('embeds.bar.frame'), () => {
      const order = ['none', 'card', 'glass', 'outline', 'polaroid'] as const;
      if (this.hovered) void this.save(this.hovered, { frame: order[(order.indexOf(this.current().frame) + 1) % order.length] });
    });
    this.btn.shadow = iconButton(B, 'layers', t('embeds.bar.shadow'), () => { if (this.hovered) void this.save(this.hovered, { shadow: !this.current().shadow }); });
    this.btn.invert = iconButton(B, 'contrast', t('embeds.bar.invert'), () => {
      const next = ({ none: 'dark', dark: 'always', always: 'none' } as const)[this.current().invert || 'none'];
      if (this.hovered) void this.save(this.hovered, { invert: next });
      new Notice(t(`embeds.invert.${next}`));
    });
    this.btn.caption = iconButton(B, 'captions', t('embeds.bar.caption'), () => {
      const e = this.hovered;
      if (e) new TextPromptModal(this.app, t('embeds.caption'), this.current().caption || '', (v) => void this.save(e, { caption: v }), t('embeds.removeCaption')).open();
    });
    B.createSpan('vs-sep');
    iconButton(B, 'sliders-horizontal', t('embeds.bar.all'), () => { if (this.hovered) new EmbedModal(this.app, this, this.hovered).open(); });
    iconButton(B, 'rotate-ccw', t('embeds.bar.reset'), () => { if (this.hovered) void this.reset(this.hovered); });
    this.bar.addEventListener('mouseenter', () => window.clearTimeout(this.hideTimer));
    this.bar.addEventListener('mouseleave', () => this.scheduleHide());
    this.frame.addEventListener('mouseenter', () => window.clearTimeout(this.hideTimer));
  }

  private stepWidth(d: number): void {
    const e = this.hovered;
    if (!e) return;
    let w = this.current().width;
    if (!w) {
      const parent = (e.parentElement ?? e).getBoundingClientRect();
      w = Math.round(e.getBoundingClientRect().width / Math.max(1, parent.width) * 10) * 10;
    }
    void this.save(e, { width: Math.max(10, Math.min(100, w + d)) });
  }

  private handleMove(ev: MouseEvent): void {
    if (this.dragging || !this.S.enabled || !this.S.toolbar) { if (!this.S.toolbar) this.hide(); return; }
    if (this.S.toolbarTrigger === 'alt' && !ev.altKey && !this.hovered) return;
    const target = ev.target;
    if (!(target instanceof Element) || this.bar.contains(target) || this.frame.contains(target)) return;
    const e = target.closest<HTMLElement>('.vs-embed');
    if (e?.dataset.vsNote) {
      window.clearTimeout(this.hideTimer);
      if (e !== this.hovered) { this.hovered = e; this.show(); }
    } else if (this.hovered) this.scheduleHide();
  }

  private scheduleHide(): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), 450);
  }

  private hide(): void {
    this.hovered = null;
    this.bar?.removeClass('is-on');
    this.frame?.removeClass('is-on');
  }

  private show(): void {
    this.updateBar();
    this.bar.addClass('is-on');
    this.frame.addClass('is-on');
  }

  private updateBar(): void {
    if (!this.hovered) return;
    const L = this.current();
    for (const k of ['left', 'center', 'right'] as const) this.btn[k].toggleClass('is-active', (L.float || 'none') === 'none' && L.align === k);
    this.btn.float.toggleClass('is-active', !!L.float && L.float !== 'none');
    this.btn.frame.toggleClass('is-active', !!L.frame && L.frame !== 'none');
    this.btn.shadow.toggleClass('is-active', !!L.shadow);
    this.btn.invert.toggleClass('is-active', !!L.invert && L.invert !== 'none');
    this.btn.caption.toggleClass('is-active', !!L.caption);
    this.widthLabel.textContent = L.width ? `${L.width}%` : t('embeds.auto');
    this.position();
  }

  private position(): void {
    const e = this.hovered;
    if (!e) return;
    if (!e.isConnected) { this.hide(); return; }
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { this.bar.removeClass('is-on'); this.frame.removeClass('is-on'); return; }
    Object.assign(this.frame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const bw = this.bar.offsetWidth || 420;
    const left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
    let top = r.top - 44;
    if (top < 40) top = r.top + 8;
    Object.assign(this.bar.style, { left: `${left}px`, top: `${top}px` });
    this.sizeTag.textContent = `${Math.round(r.width)}px`;
  }

  private startDrag(ev: MouseEvent, side: 'left' | 'right'): void {
    const e = this.hovered;
    if (!e) return;
    ev.preventDefault();
    ev.stopPropagation();
    const L = this.current();
    const pw = (e.parentElement ?? e).getBoundingClientRect().width;
    const sw = e.getBoundingClientRect().width;
    const sx = ev.clientX;
    // a centred embed grows on both sides, so the pointer moves half as far
    const mult = L.float && L.float !== 'none' ? 1 : L.align === 'center' ? 2 : 1;
    const sign = side === 'right' ? 1 : -1;
    this.dragging = true;
    document.body.addClass('vs-dragging');
    let last = L.width || Math.round((sw / pw) * 100);
    const move = (mv: MouseEvent) => {
      const nw = Math.max(80, Math.min(pw, sw + (mv.clientX - sx) * sign * mult));
      last = Math.round((nw / pw) * 100);
      e.classList.add('vs-has-w');
      e.style.setProperty('--vs-w', `${last}%`);
      // dragging drops the saved cap; save() below stores maxWidth 0 to match
      e.setCssProps({ '--vs-max': 'none' });
      this.widthLabel.textContent = `${last}%`;
      this.position();
      this.sizeTag.textContent = `${last}%`;
    };
    const up = async () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', handler(up));
      document.body.removeClass('vs-dragging');
      this.dragging = false;
      await this.save(e, { width: Math.max(10, Math.min(100, last)), maxWidth: 0 });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', handler(up));
  }

  /** Embed layouts follow their notes and targets when files move. */
  renamed(newPath: string, oldPath: string): boolean {
    const L = this.S.layouts;
    let changed = false;
    for (const k of Object.keys(L)) {
      const [n, target] = k.split('::');
      const nn = n === oldPath ? newPath : n;
      const nt = target === oldPath ? newPath : target;
      if (nn !== n || nt !== target) {
        L[`${nn}::${nt}`] = L[k];
        delete L[k];
        changed = true;
      }
    }
    return changed;
  }
}
