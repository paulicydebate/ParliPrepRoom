import type { Node as PMNode } from '@tiptap/pm/model';
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun, type ParagraphChild } from 'docx';
import { asKind, type BlockKind } from '../model/blocks';
import { getSettings } from '../settings/settings';
import { runsOf } from './runs';

// Word export of the doc view, using the reader's chosen fonts and sizes.
// Position/section/claim map to Word headings so the navigation pane works.

const HEADING: Partial<Record<BlockKind, (typeof HeadingLevel)[keyof typeof HeadingLevel]>> = {
  position: HeadingLevel.HEADING_1,
  section: HeadingLevel.HEADING_2,
  claim: HeadingLevel.HEADING_3,
};

const WORD_FONT: Record<string, string> = { 'Source Serif': 'Source Serif 4' };

export async function buildDocx(doc: PMNode, title: string): Promise<Blob> {
  const settings = getSettings();
  const paragraphs: Paragraph[] = [];
  doc.forEach((node) => {
    if (node.type.name !== 'block') return;
    const kind = asKind(node.attrs.kind);
    const st = settings.styles[kind];
    const font = WORD_FONT[st.font] ?? st.font;
    const size = Math.round(st.size * 0.75 * 2); // px -> pt -> half-points
    const color = st.color ? st.color.replace('#', '') : kind === 'note' ? '666666' : undefined;
    const children: ParagraphChild[] = runsOf(node.toJSON()).map((r) =>
      r.br
        ? new TextRun({ text: '', break: 1 })
        : new TextRun({
            text: r.text,
            font,
            size,
            color,
            bold: st.bold || r.bold,
            italics: st.italic || r.italic,
            underline: st.underline || r.underline ? {} : undefined,
            strike: r.strike,
            highlight: r.highlight ? 'yellow' : undefined,
          }),
    );
    const markLabel = ({ extend: 'EXTEND', dropped: 'DROPPED', answered: 'ANSWERED', key: 'KEY' } as Record<string, string>)[String(node.attrs.mark)];
    if (markLabel) children.unshift(new TextRun({ text: `[${markLabel}] `, font: 'Calibri', size: 16, bold: true, color: node.attrs.mark === 'dropped' ? 'B42318' : '1F6F5C' }));
    if (kind === 'position' && node.attrs.side) {
      children.push(new TextRun({ text: `  ${String(node.attrs.side).toUpperCase()}`, font: 'Calibri', size: 16, bold: true, color: node.attrs.side === 'opp' ? 'C2410C' : '2F6FD6' }));
    }
    const body = kind === 'warrant' || kind === 'analytic';
    paragraphs.push(
      new Paragraph({
        heading: HEADING[kind],
        children,
        alignment: AlignmentType.LEFT,
        indent: body ? { left: 360 } : undefined,
        spacing: { before: kind === 'position' ? 360 : kind === 'section' ? 240 : kind === 'claim' ? 160 : 40, after: 60 },
      }),
    );
  });

  const document = new Document({
    title,
    creator: 'ParliPrepRoom',
    styles: {
      // Keep Word's heading styles from recoloring our text.
      paragraphStyles: (['Heading1', 'Heading2', 'Heading3'] as const).map((id, i) => ({
        id,
        name: `Heading ${i + 1}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { color: '000000' },
        paragraph: { keepNext: true },
      })),
    },
    sections: [{ children: paragraphs }],
  });
  return Packer.toBlob(document);
}
