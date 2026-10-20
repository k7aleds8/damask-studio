import { Modal, Notice, Setting, type App } from 'obsidian';
import { segmented, handler } from '../../core/dom';
import { dir, t } from '../../i18n';
import { EMBED_DEFAULT } from '../../settings/defaults';
import type { EmbedLayout } from '../../settings/types';
import type { EmbedManager } from './manager';

/** Every layout option for one embed, with a live preview in the note. */
export class EmbedModal extends Modal {
  private applyTo: 'note' | 'global' = 'note';
  private L: EmbedLayout;
  private saved = false;

  constructor(app: App, private mgr: EmbedManager, private e: HTMLElement) {
    super(app);
    this.L = { ...mgr.layoutFor(e.dataset.vsKind ?? '', e.dataset.vsNote ?? '', e.dataset.vsTarget ?? '') };
  }

  onOpen(): void {
    this.modalEl.addClass('vs-modal');
    const c = this.contentEl;
    c.setAttr('dir', dir());
    const L = this.L;
    c.createEl('h2', { text: t('embeds.modal.title') });
    c.createDiv({ cls: 'vs-muted', text: (this.e.dataset.vsTarget ?? '').split('/').pop()?.replace(/\.md$/, '') ?? '' });
    const live = () => this.mgr.apply(this.e, L);
    const section = (text: string) => c.createEl('h4', { text, cls: 'vs-h4' });
    const slider = (name: string, desc: string | null, min: number, max: number, step: number, get: () => number, set: (v: number) => void, show: (v: number) => string) => {
      const s = new Setting(c).setName(name);
      if (desc) s.setDesc(desc);
      let label: HTMLElement;
      s.addSlider((sl) => sl.setLimits(min, max, step).setValue(get()).onChange((v) => { set(v); label.textContent = show(v); live(); }));
      label = s.controlEl.createSpan({ cls: 'vs-val', text: show(get()) });
    };

    section(t('embeds.modal.position'));
    new Setting(c).setName(t('embeds.align')).then((s) => segmented(s.controlEl, [['right', t('embeds.right'), 'align-right'], ['center', t('embeds.center'), 'align-center'], ['left', t('embeds.left'), 'align-left']], L.align, (v) => { L.align = v; L.float = 'none'; live(); }));
    new Setting(c).setName(t('embeds.float')).setDesc(t('embeds.floatDesc')).then((s) => segmented(s.controlEl, [['none', t('embeds.none')], ['right', t('embeds.right')], ['left', t('embeds.left')]], L.float || 'none', (v) => {
      L.float = v;
      if (v !== 'none' && (!L.width || L.width > 60)) L.width = 45;
      live();
    }));
    slider(t('embeds.width'), t('embeds.widthDesc'), 0, 100, 5, () => L.width || 0, (v) => { L.width = v; }, (v) => (v ? `${v}%` : t('embeds.auto')));
    slider(t('embeds.maxWidth'), t('embeds.maxWidthDesc'), 0, 1600, 20, () => L.maxWidth || 0, (v) => { L.maxWidth = v; }, (v) => (v ? `${v}px` : '∞'));

    section(t('embeds.modal.look'));
    new Setting(c).setName(t('embeds.frame')).then((s) => segmented(s.controlEl, [['none', t('embeds.none')], ['card', t('embeds.frames.card')], ['glass', t('embeds.frames.glass')], ['outline', t('embeds.frames.outline')], ['polaroid', t('embeds.frames.polaroid')]], L.frame, (v) => { L.frame = v; live(); }));
    new Setting(c).setName(t('embeds.shadow')).addToggle((x) => x.setValue(!!L.shadow).onChange((v) => { L.shadow = v; live(); }));
    slider(t('embeds.radius'), null, 0, 40, 1, () => L.radius || 0, (v) => { L.radius = v; }, (v) => `${v}px`);
    slider(t('embeds.padding'), null, 0, 48, 2, () => L.padding || 0, (v) => { L.padding = v; }, (v) => `${v}px`);
    new Setting(c).setName(t('embeds.background')).then((s) => segmented(s.controlEl, [['transparent', t('embeds.bg.transparent')], ['theme', t('embeds.bg.theme')], ['paper', t('embeds.bg.paper')]], L.bg, (v) => { L.bg = v; live(); }));
    new Setting(c).setName(t('embeds.invertName')).setDesc(t('embeds.invertDesc')).then((s) => segmented(s.controlEl, [['none', t('embeds.none')], ['dark', t('embeds.inDark')], ['always', t('embeds.always')]], L.invert || 'none', (v) => { L.invert = v; live(); }));
    new Setting(c).setName(t('embeds.caption')).addText((x) => {
      x.setPlaceholder(t('embeds.captionPlaceholder')).setValue(L.caption || '').onChange((v) => { L.caption = v; live(); });
      x.inputEl.setAttr('dir', 'auto');
      x.inputEl.addClass('vs-wide-input');
    });

    section(t('embeds.modal.save'));
    new Setting(c).setName(t('embeds.scope')).then((s) => segmented(s.controlEl, [['note', t('embeds.scopeNote')], ['global', t('embeds.scopeGlobal')]], this.applyTo, (v) => { this.applyTo = v; }));
    const row = c.createDiv('vs-row-end');
    row.createEl('button', { text: t('common.save'), cls: 'mod-cta' }).addEventListener('click', handler(async () => {
      this.saved = true;
      await this.mgr.save(this.e, this.diff(), this.applyTo);
      new Notice(t('embeds.saved'));
      this.close();
    }));
    const kind = this.e.dataset.vsKind === 'excalidraw' ? 'excalidraw' : 'image';
    row.createEl('button', { text: kind === 'excalidraw' ? t('embeds.defaultDrawings') : t('embeds.defaultImages') }).addEventListener('click', handler(async () => {
      this.saved = true;
      this.mgr.S.defaults[kind] = { ...L, caption: '' };
      await this.mgr.save(this.e, {}, 'note');
      this.mgr.refreshAll();
      new Notice(t('embeds.defaultSaved'));
      this.close();
    }));
    row.createEl('button', { text: t('embeds.bar.reset') }).addEventListener('click', handler(async () => {
      this.saved = true;
      await this.mgr.reset(this.e);
      this.close();
    }));
  }

  /** Only the fields that differ from the defaults are stored. */
  private diff(): Partial<EmbedLayout> {
    const base = this.mgr.S.defaults[(this.e.dataset.vsKind ?? 'image') as 'image'] ?? EMBED_DEFAULT;
    const out: Partial<EmbedLayout> = {};
    for (const k of Object.keys(this.L) as (keyof EmbedLayout)[]) if (this.L[k] !== base[k] || k === 'caption') (out as Record<string, unknown>)[k] = this.L[k];
    return out;
  }

  onClose(): void {
    if (!this.saved) this.mgr.apply(this.e);
    this.contentEl.empty();
  }
}
