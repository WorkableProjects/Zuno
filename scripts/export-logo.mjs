// Renders the PNG app icons from the v2 SVG master artwork in public/ZunoLogosv2.
// Usage: npm run logo:export   (needs Playwright with Chromium; a global install
// is found through NODE_PATH, e.g. NODE_PATH=$(npm root -g) npm run logo:export)
// Pass a path to also save a contact sheet of the mark and lockups.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFile, writeFile } from "node:fs/promises";

const dir = new URL("../public/ZunoLogosv2/", import.meta.url);
const read = (name) => readFile(new URL(name, dir), "utf8");
const icon = await read("zuno-app-icon.svg");
const browser = await chromium.launch();
for (const size of [512, 192, 64]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0"><div style="width:${size}px;height:${size}px">${icon.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body>`);
  await page.addStyleTag({ content: "body{background:transparent}" });
  await writeFile(new URL(`zuno-icon-${size}.png`, dir), await page.screenshot({ omitBackground: true }));
  await page.close();
}
if (process.argv[2]) {
  const [mark, markDark, lockup, lockupDark] = await Promise.all(["zuno-mark.svg", "zuno-mark-dark.svg", "zuno-lockup-horizontal.svg", "zuno-lockup-dark.svg"].map(read));
  const page = await browser.newPage({ viewport: { width: 760, height: 220 }, deviceScaleFactor: 2 });
  const row = (bg, m, l) => `<div style="background:${bg};display:flex;align-items:center;gap:24px;padding:24px;height:110px;box-sizing:border-box">
    ${[16, 24, 32, 48].map((s) => `<div style="width:${s}px">${m}</div>`).join("")}<div style="width:200px">${l}</div></div>`;
  await page.setContent(`<body style="margin:0">${row("#14102A", markDark, lockupDark)}${row("#F2F4F8", mark, lockup)}</body>`);
  await page.screenshot({ path: process.argv[2] });
}
await browser.close();
