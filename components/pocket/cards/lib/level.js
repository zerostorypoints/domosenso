// The level of a reading in one vocabulary, good / fair / poor (spec 4.1): computed where it is
// shown, never stored in an entity. Plain ES module: no imports, no DOM.
//
//   range    limits {low, high}: within (edges included) good, outside poor with side low / high;
//            no fair band until one is defined
//   rising   limits {fair, poor}: higher is worse; from fair fair, from poor poor (CO2, dust, VOC, NOx)
//   falling  limits {fair, poor}: lower is worse; below fair fair, below poor poor (the air score)
//
// A value or limit that is not a finite number gives null: no level.

const isNumber = (x) => typeof x === "number" && Number.isFinite(x);

export function level(value, kind, limits) {
  if (!isNumber(value) || limits == null || typeof limits !== "object") return null;
  if (kind === "range") {
    const { low, high } = limits;
    if (!isNumber(low) || !isNumber(high)) return null;
    if (value < low) return { level: "poor", side: "low" };
    if (value > high) return { level: "poor", side: "high" };
    return { level: "good" };
  }
  if (kind === "rising" || kind === "falling") {
    const { fair, poor } = limits;
    if (!isNumber(fair) || !isNumber(poor)) return null;
    const worse = kind === "rising" ? (limit) => value >= limit : (limit) => value < limit;
    if (worse(poor)) return { level: "poor" };
    if (worse(fair)) return { level: "fair" };
    return { level: "good" };
  }
  return null;
}

// An entity's state as a number, or null (missing, unavailable, unknown, not numeric).
export function numberOf(hass, entityId) {
  const state = entityId ? hass?.states?.[entityId]?.state : undefined;
  if (typeof state !== "string" || state.trim() === "") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}

// The colour a level is shown in, as the class suffix lv-<tone>: good, fair, poor, and for a
// reading outside a comfort range cold (below it) or warm (above it), as the Ramka shows them.
export function toneOf(result) {
  if (!result) return null;
  if (result.side === "low") return "cold";
  if (result.side === "high") return "warm";
  return result.level;
}

// The translation suffix of a level: good, fair, poor, or <level>_<side> for a comfort range.
export function levelKey(result) {
  return result.side ? `${result.level}_${result.side}` : result.level;
}
