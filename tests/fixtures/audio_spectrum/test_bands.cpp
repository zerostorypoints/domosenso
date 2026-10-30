// Host test for spectrum_bands.h; prints "ok <name>" or "FAIL <name>: ..." per check.
#include "spectrum_bands.h"

#include <cmath>
#include <complex>
#include <cstdio>
#include <cstring>
#include <vector>

using namespace audio_spectrum;

static int failures = 0;
static void check(bool cond, const char *name, const char *detail = "") {
  if (cond) {
    std::printf("ok %s\n", name);
  } else {
    std::printf("FAIL %s: %s\n", name, detail);
    failures++;
  }
}

// Test-only radix-2 FFT; the firmware uses esp-dsp instead.
static void fft(std::vector<std::complex<double>> &a) {
  size_t n = a.size();
  for (size_t i = 1, j = 0; i < n; i++) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) std::swap(a[i], a[j]);
  }
  for (size_t len = 2; len <= n; len <<= 1) {
    double ang = -2 * M_PI / (double) len;
    std::complex<double> wl(std::cos(ang), std::sin(ang));
    for (size_t i = 0; i < n; i += len) {
      std::complex<double> w(1);
      for (size_t k = 0; k < len / 2; k++) {
        auto u = a[i + k], v = a[i + k + len / 2] * w;
        a[i + k] = u + v;
        a[i + k + len / 2] = u - v;
        w *= wl;
      }
    }
  }
}

static void windowed_power(const std::vector<double> &x, size_t n, std::vector<float> &power) {
  std::vector<float> w(n);
  hann(w.data(), n);
  std::vector<std::complex<double>> a(n);
  for (size_t i = 0; i < n; i++) a[i] = x[i] * w[i];
  fft(a);
  power.assign(n / 2 + 1, 0.f);
  for (size_t k = 0; k <= n / 2; k++) power[k] = (float) std::norm(a[k]);
}

int main() {
  const size_t N = 8192;
  const float FS = 48000.f;
  const float df = FS / N;
  BandMap map(N, FS);

  {  // edges
    bool ok = true;
    char msg[160] = "";
    double lo = 1000.0 * std::pow(2.0, (-17 - 0.5) / 3.0), hi = 1000.0 * std::pow(2.0, (13 + 0.5) / 3.0);
    const auto &b = map.band(17);
    double blo = 1000.0 * std::pow(2.0, -0.5 / 3.0), bhi = 1000.0 * std::pow(2.0, 0.5 / 3.0);
    // Bins overlapping [891, 1122) at df = 5.86 Hz: first/last bin edges sit within one bin of the band.
    double first = b.front().bin * df, last = b.back().bin * df;
    if (!(first - 0.5 * df <= blo && first + 0.5 * df > blo && last - 0.5 * df < bhi && last + 0.5 * df >= bhi)) {
      ok = false;
      std::snprintf(msg, sizeof msg, "band 17 bins %u..%u", b.front().bin, b.back().bin);
    }
    std::vector<double> total(N / 2 + 1, 0.0);
    double sum = 0;
    for (size_t i = 0; i < NUM_BANDS; i++)
      for (const auto &bw : map.band(i)) {
        total[bw.bin] += bw.weight;
        sum += bw.weight;
      }
    for (double t : total)
      if (t > 1 + 1e-6) {
        ok = false;
        std::snprintf(msg, sizeof msg, "bin weight %g > 1", t);
      }
    // Weights add up to the covered span in bins (bin 0 lies below the first edge).
    if (std::fabs(sum - (hi - lo) / df) > 1e-3) {
      ok = false;
      std::snprintf(msg, sizeof msg, "weight sum %g vs %g", sum, (hi - lo) / df);
    }
    check(ok, "edges", msg);
  }

  {  // sine_1k
    std::vector<double> x(N);
    for (size_t n = 0; n < N; n++) x[n] = 16384.0 * std::sin(2 * M_PI * 1000.0 * n / 48000.0);
    std::vector<float> p;
    windowed_power(x, N, p);
    double ms[NUM_BANDS] = {0};
    accumulate_bands(p.data(), map, N, ms);
    size_t arg = 0;
    for (size_t i = 1; i < NUM_BANDS; i++)
      if (ms[i] > ms[arg]) arg = i;
    bool ok = arg == 17 && to_dbfs(ms[15]) <= to_dbfs(ms[17]) - 20 && to_dbfs(ms[19]) <= to_dbfs(ms[17]) - 20;
    check(ok, "sine_1k", "band 17 not dominant");
  }

  {  // parseval_white
    uint32_t s = 12345;
    double ms[NUM_BANDS] = {0};
    double energy = 0;
    const int frames = 32;
    for (int f = 0; f < frames; f++) {
      std::vector<double> x(N);
      for (size_t n = 0; n < N; n++) {
        s = s * 1664525u + 1013904223u;
        x[n] = ((s >> 8) / 16777216.0 * 2 - 1) * 8192.0;
        energy += x[n] * x[n];
      }
      std::vector<float> p;
      windowed_power(x, N, p);
      accumulate_bands(p.data(), map, N, ms);
    }
    double sum = 0;
    for (double m : ms) sum += m;
    // The bands skip < 17.8 Hz and > 22.4 kHz, which hold a share of white noise's energy.
    double lo = 1000.0 * std::pow(2.0, -17.5 / 3.0), hi = 1000.0 * std::pow(2.0, 13.5 / 3.0);
    double covered = (hi - lo) / (FS / 2);
    float got = to_dbfs(sum / frames), want = to_dbfs(energy / frames / N * covered);
    char msg[80];
    std::snprintf(msg, sizeof msg, "%.3f dBFS vs %.3f dBFS", got, want);
    check(std::fabs(got - want) < 0.1f, "parseval_white", msg);
  }

  {  // octaves
    double b[NUM_BANDS], o[NUM_OCTAVES];
    for (size_t i = 0; i < NUM_BANDS; i++) b[i] = i + 1;
    octaves_from_bands(b, o);
    check(o[0] == 9 && o[9] == 90, "octaves", "octave sums wrong");
  }

  {  // csv
    float v[NUM_BANDS];
    for (auto &d : v) d = -120.0f;
    char out[300];
    size_t n = format_csv(v, NUM_BANDS, out, sizeof out);
    bool ok = n == 216 && std::strncmp(out, "-120.0,-120.0", 13) == 0 && std::strlen(out) == 216;
    char small[10];
    std::memset(small, 'x', sizeof small);
    format_csv(v, NUM_BANDS, small, 10);
    ok = ok && std::strlen(small) <= 9;
    check(ok, "csv", "length or truncation wrong");
  }

  return failures ? 1 : 0;
}
