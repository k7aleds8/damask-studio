# Changelog

## 2.0.3

- Option previews work when the control panel sits in a popout window. Before, the
  stage stayed blank and a pinned preview ignored Escape and outside clicks there.
- The first loop of a preview starts fully visible instead of fading in from nothing.
- Release files now carry GitHub build attestations, so you can check they were built
  from this repository.
- Internal: date handling is typed end to end, and three `:has()` selectors became
  classes set from code.

## 2.0.2

- New name: **Damask Studio** (plugin id `damask-studio`), following the theme, now called
  Damask. On first run it imports the settings, habits, layouts and focus history saved by
  Damascene Studio. `damascene-home` blocks still render.
- The default heading preset is now called *Damask*; saved settings are converted.

## 2.0.1

- Switching the plugin off, or only its palette module, now takes the palette
  classes back off the page. While Style Settings is running they stay, since
  they are its palette choice too.

## 2.0.0

First public release, renamed from Vault Studio.

- Rewritten in TypeScript, split into modules that can each be switched off.
- Control panel with module switches, an Integrations tab and animated previews
  for module, insertion and embed options.
- TickTick is optional and off by default. When it is off, task and focus stats
  are computed from `- [ ]` lines in the vault and from the built-in focus timer.
- The focus timer keeps its sessions in the vault, with or without TickTick.
- Every folder the plugin uses is configurable; daily notes follow the core
  Daily notes or Periodic Notes settings.
- First-run setup: language, modules, home note, starter habits.
- Interface in English, Arabic, French, Spanish and Turkish, with proper plural
  rules and right-to-left layout for Arabic.
- Quick add understands dates and times in all five languages.
- Settings, TickTick token and sync state carry over from Vault Studio.
- SVG images without a fixed size no longer collapse to nothing in the embed layout.
- Habit goals wrap under the habit name in narrow dashboard cards instead of being cut off.
