import { handler } from '../core/dom';
import { Modal, Setting, setIcon, type App, type TFile } from 'obsidian';
import type DamasceneStudio from '../main';
import { dir, t } from '../i18n';
import { noteStyleGroups } from '../modules/appearance/styles';

function readClasses(app: App, file: TFile): string[] {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  let cur: unknown = fm.cssclasses ?? fm.cssclass;
  if (typeof cur === 'string') cur = cur.split(/[\s,]+/).filter(Boolean);
  return Array.isArray(cur) ? (cur as string[]) : [];
}

async function writeClasses(app: App, file: TFile, change: (cur: string[]) => string[]): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    let cur: unknown = fm.cssclasses ?? fm.cssclass;
    if (typeof cur === 'string') cur = cur.split(/[\s,]+/).filter(Boolean);
    const next = change(Array.isArray(cur) ? [...(cur as string[])] : []);
    // the singular form is deprecated; normalise while we're here
    delete fm.cssclass;
    if (next.length) fm.cssclasses = next;
    else delete fm.cssclasses;
  });
}

/** Toggle cssclasses on a note from a list of known styles. */
export function renderNoteStyle(c: HTMLElement, plugin: DamasceneStudio, file: TFile | null): void {
  const app = plugin.app;
  c.empty();
  const head = c.createDiv('vs-card-head');
  setIcon(head.createSpan('vs-card-ic'), 'brush');
  head.createSpan({ cls: 'vs-card-title', text: t('appearance.noteStyles.title') });
  if (!file || file.extension !== 'md') {
    c.createDiv({ cls: 'vs-empty', text: t('appearance.noteStyles.openNote') });
  } else {
    // note names can be in any script, so the badge picks its own direction
    const badge = c.createDiv('vs-file');
    setIcon(badge.createSpan('vs-file-ic'), 'file-text');
    badge.createSpan({ cls: 'vs-file-name', text: file.basename, attr: { dir: 'auto' } });
    const active = new Set(readClasses(app, file));
    const groups = noteStyleGroups(plugin.settings);
    for (const g of groups) {
      c.createDiv({ cls: 'vs-group-title', text: g.name });
      const wrap = c.createDiv('vs-chips');
      for (const [cls, label] of g.items) {
        const chip = wrap.createEl('button', { cls: 'vs-chip' + (active.has(cls) ? ' is-active' : ''), text: label, attr: { 'aria-label': cls } });
        chip.addEventListener('click', handler(async () => {
          const on = !active.has(cls);
          await writeClasses(app, file, (cur) => {
            let next = cur.filter((x) => x !== cls);
            if (on) {
              if (g.single) next = next.filter((x) => !g.items.some((it) => it[0] === x));
              next.push(cls);
            }
            return next;
          });
          window.setTimeout(() => renderNoteStyle(c, plugin, file), 250);
        }));
      }
    }
    c.createDiv('vs-row-end').createEl('button', { text: t('appearance.noteStyles.clear') }).addEventListener('click', handler(async () => {
      const known = new Set(groups.flatMap((g) => g.items.map((i) => i[0])));
      await writeClasses(app, file, (cur) => cur.filter((x) => !known.has(x)));
      window.setTimeout(() => renderNoteStyle(c, plugin, file), 250);
    }));
  }
  new Setting(c)
    .setClass('vs-stack')
    .setName(t('appearance.noteStyles.customName'))
    .setDesc(t('appearance.noteStyles.customDesc'))
    .addTextArea((x) => x
      .then((a) => a.inputEl.setAttrs({ dir: 'auto', rows: '5' }))
      .setPlaceholder(t('appearance.noteStyles.customPlaceholder'))
      .setValue(plugin.settings.noteStyles.join('\n'))
      .onChange(async (v) => { plugin.settings.noteStyles = v.split('\n').map((s) => s.trim()).filter(Boolean); await plugin.saveSettings(); }));
}

export class NoteStyleModal extends Modal {
  constructor(app: App, private plugin: DamasceneStudio, private file: TFile) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('vs-modal');
    // same tokens and ornament as the panel, since it draws the same card
    this.contentEl.addClass('vs-root');
    this.contentEl.setAttr('dir', dir());
    renderNoteStyle(this.contentEl, this.plugin, this.file);
  }
  onClose(): void { this.contentEl.empty(); }
}
