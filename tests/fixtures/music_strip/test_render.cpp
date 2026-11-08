// Host test for strip_render.h; prints "ok <name>" or "FAIL <name>: ..." per check.
#include "strip_render.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <vector>

using namespace music_strip;

static int failures = 0;
static void check(bool cond, const char *name, const char *detail = "") {
  if (cond) {
    std::printf("ok %s\n", name);
  } else {
    std::printf("FAIL %s: %s\n", name, detail);
    failures++;
  }
}

static bool lit(const Rgb &c) { return c.r || c.g || c.b; }
static bool same(const Rgb &a, const Rgb &b) { return a.r == b.r && a.g == b.g && a.b == b.b; }
static int brightest(const Rgb &c) { return std::max(c.r, std::max(c.g, c.b)); }

static RenderSettings settings(Style style, size_t n) {
  RenderSettings s{};
  s.style = style;
  s.palette = builtin_palette(PaletteKind::SPECTRUM, Rgb{255, 255, 255});
  s.intensity = 1.0f;
  s.mounting = Mounting::FRONT;
  s.beat_strength = 0.5f;
  s.bass = BassPosition::CENTRE;
  s.first = 0;
  s.count = (uint16_t) n;
  s.power_limit_ma = 100000.0f;
  return s;
}

static Features loud(float envelope) {
  Features f{};
  f.envelope = envelope;
  for (float &b : f.bands) b = envelope;
  f.balance = 0.0f;
  return f;
}

static bool symmetric(const std::vector<Rgb> &v, size_t lo, size_t hi) {
  for (size_t i = lo, j = hi - 1; i < j; i++, j--)
    if (!same(v[i], v[j])) return false;
  return true;
}

int main() {
  {
    Palette p{};
    check(parse_palette("#ff3000,#ffb000,#2050ff", p) && p.count == 3 && p.stops[0].r == 0xff && p.stops[0].g == 0x30 &&
              p.stops[2].b == 0xff,
          "palette parse three");
    check(parse_palette(" #FF3000 , #00ff00 ", p) && p.count == 2 && p.stops[1].g == 0xff, "palette parse spaces");
    const Palette before = p;
    bool unchanged = true;
    for (const char *bad : {"#ff3000", "#000001,#000002,#000003,#000004,#000005,#000006", "#fff,#000", "red,blue", "",
                            "#ff3000,", "#gg0000,#000000"}) {
      Palette q = before;
      unchanged = unchanged && !parse_palette(bad, q) && q.count == before.count && same(q.stops[0], before.stops[0]) &&
                  same(q.stops[1], before.stops[1]);
    }
    check(unchanged, "palette parse refuses and keeps", "a bad palette parsed or changed the output");
  }

  {
    Palette p{};
    parse_palette("#ff0000,#00ff00,#0000ff", p);
    check(same(palette_at(p, 0.0f), Rgb{255, 0, 0}) && same(palette_at(p, 1.0f), Rgb{0, 0, 255}) &&
              same(palette_at(p, 0.5f), Rgb{0, 255, 0}),
          "palette_at stops");
    check(same(palette_at(p, -1.0f), Rgb{255, 0, 0}) && same(palette_at(p, 2.0f), Rgb{0, 0, 255}), "palette_at clamps");
    const Palette single = builtin_palette(PaletteKind::SINGLE, Rgb{10, 20, 30});
    check(single.count == 2 && same(single.stops[0], Rgb{0, 0, 0}) && same(single.stops[1], Rgb{10, 20, 30}),
          "single palette");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n);
    bool ok = true;
    for (Style st : {Style::PULSE, Style::GLOW, Style::BANDS, Style::CENTRE_METER, Style::SPECTRUM, Style::RIPPLE}) {
      Renderer r;
      RenderSettings s = settings(st, n);
      s.first = 110;
      s.count = 50;
      Features f = loud(1.0f);
      f.beat = true;
      r.render(f, s, 0.01f, leds.data(), n);
      for (size_t i = 0; i < 110; i++) ok = ok && !lit(leds[i]);
      s.count = 0;
      r.render(f, s, 0.01f, leds.data(), n);
      for (size_t i = 0; i < n; i++) ok = ok && !lit(leds[i]);
    }
    check(ok, "window clamps and blacks the rest", "a style lit an LED outside its window");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n);
    Renderer r;
    RenderSettings s = settings(Style::PULSE, n);
    r.render(loud(0.0f), s, 0.01f, leds.data(), n);
    bool dark = true;
    for (const Rgb &c : leds) dark = dark && !lit(c);
    check(dark, "pulse dark at envelope 0");
    r.render(loud(1.0f), s, 0.01f, leds.data(), n);
    bool uniform = brightest(leds[0]) >= 200;
    for (const Rgb &c : leds) uniform = uniform && same(c, leds[0]);
    check(uniform, "pulse uniform and bright at envelope 1");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n);
    Renderer r;
    r.render(loud(0.5f), settings(Style::CENTRE_METER, n), 0.01f, leds.data(), n);
    bool ok = symmetric(leds, 0, n);
    for (size_t i = 31; i <= 88; i++) ok = ok && lit(leds[i]);
    for (size_t i = 0; i < 29; i++) ok = ok && !lit(leds[i]) && !lit(leds[n - 1 - i]);
    check(ok, "centre meter half lit, symmetric");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n);
    Features f{};
    f.envelope = 1.0f;
    f.bands[0] = 1.0f;
    Renderer a, b;
    RenderSettings s = settings(Style::SPECTRUM, n);
    a.render(f, s, 0.01f, leds.data(), n);
    const bool centre = lit(leds[59]) && lit(leds[60]) && !lit(leds[0]) && !lit(leds[n - 1]) && symmetric(leds, 0, n);
    s.bass = BassPosition::ENDS;
    b.render(f, s, 0.01f, leds.data(), n);
    const bool ends = lit(leds[0]) && lit(leds[n - 1]) && !lit(leds[59]) && !lit(leds[60]) && symmetric(leds, 0, n);
    check(centre, "spectrum bass at the centre");
    check(ends, "spectrum bass at the ends");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n);
    Renderer r;
    RenderSettings s = settings(Style::RIPPLE, n);
    Features f = loud(0.0f);
    f.beat = true;
    r.render(f, s, 0.01f, leds.data(), n);
    f.beat = false;
    int last = -1;
    bool outward = true, sym = true;
    for (int frame = 0; frame < 20; frame++) {
      r.render(f, s, 0.01f, leds.data(), n);
      // The brightest LED in the right half is the wave's front.
      int front = 60, top = -1;
      for (size_t i = 60; i < n; i++)
        if (brightest(leds[i]) > top) top = brightest(leds[i]), front = (int) i;
      outward = outward && front >= last && top > 0;
      last = front;
      sym = sym && symmetric(leds, 0, n);
    }
    char msg[64];
    std::snprintf(msg, sizeof msg, "front ended at %d", last);
    check(outward && last > 65, "ripple moves outward", msg);
    check(sym, "ripple symmetric");
  }

  {
    const size_t n = 60;
    std::vector<Rgb> full(n), soft(n);
    bool ok = true;
    for (Style st : {Style::PULSE, Style::GLOW, Style::BANDS, Style::CENTRE_METER, Style::SPECTRUM, Style::RIPPLE}) {
      Renderer a, b;
      RenderSettings s = settings(st, n);
      Features f = loud(0.8f);
      f.beat = true;
      a.render(f, s, 0.01f, full.data(), n);
      s.intensity = 0.2f;
      b.render(f, s, 0.01f, soft.data(), n);
      for (size_t i = 0; i < n; i++)
        ok = ok && soft[i].r <= full[i].r && soft[i].g <= full[i].g && soft[i].b <= full[i].b;
    }
    check(ok, "intensity never brighter when lower");
  }

  {
    const size_t n = 120;
    std::vector<Rgb> leds(n, Rgb{255, 255, 255});
    const float before = estimate_ma(leds.data(), n);
    check(before > 7000.0f && before < 7400.0f, "estimate full white 120");
    float after = limit_power(leds.data(), n, 3000.0f);
    check(after <= 3000.0f && estimate_ma(leds.data(), n) <= 3000.0f && lit(leds[0]), "limit to 3000 mA");
    std::vector<Rgb> idle(n, Rgb{255, 255, 255});
    after = limit_power(idle.data(), n, 100.0f);
    bool dark = after <= 120.0f;
    for (const Rgb &c : idle) dark = dark && !lit(c);
    check(dark, "limit below idle blacks the frame");
    std::vector<Rgb> dim(n, Rgb{10, 10, 10});
    limit_power(dim.data(), n, 3000.0f);
    check(same(dim[0], Rgb{10, 10, 10}) && same(dim[n - 1], Rgb{10, 10, 10}), "limit above the draw changes nothing");
  }

  {
    // The same step in balance takes longer to settle on the floor than in front of the listener.
    auto frames_to_settle = [](Mounting m) {
      const size_t n = 30;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::GLOW, n);
      s.mounting = m;
      Features f = loud(0.8f);
      for (int i = 0; i < 300; i++) r.render(f, s, 0.01f, leds.data(), n);
      const Rgb from = leds[n / 2];
      f.balance = 1.0f;
      Renderer settled;
      std::vector<Rgb> target(n);
      for (int i = 0; i < 300; i++) settled.render(f, s, 0.01f, target.data(), n);
      const Rgb to = target[n / 2];
      const int span = std::abs((int) to.b - (int) from.b) + std::abs((int) to.r - (int) from.r);
      for (int i = 1; i < 1000; i++) {
        r.render(f, s, 0.01f, leds.data(), n);
        const Rgb c = leds[n / 2];
        const int left = std::abs((int) to.b - (int) c.b) + std::abs((int) to.r - (int) c.r);
        if (left * 10 <= span) return i;
      }
      return 1000;
    };
    const int front = frames_to_settle(Mounting::FRONT), floor = frames_to_settle(Mounting::FLOOR);
    char msg[64];
    std::snprintf(msg, sizeof msg, "front %d frames, floor %d", front, floor);
    check(floor > front, "mounting floor slower than front", msg);
  }

  {
    // A plain colour (no style) is capped through the light's maximum brightness: the largest
    // maximum whose draw, after ESPHome's gamma, stays within the limit.
    const Rgb white{255, 255, 255};
    const uint8_t m = solid_max_brightness(white, 2.8f, 120, 500.0f);
    char msg[96];
    std::snprintf(msg, sizeof msg, "max %u, draw %.0f, next %.0f", m, solid_ma(white, m, 2.8f, 120),
                  solid_ma(white, (uint8_t) (m + 1), 2.8f, 120));
    check(m > 0 && m < 255 && solid_ma(white, m, 2.8f, 120) <= 500.0f &&
              solid_ma(white, (uint8_t) (m + 1), 2.8f, 120) > 500.0f,
          "solid white 120 LEDs capped at 500 mA", msg);
    check(solid_max_brightness(Rgb{40, 0, 0}, 2.8f, 30, 500.0f) == 255, "a dim solid colour is not capped");
    check(solid_max_brightness(white, 2.8f, 120, 100.0f) == 0, "a limit below idle gives a dark solid colour");
    // Linear (gamma 1): 30 LEDs draw 1 + 60 m / 255 mA each; 500 mA allows m = 66.
    std::snprintf(msg, sizeof msg, "got %u", solid_max_brightness(white, 1.0f, 30, 500.0f));
    check(solid_max_brightness(white, 1.0f, 30, 500.0f) == 66, "solid cap linear", msg);
    check(std::fabs(solid_ma(white, 255, 2.8f, 120) - estimate_ma(std::vector<Rgb>(120, white).data(), 120)) < 1.0f,
          "solid draw at full equals the frame estimate");
  }

  return failures ? 1 : 0;
}
