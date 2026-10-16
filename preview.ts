#!/usr/bin/env bun
// Builds preview.html: every palette in palettes/ rendered on a mock WayVR
// panel (watch-style bar, buttons, toggle chips, toast) with the same corner
// radii that ui_round_multiplier=3.0 produces.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "palettes");
const ROUND = 3.0;
const r = (units: number) => `${units * ROUND}px`;

const cards = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort((a, b) => (a.includes("-dark") === b.includes("-dark") ? a.localeCompare(b) : a.includes("-dark") ? -1 : 1))
  .map((file) => {
    const p: Record<string, string> = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const vars = Object.entries(p).map(([k, v]) => `--${k}:${v}`).join(";");
    const swatches = Object.entries(p)
      .map(([k, v]) => `<div class="sw" style="background:${v}" title="${k} ${v}"></div>`)
      .join("");
    return `
<section class="card" style="${vars}">
  <header><code>${file}</code></header>
  <div class="frame">
    <div class="bar">
      <span class="time">20:48</span>
      <div class="chips">
        <button class="chip on">Screen 1</button>
        <button class="chip">Screen 2</button>
        <button class="chip">Keyboard</button>
      </div>
    </div>
    <div class="row">
      <button class="btn filled">Primary</button>
      <button class="btn tonal">Variant</button>
      <button class="btn sec">Secondary</button>
      <button class="btn ter">Tertiary</button>
    </div>
    <div class="row">
      <button class="btn ok">Saved</button>
      <button class="btn danger">Exit</button>
      <div class="keys">${"QWERTY".split("").map((k) => `<span class="key">${k}</span>`).join("")}</div>
    </div>
    <div class="toast"><b>Notification</b><span>Overlay pinned to world</span></div>
  </div>
  <div class="swatches">${swatches}</div>
</section>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>M3 Expressive WayVR</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--page:#141218;--ink:#e6e0e9;--muted:#948f99}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--page:#fef7ff;--ink:#1d1b20;--muted:#625b71}}
:root[data-theme="dark"]{--page:#141218;--ink:#e6e0e9;--muted:#948f99}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font-family:"Google Sans Flex","Roboto Flex",system-ui,sans-serif;padding:32px 16px}
h1{font-weight:700;font-size:clamp(28px,5vw,44px);letter-spacing:-.02em;margin:0 0 4px}
p.lead{color:var(--muted);margin:0 0 28px;max-width:62ch}
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))}
.card header{font-size:13px;color:var(--muted);margin-bottom:8px}
.frame{background:var(--background_contrast);border-radius:${r(8)};padding:14px;display:grid;gap:12px}
.bar{background:var(--background);color:var(--on_background);border-radius:${r(8)};padding:10px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.time{font-size:26px;font-weight:700;color:var(--primary);letter-spacing:-.02em}
.chips{display:flex;gap:6px;flex-wrap:wrap}
button{font:inherit;border:0;cursor:pointer}
.chip{background:var(--background_variant);color:var(--on_background_variant);border:1px solid var(--outline);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:500}
.chip.on{background:var(--primary);color:var(--on_primary);border-color:var(--primary)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{border-radius:999px;padding:10px 16px;font-weight:500;font-size:14px;transition:border-radius .25s cubic-bezier(.34,1.56,.64,1)}
.btn:hover{border-radius:${r(4)}}
.btn:hover,.chip:hover{box-shadow:inset 0 0 0 100px color-mix(in srgb,var(--highlight) 10%,transparent)}
.filled{background:var(--primary);color:var(--on_primary)}
.tonal{background:var(--background_variant);color:var(--on_background);border:1px solid var(--outline)}
.sec{background:var(--secondary);color:var(--on_secondary)}
.ter{background:var(--tertiary);color:var(--on_tertiary)}
.ok{background:var(--success);color:var(--on_success)}
.danger{background:var(--danger);color:var(--on_danger)}
.keys{display:flex;gap:4px;margin-left:auto}
.key{width:28px;height:28px;display:grid;place-items:center;border-radius:${r(4)};background:var(--background_variant);color:var(--on_background_variant);font-size:12px;font-weight:500}
.toast{background:var(--background);color:var(--on_background);border-left:4px solid var(--tertiary);border-radius:${r(6)};padding:10px 14px;display:grid;gap:2px;font-size:13px}
.toast span{color:var(--on_background_variant)}
.swatches{display:grid;grid-template-columns:repeat(19,1fr);gap:2px;margin-top:8px}
.sw{height:14px;border-radius:3px}
</style></head>
<body>
<h1>Material 3 Expressive for WayVR</h1>
<p class="lead">Each palette on a mock overlay panel, using the corner radii from <code>ui_round_multiplier: ${ROUND}</code>. The strip under each card shows all 19 palette slots in file order; hover a swatch for its role and hex.</p>
<div class="grid">${cards}</div>
</body></html>
`;

writeFileSync(join(import.meta.dir, "preview.html"), html);
console.log("wrote preview.html");
