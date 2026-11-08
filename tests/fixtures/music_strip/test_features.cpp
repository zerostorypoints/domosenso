// Host test for music_features.h; prints "ok <name>" or "FAIL <name>: ..." per check.
#include "music_features.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
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

constexpr float SR = 48000.0f;
constexpr size_t N = 1024;
constexpr size_t HOP = 512;
constexpr double PI = 3.14159265358979323846;

static float db_amp(float db) { return std::pow(10.0f, db / 20.0f); }

// Deterministic noise, so a failure reproduces.
static uint32_t rng_state = 12345;
static float rnd() {
  rng_state = rng_state * 1664525u + 1013904223u;
  return (float) (rng_state >> 8) / 8388608.0f - 1.0f;
}

static void scale_to_rms(std::vector<float> &x, float db) {
  double s = 0;
  for (float v : x) s += (double) v * v;
  const float k = db_amp(db) / (float) std::sqrt(s / x.size());
  for (float &v : x) v *= k;
}

static std::vector<float> white(size_t n, float rms_db) {
  std::vector<float> x(n);
  for (float &v : x) v = rnd();
  scale_to_rms(x, rms_db);
  return x;
}

// Paul Kellet's pink filter.
static std::vector<float> pink(size_t n, float rms_db) {
  std::vector<float> x(n);
  float b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (float &v : x) {
    const float w = rnd();
    b0 = 0.99886f * b0 + w * 0.0555179f;
    b1 = 0.99332f * b1 + w * 0.0750759f;
    b2 = 0.96900f * b2 + w * 0.1538520f;
    b3 = 0.86650f * b3 + w * 0.3104856f;
    b4 = 0.55000f * b4 + w * 0.5329522f;
    b5 = -0.7616f * b5 - w * 0.0168980f;
    v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362f;
    b6 = w * 0.115926f;
  }
  scale_to_rms(x, rms_db);
  return x;
}

static void add_sine(std::vector<float> &x, float hz, float amp, size_t from, size_t len) {
  for (size_t i = from; i < from + len && i < x.size(); i++)
    x[i] += amp * (float) std::sin(2 * PI * hz * (double) (i - from) / SR);
}

// A drum-like burst: a sine with 5 ms raised-cosine ramps, so its edges are not clicks.
static void add_burst(std::vector<float> &x, float hz, float rms_db, size_t from, size_t len) {
  const size_t ramp = (size_t) (0.005f * SR);
  for (size_t i = from; i < from + len && i < x.size(); i++) {
    const size_t j = i - from;
    const size_t edge = std::min(j, len - 1 - j);
    const float env = edge >= ramp ? 1.0f : 0.5f - 0.5f * (float) std::cos(PI * (double) edge / (double) ramp);
    x[i] += env * db_amp(rms_db) * 1.41421356f * (float) std::sin(2 * PI * hz * (double) j / SR);
  }
}

static std::vector<float> sine(size_t n, float hz, float rms_db) {
  std::vector<float> x(n, 0.0f);
  add_sine(x, hz, db_amp(rms_db) * 1.41421356f, 0, n);
  return x;
}

static std::vector<float> secs(float s) { return std::vector<float>((size_t) (s * SR), 0.0f); }

// Naive DFT, |X|^2 of a periodic-Hann frame; the tables keep it fast enough for 10 s of audio.
struct Dft {
  std::vector<float> window, cs, sn;
  Dft() : window(N), cs(N), sn(N) {
    for (size_t i = 0; i < N; i++) {
      window[i] = 0.5f - 0.5f * (float) std::cos(2 * PI * (double) i / N);
      cs[i] = (float) std::cos(2 * PI * (double) i / N);
      sn[i] = (float) std::sin(2 * PI * (double) i / N);
    }
  }
  void power(const float *frame, std::vector<float> &out) const {
    float w[N];
    for (size_t i = 0; i < N; i++) w[i] = frame[i] * window[i];
    out.assign(N / 2 + 1, 0.0f);
    for (size_t k = 0; k <= N / 2; k++) {
      double re = 0, im = 0;
      for (size_t n = 0; n < N; n++) {
        const size_t idx = (k * n) % N;
        re += w[n] * cs[idx];
        im -= w[n] * sn[idx];
      }
      out[k] = (float) (re * re + im * im);
    }
  }
};

// Feeds a signal hop by hop; fn(hop index, end sample of the hop, features).
static void run(const std::vector<float> &x, const FeatureSettings &s,
                const std::function<void(size_t, size_t, const Features &)> &fn) {
  static const Dft dft;
  FeatureExtractor ex;
  ex.configure(s, SR, N, HOP);
  std::vector<float> p;
  for (size_t h = 0; h * HOP + N <= x.size(); h++) {
    const float *frame = &x[h * HOP];
    dft.power(frame, p);
    double e = 0;
    for (size_t i = N - HOP; i < N; i++) e += (double) frame[i] * frame[i];
    const Features f = ex.update(p.data(), (float) std::sqrt(e / HOP));
    fn(h, h * HOP + N, f);
  }
}

static bool all_sane(const Features &f) {
  auto ok = [](float v) { return std::isfinite(v) && v >= 0.0f && v <= 1.0f; };
  bool good = ok(f.envelope) && ok(f.onset) && ok(f.balance);
  for (float b : f.bands) good = good && ok(b);
  return good;
}

// A kick every 500 ms over -40 dBFS pink noise, each a 30 ms burst. Absolute: 60 Hz at burst_db dBFS.
// Relative: one 80 Hz partial burst_db dB above the bed's own power in 40-250 Hz (bins 1-5), as a
// bass-only kick sits in a mix.
static std::vector<float> kick_train(float seconds, std::vector<size_t> &starts, float burst_db = -12.0f,
                                     bool relative = false, float gain_db = 0) {
  struct Partial {
    float hz;
    size_t lo, hi;  // the band's bins at 48 kHz / 1024
    float db;
  };
  std::vector<float> x = pink((size_t) (seconds * SR), -40.0f);
  std::vector<Partial> partials = {{60.0f, 1, 4, burst_db}};
  if (relative) {
    partials = {{80.0f, 1, 6, 0}};
    static const Dft dft;
    std::vector<float> p;
    std::vector<double> acc(partials.size(), 0.0);
    size_t frames = 0;
    for (size_t at = 0; at + N <= x.size(); at += HOP, frames++) {
      dft.power(&x[at], p);
      for (size_t i = 0; i < partials.size(); i++)
        for (size_t k = partials[i].lo; k < partials[i].hi; k++) acc[i] += (double) p[k] * 16.0 / ((double) N * N);
    }
    // A sine of amplitude A puts about A^2 into its band's bins; its rms is A / sqrt(2).
    for (size_t i = 0; i < partials.size(); i++)
      partials[i].db = 10.0f * (float) std::log10(acc[i] / (double) frames / 2.0) + burst_db;
  }
  for (float t = 0.25f; t + 0.03f < seconds; t += 0.5f) {
    const size_t at = (size_t) (t * SR);
    starts.push_back(at);
    for (const Partial &pt : partials) add_burst(x, pt.hz, pt.db, at, (size_t) (0.03f * SR));
  }
  for (float &v : x) v *= db_amp(gain_db);
  return x;
}

// A beat counts for a kick when its hop ends within 3 hops (32 ms) of the kick's start: the 21 ms
// window fills, and the beat test averages two hops.
#ifndef LATE_HOPS
#define LATE_HOPS 3
#endif

// Beats after 2 s: kicks found (of those starting after 2 s) and beats outside every kick's window.
static void score_kicks(const std::vector<float> &x, const std::vector<size_t> &starts, int &hit, int &expected,
                        int &stray) {
  std::vector<bool> found(starts.size(), false);
  stray = expected = hit = 0;
  run(x, FeatureSettings(), [&](size_t, size_t end, const Features &f) {
    if (end < (size_t) (2 * SR) || !f.beat) return;
    bool matched = false;
    for (size_t i = 0; i < starts.size(); i++)
      if (end >= starts[i] && end <= starts[i] + LATE_HOPS * HOP) {
        found[i] = true;
        matched = true;
      }
    if (!matched) stray++;
  });
  for (size_t i = 0; i < starts.size(); i++) {
    if (starts[i] < (size_t) (2 * SR)) continue;
    expected++;
    if (found[i]) hit++;
  }
}

int main() {
  const FeatureSettings defaults;

  {
    bool quiet = true;
    run(std::vector<float>(300 * HOP + N, 0.0f), defaults, [&](size_t, size_t, const Features &f) {
      quiet = quiet && f.envelope == 0 && !f.beat && f.onset == 0 && all_sane(f);
      for (float b : f.bands) quiet = quiet && b == 0;
    });
    check(quiet, "silence zeros", "zeros gave a non-zero output or a beat");
    quiet = true;
    run(white(300 * HOP + N, -80.0f), defaults, [&](size_t, size_t, const Features &f) {
      quiet = quiet && f.envelope == 0 && !f.beat;
      for (float b : f.bands) quiet = quiet && b == 0;
    });
    check(quiet, "silence floor noise", "noise at -80 dBFS was not gated");
  }

  {
    std::vector<size_t> starts;
    const std::vector<float> x = kick_train(10.0f, starts);
    int hit, expected, stray;
    score_kicks(x, starts, hit, expected, stray);
    char msg[96];
    std::snprintf(msg, sizeof msg, "found %d of %d kicks, %d beats between", hit, expected, stray);
    check(expected == 16 && hit >= 15 && stray == 0, "kick train", msg);
  }

  {
    // A kick in mixed music sits a few dB over the low end, and often only there: a bass-only hit 8 dB
    // over the bed's 40-250 Hz power must be a beat.
    std::vector<size_t> starts;
    const std::vector<float> x = kick_train(10.0f, starts, 8.0f, true);
    int hit, expected, stray;
    score_kicks(x, starts, hit, expected, stray);
    char msg[96];
    std::snprintf(msg, sizeof msg, "found %d of %d bass kicks 8 dB over the bed, %d beats between", hit, expected, stray);
    // A kick missed in its window and found a hop late shows as a stray beat; that is no false beat.
    check(expected == 16 && hit >= 15 && stray <= expected - hit, "kick train, 8 dB bass hits", msg);
  }

  {
    // Beat sensitivity: more sensitive never finds fewer beats in the same signal.
    std::vector<size_t> starts;
    const std::vector<float> x = kick_train(10.0f, starts, 5.0f, true);
    int found[3] = {0, 0, 0};
    const float sens[3] = {0.0f, 50.0f, 100.0f};
    for (int i = 0; i < 3; i++) {
      FeatureSettings s;
      s.beat_sensitivity = sens[i];
      run(x, s, [&](size_t, size_t end, const Features &f) {
        if (end >= (size_t) (2 * SR) && f.beat) found[i]++;
      });
    }
    char msg[96];
    std::snprintf(msg, sizeof msg, "beats at sensitivity 0/50/100: %d/%d/%d", found[0], found[1], found[2]);
    check(found[0] <= found[1] && found[1] <= found[2] && found[2] > found[0], "beat sensitivity", msg);
  }

  {
    int beats = 0;
    for (uint32_t seed : {12345u, 1u, 2u, 3u, 4u, 5u, 6u, 7u}) {
      rng_state = seed;
      run(pink((size_t) (10 * SR), -20.0f), defaults, [&](size_t, size_t end, const Features &f) {
        if (end >= (size_t) (2 * SR) && f.beat) beats++;
      });
    }
    rng_state = 12345;
    char msg[64];
    std::snprintf(msg, sizeof msg, "%d beats in steady pink noise over 8 seeds", beats);
    check(beats == 0, "steady pink", msg);
  }

  {
    std::vector<float> x = pink((size_t) (5 * SR), -40.0f);
    const size_t a = (size_t) (3 * SR);
    const size_t b = a + (size_t) (0.08f * SR);
    add_burst(x, 60.0f, -12.0f, a, (size_t) (0.03f * SR));
    add_burst(x, 60.0f, -12.0f, b, (size_t) (0.03f * SR));
    int beats = 0;
    run(x, defaults, [&](size_t, size_t end, const Features &f) {
      if (end >= (size_t) (2 * SR) && f.beat) beats++;
    });
    char msg[64];
    std::snprintf(msg, sizeof msg, "%d beats for two bursts 80 ms apart", beats);
    check(beats == 1, "refractory", msg);
  }

  {
    Features f100{}, f5k{};
    run(sine((size_t) (2 * SR), 100.0f, -20.0f), defaults, [&](size_t, size_t, const Features &f) { f100 = f; });
    run(sine((size_t) (2 * SR), 5000.0f, -20.0f), defaults, [&](size_t, size_t, const Features &f) { f5k = f; });
    size_t top100 = 0, top5k = 0;
    for (size_t i = 0; i < NUM_BANDS; i++) {
      if (f100.bands[i] > f100.bands[top100]) top100 = i;
      if (f5k.bands[i] > f5k.bands[top5k]) top5k = i;
    }
    char msg[96];
    std::snprintf(msg, sizeof msg, "100 Hz band %zu balance %.2f, 5 kHz band %zu balance %.2f", top100,
                  f100.balance, top5k, f5k.balance);
    check(top100 == 1, "bands order low", msg);
    check(top5k == 6 || top5k == 7, "bands order high", msg);
    check(f100.balance < 0.3f && f5k.balance > 0.7f, "balance", msg);
  }

  {
    std::vector<size_t> starts;
    const std::vector<float> x = kick_train(12.0f, starts, -12.0f, false, -28.0f);  // bursts at -40 dBFS
    float peak_auto = 0, peak_off = 0;
    run(x, defaults, [&](size_t, size_t end, const Features &f) {
      if (end <= (size_t) (10 * SR)) peak_auto = std::fmax(peak_auto, f.envelope);
    });
    FeatureSettings off;
    off.auto_gain = false;
    run(x, off, [&](size_t, size_t, const Features &f) { peak_off = std::fmax(peak_off, f.envelope); });
    char msg[64];
    std::snprintf(msg, sizeof msg, "auto peak %.2f, manual peak %.2f", peak_auto, peak_off);
    check(peak_auto >= 0.8f, "auto gain lifts a quiet signal", msg);
    check(peak_off <= 0.4f, "no auto gain leaves it low", msg);
  }

  {
    // A quiet room is not silent: a living room's floor is near -60 dBFS at this microphone. Steady
    // room noise at -60 or -55 dBFS, with auto gain on, must leave the strip dark (after its first
    // second), not lift the noise to a visible level.
    for (float noise_db : {-60.0f, -55.0f}) {
      float top = 0, top_band = 0;
      run(white((size_t) (10 * SR), noise_db), defaults, [&](size_t, size_t end, const Features &f) {
        if (end < (size_t) SR) return;
        top = std::fmax(top, f.envelope);
        for (float b : f.bands) top_band = std::fmax(top_band, b);
      });
      char msg[80];
      std::snprintf(msg, sizeof msg, "%.0f dBFS: envelope peaked at %.2f, bands at %.2f", noise_db, top, top_band);
      check(top <= 0.15f && top_band <= 0.15f, noise_db < -57 ? "room noise -60 dBFS" : "room noise -55 dBFS", msg);
    }
  }

  {
    // Music over that floor still moves the strip: the kick train over -60 dBFS room noise.
    std::vector<size_t> starts;
    std::vector<float> x = kick_train(10.0f, starts);
    const std::vector<float> room = white(x.size(), -60.0f);
    for (size_t i = 0; i < x.size(); i++) x[i] += room[i];
    float peak = 0;
    run(x, defaults, [&](size_t, size_t end, const Features &f) {
      if (end >= (size_t) (2 * SR)) peak = std::fmax(peak, f.envelope);
    });
    char msg[64];
    std::snprintf(msg, sizeof msg, "envelope peaked at %.2f", peak);
    check(peak >= 0.8f, "music over room noise", msg);
  }

  {
    std::vector<float> sq((size_t) (1 * SR));
    for (size_t i = 0; i < sq.size(); i++) sq[i] = ((i / 48) % 2) ? 1.0f : -1.0f;
    bool sane = true;
    run(sq, defaults, [&](size_t, size_t, const Features &f) { sane = sane && all_sane(f); });
    FeatureSettings loud;
    loud.sensitivity_db = 24;
    run(sq, loud, [&](size_t, size_t, const Features &f) { sane = sane && all_sane(f); });
    check(sane, "clip stays in range", "a full-scale square left 0..1 or was not finite");
  }

  {
    FeatureSettings s;
    s.auto_gain = false;
    std::vector<float> x = secs(1.0f);
    const std::vector<float> tone = sine((size_t) (1 * SR), 1000.0f, -20.0f);
    const size_t step = (size_t) (0.5f * SR);
    for (size_t i = step; i < x.size(); i++) x[i] = tone[i];
    std::vector<float> env;
    std::vector<size_t> ends;
    run(x, s, [&](size_t, size_t end, const Features &f) {
      env.push_back(f.envelope);
      ends.push_back(end);
    });
    const float final_v = (-20.0f + 60.0f) / 60.0f;
    const float hop_ms = 1000.0f * HOP / SR;
    float rise_ms = -1, fall_ms = -1;
    for (size_t i = 0; i < env.size(); i++) {
      if (ends[i] > step && env[i] >= 0.63f * final_v) {
        rise_ms = 1000.0f * ((float) ends[i] - (float) step) / SR;
        break;
      }
    }
    // Release: silence from 1.0 s on.
    std::vector<float> y = tone;
    for (size_t i = (size_t) (0.5f * SR); i < y.size(); i++) y[i] = 0.0f;
    std::vector<float> env2;
    std::vector<size_t> ends2;
    run(y, s, [&](size_t, size_t end, const Features &f) {
      env2.push_back(f.envelope);
      ends2.push_back(end);
    });
    float top = 0;
    size_t top_i = 0;
    for (size_t i = 0; i < env2.size(); i++)
      if (env2[i] > top) {
        top = env2[i];
        top_i = i;
      }
    for (size_t i = top_i; i < env2.size(); i++) {
      // The first silent hop ends one hop after the last tonal one.
      if (env2[i] <= 0.37f * top) {
        fall_ms = 1000.0f * ((float) ends2[i] - (float) (size_t) (0.5f * SR)) / SR;
        break;
      }
    }
    char msg[96];
    std::snprintf(msg, sizeof msg, "rise %.1f ms (want 20 +- %.1f), fall %.1f ms (want 300 +- %.1f)", rise_ms,
                  hop_ms, fall_ms, hop_ms);
    check(rise_ms >= 0 && std::fabs(rise_ms - 20.0f) <= hop_ms, "attack time", msg);
    check(fall_ms >= 0 && std::fabs(fall_ms - 300.0f) <= hop_ms, "release time", msg);
  }

  {
    // Range: the dB from a band's 0 to its 1. Two tones 15 dB apart, in bands 4 and 6: halving the
    // range doubles the gap between their levels (the louder band sits at the top of the scale, so
    // the gap is a little under 15 dB's worth).
    std::vector<float> x = sine((size_t) (3 * SR), 1000.0f, -20.0f);
    const std::vector<float> quiet = sine((size_t) (3 * SR), 4000.0f, -35.0f);
    for (size_t i = 0; i < x.size(); i++) x[i] += quiet[i];
    auto gap = [&](float range) {
      FeatureSettings s;
      s.range_db = range;
      float d = 0;
      run(x, s, [&](size_t, size_t, const Features &f) { d = f.bands[4] - f.bands[6]; });
      return d;
    };
    const float g30 = gap(30.0f), g60 = gap(60.0f);
    char msg[64];
    std::snprintf(msg, sizeof msg, "gap at 30 dB %.2f, at 60 dB %.2f", g30, g60);
    check(g30 > 1.8f * g60 && g30 > 0.25f && g30 < 0.6f, "band range", msg);
    check(FeatureSettings{}.range_db == 30.0f, "band range default 30 dB");
  }

  return failures ? 1 : 0;
}
