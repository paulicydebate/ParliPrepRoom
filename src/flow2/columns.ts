import type { FlowSheetData } from './model';

// How wide each speech column is. Columns with no text in them stay narrow until they are used, so
// the room goes to the arguments (the idea is Flowist's, by Elli, used with permission).

export const NARROW_PX = 76;
export const WIDE_MIN_PX = 190;
export const GAP_PX = 44;

export interface ColumnGeometry {
  used: boolean[];
  colX: number[];
  colW: number[];
  /** Least width the sheet needs. */
  minWidth: number;
  /** Width used: the room given, or the least needed. */
  inner: number;
}

/** `room` is the width available (page view); null sizes the sheet to what it needs (canvas). */
export function columnGeometry(sheet: FlowSheetData, caretCol: number | null, room: number | null): ColumnGeometry {
  const used = sheet.columns.map((_, i) => i === 0 || caretCol === i + 1 || sheet.cells.some((c) => c.col === i + 1 && c.text.trim() !== ''));
  const nWide = used.filter(Boolean).length;
  const nNarrow = used.length - nWide;
  const minWidth = nWide * WIDE_MIN_PX + nNarrow * NARROW_PX + (used.length - 1) * GAP_PX;
  const inner = Math.max(room ?? 0, minWidth);
  const wideW = (inner - nNarrow * NARROW_PX - (used.length - 1) * GAP_PX) / nWide;
  const colX: number[] = [];
  const colW: number[] = [];
  let x = 0;
  for (const u of used) {
    colX.push(x);
    colW.push(u ? wideW : NARROW_PX);
    x += (u ? wideW : NARROW_PX) + GAP_PX;
  }
  return { used, colX, colW, minWidth, inner };
}
