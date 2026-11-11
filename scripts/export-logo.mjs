// Renders the PNG app icons from the SVG master artwork.
// Usage: npm run logo:export   (needs Playwright with Chromium; a global install
// is found through NODE_PATH, e.g. NODE_PATH=$(npm root -g) npm run logo:export)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { readFile, writeFile } from "node:fs/promises";

const mark = await readFile(new URL("../public/zuno-mark.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
for (const size of [512, 192, 64]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // App icons sit on the dark canvas with clear space around the mark.
  await page.setContent(
    `<body style="margin:0;background:#080B12;display:grid;place-items:center;height:100vh">
       <div style="width:${Math.round(size * 0.68)}px">${mark}</div></body>`,
  );
  await writeFile(new URL(`../public/zuno-icon-${size}.png`, import.meta.url), await page.screenshot());
  await page.close();
}
// Contact sheet used to check the mark at small sizes on both themes.
const page = await browser.newPage({ viewport: { width: 760, height: 220 }, deviceScaleFactor: 2 });
const logoW = await readFile(new URL("../public/zuno-logo-white.svg", import.meta.url), "utf8");
const logoD = await readFile(new URL("../public/zuno-logo-dark.svg", import.meta.url), "utf8");
const fav = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
const flat = await readFile(new URL("../public/zuno-logo-flat-white.svg", import.meta.url), "utf8");
const row = (bg, logo) => `<div style="background:${bg};display:flex;align-items:center;gap:24px;padding:24px;height:110px;box-sizing:border-box">
  ${[16, 24, 32, 48].map((s) => `<div style="width:${s}px">${s <= 24 ? fav : mark}</div>`).join("")}
  <div style="width:150px">${logo}</div><div style="width:150px">${bg === "#080B12" ? flat : ""}</div></div>`;
await page.setContent(`<body style="margin:0">${row("#080B12", logoW)}${row("#F2F4F8", logoD)}</body>`);
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await browser.close();
