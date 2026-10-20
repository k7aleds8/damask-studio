import type { EmbedLayout, Habit, StudioSettings } from './types';

export const EMBED_DEFAULT: EmbedLayout = {
  align: 'center', width: 0, maxWidth: 900, float: 'none', frame: 'none', shadow: false,
  radius: 12, padding: 0, bg: 'transparent', invert: 'none', caption: '',
};

// a neutral starter set; names are filled in from the locale on first run
export const STARTER_HABITS: Habit[] = [
  { key: 'reading_pages', name: '', icon: 'book-open', unit: '', goal: 20, step: 5, max: 120, better: 'more' },
  { key: 'exercise_min', name: '', icon: 'dumbbell', unit: '', goal: 30, step: 10, max: 180, better: 'more' },
  { key: 'sleep_hours', name: '', icon: 'bed', unit: '', goal: 7, step: 0.5, max: 12, better: 'more' },
  { key: 'screen_min', name: '', icon: 'smartphone', unit: '', goal: 60, step: 15, max: 480, better: 'less' },
  { key: 'journaled', name: '', icon: 'notebook-pen', bool: true },
];

export const DEFAULT_SETTINGS: StudioSettings = {
  version: 2,
  firstRunDone: false,
  legacy: false,
  language: 'auto',
  modules: { home: true, inserter: true, embeds: true, folders: true, headings: false, variants: true, pomodoro: true, health: true },
  integrations: { ticktick: false },
  paths: {
    home: 'Home.md',
    dailyFolder: '',
    dailyFormat: '',
    quotes: '',
    questions: '',
    inbox: '',
    templates: '',
    excalidrawFont: '',
    excluded: [],
  },
  embeds: {
    enabled: true,
    toolbar: true,
    toolbarTrigger: 'hover',
    includeImages: true,
    defaults: {
      excalidraw: { ...EMBED_DEFAULT, width: 100, maxWidth: 880 },
      image: { ...EMBED_DEFAULT, width: 0, maxWidth: 820, radius: 10 },
    },
    layouts: {},
  },
  folders: { enabled: true, colorFiles: true, guides: true, bold: true, pill: false, iconColor: true, colors: {}, fileColors: {} },
  headings: { enabled: false, preset: 'damascene', colors: ['#b9a779', '#7ea69c', '#edebe0', '#b9a779', '#a67b7c', '#c8c4b8'], style: 'none', gradient: false, glow: false, scale: 1 },
  ui: { tab: 'dashboard', previews: true },
  noteStyles: [],
  insert: { suggest: true, menu: true, ribbon: true },
  home: { readingMode: true, openOnStartup: false, hijri: false },
  pomodoro: { work: 25, short: 5, long: 15, longEvery: 4, dailyGoal: 8, autoBreak: false, autoWork: false, sound: true, log: [] },
  ticktick: {
    tab: 'tasks', view: 'board', interval: 10, doneToDaily: true, onHome: true, defaultProject: '',
    mirror: { on: false, habits: false, folder: 'TickTick', keepDone: 7 },
  },
  theme: { dark: 'forest', light: 'wheat' },
  habits: [],
};
