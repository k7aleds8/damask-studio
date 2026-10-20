import { describe, expect, it } from 'vitest';
import { formatNumber, setLanguage, t } from '../src/i18n';

describe('translation', () => {
  it('fills variables and keeps Latin digits in Arabic', () => {
    setLanguage('ar');
    expect(t('stats.vsLastWeekUp', { n: 1234 })).toBe('▲ 1,234 عن الأسبوع الماضي');
    expect(formatNumber(12.5)).toBe('12.5');
  });

  it('picks the Arabic plural forms', () => {
    setLanguage('ar');
    expect(t('home.suggest.orphans', { count: 1 })).toBe('ملاحظة واحدة معزولة');
    expect(t('home.suggest.orphans', { count: 2 })).toBe('ملاحظتان معزولتان');
    expect(t('home.suggest.orphans', { count: 5 })).toBe('5 ملاحظات معزولة');
    expect(t('home.suggest.orphans', { count: 15 })).toBe('15 ملاحظة معزولة');
  });

  it('picks the English and French plural forms', () => {
    setLanguage('en');
    expect(t('health.empty.title', { count: 1 })).toBe('One empty note');
    expect(t('health.empty.title', { count: 3 })).toBe('3 empty notes');
    setLanguage('fr');
    expect(t('health.empty.title', { count: 0 })).toBe('0 note vide');
  });

  it('falls back to English for a language it does not ship', () => {
    setLanguage('de');
    expect(t('common.save')).toBe('Save');
  });
});
