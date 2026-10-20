import { handler } from '../core/dom';
import { Modal, Setting, type App } from 'obsidian';
import type DamaskStudio from '../main';
import { dir, LANGUAGES, setLanguage, t } from '../i18n';
import { STARTER_HABITS } from '../settings/defaults';
import type { ModuleId } from '../settings/types';
import { createHomeNote } from './studio';
import { TICKTICK } from '../integrations/ticktick/client';

/** First run: language, which parts to use, and an optional home note. */
export class OnboardingModal extends Modal {
  private step = 0;
  private makeHome = true;
  private addHabits = true;

  constructor(app: App, private plugin: DamaskStudio) { super(app); }

  onOpen(): void {
    this.modalEl.addClass('vs-modal', 'dm-onboarding');
    this.draw();
  }

  private draw(): void {
    const c = this.contentEl;
    const S = this.plugin.settings;
    c.empty();
    c.setAttr('dir', dir());
    c.createDiv({ cls: 'vs-muted', text: t('onboarding.step', { n: this.step + 1, total: 3 }) });

    if (this.step === 0) {
      c.createEl('h2', { text: t('onboarding.welcome') });
      c.createEl('p', { text: t('onboarding.intro') });
      new Setting(c).setName(t('studio.vault.language')).addDropdown((d) => {
        d.addOption('auto', t('studio.vault.followObsidian'));
        for (const l of LANGUAGES) d.addOption(l.code, l.native);
        d.setValue(S.language).onChange((v) => { S.language = v; setLanguage(v); this.draw(); });
      });
    } else if (this.step === 1) {
      c.createEl('h2', { text: t('onboarding.modules') });
      c.createEl('p', { cls: 'vs-muted', text: t('onboarding.modulesDesc') });
      for (const id of ['home', 'inserter', 'embeds', 'folders', 'variants', 'pomodoro', 'health'] as ModuleId[]) {
        new Setting(c).setName(t(`studio.modules.items.${id}.name`)).setDesc(t(`studio.modules.items.${id}.desc`))
          .addToggle((x) => x.setValue(S.modules[id]).onChange((v) => { S.modules[id] = v; }));
      }
      new Setting(c).setName(TICKTICK).setDesc(t('onboarding.ticktick'))
        .addToggle((x) => x.setValue(S.integrations.ticktick).onChange((v) => { S.integrations.ticktick = v; }));
    } else {
      c.createEl('h2', { text: t('onboarding.home') });
      c.createEl('p', { cls: 'vs-muted', text: t('onboarding.homeDesc') });
      if (!this.plugin.paths.homeFile()) {
        new Setting(c).setName(t('onboarding.createHome')).setDesc(this.plugin.paths.home).addToggle((x) => x.setValue(this.makeHome).onChange((v) => { this.makeHome = v; }));
      }
      if (!S.habits.length) {
        new Setting(c).setName(t('onboarding.habits')).setDesc(t('onboarding.habitsDesc')).addToggle((x) => x.setValue(this.addHabits).onChange((v) => { this.addHabits = v; }));
      }
      c.createEl('p', { cls: 'vs-muted', text: t('onboarding.later') });
    }

    const row = c.createDiv('vs-row-end');
    if (this.step > 0) row.createEl('button', { text: t('common.back') }).addEventListener('click', () => { this.step--; this.draw(); });
    const next = row.createEl('button', { cls: 'mod-cta', text: this.step < 2 ? t('common.next') : t('onboarding.finish') });
    next.addEventListener('click', handler(async () => {
      if (this.step < 2) { this.step++; this.draw(); return; }
      if (this.addHabits && !S.habits.length) {
        S.habits = STARTER_HABITS.map((h) => ({ ...h, name: t(`habits.starter.${h.key}` as 'habits.starter.reading_pages'), unit: h.bool ? undefined : t(`habits.starterUnit.${h.key}` as 'habits.starterUnit.reading_pages') }));
      }
      S.firstRunDone = true;
      await this.plugin.apply();
      if (this.makeHome && S.modules.home && !this.plugin.paths.homeFile()) await createHomeNote(this.plugin);
      this.close();
      if (S.integrations.ticktick) await this.plugin.openStudio('integrations');
    }));
  }

  onClose(): void {
    // closing early still counts: the settings tab is always there
    if (!this.plugin.settings.firstRunDone) {
      this.plugin.settings.firstRunDone = true;
      void this.plugin.saveSettings();
    }
    this.contentEl.empty();
  }
}
