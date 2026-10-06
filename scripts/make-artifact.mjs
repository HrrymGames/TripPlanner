// Builds a single self-contained HTML page (inline CSS + JS) for publishing as a claude.ai Artifact.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist-artifact';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('Bundle contains </script — cannot inline safely');

// The artifact host already pads :root by the safe-area insets, so the header sticks below that instead.
const hostOverrides = `
.topbar { top: env(safe-area-inset-top, 0px); padding-top: 10px; }
`;

const html = `<title>Trip Booker</title>
<meta name="description" content="Plan group trips in seconds: flights, villas, hotels and totals sorted for you.">
<style>
${css}
${hostOverrides}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/trip-booker.html', html);
console.log(`artifact/trip-booker.html: ${(html.length / 1024).toFixed(0)} KB`);
