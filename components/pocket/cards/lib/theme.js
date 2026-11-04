// The pocket's colours, one set per theme, as CSS custom properties on the shell's root: every
// page uses var(--bg), var(--acc) and so on, never a colour of its own. The values are the
// approved mockup's, plus --on-warn (text on a --warn background). Dark follows Home Assistant's
// own choice (hass.themes.darkMode), so the phone's system setting reaches the pocket the way it
// reaches the rest of Home Assistant.

export const TOKENS = {
  light: {
    "--bg": "#f6f7f9", "--card": "#fff", "--fg": "#1c1f24", "--mut": "#6b7280", "--line": "#eceef1",
    "--acc": "#2f7cf6", "--warn": "#f59e0b", "--bad": "#ef4444", "--ok": "#10b981", "--chip": "#eef1f5",
    "--lamp": "#fbbf24", "--on-warn": "#1c1f24",
  },
  dark: {
    "--bg": "#0f1115", "--card": "#191c22", "--fg": "#eef0f3", "--mut": "#9aa1ab", "--line": "#262a31",
    "--acc": "#5b9bff", "--warn": "#fbbf24", "--bad": "#f87171", "--ok": "#34d399", "--chip": "#22262d",
    "--lamp": "#f5b83d", "--on-warn": "#0f1115",
  },
};

export function themeOf(hass) {
  return hass?.themes?.darkMode === true ? "dark" : "light";
}

// Sets the theme's tokens on `el` (its inline style) and names the theme in data-theme.
export function applyTheme(el, hass) {
  const theme = themeOf(hass);
  if (el.dataset.theme === theme) return;
  el.dataset.theme = theme;
  for (const [name, value] of Object.entries(TOKENS[theme])) el.style.setProperty(name, value);
}
