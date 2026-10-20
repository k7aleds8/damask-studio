export type Align = 'left' | 'center' | 'right';
export type Float = 'none' | 'left' | 'right';
export type Frame = 'none' | 'card' | 'glass' | 'outline' | 'polaroid';
export type Invert = 'none' | 'dark' | 'always';

export interface EmbedLayout {
  align: Align;
  width: number;
  maxWidth: number;
  float: Float;
  frame: Frame;
  shadow: boolean;
  radius: number;
  padding: number;
  bg: 'transparent' | 'theme' | 'paper';
  invert: Invert;
  caption: string;
}

export interface Habit {
  key: string;
  name: string;
  icon: string;
  bool?: boolean;
  unit?: string;
  goal?: number;
  step?: number;
  max?: number;
  better?: 'more' | 'less';
  /** TickTick habit id once the habit is linked. */
  tt?: string | null;
}

export interface FocusSession {
  id: string;
  kind: 'pomo' | 'stopwatch';
  start: number;
  end: number;
  /** seconds, pauses excluded */
  duration: number;
  pause: number;
  task?: string;
}

export type ModuleId = 'home' | 'inserter' | 'embeds' | 'folders' | 'headings' | 'variants' | 'pomodoro' | 'health';

export interface StudioSettings {
  version: number;
  firstRunDone: boolean;
  /** set when settings were carried over from Vault Studio; enables the note clean-up check */
  legacy: boolean;
  /** 'auto' follows Obsidian's language. */
  language: string;
  modules: Record<ModuleId, boolean>;
  integrations: { ticktick: boolean };
  paths: {
    home: string;
    /** empty = read from the Daily notes / Periodic Notes settings */
    dailyFolder: string;
    dailyFormat: string;
    quotes: string;
    questions: string;
    inbox: string;
    templates: string;
    excalidrawFont: string;
    excluded: string[];
  };
  embeds: {
    enabled: boolean;
    toolbar: boolean;
    toolbarTrigger: 'hover' | 'alt';
    includeImages: boolean;
    defaults: { excalidraw: EmbedLayout; image: EmbedLayout };
    /** "notePath::targetPath" or "*::targetPath" */
    layouts: Record<string, Partial<EmbedLayout>>;
  };
  folders: {
    enabled: boolean;
    colorFiles: boolean;
    guides: boolean;
    bold: boolean;
    pill: boolean;
    iconColor: boolean;
    colors: Record<string, string>;
    fileColors: Record<string, string>;
  };
  headings: {
    enabled: boolean;
    preset: string;
    colors: string[];
    style: 'none' | 'clean' | 'bar' | 'underline' | 'pill';
    gradient: boolean;
    glow: boolean;
    scale: number;
  };
  /** previews: the animated option previews in the panel */
  ui: { tab: string; previews: boolean };
  /** extra cssclasses offered in the note-style picker, as "class|Label" */
  noteStyles: string[];
  insert: { suggest: boolean; menu: boolean; ribbon: boolean };
  home: { readingMode: boolean; openOnStartup: boolean; hijri: boolean };
  pomodoro: {
    work: number;
    short: number;
    long: number;
    longEvery: number;
    dailyGoal: number;
    autoBreak: boolean;
    autoWork: boolean;
    sound: boolean;
    /** kept in plugin data so focus stats work without any integration */
    log: FocusSession[];
  };
  ticktick: {
    tab: string;
    view: string;
    interval: number;
    doneToDaily: boolean;
    onHome: boolean;
    defaultProject: string;
    mirror: { on: boolean; habits: boolean; folder: string; keepDone: number };
  };
  theme: { dark: string; light: string };
  habits: Habit[];
}
