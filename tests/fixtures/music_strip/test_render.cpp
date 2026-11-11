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
    for (Style st : {Style::PULSE, Style::GLOW, Style::BANDS, Style::CENTRE_METER, Style::SPECTRUM, Style::RIPPLE, Style::HEAT}) {
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
    // Intensity is how far the music moves the brightness: at 0 every lit part is steady at full,
    // at 100 % a quiet band is darker than a loud one.
    Features f = loud(0.8f);
    for (size_t b = 0; b < NUM_BANDS; b++) f.bands[b] = b < 4 ? 0.2f : 0.9f;
    auto spectrum = [&](float intensity) {
      const size_t n = 40;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::SPECTRUM, n);
      s.bass = BassPosition::START;
      s.intensity = intensity;
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return leds;
    };
    const Palette pal = builtin_palette(PaletteKind::SPECTRUM, Rgb{255, 255, 255});
    const auto steady = spectrum(0.0f);
    check(brightest(steady[0]) == brightest(palette_at(pal, 0.0f)) &&
              brightest(steady[39]) == brightest(palette_at(pal, 1.0f)),
          "intensity 0: quiet and loud bands both at full");
    const auto moving = spectrum(1.0f);
    check(brightest(moving[0]) < brightest(moving[39]) / 2, "intensity 100: a quiet band darker");
    Features silent{};
    const size_t n = 40;
    std::vector<Rgb> leds(n);
    Renderer r;
    RenderSettings s = settings(Style::SPECTRUM, n);
    s.intensity = 0.0f;
    for (int i = 0; i < 50; i++) r.render(silent, s, 0.0107f, leds.data(), n);
    bool dark = true;
    for (const Rgb &c : leds) dark = dark && !lit(c);
    check(dark, "intensity 0: dark when the music stops");
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

  {
    // The limit works on what the LEDs draw after the light's brightness and gamma (ESPHome's colour
    // correction), not on the frame's raw values: a frame that is mid-level before gamma draws a
    // fraction of its raw estimate and is left alone.
    const size_t n = 30;
    OutputCurve curve;
    curve.build(2.8f, 255);
    std::vector<Rgb> mid(n, Rgb{100, 100, 100});
    char msg[96];
    std::snprintf(msg, sizeof msg, "raw %.0f, output %.0f", estimate_ma(mid.data(), n), output_ma(mid.data(), n, curve));
    check(estimate_ma(mid.data(), n) > 500.0f && output_ma(mid.data(), n, curve) < 200.0f, "output draw after gamma", msg);
    limit_power(mid.data(), n, 500.0f, curve);
    check(same(mid[0], Rgb{100, 100, 100}), "a frame under the limit after gamma is untouched");

    std::vector<Rgb> white(120, Rgb{255, 255, 255});
    const float after = limit_power(white.data(), 120, 500.0f, curve);
    check(after <= 500.0f && output_ma(white.data(), 120, curve) <= 500.0f && lit(white[0]) && after > 400.0f,
          "white capped at 500 mA after gamma, not far below");

    OutputCurve half;
    half.build(2.8f, 128);
    std::vector<Rgb> full(n, Rgb{255, 255, 255});
    check(output_ma(full.data(), n, half) < 0.5f * output_ma(full.data(), n, curve), "brightness lowers the draw");

    OutputCurve linear;
    linear.build(1.0f, 255);
    check(std::fabs(output_ma(full.data(), n, linear) - estimate_ma(full.data(), n)) < 1.0f,
          "gamma 1 at full brightness equals the raw estimate");
  }


  {
    // Start and end: one run from the strip's beginning to its end, no mirror; the bass at the
    // beginning (start) or at the end (end).
    auto bass_only = []() {
      Features f = loud(0.8f);
      for (size_t b = 0; b < NUM_BANDS; b++) f.bands[b] = 0.0f;
      f.bands[0] = 1.0f;
      return f;
    };
    auto frame = [&](Style style, BassPosition bass, const Features &f) {
      const size_t n = 40;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(style, n);
      s.bass = bass;
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return leds;
    };
    const auto start = frame(Style::SPECTRUM, BassPosition::START, bass_only());
    check(lit(start[0]) && !lit(start[39]) && !lit(start[20]), "spectrum start: bass at the beginning only");
    const auto end = frame(Style::SPECTRUM, BassPosition::END, bass_only());
    check(lit(end[39]) && !lit(end[0]) && !lit(end[20]), "spectrum end: bass at the end only");
    const auto centre = frame(Style::SPECTRUM, BassPosition::CENTRE, bass_only());
    check(lit(centre[19]) && lit(centre[20]) && !lit(centre[0]) && !lit(centre[39]), "spectrum centre unchanged");

    // A treble-only signal lands at the other end.
    Features treble = loud(0.8f);
    for (size_t b = 0; b < NUM_BANDS; b++) treble.bands[b] = 0.0f;
    treble.bands[NUM_BANDS - 1] = 1.0f;
    const auto high = frame(Style::SPECTRUM, BassPosition::START, treble);
    check(lit(high[39]) && !lit(high[0]), "spectrum start: treble at the end");

    // The meter grows from the beginning at half level: the first half lit, the far end dark.
    const auto meter = frame(Style::CENTRE_METER, BassPosition::START, loud(0.5f));
    check(lit(meter[0]) && lit(meter[15]) && !lit(meter[35]), "meter start grows from the beginning");
    const auto meter_end = frame(Style::CENTRE_METER, BassPosition::END, loud(0.5f));
    check(lit(meter_end[39]) && !lit(meter_end[4]), "meter end grows from the end");
  }

  {
    // Heat: the bands laid along the strip; each LED's colour is its band's level through the
    // palette (quiet: the first stop, loud: the last), its brightness steady.
    auto heat = [](BassPosition bass, const Features &f) {
      const size_t n = 40;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::HEAT, n);
      s.bass = bass;
      s.intensity = 0.0f;  // steady brightness: these checks are about the colours
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return leds;
    };
    const Palette pal = builtin_palette(PaletteKind::SPECTRUM, Rgb{255, 255, 255});
    Features rising = loud(0.8f);
    for (size_t b = 0; b < NUM_BANDS; b++) rising.bands[b] = (float) b / (float) (NUM_BANDS - 1);
    const auto up = heat(BassPosition::START, rising);
    const Rgb quiet = palette_at(pal, 0.0f), loudest = palette_at(pal, 1.0f);
    char msg[128];
    std::snprintf(msg, sizeof msg, "first %u,%u,%u (quiet %u,%u,%u), last %u,%u,%u (loud %u,%u,%u)", up[0].r, up[0].g,
                  up[0].b, quiet.r, quiet.g, quiet.b, up[39].r, up[39].g, up[39].b, loudest.r, loudest.g, loudest.b);
    check(same(up[0], quiet) && same(up[39], loudest), "heat start: quiet bass, loud treble coloured by level", msg);
    // Steady brightness: a middle LED is exactly the palette's colour for its level, not dimmed.
    const float mid_level = (20.0f / 39.0f * (float) (NUM_BANDS - 1)) / (float) (NUM_BANDS - 1);
    check(same(up[20], palette_at(pal, mid_level)), "heat brightness steady");
    const auto down = heat(BassPosition::END, rising);
    check(same(down[39], quiet) && same(down[0], loudest), "heat end: reversed");

    Features even = loud(0.8f);
    for (size_t b = 0; b < NUM_BANDS; b++) even.bands[b] = 0.5f;
    const auto flat = heat(BassPosition::START, even);
    check(same(flat[0], palette_at(pal, 0.5f)) && same(flat[0], flat[39]) && same(flat[0], flat[17]),
          "heat equal bands: one colour");

    Features silent{};
    const auto dark = heat(BassPosition::START, silent);
    bool none = true;
    for (const Rgb &c : dark) none = none && !lit(c);
    check(none, "heat silence: dark");
  }

  {
    // The strip's own gamma: a mid grey leaves as the LED value that looks mid grey (2.8: 37 of 255).
    auto grey = [](float gamma) {
      const size_t n = 10;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::SPECTRUM, n);
      parse_palette("#808080,#808080", s.palette);
      s.colour_gamma = gamma;
      Features f = loud(0.8f);
      for (size_t b = 0; b < NUM_BANDS; b++) f.bands[b] = 1.0f;
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return leds[5];
    };
    char msg[64];
    const Rgb g = grey(2.8f);
    std::snprintf(msg, sizeof msg, "got %u", g.r);
    check(g.r >= 36 && g.r <= 38 && g.r == g.g && g.g == g.b, "colour gamma 2.8 on a mid grey", msg);
    check(same(grey(1.0f), Rgb{128, 128, 128}), "colour gamma 1 leaves the frame");
  }

  {
    // Pastel mixes each LED toward white at its own brightness.
    auto red = [](float pastel) {
      const size_t n = 10;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::SPECTRUM, n);
      parse_palette("#ff2000,#ff2000", s.palette);
      s.pastel = pastel;
      Features f = loud(0.8f);
      for (size_t b = 0; b < NUM_BANDS; b++) f.bands[b] = 1.0f;
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return leds[5];
    };
    check(same(red(0.0f), Rgb{255, 32, 0}), "pastel 0 leaves the colour");
    const Rgb half = red(0.5f);
    char msg[64];
    std::snprintf(msg, sizeof msg, "got %u,%u,%u", half.r, half.g, half.b);
    check(half.r == 255 && half.g >= 143 && half.g <= 144 && half.b >= 127 && half.b <= 128, "pastel 50 %", msg);
    check(same(red(1.0f), Rgb{255, 255, 255}), "pastel 100 % is white at the colour's brightness");
  }

  {
    const Palette p = builtin_palette(PaletteKind::PASTEL, Rgb{255, 255, 255});
    bool soft = p.count == 5;
    for (uint8_t i = 0; i < p.count; i++) soft = soft && std::min(p.stops[i].r, std::min(p.stops[i].g, p.stops[i].b)) >= 150;
    check(soft, "pastel palette: five soft stops");
  }

  {
    // Heat with intensity: each band's brightness follows its own level, so the quietest band fades
    // out entirely at 100 % (with the single palette: one colour, dark where quiet).
    Features rising = loud(0.8f);
    for (size_t b = 0; b < NUM_BANDS; b++) rising.bands[b] = (float) b / (float) (NUM_BANDS - 1);
    const size_t n = 40;
    std::vector<Rgb> leds(n);
    Renderer r;
    RenderSettings s = settings(Style::HEAT, n);
    s.bass = BassPosition::START;
    s.intensity = 1.0f;
    for (int i = 0; i < 50; i++) r.render(rising, s, 0.0107f, leds.data(), n);
    check(!lit(leds[0]) && lit(leds[39]) && brightest(leds[10]) < brightest(leds[30]), "heat intensity 100: quiet bands fade out");
  }

  {
    // The light's brightness reaches the eye as its square (50 % gives a quarter of the light),
    // applied to the frame before rounding; ESPHome scales by the brightness once more, linearly.
    auto draw = [](uint8_t brightness) {
      const size_t n = 30;
      std::vector<Rgb> leds(n);
      Renderer r;
      RenderSettings s = settings(Style::SPECTRUM, n);
      s.intensity = 0.0f;
      s.brightness = brightness;
      Features f = loud(0.8f);
      for (size_t b = 0; b < NUM_BANDS; b++) f.bands[b] = 1.0f;
      for (int i = 0; i < 50; i++) r.render(f, s, 0.0107f, leds.data(), n);
      return r.last_ma() - IDLE_MA * (float) n;
    };
    const float full = draw(255), half = draw(128);
    char msg[64];
    std::snprintf(msg, sizeof msg, "full %.0f mA, half %.0f mA", full, half);
    check(half > 0.2f * full && half < 0.3f * full, "brightness 50 % gives a quarter of the light", msg);
  }

  return failures ? 1 : 0;
}
