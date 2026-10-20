import { moment, normalizePath, Notice, TFile, type TAbstractFile } from 'obsidian';
import type DamaskStudio from '../../main';
import { readLocal, writeLocal } from '../../core/storage';
import { squash } from '../../core/task-line';
import { m, plain, t } from '../../i18n';
import type { Habit } from '../../settings/types';
import { timeZone, ttStamp, ttTime, type TickTickClient } from './client';
import { ConfirmModal } from '../../ui/modals';
import { parseQuickAdd } from './quick-add';
import {
  DONE_RE, FIELDS, fieldValue, fromTickTick, OPEN_RE, parseNote, render, safeName,
  type MirrorBlock, type MirrorRecord,
} from './mirror-format';
import type { TTProject, TTTask } from './types';

interface Baseline { rec: MirrorRecord; pid: string }
interface Pending { id: string; dir: 'toTT' | 'toObs'; title: string; pid: string; rec: MirrorRecord; path: string | null }
export interface TrashEntry { kind: 'task' | 'habit'; data: Partial<MirrorRecord> & Partial<Habit>; pid: string | null; list: string; why: string; at: number }

interface State {
  tasks: Record<string, Baseline>;
  projects: Record<string, { name: string; path: string; askDelete?: boolean }>;
  habits: Record<string, { name: string; goal: number; unit: string }>;
  ci: Record<string, Record<number, number | null>>;
  pending: Pending[];
  revive: Record<string, boolean>;
  trash: TrashEntry[];
}

interface Ops { f: TFile; set: Record<string, string[]>; remove: Set<string>; add: { lines: string[]; done: boolean }[]; fix: { line: string; lines: string[]; used?: boolean }[] }
interface Deletion { dir: 'toTT' | 'toObs'; id: string; rec: MirrorRecord; pid: string; f?: TFile; path?: string | null; t?: TTTask }

const KEY = 'dm-tt-mirror';
const MAX_SILENT_DELETES = 5;

/**
 * Two-way sync between TickTick and the vault.
 *
 * Tasks: one note per TickTick list. Lines use the task-line format with a
 * %%tt:ID%% marker. Habits: the daily-note habits are merged with TickTick
 * habits and daily values are synced with check-ins.
 *
 * Each pass does a field-level three-way merge against a baseline kept in
 * device storage. Deletions are logged and restorable, and a pass that would
 * delete more than a handful of tasks stops and asks first, because mass
 * deletes are almost always accidents (a paste over a section, a deleted file).
 */
export class TickTickMirror {
  st: State;
  running = false;
  lastRun = 0;
  status = '';
  removed = new Set<string>();
  private again: 'full' | 'local' | null = null;
  private self: Record<string, number> = {};
  private timer = 0;
  private changed = false;
  private asking = false;

  constructor(private plugin: DamaskStudio, private tt: TickTickClient) {
    this.st = { tasks: {}, projects: {}, habits: {}, ci: {}, pending: [], revive: {}, trash: [], ...(readLocal<State>(plugin.app, KEY) ?? {}) };
  }

  private get app() { return this.plugin.app; }
  get S() { return this.plugin.settings.ticktick.mirror; }
  get folder(): string { return normalizePath(this.S.folder || 'TickTick'); }
  get logPath(): string { return normalizePath(`${this.folder}/${t('ticktick.mirror.logName')}.md`); }

  save(): void { writeLocal(this.app, KEY, this.st); }
  inFolder(path: string): boolean { return path.startsWith(this.folder + '/') && path.endsWith('.md'); }
  private mark(path: string): void { this.self[path] = Date.now() + 2500; }
  /** true while the mirror itself is writing the file */
  isSelf(path: string): boolean { return (this.self[path] ?? 0) > Date.now(); }

  schedule(mode: 'local' | 'full' = 'local', ms = 2500): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.run(mode), ms);
  }

  files(): TFile[] {
    return this.app.vault.getMarkdownFiles().filter((f) => this.inFolder(f.path) && f.path !== this.logPath);
  }

  async run(mode: 'local' | 'full'): Promise<void> {
    if (!this.tt.active || (!this.S.on && !this.S.habits)) return;
    if (this.running || (this.tt.busy && mode !== 'full')) {
      this.again = mode === 'full' || this.again === 'full' ? 'full' : 'local';
      return;
    }
    this.running = true;
    this.changed = false;
    try {
      if (this.S.on) {
        await this.ensureFolder();
        await this.syncTasks(mode);
      }
      if (this.S.habits) await this.syncHabits(mode);
      this.lastRun = Date.now();
      this.status = '';
    } catch (e) {
      console.error('[Damask] TickTick mirror', e);
      this.status = (e as Error).message;
    }
    this.running = false;
    this.save();
    if (this.changed) this.tt.emit();
    if (this.again) {
      const next = this.again;
      this.again = null;
      window.setTimeout(() => void this.run(next), 600);
    }
  }

  private async ensureFolder(): Promise<void> {
    let cur = '';
    for (const part of this.folder.split('/')) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch { /* created meanwhile */ }
      }
    }
  }

  private async readNotes() {
    const out: { f: TFile; P: ReturnType<typeof parseNote> }[] = [];
    for (const f of this.files()) out.push({ f, P: parseNote(await this.app.vault.read(f)) });
    return out;
  }

  /* ------------------------------------------------------------ tasks */

  private async syncTasks(mode: 'local' | 'full'): Promise<void> {
    const C = this.tt.cache;
    const B = this.st.tasks;
    const full = mode === 'full';
    const fetched = new Set(C.fetchOk ?? []);
    const projects = this.tt.openProjects();

    const notes = await this.readNotes();
    const byPid: Record<string, (typeof notes)[number]> = {};
    for (const n of notes) if (n.P.pid && !byPid[n.P.pid]) byPid[n.P.pid] = n;

    // a note the user created in the folder becomes a new list
    for (const n of notes.filter((x) => !x.P.pid && x.P.blocks.length)) {
      try {
        const r = await this.tt.post<TTProject>('/project', { name: n.f.basename, kind: 'TASK', viewMode: 'list' });
        if (!r?.id) continue;
        C.projects.push(r);
        projects.push(r);
        fetched.add(r.id);
        n.P.pid = r.id;
        byPid[r.id] = n;
        this.st.projects[r.id] = { name: r.name, path: n.f.path };
        this.mark(n.f.path);
        await this.app.fileManager.processFrontMatter(n.f, (fm: Record<string, unknown>) => { fm.tt_project = r.id; fm.cssclasses = ['tt-mirror']; });
        void this.log(t('ticktick.mirror.log.newList'), r.name);
        this.changed = true;
      } catch (e) { console.error(e); }
    }

    // renames in either direction, and notes for lists that have none yet
    for (const p of projects) {
      const bp = this.st.projects[p.id];
      const n = byPid[p.id];
      if (!n) {
        if (bp?.askDelete) continue;
        await this.createNote(p);
        continue;
      }
      if (bp) {
        const fileName = n.f.basename;
        const fallback = t('ticktick.mirror.untitled');
        if (p.name !== bp.name && fileName === safeName(bp.name, fallback)) {
          const np = normalizePath(`${n.f.parent?.path ?? ''}/${safeName(p.name, fallback)}.md`);
          if (!this.app.vault.getAbstractFileByPath(np)) {
            this.mark(n.f.path);
            this.mark(np);
            await this.app.fileManager.renameFile(n.f, np);
          }
        } else if (fileName !== safeName(bp.name, fallback) && p.name === bp.name && !p.inbox) {
          try { await this.tt.post('/project/' + p.id, { name: fileName }); p.name = fileName; this.changed = true; } catch { /* keep old name */ }
        }
      }
      this.st.projects[p.id] = { ...(bp ?? {}), name: p.name, path: n.f.path, askDelete: false };
    }

    const notes2 = await this.readNotes();
    const fileOf: Record<string, TFile> = {};
    for (const n of notes2) if (n.P.pid && !fileOf[n.P.pid]) fileOf[n.P.pid] = n.f;

    // index both sides
    const obs: Record<string, { f: TFile; pid: string; b: MirrorBlock }> = {};
    const news: { f: TFile; pid: string; b: MirrorBlock; revive?: string | null }[] = [];
    const seen = new Set<string>();
    for (const n of notes2) {
      if (!n.P.pid) continue;
      for (const b of n.P.blocks) {
        if (b.id && !seen.has(b.id) && !this.st.revive[b.id]) { seen.add(b.id); obs[b.id] = { f: n.f, pid: n.P.pid, b }; }
        else news.push({ f: n.f, pid: n.P.pid, b, revive: b.id });
      }
    }
    const remote: Record<string, TTTask> = {};
    for (const x of C.tasks) if (!x.parentId && x.id && !String(x.id).startsWith('tmp')) remote[x.id] = x;
    const done: Record<string, TTTask> = {};
    for (const x of C.completed) if (!done[x.id]) done[x.id] = x;

    const ops: Record<string, Ops> = {};
    const op = (f: TFile): Ops => (ops[f.path] = ops[f.path] ?? { f, set: {}, remove: new Set(), add: [], fix: [] });
    const dels: Deletion[] = [];
    const pend = new Set(this.st.pending.map((x) => x.id));
    const ids = new Set([...Object.keys(B), ...Object.keys(obs), ...Object.keys(remote)]);

    for (const id of ids) {
      if (pend.has(id)) continue;
      const b = B[id];
      const o = obs[id];
      let x = remote[id];
      if (o && !x) {
        const dn = done[id];
        if (dn) {
          // completed in TickTick
          if (o.b.rec.s !== 2 && !(b && b.rec.s === 2)) {
            const r = fromTickTick(dn);
            r.s = 2;
            op(o.f).set[id] = render(id, r);
            B[id] = { rec: r, pid: o.pid };
          } else if (b && b.rec.s === 2 && o.b.rec.s === 0) await this.reopen(id, o.pid, o.b.rec);
          else B[id] = { rec: o.b.rec, pid: o.pid };
          continue;
        }
        if (o.b.rec.s === 2 && b && b.rec.s === 2) { B[id] = { rec: o.b.rec, pid: o.pid }; continue; }
        if (this.removed.has(id)) { if (b) dels.push({ dir: 'toObs', id, f: o.f, rec: o.b.rec, pid: o.pid }); continue; }
        // a task missing from the open list may simply not have been fetched; only a full pass checks
        if (!full) continue;
        if (!fetched.has(o.pid) && !(b && fetched.has(b.pid))) continue;
        const chk = (await this.tt.get<TTTask>(`/project/${o.pid}/task/${id}`).catch(() => null))
          ?? (b && b.pid !== o.pid ? await this.tt.get<TTTask>(`/project/${b.pid}/task/${id}`).catch(() => null) : null);
        if (chk?.id && !chk.deleted && chk.status === 2) {
          const r = fromTickTick(chk);
          op(o.f).set[id] = render(id, r);
          B[id] = { rec: r, pid: chk.projectId || o.pid };
          continue;
        }
        if (chk?.id && !chk.deleted && chk.status === 0) { x = chk; C.tasks.push(chk); }
        else {
          if (b) dels.push({ dir: 'toObs', id, f: o.f, rec: o.b.rec, pid: o.pid });
          else news.push({ f: o.f, pid: o.pid, b: o.b, revive: id });
          continue;
        }
      }
      if (!o && x) {
        if (b && b.rec.s !== 2) { dels.push({ dir: 'toTT', id, t: x, rec: b.rec, pid: x.projectId }); continue; }
        const f = fileOf[x.projectId];
        if (!f) continue;
        const r = fromTickTick(x);
        op(f).add.push({ lines: render(id, r), done: false });
        B[id] = { rec: r, pid: x.projectId };
        continue;
      }
      if (!o && !x) { if (b) delete B[id]; continue; }

      // both sides have it: merge field by field against the baseline
      const ro = o.b.rec;
      const rt = fromTickTick(x);
      const rb = b?.rec ?? null;
      const res = {} as MirrorRecord;
      let push = false;
      let write = false;
      for (const k of FIELDS) {
        const vo = JSON.stringify(fieldValue(ro, k));
        const vt = JSON.stringify(fieldValue(rt, k));
        const vb = rb ? JSON.stringify(fieldValue(rb, k)) : null;
        if (vo === vt) (res as unknown as Record<string, unknown>)[k] = k === 'i' ? this.mergeItems(ro.i, rt.i) : ro[k];
        else if (rb && vo === vb) { (res as unknown as Record<string, unknown>)[k] = rt[k]; write = true; }
        else { (res as unknown as Record<string, unknown>)[k] = ro[k]; push = true; }
      }
      if (ro.i.some((it) => !it.id)) write = true;
      res.rep = rt.rep;
      res.cd = res.s === 2 ? ro.cd || moment().locale('en').format('YYYY-MM-DD') : '';

      let pid = x.projectId;
      if (o.pid !== x.projectId) {
        if (b && b.pid === x.projectId) {
          // moved to another list note in the vault
          try {
            await this.tt.post('/task/move', [{ fromProjectId: x.projectId, toProjectId: o.pid, taskId: id }]);
            x.projectId = pid = o.pid;
            this.changed = true;
            void this.log(t('ticktick.mirror.log.moved'), x.title);
          } catch { /* retried next pass */ }
        } else if (fileOf[x.projectId]) {
          // moved in TickTick
          op(o.f).remove.add(id);
          op(fileOf[x.projectId]).add.push({ lines: render(id, res), done: res.s === 2 });
          write = false;
        }
      }
      if (push) {
        const wasRepeating = !!x.repeatFlag;
        const r = await this.pushTask(id, x, res);
        if (r) {
          const nr = fromTickTick(r);
          if (res.s === 2 && wasRepeating && nr.s === 0) {
            Object.assign(res, { s: 0, cd: '', d: nr.d, h: nr.h });
            void this.log(t('ticktick.mirror.log.repeated'), res.t);
          } else if (res.s !== 2) Object.assign(res, { d: nr.d, h: nr.h });
          res.i = nr.i.length || !res.i.length ? nr.i : res.i;
          res.rep = nr.rep;
          write = true;
        }
      }
      if (write || (res.s === 2) !== o.b.inDone) op(o.f).set[id] = render(id, res);
      B[id] = { rec: res, pid };
    }

    // new lines typed in the vault
    for (const nw of news) {
      let rec = nw.b.rec;
      let pid = nw.pid;
      if (!nw.b.formatted) {
        const q = parseQuickAdd(rec.t, C.projects);
        rec = { ...rec, t: q.title || rec.t, p: q.priority ?? rec.p, g: [...rec.g, ...q.tags] };
        if (q.dueDate) { rec.d = q.dueDate.clone().locale('en').format('YYYY-MM-DD'); rec.h = q.isAllDay === false ? q.dueDate.format('HH:mm') : ''; }
        if (q.projectId) pid = q.projectId;
      }
      if (!rec.t) continue;
      const body = this.toBody(rec, { projectId: pid });
      try {
        const r = await this.tt.post<TTTask>('/task', body);
        if (!r?.id) continue;
        C.tasks.push(r);
        this.changed = true;
        const nr = fromTickTick(r);
        if (rec.s === 2) {
          await this.tt.post(`/project/${r.projectId}/task/${r.id}/complete`).catch(() => null);
          nr.s = 2;
          nr.cd = moment().locale('en').format('YYYY-MM-DD');
          C.tasks = C.tasks.filter((y) => y !== r);
          C.completed.unshift({ ...r, status: 2, completedTime: ttTime(moment()) });
        }
        if (nw.revive) delete this.st.revive[nw.revive];
        const target = pid !== nw.pid && fileOf[pid] ? fileOf[pid] : nw.f;
        if (target === nw.f) op(nw.f).fix.push({ line: nw.b.line, lines: render(r.id, nr) });
        else {
          op(nw.f).fix.push({ line: nw.b.line, lines: [] });
          op(target).add.push({ lines: render(r.id, nr), done: nr.s === 2 });
        }
        B[r.id] = { rec: nr, pid: r.projectId };
      } catch (e) { console.error('[Damask] mirror create', e); }
    }

    if (dels.length > MAX_SILENT_DELETES) {
      this.st.pending = [...this.st.pending, ...dels.map((d) => ({ id: d.id, dir: d.dir, title: d.rec.t, pid: d.pid, rec: d.rec, path: d.f?.path ?? null }))];
      this.askPending();
    } else for (const d of dels) await this.applyDelete(d, op);

    if (full) {
      const keep = this.S.keepDone || 7;
      const limit = moment().subtract(keep, 'days').locale('en').format('YYYY-MM-DD');
      for (const n of notes2) for (const b of n.P.blocks) {
        if (b.id && b.rec.s === 2 && b.rec.cd && b.rec.cd < limit && !ops[n.f.path]?.set[b.id]) {
          op(n.f).remove.add(b.id);
          delete B[b.id];
        }
      }
    }

    for (const o of Object.values(ops)) {
      if (!Object.keys(o.set).length && !o.remove.size && !o.add.length && !o.fix.length) continue;
      this.mark(o.f.path);
      await this.app.vault.process(o.f, (text) => this.apply(text, o));
    }
    this.removed.clear();
  }

  private mergeItems(a: MirrorRecord['i'], b: MirrorRecord['i']): MirrorRecord['i'] {
    const ids: Record<string, string | null | undefined> = {};
    for (const x of b ?? []) ids[`${x.t}|${x.s}`] = x.id;
    return (a ?? []).map((x) => ({ ...x, id: x.id || ids[`${x.t}|${x.s}`] }));
  }

  private toBody(r: MirrorRecord, base: Partial<TTTask>): Partial<TTTask> {
    const body: Partial<TTTask> = { ...base, title: r.t, priority: r.p || 0, tags: r.g ?? [], timeZone: base.timeZone || timeZone() };
    body.items = (r.i ?? []).map((x) => ({ ...(x.id ? { id: x.id } : {}), title: x.t, status: x.s ? 1 : 0 }));
    if (r.d) {
      const when = r.h ? moment(`${r.d} ${r.h}`, 'YYYY-MM-DD HH:mm') : moment(r.d, 'YYYY-MM-DD');
      body.dueDate = ttTime(when);
      body.startDate = ttTime(when);
      body.isAllDay = !r.h;
    } else {
      body.dueDate = null;
      body.startDate = null;
    }
    return body;
  }

  private async pushTask(id: string, x: TTTask, res: MirrorRecord): Promise<TTTask | null> {
    try {
      const body = this.toBody(res, { id, projectId: x.projectId, timeZone: x.timeZone });
      if (x.content != null) body.content = x.content;
      if (x.desc != null) body.desc = x.desc;
      if (x.repeatFlag) body.repeatFlag = x.repeatFlag;
      if (x.reminders) body.reminders = x.reminders;
      if (res.s === 0 && x.status === 2) body.status = 0;
      let r = await this.tt.post<TTTask>('/task/' + id, body);
      if (r) Object.assign(x, r);
      if (res.s === 2 && x.status !== 2) {
        await this.tt.post(`/project/${x.projectId}/task/${id}/complete`);
        if (x.repeatFlag) {
          r = await this.tt.get<TTTask>(`/project/${x.projectId}/task/${id}`).catch(() => null);
          if (r) Object.assign(x, r);
        } else {
          this.tt.cache.tasks = this.tt.cache.tasks.filter((y) => y !== x);
          this.tt.cache.completed.unshift({ ...x, status: 2, completedTime: ttTime(moment()) });
        }
      }
      this.changed = true;
      return r ?? x;
    } catch (e) {
      new Notice(t('ticktick.mirror.syncFailed', { title: res.t, error: (e as Error).message }));
      return null;
    }
  }

  private async reopen(id: string, pid: string, rec: MirrorRecord): Promise<void> {
    try {
      const r = await this.tt.post<TTTask>('/task/' + id, { id, projectId: pid, status: 0 });
      if (r) {
        this.tt.cache.tasks.push(r);
        this.tt.cache.completed = this.tt.cache.completed.filter((x) => x.id !== id);
      }
      this.st.tasks[id] = { rec, pid };
      this.changed = true;
    } catch { /* retried next pass */ }
  }

  private async applyDelete(d: Deletion, op: ((f: TFile) => Ops) | null): Promise<void> {
    const B = this.st.tasks;
    if (d.dir === 'toTT') {
      try {
        await this.tt.del(`/project/${d.pid}/task/${d.id}`);
        this.tt.cache.tasks = this.tt.cache.tasks.filter((x) => x.id !== d.id);
        this.changed = true;
        this.trash('task', d.rec, d.pid, t('ticktick.mirror.why.deletedInVault'));
        delete B[d.id];
      } catch (e) { console.error(e); }
      return;
    }
    const f = d.f ?? (d.path ? this.app.vault.getAbstractFileByPath(d.path) : null);
    if (f instanceof TFile && op) op(f).remove.add(d.id);
    else if (f instanceof TFile) {
      this.mark(f.path);
      await this.app.vault.process(f, (text) => this.apply(text, { f, set: {}, remove: new Set([d.id]), add: [], fix: [] }));
    }
    this.trash('task', d.rec, d.pid, t('ticktick.mirror.why.deletedInTickTick'));
    delete B[d.id];
  }

  /** Rewrite a note: replace or drop blocks by id, settle new lines, keep the open/done sections honest. */
  private apply(text: string, o: Ops): string {
    const P = parseNote(text);
    let L = text.split('\n');
    const repl = new Map<number, { end: number; lines: string[] }>();
    const toDone: string[][] = [];
    const toOpen: string[][] = [];
    const isDone = (lines: string[]) => /^- \[x\]/.test(lines[0] ?? '');
    for (const b of P.blocks) {
      if (b.id && o.remove.has(b.id)) { repl.set(b.start, { end: b.end, lines: [] }); continue; }
      if (b.id && o.set[b.id]) {
        const lines = o.set[b.id];
        if (isDone(lines) && !b.inDone) { repl.set(b.start, { end: b.end, lines: [] }); toDone.push(lines); }
        else if (!isDone(lines) && b.inDone) { repl.set(b.start, { end: b.end, lines: [] }); toOpen.push(lines); }
        else repl.set(b.start, { end: b.end, lines });
        continue;
      }
      if (!b.id || this.st.revive[b.id]) {
        const fx = o.fix.find((x) => !x.used && x.line === b.line);
        if (!fx) continue;
        fx.used = true;
        if (isDone(fx.lines) && !b.inDone) { repl.set(b.start, { end: b.end, lines: [] }); toDone.push(fx.lines); }
        else repl.set(b.start, { end: b.end, lines: fx.lines });
      }
    }
    const out: string[] = [];
    for (let i = 0; i < L.length; i++) {
      const r = repl.get(i);
      if (r) { out.push(...r.lines); i = r.end; } else out.push(L[i]);
    }
    L = out;
    for (const a of o.add) (a.done ? toDone : toOpen).push(a.lines);
    if (!toOpen.length && !toDone.length) return L.join('\n');
    let oi = L.findIndex((l) => OPEN_RE.test(l));
    let di = L.findIndex((l) => DONE_RE.test(l));
    if (oi < 0) { L.push('', '## ' + t('ticktick.mirror.openHeading')); oi = L.length - 1; di = L.findIndex((l) => DONE_RE.test(l)); }
    if (di < 0) {
      while (L.length && !L[L.length - 1].trim()) L.pop();
      L.push('', '## ' + t('ticktick.mirror.doneHeading'));
      di = L.length - 1;
    }
    if (toDone.length) L.splice(di + 1, 0, ...toDone.flat());
    if (toOpen.length) {
      let end = di > oi ? di : L.length;
      while (end > oi + 1 && !L[end - 1].trim()) end--;
      L.splice(end, 0, ...toOpen.flat());
    }
    return L.join('\n');
  }

  private async createNote(p: TTProject): Promise<void> {
    const name = p.inbox ? t('ticktick.inbox') : p.name;
    const path = normalizePath(`${this.folder}/${safeName(name, t('ticktick.mirror.untitled'))}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      this.mark(path);
      await this.app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => { fm.tt_project = p.id; });
      this.st.projects[p.id] = { name: p.name, path };
      return;
    }
    const far = moment().add(10, 'y');
    const open = this.tt.cache.tasks
      .filter((x) => x.projectId === p.id && !x.parentId)
      .sort((a, b) => (this.tt.due(a) ?? far).valueOf() - (this.tt.due(b) ?? far).valueOf());
    const limit = moment().subtract(this.S.keepDone || 7, 'days');
    const recent = this.tt.cache.completed.filter((x) => x.projectId === p.id && moment(x.completedTime).isAfter(limit));
    const L = [
      '---', `tt_project: ${p.id}`, 'cssclasses: [tt-mirror]', '---',
      `> [!info] ${plain(t('ticktick.mirror.noteTitle', { name: p.name }))}`,
      `> ${t('ticktick.mirror.noteHelp')}`,
      '', '## ' + t('ticktick.mirror.openHeading'),
    ];
    for (const x of open) {
      const r = fromTickTick(x);
      L.push(...render(x.id, r));
      this.st.tasks[x.id] = { rec: r, pid: p.id };
    }
    L.push('', '## ' + t('ticktick.mirror.doneHeading'));
    for (const x of recent) {
      if (this.st.tasks[x.id] || open.find((y) => y.id === x.id)) continue;
      const r = fromTickTick(x);
      r.s = 2;
      L.push(...render(x.id, r));
      this.st.tasks[x.id] = { rec: r, pid: p.id };
    }
    this.mark(path);
    await this.app.vault.create(path, L.join('\n') + '\n');
    this.st.projects[p.id] = { name: p.name, path };
  }

  /** The user deleted a list note: ask whether the list should go too. */
  onNoteDeleted(file: TAbstractFile): void {
    const pid = Object.keys(this.st.projects).find((k) => this.st.projects[k].path === file.path);
    if (!pid) return;
    const p = this.tt.project(pid);
    if (!p) return;
    this.st.projects[pid].askDelete = true;
    this.save();
    const count = this.tt.cache.tasks.filter((x) => x.projectId === pid).length;
    new ConfirmModal(this.app, {
      title: t('ticktick.mirror.noteDeleted.title', { name: p.name }),
      text: t('ticktick.mirror.noteDeleted.text', { count }),
      buttons: [
        [t('ticktick.mirror.noteDeleted.deleteList'), 'mod-warning', async () => {
          for (const x of this.tt.cache.tasks.filter((y) => y.projectId === pid)) {
            this.trash('task', fromTickTick(x), pid, t('ticktick.mirror.why.withList', { name: p.name }));
            delete this.st.tasks[x.id];
          }
          await this.tt.deleteProject(p);
          delete this.st.projects[pid];
          void this.log(t('ticktick.mirror.log.listDeleted'), p.name);
          this.save();
        }],
        [t('ticktick.mirror.noteDeleted.recreate'), 'mod-cta', () => {
          this.st.projects[pid].askDelete = false;
          for (const x of this.tt.cache.tasks.filter((y) => y.projectId === pid)) delete this.st.tasks[x.id];
          this.save();
          void this.run('local');
        }],
      ],
    }).open();
  }

  askPending(): void {
    const P = this.st.pending;
    if (!P.length || this.asking) return;
    this.asking = true;
    const toTT = P.filter((x) => x.dir === 'toTT').length;
    const toObs = P.length - toTT;
    const text = [
      toTT ? t('ticktick.mirror.pending.toTT', { count: toTT }) : '',
      toObs ? t('ticktick.mirror.pending.toObs', { count: toObs }) : '',
      t('ticktick.mirror.pending.why'),
    ].filter(Boolean).join('\n');
    new ConfirmModal(this.app, {
      title: t('ticktick.mirror.pending.title', { count: P.length }),
      text,
      list: P.slice(0, 30).map((x) => (x.dir === 'toTT' ? '→ TickTick: ' : '→ Obsidian: ') + x.title),
      buttons: [
        [t('ticktick.mirror.pending.apply'), 'mod-warning', async () => {
          const list = this.st.pending;
          this.st.pending = [];
          for (const d of list) await this.applyDelete(d, null);
          this.save();
          this.tt.emit();
        }],
        [t('ticktick.mirror.pending.keep'), 'mod-cta', () => {
          const list = this.st.pending;
          this.st.pending = [];
          for (const d of list) {
            if (d.dir === 'toObs') this.st.revive[d.id] = true;
            delete this.st.tasks[d.id];
          }
          this.save();
          void this.run('full');
        }],
      ],
      onClose: () => { this.asking = false; },
    }).open();
  }

  resetAsking(): void { this.asking = false; }

  /* ------------------------------------------------------------ habits */

  private get defs(): Habit[] { return this.plugin.settings.habits; }

  private async syncHabits(mode: 'local' | 'full'): Promise<void> {
    const C = this.tt.cache;
    const H = this.st.habits;
    const defs = this.defs;
    if (mode === 'full' && C.habitsOk) {
      const live = C.habits;
      for (const d of defs) {
        if (d.tt) continue;
        const match = live.find((h) => squash(h.name) === squash(d.name) && !defs.some((x) => x.tt === h.id));
        if (match) d.tt = match.id;
        else {
          const r = await this.tt.post<{ id: string }>('/habit', this.habitBody(d)).catch(() => null);
          if (r?.id) { d.tt = r.id; void this.log(t('ticktick.mirror.log.newHabitTT'), d.name); }
        }
        if (d.tt) { H[d.key] = this.signature(d); this.changed = true; }
      }
      for (const h of live) {
        if (defs.some((d) => d.tt === h.id)) continue;
        const bool = (h.type || 'Boolean') === 'Boolean';
        const d: Habit = {
          key: 'h_' + String(h.id).slice(-6), name: h.name, icon: 'repeat', tt: h.id,
          ...(bool ? { bool: true } : { unit: h.unit && h.unit !== 'Count' ? h.unit : '', goal: h.goal || 1, step: h.step || 1, max: Math.max(10, (h.goal || 1) * 4), better: 'more' as const }),
        };
        defs.push(d);
        H[d.key] = this.signature(d);
        void this.log(t('ticktick.mirror.log.newHabitVault'), h.name);
        this.changed = true;
      }
      for (const d of [...defs]) {
        if (!d.tt) continue;
        const h = live.find((x) => x.id === d.tt);
        if (!h) {
          if (H[d.key]) {
            defs.splice(defs.indexOf(d), 1);
            delete H[d.key];
            this.trash('habit', { ...d }, null, t('ticktick.mirror.why.habitGone'));
            this.changed = true;
          }
          continue;
        }
        const base = H[d.key];
        const remote = { name: h.name, goal: h.goal || 1 };
        const local = this.signature(d);
        if (base) {
          if (remote.name !== base.name && local.name === base.name) d.name = h.name;
          if (!d.bool && remote.goal !== base.goal && local.goal === base.goal) d.goal = h.goal;
          if (local.name !== base.name || (!d.bool && local.goal !== base.goal)) {
            await this.tt.post('/habit/' + d.tt, { name: d.name, goal: d.bool ? 1 : d.goal, unit: d.bool ? 'Count' : d.unit || 'Count' }).catch(() => null);
          }
        }
        H[d.key] = this.signature(d);
      }
      await this.plugin.saveSettings();
    }

    // daily-note values <-> check-ins, last 14 days
    for (const d of defs) {
      if (!d.tt) continue;
      const base = (this.st.ci[d.key] = this.st.ci[d.key] ?? {});
      const ci = (C.checkins[d.tt] = C.checkins[d.tt] ?? {});
      for (let i = 0; i < 14; i++) {
        const day = moment().subtract(i, 'days');
        const stamp = ttStamp(day);
        const file = this.plugin.paths.dailyFile(day);
        const fm = file ? (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) : null;
        const ov = fm ? vaultValue(d, fm[d.key]) : undefined;
        const c = ci[stamp];
        const tv = c ? (d.bool ? (c.status === 2 || (c.value ?? 0) >= (c.goal ?? 1) ? 1 : 0) : c.value == null ? null : Number(c.value)) : null;
        const bv = base[stamp];
        const eq = (a: unknown, b: unknown) => Number(a ?? 0) === Number(b ?? 0);
        if (ov === undefined) { if (tv != null) base[stamp] = tv; continue; }
        if (eq(ov, tv)) { base[stamp] = ov; continue; }
        const toVault = bv !== undefined && eq(ov, bv) ? true : bv !== undefined && eq(tv, bv) ? false : ov == null;
        if (toVault) {
          if (tv == null || !file) { base[stamp] = ov; continue; }
          this.mark(file.path);
          await this.app.fileManager.processFrontMatter(file, (x: Record<string, unknown>) => { x[d.key] = d.bool ? tv === 1 : tv; });
          base[stamp] = tv;
        } else {
          const v = Number(ov ?? 0);
          const goal = d.bool ? 1 : d.goal || 1;
          const ok = d.bool ? v === 1 : d.better === 'less' ? v <= goal : v >= goal;
          const body = { stamp, value: d.bool ? (ok ? 1 : 0) : v, goal, status: ok ? 2 : 0, opTime: ttTime(moment()) };
          try {
            await this.tt.post(`/habit/${d.tt}/checkin`, body);
            ci[stamp] = { ...body };
            base[stamp] = ov;
          } catch { /* retried next pass */ }
        }
        this.changed = true;
      }
    }
  }

  private signature(d: Habit) { return { name: d.name, goal: d.bool ? 1 : d.goal || 1, unit: d.unit || '' }; }

  habitBody(d: Habit) {
    return d.bool
      ? { name: d.name, type: 'Boolean', goal: 1, step: 1, unit: 'Count', repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=1', recordEnable: false }
      : {
        name: d.name, type: 'Real', goal: d.goal || 1, step: d.step || 1, unit: d.unit || 'Count', repeatRule: 'RRULE:FREQ=DAILY;INTERVAL=1', recordEnable: false,
        encouragement: d.better === 'less' ? t('habits.lessGoal', { goal: d.goal ?? 1, unit: d.unit ?? '' }) : '',
      };
  }

  /** Called by the habits manager after an edit. */
  async pushHabit(d: Habit): Promise<void> {
    if (!this.tt.active || !this.S.habits) return;
    try {
      if (!d.tt) {
        const r = await this.tt.post<{ id: string }>('/habit', this.habitBody(d));
        if (r?.id) d.tt = r.id;
      } else {
        await this.tt.post('/habit/' + d.tt, { name: d.name, goal: d.bool ? 1 : d.goal, step: d.step || 1, unit: d.bool ? 'Count' : d.unit || 'Count', type: d.bool ? 'Boolean' : 'Real' });
      }
      this.st.habits[d.key] = this.signature(d);
      this.save();
    } catch (e) {
      new Notice(t('habits.pushFailed', { error: (e as Error).message }));
    }
  }

  async archiveHabit(d: Habit): Promise<void> {
    if (d.tt && this.tt.active) {
      try {
        await this.tt.post('/habit/' + d.tt, { status: 1 });
        this.tt.cache.habits = this.tt.cache.habits.filter((h) => h.id !== d.tt);
      } catch (e) {
        new Notice(t('habits.archiveFailed', { error: (e as Error).message }));
      }
    }
    delete this.st.habits[d.key];
    this.trash('habit', { ...d }, null, t('ticktick.mirror.why.habitDeleted'));
  }

  /* ------------------------------------------------------------ log + trash */

  trash(kind: TrashEntry['kind'], data: TrashEntry['data'], pid: string | null, why: string): void {
    const p = pid ? this.tt.project(pid) : null;
    this.st.trash.unshift({ kind, data, pid, list: p?.name ?? '', why, at: Date.now() });
    this.st.trash = this.st.trash.slice(0, 300);
    this.save();
    void this.log(why, (data.t || data.name || '') + (p ? ` — ${p.name}` : ''));
  }

  private async log(what: string, title: string): Promise<void> {
    try {
      const line = plain(`- ${m().locale('en').format('YYYY-MM-DD HH:mm')} · ${what}: «${title}»`);
      let f = this.app.vault.getAbstractFileByPath(this.logPath);
      if (!(f instanceof TFile)) {
        await this.ensureFolder();
        f = await this.app.vault.create(this.logPath, `---\ncssclasses: [tt-mirror]\n---\n# ${t('ticktick.mirror.logName')}\n${t('ticktick.mirror.logIntro')}\n\n`);
      }
      this.mark(this.logPath);
      if (f instanceof TFile) await this.app.vault.process(f, (s) => s.replace(/\s*$/, '\n') + line + '\n');
    } catch { /* the log is best effort */ }
  }

  async restore(entry: TrashEntry): Promise<void> {
    try {
      if (entry.kind === 'task') {
        const pid = this.tt.project(entry.pid ?? undefined) ? entry.pid! : this.tt.defaultProjectId();
        const data = entry.data as MirrorRecord;
        const r: MirrorRecord = { ...data, s: 0, i: (data.i ?? []).map((x) => ({ t: x.t, s: x.s })) };
        const x = await this.tt.post<TTTask>('/task', this.toBody(r, { projectId: pid }));
        if (x) this.tt.cache.tasks.push(x);
      } else {
        const d = { ...(entry.data as Habit) };
        if (d.tt) await this.tt.post('/habit/' + d.tt, { status: 0 }).catch(() => { d.tt = null; });
        if (!this.defs.some((x) => x.key === d.key)) this.defs.push(d);
        await this.pushHabit(d);
        await this.plugin.saveSettings();
      }
      this.st.trash.splice(this.st.trash.indexOf(entry), 1);
      this.save();
      void this.log(t('ticktick.mirror.log.restored'), String(entry.data.t || entry.data.name || ''));
      new Notice(t('ticktick.mirror.restored'));
      await this.tt.sync({ full: false });
    } catch (e) {
      new Notice(t('ticktick.mirror.restoreFailed', { error: (e as Error).message }));
    }
  }
}

function vaultValue(d: Habit, v: unknown): number | null {
  if (d.bool) return v === true ? 1 : v === false ? 0 : null;
  return v == null || v === '' ? null : Number(v);
}
