import { moment as obsidianMoment } from 'obsidian';
import type { Moment, MomentInput } from 'moment';

/**
 * Obsidian's bundled moment, with its call signatures spelled out. Some type
 * setups resolve the re-export from 'obsidian' as `any`, which leaks into every
 * date calculation; going through this keeps them typed either way.
 */
interface MomentFn {
  (input?: MomentInput, format?: string, strict?: boolean): Moment;
  max(...moments: Moment[]): Moment;
  min(...moments: Moment[]): Moment;
  locale(language?: string): string;
  locales(): string[];
  defineLocale(name: string, config: Record<string, unknown>): unknown;
}

export const moment = obsidianMoment as unknown as MomentFn;
