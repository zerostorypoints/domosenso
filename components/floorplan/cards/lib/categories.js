// Device categories (SPEC-028 Amendment 5): the catalog's categories/*.yaml, shipped as
// categories.json by tools/category_index.py. The same test as tools/domosenso_cli/categories.py;
// tests/fixtures/category-cases.json proves both agree. A device here is SPEC-010's scan form:
// integrations, manufacturer, model, model_id, entity_domains, device_classes, entity_names, is_hub.

import index from "./categories.json" with { type: "json" };

export const CATEGORIES = index.categories;
export const PLACEABLE = CATEGORIES.filter((c) => c.placeable);
const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const FALLBACK = CATEGORIES.find((c) => c.fallback);

export const categoryById = (id) => BY_ID.get(id) ?? null;

const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

// Python's fnmatchcase on lower-cased text: * any run, ? one character, [...] a set.
function glob(value, patterns) {
  if (value === undefined || value === null) return false;
  const text = String(value).toLowerCase();
  return list(patterns).some((p) => {
    const re = String(p).toLowerCase().replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${re}$`, "s").test(text);
  });
}

// SPEC-010's rule test (hwscan.matches), plus only_entity_domain.
export function ruleMatches(rule, dev) {
  const has = (set, items) => items.some((x) => set.has(x));
  const domains = new Set(dev.entity_domains);
  const classes = new Set(dev.device_classes);
  if ("only_entity_domain" in rule) {
    const allowed = new Set(list(rule.only_entity_domain));
    if (!domains.size || [...domains].some((d) => !allowed.has(d))) return false;
  }
  const integrations = new Set(dev.integrations);
  if ("integration" in rule && !has(integrations, list(rule.integration))) return false;
  if (!list(rule.with_integration).every((x) => integrations.has(x))) return false;
  for (const key of ["manufacturer", "model", "model_id"]) {
    if (key in rule && !glob(dev[key], rule[key])) return false;
  }
  if ("unless_manufacturer" in rule && glob(dev.manufacturer, rule.unless_manufacturer)) return false;
  if ("entity_domain" in rule && !has(domains, list(rule.entity_domain))) return false;
  if (!list(rule.device_classes).every((c) => classes.has(c))) return false;
  return list(rule.entity_names).every((p) => (dev.entity_names || []).some((n) => glob(n, p)));
}

// `further`: looking for a further role, where a rule with extra_role: false does not count.
function match(cat, dev, further = false) {
  if (cat.hub && dev.is_hub) return { id: cat.id, marker: cat.marker };
  const rule = cat.rules.find((r) => !(further && r.extra_role === false) && ruleMatches(r, dev));
  return rule ? { id: cat.id, marker: rule.marker ?? cat.marker } : null;
}

// [{id, marker}]: its category (the first match by order, else the fallback), then every further
// category marked extra_role that matches it: what else it senses (a radar on a Bluetooth proxy).
export function rolesOf(dev) {
  const roles = [];
  for (const cat of CATEGORIES) {
    if (roles.length && !cat.extra_role) continue;
    const found = match(cat, dev, roles.length > 0);
    if (found) roles.push(found);
  }
  return roles.length ? roles : [{ id: FALLBACK.id, marker: FALLBACK.marker }];
}

// {id, marker}: the first category whose hub test or rules match, else the fallback.
export const categoryOf = (dev) => rolesOf(dev)[0];

// A category's name in the dashboard language, English when it has none.
export function categoryName(cat, lang) {
  return cat.names[lang] ?? cat.names[String(lang).split("-")[0]] ?? cat.names.en;
}

// The colour other cards may share: the theme's --floorplan-<id>, else the catalog's default.
export const colourOf = (cat) => `var(--floorplan-${cat.id}, ${cat.colour})`;
