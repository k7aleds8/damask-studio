import { describe, expect, it } from 'vitest';
import { parseTaskLine } from '../src/core/task-line';

describe('task lines', () => {
  it('reads the Tasks-plugin markers', () => {
    const r = parseTaskLine('- [x] write report 📅 2026-10-20 ⏰ 9:30 ⏫ 🔁 every week #work ✅ 2026-10-21 %%tt:abc123%%')!;
    expect(r.done).toBe(true);
    expect(r.title).toBe('write report');
    expect(r.due).toBe('2026-10-20');
    expect(r.time).toBe('09:30');
    expect(r.completed).toBe('2026-10-21');
    expect(r.priority).toBe(5);
    expect(r.repeat).toBe(true);
    expect(r.tags).toEqual(['work']);
    expect(r.id).toBe('abc123');
  });

  it('treats in-progress as open and reads indentation', () => {
    const r = parseTaskLine('    - [/] half done')!;
    expect(r.done).toBe(false);
    expect(r.indent).toBe(4);
  });

  it('ignores lines that are not tasks', () => {
    expect(parseTaskLine('- just a bullet')).toBeNull();
    expect(parseTaskLine('plain text')).toBeNull();
  });

  it('drops created and scheduled dates from the title', () => {
    expect(parseTaskLine('- [ ] water plants ➕ 2026-01-01 ⏳ 2026-01-03')!.title).toBe('water plants');
  });
});
