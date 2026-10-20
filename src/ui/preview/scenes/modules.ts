// One scene per module: what the vault looks like with it and without it.
import { VARIANTS } from '../../../modules/appearance/styles';
import type { Scene } from '../engine';
import { bar, explorer, icon, layers, lines, menu, page, picture, ribbon, toolbar } from '../primitives';

const on = (v: string): boolean => v === 'on';

/** Most module scenes cross-fade between a "without" and a "with" layer. */
const swap = (stage: HTMLElement) => (v: string): void => { stage.toggleClass('is-b', on(v)); };

export const moduleScenes: Scene[] = [
  {
    id: 'mod.home', kind: 'toggle',
    build(body, stage) {
      const [plain, dash] = layers(body);
      lines(page(plain), 6);
      const band = dash.createDiv('dm-pv-band');
      bar(band, 38, 'is-strong');
      bar(band, 56);
      band.createDiv({ cls: 'dm-pv-clock', text: '09:41' });
      const tiles = dash.createDiv('dm-pv-tiles');
      for (const n of ['93', '417', '12', '39']) {
        const tile = tiles.createDiv('dm-pv-tile');
        tile.createDiv({ cls: 'dm-pv-num', text: n });
        bar(tile, 70);
      }
      const cards = dash.createDiv('dm-pv-cards');
      lines(cards.createDiv('dm-pv-mcard'), 3, 2);
      const ring = cards.createDiv('dm-pv-mcard dm-pv-center');
      ring.createDiv('dm-pv-ring');
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.inserter', kind: 'toggle',
    build(body, stage) {
      const p = page(body);
      lines(p, 2);
      const target = bar(p, 70, 'is-caret');
      lines(p, 2, 4);
      const m = menu(body, [['square-plus', 64, 'is-insert'], ['scissors', 46], ['copy', 52], ['clipboard', 40]], 'is-context');
      return {
        show: swap(stage),
        demo: { target: () => target, act: (level) => m.toggleClass('is-open', level > 0) },
      };
    },
  },
  {
    id: 'mod.embeds', kind: 'toggle',
    build(body, stage) {
      const p = page(body);
      lines(p, 2);
      const frame = p.createDiv('dm-pv-embed');
      const pic = picture(frame, true);
      toolbar(frame);
      lines(p, 1, 3);
      return {
        show: (v) => {
          stage.toggleClass('is-b', on(v));
          frame.setCssProps({ '--a': on(v) ? '.5' : isRtlStage(stage) ? '1' : '0' });
          pic.toggleClass('is-card', on(v));
        },
        demo: { target: () => pic, act: (level) => frame.toggleClass('is-hot', level > 0 && stage.hasClass('is-b')) },
      };
    },
  },
  {
    id: 'mod.folders', kind: 'toggle',
    build(body, stage) {
      const rows = explorer(body, [[0, true, 46], [1, false, 58], [1, false, 40], [0, true, 52], [1, true, 44], [2, false, 50], [0, true, 38], [0, true, 56]]);
      const colors = ['--dm-folder-1', '--dm-folder-1', '--dm-folder-1', '--dm-folder-2', '--dm-folder-2', '--dm-folder-2', '--dm-folder-3', '--dm-folder-4'];
      rows.forEach((r, i) => r.setCssProps({ '--c': `var(${colors[i]}, var(--interactive-accent))` }));
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.headings', kind: 'toggle',
    build(body, stage) {
      const p = page(body, 'is-headings');
      bar(p, 54, 'dm-pv-h is-h1');
      lines(p, 2);
      bar(p, 40, 'dm-pv-h is-h2');
      lines(p, 2, 3);
      bar(p, 34, 'dm-pv-h is-h3');
      lines(p, 1, 5);
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.variants', kind: 'toggle',
    build(body, stage) {
      const panel = body.createDiv('dm-pv-mpanel');
      bar(panel, 36, 'is-strong');
      const seg = panel.createDiv('dm-pv-mseg');
      for (const n of ['moon', 'sun', 'monitor']) icon(seg, n);
      const grid = panel.createDiv('dm-pv-swatches');
      for (const v of VARIANTS.slice(0, 4)) {
        const sw = grid.createDiv('dm-pv-swatch');
        sw.setCssProps({ '--bg': v.bg, '--fg': v.accent, '--fg2': v.accent2 });
        sw.createDiv('dm-pv-sw-bar');
        sw.createDiv('dm-pv-sw-bar is-2');
      }
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.pomodoro', kind: 'toggle',
    build(body, stage) {
      const shell = body.createDiv('dm-pv-shell');
      ribbon(shell, ['files', 'search', 'calendar', 'timer']).lastElementChild?.addClass('is-new');
      const main = shell.createDiv('dm-pv-main');
      lines(page(main), 4);
      const focus = shell.createDiv('dm-pv-side dm-pv-center');
      focus.createDiv({ cls: 'dm-pv-ring is-timer', text: '24:59' });
      const status = body.createDiv('dm-pv-status');
      bar(status, 30);
      status.createSpan({ cls: 'dm-pv-chipx is-new', text: '◷ 24:59' });
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.health', kind: 'toggle',
    build(body, stage) {
      const tiles = body.createDiv('dm-pv-tiles is-small');
      for (const n of ['93', '33', '4']) {
        const tile = tiles.createDiv('dm-pv-tile');
        tile.createDiv({ cls: 'dm-pv-num', text: n });
        bar(tile, 60);
      }
      const seal = body.createDiv('dm-pv-seal is-new');
      icon(seal, 'shield-check');
      lines(seal, 1, 2);
      const list = body.createDiv('dm-pv-checks is-new');
      for (const [ic, w] of [['alert-triangle', 62], ['info', 48], ['check-circle-2', 54]] as const) {
        const r = list.createDiv('dm-pv-check');
        icon(r, ic);
        bar(r, w);
      }
      return { show: swap(stage) };
    },
  },
  {
    id: 'mod.ticktick', kind: 'toggle',
    build(body, stage) {
      const [vault, tick] = layers(body);
      for (const [layer, ic] of [[vault, 'file-text'], [tick, 'check-check']] as const) {
        const head = layer.createDiv('dm-pv-src');
        icon(head, ic);
        bar(head, 30, 'is-strong');
        const tiles = layer.createDiv('dm-pv-tiles is-small');
        for (const n of layer === vault ? ['12', '5', '3'] : ['48', '9', '21']) {
          const tile = tiles.createDiv('dm-pv-tile');
          tile.createDiv({ cls: 'dm-pv-num', text: n });
          bar(tile, 64);
        }
        const list = layer.createDiv('dm-pv-tasks');
        for (let i = 0; i < 3; i++) {
          const r = list.createDiv('dm-pv-task');
          r.createSpan(layer === vault ? 'dm-pv-box' : 'dm-pv-dot');
          bar(r, [70, 52, 61][i]);
        }
      }
      return { show: swap(stage) };
    },
  },
];

/** Start-aligned content sits on the right in an RTL stage. */
export const isRtlStage = (stage: HTMLElement): boolean => stage.getAttribute('dir') === 'rtl';
