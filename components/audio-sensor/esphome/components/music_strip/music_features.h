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
  float beat_sensitivity = 50;  // 0-100: how far above its usual swing the low end must jump
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
    // The kick's range: below the low end of most room microphones' useful bass, a kick lives in its
    // body and punch, 40 to 250 Hz; DC (bin 0) stays out.
    this->low_lo_ = std::max<size_t>(1, (size_t) std::ceil(BEAT_LOW_HZ / df));
    this->low_hi_ = std::min(this->bins_ - 1, std::max(this->low_lo_, (size_t) std::floor(BEAT_HIGH_HZ / df)));
    const float sens = std::min(100.0f, std::max(0.0f, s.beat_sensitivity));
    this->beat_k_ = BEAT_K_LEAST - (BEAT_K_LEAST - BEAT_K_MOST) * sens / 100.0f;
    const double hop_s = (double) hop / (double) sample_rate;
    this->alpha_attack_ = smoothing(hop_s, s.attack_ms);
    this->alpha_release_ = smoothing(hop_s, s.release_ms);
    this->mean_alpha_ = smoothing(hop_s, (float) (BAND_MEAN_S * 1000.0));
    this->peak_decay_ = (float) std::pow(0.5, hop_s / PEAK_HALF_LIFE_S);
    this->flux_.assign(std::max<size_t>(8, (size_t) std::lround(FLUX_WINDOW_S / hop_s)), 0.0f);
    this->min_history_ = this->flux_.size() / 2;
    this->refractory_hops_ = (size_t) std::ceil(REFRACTORY_S / hop_s);
    this->reset();
  }

  // `power` has fft_size / 2 + 1 bins, |X|^2 of a Hann-windowed frame; `rms` is the hop's RMS
  // with 1.0 = 0 dBFS.
  Features update(const float *power, float rms) {
    Features f{};
    this->seq_++;
    f.seq = this->seq_;
    // The gate opens 3 dB above where it closes, so room noise at the edge does not chatter.
    if (!std::isfinite(rms)) {
      this->gate_open_ = false;
    } else if (rms >= GATE_OPEN_RMS) {
      this->gate_open_ = true;
    } else if (rms < GATE_CLOSE_RMS) {
      this->gate_open_ = false;
    }
    if (!this->gate_open_) {
      // Below the gate nothing is music: level and bands fall away, the flux history keeps running.
      this->push_flux(1.0f);  // neutral: the low end at its own mean
      this->smooth(0.0f, f);
      this->have_prev_ = false;
      this->since_beat_++;
      return f;
    }

    this->peak_ = std::max(rms, this->peak_ * this->peak_decay_);
    const float ref_db = (this->settings_.auto_gain ? std::max(db(this->peak_), AUTO_FLOOR_DB) : 0.0f) -
                         this->settings_.sensitivity_db;
    // Auto gain spreads the level between the gate (0) and the reference (1), so a hop just above the
    // gate is still near 0; a manual gain keeps the fixed 60 dB range under the reference.
    const float low_db = this->settings_.auto_gain ? GATE_CLOSE_DB : ref_db - RANGE_DB;
    f.envelope = unit((db(rms) - low_db) / std::max(ref_db - low_db, 1.0f));

    float target[NUM_BANDS];
    for (size_t b = 0; b < NUM_BANDS; b++) {
      double sum = 0;
      for (size_t k = this->edge_[b]; k < this->edge_[b + 1] && k < this->bins_; k++) sum += power[k];
      target[b] = unit((db_power((float) sum * this->power_scale_) - ref_db + RANGE_DB) / RANGE_DB);
    }

    // Beat: the low end against its own 1 s mean, so the test is the same at any volume and with any
    // amount of bass at the microphone's spot. A jump counts when it clears the ratio's usual swing
    // by the sensitivity's factor; a kick confined to the low end is a beat on its own.
    double low_sum = 0;
    for (size_t k = this->low_lo_; k <= this->low_hi_; k++) low_sum += power[k];
    const float now_low = (float) low_sum * this->power_scale_;
    if (!this->have_prev_) this->low_mean_ = this->prev_low_ = now_low;
    // Two hops (21 ms, shorter than a kick): a handful of bass bins swings by several dB from one
    // frame to the next in steady noise, and the mean of two takes much of that out.
    const float low = 0.5f * (now_low + this->prev_low_);
    this->prev_low_ = now_low;
    const float ratio = std::isfinite(low) ? low / std::max(this->low_mean_, 1e-12f) : 1.0f;
    if (std::isfinite(low)) this->low_mean_ += this->mean_alpha_ * (low - this->low_mean_);
    this->have_prev_ = true;
    const bool ready = this->count_ >= this->min_history_;
    float centre = 1.0f, spread = 0;
    if (ready) {
      // Median and median absolute deviation, not mean and deviation: the beats themselves are in
      // the window, two a second at 120 BPM, and must not raise the bar they are measured against.
      this->sorted_ = this->flux_;
      centre = median(this->sorted_);
      for (float &v : this->sorted_) v = std::fabs(v - centre);
      spread = MAD_TO_SD * median(this->sorted_);
    }
    this->since_beat_++;
    // Only on the way up: a kick that rings past the refractory time is still one beat.
    const bool above = ready && ratio > centre + this->beat_k_ * std::max(spread, MIN_SD);
    f.beat = above && !this->was_above_ && this->since_beat_ >= this->refractory_hops_;
    this->was_above_ = above;
    if (f.beat) this->since_beat_ = 0;
    this->push_flux(ratio);
    f.onset = unit((ratio - 1.0f) / (ONSET_FULL_RATIO - 1.0f));

    this->smooth_bands(f.envelope, target, f);
    return f;
  }

 private:
  static constexpr double LOW_HZ = 40.0;
  static constexpr double HIGH_HZ = 16000.0;
  static constexpr float RANGE_DB = 60.0f;       // 0 at -60 dB below the reference, 1 at it
  static constexpr float GATE_CLOSE_DB = -70.0f;
  static constexpr float GATE_CLOSE_RMS = 0.000316228f;  // -70 dBFS
  static constexpr float GATE_OPEN_RMS = 0.000446684f;   // -67 dBFS
  static constexpr float AUTO_FLOOR_DB = -50.0f;
  static constexpr double PEAK_HALF_LIFE_S = 5.0;
  static constexpr double BAND_MEAN_S = 1.0;
  static constexpr double FLUX_WINDOW_S = 1.0;
  static constexpr double REFRACTORY_S = 0.12;
  static constexpr double BEAT_LOW_HZ = 40.0;
  static constexpr double BEAT_HIGH_HZ = 250.0;
  // Sensitivity 0 needs a jump of 10 times the ratio's usual swing, 50 needs 8, 100 needs 6.
  static constexpr float BEAT_K_LEAST = 10.0f;
  static constexpr float BEAT_K_MOST = 6.0f;
  // Floor on the swing, so a near-constant low end (a held synth bass) cannot beat on rounding.
  static constexpr float MIN_SD = 0.25f;
  static constexpr float MAD_TO_SD = 1.4826f;  // a normal distribution's deviation from its MAD
  static constexpr float ONSET_FULL_RATIO = 10.0f;  // the low end at 10x its mean is a full onset

  static float smoothing(double hop_s, float tau_ms) {
    return tau_ms <= 0 ? 1.0f : (float) (1.0 - std::exp(-hop_s * 1000.0 / (double) tau_ms));
  }
  static float db(float amplitude) { return 20.0f * std::log10(std::max(amplitude, 1e-9f)); }
  static float db_power(float power) { return 10.0f * std::log10(std::max(power, 1e-12f)); }
  static float median(std::vector<float> &v) {
    const size_t mid = v.size() / 2;
    std::nth_element(v.begin(), v.begin() + mid, v.end());
    return v[mid];
  }
  static float unit(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }

  void reset() {
    std::fill(this->flux_.begin(), this->flux_.end(), 0.0f);
    this->have_prev_ = false;
    this->was_above_ = false;
    this->gate_open_ = false;
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
  std::vector<float> flux_, sorted_;
  size_t flux_pos_ = 0, count_ = 0, min_history_ = 0, refractory_hops_ = 0, since_beat_ = 0;
  size_t low_lo_ = 1, low_hi_ = 1;
  float low_mean_ = 0, prev_low_ = 0, beat_k_ = 6.0f;
  bool was_above_ = false;
  float mean_alpha_ = 0.01f;
  bool have_prev_ = false, gate_open_ = false;
  float smooth_bands_[NUM_BANDS] = {};
  float smooth_env_ = 0, peak_ = 0;
  uint32_t seq_ = 0;
};

}  // namespace music_strip
