import type { App } from 'obsidian';

// Device-local storage, scoped to the vault by Obsidian. Used for anything
// that must not sync with the vault files: API tokens, caches, sync baselines.

export function readLocal<T>(app: App, key: string): T | null {
  try {
    const v: unknown = app.loadLocalStorage(key);
    if (v == null || v === '') return null;
    return (typeof v === 'string' ? JSON.parse(v) : v) as T;
  } catch {
    return null;
  }
}

export function writeLocal(app: App, key: string, value: unknown): void {
  try {
    app.saveLocalStorage(key, value == null ? null : JSON.stringify(value));
  } catch (e) {
    console.error(`[Damascene] could not store ${key}`, e);
  }
}
