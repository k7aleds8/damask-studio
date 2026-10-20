import type { Editor } from 'obsidian';
import { t, type MessageKey } from '../../i18n';

export type BlockGroup = 'quotes' | 'boxes' | 'panels' | 'dividers';

export interface Block {
  id: string;
  group: BlockGroup;
  icon: string;
  /** extra search words that work in any language */
  keys: string;
  /** {SEL} is replaced by the selection or the placeholder; {x} by t('blocks.text.x') */
  tpl: string;
  /** how each selected line is prefixed */
  wrap?: 'list' | 'ol';
  /** single-line blocks that do not start a new paragraph */
  inline?: boolean;
  noPlaceholder?: boolean;
}

export const BLOCKS: Block[] = [
  { id: 'quote', group: 'quotes', icon: 'quote', keys: 'quote cite', tpl: '> [!quote]\n{SEL}\n>\n> {author}' },
  { id: 'quote-big', group: 'quotes', icon: 'quote', keys: 'quote big', tpl: '> [!quote|big]\n{SEL}\n>\n> {author}' },
  { id: 'quote-side', group: 'quotes', icon: 'text-quote', keys: 'quote side margin', tpl: '> [!quote|side]\n{SEL}\n>\n> {author}' },
  { id: 'quote-forest', group: 'quotes', icon: 'quote', keys: 'quote forest green', tpl: '> [!quote|forest]\n{SEL}\n>\n> {author}' },
  { id: 'quote-umber', group: 'quotes', icon: 'quote', keys: 'quote umber red', tpl: '> [!quote|umber]\n{SEL}\n>\n> {author}' },
  { id: 'ayah', group: 'quotes', icon: 'book-open-text', keys: 'ayah verse scripture quran', tpl: '> [!ayah]\n{SEL}\n>\n> {reference}' },
  { id: 'poem', group: 'quotes', icon: 'feather', keys: 'poem verse poetry', tpl: '> [!poem|title] {poemTitle}\n{SEL}\n>\n> {poet}', wrap: 'list' },
  { id: 'wisdom', group: 'boxes', icon: 'sparkles', keys: 'wisdom maxim proverb', tpl: '> [!wisdom] {wisdomTitle}\n{SEL}' },
  { id: 'definition', group: 'boxes', icon: 'book-open', keys: 'definition term glossary', tpl: '> [!definition] {term}\n{SEL}' },
  { id: 'key', group: 'boxes', icon: 'key-round', keys: 'key idea takeaway', tpl: '> [!key] {keyTitle}\n{SEL}' },
  { id: 'steps', group: 'boxes', icon: 'footprints', keys: 'steps process how-to', tpl: '> [!steps] {stepsTitle}\n{SEL}', wrap: 'ol' },
  { id: 'tip', group: 'boxes', icon: 'lightbulb', keys: 'tip hint', tpl: '> [!tip] {tipTitle}\n{SEL}' },
  { id: 'note', group: 'boxes', icon: 'pencil', keys: 'note', tpl: '> [!note] {noteTitle}\n{SEL}' },
  { id: 'warning', group: 'boxes', icon: 'alert-triangle', keys: 'warning caution', tpl: '> [!warning] {warningTitle}\n{SEL}' },
  { id: 'danger', group: 'boxes', icon: 'zap', keys: 'danger error', tpl: '> [!danger] {dangerTitle}\n{SEL}' },
  { id: 'question', group: 'boxes', icon: 'help-circle', keys: 'question faq fold', tpl: '> [!question]- {questionTitle}\n{SEL}' },
  { id: 'box-forest', group: 'panels', icon: 'square', keys: 'box panel forest', tpl: '> [!box|forest]\n{SEL}' },
  { id: 'box-umber', group: 'panels', icon: 'square', keys: 'box panel umber', tpl: '> [!box|umber tab]\n{SEL}' },
  { id: 'box-wheat', group: 'panels', icon: 'square', keys: 'box panel wheat', tpl: '> [!box|wheat center]\n{SEL}' },
  { id: 'box-charcoal', group: 'panels', icon: 'square', keys: 'box panel charcoal', tpl: '> [!box|charcoal]\n{SEL}' },
  { id: 'box-glass', group: 'panels', icon: 'square-dashed', keys: 'box panel glass', tpl: '> [!box|glass title] {panelTitle}\n{SEL}' },
  { id: 'box-outline', group: 'panels', icon: 'square-dashed', keys: 'box panel outline dashed', tpl: '> [!box|outline title] {panelTitle}\n{SEL}' },
  { id: 'lined', group: 'panels', icon: 'notebook-pen', keys: 'lined paper ruled notebook', tpl: '> [!lined]\n{SEL}' },
  { id: 'hr', group: 'dividers', icon: 'minus', keys: 'hr divider rule', tpl: '\n---\n', inline: true, noPlaceholder: true },
  { id: 'div-text', group: 'dividers', icon: 'heading', keys: 'divider title chapter', tpl: '\n<div class="dm-divider">{SEL}</div>\n', inline: true },
  { id: 'div-dots', group: 'dividers', icon: 'more-horizontal', keys: 'divider dots', tpl: '\n<div class="dm-divider dots"></div>\n', inline: true, noPlaceholder: true },
  { id: 'div-wave', group: 'dividers', icon: 'waves', keys: 'divider wave', tpl: '\n<div class="dm-divider wave"></div>\n', inline: true, noPlaceholder: true },
  { id: 'div-star', group: 'dividers', icon: 'star', keys: 'divider star', tpl: '\n<div class="dm-divider star"></div>\n', inline: true, noPlaceholder: true },
  { id: 'div-double', group: 'dividers', icon: 'equal', keys: 'divider double', tpl: '\n<div class="dm-divider double"></div>\n', inline: true, noPlaceholder: true },
];

const blockKey = (id: string, field: 'name' | 'ph' | 'sample') => `blocks.items.${id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}.${field}` as MessageKey;

export const blockName = (b: Block) => t(blockKey(b.id, 'name'));
export const blockPlaceholder = (b: Block) => (b.noPlaceholder ? '' : t(blockKey(b.id, 'ph')));
export const blockSample = (b: Block) => (b.noPlaceholder ? '' : t(blockKey(b.id, 'sample')));
export const groupName = (g: BlockGroup) => t(`blocks.groups.${g}`);
export const searchText = (b: Block) => `${blockName(b)} ${b.keys} ${b.id} ${groupName(b.group)}`.toLowerCase();

export function buildBlock(b: Block, selection: string): string {
  const tpl = b.tpl.replace(/\{(\w+)\}/g, (whole, k: string) => (k === 'SEL' ? whole : t(`blocks.text.${k}` as MessageKey)));
  const text = selection.replace(/\s+$/, '') || blockPlaceholder(b);
  if (b.inline) return tpl.replace('{SEL}', text.replace(/\n+/g, ' '));
  // strip quote markers and list bullets the selection may already carry
  const lines = text.split('\n').map((l) => l.replace(/^>\s?/, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
  let body: string;
  if (b.wrap === 'list') body = lines.filter((l) => l.trim()).map((l) => '> - ' + l).join('\n');
  else if (b.wrap === 'ol') body = lines.filter((l) => l.trim()).map((l, i) => `> ${i + 1}. ${l}`).join('\n');
  else body = lines.map((l) => '> ' + l).join('\n');
  return tpl.replace('{SEL}', body);
}

export function insertBlock(editor: Editor, b: Block): void {
  const sel = editor.getSelection();
  let out = buildBlock(b, sel);
  const from = editor.getCursor('from');
  const atLineStart = from.ch === 0 || /^\s*$/.test(editor.getLine(from.line).slice(0, from.ch));
  if (!b.inline) {
    if (!atLineStart) out = '\n' + out;
    out += '\n';
    const prev = from.line > 0 ? editor.getLine(from.line - 1) : '';
    if (atLineStart && prev.trim() !== '' && from.line > 0) out = '\n' + out;
  }
  editor.replaceSelection(out);
  // select the first placeholder line so typing replaces it
  const ph = blockPlaceholder(b).split('\n')[0];
  if (!sel && ph && !b.inline) {
    const end = editor.posToOffset(editor.getCursor('to'));
    const start = end - out.length;
    const idx = out.indexOf(ph);
    if (idx >= 0) editor.setSelection(editor.offsetToPos(start + idx), editor.offsetToPos(start + idx + ph.length));
  }
  editor.focus();
}
