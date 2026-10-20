import { describe, expect, it } from 'vitest';
import { setLanguage, t, type MessageKey } from '../src/i18n';
import { cursorAt, cursorPath, demoLevel, FLIP, LOOP, phaseAt, SCENE_IDS, targetValue } from '../src/ui/preview/timeline';

describe('preview captions', () => {
  it('every scene has its own caption in every language', () => {
    for (const lang of ['en', 'ar', 'fr', 'es', 'tr']) {
      setLanguage(lang);
      for (const id of SCENE_IDS) {
        const key = `preview.scenes.${id}` as MessageKey;
        expect(t(key), `${lang} ${id}`).not.toBe(key);
      }
    }
  });

  it('is written for each language, not copied from English', () => {
    setLanguage('en');
    const english = SCENE_IDS.map((id) => t(`preview.scenes.${id}` as MessageKey));
    for (const lang of ['ar', 'fr', 'es', 'tr']) {
      setLanguage(lang);
      SCENE_IDS.forEach((id, i) => expect(t(`preview.scenes.${id}` as MessageKey), `${lang} ${id}`).not.toBe(english[i]));
    }
  });
});

describe('preview target value', () => {
  it('flips a toggle', () => {
    expect(targetValue({ kind: 'toggle' }, 'on')).toBe('off');
    expect(targetValue({ kind: 'toggle' }, 'off', 'off')).toBe('on');
  });

  it('previews the hovered choice, or the next one along', () => {
    const spec = { kind: 'choice' as const, values: ['right', 'center', 'left'] };
    expect(targetValue(spec, 'right', 'left')).toBe('left');
    expect(targetValue(spec, 'right')).toBe('center');
    expect(targetValue(spec, 'left')).toBe('right');
    expect(targetValue(spec, 'center', 'center')).toBe('left');
  });

  it('moves a slider far enough to see the difference', () => {
    const spec = { kind: 'range' as const, max: 100 };
    expect(targetValue(spec, '0')).toBe('50');
    expect(targetValue(spec, '95')).toBe('35');
    expect(targetValue(spec, '20')).toBe('90');
    expect(targetValue(spec, '20', '65')).toBe('65');
  });
});

describe('preview timeline', () => {
  it('starts from the current value and ends on the new one', () => {
    expect(phaseAt(0)).toBe('from');
    expect(phaseAt(FLIP - 1)).toBe('from');
    expect(phaseAt(FLIP)).toBe('to');
    expect(phaseAt(LOOP - 1)).toBe('to');
  });

  it('shows the gesture once under each value, holding the key only when one is needed', () => {
    expect(demoLevel(500, true)).toBe(0);
    expect(demoLevel(1100, false)).toBe(1);
    expect(demoLevel(1500, true)).toBe(2);
    expect(demoLevel(4000, true)).toBe(2);
    expect(demoLevel(4000, false)).toBe(1);
    expect(demoLevel(5000, true)).toBe(0);
  });

  it('keeps the cursor on the control when the flip happens', () => {
    for (const demo of [true, false]) {
      const at = cursorAt(cursorPath(demo), FLIP);
      expect(at.a).toBe('control');
      expect(at.b).toBe('control');
    }
  });

  it('hides the cursor while the loop restarts', () => {
    const start = cursorAt(cursorPath(true), 0);
    const end = cursorAt(cursorPath(true), LOOP - 1);
    expect([start.a, end.b]).toEqual(['hidden', 'hidden']);
  });
});
