import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReading, sampleWithBand } from "./wifi-checks.js";

const AT = Date.parse("2026-11-11T17:05:00Z");
const B1 = "02:00:00:00:00:0b";
const B2 = "02:00:00:00:00:0c";
const scan = (i, extra = {}) => ({ t: new Date(AT + 1000 * (i + 1)).toISOString(), ssid: "Home", bssid: B1, mac: "02:00:00:00:00:aa",
  dbm: -61, noise: -96, channel: 40, standard: "802.11ax", rx: 2401, tx: 1921, mhz: null, ...extra });
const five = (dbms = [-60, -62, -61, -61, -61]) => dbms.map((dbm, i) => scan(i, { dbm }));
const resolved = (over = {}) => () => ({ ap: "dev-ap", band: "5", via: "bssid", ...over });
const ctx = (over = {}) => ({
  pending: { code: "abc", floor_id: "ground", x: 3.4, y: 2.1, at: AT, method: "shortcut-event", phone: "ios" },
  now: AT + 8000, userId: "u1", readingUserId: "u1", ssid: "Home", resolve: resolved(), ...over,
});
const failed = (r) => r.checks.filter((c) => !c.ok).map((c) => `${c.level}:${c.id}`);

test("a clean reading passes every check and becomes SPEC-045's sample", () => {
  const r = checkReading(five(), ctx());
  assert.deepEqual(failed(r), []);
  assert.equal(r.needsBand, false);
  assert.deepEqual(r.sample, {
    floor_id: "ground", x: 3.4, y: 2.1, t: "2026-11-11T17:05:05Z", band: "5", channel: 40, dbm: -61, noise: -96, ap: "dev-ap",
    bssid: B1, source: "phone", phone: "ios", method: "shortcut", spread: 2, scans: five() });
  assert.deepEqual(r.rates, { rx: 2401, tx: 1921 });
  assert.ok(r.checks.every((c) => c.reason === `card.pocket.wifi.check.${c.id}`));
});

test("hard failures keep nothing", () => {
  const cases = [
    [ctx({ pending: null }), "hard:fresh"],
    [ctx({ now: AT + 121_000 }), "hard:fresh"],
    [ctx({ readingUserId: "someone-else" }), "hard:phone"],
    [ctx({ ssid: "Neighbours" }), "hard:network"],
  ];
  for (const [c, want] of cases) {
    const r = checkReading(five(), c);
    assert.ok(failed(r).includes(want), `${want}: ${failed(r)}`);
    assert.equal(r.sample, null, want);
  }
  const early = five();
  early[0] = { ...early[0], t: new Date(AT - 5000).toISOString() };
  assert.ok(failed(checkReading(early, ctx())).includes("hard:fresh"), "a scan from before Measure");
  assert.deepEqual(failed(checkReading([], ctx())), ["hard:wifi", "hard:count"]);
  assert.deepEqual(failed(checkReading(five().slice(0, 2), ctx())), ["hard:count"]);
});

test("no user on the reading (x-callback, Android) skips the phone check; no expected SSID skips the network one", () => {
  assert.deepEqual(failed(checkReading(five(), ctx({ readingUserId: null, ssid: null }))), []);
});

test("an access point the plan does not know is soft: kept without ap", () => {
  const r = checkReading(five(), ctx({ resolve: resolved({ ap: null, via: "channel" }) }));
  assert.deepEqual(failed(r), ["soft:known_ap"]);
  assert.equal(r.sample.ap, undefined);
  assert.equal(r.sample.band, "5");
});

test("the majority BSSID's scans make the sample; a BSSID change or a spread over 6 dB is soft", () => {
  const scans = five([-60, -62, -61, -80, -61]);
  scans[3] = { ...scans[3], bssid: B2 };
  const r = checkReading(scans, ctx());
  assert.deepEqual(failed(r), ["soft:steady"]);
  assert.equal(r.sample.dbm, -61);
  assert.equal(r.sample.spread, 2);
  assert.equal(r.sample.scans.length, 5, "every scan is kept");
  const wide = checkReading(five([-58, -60, -65, -61, -61]), ctx());
  assert.deepEqual(failed(wide), ["soft:steady"]);
  assert.equal(wide.sample.spread, 7);
});

test("an unclear band asks the person: sampleWithBand sets it", () => {
  const r = checkReading(five(), ctx({ resolve: resolved({ ap: null, band: null, via: null }) }));
  assert.equal(r.needsBand, true);
  assert.deepEqual(failed(r), ["soft:known_ap", "soft:band"]);
  assert.equal(r.sample.band, undefined);
  assert.equal(sampleWithBand(r.sample, "6").band, "6");
});

test("a reading far below the prediction passes every check: the model is never a check", () => {
  const r = checkReading(five([-90, -91, -90, -90, -89]), ctx({ prediction: -60 }));
  assert.deepEqual(failed(r), []);
  assert.equal(r.sample.dbm, -90);
});

test("the first scan's rate is not trusted: rates are medians", () => {
  const scans = five();
  scans[0] = { ...scans[0], rx: 6 };
  assert.equal(checkReading(scans, ctx()).rates.rx, 2401);
});

test("Android: the companion method, the phone's device id, the band from the frequency the resolver was given", () => {
  const scans = five().map((s) => ({ ...s, mac: null, noise: null, channel: null, standard: null, tx: null, mhz: 5180 }));
  let asked;
  const r = checkReading(scans, ctx({ pending: { ...ctx().pending, method: "companion", phone: "dev-sam" }, readingUserId: null,
    resolve: (reading) => { asked = reading; return { ap: "dev-ap", band: "5", via: "bssid" }; } }));
  assert.deepEqual(asked, { bssid: B1, mac: null, mhz: 5180, channel: null });
  assert.equal(r.sample.method, "companion");
  assert.equal(r.sample.phone, "dev-sam");
  assert.equal(r.sample.noise, undefined, "no noise from Android");
});

test("fresh: a scan time cut to the second just before Measure is fine (the Shortcut writes whole seconds), 5 s before is not", () => {
  const tap = AT + 700;                                          // Measure at .700, the first scan in the same second
  const scans = five().map((x, i) => ({ ...x, t: new Date(AT + 1000 * i).toISOString().replace(/\.\d+Z$/, "Z") }));
  assert.deepEqual(failed(checkReading(scans, ctx({ pending: { ...ctx().pending, at: tap } }))), []);
  const old = [{ ...scans[0], t: new Date(AT - 5000).toISOString() }, ...scans.slice(1)];
  assert.ok(failed(checkReading(old, ctx({ pending: { ...ctx().pending, at: tap } }))).includes("hard:fresh"));
});
