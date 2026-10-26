import { handler } from '../../core/dom';
import { Notice } from 'obsidian';
import { moment } from '../../core/time';
import type DamaskStudio from '../../main';
import { readLocal, writeLocal } from '../../core/storage';
import { m, t } from '../../i18n';
import { ttTime } from '../../integrations/ticktick/client';

export type PomoMode = 'pomo' | 'short' | 'long' | 'stopwatch';

interface PomoState {
  mode: PomoMode;
  running: boolean;
  startedAt: number;
  endsAt: number;
  pausedAt: number;
  pause: number;
  task: string;
  /** TickTick task id when the task came from there */
  taskId: string;
  done: number;
  day: string;
}

const KEY = 'dm-pomo';
const LOG_DAYS = 120;

/** Timer state survives reloads because it lives in device storage, not memory. */
export class PomodoroEngine {
  st: PomoState;
  private listeners = new Set<(tickOnly: boolean) => void>();
  private bar: HTMLElement;

  constructor(private plugin: DamaskStudio) {
    this.st = { mode: 'pomo', running: false, startedAt: 0, endsAt: 0, pausedAt: 0, pause: 0, task: '', taskId: '', done: 0, day: '', ...(readLocal<PomoState>(plugin.app, KEY) ?? {}) };
    this.bar = plugin.addStatusBarItem();
    this.bar.addClass('tt-pomo-bar', 'mod-clickable');
    this.bar.addEventListener('click', handler(() => plugin.openFocus()));
    plugin.registerInterval(window.setInterval(() => void this.tick(), 1000));
    void this.tick();
  }

  get cfg() { return this.plugin.settings.pomodoro; }

  private length(mode: PomoMode): number {
    const c = this.cfg;
    return (mode === 'pomo' ? c.work : mode === 'short' ? c.short : mode === 'long' ? c.long : 0) * 60e3;
  }

  on(fn: (tickOnly: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private save(): void {
    writeLocal(this.plugin.app, KEY, this.st);
    for (const fn of [...this.listeners]) {
      try { fn(false); } catch { /* a closed view */ }
    }
  }

  private rollDay(): void {
    const d = moment().format('YYYY-MM-DD');
    if (this.st.day !== d) { this.st.day = d; this.st.done = 0; }
  }

  remaining(): number {
    const s = this.st;
    if (s.mode === 'stopwatch') return this.elapsed();
    if (!s.running) return this.length(s.mode);
    return Math.max(0, s.endsAt + s.pause - (s.pausedAt || Date.now()));
  }
  elapsed(): number {
    const s = this.st;
    return s.running ? (s.pausedAt || Date.now()) - s.startedAt - s.pause : 0;
  }
  progress(): number {
    if (this.st.mode === 'stopwatch') return ((this.elapsed() / 60e3) % 60) / 60;
    const L = this.length(this.st.mode);
    return L ? 1 - this.remaining() / L : 0;
  }

  setMode(mode: PomoMode): void { if (!this.st.running) { this.st.mode = mode; this.save(); } }
  setTask(title: string, ticktickId = ''): void { this.st.task = title; this.st.taskId = ticktickId; this.save(); }

  start(): void {
    const s = this.st;
    this.rollDay();
    if (s.running && s.pausedAt) {
      s.pause += Date.now() - s.pausedAt;
      s.pausedAt = 0;
    } else if (!s.running) {
      Object.assign(s, { running: true, startedAt: Date.now(), endsAt: Date.now() + this.length(s.mode), pause: 0, pausedAt: 0 });
    }
    this.save();
  }

  pause(): void {
    if (this.st.running && !this.st.pausedAt) { this.st.pausedAt = Date.now(); this.save(); }
  }

  toggle(): void {
    if (this.st.running && !this.st.pausedAt) this.pause();
    else this.start();
  }

  async stop(record: boolean): Promise<void> {
    const s = this.st;
    if (!s.running) return;
    const ms = this.elapsed();
    if (record && ms >= 60e3 && (s.mode === 'pomo' || s.mode === 'stopwatch')) await this.record(ms);
    Object.assign(s, { running: false, pausedAt: 0, pause: 0 });
    this.save();
  }

  private async record(ms: number): Promise<void> {
    const s = this.st;
    const session = {
      id: 'p' + Date.now().toString(36),
      kind: s.mode === 'stopwatch' ? 'stopwatch' as const : 'pomo' as const,
      start: s.startedAt,
      end: Date.now(),
      duration: Math.round(ms / 1000),
      pause: Math.round(s.pause / 1000),
      task: s.task || undefined,
    };
    const cutoff = Date.now() - LOG_DAYS * 864e5;
    this.cfg.log = [...this.cfg.log.filter((x) => x.start > cutoff), session];
    await this.plugin.saveSettings();
    const tt = this.plugin.ticktick;
    if (tt?.active) {
      await tt.createFocus({
        type: session.kind === 'stopwatch' ? 1 : 0,
        startTime: ttTime(moment(session.start)),
        endTime: ttTime(moment(session.end)),
        // TickTick counts focus duration in milliseconds, pauses in seconds
        duration: session.duration * 1000,
        pauseDuration: session.pause,
        ...(s.taskId ? { taskId: s.taskId } : {}),
        ...(s.task ? { note: s.task } : {}),
      });
    }
  }

  /** Sessions finished today, from the local log. */
  today(): { count: number; minutes: number } {
    const day = m();
    const list = this.cfg.log.filter((x) => m(x.start).isSame(day, 'day'));
    return { count: list.filter((x) => x.kind === 'pomo').length, minutes: Math.round(list.reduce((a, x) => a + x.duration, 0) / 60) };
  }

  private async tick(): Promise<void> {
    const s = this.st;
    if (s.running && !s.pausedAt && s.mode !== 'stopwatch' && Date.now() >= s.endsAt + s.pause) {
      const was = s.mode;
      if (was === 'pomo') {
        await this.record(this.length('pomo'));
        this.rollDay();
        s.done++;
      }
      s.running = false;
      s.pause = 0;
      s.mode = was === 'pomo' ? (s.done % (this.cfg.longEvery || 4) === 0 ? 'long' : 'short') : 'pomo';
      this.save();
      this.chime();
      new Notice(was === 'pomo' ? t('pomodoro.notices.focusDone', { count: s.done }) : t('pomodoro.notices.breakDone'), 8000);
      if ((was === 'pomo' && this.cfg.autoBreak) || (was !== 'pomo' && this.cfg.autoWork)) this.start();
    }
    const r = this.remaining();
    const mm = String(Math.floor(r / 60e3)).padStart(2, '0');
    const ss = String(Math.floor(r / 1000) % 60).padStart(2, '0');
    if (s.running) {
      const icon = s.mode === 'pomo' ? '🍅' : s.mode === 'stopwatch' ? '⏱' : '☕';
      this.bar.setText(`${icon} ${mm}:${ss}${s.pausedAt ? ' ⏸' : ''}${s.task ? ' · ' + s.task.slice(0, 24) : ''}`);
      this.bar.show();
    } else this.bar.hide();
    for (const fn of [...this.listeners]) {
      try { fn(true); } catch { /* a closed view */ }
    }
  }

  private chime(): void {
    if (!this.cfg.sound) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      [0, 0.22, 0.44].forEach((d, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = [660, 880, 990][i];
        g.gain.setValueAtTime(0.0001, ac.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d + 0.35);
        o.connect(g).connect(ac.destination);
        o.start(ac.currentTime + d);
        o.stop(ac.currentTime + d + 0.4);
      });
    } catch { /* no audio device */ }
  }

  destroy(): void { this.bar.remove(); }
}
