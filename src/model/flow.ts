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
  cells: Map<number, { pos: number; size: number }[]>;
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
      text: node.textContent,
    });
  });
  return out;
}

export function computeFlow(blocks: FlowInputBlock[]): FlowLayout {
  const sheets: FlowSheet[] = [];
  const preamble: { pos: number; size: number }[] = [];
  const speechAt = new Map<number, Speech>();

  let sheet: FlowSheet | null = null;
  let group: (FlowGroup & { current: Speech }) | null = null;
  let row = 1;

  const closeGroup = () => {
    if (!sheet || !group) return;
    let span = 1;
    for (const list of group.cells.values()) span = Math.max(span, list.length);
    group.span = span;
    row = group.row + span;
    for (const list of group.cells.values()) {
      const last = list[list.length - 1];
      const p = sheet.placements.find((x) => x.pos === last.pos);
      if (p) p.rowSpan = span - (list.length - 1);
    }
    const { current: _c, ...plain } = group;
    sheet.groups.push(plain);
    group = null;
  };

  const closeSheet = () => {
    closeGroup();
    if (sheet) {
      sheet.nextRow = row;
      const used = sheet.groups.length + sheet.blanks.reduce((n, b) => n + b.count, 0);
      sheet.ghostRows = Math.max(MIN_GHOST_ROWS, SHEET_ROWS - used);
      sheets.push(sheet);
    }
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
        nextRow: 1,
        blanks: [],
        ghostRows: SHEET_ROWS,
      };
      row = 1;
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
      closeGroup();
      s.placements.push({ pos: b.pos, col: 0, row, rowSpan: 1, speech: null, group: -1 });
      row++;
      continue;
    }

    type OpenGroup = FlowGroup & { current: Speech };
    const open = (start: Speech): OpenGroup => {
      if (b.gap > 0) {
        s.blanks.push({ row, count: b.gap, before: s.groups.length });
        row += b.gap;
      }
      return { index: s.groups.length, row, span: 1, from: b.pos, to: b.pos + b.size, cells: new Map(), current: start };
    };
    let g = group as OpenGroup | null;
    let sp: Speech;
    if (b.kind === 'claim') {
      sp = explicit ?? base;
      if (!g || sp === base || b.newRow || b.gap > 0) {
        closeGroup();
        g = open(sp);
      }
      g.current = sp;
    } else {
      sp = explicit ?? g?.current ?? base;
      if (b.gap > 0) {
        closeGroup();
        g = null;
      }
      if (!g) g = open(sp);
      if (explicit) g.current = explicit;
    }
    group = g;

    const col = colOf(sp);
    const list = g.cells.get(col) ?? [];
    s.placements.push({ pos: b.pos, col, row: g.row + list.length, rowSpan: 1, speech: sp, group: g.index });
    list.push({ pos: b.pos, size: b.size });
    g.cells.set(col, list);
    g.to = b.pos + b.size;
    speechAt.set(b.pos, sp);
  }
  closeSheet();
  return { sheets, preamble, speechAt };
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
    for (const b of list) best = Math.max(best, b.pos + b.size);
  }
  return best >= 0 ? best : group.to;
}
