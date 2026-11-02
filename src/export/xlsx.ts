import { strToU8, zipSync } from 'fflate';
import type { Node as PMNode } from '@tiptap/pm/model';
import { computeFlow, readBlocks } from '../model/flow';
import { SPEECH_INFO } from '../model/speeches';
import { runsOf, type Run } from './runs';

// A small hand-written .xlsx writer: one worksheet per flow sheet, one
// spreadsheet row per flow row, one column per speech, gov/opp tinted like
// a paper flow. Opens in Excel, Google Sheets and Numbers.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function colName(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Style ids in styles.xml below.
const S = { headGov: 1, headOpp: 2, bodyGov: 3, bodyOpp: 4, section: 5 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD6E4FA"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFADFD2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEF5F1"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right><top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" xfId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" xfId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" xfId="0" fontId="0" fillId="4" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" xfId="0" fontId="0" fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" xfId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function richCell(ref: string, style: number, lines: { runs: Run[]; claim: boolean }[]) {
  if (!lines.length) return `<c r="${ref}" s="${style}"/>`;
  const parts: string[] = [];
  lines.forEach((line, i) => {
    const prefix = i > 0 ? '\n' : '';
    const runs = line.runs.length ? line.runs : [{ text: '' }];
    runs.forEach((r, j) => {
      const text = (j === 0 ? prefix : '') + (r.br ? '\n' : r.text);
      const props = [line.claim || r.bold ? '<b/>' : '', r.italic ? '<i/>' : '', r.underline ? '<u/>' : '', r.strike ? '<strike/>' : '']
        .filter(Boolean)
        .join('');
      parts.push(`<r>${props ? `<rPr>${props}</rPr>` : ''}<t xml:space="preserve">${esc(text)}</t></r>`);
    });
  });
  return `<c r="${ref}" s="${style}" t="inlineStr"><is>${parts.join('')}</is></c>`;
}

function sheetName(title: string, used: Set<string>) {
  let base = title.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

export function buildFlowXlsx(doc: PMNode): Uint8Array {
  const layout = computeFlow(readBlocks(doc as never));
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const sheets = layout.sheets.length ? layout.sheets : [];
  const names: string[] = [];

  sheets.forEach((sheet, si) => {
    names.push(sheetName(sheet.title, used));
    const rows: string[] = [];
    const merges: string[] = [];
    const lastCol = colName(sheet.columns.length - 1);
    rows.push(
      `<row r="1">${sheet.columns
        .map((sp, i) => `<c r="${colName(i)}1" s="${SPEECH_INFO[sp].side === 'gov' ? S.headGov : S.headOpp}" t="inlineStr"><is><t>${sp}</t></is></c>`)
        .join('')}</row>`,
    );
    let r = 2;
    // Walk sections and groups in document order.
    const items: ({ kind: 'section'; pos: number } | { kind: 'group'; index: number; pos: number })[] = [
      ...sheet.placements.filter((p) => p.col === 0).map((p) => ({ kind: 'section' as const, pos: p.pos })),
      ...sheet.groups.map((g) => ({ kind: 'group' as const, index: g.index, pos: g.from })),
    ].sort((a, b) => a.pos - b.pos);
    for (const item of items) {
      if (item.kind === 'section') {
        const node = doc.nodeAt(item.pos);
        rows.push(`<row r="${r}">${richCell(`A${r}`, S.section, [{ runs: node ? runsOf(node.toJSON()) : [], claim: false }])}</row>`);
        merges.push(`<mergeCell ref="A${r}:${lastCol}${r}"/>`);
        r++;
        continue;
      }
      const g = sheet.groups[item.index];
      const cells = sheet.columns.map((sp, ci) => {
        const list = g.cells.get(ci + 1) ?? [];
        const lines = list.map((b) => {
          const node = doc.nodeAt(b.pos)!;
          const mark = ({ extend: '→ ', dropped: '[DROPPED] ', answered: '✓ ', key: '★ ' } as Record<string, string>)[String(node.attrs.mark)];
          const runs = runsOf(node.toJSON());
          return { runs: mark ? [{ text: mark, bold: true }, ...runs] : runs, claim: node.attrs.kind === 'claim' };
        });
        return richCell(`${colName(ci)}${r}`, SPEECH_INFO[sp].side === 'gov' ? S.bodyGov : S.bodyOpp, lines);
      });
      rows.push(`<row r="${r}">${cells.join('')}</row>`);
      r++;
    }
    const cols = sheet.columns.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="38" customWidth="1"/>`).join('');
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : ''}</worksheet>`,
    );
  });

  if (!sheets.length) {
    names.push('Flow');
    files['xl/worksheets/sheet1.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>No sheets yet: add a Position title.</t></is></c></row></sheetData></worksheet>`,
    );
  }

  const n = names.length;
  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  files['xl/styles.xml'] = strToU8(STYLES);
  return zipSync(files, { level: 6 });
}
