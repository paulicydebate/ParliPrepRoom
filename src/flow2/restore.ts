import * as Y from 'yjs';
import { ORIGIN_LOCAL, readFlow, sheetOrder, sheetsMap, yCells } from './model';

/**
 * Put a flow back to how `source` (a version, or the record replayed to some point) had it: the sheets and cells
 * here are replaced by copies. Done as one change, so Undo brings the current flow back.
 */
export function restoreFlow(target: Y.Doc, source: Y.Doc) {
  const sheets = readFlow(source);
  target.transact(() => {
    const order = sheetOrder(target);
    order.delete(0, order.length);
    const map = sheetsMap(target);
    for (const key of [...map.keys()]) map.delete(key);
    for (const s of sheets) {
      const m = new Y.Map<unknown>();
      m.set('name', s.name);
      m.set('side', s.side);
      if (s.x !== null) m.set('x', s.x);
      if (s.y !== null) m.set('y', s.y);
      const cells = new Y.Map<Y.Map<unknown>>();
      m.set('cells', cells);
      map.set(s.id, m);
      for (const c of s.cells) {
        const cm = new Y.Map<unknown>();
        cm.set('col', c.col);
        cm.set('parent', c.parent);
        cm.set('order', c.order);
        if (c.gap) cm.set('gap', c.gap);
        if (c.group) cm.set('group', c.group);
        if (c.mark) cm.set('mark', c.mark);
        if (c.refs.length) cm.set('refs', c.refs.map((r) => `${r.kind}:${r.sheet}:${r.cell}`));
        cm.set('text', new Y.Text(c.text));
        yCells(m).set(c.id, cm);
      }
      order.push([s.id]);
    }
  }, ORIGIN_LOCAL);
}
