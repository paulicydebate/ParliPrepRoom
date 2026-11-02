export function runsOf(block) {
    const out = [];
    for (const n of block.content ?? []) {
        if (n.type === 'hardBreak') {
            out.push({ text: '', br: true });
            continue;
        }
        if (n.type !== 'text' || !n.text)
            continue;
        const marks = new Set((n.marks ?? []).map((m) => m.type));
        out.push({
            text: n.text,
            bold: marks.has('bold') || undefined,
            italic: marks.has('italic') || undefined,
            underline: marks.has('underline') || undefined,
            strike: marks.has('strike') || undefined,
            highlight: marks.has('highlight') || undefined,
        });
    }
    return out;
}
export function download(data, filename, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export function safeFilename(title) {
    return title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'prep';
}
