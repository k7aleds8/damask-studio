// Drawing and image layout options, each shown on a small note with an embed.
import { t } from '../../../i18n';
import type { Scene } from '../engine';
import { lines, page, picture, toolbar } from '../primitives';

const on = (v: string): boolean => v === 'on';

/** A note with one embed whose position (--a, 0 = left … 1 = right) and width (--w) are CSS variables. */
function embedNote(body: HTMLElement, sketch = true, wide = false): { frame: HTMLElement; pic: HTMLElement; bar: HTMLElement } {
  const p = page(body, wide ? 'is-wide' : '');
  lines(p, 1);
  const lane = p.createDiv('dm-pv-lane');
  const frame = lane.createDiv('dm-pv-embed');
  const pic = picture(frame, sketch);
  const bar = toolbar(frame);
  lines(p, 1, 3);
  return { frame, pic, bar };
}

/** Physical positions: the option names are left, centre and right in every language. */
const ALIGN: Record<string, string> = { left: '0', center: '.5', right: '1' };
const startOf = (stage: HTMLElement): string => (stage.getAttribute('dir') === 'rtl' ? '1' : '0');

export const embedScenes: Scene[] = [
  {
    id: 'emb.enabled', kind: 'toggle',
    build(body, stage) {
      const { frame, pic } = embedNote(body);
      return {
        show: (v) => {
          frame.setCssProps({ '--a': on(v) ? '.5' : startOf(stage), '--w': on(v) ? '62%' : '46%' });
          pic.toggleClass('is-card', on(v));
        },
      };
    },
  },
  {
    id: 'emb.toolbar', kind: 'toggle',
    build(body) {
      const { frame, pic } = embedNote(body);
      frame.setCssProps({ '--a': '.5' });
      pic.addClass('is-card');
      let cur = 'on';
      return {
        show: (v) => { cur = v; },
        demo: { target: () => pic, act: (level) => frame.toggleClass('is-hot', level > 0 && on(cur)) },
      };
    },
  },
  {
    id: 'emb.trigger', kind: 'choice', values: ['hover', 'alt'],
    label: (v) => (v === 'alt' ? t('studio.embeds.withAlt') : t('studio.embeds.onHover')),
    build(body) {
      const { frame, pic } = embedNote(body);
      frame.setCssProps({ '--a': '.5' });
      pic.addClass('is-card');
      let cur = 'hover';
      return {
        show: (v) => { cur = v; },
        demo: {
          target: () => pic,
          key: () => (cur === 'alt' ? 'Alt' : null),
          act: (level) => frame.toggleClass('is-hot', cur === 'alt' ? level === 2 : level > 0),
        },
      };
    },
  },
  {
    id: 'emb.images', kind: 'toggle',
    build(body, stage) {
      const p = page(body, 'is-pair');
      const row = p.createDiv('dm-pv-pair');
      // the drawing is always laid out; the option decides whether plain images join it
      picture(row, true, 'is-card');
      const photo = picture(row, false);
      lines(p, 1, 2);
      return { show: (v) => { stage.toggleClass('is-b', on(v)); photo.toggleClass('is-card', on(v)); } };
    },
  },
  {
    id: 'emb.align', kind: 'choice', values: ['right', 'center', 'left'],
    label: (v) => t(`embeds.${v as 'right' | 'center' | 'left'}`),
    build(body) {
      const { frame, pic } = embedNote(body);
      pic.addClass('is-card');
      return { show: (v) => { frame.setCssProps({ '--a': ALIGN[v] ?? '.5' }); } };
    },
  },
  {
    id: 'emb.width', kind: 'range', max: 100,
    label: (v) => (Number(v) ? `${v}%` : t('embeds.auto')),
    build(body) {
      const { frame, pic } = embedNote(body);
      pic.addClass('is-card');
      frame.setCssProps({ '--a': '.5' });
      return { show: (v) => { frame.setCssProps({ '--w': Number(v) ? `${Math.max(14, Number(v))}%` : '46%' }); } };
    },
  },
  {
    id: 'emb.maxWidth', kind: 'range', max: 1600,
    label: (v) => (Number(v) ? `${v}px` : '∞'),
    build(body) {
      const { frame, pic } = embedNote(body, false, true);
      pic.addClass('is-card');
      frame.setCssProps({ '--a': '.5' });
      return { show: (v) => { frame.setCssProps({ '--w': Number(v) ? `${Math.max(16, (Number(v) / 1600) * 100)}%` : '100%' }); } };
    },
  },
  {
    id: 'emb.frame', kind: 'choice', values: ['none', 'card', 'glass', 'outline', 'polaroid'],
    label: (v) => (v === 'none' ? t('embeds.none') : t(`embeds.frames.${v as 'card' | 'glass' | 'outline' | 'polaroid'}`)),
    build(body) {
      const { frame, pic } = embedNote(body, false);
      frame.setCssProps({ '--a': '.5', '--w': '52%' });
      return {
        show: (v) => {
          for (const f of ['card', 'glass', 'outline', 'polaroid']) pic.toggleClass('is-' + f, f === v);
        },
      };
    },
  },
  {
    id: 'emb.shadow', kind: 'toggle',
    build(body) {
      const { frame, pic } = embedNote(body, false);
      frame.setCssProps({ '--a': '.5', '--w': '52%' });
      pic.addClass('is-card');
      return { show: (v) => { pic.toggleClass('has-shadow', on(v)); } };
    },
  },
  {
    id: 'emb.invert', kind: 'choice', values: ['none', 'dark', 'always'],
    label: (v) => (v === 'none' ? t('embeds.none') : v === 'dark' ? t('embeds.inDark') : t('embeds.always')),
    build(body) {
      const { frame, pic } = embedNote(body);
      frame.setCssProps({ '--a': '.5', '--w': '56%' });
      return {
        show: (v) => {
          // "in dark mode" means exactly that: follow the mode the vault is in right now
          const dark = body.doc.body.hasClass('theme-dark');
          pic.toggleClass('is-inverted', v === 'always' || (v === 'dark' && dark));
        },
      };
    },
  },
];
