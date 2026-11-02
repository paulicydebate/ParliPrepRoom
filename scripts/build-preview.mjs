// Turn dist/index.html into a page body for a claude.ai Artifact preview:
// no <html>/<head>/<body> wrapper, CSS inlined, JS kept as separate files.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const script = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
const fonts = html.match(/<link\s+rel="stylesheet"\s+href="(https:\/\/fonts\.googleapis\.com[^"]+)"\s*\/?>/);
if (!script || !css || !fonts) throw new Error('Unexpected dist/index.html layout');

const icon = readFileSync('public/icon.svg', 'utf8');
writeFileSync(
  'dist/preview.html',
  `<title>ParliPrepRoom</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<link rel="stylesheet" href="${fonts[1]}">
<style>
${readFileSync(`dist/${css[1]}`, 'utf8')}
</style>
<div id="root"></div>
<script type="module" src="./${script[1]}"></script>
`,
);

// The artifact host rejects a literal U+FFFD; libraries use it inside
// strings, where the escape means the same thing.
const files = { 'icon.svg': 'dist/icon.svg' };
for (const f of readdirSync('dist/assets').filter((f) => f.endsWith('.js'))) {
  const path = `dist/assets/${f}`;
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('�', '\\uFFFD'));
  files[`assets/${f}`] = path;
}
console.log(JSON.stringify(files));
