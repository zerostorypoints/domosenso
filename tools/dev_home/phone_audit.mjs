// A phone-size audit of a dashboard on a running local demo (tools/dev-home.py up): for each phone
// size and route, the page must not scroll sideways, every control a finger taps must measure at
// least --target px both ways (Apple's 44 pt; Android asks 48 dp with spacing), and no text may be
// cut. Fictional data only. Uses the website's Playwright (as screenshots.mjs).
//
//   node tools/dev_home/phone_audit.mjs --name <demo> [--out <dir>] [--dashboard dashboard-pocket-en/home]
//        [--routes home:#/,...] [--sizes 360x780,375x667,390x844,412x915,440x956,844x390] [--target 44]
//
// Prints one line per finding and ends with `ok` or `FAIL <n> findings`; with --out also writes a
// screenshot per size and route.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { chromium } = createRequire(path.join(root, "website/package.json"))("playwright-core");

// Every page the router knows, so a page added later is audited without touching this list: Home and
// its Systems view, each page of the bar and System, Controls' Status, each Settings panel and one area.
const router = await import(new URL("../../components/pocket/cards/lib/router.js", import.meta.url).href);
const DEFAULT_ROUTES = [
  "home:#/", "systems:#/systems",
  ...[...router.TABS, router.SYSTEM].filter((tab) => tab.page !== "home").map((tab) => `${tab.page}:${tab.route}`),
  "status:#/controls/status", "area:#/area/living_room",
  ...router.SETTINGS_PANELS.map((panel) => `${panel}:#/settings/${panel}`),
].join(",");
const { values: o } = parseArgs({ options: {
  name: { type: "string" }, out: { type: "string" },
  dashboard: { type: "string", default: "dashboard-pocket-en/home" },
  routes: { type: "string", default: DEFAULT_ROUTES },
  sizes: { type: "string", default: "360x780,375x667,390x844,412x915,440x956,844x390" },
  target: { type: "string", default: "44" },
} });
if (!o.name) throw new Error("--name is required");
const dev = path.join(root, ".domosenso/dev");
const dir = fs.readdirSync(dev).find((d) => d.endsWith(`-${o.name}`));
if (!dir) throw new Error(`no demo named ${o.name}`);
const runtime = JSON.parse(fs.readFileSync(path.join(dev, dir, "runtime.json"), "utf8"));
const auth = JSON.parse(fs.readFileSync(path.join(dev, dir, "auth.json"), "utf8"));
const base = `http://127.0.0.1:${runtime.port}`;
const target = Number(o.target);

// Runs in the page: walks every shadow root under the Pocket card.
function measure(minTarget) {
  const app = (function find(node) {
    for (const el of node.querySelectorAll("*")) {
      if (el.tagName === "POCKET-APP") return el;
      if (el.shadowRoot) { const hit = find(el.shadowRoot); if (hit) return hit; }
    }
    return null;
  })(document);
  const all = [];
  (function walk(node) {
    for (const el of node.querySelectorAll("*")) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); }
  })(app?.shadowRoot ?? document);
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    for (let e = el; e; e = e.parentElement || e.getRootNode()?.host) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return null;
    }
    return r;
  };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  const where = (el) => {
    const parts = [];
    for (let e = el; e && parts.length < 3; e = e.parentElement) parts.unshift(e.className && typeof e.className === "string" ? `${e.tagName.toLowerCase()}.${e.className.split(" ")[0]}` : e.tagName.toLowerCase());
    return parts.join(">");
  };
  const findings = [];
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > width + 1) findings.push(`scrolls sideways: ${document.documentElement.scrollWidth} > ${width}`);
  for (const el of all) {
    const tappable = el.matches("button, a[href], select, input:not([type=hidden]), [role=button], [role=tab], [role=switch], pocket-light-tile");
    if (tappable && !el.disabled && !el.closest?.("[hidden]")) {
      const r = shown(el);
      if (r && (r.width < minTarget - 0.5 || r.height < minTarget - 0.5)) {
        findings.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} "${label(el)}" (${where(el)})`);
      }
    }
    const s = getComputedStyle(el);
    if (el.children.length === 0 && el.textContent.trim() && (s.overflow === "hidden" || s.overflowX === "hidden")) {
      if (el.scrollWidth > el.clientWidth + 1 && s.whiteSpace !== "normal") findings.push(`cut text "${label(el)}" (${where(el)})`);
    }
    // A word split over two lines (a narrow box with overflow-wrap: anywhere or break-word).
    if (el.children.length === 0 && el.textContent.trim() && shown(el)) {
      for (const node of el.childNodes) {
        if (node.nodeType !== 3) continue;
        const re = /\S{3,}/g;
        let m;
        while ((m = re.exec(node.textContent))) {
          const range = document.createRange();
          range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
          const tops = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
          if (tops.size > 1) findings.push(`broken word "${m[0]}" (${where(el)})`);
        }
      }
    }
    const r = el.children.length === 0 && el.textContent.trim() ? shown(el) : null;
    // Inside a row that scrolls sideways (the pills, the area strip) a swipe reaches it: not off screen.
    const scrolls = (e) => {
      for (let a = e.parentElement || e.getRootNode()?.host; a; a = a.parentElement || a.getRootNode()?.host) {
        if (["auto", "scroll"].includes(getComputedStyle(a).overflowX)) return true;
      }
      return false;
    };
    if (r && (r.right > width + 1 || r.left < -1) && !scrolls(el)) findings.push(`off screen "${label(el)}" ${Math.round(r.left)}..${Math.round(r.right)} (${where(el)})`);
  }
  return findings;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
let failures = 0;
for (const size of o.sizes.split(",")) {
  const [w, h] = size.split("x").map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript((t) => localStorage.setItem("hassTokens", JSON.stringify(t)), { ...auth, hassUrl: base, token_type: "Bearer" });
  const page = await context.newPage();
  let first = true;
  for (const [name, hash] of o.routes.split(",").map((s) => s.split(/:(.*)/s))) {
    if (first) await page.goto(`${base}/${o.dashboard}${hash}`, { waitUntil: "networkidle" });
    else await page.evaluate((x) => { location.hash = x; }, hash);
    await page.waitForTimeout(first ? 4000 : 1800);
    first = false;
    const findings = [...new Set(await page.evaluate(measure, target))];
    for (const f of findings) console.log(`${size} ${name}: ${f}`);
    failures += findings.length;
    if (o.out) {
      fs.mkdirSync(o.out, { recursive: true });
      await page.screenshot({ path: path.join(o.out, `${size}-${name}.png`) });
    }
  }
  await context.close();
}
await browser.close();
console.log(failures ? `FAIL ${failures} findings` : "ok");
process.exitCode = failures ? 1 : 0;
