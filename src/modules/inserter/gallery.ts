import { Component, EditorSuggest, MarkdownRenderer, Modal, setIcon, type App, type Command, type Editor, type EditorPosition, type EditorSuggestContext, type EditorSuggestTriggerInfo, type Menu } from 'obsidian';
import type DamasceneStudio from '../../main';
import { dir, t } from '../../i18n';
import { BLOCKS, blockName, blockSample, buildBlock, groupName, insertBlock, searchText, type Block, type BlockGroup } from './blocks';

/** Typing ;; (or the Arabic ؛؛) opens the block picker inline. */
export class BlockSuggest extends EditorSuggest<Block> {
  constructor(app: App, private plugin: DamasceneStudio) {
    super(app);
    this.limit = 40;
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!this.plugin.settings.modules.inserter || !this.plugin.settings.insert.suggest) return null;
    const m = editor.getLine(cursor.line).slice(0, cursor.ch).match(/(?:;;|؛؛)([^\s;؛]*)$/);
    if (!m) return null;
    return { start: { line: cursor.line, ch: cursor.ch - m[0].length }, end: cursor, query: m[1] ?? '' };
  }

  getSuggestions(ctx: EditorSuggestContext): Block[] {
    const q = ctx.query.toLowerCase();
    return BLOCKS.filter((b) => !q || searchText(b).includes(q));
  }

  renderSuggestion(b: Block, el: HTMLElement): void {
    el.addClass('vs-sug');
    setIcon(el.createSpan('vs-sug-ic'), b.icon);
    const text = el.createDiv('vs-sug-t');
    text.createDiv({ cls: 'vs-sug-name', text: blockName(b) });
    text.createDiv({ cls: 'vs-sug-group', text: groupName(b.group) });
  }

  selectSuggestion(b: Block): void {
    const ctx = this.context;
    if (!ctx) return;
    ctx.editor.replaceRange('', ctx.start, ctx.end);
    ctx.editor.setCursor(ctx.start);
    insertBlock(ctx.editor, b);
  }
}

/** Every block with a live preview, rendered by the theme itself. */
export class GalleryModal extends Modal {
  private previews = new Component();

  constructor(app: App, _plugin: DamasceneStudio, private editor: Editor | null) { super(app); }

  onOpen(): void {
    this.modalEl.addClass('vs-modal', 'vs-gallery-modal');
    const c = this.contentEl;
    c.setAttr('dir', dir());
    const head = c.createDiv('vs-gal-head');
    head.createEl('h2', { text: t('blocks.gallery.title') });
    head.createDiv({ cls: 'vs-muted', text: this.editor?.getSelection() ? t('blocks.gallery.wrapHint') : t('blocks.gallery.insertHint') });
    const search = c.createEl('input', { type: 'search', cls: 'vs-input', attr: { placeholder: t('blocks.gallery.search') } });
    const tabs = c.createDiv('vs-gal-tabs');
    const grid = c.createDiv('vs-gal-grid');
    let current: BlockGroup | 'all' = 'all';
    const draw = () => {
      grid.empty();
      this.previews.unload();
      this.previews = new Component();
      this.previews.load();
      const q = search.value.trim().toLowerCase();
      for (const b of BLOCKS) {
        if (current !== 'all' && b.group !== current) continue;
        if (q && !searchText(b).includes(q)) continue;
        const card = grid.createDiv('vs-gal-card');
        const top = card.createDiv('vs-gal-title');
        setIcon(top.createSpan(), b.icon);
        top.createSpan({ text: blockName(b) });
        const preview = card.createDiv('vs-gal-preview markdown-rendered');
        void MarkdownRenderer.render(this.app, buildBlock(b, blockSample(b)), preview, '', this.previews);
        card.addEventListener('click', () => {
          if (this.editor) insertBlock(this.editor, b);
          this.close();
        });
      }
    };
    const groups: (BlockGroup | 'all')[] = ['all', ...new Set(BLOCKS.map((b) => b.group))];
    for (const g of groups) {
      const tab = tabs.createEl('button', { cls: 'vs-seg-btn' + (g === current ? ' is-active' : ''), text: g === 'all' ? t('blocks.groups.all') : groupName(g) });
      tab.addEventListener('click', () => {
        current = g;
        tabs.querySelectorAll('button').forEach((x) => x.removeClass('is-active'));
        tab.addClass('is-active');
        draw();
      });
    }
    search.addEventListener('input', draw);
    draw();
    window.setTimeout(() => search.focus(), 30);
  }

  onClose(): void {
    this.previews.unload();
    this.contentEl.empty();
  }
}

export function inserterCommands(plugin: DamasceneStudio): Command[] {
  return [
    { id: 'block-gallery', name: t('commands.gallery'), icon: 'square-plus', editorCallback: (ed) => new GalleryModal(plugin.app, plugin, ed).open() },
    ...BLOCKS.map((b) => ({ id: 'insert-' + b.id, name: t('commands.insert', { name: blockName(b) }), icon: b.icon, editorCallback: (ed: Editor) => insertBlock(ed, b) })),
  ];
}

/** The suggester and the editor menu cannot be unregistered, so they check the module switch themselves. */
export function registerInserterHooks(plugin: DamasceneStudio): void {
  plugin.registerEditorSuggest(new BlockSuggest(plugin.app, plugin));
  plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu, editor) => {
    if (!plugin.settings.modules.inserter || !plugin.settings.insert.menu) return;
    const hasSelection = !!editor.getSelection();
    menu.addItem((item) => {
      item.setTitle(hasSelection ? t('blocks.menu.wrap') : t('blocks.menu.insert')).setIcon('square-plus').setSection('insert');
      const sub = (item as unknown as { setSubmenu?: () => Menu }).setSubmenu?.();
      if (!sub) { item.onClick(() => new GalleryModal(plugin.app, plugin, editor).open()); return; }
      sub.addItem((i) => i.setTitle(t('blocks.menu.gallery')).setIcon('layout-grid').onClick(() => new GalleryModal(plugin.app, plugin, editor).open()));
      sub.addSeparator();
      for (const g of new Set(BLOCKS.map((b) => b.group))) {
        sub.addItem((gi) => {
          gi.setTitle(groupName(g)).setIcon(BLOCKS.find((b) => b.group === g)!.icon);
          const inner = (gi as unknown as { setSubmenu?: () => Menu }).setSubmenu?.() ?? sub;
          for (const b of BLOCKS.filter((x) => x.group === g)) inner.addItem((i) => i.setTitle(blockName(b)).setIcon(b.icon).onClick(() => insertBlock(editor, b)));
        });
      }
    });
  }));
}
