import { describe, expect, it } from 'vitest';
import { fromTickTick, parseNote, render } from '../src/integrations/ticktick/mirror-format';

describe('mirror note format', () => {
  const task = {
    id: 't1', projectId: 'p', title: 'Pay rent', status: 0, priority: 3, dueDate: '2026-10-20T12:00:00+0000', isAllDay: true,
    tags: ['home'], items: [{ id: 'i1', title: 'transfer', status: 1 }],
  };

  it('renders a task and parses it back to the same record', () => {
    const rec = fromTickTick(task as never);
    const lines = render('t1', rec);
    expect(lines[0]).toMatch(/^- \[ \] Pay rent 📅 \d{4}-\d{2}-\d{2} 🔼 #home %%tt:t1%%$/);
    expect(lines[1]).toBe('    - [x] transfer %%tti:i1%%');
    const P = parseNote(['---', 'tt_project: p', '---', '## Open', ...lines, '', '## Done'].join('\n'));
    expect(P.pid).toBe('p');
    expect(P.blocks).toHaveLength(1);
    expect(P.blocks[0].id).toBe('t1');
    expect(P.blocks[0].rec.t).toBe('Pay rent');
    expect(P.blocks[0].rec.i).toEqual([{ id: 'i1', t: 'transfer', s: 1 }]);
  });

  it('recognises the section headings of every language', () => {
    const pairs = [['Open', 'Done'], ['مفتوحة', 'أُنجزت'], ['En cours', 'Terminées'], ['Pendientes', 'Terminadas'], ['Açık', 'Bitenler']];
    for (const [open, done] of pairs) {
      const P = parseNote(`## ${open}\n- [ ] a %%tt:1%%\n## ${done}\n- [x] b %%tt:2%%`);
      expect(P.openAt).toBe(0);
      expect(P.blocks.map((b) => b.inDone)).toEqual([false, true]);
    }
  });
});
