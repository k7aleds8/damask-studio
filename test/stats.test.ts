import { describe, expect, it } from 'vitest';
import moment from 'moment';
import { setLanguage } from '../src/i18n';
import { bucketOf, dayKey, streak } from '../src/stats/types';

describe('stats helpers', () => {
  setLanguage('en');

  it('counts a streak that ends yesterday', () => {
    const days = new Set([1, 2, 3].map((n) => dayKey(moment().subtract(n, 'days'))));
    expect(streak(days)).toBe(3);
  });

  it('stops a streak at the first gap', () => {
    const days = new Set([0, 1, 3].map((n) => dayKey(moment().subtract(n, 'days'))));
    expect(streak(days)).toBe(2);
  });

  it('puts due dates in the right bucket', () => {
    expect(bucketOf(undefined, true)).toBe('none');
    expect(bucketOf(moment().subtract(2, 'days').valueOf(), true)).toBe('overdue');
    expect(bucketOf(moment().valueOf(), true)).toBe('today');
    expect(bucketOf(moment().add(1, 'day').valueOf(), true)).toBe('tomorrow');
    expect(bucketOf(moment().add(30, 'days').valueOf(), true)).toBe('later');
  });
});

describe('TickTick focus records', () => {
  it('reads duration as milliseconds', async () => {
    const { focusMinutes } = await import('../src/integrations/ticktick/source');
    expect(focusMinutes({ id: '1', type: 0, startTime: '2026-10-19T10:06:56Z', duration: 1526000 })).toBeCloseTo(25.43, 1);
    expect(focusMinutes({ id: '2', type: 0, startTime: '2026-08-09T06:50:07Z', endTime: '2026-08-09T09:02:09Z', pauseDuration: 517 })).toBeCloseTo(123.4, 1);
  });
});
