import type { Moment } from 'moment';
import { svg, uid } from '../core/dom';
import { formatNumber, formatPercent, isRtl, m, t } from '../i18n';
import { drawArt } from './art';

export interface KpiOptions {
  n: number | string;
  label: string;
  sub?: string;
  art: string;
  tone?: 1 | 2 | 3 | 4;
  span?: number;
  tip?: string;
  onClick?: () => void;
}

export type ShareRow = [name: string, value: number, color: string];

/** One floating tooltip shared by every chart on screen. */
function tooltip(): HTMLElement {
  return document.body.querySelector<HTMLElement>(':scope > .qh-tip') ?? document.body.createDiv('qh-tip');
}

/**
 * Building blocks for the dashboard and stats pages. Kept stateless apart from
 * a few counters that vary the card colors, so any view can own one.
 */
export class Widgets {
  private cardIndex = 0;
  private kpiIndex = 0;
  private bandIndex = 0;
  readonly tip = tooltip();

  /** Titles may carry a subtitle after " — ". */
  card(parent: HTMLElement, span: number, title: string | null, cls?: string): HTMLElement {
    this.cardIndex++;
    const c = parent.createDiv(`qh-card qh-s${span} qh-o${this.cardIndex % 12}${cls ? ' ' + cls : ''}`);
    if (title) {
      const [main, sub] = splitTitle(title);
      const head = c.createDiv('qh-card-head');
      const tt = head.createDiv('qh-card-tt');
      tt.createDiv({ cls: 'qh-card-title', text: main });
      if (sub) tt.createDiv({ cls: 'qh-card-sub', text: sub });
    }
    return c;
  }

  band(parent: HTMLElement, title: string, sub?: string): void {
    this.bandIndex++;
    const b = parent.createDiv(`qh-s12 qh-band qh-b${this.bandIndex % 6}`);
    const tt = b.createDiv('qh-band-tt');
    tt.createDiv({ cls: 'qh-band-t', text: title });
    if (sub) tt.createDiv({ cls: 'qh-band-s', text: sub });
    b.createDiv('qh-band-line');
  }

  kpi(parent: HTMLElement, o: KpiOptions): HTMLElement {
    this.kpiIndex++;
    const c = parent.createDiv(`qh-kpi2 qh-s${o.span ?? 3} is-t${o.tone ?? 1} qh-k${this.kpiIndex % 8}`);
    drawArt(c.createDiv('qh-kpi2-art'), o.art);
    c.createDiv({ cls: 'qh-kpi2-l', text: o.label });
    c.createDiv({ cls: 'qh-kpi2-n', text: typeof o.n === 'number' ? formatNumber(o.n) : o.n });
    if (o.sub) c.createDiv({ cls: 'qh-kpi2-sub', text: o.sub });
    if (o.tip) this.tipOn(c, o.tip);
    if (o.onClick) {
      c.addClass('is-link');
      c.addEventListener('click', o.onClick);
    }
    return c;
  }

  empty(parent: HTMLElement, text: string): HTMLElement {
    return parent.createDiv({ cls: 'qh-empty', text });
  }

  tipOn(node: Element, text: string): void {
    node.addEventListener('mouseenter', (e) => {
      this.tip.textContent = text;
      this.tip.addClass('is-on');
      this.moveTip(e as MouseEvent);
    });
    node.addEventListener('mousemove', (e) => this.moveTip(e as MouseEvent));
    node.addEventListener('mouseleave', () => this.tip.removeClass('is-on'));
  }

  private moveTip(e: MouseEvent): void {
    this.tip.style.left = `${e.clientX + 14}px`;
    this.tip.style.top = `${e.clientY + 14}px`;
  }

  /** Stacked share bar with a legend; replaced the old donut charts. */
  shareBar(c: HTMLElement, rows: ShareRow[], unit = ''): void {
    const total = rows.reduce((a, r) => a + r[1], 0);
    if (!total) { this.empty(c, t('charts.noData')); return; }
    const head = c.createDiv('qh-share-total');
    head.createSpan({ cls: 'qh-share-n', text: formatNumber(total) });
    head.createSpan({ cls: 'qh-muted', text: unit });
    const bar = c.createDiv('qh-share');
    for (const [name, n, color] of rows) {
      if (!n) continue;
      const seg = bar.createDiv();
      seg.style.flex = String(n);
      seg.style.background = color;
      this.tipOn(seg, `${name}: ${formatNumber(n)} (${formatPercent(n / total)})`);
    }
    const legend = c.createDiv('qh-share-lg');
    for (const [name, n, color] of rows) {
      const li = legend.createDiv('qh-share-li');
      const nm = li.createDiv('qh-share-name');
      nm.createSpan('qh-share-dot').style.background = color;
      nm.createSpan({ text: name });
      li.createDiv({ cls: 'qh-share-pct', text: formatPercent(n / total) });
      li.createDiv({ cls: 'qh-share-c', text: formatNumber(n) });
    }
  }

  /** Oldest value sits at the reading start: right in Arabic, left otherwise. */
  sparkline(parent: HTMLElement, values: (number | null)[], opts: { w?: number; h?: number; color?: string; fill?: boolean; goal?: number } = {}): SVGSVGElement {
    const o = { w: 160, h: 44, color: 'var(--dm-accent)', fill: true, ...opts };
    const s = svg('svg', { viewBox: `0 0 ${o.w} ${o.h}`, class: 'qh-spark', preserveAspectRatio: 'none' }, parent);
    const nums = values.filter((v): v is number => v != null);
    if (!nums.length) {
      svg('line', { x1: 0, y1: o.h - 2, x2: o.w, y2: o.h - 2, style: `stroke:${o.color};opacity:.25`, 'stroke-dasharray': '3 4' }, s);
      return s;
    }
    const max = Math.max(o.goal ?? 0, ...nums, 1);
    const step = (i: number) => (i / Math.max(1, values.length - 1)) * o.w;
    const X = (i: number) => (isRtl() ? o.w - step(i) : step(i));
    const Y = (v: number) => o.h - 3 - (v / max) * (o.h - 8);
    const id = uid();
    const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('defs', {}, s));
    svg('stop', { offset: '0%', style: `stop-color:${o.color};stop-opacity:.45` }, grad);
    svg('stop', { offset: '100%', style: `stop-color:${o.color};stop-opacity:0` }, grad);
    let d = '';
    let first: number | undefined;
    let last = 0;
    values.forEach((v, i) => {
      if (v == null) return;
      d += (d ? ' L' : 'M') + `${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      first ??= X(i);
      last = X(i);
    });
    if (o.fill && first !== undefined) svg('path', { d: `${d} L${last},${o.h} L${first},${o.h} Z`, style: `fill:url(#${id})` }, s);
    if (o.goal != null) svg('line', { x1: 0, x2: o.w, y1: Y(o.goal), y2: Y(o.goal), style: 'stroke:var(--dm-faint);stroke-width:1', 'stroke-dasharray': '3 3' }, s);
    svg('path', { d, style: `fill:none;stroke:${o.color};stroke-width:2;stroke-linejoin:round;stroke-linecap:round`, 'vector-effect': 'non-scaling-stroke' }, s);
    const li = values.length - 1 - [...values].reverse().findIndex((v) => v != null);
    const lv = values[li];
    if (lv != null) svg('circle', { cx: X(li), cy: Y(lv), r: 3, style: `fill:${o.color};stroke:var(--dm-bg);stroke-width:2` }, s);
    return s;
  }

  ring(parent: HTMLElement, ratio: number, size: number, color: string, label?: string): SVGSVGElement {
    const s = svg('svg', { viewBox: '0 0 44 44', width: size, height: size, class: 'qh-ring' }, parent);
    const r = 18;
    const C = 2 * Math.PI * r;
    svg('circle', { cx: 22, cy: 22, r, style: 'fill:none;stroke:var(--dm-border);stroke-width:5' }, s);
    svg('circle', { cx: 22, cy: 22, r, transform: 'rotate(-90 22 22)', style: `fill:none;stroke:${color};stroke-width:5;stroke-linecap:round;stroke-dasharray:${(C * Math.min(1, Math.max(0, ratio))).toFixed(1)} ${C.toFixed(1)};transition:stroke-dasharray .6s` }, s);
    if (label != null) svg('text', { x: 22, y: 26.5, 'text-anchor': 'middle', class: 'qh-ring-t' }, s).textContent = label;
    return s;
  }

  /** GitHub-style grid; `per` maps YYYY-MM-DD to a value. */
  heatGrid(c: HTMLElement, per: Record<string, number>, weeks: number, unit: string, mark?: (day: Moment, cell: HTMLElement) => void): { total: number; activeDays: number; best: Moment | null } {
    const wrap = c.createDiv('qh-heat');
    const today = m();
    const start = m().endOf('week').subtract(weeks * 7 - 1, 'days').startOf('day');
    const mx = Math.max(1, ...Object.values(per));
    let total = 0;
    let activeDays = 0;
    let best: { n: number; d: Moment | null } = { n: 0, d: null };
    for (let w = 0; w < weeks; w++) {
      const col = wrap.createDiv('qh-heat-col');
      for (let d = 0; d < 7; d++) {
        const day = start.clone().add(w * 7 + d, 'days');
        const cell = col.createDiv('qh-cell');
        if (day.isAfter(today, 'day')) { cell.addClass('is-future'); continue; }
        const n = per[day.clone().locale('en').format('YYYY-MM-DD')] ?? 0;
        total += n;
        if (n) activeDays++;
        if (n > best.n) best = { n, d: day };
        cell.addClass('l' + (n === 0 ? 0 : n <= mx * 0.25 ? 1 : n <= mx * 0.5 ? 2 : n <= mx * 0.75 ? 3 : 4));
        this.tipOn(cell, `${day.format('dddd D MMMM')} — ${formatNumber(n)} ${unit}`);
        mark?.(day, cell);
      }
      if (w % 4 === 0) col.createDiv({ cls: 'qh-heat-m', text: start.clone().add(w * 7, 'days').format('MMM') });
    }
    return { total, activeDays, best: best.d };
  }

  heatLegend(parent: HTMLElement): void {
    const lg = parent.createDiv('qh-legend');
    lg.createSpan({ text: t('charts.less') });
    for (let i = 0; i <= 4; i++) lg.createDiv('qh-cell l' + i);
    lg.createSpan({ text: t('charts.more') });
  }

  vbars(c: HTMLElement, values: number[], labels: string[], color: string, unit: string, labelEvery?: number): void {
    const box = c.createDiv('tt-vbars');
    const mx = Math.max(1, ...values);
    values.forEach((v, i) => {
      const col = box.createDiv('tt-vbar');
      const bar = col.createDiv('tt-vbar-b');
      bar.style.height = `${(v / mx) * 100}%`;
      bar.style.background = color;
      if (v === mx && v > 0) bar.addClass('is-max');
      if (!labelEvery || i % labelEvery === 0 || i === values.length - 1) col.createDiv({ cls: 'tt-vbar-l', text: labels[i] });
      this.tipOn(col, `${labels[i]}: ${formatNumber(v)} ${unit}`);
    });
  }

  hbars(c: HTMLElement, rows: [label: string, value: number][], color: string, unit = '', onClick?: (label: string) => void): void {
    const box = c.createDiv('qh-bars');
    const mx = Math.max(1, ...rows.map((r) => r[1]));
    for (const [label, n] of rows) {
      const r = box.createDiv('qh-bar-row tt-hb');
      if (onClick) r.addEventListener('click', () => onClick(label));
      r.createSpan({ cls: 'qh-bar-l', text: label });
      const fill = r.createDiv('qh-bar').createDiv();
      fill.style.width = `${(n / mx) * 100}%`;
      fill.style.background = color;
      r.createSpan({ cls: 'qh-bar-n', text: formatNumber(n) + (unit ? ' ' + unit : '') });
    }
  }

  /** 24-hour clock with one petal per hour. */
  radial(c: HTMLElement, hours: number[], unit: string): void {
    const s = svg('svg', { viewBox: '0 0 200 200', class: 'tt-radial' }, c);
    const mx = Math.max(1, ...hours);
    svg('circle', { cx: 100, cy: 100, r: 34, style: 'fill:none;stroke:var(--dm-border)' }, s);
    svg('circle', { cx: 100, cy: 100, r: 88, style: 'fill:none;stroke:var(--dm-border);stroke-dasharray:2 4' }, s);
    const P = (r: number, a: number) => `${(100 + r * Math.cos(a)).toFixed(2)},${(100 + r * Math.sin(a)).toFixed(2)}`;
    hours.forEach((v, h) => {
      const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
      const a2 = a + ((2 * Math.PI) / 24) * 0.78;
      const r0 = 38;
      const r1 = 38 + (v / mx) * 50;
      const p = svg('path', {
        d: `M${P(r0, a)} L${P(r1, a)} A${r1},${r1} 0 0 1 ${P(r1, a2)} L${P(r0, a2)} A${r0},${r0} 0 0 0 ${P(r0, a)} Z`,
        class: 'tt-rseg',
        // opacity goes through a variable so the hover rule can still lift it
        style: `--seg-o:${v ? 0.25 + (0.75 * v) / mx : 0.08}`,
      }, s);
      this.tipOn(p, `${String(h).padStart(2, '0')}:00 — ${formatNumber(v)} ${unit}`);
    });
    for (const h of [0, 6, 12, 18]) {
      const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
      svg('text', { x: 100 + 97 * Math.cos(a), y: 100 + 97 * Math.sin(a) + 3, 'text-anchor': 'middle', class: 'qh-axis' }, s).textContent = String(h).padStart(2, '0');
    }
    const peak = hours.indexOf(Math.max(...hours));
    svg('text', { x: 100, y: 98, 'text-anchor': 'middle', class: 'tt-radial-n' }, s).textContent = Math.max(...hours) > 0 ? `${String(peak).padStart(2, '0')}:00` : '—';
    svg('text', { x: 100, y: 114, 'text-anchor': 'middle', class: 'qh-donut-l' }, s).textContent = t('charts.peakHour');
  }

  /** Cumulative area with monthly bars underneath. */
  growth(c: HTMLElement, cum: number[], counts: number[], labels: string[], unit: string): void {
    const W = 520, H = 170, P = 26;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H + 22}`, class: 'qh-area' }, c);
    const mx = Math.max(1, ...cum);
    const step = (i: number) => (i / Math.max(1, cum.length - 1)) * (W - 2 * P);
    const X = (i: number) => (isRtl() ? W - P - step(i) : P + step(i));
    const Y = (v: number) => H - (v / mx) * (H - 20);
    for (let k = 0; k <= 3; k++) {
      const y = Y((mx * k) / 3);
      svg('line', { x1: P, x2: W - P, y1: y, y2: y, style: 'stroke:var(--dm-border);stroke-width:1', 'stroke-dasharray': '2 4' }, s);
    }
    const id = uid('ga');
    const grad = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svg('defs', {}, s));
    svg('stop', { offset: '0', style: 'stop-color:var(--dm-accent);stop-opacity:.5' }, grad);
    svg('stop', { offset: '1', style: 'stop-color:var(--dm-accent);stop-opacity:0' }, grad);
    let d = '';
    cum.forEach((v, i) => { d += (i ? ' L' : 'M') + `${X(i).toFixed(1)},${Y(v).toFixed(1)}`; });
    svg('path', { d: `${d} L${X(cum.length - 1)},${H} L${X(0)},${H} Z`, style: `fill:url(#${id})` }, s);
    svg('path', { d, style: 'fill:none;stroke:var(--dm-accent);stroke-width:2.5;stroke-linejoin:round' }, s);
    const bw = ((W - 2 * P) / cum.length) * 0.38;
    const bm = Math.max(1, ...counts);
    counts.forEach((n, i) => {
      const bar = svg('rect', { x: X(i) - bw / 2, y: H - (n / bm) * 46, width: bw, height: (n / bm) * 46, rx: 3, style: 'fill:var(--dm-accent2);opacity:.55' }, s);
      this.tipOn(bar, t('charts.growthBar', { month: labels[i], added: n, total: cum[i] }));
      const dot = svg('circle', { cx: X(i), cy: Y(cum[i]), r: 3.5, style: 'fill:var(--dm-bg);stroke:var(--dm-accent);stroke-width:2' }, s);
      this.tipOn(dot, `${labels[i]}: ${formatNumber(cum[i])} ${unit}`);
      svg('text', { x: X(i), y: H + 16, 'text-anchor': 'middle', class: 'qh-axis' }, s).textContent = labels[i];
    });
  }
}

function splitTitle(title: string): [string, string | null] {
  const k = title.indexOf(' — ');
  return k > 0 ? [title.slice(0, k), title.slice(k + 3)] : [title, null];
}
