#include "music_strip.h"

#ifdef USE_ESP32

#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <esp_dsp.h>
#include <esp_heap_caps.h>

#include <cmath>
#include <cstring>

namespace esphome::music_strip {

static const char *const TAG = "music_strip";

static constexpr uint32_t SAMPLE_RATE = 48000;
// 1024 points (21 ms, hop 10.7 ms): short enough for a light to follow a kick, long enough for the
// low end the beat test reads (47 Hz bins).
static constexpr size_t FFT_SIZE = 1024;
static constexpr size_t HOP = FFT_SIZE / 2;
static constexpr size_t HALF = FFT_SIZE / 2;
// A quarter second of int16 samples: the worker may fall a few hops behind without a gap.
static constexpr size_t RING_BUFFER_BYTES = SAMPLE_RATE / 4 * sizeof(int16_t);
static constexpr uint32_t CURRENT_INTERVAL_MS = 10000;

static constexpr uint32_t WORKER_STACK = 6144;
// One above audio_spectrum's worker (2), so a light frame never waits for a 4096-point transform;
// still below Wi-Fi and lwIP. Core 1, as audio_spectrum, to leave core 0 to the radio.
static constexpr UBaseType_t WORKER_PRIORITY = 3;
static constexpr BaseType_t WORKER_CORE = 1;

template<typename T> static T *alloc_internal(size_t count) {
  return static_cast<T *>(heap_caps_aligned_calloc(16, count, sizeof(T), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
}

void MusicStripComponent::setup() {
  this->ring_buffer_ = ring_buffer::RingBuffer::create(RING_BUFFER_BYTES);
  this->samples_ = alloc_internal<int16_t>(FFT_SIZE);
  this->window_ = alloc_internal<float>(FFT_SIZE);
  this->fft_ = alloc_internal<float>(2 * FFT_SIZE);
  this->table_ = alloc_internal<float>(FFT_SIZE);
  if (this->ring_buffer_ == nullptr || this->samples_ == nullptr || this->window_ == nullptr || this->fft_ == nullptr ||
      this->table_ == nullptr) {
    ESP_LOGE(TAG, "Could not allocate buffers");
    this->mark_failed();
    return;
  }
  // The same steps as dsps_fft2r_init_fc32, into this component's own table: that function writes
  // esp-dsp's global table, which audio_spectrum has sized for its 4096-point transform.
  esp_err_t err = dsps_gen_w_r2_fc32(this->table_, FFT_SIZE);
  if (err == ESP_OK)
    err = dsps_bit_rev_fc32_ansi(this->table_, FFT_SIZE >> 1);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "FFT table failed: %d", err);
    this->mark_failed();
    return;
  }
  for (size_t i = 0; i < FFT_SIZE; i++)
    this->window_[i] = 0.5f - 0.5f * std::cos(2.0f * (float) M_PI * (float) i / (float) FFT_SIZE);

  if (this->render_.palette.count == 0)
    this->render_.palette = ms::builtin_palette(ms::PaletteKind::SPECTRUM, ms::Rgb{255, 255, 255});
  if (this->custom_palette_.count == 0)
    ms::parse_palette("#ff3000,#ffb000,#2050ff", this->custom_palette_);

  // The microphone's task only copies; everything slow happens in the worker.
  this->microphone_source_->add_data_callback([this](const std::vector<uint8_t> &data) {
    this->ring_buffer_->write((void *) data.data(), data.size());
  });
  if (xTaskCreatePinnedToCore(MusicStripComponent::worker_task_, "music_strip", WORKER_STACK, this, WORKER_PRIORITY,
                              &this->worker_handle_, WORKER_CORE) != pdPASS) {
    ESP_LOGE(TAG, "Could not start the worker task");
    this->mark_failed();
    return;
  }
  this->last_current_ms_ = millis();
}

void MusicStripComponent::worker_task_(void *arg) { static_cast<MusicStripComponent *>(arg)->worker_loop_(); }

void MusicStripComponent::worker_loop_() {
  uint8_t *const tail = reinterpret_cast<uint8_t *>(this->samples_ + (FFT_SIZE - HOP));
  const size_t hop_bytes = HOP * sizeof(int16_t);
  while (true) {
    std::memmove(this->samples_, this->samples_ + HOP, (FFT_SIZE - HOP) * sizeof(int16_t));
    size_t got = 0;
    while (got < hop_bytes)
      got += this->ring_buffer_->read(tail + got, hop_bytes - got, portMAX_DELAY);
    this->process_hop_();
  }
}

void MusicStripComponent::update_feature_settings_() {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  if (!this->feature_settings_dirty_)
    return;
  this->extractor_.configure(this->feature_settings_, (float) SAMPLE_RATE, FFT_SIZE, HOP);
  this->feature_settings_dirty_ = false;
}

void MusicStripComponent::process_hop_() {
  this->update_feature_settings_();

  double energy = 0;
  for (size_t i = FFT_SIZE - HOP; i < FFT_SIZE; i++) {
    const double s = (double) this->samples_[i] / 32768.0;
    energy += s * s;
  }
  const float rms = (float) std::sqrt(energy / (double) HOP);

  // Complex radix-2 transform of the windowed real frame, scaled to full scale = 1.
  float *const x = this->fft_;
  for (size_t i = 0; i < FFT_SIZE; i++) {
    x[2 * i] = (float) this->samples_[i] / 32768.0f * this->window_[i];
    x[2 * i + 1] = 0.0f;
  }
  esp_err_t err = dsps_fft2r_fc32_aes3_(x, FFT_SIZE, this->table_);
  if (err == ESP_OK)
    err = dsps_bit_rev_fc32(x, FFT_SIZE);
  if (err != ESP_OK) {
    if (!this->fft_error_logged_) {
      ESP_LOGE(TAG, "FFT failed: %d", err);
      this->fft_error_logged_ = true;
    }
    return;
  }
  for (size_t k = 0; k <= HALF; k++)
    x[k] = x[2 * k] * x[2 * k] + x[2 * k + 1] * x[2 * k + 1];

  const ms::Features f = this->extractor_.update(x, rms);
  this->lock_seq_.fetch_add(1, std::memory_order_acq_rel);  // odd: writing
  this->shared_ = f;
  this->lock_seq_.fetch_add(1, std::memory_order_acq_rel);  // even: done
}

bool MusicStripComponent::latest(ms::Features &out) {
  for (int tries = 0; tries < 4; tries++) {
    const uint32_t before = this->lock_seq_.load(std::memory_order_acquire);
    if (before & 1u)
      continue;
    const ms::Features copy = this->shared_;
    if (this->lock_seq_.load(std::memory_order_acquire) != before)
      continue;
    if (copy.seq == this->last_read_seq_)
      return false;
    this->last_read_seq_ = copy.seq;
    out = copy;
    return true;
  }
  return false;  // the worker kept writing; the next frame gets it
}

void MusicStripComponent::loop() {
  this->cap_solid_();
  const uint32_t now = millis();
  if (now - this->last_current_ms_ < CURRENT_INTERVAL_MS)
    return;
  this->last_current_ms_ = now;
  if (this->current_sensor_ == nullptr)
    return;
  // No frames: the strip is off or shows no music effect; its LEDs draw their idle current only
  // while powered, which the board cannot see, so report 0.
  this->current_sensor_->publish_state(this->ma_frames_ ? (float) (this->ma_sum_ / this->ma_frames_) : this->solid_ma_);
  this->ma_sum_ = 0;
  this->ma_frames_ = 0;
}

// A style limits its own frames (limit_power). Without one the light shows a plain colour on every
// LED, which no frame passes through: cap it through the light's maximum brightness, computed from
// the colour it is heading to (brightness folded in, as during a fade), so a fade never overshoots.
void MusicStripComponent::cap_solid_() {
  if (this->light_ == nullptr)
    return;
  auto *out = static_cast<light::AddressableLight *>(this->light_->get_output());
  const light::LightColorValues &target = this->light_->remote_values;
  uint8_t cap = 255;
  if (target.is_on() && !out->is_effect_active()) {
    const Color c = light::color_from_light_color_values(target);
    const uint8_t b = light::to_uint8_scale(target.get_brightness());
    const ms::Rgb colour{(uint8_t) ((c.r * (1u + b)) >> 8), (uint8_t) ((c.g * (1u + b)) >> 8),
                         (uint8_t) ((c.b * (1u + b)) >> 8)};
    float limit;
    {
      std::lock_guard<std::mutex> lock(this->settings_mutex_);
      limit = this->render_.power_limit_ma;
    }
    const size_t n = (size_t) out->size();
    if (colour.r != this->solid_colour_.r || colour.g != this->solid_colour_.g || colour.b != this->solid_colour_.b ||
        limit != this->solid_limit_ || n != this->solid_n_ || this->solid_ma_ == 0) {
      const float gamma = this->light_->get_gamma_correct();
      this->solid_colour_ = colour;
      this->solid_limit_ = limit;
      this->solid_n_ = n;
      const uint8_t m = ms::solid_max_brightness(colour, gamma, n, limit);
      this->solid_ma_ = ms::solid_ma(colour, m, gamma, n);
      if (m < 255)
        ESP_LOGD(TAG, "Plain colour capped at %u/255 for %.0f mA", m, limit);
      this->solid_cap_ = m;
    }
    cap = this->solid_cap_;
  } else {
    this->solid_ma_ = 0;
  }
  if (cap == this->solid_max_)
    return;
  this->solid_max_ = cap;
  const float f = (float) cap / 255.0f;
  out->set_correction(f, f, f);
  // The LEDs hold the colour corrected when it was written: write it again under the new maximum,
  // unless a fade is writing every step anyway or a style draws the frames.
  if (!out->is_effect_active() && !this->light_->is_transformer_active()) {
    out->all() = light::color_from_light_color_values(this->light_->current_values);
    out->schedule_show();
  }
}

void MusicStripComponent::report_frame_ma(float ma) {
  this->ma_sum_ += ma;
  this->ma_frames_++;
}

void MusicStripComponent::dump_config() {
  ESP_LOGCONFIG(TAG, "Music strip: %u-point FFT, hop %u samples at %u Hz", (unsigned) FFT_SIZE, (unsigned) HOP,
                (unsigned) SAMPLE_RATE);
}

#define FEATURE_SETTER(name, field, type) \
  void MusicStripComponent::name(type v) { \
    std::lock_guard<std::mutex> lock(this->settings_mutex_); \
    this->feature_settings_.field = v; \
    this->feature_settings_dirty_ = true; \
  }
FEATURE_SETTER(set_auto_gain, auto_gain, bool)
FEATURE_SETTER(set_sensitivity_db, sensitivity_db, float)
FEATURE_SETTER(set_attack_ms, attack_ms, float)
FEATURE_SETTER(set_release_ms, release_ms, float)
FEATURE_SETTER(set_beat_sensitivity, beat_sensitivity, float)
FEATURE_SETTER(set_range_db, range_db, float)
#undef FEATURE_SETTER

void MusicStripComponent::set_palette_kind(ms::PaletteKind kind) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->palette_kind_ = kind;
}

bool MusicStripComponent::set_custom_palette(const std::string &text) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  if (ms::parse_palette(text.c_str(), this->custom_palette_))
    return true;
  if (!this->custom_warned_) {
    ESP_LOGW(TAG, "Custom palette '%s' is not 2-5 #rrggbb stops; keeping the last good one", text.c_str());
    this->custom_warned_ = true;
  }
  return false;
}

void MusicStripComponent::set_intensity(float pct) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.intensity = pct / 100.0f;
}

void MusicStripComponent::set_pastel(float pct) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.pastel = pct / 100.0f;
}
void MusicStripComponent::set_mounting(ms::Mounting mounting) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.mounting = mounting;
}
void MusicStripComponent::set_beat_strength(float pct) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.beat_strength = pct / 100.0f;
}
void MusicStripComponent::set_bass(ms::BassPosition bass) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.bass = bass;
}
void MusicStripComponent::set_window(uint16_t first, uint16_t count) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.first = first;
  this->render_.count = count;
}
void MusicStripComponent::set_power_limit_ma(float ma) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  this->render_.power_limit_ma = ma;
}

ms::RenderSettings MusicStripComponent::render_settings(ms::Rgb single) {
  std::lock_guard<std::mutex> lock(this->settings_mutex_);
  ms::RenderSettings s = this->render_;
  s.palette = this->palette_kind_ == ms::PaletteKind::CUSTOM ? this->custom_palette_
                                                               : ms::builtin_palette(this->palette_kind_, single);
  return s;
}

}  // namespace esphome::music_strip

#endif  // USE_ESP32
