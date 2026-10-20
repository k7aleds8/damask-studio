import { Modal, type App } from 'obsidian';
import { dir, t } from '../i18n';

type Button = [label: string, cls: string, act: () => void | Promise<void>];

export class ConfirmModal extends Modal {
  constructor(app: App, private o: { title: string; text: string; buttons: Button[]; list?: string[]; onClose?: () => void }) {
    super(app);
  }

  onOpen(): void {
    const c = this.contentEl;
    c.addClass('tt-root', 'tm-confirm');
    c.setAttr('dir', dir());
    c.createEl('h3', { text: this.o.title });
    for (const p of this.o.text.split('\n')) c.createEl('p', { cls: 'qh-muted', text: p });
    if (this.o.list?.length) {
      const ul = c.createEl('ul', { cls: 'tm-list' });
      for (const x of this.o.list) ul.createEl('li', { text: x });
    }
    const row = c.createDiv('tt-ed-foot');
    for (const [label, cls, act] of this.o.buttons) {
      row.createEl('button', { text: label, cls }).addEventListener('click', () => {
        this.close();
        void act();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
    this.o.onClose?.();
  }
}

export class TextPromptModal extends Modal {
  constructor(app: App, private title: string, private value: string, private done: (v: string) => void, private clearLabel?: string) {
    super(app);
  }

  onOpen(): void {
    const c = this.contentEl;
    c.setAttr('dir', dir());
    c.createEl('h3', { text: this.title });
    const input = c.createEl('input', { type: 'text', cls: 'vs-input', attr: { dir: 'auto' } });
    input.value = this.value;
    const go = () => { this.done(input.value.trim()); this.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const row = c.createDiv('vs-row-end');
    row.createEl('button', { text: t('common.save'), cls: 'mod-cta' }).addEventListener('click', go);
    if (this.clearLabel) {
      row.createEl('button', { text: this.clearLabel }).addEventListener('click', () => { this.done(''); this.close(); });
    }
    window.setTimeout(() => input.focus(), 30);
  }

  onClose(): void { this.contentEl.empty(); }
}
