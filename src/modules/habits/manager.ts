import { handler } from '../../core/dom';
import { Modal, Notice, Setting, type App } from 'obsidian';
import type DamasceneStudio from '../../main';
import { dir, formatNumber, t } from '../../i18n';
import type { Habit } from '../../settings/types';

/** Add, edit and remove the habits tracked in daily-note properties. */
export class HabitsManagerModal extends Modal {
  constructor(app: App, private plugin: DamasceneStudio) { super(app); }

  onOpen(): void { this.draw(); }
  onClose(): void { this.contentEl.empty(); }

  private get synced(): boolean {
    return !!this.plugin.ticktick?.active && this.plugin.settings.ticktick.mirror.habits;
  }

  private draw(): void {
    const c = this.contentEl;
    c.empty();
    c.addClass('tt-root', 'tm-habits');
    c.setAttr('dir', dir());
    c.createEl('h3', { text: t('habits.manager.title') });
    c.createEl('p', { cls: 'qh-muted', text: this.synced ? t('habits.manager.synced') : t('habits.manager.local') });
    const list = c.createDiv('tm-hlist');
    for (const d of this.plugin.settings.habits) {
      const r = list.createDiv('tm-hrow');
      const n = r.createDiv('tm-hname');
      n.createDiv({ text: d.name });
      const goal = d.bool ? t('habits.yesNo') : `${d.better === 'less' ? '≤' : '≥'} ${formatNumber(d.goal ?? 1)} ${d.unit ?? ''}`;
      n.createDiv({ cls: 'qh-row-meta', text: [goal, d.key, d.tt ? t('habits.linked') : ''].filter(Boolean).join(' · ') });
      r.createEl('button', { text: t('common.edit') }).addEventListener('click', () => this.edit(d, false));
      const del = r.createEl('button', { text: t('common.delete'), cls: 'tt-danger' });
      del.addEventListener('click', handler(async () => {
        if (!del.hasClass('is-armed')) { del.addClass('is-armed'); del.setText(t('common.confirmDelete')); return; }
        await this.remove(d);
        this.draw();
      }));
    }
    if (!this.plugin.settings.habits.length) c.createDiv({ cls: 'qh-empty', text: t('habits.manager.empty') });
    c.createEl('button', { cls: 'mod-cta', text: t('habits.manager.add') })
      .addEventListener('click', () => this.edit({ key: '', name: '', unit: '', goal: 1, step: 1, max: 10, icon: 'repeat', better: 'more' }, true));
  }

  private edit(d: Habit, isNew: boolean): void {
    const c = this.contentEl;
    c.empty();
    c.createEl('h3', { text: isNew ? t('habits.manager.newTitle') : t('habits.manager.editTitle', { name: d.name }) });
    const v: Habit = { ...d };
    new Setting(c).setName(t('habits.fields.name')).addText((x) => x.setValue(v.name).onChange((s) => { v.name = s; }));
    new Setting(c).setName(t('habits.fields.kind')).addDropdown((x) => x
      .addOption('num', t('habits.fields.kindNumber'))
      .addOption('bool', t('habits.yesNo'))
      .setValue(v.bool ? 'bool' : 'num')
      .onChange((s) => { v.bool = s === 'bool'; }));
    new Setting(c).setName(t('habits.fields.goal')).setDesc(t('habits.fields.goalDesc')).addText((x) => x.setValue(String(v.goal ?? 1)).onChange((s) => { v.goal = Number(s) || 1; }));
    new Setting(c).setName(t('habits.fields.unit')).addText((x) => x.setValue(v.unit ?? '').onChange((s) => { v.unit = s; }));
    new Setting(c).setName(t('habits.fields.step')).setDesc(t('habits.fields.stepDesc')).addText((x) => x.setValue(String(v.step ?? 1)).onChange((s) => { v.step = Number(s) || 1; }));
    new Setting(c).setName(t('habits.fields.direction')).addDropdown((x) => x
      .addOption('more', t('habits.fields.more'))
      .addOption('less', t('habits.fields.less'))
      .setValue(v.better ?? 'more')
      .onChange((s) => { v.better = s as Habit['better']; }));
    new Setting(c).setName(t('habits.fields.icon')).setDesc(t('habits.fields.iconDesc')).addText((x) => x.setValue(v.icon).onChange((s) => { v.icon = s.trim() || 'repeat'; }));
    if (isNew) {
      new Setting(c).setName(t('habits.fields.key')).setDesc(t('habits.fields.keyDesc'))
        .addText((x) => x.setValue(v.key).onChange((s) => { v.key = s.trim().replace(/\s+/g, '_'); }));
    }
    const row = c.createDiv('tt-ed-foot');
    row.createEl('button', { cls: 'mod-cta', text: t('common.save') }).addEventListener('click', handler(async () => {
      if (!v.name.trim()) return;
      if (isNew && !v.key) v.key = 'h_' + Date.now().toString(36);
      if (isNew && this.plugin.settings.habits.some((x) => x.key === v.key)) { new Notice(t('habits.keyTaken')); return; }
      if (v.bool) { delete v.unit; v.goal = 1; } else delete v.bool;
      v.max = Math.max(v.max ?? 0, (v.goal ?? 1) * 4);
      if (isNew) this.plugin.settings.habits.push(v);
      else { for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, v); }
      await this.plugin.ticktickMirror?.pushHabit(isNew ? v : d);
      await this.plugin.saveSettings();
      this.plugin.refreshHomes();
      this.draw();
    }));
    row.createEl('button', { text: t('common.back') }).addEventListener('click', () => this.draw());
  }

  private async remove(d: Habit): Promise<void> {
    const defs = this.plugin.settings.habits;
    defs.splice(defs.indexOf(d), 1);
    await this.plugin.ticktickMirror?.archiveHabit(d);
    await this.plugin.saveSettings();
    this.plugin.refreshHomes();
  }
}
