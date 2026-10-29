#pragma once
// Third-octave band maths, std only so a host test can compile it without ESPHome or the IDF.
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <vector>

namespace audio_spectrum {

constexpr size_t NUM_BANDS = 31;
constexpr size_t NUM_OCTAVES = 10;
// Hann window power: mean(w^2) of a periodic Hann.
constexpr float HANN_POWER = 0.375f;
// Index of the 1 kHz band: band i has exact centre 1000 * 2^((i - 17) / 3).
constexpr int BAND_ONE_KHZ = 17;

// Nominal centres, for labels only; edges are computed exactly.
constexpr float BAND_CENTRES[NUM_BANDS] = {
    20,   25,   31.5f, 40,   50,   63,   80,   100,  125,   160,   200,
    250,  315,  400,   500,  630,  800,  1000, 1250, 1600,  2000,  2500,
    3150, 4000, 5000,  6300, 8000, 10000, 12500, 16000, 20000};

struct BinWeight {
  uint16_t bin;
  float weight;
};

class BandMap {
 public:
  BandMap(size_t fft_size, float sample_rate) {
    const double df = (double) sample_rate / (double) fft_size;
    const size_t half = fft_size / 2;
    for (size_t i = 0; i < NUM_BANDS; i++) {
      const double n = (double) i - BAND_ONE_KHZ;
      const double lo = 1000.0 * std::pow(2.0, (n - 0.5) / 3.0);
      const double hi = 1000.0 * std::pow(2.0, (n + 0.5) / 3.0);
      // Bin 0 (DC) never belongs to a band.
      for (size_t k = 1; k <= half; k++) {
        const double a = std::fmax(((double) k - 0.5) * df, lo);
        const double b = std::fmin(((double) k + 0.5) * df, hi);
        if (b > a) this->bands_[i].push_back({(uint16_t) k, (float) ((b - a) / df)});
      }
    }
  }
  const std::vector<BinWeight> &band(size_t i) const { return this->bands_[i]; }

 private:
  std::vector<BinWeight> bands_[NUM_BANDS];
};

inline void hann(float *w, size_t n) {
  for (size_t i = 0; i < n; i++) w[i] = (float) (0.5 - 0.5 * std::cos(2.0 * M_PI * (double) i / (double) n));
}

// Adds each band's share of mean(x^2) in int16 units^2; power[k] = re^2 + im^2, k = 0..fft_size/2.
inline void accumulate_bands(const float *power, const BandMap &map, size_t fft_size, double *band_ms) {
  const double norm = 1.0 / ((double) fft_size * (double) fft_size * (double) HANN_POWER);
  const size_t half = fft_size / 2;
  for (size_t i = 0; i < NUM_BANDS; i++) {
    double acc = 0;
    for (const BinWeight &bw : map.band(i)) {
      // Interior bins stand for a positive and a negative frequency.
      const double scale = (bw.bin == 0 || bw.bin == half) ? norm : 2.0 * norm;
      acc += (double) bw.weight * scale * (double) power[bw.bin];
    }
    band_ms[i] += acc;
  }
}

// Octave j (centre 31.5 Hz * 2^j) sums the thirds around third index 2 + 3j.
inline void octaves_from_bands(const double *band_ms, double *octave_ms) {
  for (size_t j = 0; j < NUM_OCTAVES; j++) {
    const size_t c = 2 + 3 * j;
    octave_ms[j] = band_ms[c - 1] + band_ms[c] + band_ms[c + 1];
  }
}

// Same reference as ESPHome's sound_level: 10 * log10(mean(x^2) / 32768^2).
inline float to_dbfs(double mean_square) {
  const double full_scale = 32768.0 * 32768.0;
  if (!(mean_square > 0)) return -120.0f;
  const float db = (float) (10.0 * std::log10(mean_square / full_scale));
  return db < -120.0f ? -120.0f : db;
}

inline size_t format_csv(const float *dbfs, size_t n, char *out, size_t cap) {
  if (cap == 0) return 0;
  size_t len = 0;
  out[0] = '\0';
  for (size_t i = 0; i < n; i++) {
    const int w = std::snprintf(out + len, cap - len, i ? ",%.1f" : "%.1f", (double) dbfs[i]);
    if (w < 0 || (size_t) w >= cap - len) {  // truncated: keep what fits, terminated
      len = std::strlen(out);
      return len;
    }
    len += (size_t) w;
  }
  return len;
}

}  // namespace audio_spectrum
