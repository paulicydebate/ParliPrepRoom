import { strFromU8, unzipSync } from 'fflate';
import { newBlockId } from '../model/blocks';
import { SPEECHES } from '../model/speeches';
const block = (kind, runs, attrs = {}) => {
    const list = typeof runs === 'string' ? (runs ? [{ text: runs, marks: [] }] : []) : runs.filter((r) => r.text);
    return {
        type: 'block',
        attrs: { kind, id: newBlockId(), ...attrs },
        ...(list.length ? { content: list.map((r) => ({ type: 'text', text: r.text, ...(r.marks.length ? { marks: r.marks } : {}) })) } : {}),
    };
};
const doc = (content) => ({ type: 'doc', content: content.length ? content : [block('warrant', '')] });
// ---------- Word ----------
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function kindForStyle(style, outline) {
    const s = style.toLowerCase().replace(/\s+/g, '');
    if (s === 'title' || s === 'heading1' || outline === '0')
        return 'position';
    if (s === 'heading2' || s === 'subtitle' || outline === '1')
        return 'section';
    if (/^heading[3-9]$/.test(s) || outline === '2' || outline === '3')
        return 'claim';
    return 'warrant';
}
export function parseDocx(bytes) {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
    const xml = files['word/document.xml'];
    if (!xml)
        throw new Error("This doesn't look like a Word file.");
    const dom = new DOMParser().parseFromString(strFromU8(xml), 'application/xml');
    const out = [];
    for (const p of Array.from(dom.getElementsByTagNameNS(W, 'p'))) {
        const pPr = p.getElementsByTagNameNS(W, 'pPr')[0];
        const style = pPr?.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? '';
        const outline = pPr?.getElementsByTagNameNS(W, 'outlineLvl')[0]?.getAttributeNS(W, 'val') ?? null;
        const runs = [];
        for (const r of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
            const rPr = r.getElementsByTagNameNS(W, 'rPr')[0];
            const on = (tag) => {
                const el = rPr?.getElementsByTagNameNS(W, tag)[0];
                if (!el)
                    return false;
                const v = el.getAttributeNS(W, 'val');
                return v !== '0' && v !== 'false' && v !== 'none';
            };
            const marks = [];
            if (on('b'))
                marks.push({ type: 'bold' });
            if (on('i'))
                marks.push({ type: 'italic' });
            if (on('u'))
                marks.push({ type: 'underline' });
            if (on('strike'))
                marks.push({ type: 'strike' });
            if (on('highlight') || rPr?.getElementsByTagNameNS(W, 'shd')[0]?.getAttributeNS(W, 'fill')?.match(/^(?!auto|FFFFFF)/i))
                marks.push({ type: 'highlight' });
            let text = '';
            for (const c of Array.from(r.childNodes)) {
                const el = c;
                if (el.localName === 't')
                    text += el.textContent ?? '';
                else if (el.localName === 'tab')
                    text += '\t';
                else if (el.localName === 'br')
                    text += ' ';
            }
            if (text)
                runs.push({ text, marks });
        }
        const kind = kindForStyle(style, outline);
        const plain = runs.map((r) => r.text).join('');
        if (!plain.trim())
            continue;
        // A whole-line bold paragraph in body text is usually a claim tag.
        const allBold = runs.length > 0 && runs.every((r) => r.marks.some((m) => m.type === 'bold'));
        out.push(block(kind === 'warrant' && allBold && plain.length < 160 ? 'claim' : kind, runs));
    }
    return doc(out);
}
const colIndex = (ref) => {
    const letters = ref.replace(/[0-9]/g, '');
    let n = 0;
    for (const ch of letters)
        n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};
export function parseXlsx(bytes) {
    const files = unzipSync(bytes);
    const read = (name) => (files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml') : null);
    const wb = read('xl/workbook.xml');
    const rels = read('xl/_rels/workbook.xml.rels');
    if (!wb)
        throw new Error("This doesn't look like an Excel file.");
    const shared = [];
    const ss = read('xl/sharedStrings.xml');
    if (ss)
        for (const si of Array.from(ss.getElementsByTagName('si')))
            shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
    const target = new Map();
    if (rels)
        for (const r of Array.from(rels.getElementsByTagName('Relationship')))
            target.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '');
    const sheets = [];
    for (const s of Array.from(wb.getElementsByTagName('sheet'))) {
        const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
        let path = target.get(rid) ?? '';
        path = path.startsWith('/') ? path.slice(1) : `xl/${path}`;
        const sheet = read(path);
        if (!sheet)
            continue;
        const rows = [];
        for (const row of Array.from(sheet.getElementsByTagName('row'))) {
            const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
            const cells = [];
            for (const c of Array.from(row.getElementsByTagName('c'))) {
                const i = colIndex(c.getAttribute('r') ?? 'A1');
                const t = c.getAttribute('t');
                let v = '';
                if (t === 's')
                    v = shared[Number(c.getElementsByTagName('v')[0]?.textContent ?? -1)] ?? '';
                else if (t === 'inlineStr')
                    v = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('');
                else
                    v = c.getElementsByTagName('v')[0]?.textContent ?? '';
                cells[i] = v;
            }
            rows[r] = Array.from({ length: cells.length }, (_, k) => cells[k] ?? '');
        }
        sheets.push({ name: s.getAttribute('name') ?? `Sheet ${sheets.length + 1}`, rows: rows.map((r) => r ?? []) });
    }
    return sheets;
}
/** Minimal CSV reader (quotes, commas, newlines in quotes). */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (q) {
            if (ch === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (ch === '"')
                q = false;
            else
                cell += ch;
        }
        else if (ch === '"')
            q = true;
        else if (ch === ',') {
            row.push(cell);
            cell = '';
        }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n')
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += ch;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
const speechOf = (header) => {
    const h = header.trim().toUpperCase().replace(/[^A-Z]/g, '');
    return SPEECHES.includes(h) ? h : null;
};
/**
 * A sheet becomes a flow sheet: a header row naming speeches (PMC, LOC…) maps
 * columns to speeches; each row's first filled cell starts a row, later cells
 * become answers in their speech. Without speech headers, rows become claims.
 */
export function sheetsToDoc(sheets) {
    const out = [];
    for (const sh of sheets) {
        const rows = sh.rows.filter((r) => r.some((c) => c?.trim()));
        if (!rows.length)
            continue;
        const headerIdx = rows.findIndex((r) => r.filter((c) => speechOf(c ?? '')).length >= 2);
        const header = headerIdx >= 0 ? rows[headerIdx].map((c) => speechOf(c ?? '')) : null;
        const firstSpeech = header?.find(Boolean) ?? null;
        const side = firstSpeech === 'LOC' ? 'opp' : 'gov';
        out.push(block('position', sh.name, { side }));
        for (const r of header ? rows.slice(headerIdx + 1) : rows) {
            let started = false;
            r.forEach((cell, i) => {
                const text = (cell ?? '').trim();
                if (!text)
                    return;
                const sp = header?.[i] ?? null;
                const isBase = !sp || sp === firstSpeech;
                const lines = text.split(/\r?\n/).filter((l) => l.trim());
                lines.forEach((line, k) => {
                    const kind = k === 0 ? 'claim' : 'warrant';
                    const attrs = {};
                    if (sp && !isBase)
                        attrs.speech = sp;
                    // A row that starts in a later column still starts its own row.
                    if (k === 0 && !started && sp && !isBase)
                        attrs.newRow = true;
                    out.push(block(kind, line.trim(), attrs));
                });
                started = true;
            });
        }
    }
    return doc(out);
}
// ---------- Text / Markdown ----------
export function parseText(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trimEnd();
        if (!line.trim())
            continue;
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h)
            out.push(block(h[1].length === 1 ? 'position' : h[1].length === 2 ? 'section' : 'claim', h[2]));
        else
            out.push(block('warrant', line.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim()));
    }
    return doc(out);
}
export async function importFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'docx')
        return { title: name, json: parseDocx(new Uint8Array(await file.arrayBuffer())) };
    if (ext === 'xlsx')
        return { title: name, json: sheetsToDoc(parseXlsx(new Uint8Array(await file.arrayBuffer()))) };
    if (ext === 'csv')
        return { title: name, json: sheetsToDoc([{ name, rows: parseCsv(await file.text()) }]) };
    if (ext === 'txt' || ext === 'md' || ext === 'markdown')
        return { title: name, json: parseText(await file.text()) };
    if (ext === 'doc')
        throw new Error('Old .doc files aren’t supported. Open it in Word or Google Docs and save as .docx.');
    throw new Error('Pick a Word (.docx), Excel (.xlsx), CSV, text or Markdown file. From Google Docs or Sheets: File → Download.');
}
