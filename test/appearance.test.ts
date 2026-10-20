import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { applyVariant, clearVariant } from '../src/modules/appearance/styles';
import { DEFAULT_SETTINGS } from '../src/settings/defaults';

/** Just enough of document.body to watch which classes come and go. */
function fakeBody(initial: string[] = []) {
  const set = new Set(initial);
  return {
    classes: set,
    addClass: (...c: string[]) => c.forEach((x) => set.add(x)),
    removeClass: (...c: string[]) => c.forEach((x) => set.delete(x)),
  };
}

const appWith = (plugins: Record<string, unknown>) => ({ plugins: { plugins, enabledPlugins: new Set(Object.keys(plugins)) } }) as unknown as App;
const settings = (variants = true) => ({ ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules, variants }, theme: { dark: 'umber', light: 'paper' } });
const palette = (s: Set<string>) => [...s].filter((c) => /^dm-(dark|light)-/.test(c)).sort();

describe('palette classes', () => {
  it('sets exactly one dark and one light palette class', () => {
    const body = fakeBody(['dm-dark-forest', 'theme-dark']);
    applyVariant(appWith({}), settings(), body);
    expect(palette(body.classes)).toEqual(['dm-dark-umber', 'dm-light-paper']);
    expect(body.classes.has('theme-dark')).toBe(true);
  });

  it('removes them when the plugin unloads and Style Settings is not running', () => {
    const body = fakeBody(['dm-dark-umber', 'dm-light-paper', 'theme-dark']);
    clearVariant(appWith({}), body);
    expect(palette(body.classes)).toEqual([]);
    expect(body.classes.has('theme-dark')).toBe(true);
  });

  it('leaves them to Style Settings when it is running', () => {
    const body = fakeBody(['dm-dark-umber', 'dm-light-paper']);
    clearVariant(appWith({ 'obsidian-style-settings': {} }), body);
    expect(palette(body.classes)).toEqual(['dm-dark-umber', 'dm-light-paper']);
  });

  it('removes them when only the palettes module is switched off', () => {
    const body = fakeBody(['dm-dark-umber', 'dm-light-paper']);
    applyVariant(appWith({}), settings(false), body);
    expect(palette(body.classes)).toEqual([]);
  });
});
