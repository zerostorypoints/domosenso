// The pocket's colours as CSS custom properties on the shell's root: every page uses var(--bg),
// var(--acc) and so on, never a colour of its own. Plain ES module: no DOM beyond the element given.
//
//   themeOf(mode, systemDark) -> "light" | "dark"   the person's Appearance (lib/settings.js theme):
//                               "system" follows the phone (prefers-color-scheme), not Home
//                               Assistant's darkMode; "light" and "dark" force that variant
//   tokensOf(theme, hass) -> {name: value}
//   applyTheme(el, hass, {mode, systemDark})        sets them on el, names the theme in data-theme
//
// The base tokens (BASE) come from Home Assistant's theme variables, so the pocket has HA's
// contrast: var(--primary-background-color, <the pocket's value>) and so on. HA's variables carry
// only the theme it shows now (hass.themes.darkMode), so a variant forced against it takes the
// pocket's own values for all its tokens. The level colours (--ok, --warn, --bad, --cold, --warm),
// --chip, --lamp and --on-warn are always the pocket's own.

export const BASE = {
  "--bg": "--primary-background-color",
  "--card": "--card-background-color",
  "--fg": "--primary-text-color",
  "--mut": "--secondary-text-color",
  "--line": "--divider-color",
  "--acc": "--primary-color",
};

// The pocket's own values: the approved mockup's, plus --on-warn (text on a --warn background) and
// the comfort sides, --cold below a range (blue) and --warm above it (red), as the Ramka shows them.
export const TOKENS = {
  light: {
    "--bg": "#f6f7f9", "--card": "#fff", "--fg": "#1c1f24", "--mut": "#6b7280", "--line": "#eceef1",
    "--acc": "#2f7cf6", "--warn": "#f59e0b", "--bad": "#ef4444", "--ok": "#10b981", "--chip": "#eef1f5",
    "--lamp": "#fbbf24", "--on-warn": "#1c1f24", "--cold": "#2563eb", "--warm": "#e5484d",
  },
  dark: {
    "--bg": "#0f1115", "--card": "#191c22", "--fg": "#eef0f3", "--mut": "#9aa1ab", "--line": "#262a31",
    "--acc": "#5b9bff", "--warn": "#fbbf24", "--bad": "#f87171", "--ok": "#34d399", "--chip": "#22262d",
    "--lamp": "#f5b83d", "--on-warn": "#0f1115", "--cold": "#60a5fa", "--warm": "#ff6b5c",
  },
};

export const MODES = ["system", "light", "dark"];

export function themeOf(mode, systemDark) {
  if (mode === "light" || mode === "dark") return mode;
  return systemDark ? "dark" : "light";
}

const haTheme = (hass) => (hass?.themes?.darkMode === true ? "dark" : "light");

export function tokensOf(theme, hass) {
  const own = TOKENS[theme] ?? TOKENS.light;
  const tokens = { ...own };
  if (haTheme(hass) !== theme) return tokens;
  for (const [name, ha] of Object.entries(BASE)) tokens[name] = `var(${ha}, ${own[name]})`;
  return tokens;
}

// Rewrites the tokens only when the theme or HA's own theme changed.
export function applyTheme(el, hass, { mode = "system", systemDark = false } = {}) {
  const theme = themeOf(mode, systemDark);
  const key = `${theme}/${haTheme(hass)}`;
  if (el._themeKey === key) return;
  el._themeKey = key;
  el.dataset.theme = theme;
  for (const [name, value] of Object.entries(tokensOf(theme, hass))) el.style.setProperty(name, value);
}
