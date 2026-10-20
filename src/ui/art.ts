import { svg } from '../core/dom';

// 120×120 drawings for the KPI tiles, in three inks the tile sets:
// A = main shape, P = lighter second shape, D = cut-outs (the tile surface).

type Ink = 'A' | 'P' | 'D';
interface Style { f?: Ink; fo?: number; s?: Ink; w?: number; lc?: 1; lj?: 1; dash?: string; o?: number; cls?: string }
type Shape = [tag: keyof SVGElementTagNameMap, attrs: Record<string, string | number>, style?: Style, children?: Shape[]];

const INK: Record<Ink, string> = { A: 'var(--ka)', P: 'var(--kp)', D: 'var(--kd)' };

function star(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r : R;
    pts.push(`${(cx + q * Math.cos(a)).toFixed(1)},${(cy + q * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export const ART: Record<string, Shape[]> = {
  docs: [
    ['rect', { x: 26, y: 20, width: 58, height: 76, rx: 7, transform: 'rotate(-9 55 58)' }, { f: 'P', o: 0.35 }],
    ['rect', { x: 36, y: 24, width: 58, height: 76, rx: 7 }, { f: 'A' }],
    ['rect', { x: 46, y: 38, width: 38, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 46, y: 50, width: 38, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 46, y: 62, width: 26, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['g', {}, { cls: 'qa-pop' }, [
      ['circle', { cx: 88, cy: 92, r: 18 }, { f: 'P', s: 'D', w: 4 }],
      ['path', { d: 'M88,84 V100 M80,92 H96' }, { s: 'D', w: 5, lc: 1 }]]],
  ],
  report: [
    ['rect', { x: 28, y: 20, width: 58, height: 76, rx: 7, transform: 'rotate(-8 57 58)' }, { f: 'P', o: 0.35 }],
    ['rect', { x: 36, y: 24, width: 58, height: 76, rx: 7 }, { f: 'A' }],
    ['rect', { x: 46, y: 38, width: 38, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 46, y: 50, width: 38, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 46, y: 62, width: 22, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['g', {}, { cls: 'qa-pop' }, [
      ['circle', { cx: 88, cy: 92, r: 19 }, { f: 'P', s: 'D', w: 4 }],
      ['path', { d: 'M79,92 l6,7 l13,-14' }, { s: 'D', w: 5, lc: 1, cls: 'qa-draw' }]]],
  ],
  link: [
    ['path', { d: 'M30,42 L80,30 L90,84 L50,90 Z M30,42 L90,84' }, { s: 'A', w: 4, o: 0.55, cls: 'qa-dash' }],
    ['circle', { cx: 30, cy: 42, r: 13 }, { f: 'A' }], ['circle', { cx: 30, cy: 42, r: 4.5 }, { f: 'D' }],
    ['circle', { cx: 80, cy: 30, r: 9 }, { f: 'P' }],
    ['circle', { cx: 50, cy: 90, r: 9 }, { f: 'P', o: 0.8 }],
    ['g', {}, { cls: 'qa-pulse' }, [['circle', { cx: 90, cy: 84, r: 15 }, { f: 'A' }], ['circle', { cx: 90, cy: 84, r: 5.5 }, { f: 'D' }]]],
  ],
  qa: [
    ['path', { d: 'M38,40 a9,9 0 0 1 9,-9 H96 a9,9 0 0 1 9,9 V74 a9,9 0 0 1 -9,9 H92 V98 L76,83 H47 a9,9 0 0 1 -9,-9 Z' }, { f: 'P', o: 0.3 }],
    ['g', {}, { cls: 'qa-sway' }, [
      ['path', { d: 'M16,28 a10,10 0 0 1 10,-10 H82 a10,10 0 0 1 10,10 V66 a10,10 0 0 1 -10,10 H46 L28,92 V76 H26 a10,10 0 0 1 -10,-10 Z' }, { f: 'A' }],
      ['path', { d: 'M45,38 q0,-10 9,-10 q9,0 9,9 q0,6 -6,9 q-3,2 -3,7' }, { s: 'D', w: 6, lc: 1 }],
      ['circle', { cx: 54, cy: 63, r: 4 }, { f: 'D' }]]],
  ],
  flame: [
    ['ellipse', { cx: 60, cy: 108, rx: 28, ry: 4 }, { f: 'P', o: 0.3 }],
    ['path', { d: 'M60,14 C66,32 90,44 90,72 C90,92 76,104 60,104 C44,104 30,92 30,72 C30,56 40,48 45,36 C49,46 53,50 57,52 C55,40 55,27 60,14 Z' }, { f: 'A' }],
    ['path', { d: 'M60,56 C64,67 75,72 75,85 C75,95 68,101 60,101 C52,101 45,95 45,85 C45,76 51,72 54,65 C56,71 58,73 60,74 Z' }, { f: 'P', cls: 'qa-flick' }],
  ],
  list: [
    ['rect', { x: 26, y: 22, width: 68, height: 86, rx: 9 }, { f: 'A' }],
    ['rect', { x: 44, y: 14, width: 32, height: 16, rx: 5 }, { f: 'P', s: 'D', w: 3 }],
    ['rect', { x: 37, y: 42, width: 12, height: 12, rx: 3 }, { f: 'P' }], ['path', { d: 'M39.5,48 l3,3 l5,-6' }, { s: 'D', w: 2.5, lc: 1 }],
    ['rect', { x: 55, y: 45.5, width: 28, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 37, y: 61, width: 12, height: 12, rx: 3 }, { s: 'D', w: 2.5, o: 0.6 }], ['rect', { x: 55, y: 64.5, width: 24, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
    ['rect', { x: 37, y: 80, width: 12, height: 12, rx: 3 }, { s: 'D', w: 2.5, o: 0.6 }], ['rect', { x: 55, y: 83.5, width: 18, height: 5, rx: 2.5 }, { f: 'D', o: 0.4 }],
  ],
  target: [
    ['circle', { cx: 60, cy: 60, r: 48 }, { s: 'A', w: 3, o: 0.55, dash: '10 9', cls: 'qa-spin' }],
    ['circle', { cx: 60, cy: 60, r: 34 }, { f: 'P', fo: 0.14, s: 'A', w: 5 }],
    ['circle', { cx: 60, cy: 60, r: 19 }, { s: 'A', w: 5 }],
    ['path', { d: 'M60,8 V30 M60,90 V112 M8,60 H30 M90,60 H112' }, { s: 'A', w: 5, lc: 1 }],
    ['circle', { cx: 60, cy: 60, r: 7 }, { f: 'P', cls: 'qa-pulse' }],
  ],
  timer: [
    ['rect', { x: 51, y: 12, width: 18, height: 10, rx: 4 }, { f: 'A' }], ['rect', { x: 56, y: 20, width: 8, height: 10 }, { f: 'A' }],
    ['rect', { x: 86, y: 28, width: 12, height: 8, rx: 3, transform: 'rotate(42 92 32)' }, { f: 'A' }],
    ['circle', { cx: 60, cy: 68, r: 38 }, { f: 'P', fo: 0.16, s: 'A', w: 6 }],
    ['path', { d: 'M60,36 V42 M60,94 V100 M28,68 H34 M86,68 H92' }, { s: 'A', w: 4, lc: 1, o: 0.7 }],
    ['path', { d: 'M60,68 L60,42 A26,26 0 0 1 82.5,55 Z' }, { f: 'A', o: 0.35 }],
    ['g', {}, { cls: 'qa-tick' }, [['path', { d: 'M60,68 V44' }, { s: 'P', w: 5, lc: 1 }]]],
    ['circle', { cx: 60, cy: 68, r: 5 }, { f: 'P' }],
  ],
  hourglass: [
    ['path', { d: 'M34,24 C34,52 55,54 55,60 C55,66 34,68 34,96 H86 C86,68 65,66 65,60 C65,54 86,52 86,24 Z' }, { f: 'P', fo: 0.16, s: 'A', w: 5, lj: 1 }],
    ['path', { d: 'M42,38 H78 C74,50 63,54 60,59 C57,54 46,50 42,38 Z' }, { f: 'A', cls: 'qa-pulse' }],
    ['path', { d: 'M60,59 V90' }, { s: 'A', w: 3, dash: '4 5', cls: 'qa-dash' }],
    ['path', { d: 'M41,94 C45,76 75,76 79,94 Z' }, { f: 'A' }],
    ['rect', { x: 28, y: 15, width: 64, height: 10, rx: 5 }, { f: 'A' }],
    ['rect', { x: 28, y: 95, width: 64, height: 10, rx: 5 }, { f: 'A' }],
  ],
  layers: [
    ['path', { d: 'M18,76 L60,96 L102,76' }, { s: 'P', w: 6, o: 0.45, lc: 1, lj: 1 }],
    ['path', { d: 'M18,60 L60,80 L102,60' }, { s: 'P', w: 6, o: 0.8, lc: 1, lj: 1 }],
    ['g', {}, { cls: 'qa-float' }, [
      ['path', { d: 'M60,20 L102,42 L60,64 L18,42 Z' }, { f: 'A', lj: 1 }],
      ['path', { d: 'M60,32 L80,42 L60,52 L40,42 Z' }, { f: 'D', o: 0.35 }]]],
  ],
  medal: [
    ['path', { d: 'M40,10 H56 L68,48 H52 Z' }, { f: 'P', o: 0.75 }],
    ['path', { d: 'M80,10 H64 L52,48 H68 Z' }, { f: 'P', o: 0.45 }],
    ['g', {}, { cls: 'qa-sway' }, [
      ['circle', { cx: 60, cy: 76, r: 30 }, { f: 'A' }],
      ['circle', { cx: 60, cy: 76, r: 21 }, { s: 'D', w: 3, o: 0.4 }],
      ['polygon', { points: star(60, 77, 13, 5.5) }, { f: 'D', o: 0.55 }]]],
  ],
};

export function drawArt(parent: HTMLElement, key: string): SVGSVGElement {
  const root = svg('svg', { viewBox: '0 0 120 120', class: 'qh-art', 'aria-hidden': 'true' }, parent);
  const build = (shapes: Shape[], into: Element) => {
    for (const [tag, attrs, style = {}, children] of shapes) {
      const node = svg(tag, attrs, into);
      const css = [`fill:${style.f ? INK[style.f] : 'none'}`];
      if (style.fo != null) css.push(`fill-opacity:${style.fo}`);
      if (style.s) css.push(`stroke:${INK[style.s]}`, `stroke-width:${style.w ?? 3}`);
      if (style.lc) css.push('stroke-linecap:round');
      if (style.lj || style.lc) css.push('stroke-linejoin:round');
      if (style.dash) css.push(`stroke-dasharray:${style.dash}`);
      if (style.o != null) css.push(`opacity:${style.o}`);
      if (tag !== 'g') node.setAttribute('style', css.join(';'));
      if (style.cls) node.setAttribute('class', style.cls);
      if (children) build(children, node);
    }
  };
  build(ART[key] ?? ART.docs, root);
  return root;
}
