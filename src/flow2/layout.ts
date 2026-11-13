import { childrenOf, rootsOf, type FlowCell } from './model';

// Where each cell goes, once every cell's own height is known. Pure, no DOM.
//
// Adapted from the ideas in Flowist (by Elli; used with permission): every cell is as tall as its
// own text, answers sit beside the argument they answer (centered on it, but never far from its
// top), and the next argument starts below everything said about the last one.

export interface Metrics {
  /** Space between cells stacked in one column. */
  cellGap: number;
  /** Space between one argument (with all its answers) and the next. */
  rootGap: number;
  /** Height of a blank row, and the least a cell can be. */
  rowHeight: number;
  /** How far answers may sit above or below the top of the cell they answer, in px. */
  alignLimit: number;
  /** Empty rows drawn below the last argument. */
  ghostRows: number;
}

export const METRICS: Metrics = { cellGap: 4, rootGap: 6, rowHeight: 34, alignLimit: 76, ghostRows: 40 };

export interface Layout {
  tops: Map<string, number>;
  heights: Map<string, number>;
  /** One band per root: the vertical room taken by it and everything that answers it. */
  bands: { rootId: string; top: number; height: number }[];
  /** Blank rows kept above a root. */
  blanks: { rootId: string; top: number; count: number }[];
  /** Framed blocks: cells that share a group id and sit together. */
  groups: { id: string; col: number; top: number; height: number }[];
  ghostTop: number;
  total: number;
}

interface Node {
  cell: FlowCell;
  h: number;
  kids: (Node & { dy: number })[];
  /** Where the block of answers starts, relative to this cell's top. */
  off: number;
  /** Top of the whole cluster relative to this cell's top (negative if answers reach above it). */
  top0: number;
  height: number;
}

export function layoutFlow(cells: FlowCell[], measured: ReadonlyMap<string, number>, m: Metrics = METRICS): Layout {
  const tops = new Map<string, number>();
  const heights = new Map<string, number>();
  const minH = m.rowHeight - m.cellGap;

  const build = (cell: FlowCell, seen: Set<string>): Node => {
    const h = Math.max(minH, measured.get(cell.id) ?? 0);
    heights.set(cell.id, h);
    seen.add(cell.id);
    const kids: Node['kids'] = [];
    let y = 0;
    let lastGap = m.cellGap;
    for (const c of childrenOf(cells, cell.id)) {
      if (seen.has(c.id)) continue; // a broken loop of links: ignore the repeat
      const k = build(c, seen);
      const prev = kids.at(-1);
      // Cells of one group touch.
      if (prev && c.group && prev.cell.group === c.group) y -= m.cellGap;
      kids.push({ ...k, dy: y - k.top0 });
      y += k.height + m.cellGap;
      lastGap = m.cellGap;
    }
    const blockH = kids.length ? y - lastGap : 0;
    const off = kids.length ? Math.min(m.alignLimit, Math.max(-m.alignLimit, (h - blockH) / 2)) : 0;
    const top0 = Math.min(0, kids.length ? off : 0);
    const bottom = Math.max(h, kids.length ? off + blockH : 0);
    return { cell, h, kids, off, top0, height: bottom - top0 };
  };

  const place = (n: Node, top: number) => {
    tops.set(n.cell.id, top);
    for (const k of n.kids) place(k, top + n.off + k.dy);
  };

  const bands: Layout['bands'] = [];
  const blanks: Layout['blanks'] = [];
  const seen = new Set<string>();
  let y = 0;
  const roots = rootsOf(cells);
  for (const root of roots) {
    if (root.gap > 0) {
      blanks.push({ rootId: root.id, top: y, count: root.gap });
      y += root.gap * m.rowHeight;
    }
    const node = build(root, seen);
    place(node, y - node.top0);
    bands.push({ rootId: root.id, top: y, height: node.height });
    y += node.height + m.rootGap;
    const next = roots[roots.indexOf(root) + 1];
    if (next && root.group && next.group === root.group && next.gap === 0) y -= m.rootGap;
  }
  // Cells that hang off a missing parent (deleted in another window) are shown as roots.
  for (const c of cells) {
    if (seen.has(c.id) || (c.parent !== null && cells.some((p) => p.id === c.parent))) continue;
    const node = build(c, seen);
    place(node, y - node.top0);
    bands.push({ rootId: c.id, top: y, height: node.height });
    y += node.height + m.rootGap;
  }
  // Framed blocks: each group's members, if two or more sit together.
  const groups: Layout['groups'] = [];
  const byGroup = new Map<string, FlowCell[]>();
  for (const c of cells) if (c.group && tops.has(c.id)) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
  for (const [id, members] of byGroup) {
    if (members.length < 2) continue;
    // Only members that are still next to each other are framed together: a cell put between them (or a member
    // moved away) splits the frame instead of being drawn inside it.
    const ids = new Set(members.map((c) => c.id));
    const first = members[0];
    const siblings = (first.parent === null ? roots : childrenOf(cells, first.parent)).filter((c) => tops.has(c.id));
    let run: FlowCell[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const top = Math.min(...run.map((c) => tops.get(c.id)!));
        const bottom = Math.max(...run.map((c) => tops.get(c.id)! + (heights.get(c.id) ?? 0)));
        groups.push({ id: groups.some((g) => g.id === id) ? `${id}:${run[0].id}` : id, col: first.col, top, height: bottom - top });
      }
      run = [];
    };
    for (const c of siblings) {
      if (ids.has(c.id) && c.col === first.col) run.push(c);
      else flush();
    }
    flush();
  }
  return { tops, heights, bands, blanks, groups, ghostTop: y, total: y + m.ghostRows * m.rowHeight };
}
