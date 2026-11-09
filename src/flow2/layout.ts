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
    for (const c of childrenOf(cells, cell.id)) {
      if (seen.has(c.id)) continue; // a broken loop of links: ignore the repeat
      const k = build(c, seen);
      kids.push({ ...k, dy: y - k.top0 });
      y += k.height + m.cellGap;
    }
    const blockH = kids.length ? y - m.cellGap : 0;
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
  for (const root of rootsOf(cells)) {
    if (root.gap > 0) {
      blanks.push({ rootId: root.id, top: y, count: root.gap });
      y += root.gap * m.rowHeight;
    }
    const node = build(root, seen);
    place(node, y - node.top0);
    bands.push({ rootId: root.id, top: y, height: node.height });
    y += node.height + m.rootGap;
  }
  // Cells that hang off a missing parent (deleted in another window) are shown as roots.
  for (const c of cells) {
    if (seen.has(c.id) || (c.parent !== null && cells.some((p) => p.id === c.parent))) continue;
    const node = build(c, seen);
    place(node, y - node.top0);
    bands.push({ rootId: c.id, top: y, height: node.height });
    y += node.height + m.rootGap;
  }
  return { tops, heights, bands, blanks, ghostTop: y, total: y + m.ghostRows * m.rowHeight };
}
