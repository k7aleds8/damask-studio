// Pure timing and value logic for option previews. No DOM here, so it can be
// unit tested and so seeking to any moment gives the same frame every time.

export const SCENE_IDS = [
  'mod.home', 'mod.inserter', 'mod.embeds', 'mod.folders', 'mod.headings', 'mod.variants', 'mod.pomodoro', 'mod.health', 'mod.ticktick',
  'ins.menu', 'ins.suggest', 'ins.ribbon',
  'emb.enabled', 'emb.toolbar', 'emb.trigger', 'emb.images', 'emb.align', 'emb.width', 'emb.maxWidth', 'emb.frame', 'emb.shadow', 'emb.invert',
] as const;
export type SceneId = typeof SCENE_IDS[number];

export type ControlKind = 'toggle' | 'choice' | 'range';

/** One loop, in milliseconds. Long enough to read, short enough not to bore. */
export const LOOP = 5600;
/** The moment the mini control flips and the scene moves to the new value. */
export const FLIP = 2500;
/** The stage fades out over the last stretch so the restart doesn't jump. */
export const FADE_FROM = 5150;

export type Point = 'rest' | 'demo' | 'control' | 'hidden';
interface Waypoint { at: number; to: Point }

/**
 * Where the pretend cursor is heading over one loop. With a demo it first
 * shows the current behaviour (hover, right-click, typing), then flips the
 * control, then shows the same gesture again under the new value.
 */
export function cursorPath(hasDemo: boolean): Waypoint[] {
  return hasDemo
    ? [{ at: 0, to: 'hidden' }, { at: 250, to: 'rest' }, { at: 1000, to: 'demo' }, { at: 1750, to: 'demo' }, { at: 2380, to: 'control' }, { at: 2700, to: 'control' }, { at: 3400, to: 'demo' }, { at: 4950, to: 'demo' }, { at: 5100, to: 'hidden' }]
    : [{ at: 0, to: 'hidden' }, { at: 250, to: 'rest' }, { at: 1300, to: 'rest' }, { at: 2380, to: 'control' }, { at: 2750, to: 'control' }, { at: 3500, to: 'rest' }, { at: 5000, to: 'rest' }, { at: 5100, to: 'hidden' }];
}

/** The two waypoints around `ms` and how far along the move is (eased). */
export function cursorAt(path: Waypoint[], ms: number): { a: Point; b: Point; k: number } {
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1];
    if (ms >= p.at && ms < q.at) {
      const lin = (ms - p.at) / (q.at - p.at);
      return { a: p.to, b: q.to, k: lin < 0.5 ? 2 * lin * lin : 1 - Math.pow(-2 * lin + 2, 2) / 2 };
    }
  }
  const last = path[path.length - 1].to;
  return { a: last, b: last, k: 1 };
}

export const phaseAt = (ms: number): 'from' | 'to' => (ms < FLIP ? 'from' : 'to');

/**
 * How engaged the demo gesture is: 0 idle, 1 pointing (hover, menu open,
 * key typed), 2 pointing with the modifier key held, for options like
 * "show the toolbar only with Alt".
 */
export function demoLevel(ms: number, hasKey: boolean): 0 | 1 | 2 {
  const windows: [number, number, number][] = [[1000, 1750, 1380], [3400, 4950, 3850]];
  for (const [start, end, key] of windows) {
    if (ms >= start && ms < end) return hasKey && ms >= key ? 2 : 1;
  }
  return 0;
}

/** The cursor presses down briefly when it clicks the control or starts a demo. */
export const pressedAt = (ms: number, hasDemo: boolean): boolean =>
  (ms >= FLIP - 120 && ms < FLIP + 60) || (hasDemo && ((ms >= 960 && ms < 1080) || (ms >= 3360 && ms < 3480)));

export interface ValueSpec { kind: ControlKind; values?: string[]; max?: number }

/**
 * The value a preview should move to. A toggle always flips. A choice uses
 * the option under the pointer, or the next one along. A range uses the
 * value being dragged, or one far enough away to make the change visible.
 */
export function targetValue(spec: ValueSpec, from: string, hint?: string | null): string {
  if (spec.kind === 'toggle') return from === 'on' ? 'off' : 'on';
  if (hint != null && hint !== from) return hint;
  if (spec.kind === 'choice') {
    const vs = spec.values ?? [];
    const i = vs.indexOf(from);
    return vs[(i + 1) % vs.length] ?? from;
  }
  const max = spec.max ?? 100;
  const cur = Number(from) || 0;
  // zero means "natural size" for both sliders, so jump to a clear half
  if (cur === 0) return String(Math.round(max / 2));
  return String(cur > max * 0.55 ? Math.round(max * 0.35) : Math.round(max * 0.9));
}
