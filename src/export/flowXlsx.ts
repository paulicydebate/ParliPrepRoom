import { strToU8 } from 'fflate';
import { childrenOf, rootsOf, type FlowCell, type FlowMark, type FlowSheetData } from '../flow2/model';
import { SPEECH_INFO } from '../model/speeches';
import { colName, esc, packWorkbook, richCell, S, sheetName } from './xlsx';

// A flow (the cell-based one) as an Excel file: one worksheet per sheet, one column per speech. An argument
// sits in the row where it starts and what answers it sits to its right, so it reads like a paper flow
// and can be read back in (src/import/flowImport.ts). Marks are written in front of the text.

export const MARK_PREFIX: Record<FlowMark, string> = { extended: '→ ', dropped: '[DROPPED] ', answered: '✓ ', key: '★ ' };

/** Which row each cell starts in: an argument takes as many rows as the answers under it need. */
export function flowRows(cells: FlowCell[]): { rows: number; at: Map<string, number> } {
  const at = new Map<string, number>();
  let next = 0;
  const place = (c: FlowCell): number => {
    const start = next;
    at.set(c.id, start);
    const kids = childrenOf(cells, c.id);
    if (!kids.length) next++;
    else for (const k of kids) place(k);
    return start;
  };
  for (const r of rootsOf(cells)) {
    next += r.gap;
    place(r);
  }
  return { rows: next, at };
}

export function buildFlow2Xlsx(sheets: FlowSheetData[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const names: string[] = [];
  sheets.forEach((sheet, si) => {
    names.push(sheetName(sheet.name || `Sheet ${si + 1}`, used));
    const { rows, at } = flowRows(sheet.cells);
    const out: string[] = [];
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
      out.push(
        `<row r="${r + 2}">${cols
          .map((ci) => {
            const c = line.get(ci)!;
            const sp = sheet.columns[ci];
            const prefix = c.mark ? MARK_PREFIX[c.mark] : '';
            return richCell(`${colName(ci)}${r + 2}`, SPEECH_INFO[sp].side === 'gov' ? S.bodyGov : S.bodyOpp, [{ runs: [{ text: prefix + c.text }], claim: false }]);
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
  return packWorkbook(names, files);
}
