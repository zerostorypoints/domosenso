#pragma once
// The strip's frame from the music features, std only so a host test can compile it without ESPHome.
// Every style draws by distance from the centre of the LED window, so a frame is always mirrored
// about it: the strip sits between two speakers and the music has no left or right at one microphone.
#include "music_features.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace music_strip {

struct Rgb {
  uint8_t r, g, b;
};

enum class Style { PULSE, GLOW, BANDS, CENTRE_METER, SPECTRUM, RIPPLE };
enum class PaletteKind { SPECTRUM, WARM, COOL, SINGLE, CUSTOM };
enum class Mounting { FRONT, WALL, FLOOR };
// Centre and ends mirror the music about the window's centre; start and end lay it out once from
// the window's beginning to its end, the bass first (start) or last (end).
enum class BassPosition { CENTRE, ENDS, START, END };

constexpr size_t MAX_STOPS = 5;

struct Palette {
  Rgb stops[MAX_STOPS];
  uint8_t count;
};

// x 0..1 over evenly spaced stops, linear between them.
inline Rgb palette_at(const Palette &p, float x) {
  if (p.count == 0) return Rgb{0, 0, 0};
  if (p.count == 1 || !(x > 0.0f)) return p.stops[0];
  if (x >= 1.0f) return p.stops[p.count - 1];
  const float pos = x * (float) (p.count - 1);
  const size_t i = std::min((size_t) pos, (size_t) p.count - 2);
  const float t = pos - (float) i;
  const Rgb &a = p.stops[i], &b = p.stops[i + 1];
  auto mix = [t](uint8_t u, uint8_t v) { return (uint8_t) std::lround((float) u + ((float) v - (float) u) * t); };
  return Rgb{mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)};
}

namespace detail {
inline int hex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  c = (char) std::tolower((unsigned char) c);
  return c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
}
}  // namespace detail

// 2-5 comma-separated #rrggbb, spaces around each allowed. false leaves `out` as it was, so a typo in
// the setting keeps the last good palette on the strip.
inline bool parse_palette(const char *text, Palette &out) {
  if (text == nullptr) return false;
  Palette p{};
  const char *s = text;
  while (true) {
    while (*s == ' ') s++;
    if (*s != '#' || p.count == MAX_STOPS) return false;
    int v[6];
    for (int k = 0; k < 6; k++) {
      v[k] = detail::hex(s[1 + k]);
      if (v[k] < 0) return false;
    }
    p.stops[p.count++] = Rgb{(uint8_t) (v[0] * 16 + v[1]), (uint8_t) (v[2] * 16 + v[3]), (uint8_t) (v[4] * 16 + v[5])};
    s += 7;
    while (*s == ' ') s++;
    if (*s == '\0') break;
    if (*s != ',') return false;
    s++;
  }
  if (p.count < 2) return false;
  out = p;
  return true;
}

inline Palette builtin_palette(PaletteKind kind, Rgb single) {
  Palette p{};
  const char *text = nullptr;
  switch (kind) {
    case PaletteKind::WARM:
      text = "#ff2000,#ff7000,#ffc040";
      break;
    case PaletteKind::COOL:
      text = "#2040ff,#20c0ff,#c0f0ff";
      break;
    case PaletteKind::SINGLE:
      p.count = 2;
      p.stops[0] = Rgb{0, 0, 0};
      p.stops[1] = single;
      return p;
    case PaletteKind::SPECTRUM:
    case PaletteKind::CUSTOM:  // the caller keeps the custom one; spectrum stands in until it parses
    default:
      text = "#ff2000,#ffb000,#40d040,#2080ff,#8040ff";
      break;
  }
  parse_palette(text, p);
  return p;
}

struct RenderSettings {
  Style style;
  Palette palette;
  float intensity;      // 0..1
  Mounting mounting;
  float beat_strength;  // 0..1
  BassPosition bass;
  uint16_t first;
  uint16_t count;
  float power_limit_ma;
  // The light's gamma and brightness: the limit works on what the LEDs draw after them.
  float gamma = 1.0f;
  uint8_t brightness = 255;
};

// SK6812 figures: 20 mA per channel at full, 1 mA for each LED's own controller.
constexpr float MA_PER_CHANNEL = 20.0f;
constexpr float IDLE_MA = 1.0f;

inline float estimate_ma(const Rgb *leds, size_t n) {
  uint32_t sum = 0;
  for (size_t i = 0; i < n; i++) sum += (uint32_t) leds[i].r + leds[i].g + leds[i].b;
  return (float) sum * MA_PER_CHANNEL / 255.0f + IDLE_MA * (float) n;
}

// Scales the whole frame so the strip draws no more than the limit; a limit at or below what the LEDs
// draw dark leaves the frame black. Returns the estimate after.
inline float limit_power(Rgb *leds, size_t n, float limit_ma) {
  const float idle = IDLE_MA * (float) n;
  const float est = estimate_ma(leds, n);
  if (est <= limit_ma) return est;
  const float scale = limit_ma > idle ? (limit_ma - idle) / (est - idle) : 0.0f;
  for (size_t i = 0; i < n; i++) {
    // Floor, not round: rounding up could put the frame back over the limit.
    leds[i].r = (uint8_t) std::floor((float) leds[i].r * scale);
    leds[i].g = (uint8_t) std::floor((float) leds[i].g * scale);
    leds[i].b = (uint8_t) std::floor((float) leds[i].b * scale);
  }
  return estimate_ma(leds, n);
}

// A plain colour (the light without a style) bypasses limit_power; it is capped through the light's
// maximum brightness instead. These follow ESPHome's colour correction: the channel scaled by the
// maximum (esp_scale8_twice, with the brightness already in the colour, as during a fade), then gamma.
inline float solid_channel_out(uint8_t value, uint8_t max_brightness, float gamma) {
  const uint32_t scaled = ((uint32_t) value * (1u + max_brightness) * 256u) >> 16;
  return 255.0f * std::pow((float) scaled / 255.0f, gamma);
}

// The strip's draw with every LED in this colour at this maximum brightness.
inline float solid_ma(Rgb colour, uint8_t max_brightness, float gamma, size_t n) {
  const float out = solid_channel_out(colour.r, max_brightness, gamma) +
                    solid_channel_out(colour.g, max_brightness, gamma) +
                    solid_channel_out(colour.b, max_brightness, gamma);
  return (float) n * (IDLE_MA + out * MA_PER_CHANNEL / 255.0f);
}

// The largest maximum brightness whose draw stays within the limit; 0 when even dark is over it.
inline uint8_t solid_max_brightness(Rgb colour, float gamma, size_t n, float limit_ma) {
  for (int m = 255; m >= 0; m--) {
    if (solid_ma(colour, (uint8_t) m, gamma, n) <= limit_ma) return (uint8_t) m;
  }
  return 0;
}

// What each raw channel value draws after the light's brightness and gamma, for one brightness.
struct OutputCurve {
  float gamma{-1.0f};
  uint8_t brightness{0};
  float out[256];
  void build(float g, uint8_t b) {
    if (g == this->gamma && b == this->brightness) return;
    this->gamma = g;
    this->brightness = b;
    for (int v = 0; v < 256; v++) this->out[v] = solid_channel_out((uint8_t) v, b, g);
  }
};

inline float output_ma(const Rgb *leds, size_t n, const OutputCurve &c) {
  float sum = 0;
  for (size_t i = 0; i < n; i++) sum += c.out[leds[i].r] + c.out[leds[i].g] + c.out[leds[i].b];
  return sum * MA_PER_CHANNEL / 255.0f + IDLE_MA * (float) n;
}

// Scales the frame so what the LEDs draw after brightness and gamma stays within the limit; the
// scale is found by bisection (gamma makes it non-linear). A limit at or below what the LEDs draw
// dark leaves the frame black. Returns the draw after.
inline float limit_power(Rgb *leds, size_t n, float limit_ma, const OutputCurve &c) {
  const float est = output_ma(leds, n, c);
  if (est <= limit_ma) return est;
  const float idle = IDLE_MA * (float) n;
  auto scaled = [](uint8_t v, float s) { return (uint8_t) std::floor((float) v * s); };
  float lo = 0.0f;
  if (limit_ma > idle) {
    float hi = 1.0f;
    for (int i = 0; i < 16; i++) {
      const float mid = 0.5f * (lo + hi);
      float sum = 0;
      for (size_t k = 0; k < n; k++)
        sum += c.out[scaled(leds[k].r, mid)] + c.out[scaled(leds[k].g, mid)] + c.out[scaled(leds[k].b, mid)];
      if (sum * MA_PER_CHANNEL / 255.0f + idle <= limit_ma) lo = mid; else hi = mid;
    }
  }
  for (size_t k = 0; k < n; k++)
    leds[k] = Rgb{scaled(leds[k].r, lo), scaled(leds[k].g, lo), scaled(leds[k].b, lo)};
  return output_ma(leds, n, c);
}

class Renderer {
 public:
  void render(const Features &f, const RenderSettings &s, float dt_s, Rgb *leds, size_t n) {
    for (size_t i = 0; i < n; i++) leds[i] = Rgb{0, 0, 0};
    const size_t lo = std::min<size_t>(s.first, n);
    const size_t hi = std::min<size_t>((size_t) s.first + s.count, n);
    this->advance(f, s, dt_s);
    if (hi <= lo) {
      this->smooth_.assign(this->smooth_.size(), 0.0f);
      this->last_ma_ = IDLE_MA * (float) n;
      return;
    }
    const size_t len = hi - lo;
    if (this->smooth_.size() != 3 * n) this->smooth_.assign(3 * n, 0.0f);
    // Intensity: how much of the music's movement reaches the strip; at 0 a calm glow is left.
    const float gain = 0.25f + 0.75f * clamp01(s.intensity);
    const float half = (float) len / 2.0f;
    const float centre = ((float) len - 1.0f) / 2.0f;
    float frame[3];
    const bool linear = s.bass == BassPosition::START || s.bass == BassPosition::END;
    for (size_t k = 0; k < len; k++) {
      // Where the LED sits in the music, 0 to 1: from the centre out (mirrored), or along the window.
      float d = linear ? (len > 1 ? (float) k / (float) (len - 1) : 0.0f)
                       : std::min(1.0f, std::fabs((float) k - centre) / half);
      if (s.bass == BassPosition::END) d = 1.0f - d;
      this->shade(s, d, frame);
      for (int c = 0; c < 3; c++) this->smooth_[3 * (lo + k) + c] = this->settle(this->smooth_[3 * (lo + k) + c], frame[c] * gain, s, dt_s);
    }
    for (size_t k = 0; k < len; k++) {
      const size_t i = lo + k;
      float rgb[3];
      for (int c = 0; c < 3; c++) {
        float v = this->smooth_[3 * i + c];
        // A wall or a floor softens the strip into a wash: blur neighbours, never across the window.
        if (s.mounting != Mounting::FRONT && len > 2) {
          const float l = this->smooth_[3 * (k > 0 ? i - 1 : i) + c];
          const float r = this->smooth_[3 * (k + 1 < len ? i + 1 : i) + c];
          v = 0.25f * l + 0.5f * v + 0.25f * r;
        }
        rgb[c] = v;
      }
      leds[i] = Rgb{byte(rgb[0]), byte(rgb[1]), byte(rgb[2])};
    }
    this->curve_.build(s.gamma, s.brightness);
    this->last_ma_ = limit_power(leds, n, s.power_limit_ma, this->curve_);
  }

  // What the last frame draws after the light's brightness and gamma, mA.
  float last_ma() const { return this->last_ma_; }

 private:
  struct Ripple {
    float pos, amp;
    Rgb colour;
  };
  static constexpr float FLASH_TAU_S = 0.12f;
  static constexpr float GLOW_TAU_S = 0.4f;
  static constexpr float PEAK_FALL_PER_S = 0.5f;
  static constexpr float RIPPLE_SPEED = 2.5f;   // half the window per 0.4 s
  static constexpr float RIPPLE_WIDTH = 0.08f;  // of the half window
  static constexpr float RIPPLE_TAU_S = 0.5f;
  static constexpr size_t MAX_RIPPLES = 6;

  static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
  static uint8_t byte(float v) { return (uint8_t) std::lround(clamp01(v) * 255.0f); }
  static float decay(float dt, float tau) { return tau <= 0 ? 0.0f : std::exp(-dt / tau); }

  static float mounting_tau(Mounting m) {
    switch (m) {
      case Mounting::WALL:
        return 0.08f;
      case Mounting::FLOOR:
        return 0.2f;
      default:
        return 0.0f;
    }
  }

  float settle(float current, float target, const RenderSettings &s, float dt) const {
    const float keep = decay(dt, mounting_tau(s.mounting));
    return target + (current - target) * keep;
  }

  void advance(const Features &f, const RenderSettings &s, float dt) {
    this->f_ = f;
    this->flash_ *= decay(dt, FLASH_TAU_S);
    if (f.beat) this->flash_ = std::max(this->flash_, clamp01(s.beat_strength));
    this->peak_ = std::max(f.envelope, this->peak_ - PEAK_FALL_PER_S * dt);
    const float k = 1.0f - decay(dt, GLOW_TAU_S);
    if (!this->glow_started_) {
      this->glow_balance_ = f.balance;
      this->glow_level_ = f.envelope;
      this->glow_started_ = true;
    }
    this->glow_balance_ += k * (f.balance - this->glow_balance_);
    this->glow_level_ += k * (f.envelope - this->glow_level_);
    for (Ripple &r : this->ripples_) {
      r.pos += RIPPLE_SPEED * dt;
      r.amp *= decay(dt, RIPPLE_TAU_S);
    }
    this->ripples_.erase(std::remove_if(this->ripples_.begin(), this->ripples_.end(),
                                        [](const Ripple &r) { return r.pos > 1.2f || r.amp < 0.01f; }),
                         this->ripples_.end());
    if (f.beat && this->ripples_.size() < MAX_RIPPLES)
      this->ripples_.push_back(Ripple{0.0f, std::max(0.3f, clamp01(s.beat_strength) * 2.0f), palette_at(s.palette, f.balance)});
  }

  static void put(float out[3], const Rgb &c, float level) {
    level = clamp01(level);
    out[0] = (float) c.r / 255.0f * level;
    out[1] = (float) c.g / 255.0f * level;
    out[2] = (float) c.b / 255.0f * level;
  }

  // One LED's colour (0..1 per channel) at position d: from the window's centre out, or from the
  // window's beginning (start) or end (end) along it.
  void shade(const RenderSettings &s, float d, float out[3]) const {
    const Features &f = this->f_;
    out[0] = out[1] = out[2] = 0.0f;
    switch (s.style) {
      case Style::PULSE:
        put(out, palette_at(s.palette, f.balance), f.envelope + this->flash_);
        break;
      case Style::GLOW:
        put(out, palette_at(s.palette, this->glow_balance_), this->glow_level_ > 0 ? 0.35f + 0.65f * this->glow_level_ : 0.0f);
        break;
      case Style::BANDS: {
        // Low, mid and high zones from the centre out (or from the ends in), blended between.
        const float low = (f.bands[0] + f.bands[1] + f.bands[2]) / 3.0f;
        const float mid = (f.bands[3] + f.bands[4]) / 2.0f;
        const float high = (f.bands[5] + f.bands[6] + f.bands[7]) / 3.0f;
        const float x = s.bass == BassPosition::ENDS ? 1.0f - d : d;
        const float level = x < 0.5f ? low + (mid - low) * (x / 0.5f) : mid + (high - mid) * ((x - 0.5f) / 0.5f);
        put(out, palette_at(s.palette, x), level + 0.5f * this->flash_);
        break;
      }
      case Style::CENTRE_METER: {
        if (d <= f.envelope) put(out, palette_at(s.palette, d), 0.6f + 0.4f * f.envelope + this->flash_);
        // The falling peak dot, at the palette's far end.
        const float dot = 1.0f / 30.0f;
        // Just inside the peak, so the dot marks where the meter last reached and never beyond it.
        if (this->peak_ > 0 && d <= this->peak_ && d > this->peak_ - dot) put(out, palette_at(s.palette, 1.0f), 1.0f);
        break;
      }
      case Style::SPECTRUM: {
        const float x = s.bass == BassPosition::ENDS ? 1.0f - d : d;
        const size_t b = std::min(NUM_BANDS - 1, (size_t) (x * (float) NUM_BANDS));
        put(out, palette_at(s.palette, (float) b / (float) (NUM_BANDS - 1)), f.bands[b]);
        break;
      }
      case Style::RIPPLE: {
        float level = 0.15f * f.envelope;
        float rgb[3] = {0, 0, 0};
        for (const Ripple &r : this->ripples_) {
          const float z = (d - r.pos) / RIPPLE_WIDTH;
          const float w = r.amp * std::exp(-z * z);
          rgb[0] += (float) r.colour.r / 255.0f * w;
          rgb[1] += (float) r.colour.g / 255.0f * w;
          rgb[2] += (float) r.colour.b / 255.0f * w;
        }
        put(out, palette_at(s.palette, f.balance), level);
        for (int c = 0; c < 3; c++) out[c] = clamp01(out[c] + rgb[c]);
        break;
      }
    }
  }

  Features f_{};
  float flash_ = 0, peak_ = 0;
  float glow_balance_ = 0, glow_level_ = 0;
  bool glow_started_ = false;
  std::vector<Ripple> ripples_;
  std::vector<float> smooth_;
  OutputCurve curve_;
  float last_ma_{0};
};

}  // namespace music_strip
