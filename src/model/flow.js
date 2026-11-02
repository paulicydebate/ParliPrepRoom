import { asKind, levelOf } from './blocks';
import { asSide, baseSpeech, columnsFor, isSpeech } from './speeches';
/** Rows a sheet shows, like a pre-made spreadsheet flow. */
export const SHEET_ROWS = 150;
/** Always leave at least this many empty rows below the last one used. */
export const MIN_GHOST_ROWS = 30;
/** Read the blocks of a ProseMirror-like doc. */
export function readBlocks(doc) {
    const out = [];
    doc.forEach((node, pos) => {
        if (node.type.name !== 'block')
            return;
        out.push({
            pos,
            size: node.nodeSize,
            id: node.attrs.id ?? null,
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
export function computeFlow(blocks) {
    const sheets = [];
    const preamble = [];
    const speechAt = new Map();
    let sheet = null;
    let group = null;
    let row = 1;
    const closeGroup = () => {
        if (!sheet || !group)
            return;
        let span = 1;
        for (const list of group.cells.values())
            span = Math.max(span, list.length);
        group.span = span;
        row = group.row + span;
        for (const list of group.cells.values()) {
            const last = list[list.length - 1];
            const p = sheet.placements.find((x) => x.pos === last.pos);
            if (p)
                p.rowSpan = span - (list.length - 1);
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
        const s = sheet;
        const base = baseSpeech(s.side);
        const colOf = (sp) => Math.max(1, s.columns.indexOf(sp) + 1);
        const explicit = b.speech && s.columns.includes(b.speech) ? b.speech : null;
        if (levelOf(b.kind) === 2) {
            closeGroup();
            s.placements.push({ pos: b.pos, col: 0, row, rowSpan: 1, speech: null, group: -1 });
            row++;
            continue;
        }
        const open = (start) => {
            if (b.gap > 0) {
                s.blanks.push({ row, count: b.gap, before: s.groups.length });
                row += b.gap;
            }
            return { index: s.groups.length, row, span: 1, from: b.pos, to: b.pos + b.size, cells: new Map(), current: start };
        };
        let g = group;
        let sp;
        if (b.kind === 'claim') {
            sp = explicit ?? base;
            if (!g || sp === base || b.newRow || b.gap > 0) {
                closeGroup();
                g = open(sp);
            }
            g.current = sp;
        }
        else {
            sp = explicit ?? g?.current ?? base;
            if (b.gap > 0) {
                closeGroup();
                g = null;
            }
            if (!g)
                g = open(sp);
            if (explicit)
                g.current = explicit;
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
export function sheetAt(layout, pos) {
    let found = null;
    for (const s of layout.sheets)
        if (s.pos <= pos)
            found = s;
    return found;
}
/**
 * Where to insert a new block for column `col` of a group so the document
 * stays in speaking order: after the last block in that column or an earlier one.
 */
export function insertPosFor(group, col) {
    let best = -1;
    for (const [c, list] of group.cells) {
        if (c > col)
            continue;
        for (const b of list)
            best = Math.max(best, b.pos + b.size);
    }
    return best >= 0 ? best : group.to;
}
