// Names in several languages. The home inputs may give a name per language ({en: "Office",
// de: "Büro"}); one pocket dashboard serves every language, so the card picks the name of the
// language the person chose (lib/settings.js language) when it draws. Plain ES module: no DOM.
//
//   nameIn(name, lang) -> string | name   a language map resolved: lang's, else English's, else the
//       first given; anything else (a plain string, nothing) as it is
//   localize(config, lang) -> config      a copy of the card's config with every `name` that is a
//       language map resolved; the pages keep reading `name` as a string

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// A language map: an object of language codes to strings. An object of other shape is data, not
// a name, and is left alone.
function isNameMap(value) {
  if (!isObject(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, text]) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(key) && typeof text === "string");
}

export function nameIn(name, lang) {
  if (!isNameMap(name)) return name;
  return name[lang] ?? name.en ?? Object.values(name)[0];
}

export function localize(config, lang) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObject(node)) return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = key === "name" ? nameIn(value, lang) : walk(value);
    return out;
  };
  return walk(config);
}
