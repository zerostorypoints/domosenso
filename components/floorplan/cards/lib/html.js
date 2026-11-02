// Markup helpers the card and its tray share.

import { colourOf } from "./categories.js";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A category's colour as a dot before a name (catalog colours only, so safe in a style attribute).
export const dotHtml = (cat) => (cat ? `<span class="dot" style="background: ${colourOf(cat)}"></span>` : "");
