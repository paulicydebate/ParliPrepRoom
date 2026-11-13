import { strToU8 } from 'fflate';
import { childrenMap, type FlowCell, type FlowMark, type FlowSheetData } from '../flow2/model';
import { SPEECH_INFO } from '../model/speeches';
import { colName, esc, packWorkbook, richCell, S, sheetName } from './xlsx';
import { fingerprint, FLOW_PART, type FlowFile } from '../import/flowFile';

// A flow (the cell-based one) as an Excel file: one worksheet per sheet, one column per speech. An argument
// sits in the row where it starts and what answers it sits to its right, so it reads like a paper flow
// and can be read back in (src/import/flowImport.ts). Marks are written in front of the text.

export const MARK_PREFIX: Record<FlowMark, string> = { extended: '→ ', dropped: '[DROPPED] ', answered: '✓ ', key: '★ ' };

/** Which row each cell starts in: an argument takes as many rows as the answers under it need. */
export function flowRows(cells: FlowCell[]): { rows: number; at: Map<string, number> } {
  const at = new Map<string, number>();
  let next = 0;
  const kidsOf = childrenMap(cells);
  const place = (c: FlowCell): number => {
    const start = next;
    at.set(c.id, start);
    const kids = kidsOf.get(c.id) ?? [];
    if (!kids.length) next++;
    else for (const k of kids) place(k);
    return start;
  };
  for (const r of kidsOf.get(null) ?? []) {
    next += r.gap;
    place(r);
  }
  return { rows: next, at };
}

/** Excel holds at most this many characters in a cell. */
const EXCEL_CELL_MAX = 32767;

/** The text written in a cell: its mark first, cut to what Excel can hold, without characters Excel refuses. */
export function cellValue(c: FlowCell): string {
  const prefix = c.mark ? MARK_PREFIX[c.mark] : '';
  return (prefix + c.text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').slice(0, EXCEL_CELL_MAX);
}

export function buildFlow2Xlsx(sheets: FlowSheetData[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  // The grid's text as it will be read back, for the fingerprint in the exact copy (see flowFile.ts).
  const grids: { rows: string[][] }[] = [];
  const used = new Set<string>();
  const names: string[] = [];
  sheets.forEach((sheet, si) => {
    names.push(sheetName(sheet.name || `Sheet ${si + 1}`, used));
    const { rows, at } = flowRows(sheet.cells);
    const out: string[] = [];
    const gridRows: string[][] = [sheet.columns.slice()];
    grids.push({ rows: gridRows });
    out.push(
      `<row r="1">${sheet.columns
        .map((sp, i) => `<c r="${colName(i)}1" s="${SPEECH_INFO[sp].side === 'gov' ? S.headGov : S.headOpp}" t="inlineStr"><is><t>${sp}</t></is></c>`)
        .join('')}</row>`,
    );
    const grid = new Map<number, Map<number, FlowCell>>();
    for (const c of sheet.cells) {
      const r = at.get(c.id);
      if (r === undefined) continue;
      if (!grid.has(r)) grid.set(r, new Map());
      grid.get(r)!.set(c.col - 1, c);
    }
    for (let r = 0; r < Math.max(rows, 1); r++) {
      const line = grid.get(r);
      if (!line) continue;
      const cols = [...line.keys()].sort((a, b) => a - b);
      gridRows.push(cols.map((ci) => cellValue(line.get(ci)!)));
      out.push(
        `<row r="${r + 2}">${cols
          .map((ci) => {
            const c = line.get(ci)!;
            const sp = sheet.columns[ci];
            return richCell(`${colName(ci)}${r + 2}`, SPEECH_INFO[sp].side === 'gov' ? S.bodyGov : S.bodyOpp, [{ runs: [{ text: cellValue(c) }], claim: false }]);
          })
          .join('')}</row>`,
      );
    }
    const widths = sheet.columns.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="38" customWidth="1"/>`).join('');
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${out.join('')}</sheetData></worksheet>`,
    );
  });
  if (!sheets.length) {
    names.push('Flow');
    files['xl/worksheets/sheet1.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${esc('No sheets yet.')}</t></is></c></row></sheetData></worksheet>`,
    );
  }
  const exact: FlowFile = {
    v: 1,
    grid: fingerprint(grids),
    sheets: sheets.map((s) => ({
      id: s.id,
      name: s.name,
      side: s.side,
      cells: s.cells.map((c) => ({ id: c.id, col: c.col, parent: c.parent, order: c.order, gap: c.gap, group: c.group, mark: c.mark, refs: c.refs.map((r) => `${r.kind}:${r.sheet}:${r.cell}`), text: c.text })),
    })),
  };
  files[FLOW_PART] = strToU8(JSON.stringify(exact));
  return packWorkbook(names, files);
}
