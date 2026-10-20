// The three ways into the block gallery: the editor menu, typing "/", the ribbon.
import type { Scene } from '../engine';
import { bar, icon, lines, menu, page, ribbon } from '../primitives';

const on = (v: string): boolean => v === 'on';

export const inserterScenes: Scene[] = [
  {
    id: 'ins.menu', kind: 'toggle',
    build(body, stage) {
      const p = page(body);
      lines(p, 2);
      const target = bar(p, 70, 'is-caret');
      lines(p, 2, 4);
      const m = menu(body, [['square-plus', 64, 'is-insert'], ['scissors', 46], ['copy', 52], ['clipboard', 40]], 'is-context');
      return {
        show: (v) => { stage.toggleClass('is-b', on(v)); },
        demo: { target: () => target, act: (level) => m.toggleClass('is-open', level > 0) },
      };
    },
  },
  {
    id: 'ins.suggest', kind: 'toggle',
    build(body, stage) {
      const p = page(body);
      lines(p, 2);
      const line = p.createDiv('dm-pv-typing');
      line.createSpan({ cls: 'dm-pv-slash', text: ';;' });
      line.createSpan('dm-pv-caret');
      lines(p, 2, 5);
      const pop = body.createDiv('dm-pv-suggest');
      for (const [ic, w] of [['quote', 58], ['info', 66], ['table', 48], ['columns-2', 54]] as const) {
        const r = pop.createDiv('dm-pv-mi');
        icon(r, ic);
        bar(r, w);
      }
      return {
        show: (v) => { stage.toggleClass('is-b', on(v)); },
        demo: {
          target: () => line.querySelector<HTMLElement>('.dm-pv-slash'),
          act: (level) => {
            line.toggleClass('is-typed', level > 0);
            pop.toggleClass('is-open', level > 0 && stage.hasClass('is-b'));
          },
        },
      };
    },
  },
  {
    id: 'ins.ribbon', kind: 'toggle',
    build(body, stage) {
      const shell = body.createDiv('dm-pv-shell');
      const r = ribbon(shell, ['files', 'search', 'square-plus', 'calendar', 'palette']);
      const btn = r.children[2] as HTMLElement;
      btn.addClass('is-new');
      lines(page(shell.createDiv('dm-pv-main')), 5);
      const gallery = body.createDiv('dm-pv-gallery');
      for (let i = 0; i < 6; i++) gallery.createDiv('dm-pv-gcell');
      return {
        show: (v) => { stage.toggleClass('is-b', on(v)); },
        demo: { target: () => btn, act: (level) => gallery.toggleClass('is-open', level > 0 && stage.hasClass('is-b')) },
      };
    },
  },
];
