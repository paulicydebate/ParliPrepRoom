import { asKind, levelOf, type BlockKind } from './blocks';
import { asSide, baseSpeech, columnsFor, isSpeech, type Side, type Speech } from './speeches';

// How the one document becomes a flow. Pure functions, no editor code.
//
// - Each Position title starts a sheet (a tab). Its side (gov/opp) sets the columns.
// - A Section title is a full-width label row.
// - A claim in the sheet's own speech (PMC on gov sheets, LOC on opp sheets)
//   starts a new row. Claims tagged with a later speech are answers: they go
//   in that speech's column in the same row. A claim marked "new row" always
//   starts a row (for arguments that first appear in, say, the MG).
// - Warrants, analytics and notes follow the claim above them.

export interface FlowInputBlock {
  pos: number;
  size: number;
  id: string | null;
  kind: BlockKind;
  speech: Speech | null;
  side: Side;
  newRow: boolean;
  /** Blank flow rows kept above this row (set by clicking a row further down). */
  gap: number;
  /** Id of the argument (in the speech just before) this claim answers. */
  answers?: string | null;
  text: string;
}

export interface Placement {
  pos: number;
  /** 1-based grid column, or 0 for a full-width section row. */
  col: number;
  row: number;
  /** Rows this block covers; the last block of a cell stretches to the end of its row group. */
  rowSpan: number;
  speech: Speech | null;
  group: number;
}

export interface FlowGroup {
  index: number;
  row: number;
  span: number;
  /** Doc position at the start of the group's first block. */
  from: number;
  /** Doc position just after the group's last block. */
  to: number;
  /** Blocks per column (1-based column -> list of blocks, in doc order). */
  cells: Map<number, { pos: number; size: number; moved?: boolean }[]>;
}

export interface FlowSheet {
  id: string | null;
  pos: number;
  /** Doc position just after the sheet's last block. */
  end: number;
  title: string;
  side: Side;
  columns: Speech[];
  placements: Placement[];
  groups: FlowGroup[];
  /** Argument to response links to draw: doc positions of the two blocks. */
  links: { from: number; to: number }[];
  /** First free grid row after the sheet's content. */
  nextRow: number;
  /** Runs of blank rows kept above a group: grid row, how many, and which group follows. */
  blanks: { row: number; count: number; before: number }[];
  /** Empty rows drawn below the content so any row can be clicked. */
  ghostRows: number;
}

/** Rows a sheet shows, like a pre-made spreadsheet flow. */
export const SHEET_ROWS = 150;
/** Always leave at least this many empty rows below the last one used. */
export const MIN_GHOST_ROWS = 30;

export interface FlowLayout {
  sheets: FlowSheet[];
  /** Blocks before the first position title (not shown on the flow). */
  preamble: { pos: number; size: number }[];
  /** Effective speech of every block in a sheet, by doc position. */
  speechAt: Map<number, Speech>;
}

/** Read the blocks of a ProseMirror-like doc. */
export function readBlocks(doc: {
  forEach: (fn: (node: { type: { name: string }; attrs: Record<string, unknown>; nodeSize: number; textContent: string }, pos: number) => void) => void;
}): FlowInputBlock[] {
  const out: FlowInputBlock[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name !== 'block') return;
    out.push({
      pos,
      size: node.nodeSize,
      id: (node.attrs.id as string) ?? null,
      kind: asKind(node.attrs.kind),
      speech: isSpeech(node.attrs.speech) ? node.attrs.speech : null,
      side: asSide(node.attrs.side),
      newRow: node.attrs.newRow === true,
      gap: Math.max(0, Math.floor(Number(node.attrs.gap) || 0)),
      answers: typeof node.attrs.answers === 'string' && node.attrs.answers ? node.attrs.answers : null,
      text: node.textContent,
    });
  });
  return out;
}

export function computeFlow(blocks: FlowInputBlock[]): FlowLayout {
  // Links can be unusable (the target was deleted, is on another sheet, or is not in the column
  // just before). Lay out with every link, then again without the unusable ones.
  const off = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const { layout, invalid } = layoutPass(blocks, off);
    if (!invalid.size) return layout;
    for (const id of invalid) off.add(id);
  }
  for (const b of blocks) if (b.answers && b.id) off.add(b.id);
  return layoutPass(blocks, off).layout;
}

interface Item {
  pos: number;
  size: number;
  id: string | null;
  /** Row within its group (0 = the group's first row). */
  offset: number;
  moved: boolean;
}
interface OpenGroup {
  index: number;
  from: number;
  to: number;
  gap: number;
  cells: Map<number, Item[]>;
  current: Speech;
  row: number;
  span: number;
}
interface Run {
  /** The response (a claim) and the warrants, analytics and notes that follow it. */
  items: { pos: number; size: number; id: string | null }[];
  speech: Speech;
  answers: string;
}
type Step = { section: Placement } | { group: OpenGroup };

function layoutPass(blocks: FlowInputBlock[], off: Set<string>): { layout: FlowLayout; invalid: Set<string> } {
  const sheets: FlowSheet[] = [];
  const preamble: { pos: number; size: number }[] = [];
  const speechAt = new Map<number, Speech>();
  const invalid = new Set<string>();

  let sheet: FlowSheet | null = null;
  let steps: Step[] = [];
  let groups: OpenGroup[] = [];
  let runs: Run[] = [];
  let group: OpenGroup | null = null;
  let run: Run | null = null;
  const itemOf = new Map<number, Item>();

  const closeSheet = () => {
    if (!sheet) return;
    const s = sheet;
    const colOf = (sp: Speech) => Math.max(1, s.columns.indexOf(sp) + 1);

    // Linked responses move next to the argument they answer (nothing moves in the document itself).
    const byId = new Map<string, { g: OpenGroup; col: number; item: Item }>();
    for (const g of groups) for (const [col, list] of g.cells) for (const it of list) if (it.id && !byId.has(it.id)) byId.set(it.id, { g, col, item: it });
    const ordered = runs.map((r, i) => ({ r, i })).sort((x, y) => colOf(x.r.speech) - colOf(y.r.speech) || x.i - y.i);
    for (const { r } of ordered) {
      const col = colOf(r.speech);
      const target = byId.get(r.answers);
      const first = r.items[0];
      if (!target || target.col + 1 !== col) {
        if (first.id) invalid.add(first.id);
        continue;
      }
      const list = target.g.cells.get(col) ?? [];
      let offset = Math.max(target.item.offset, list.length ? list[list.length - 1].offset + 1 : 0);
      for (const x of r.items) {
        const item: Item = { pos: x.pos, size: x.size, id: x.id, offset: offset++, moved: true };
        list.push(item);
        itemOf.set(x.pos, item);
        s.placements.push({ pos: x.pos, col, row: 0, rowSpan: 1, speech: r.speech, group: target.g.index });
        speechAt.set(x.pos, r.speech);
        if (x.id && !byId.has(x.id)) byId.set(x.id, { g: target.g, col, item });
      }
      target.g.cells.set(col, list);
      s.links.push({ from: target.item.pos, to: first.pos });
    }

    // Rows, top to bottom.
    let row = 1;
    for (const step of steps) {
      if ('section' in step) {
        step.section.row = row++;
        continue;
      }
      const g = step.group;
      if (g.gap > 0) {
        s.blanks.push({ row, count: g.gap, before: g.index });
        row += g.gap;
      }
      g.row = row;
      let span = 1;
      for (const list of g.cells.values()) span = Math.max(span, list[list.length - 1].offset + 1);
      g.span = span;
      row += span;
    }
    for (const g of groups) {
      for (const list of g.cells.values()) {
        for (const it of list) {
          const p = s.placements.find((x) => x.pos === it.pos);
          if (p) p.row = g.row + it.offset;
        }
        const last = list[list.length - 1];
        const p = s.placements.find((x) => x.pos === last.pos);
        if (p) p.rowSpan = g.span - last.offset;
      }
      s.groups.push({
        index: g.index,
        row: g.row,
        span: g.span,
        from: g.from,
        to: g.to,
        cells: new Map([...g.cells].map(([c, list]) => [c, list.map((it) => ({ pos: it.pos, size: it.size, ...(it.moved ? { moved: true } : {}) }))])),
      });
    }
    s.placements.sort((a, b) => a.pos - b.pos);
    s.nextRow = row;
    const used = s.groups.length + s.blanks.reduce((n, x) => n + x.count, 0);
    s.ghostRows = Math.max(MIN_GHOST_ROWS, SHEET_ROWS - used);
    sheets.push(s);
    sheet = null;
  };

  for (const b of blocks) {
    if (b.kind === 'position') {
      closeSheet();
      sheet = {
        id: b.id,
        pos: b.pos,
        end: b.pos + b.size,
        title: b.text,
        side: b.side,
        columns: columnsFor(b.side),
        placements: [],
        groups: [],
        links: [],
        nextRow: 1,
        blanks: [],
        ghostRows: SHEET_ROWS,
      };
      steps = [];
      groups = [];
      runs = [];
      group = null;
      run = null;
      continue;
    }
    if (!sheet) {
      preamble.push({ pos: b.pos, size: b.size });
      continue;
    }
    sheet.end = b.pos + b.size;
    const s: FlowSheet = sheet;
    const base = baseSpeech(s.side);
    const colOf = (sp: Speech) => Math.max(1, s.columns.indexOf(sp) + 1);
    const explicit = b.speech && s.columns.includes(b.speech) ? b.speech : null;

    if (levelOf(b.kind) === 2) {
      group = null;
      run = null;
      const p: Placement = { pos: b.pos, col: 0, row: 0, rowSpan: 1, speech: null, group: -1 };
      s.placements.push(p);
      steps.push({ section: p });
      continue;
    }

    // A claim linked to an earlier argument (and the lines that follow it) is placed after the
    // rest, beside that argument.
    if (b.kind === 'claim' && b.answers && b.id && explicit && s.columns.indexOf(explicit) > 0 && !off.has(b.id)) {
      run = { items: [{ pos: b.pos, size: b.size, id: b.id }], speech: explicit, answers: b.answers };
      runs.push(run);
      continue;
    }
    if (run && b.kind !== 'claim' && !explicit) {
      run.items.push({ pos: b.pos, size: b.size, id: b.id });
      continue;
    }
    run = null;

    const open = (start: Speech): OpenGroup => {
      const g: OpenGroup = { index: groups.length, from: b.pos, to: b.pos + b.size, gap: b.gap > 0 ? b.gap : 0, cells: new Map(), current: start, row: 0, span: 1 };
      groups.push(g);
      steps.push({ group: g });
      return g;
    };
    let g: OpenGroup | null = group;
    let sp: Speech;
    if (b.kind === 'claim') {
      sp = explicit ?? base;
      if (!g || sp === base || b.newRow || b.gap > 0) g = open(sp);
      g.current = sp;
    } else {
      sp = explicit ?? g?.current ?? base;
      if (b.gap > 0) g = null;
      if (!g) g = open(sp);
      if (explicit) g.current = explicit;
    }
    group = g;

    const col = colOf(sp);
    const list = g.cells.get(col) ?? [];
    const item: Item = { pos: b.pos, size: b.size, id: b.id, offset: list.length, moved: false };
    itemOf.set(b.pos, item);
    s.placements.push({ pos: b.pos, col, row: 0, rowSpan: 1, speech: sp, group: g.index });
    list.push(item);
    g.cells.set(col, list);
    g.to = b.pos + b.size;
    speechAt.set(b.pos, sp);
  }
  closeSheet();
  return { layout: { sheets, preamble, speechAt }, invalid };
}

/** The sheet containing a doc position, if any. */
export function sheetAt(layout: FlowLayout, pos: number): FlowSheet | null {
  let found: FlowSheet | null = null;
  for (const s of layout.sheets) if (s.pos <= pos) found = s;
  return found;
}

/**
 * Where to insert a new block for column `col` of a group so the document
 * stays in speaking order: after the last block in that column or an earlier one.
 */
export function insertPosFor(group: FlowGroup, col: number): number {
  let best = -1;
  for (const [c, list] of group.cells) {
    if (c > col) continue;
    for (const b of list) if (!b.moved) best = Math.max(best, b.pos + b.size);
  }
  return best >= 0 ? best : group.to;
}
