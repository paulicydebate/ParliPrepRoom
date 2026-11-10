import type { FlowSheetData } from './model';

// How wide each speech column is. Columns with no text in them stay narrow until they are used, so
// the room goes to the arguments; a column can also be minimized to a thin strip with a chevron to
// open it again (both ideas are Flowist's, by Elli, used with permission).

export const NARROW_PX = 76;
export const WIDE_MIN_PX = 190;
export const GAP_PX = 44;
export const MINI_PX = 28;
/** The pins column, when one is open after a speech column. */
export const PINS_PX = 230;

export interface ColumnGeometry {
  used: boolean[];
  /** Which columns are minimized to a strip. */
  mini: boolean[];
  colX: number[];
  colW: number[];
  /** Where the pins column sits (null if none is open). */
  pinX: number | null;
  /** Least width the sheet needs. */
  minWidth: number;
  /** Width used: the room given, or the least needed. */
  inner: number;
}

/** `room` is the width available (page view); null sizes the sheet to what it needs (canvas). `minimized` lists 1-based columns. */
export function columnGeometry(sheet: FlowSheetData, caretCol: number | null, room: number | null, minimized: readonly number[] = [], pinAfter: number | null = null): ColumnGeometry {
  const hasPins = pinAfter !== null && pinAfter >= 1 && pinAfter <= sheet.columns.length;
  const mini = sheet.columns.map((_, i) => minimized.includes(i + 1) && caretCol !== i + 1);
  const used = sheet.columns.map((_, i) => !mini[i] && (i === 0 || caretCol === i + 1 || sheet.cells.some((c) => c.col === i + 1 && c.text.trim() !== '')));
  const nWide = used.filter(Boolean).length;
  const nMini = mini.filter(Boolean).length;
  const nNarrow = used.length - nWide - nMini;
  const fixed = nNarrow * NARROW_PX + nMini * MINI_PX + (hasPins ? PINS_PX : 0);
  const gaps = (used.length - 1 + (hasPins ? 1 : 0)) * GAP_PX;
  const minWidth = nWide * WIDE_MIN_PX + fixed + gaps;
  const inner = Math.max(room ?? 0, minWidth);
  const wideW = nWide ? (inner - fixed - gaps) / nWide : WIDE_MIN_PX;
  const colX: number[] = [];
  const colW: number[] = [];
  let x = 0;
  let pinX: number | null = null;
  used.forEach((u, i) => {
    const w = mini[i] ? MINI_PX : u ? wideW : NARROW_PX;
    colX.push(x);
    colW.push(w);
    x += w + GAP_PX;
    if (hasPins && i + 1 === pinAfter) {
      pinX = x;
      x += PINS_PX + GAP_PX;
    }
  });
  return { used, mini, colX, colW, pinX, minWidth, inner };
}
