import type { App, TFile } from 'obsidian';

// Classes the Qomra theme used in notes, renamed with the theme.
const OLD = /\bqm-(home|lined|divider|swatch|palette)\b/g;

/** Notes that still mention the old class names. */
export async function findLegacyNotes(app: App): Promise<TFile[]> {
  const hits: TFile[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    const text = await app.vault.cachedRead(f);
    OLD.lastIndex = 0;
    if (OLD.test(text)) hits.push(f);
  }
  return hits;
}

export async function updateLegacyNotes(app: App, files: TFile[]): Promise<number> {
  let n = 0;
  for (const f of files) {
    await app.vault.process(f, (text) => {
      const next = text.replace(OLD, 'dm-$1');
      if (next !== text) n++;
      return next;
    });
  }
  return n;
}
