// The Ramka's named colours: one list for every colour a setting picks (the Air page's good, fair
// and poor colours, the Climate page's neutral colour, a Custom widget's colour). Each is a series
// colour of the Ramka's theme (themes/ramka.yaml, --graph-color-N, dark and light), so a choice
// follows the theme mode; the fallback is the theme's dark colour, for a dashboard without the
// theme. A setting stores the colour's id: the input_selects' options (templates/package.yaml.j2,
// `colours`, held to this list by tests/test_ramka_render.py) and a Custom widget's `color`.
// Plain ES module: no imports, no DOM.

// [id, theme slot, fallback], in the order the dropdowns offer them.
export const COLOURS = [
  ["green", 9, "#5be37a"],
  ["teal", 4, "#4fd1b5"],
  ["blue", 1, "#5b8def"],
  ["light blue", 8, "#8fd3ff"],
  ["purple", 5, "#b388ff"],
  ["pink", 6, "#ff8ac2"],
  ["magenta", 11, "#e040fb"],
  ["amber", 2, "#f5c542"],
  ["orange", 7, "#ffa94d"],
  ["red", 3, "#ff7a5c"],
  ["grey", 10, "#c7c7c7"],
];

export const COLOUR_IDS = COLOURS.map(([id]) => id);

// The translation key of a colour's name (card.colours.<id>, a space as _).
export const colourKey = (id) => `card.colours.${id.replace(/ /g, "_")}`;

// A colour id's CSS colour, the theme's variable with its fallback; null for no colour of the list.
export function colourCss(id) {
  const c = COLOURS.find(([cid]) => cid === id);
  return c ? `var(--graph-color-${c[1]}, ${c[2]})` : null;
}

// The colour an input_select names: its state's CSS colour, else the default id's.
export function selectedColour(states, entity, fallbackId) {
  return colourCss(states?.[entity]?.state) || colourCss(fallbackId);
}

// A Custom widget's colour from before the list (the build that stored a theme slot number): the
// slot's colour id. Every slot the old dialog offered (4, 5, 6, 9, 11, 10) has one, so no choice
// is lost.
export function colourOfSlot(slot) {
  const c = COLOURS.find(([, s]) => s === slot);
  return c ? c[0] : null;
}
