import { beforeEach, describe, expect, it } from 'vitest';
import moment from 'moment';
import { setLanguage } from '../src/i18n';
import { parseQuickAdd } from '../src/integrations/ticktick/quick-add';

const projects = [{ id: 'p1', name: 'Study' }, { id: 'p2', name: 'Home errands' }];
const day = (n: number) => moment().add(n, 'days').format('YYYY-MM-DD');

describe('quick add, English', () => {
  beforeEach(() => setLanguage('en'));

  it('reads relative dates, time, priority, list and tags', () => {
    const r = parseQuickAdd('review chapter 3 tomorrow at 5pm !high ^Study #reading', projects, 'en');
    expect(r.title).toBe('review chapter 3');
    expect(r.dueDate?.format('YYYY-MM-DD HH:mm')).toBe(`${day(1)} 17:00`);
    expect(r.isAllDay).toBe(false);
    expect(r.priority).toBe(5);
    expect(r.projectId).toBe('p1');
    expect(r.tags).toEqual(['reading']);
  });

  it('matches a list by part of its name', () => {
    expect(parseQuickAdd('buy milk ^errands', projects, 'en').projectId).toBe('p2');
  });

  it('handles "in N days" as an all-day date', () => {
    const r = parseQuickAdd('call the bank in 3 days', [], 'en');
    expect(r.dueDate?.format('YYYY-MM-DD')).toBe(day(3));
    expect(r.isAllDay).toBe(true);
    expect(r.title).toBe('call the bank');
  });

  it('leaves undated text alone', () => {
    const r = parseQuickAdd('just a thought', [], 'en');
    expect(r.dueDate).toBeUndefined();
    expect(r.title).toBe('just a thought');
  });
});

describe('quick add, Arabic', () => {
  beforeEach(() => setLanguage('ar'));

  it('reads Arabic keywords and Eastern Arabic digits', () => {
    const r = parseQuickAdd('راجع الفصل الثالث غداً الساعة ٥م !عالي #قراءة', [], 'ar');
    expect(r.title).toBe('راجع الفصل الثالث');
    expect(r.dueDate?.format('YYYY-MM-DD HH:mm')).toBe(`${day(1)} 17:00`);
    expect(r.priority).toBe(5);
    expect(r.tags).toEqual(['قراءة']);
  });

  it('reads "after N days"', () => {
    expect(parseQuickAdd('اتصل بالبنك بعد 3 أيام', [], 'ar').dueDate?.format('YYYY-MM-DD')).toBe(day(3));
  });

  it('still understands English keywords', () => {
    expect(parseQuickAdd('مهمة tomorrow', [], 'ar').dueDate?.format('YYYY-MM-DD')).toBe(day(1));
  });
});

describe('quick add, French, Spanish, Turkish', () => {
  it('French', () => {
    setLanguage('fr');
    const r = parseQuickAdd('appeler maman demain à 18h30 !haute', [], 'fr');
    expect(r.title).toBe('appeler maman');
    expect(r.dueDate?.format('YYYY-MM-DD HH:mm')).toBe(`${day(1)} 18:30`);
    expect(r.priority).toBe(5);
  });

  it('Spanish', () => {
    setLanguage('es');
    const r = parseQuickAdd('pagar la luz en 2 días !media', [], 'es');
    expect(r.title).toBe('pagar la luz');
    expect(r.dueDate?.format('YYYY-MM-DD')).toBe(day(2));
    expect(r.priority).toBe(3);
  });

  it('Turkish', () => {
    setLanguage('tr');
    const r = parseQuickAdd('faturayı öde yarın saat 9:15 !düşük', [], 'tr');
    expect(r.title).toBe('faturayı öde');
    expect(r.dueDate?.format('YYYY-MM-DD HH:mm')).toBe(`${day(1)} 09:15`);
    expect(r.priority).toBe(1);
  });

  it('reads day/month order outside English', () => {
    setLanguage('fr');
    expect(parseQuickAdd('rendu 25/12', [], 'fr').dueDate?.format('MM-DD')).toBe('12-25');
  });
});
