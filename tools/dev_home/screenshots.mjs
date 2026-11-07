// Phone-size screenshots of a dashboard on a running local demo (tools/dev-home.py up), for a pull
// request's description: fictional data only, never a real home. Uses the website's Playwright
// (npm ci --prefix website; npx playwright install chromium).
//
//   node tools/dev_home/screenshots.mjs --name <demo name> --out <dir> [--dashboard dashboard-pocket-en/home]
//        [--routes name:#/hash,...] [--click <exact text>] [--dark] [--width 390 --height 844]
//        [--wait <ms before the first screen, default 4000; a card that loads more slowly shows HA's
//        "Configuration error" placeholder until it is defined>]
//
// Each route is opened in the same page (hash routes, nothing reloads) and saved as <out>/<name>.png;
// with --click the element with that text is tapped first (a sheet, a menu). Logs in with the demo's
// own generated tokens (.domosenso/dev/<identity>/auth.json).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { chromium } = createRequire(path.join(root, "website/package.json"))("playwright-core");

const { values: o } = parseArgs({ options: {
  name: { type: "string" }, out: { type: "string" },
  dashboard: { type: "string", default: "dashboard-pocket-en/home" },
  routes: { type: "string", default: "home:#/" },
  click: { type: "string" }, dark: { type: "boolean", default: false },
  width: { type: "string", default: "390" }, height: { type: "string", default: "844" },
  wait: { type: "string", default: "4000" },
} });
if (!o.name || !o.out) throw new Error("--name and --out are required");

const dev = path.join(root, ".domosenso/dev");
const dir = fs.readdirSync(dev).find((d) => d.endsWith(`-${o.name}`));
if (!dir) throw new Error(`no demo named ${o.name}; run tools/dev-home.py up --name ${o.name}`);
const runtime = JSON.parse(fs.readFileSync(path.join(dev, dir, "runtime.json"), "utf8"));
const auth = JSON.parse(fs.readFileSync(path.join(dev, dir, "auth.json"), "utf8"));
const base = `http://127.0.0.1:${runtime.port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const context = await browser.newContext({
  viewport: { width: Number(o.width), height: Number(o.height) }, deviceScaleFactor: 2,
  colorScheme: o.dark ? "dark" : "light",
});
await context.addInitScript((t) => localStorage.setItem("hassTokens", JSON.stringify(t)),
  { ...auth, hassUrl: base, token_type: "Bearer" });
const page = await context.newPage();
fs.mkdirSync(o.out, { recursive: true });
let first = true;
for (const [name, hash] of o.routes.split(",").map((s) => s.split(/:(.*)/s))) {
  if (first) await page.goto(`${base}/${o.dashboard}${hash}`, { waitUntil: "networkidle" });
  else await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(first ? Number(o.wait) : 2500);
  first = false;
  if (o.click) {
    await page.getByText(o.click, { exact: true }).first().click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(o.out, `${name}.png`) });
  console.log(path.join(o.out, `${name}.png`));
}
await browser.close();
