#pragma once
// Music features from a power spectrum, std only so a host test can compile it without ESPHome or
// the IDF. One update per hop: a smoothed level, eight log-spaced bands, an onset strength and a beat.
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace music_strip {

constexpr size_t NUM_BANDS = 8;

struct Features {
  float envelope;           // overall level, attack/release smoothed
  float bands[NUM_BANDS];   // log-spaced 40 Hz to 16 kHz
  float onset;              // strength of a new hit in this hop
  bool beat;                // true on the hop a beat is detected
  float balance;            // 0 = low end, 1 = high end
  uint32_t seq;             // counts updates, so a consumer sees a new frame
};

struct FeatureSettings {
  bool auto_gain = true;
  float sensitivity_db = 0;
  float attack_ms = 20;
  float release_ms = 300;
};

class FeatureExtractor {
 public:
  void configure(const FeatureSettings &s, float sample_rate, size_t fft_size, size_t hop) {
    this->settings_ = s;
    this->bins_ = fft_size / 2 + 1;
    // A full-scale sine on a bin centre has a Hann-windowed peak of N/4, so this makes it 1.
    this->power_scale_ = 16.0f / ((float) fft_size * (float) fft_size);
    const double df = (double) sample_rate / (double) fft_size;
    for (size_t b = 0; b <= NUM_BANDS; b++) {
      const double edge = LOW_HZ * std::pow(HIGH_HZ / LOW_HZ, (double) b / (double) NUM_BANDS);
      this->edge_[b] = std::min((size_t) std::ceil(edge / df), this->bins_);
    }
    for (size_t b = 0; b < NUM_BANDS; b++) {
      // Bin 0 (DC) is never in a band, and a band keeps at least one bin.
      this->edge_[b] = std::max<size_t>(this->edge_[b], b == 0 ? 1 : this->edge_[b - 1] + 1);
    }
    this->edge_[NUM_BANDS] = std::max(this->edge_[NUM_BANDS], this->edge_[NUM_BANDS - 1] + 1);
    const double hop_s = (double) hop / (double) sample_rate;
    this->alpha_attack_ = smoothing(hop_s, s.attack_ms);
    this->alpha_release_ = smoothing(hop_s, s.release_ms);
    this->mean_alpha_ = smoothing(hop_s, (float) (BAND_MEAN_S * 1000.0));
    this->peak_decay_ = (float) std::pow(0.5, hop_s / PEAK_HALF_LIFE_S);
    this->flux_.assign(std::max<size_t>(8, (size_t) std::lround(FLUX_WINDOW_S / hop_s)), 0.0f);
    this->min_history_ = this->flux_.size() / 2;
    this->refractory_hops_ = (size_t) std::lround(REFRACTORY_S / hop_s);
    this->reset();
  }

  // `power` has fft_size / 2 + 1 bins, |X|^2 of a Hann-windowed frame; `rms` is the hop's RMS
  // with 1.0 = 0 dBFS.
  Features update(const float *power, float rms) {
    Features f{};
    this->seq_++;
    f.seq = this->seq_;
    if (!std::isfinite(rms) || rms < GATE_RMS) {
      // Below the gate nothing is music: level and bands fall away, the flux history keeps running.
      this->push_flux(0.0f);
      this->smooth(0.0f, f);
      this->have_prev_ = false;
      this->since_beat_++;
      return f;
    }

    this->peak_ = std::max(rms, this->peak_ * this->peak_decay_);
    const float ref_db = (this->settings_.auto_gain ? std::max(db(this->peak_), AUTO_FLOOR_DB) : 0.0f) -
                         this->settings_.sensitivity_db;
    f.envelope = unit((db(rms) - ref_db + RANGE_DB) / RANGE_DB);

    float level[NUM_BANDS];
    float target[NUM_BANDS];
    float flux = 0;
    for (size_t b = 0; b < NUM_BANDS; b++) {
      double sum = 0;
      for (size_t k = this->edge_[b]; k < this->edge_[b + 1] && k < this->bins_; k++) sum += power[k];
      const float band_p = (float) sum * this->power_scale_;
      const float band_db = db_power(band_p);
      // The flux sees each band against its own recent mean, so a steady noise bed jitters little
      // and a hit stands out by orders of magnitude; the gain-free level would swing by many dB
      // on a band that holds one or two bins.
      if (!this->have_prev_) this->band_mean_[b] = band_p;
      level[b] = std::log10(1.0f + band_p / std::max(this->band_mean_[b], 1e-9f));
      this->band_mean_[b] += this->mean_alpha_ * (band_p - this->band_mean_[b]);
      target[b] = unit((band_db - ref_db + RANGE_DB) / RANGE_DB);
      // The first frame after silence has no earlier one to rise from.
      if (this->have_prev_) flux += std::max(0.0f, level[b] - this->prev_level_[b]);
      this->prev_level_[b] = level[b];
    }

    this->have_prev_ = true;
    const bool ready = this->count_ >= this->min_history_;
    float mean = 0, sd = 0;
    if (ready) {
      for (float v : this->flux_) mean += v;
      mean /= (float) this->flux_.size();
      for (float v : this->flux_) sd += (v - mean) * (v - mean);
      sd = std::sqrt(sd / (float) this->flux_.size());
    }
    this->since_beat_++;
    f.beat = ready && flux > mean + BEAT_SIGMA * sd && flux > MIN_FLUX && this->since_beat_ >= this->refractory_hops_;
    if (f.beat) this->since_beat_ = 0;
    this->push_flux(flux);
    f.onset = unit(flux / FLUX_FULL);

    this->smooth_bands(f.envelope, target, f);
    return f;
  }

 private:
  static constexpr double LOW_HZ = 40.0;
  static constexpr double HIGH_HZ = 16000.0;
  static constexpr float RANGE_DB = 60.0f;       // 0 at -60 dB below the reference, 1 at it
  static constexpr float GATE_RMS = 0.000316228f;  // -70 dBFS
  static constexpr float AUTO_FLOOR_DB = -50.0f;
  static constexpr double PEAK_HALF_LIFE_S = 5.0;
  static constexpr double BAND_MEAN_S = 1.0;
  static constexpr double FLUX_WINDOW_S = 1.0;
  static constexpr double REFRACTORY_S = 0.12;
  static constexpr float BEAT_SIGMA = 1.5f;
  static constexpr float MIN_FLUX = 2.2f;
  static constexpr float FLUX_FULL = 4.0f;

  static float smoothing(double hop_s, float tau_ms) {
    return tau_ms <= 0 ? 1.0f : (float) (1.0 - std::exp(-hop_s * 1000.0 / (double) tau_ms));
  }
  static float db(float amplitude) { return 20.0f * std::log10(std::max(amplitude, 1e-9f)); }
  static float db_power(float power) { return 10.0f * std::log10(std::max(power, 1e-12f)); }
  static float unit(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }

  void reset() {
    std::fill(this->flux_.begin(), this->flux_.end(), 0.0f);
    this->have_prev_ = false;
    std::fill(this->smooth_bands_, this->smooth_bands_ + NUM_BANDS, 0.0f);
    this->smooth_env_ = 0;
    this->peak_ = 0;
    this->flux_pos_ = 0;
    this->count_ = 0;
    this->since_beat_ = 1000000;
    this->seq_ = 0;
  }

  void push_flux(float v) {
    this->flux_[this->flux_pos_] = v;
    this->flux_pos_ = (this->flux_pos_ + 1) % this->flux_.size();
    this->count_++;
  }

  float step(float current, float target) const {
    return current + (target > current ? this->alpha_attack_ : this->alpha_release_) * (target - current);
  }

  void smooth(float envelope_target, Features &f) {
    float zero[NUM_BANDS] = {};
    this->smooth_bands(envelope_target, zero, f);
  }

  void smooth_bands(float envelope_target, const float *targets, Features &f) {
    this->smooth_env_ = step(this->smooth_env_, envelope_target);
    f.envelope = this->smooth_env_ < 1e-4f ? 0.0f : this->smooth_env_;
    double weight = 0, moment = 0;
    for (size_t b = 0; b < NUM_BANDS; b++) {
      this->smooth_bands_[b] = step(this->smooth_bands_[b], targets[b]);
      f.bands[b] = this->smooth_bands_[b] < 1e-4f ? 0.0f : this->smooth_bands_[b];
      // Squared, so the leakage floor around a tone does not pull the balance to the middle.
      const double w = (double) f.bands[b] * f.bands[b];
      weight += w;
      moment += w * (double) b;
    }
    f.balance = weight > 0 ? unit((float) (moment / weight / (double) (NUM_BANDS - 1))) : 0.0f;
  }

  FeatureSettings settings_;
  size_t bins_ = 0;
  float power_scale_ = 1;
  size_t edge_[NUM_BANDS + 1] = {};
  float alpha_attack_ = 1, alpha_release_ = 1, peak_decay_ = 1;
  std::vector<float> flux_;
  size_t flux_pos_ = 0, count_ = 0, min_history_ = 0, refractory_hops_ = 0, since_beat_ = 0;
  float prev_level_[NUM_BANDS] = {};
  float band_mean_[NUM_BANDS] = {};
  float mean_alpha_ = 0.01f;
  bool have_prev_ = false;
  float smooth_bands_[NUM_BANDS] = {};
  float smooth_env_ = 0, peak_ = 0;
  uint32_t seq_ = 0;
};

}  // namespace music_strip
