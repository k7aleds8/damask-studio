// Plays a preview scene as a silent loop. One requestAnimationFrame clock
// drives everything; scenes only say how each value looks and CSS
// transitions do the in-between, so seeking to any moment is exact.
import { svg } from '../../core/dom';
import { dir, isRtl, t } from '../../i18n';
import { cursorAt, cursorPath, demoLevel, FADE_FROM, LOOP, phaseAt, pressedAt, type ControlKind, type Point, type SceneId } from './timeline';

export interface Demo {
  /** what the cursor points at to show the behaviour */
  target(): HTMLElement | null;
  /** 0 idle, 1 pointing (hover, menu open, key typed), 2 pointing with the key held */
  act(level: 0 | 1 | 2): void;
  /** a modifier the gesture needs under the value currently shown */
  key?(): string | null;
}

export interface SceneHandle { show(value: string): void; demo?: Demo }

export interface Scene {
  id: SceneId;
  kind: ControlKind;
  values?: string[];
  max?: number;
  label?(value: string): string;
  build(body: HTMLElement, stage: HTMLElement): SceneHandle;
}

export function valueLabel(scene: Scene, v: string): string {
  if (scene.kind === 'toggle') return v === 'on' ? t('preview.on') : t('preview.off');
  return scene.label?.(v) ?? v;
}

/** The little switch, chip row or slider in the stage corner that the cursor operates. */
class MiniControl {
  readonly el: HTMLElement;
  private chips = new Map<string, HTMLElement>();
  private track?: HTMLElement;
  private readout?: HTMLElement;

  constructor(parent: HTMLElement, private scene: Scene) {
    if (scene.kind === 'toggle') {
      this.el = parent.createDiv('dm-pv-switch');
      this.el.createDiv('dm-pv-knob');
    } else if (scene.kind === 'choice') {
      this.el = parent.createDiv('dm-pv-chips');
      for (const v of scene.values ?? []) this.chips.set(v, this.el.createSpan({ cls: 'dm-pv-chip', text: valueLabel(scene, v) }));
    } else {
      this.el = parent.createDiv('dm-pv-range');
      this.track = this.el.createDiv('dm-pv-track');
      this.track.createDiv('dm-pv-fill');
      this.track.createDiv('dm-pv-knob');
      this.readout = this.el.createSpan('dm-pv-readout');
    }
  }

  set(v: string): void {
    if (this.scene.kind === 'toggle') this.el.toggleClass('is-on', v === 'on');
    else if (this.scene.kind === 'choice') for (const [k, c] of this.chips) c.toggleClass('is-active', k === v);
    else {
      this.el.setCssProps({ '--p': String(this.ratio(v)) });
      this.readout!.setText(valueLabel(this.scene, v));
    }
  }

  private ratio(v: string): number { return Math.min(1, Math.max(0, (Number(v) || 0) / (this.scene.max ?? 100))); }

  /** Where the cursor should click to pick `v`, in stage coordinates. */
  point(v: string, origin: DOMRect): { x: number; y: number } {
    let r: DOMRect;
    if (this.scene.kind === 'choice') r = (this.chips.get(v) ?? this.el).getBoundingClientRect();
    else if (this.scene.kind === 'range') {
      const tr = this.track!.getBoundingClientRect();
      const p = this.ratio(v);
      const x = isRtl() ? tr.right - p * tr.width : tr.left + p * tr.width;
      return { x: x - origin.left, y: tr.top + tr.height / 2 - origin.top };
    } else r = this.el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
  }
}

interface Stage { root: HTMLElement; handle: SceneHandle; ctl: MiniControl; cursor: HTMLElement; keycap: HTMLElement }

function buildStage(parent: HTMLElement, scene: Scene): Stage {
  const root = parent.createDiv('dm-pv-stage');
  root.setAttr('dir', dir());
  root.setAttr('aria-hidden', 'true');
  const chrome = root.createDiv('dm-pv-chrome');
  const dots = chrome.createDiv('dm-pv-dots');
  for (let i = 0; i < 3; i++) dots.createSpan();
  const ctl = new MiniControl(chrome, scene);
  const body = root.createDiv('dm-pv-body');
  const handle = scene.build(body, root);
  const cursor = root.createDiv('dm-pv-cursor');
  const arrow = svg('svg', { viewBox: '0 0 16 20', width: 16, height: 20 }, cursor);
  svg('path', { d: 'M1 1 L1 16 L5 12.4 L8 19 L10.6 17.8 L7.7 11.4 L13 11.4 Z' }, arrow);
  const keycap = root.createDiv('dm-pv-key');
  return { root, handle, ctl, cursor, keycap };
}

export class Player {
  readonly el: HTMLElement;
  private s: Stage;
  private path: ReturnType<typeof cursorPath>;
  private raf = 0;
  private t0 = 0;
  private pausedAt = 0;
  private phase: 'from' | 'to' | null = null;
  /** the first pass starts fully visible; only later loops fade back in */
  private looped = false;
  private level = -1;
  private io: IntersectionObserver;
  /** called every frame with the loop position, for the progress bar and state pills */
  onTick?: (ms: number, phase: 'from' | 'to') => void;

  constructor(parent: HTMLElement, readonly scene: Scene, readonly from: string, readonly to: string) {
    this.s = buildStage(parent, scene);
    this.el = this.s.root;
    this.path = cursorPath(!!this.s.handle.demo);
    this.render(0);
    // stop drawing while scrolled out of view; the popover can sit off-screen in a long panel.
    // The observer and the clock come from the stage's own window, which is a popout's when
    // the panel lives in one: mixing windows gives a negative clock and an invisible stage.
    const Observer = (this.el.win as Window & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver;
    this.io = new Observer(([e]) => (e.isIntersecting ? this.play() : this.pause()));
    this.io.observe(this.el);
    this.play();
  }

  play(): void {
    if (this.raf) return;
    const win = this.el.win;
    this.t0 = win.performance.now() - this.pausedAt;
    const step = (now: number) => {
      this.render((now - this.t0) % LOOP);
      this.raf = win.requestAnimationFrame(step);
    };
    this.raf = win.requestAnimationFrame(step);
  }

  pause(): void {
    if (!this.raf) return;
    this.el.win.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pausedAt = (this.el.win.performance.now() - this.t0) % LOOP;
  }

  /** Jump to a moment and stay there; transitions are skipped so the frame is exact. */
  seek(ms: number): void {
    this.pause();
    this.pausedAt = ms;
    this.el.addClass('is-snap');
    this.phase = null;
    this.level = -1;
    this.render(ms);
    void this.el.offsetWidth;
    this.el.removeClass('is-snap');
  }

  destroy(): void {
    this.pause();
    this.io.disconnect();
    this.el.remove();
  }

  private render(ms: number): void {
    const { handle, ctl, cursor, keycap, root } = this.s;
    const phase = phaseAt(ms);
    if (phase !== this.phase) {
      // the loop restarts while the stage is faded out: snap back instead of animating
      const restart = this.phase === 'to' && phase === 'from';
      if (restart) { root.addClass('is-snap'); this.looped = true; }
      const v = phase === 'from' ? this.from : this.to;
      handle.show(v);
      ctl.set(v);
      if (restart) { void root.offsetWidth; root.removeClass('is-snap'); }
      this.phase = phase;
      this.level = -1;
    }

    const demo = handle.demo;
    const key = demo?.key?.() ?? null;
    const level = demo ? demoLevel(ms, !!key) : 0;
    if (level !== this.level) {
      demo?.act(level);
      keycap.setText(key ?? '');
      keycap.toggleClass('is-on', level === 2);
      this.level = level;
    }

    const origin = root.getBoundingClientRect();
    const { a, b, k } = cursorAt(this.path, ms);
    const pa = this.point(a, origin), pb = this.point(b, origin);
    const opacity = a === 'hidden' && b === 'hidden' ? 0 : a === 'hidden' ? k : b === 'hidden' ? 1 - k : 1;
    cursor.setCssProps({
      '--x': (pa.x + (pb.x - pa.x) * k).toFixed(1) + 'px',
      '--y': (pa.y + (pb.y - pa.y) * k).toFixed(1) + 'px',
      '--o': opacity.toFixed(2),
    });
    cursor.toggleClass('is-press', pressedAt(ms, !!demo));

    const fade = ms >= FADE_FROM ? 1 - (ms - FADE_FROM) / (LOOP - FADE_FROM) : this.looped ? Math.min(1, ms / 220) : 1;
    root.setCssProps({ '--fade': fade.toFixed(2) });
    this.onTick?.(ms, phase);
  }

  private point(p: Point, origin: DOMRect): { x: number; y: number } {
    const rest = { x: origin.width * 0.5, y: origin.height * 0.84 };
    if (p === 'control') return this.s.ctl.point(this.to, origin);
    if (p === 'demo') {
      const r = this.s.handle.demo?.target()?.getBoundingClientRect();
      if (r && r.width) return { x: r.left + r.width * 0.55 - origin.left, y: r.top + r.height * 0.5 - origin.top };
    }
    return rest;
  }
}

/** For reduced motion: the two states side by side, gesture already in place, nothing moving. */
export function renderStill(parent: HTMLElement, scene: Scene, from: string, to: string): HTMLElement {
  const wrap = parent.createDiv('dm-pv-still');
  [[from, t('preview.now')], [to, t('preview.after')]].forEach(([v, label], i) => {
    if (i) wrap.createDiv({ cls: 'dm-pv-still-arrow', text: isRtl() ? '←' : '→' });
    const col = wrap.createDiv('dm-pv-still-col');
    const s = buildStage(col, scene);
    s.root.addClass('is-snap', 'is-still');
    s.handle.show(v);
    s.ctl.set(v);
    const key = s.handle.demo?.key?.() ?? null;
    s.handle.demo?.act(key ? 2 : 1);
    if (key) s.keycap.addClass('is-on');
    s.keycap.setText(key ?? '');
    col.createDiv({ cls: 'dm-pv-still-l', text: `${label} · ${valueLabel(scene, v)}` });
  });
  return wrap;
}
