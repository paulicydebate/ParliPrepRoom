import { AlignmentType, BorderStyle, Document, HeadingLevel, PageOrientation, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { FlowCell, FlowSheetData } from '../flow2/model';
import { SPEECH_INFO } from '../model/speeches';
import { cellValue, flowRows } from './flowXlsx';

// A flow as a Word document: one landscape page section per sheet, with a table that has a column per speech. An
// argument sits in the row where it starts and what answers it sits to its right, the same rows as the Excel export.
// Marks are written in front of the text, as in Excel.

const GOV = { head: 'D6E4FA', body: 'F3F7FE', text: '1F4E9C' };
const OPP = { head: 'FADFD2', body: 'FEF5F1', text: '9A3412' };
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function lines(text: string, size: number, bold = false, color?: string): Paragraph[] {
  return text.split('\n').map((line) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size, bold, color, font: 'Calibri' })] }));
}

function sheetSection(sheet: FlowSheetData) {
  const { rows, at } = flowRows(sheet.cells);
  const grid = new Map<number, Map<number, FlowCell>>();
  for (const c of sheet.cells) {
    const r = at.get(c.id);
    if (r === undefined) continue;
    if (!grid.has(r)) grid.set(r, new Map());
    grid.get(r)!.set(c.col - 1, c);
  }
  const colors = sheet.columns.map((sp) => (SPEECH_INFO[sp].side === 'gov' ? GOV : OPP));
  const width = Math.floor(100 / sheet.columns.length);
  const header = new TableRow({
    tableHeader: true,
    children: sheet.columns.map(
      (sp, i) =>
        new TableCell({
          width: { size: width, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: colors[i].head },
          borders: BORDERS,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sp, bold: true, size: 20, font: 'Calibri' })] })],
        }),
    ),
  });
  const body: TableRow[] = [];
  for (let r = 0; r < rows; r++) {
    const line = grid.get(r);
    if (!line) continue;
    body.push(
      new TableRow({
        cantSplit: true,
        children: sheet.columns.map((_, i) => {
          const c = line.get(i);
          return new TableCell({
            width: { size: width, type: WidthType.PERCENTAGE },
            shading: c ? { type: ShadingType.CLEAR, color: 'auto', fill: colors[i].body } : undefined,
            borders: BORDERS,
            children: c ? lines(cellValue(c), 18, !c.parent, colors[i].text) : [new Paragraph('')],
          });
        }),
      }),
    );
  }
  return {
    properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 120 }, children: [new TextRun({ text: `${sheet.name || 'Sheet'}  `, font: 'Calibri' }), new TextRun({ text: sheet.side.toUpperCase(), size: 18, bold: true, color: sheet.side === 'gov' ? GOV.text : OPP.text, font: 'Calibri' })] }),
      body.length ? new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }) : new Paragraph({ children: [new TextRun({ text: 'Nothing on this sheet yet.', italics: true, color: '666666' })] }),
    ],
  };
}

export async function buildFlowDocx(sheets: FlowSheetData[], title: string): Promise<Blob> {
  const document = new Document({
    title,
    creator: 'ParliPrepRoom',
    sections: sheets.length ? sheets.map(sheetSection) : [{ children: [new Paragraph('No sheets yet.')] }],
  });
  return Packer.toBlob(document);
}
