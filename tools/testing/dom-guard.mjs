// The card tests' guard against happy-dom nodes in failing asserts (SPEC-028), one copy for every
// component: each component's testing/dom-env.mjs calls it on its window. testing/ never ships.
//
// A failing assert prints its operands in full, and a happy-dom node printed in full walks the whole
// window: gigabytes within a second, past any heap limit, and a runner killed on timeout leaves that
// process growing (it froze a Mac on 2026-11-01). The asserts the tests use compare a node by
// identity and name it `<tag>` when they fail; util.inspect prints it the same way.
import assertLoose from "node:assert";
import assertStrict from "node:assert/strict";

const BRIEF = Symbol.for("nodejs.util.inspect.custom");
const ASSERTS = ["equal", "strictEqual", "notEqual", "notStrictEqual", "deepEqual", "deepStrictEqual",
  "notDeepEqual", "notDeepStrictEqual"];

export function guardAsserts(window) {
  window.Node.prototype[BRIEF] = function brief() {
    return `<${String(this.nodeName).toLowerCase()}>`;
  };
  Object.defineProperty(window, BRIEF, { value: () => "[happy-dom Window]" });
  const isDom = (v) => v === window || v instanceof window.Node;
  const ids = new WeakMap();
  let lastId = 0;
  const token = (v) => {
    if (v === window) return "[happy-dom Window]";
    if (!ids.has(v)) ids.set(v, `<${String(v.nodeName).toLowerCase()} #${++lastId}>`);
    return ids.get(v);
  };
  // Arrays and plain objects with every node replaced by its token: the same node, the same token.
  const tokens = (v, depth = 0) => {
    if (isDom(v)) return token(v);
    if (depth > 6 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => tokens(x, depth + 1));
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tokens(x, depth + 1)]));
  };
  for (const mod of [assertLoose, assertStrict]) {
    for (const name of ASSERTS) {
      const original = mod[name].unguarded ?? mod[name];   // a second window replaces the first's guard
      // Identity asserts swap only a node itself: a rebuilt array would never be the same array.
      const swap = /deep/i.test(name) ? tokens : (v) => (isDom(v) ? token(v) : v);
      // The message only when given: node's assert refuses an explicit undefined one.
      const guarded = function guarded(actual, expected, ...message) {
        return original.call(this, swap(actual), swap(expected), ...message);
      };
      guarded.unguarded = original;
      mod[name] = guarded;
    }
  }
}
