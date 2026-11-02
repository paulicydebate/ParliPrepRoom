// Turn dist/index.html into a page body for a claude.ai Artifact preview:
// no <html>/<head>/<body> wrapper, CSS inlined, JS kept as a separate file.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const script = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
const fonts = html.match(/<link\s+rel="stylesheet"\s+href="(https:\/\/fonts\.googleapis\.com[^"]+)"\s*\/?>/);
if (!script || !css || !fonts) throw new Error('Unexpected dist/index.html layout');

const icon = readFileSync('public/icon.svg', 'utf8');
const page = `<title>ParliPrepRoom</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<link rel="stylesheet" href="${fonts[1]}">
<style>
${readFileSync(`dist/${css[1]}`, 'utf8')}
</style>
<div id="root"></div>
<script type="module" src="./${script[1]}"></script>
`;
writeFileSync('dist/preview.html', page);

// The artifact host rejects a literal U+FFFD; libraries use it inside strings,
// where the escape means the same thing.
const jsPath = `dist/${script[1]}`;
writeFileSync(jsPath, readFileSync(jsPath, 'utf8').replaceAll('\uFFFD', '\\uFFFD'));
console.log(JSON.stringify({ page: 'dist/preview.html', script: script[1] }));
