import { getLanguage, moment } from 'obsidian';
import type { Moment, MomentInput } from 'moment';
import { en } from './locales/en';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { tr } from './locales/tr';

export type LanguageCode = 'en' | 'ar' | 'fr' | 'es' | 'tr';
export const LANGUAGES: { code: LanguageCode; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'ar', native: 'العربية' },
  { code: 'fr', native: 'Français' },
  { code: 'es', native: 'Español' },
  { code: 'tr', native: 'Türkçe' },
];

/** A plural message: Intl.PluralRules picks the category, `other` is required. */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Leaf = string | Plural;

// Locales mirror the English tree exactly, so a missing key is a type error.
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Shape<T[K]> };
export type Messages = Shape<typeof en>;

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<typeof en>;

const TABLE: Record<LanguageCode, Messages> = { en, ar, fr, es, tr };
const MOMENT_LOCALE: Record<LanguageCode, string> = { en: 'en', ar: 'ar-dm', fr: 'fr', es: 'es', tr: 'tr' };

let current: LanguageCode = 'en';
let plural = new Intl.PluralRules('en');

export function resolveLanguage(preference: string): LanguageCode {
  const raw = preference === 'auto' ? getLanguage() : preference;
  const base = raw.toLowerCase().split(/[-_]/)[0] as LanguageCode;
  return base in TABLE ? base : 'en';
}

export function setLanguage(preference: string): LanguageCode {
  current = resolveLanguage(preference);
  plural = new Intl.PluralRules(current);
  ensureMomentLocales();
  return current;
}

export const language = (): LanguageCode => current;
export const isRtl = (): boolean => current === 'ar';
export const dir = (): 'rtl' | 'ltr' => (isRtl() ? 'rtl' : 'ltr');

function lookup(key: string, table: Messages): Leaf | undefined {
  let node: unknown = table;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node as Leaf | undefined;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v == null) return whole;
    // names and paths keep their own direction inside a sentence of the other script
    return typeof v === 'number' ? formatNumber(v) : `\u2068${v}\u2069`;
  });
}

/**
 * Translate a key. Pass `count` in vars for plural messages; it is also
 * available as `{count}` in the text, already formatted for the locale.
 */
/** The direction isolates t() adds are for the screen only; strip them before writing to a note. */
export const plain = (s: string): string => s.replace(/[\u2068\u2069]/g, '');

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const leaf = lookup(key, TABLE[current]) ?? lookup(key, en);
  if (leaf == null) return key;
  if (typeof leaf === 'string') return fill(leaf, vars);
  const count = Number(vars?.count ?? 0);
  // exact zero gets its own form when a locale bothers to write one
  const form = (count === 0 && leaf.zero) || leaf[plural.select(count)] || leaf.other;
  return fill(form, vars);
}

/** Numbers always use Latin digits; mixed scripts in charts read badly. */
export function formatNumber(n: number, maxFraction = 1): string {
  const tag = current === 'ar' ? 'ar-u-nu-latn' : current;
  return Number(n || 0).toLocaleString(tag, { maximumFractionDigits: maxFraction });
}

export function formatPercent(ratio: number): string {
  const tag = current === 'ar' ? 'ar-u-nu-latn' : current;
  return new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 }).format(ratio || 0);
}

/** A moment instance in the UI language. */
export function m(input?: MomentInput, format?: string, strict?: boolean): Moment {
  const value = format ? moment(input, format, strict) : moment(input);
  return value.locale(MOMENT_LOCALE[current]);
}

let localesReady = false;
function ensureMomentLocales(): void {
  if (localesReady) return;
  localesReady = true;
  const previous = moment.locale();
  try {
    // moment's Arabic locale swaps in Eastern Arabic digits; keep Latin ones
    if (!moment.locales().includes('ar-dm')) {
      moment.defineLocale('ar-dm', { parentLocale: 'ar', postformat: (s: string) => s, preparse: (s: string) => s });
    }
  } catch (e) {
    console.warn('[Damask] could not define the ar-dm moment locale', e);
  }
  moment.locale(previous);
}

/** Hijri date for the hero card, in the UI language. Empty when the runtime lacks the calendar. */
export function hijriDate(date: Date): string {
  try {
    const tag = current === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : `${current}-u-ca-islamic-umalqura`;
    return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch {
    return '';
  }
}

export function weekdayNames(style: 'long' | 'short' = 'long'): string[] {
  // index 0 = Sunday, matching moment().day()
  return Array.from({ length: 7 }, (_, i) => m().day(i).format(style === 'long' ? 'dddd' : 'ddd'));
}
