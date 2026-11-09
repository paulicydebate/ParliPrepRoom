import type { FlowSheet } from './flow';

// Where everything goes on screen once each block's own height is known. Pure, no DOM.
//
// Adapted from the ideas in Flowist (by Elli; used with permission): cells grow on their own
// instead of sharing row heights, and an answer lines up beside the argument it answers (centered
// on it, but never far from its top). The code is this app's own, built on its block model:
//   - a "group" is one argument and everything said about it (see model/flow.ts);
//   - inside a group each speech column is its own stack of blocks;
//   - the group is as tall as its tallest column, and the next group starts below it.

export interface LayoutMetrics {
  /** Space between blocks stacked in one column. */
  cellGap: number;
  /** Space between one group and the next. */
  groupGap: number;
  /** Height of an empty row (and the least a cell or group can be). */
  rowHeight: number;
  /** How far an answer may sit above or below the top of the argument it answers, in px. */
  alignLimit: number;
}

export const DEFAULT_METRICS: LayoutMetrics = { cellGap: 4, groupGap: 4, rowHeight: 34, alignLimit: 76 };

export interface FlowGeometry {
  /** Top of each block, by document position. */
  tops: Map<number, number>;
  /** Height used for each block (its own measured height, at least a row). */
  heights: Map<number, number>;
  groups: {
    index: number;
    top: number;
    height: number;
    /** Each speech column's own boxes in this group: one per run of blocks, or one empty position if the column has none. */
    columns: Map<number, { top: number; height: number; empty: boolean; first: number; last: number }[]>;
  }[];
  /** Blank rows kept above a group (flow rows skipped by clicking further down). */
  blanks: { before: number; top: number; count: number }[];
  /** Top of the empty rows drawn below the content. */
  ghostTop: number;
  /** Total height including the empty rows below. */
  total: number;
}

/** Balanced alignment: center on the anchor, but stay within `limit` of its top. */
export function alignedTop(anchorTop: number, anchorHeight: number, height: number, limit: number): number {
  const centered = (anchorHeight - height) / 2;
  return anchorTop + Math.min(limit, Math.max(-limit, centered));
}

export function layoutFlow(sheet: FlowSheet, measured: ReadonlyMap<number, number>, m: LayoutMetrics = DEFAULT_METRICS): FlowGeometry {
  const tops = new Map<number, number>();
  const heights = new Map<number, number>();
  const groups: FlowGeometry['groups'] = [];
  const blanks: FlowGeometry['blanks'] = [];
  const heightOf = (pos: number) => {
    const h = Math.max(m.rowHeight - m.cellGap, measured.get(pos) ?? 0);
    heights.set(pos, h);
    return h;
  };

  // Who answers whom (first line of a linked answer -> the argument).
  const answers = new Map<number, number>();
  for (const l of sheet.links) answers.set(l.to, l.from);

  // Sections and groups top to bottom, in the order of the rows computeFlow gave them.
  type Step = { row: number; section?: number; group?: number };
  const steps: Step[] = [];
  for (const p of sheet.placements) if (p.col === 0) steps.push({ row: p.row, section: p.pos });
  for (const g of sheet.groups) steps.push({ row: g.row, group: g.index });
  steps.sort((a, b) => a.row - b.row);

  let y = 0;
  for (const step of steps) {
    if (step.section !== undefined) {
      tops.set(step.section, y);
      y += heightOf(step.section) + m.groupGap;
      continue;
    }
    const g = sheet.groups[step.group!];
    const blank = sheet.blanks.find((b) => b.before === g.index);
    if (blank) {
      blanks.push({ before: g.index, top: y, count: blank.count });
      y += blank.count * m.rowHeight;
    }
    const top = y;
    let bottom = top + m.rowHeight - m.cellGap;
    const cols = [...g.cells.keys()].sort((a, b) => a - b);
    const columns: FlowGeometry['groups'][number]['columns'] = new Map();
    for (const c of cols) {
      const list = g.cells.get(c)!;
      const boxes: { top: number; height: number; empty: boolean; first: number; last: number }[] = [];
      let prevBottom: number | null = null;
      list.forEach((item, i) => {
        const h = heightOf(item.pos);
        // The argument this one answers: the one it is linked to, else the first line of the
        // nearest earlier speech in this group.
        let anchorTop: number | null = null;
        let anchorH = 0;
        const target = answers.get(item.pos);
        if (target !== undefined && tops.has(target)) {
          anchorTop = tops.get(target)!;
          anchorH = heights.get(target) ?? 0;
        } else if (i === 0) {
          for (let e = c - 1; e >= 1 && anchorTop === null; e--) {
            const first = g.cells.get(e)?.[0];
            if (first && tops.has(first.pos)) {
              anchorTop = tops.get(first.pos)!;
              anchorH = heights.get(first.pos) ?? 0;
            }
          }
        }
        let desired = anchorTop === null ? top : Math.max(top, alignedTop(anchorTop, anchorH, h, m.alignLimit));
        if (anchorTop === null && i === 0) desired = top;
        // Lines of one cell touch; separate cells keep a small gap.
        const t = prevBottom === null ? desired : Math.max(desired, prevBottom + (item.head ? m.cellGap : 0));
        tops.set(item.pos, t);
        // A new box starts where an answer was lined up lower than the end of the stack above it.
        const last = boxes[boxes.length - 1];
        if (!last || prevBottom === null || item.head || t > prevBottom + 0.5) boxes.push({ top: t, height: h, empty: false, first: item.pos, last: item.pos });
        else {
          last.height = t + h - last.top;
          last.last = item.pos;
        }
        prevBottom = t + h;
        bottom = Math.max(bottom, prevBottom);
      });
      columns.set(c, boxes);
    }
    groups.push({ index: g.index, top, height: bottom - top, columns });
    y = bottom + m.groupGap;
  }
  return { tops, heights, groups, blanks, ghostTop: y, total: y + sheet.ghostRows * m.rowHeight };
}
