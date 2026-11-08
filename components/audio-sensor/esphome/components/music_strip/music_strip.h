#pragma once

#ifdef USE_ESP32

#include "music_features.h"
#include "strip_render.h"

#include "esphome/components/light/addressable_light.h"
#include "esphome/components/light/light_state.h"
#include "esphome/components/microphone/microphone_source.h"
#include "esphome/components/ring_buffer/ring_buffer.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/core/component.h"

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <string>

namespace esphome::music_strip {

// The maths lives outside esphome:: so the host tests compile it without ESPHome.
namespace ms = ::music_strip;

// Listens to the shared microphone (passively, like audio_spectrum), turns every 10.7 ms hop into
// music features in a worker task, and holds the strip's settings for the effects that draw them.
class MusicStripComponent : public Component {
 public:
  void setup() override;
  void loop() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::AFTER_CONNECTION; }

  void set_microphone_source(microphone::MicrophoneSource *source) { this->microphone_source_ = source; }
  void set_current_sensor(sensor::Sensor *sensor) { this->current_sensor_ = sensor; }
  void set_light(light::LightState *light) { this->light_ = light; }

  // The newest features; true only when they are newer than the last call returned.
  bool latest(ms::Features &out);

  // Settings, from the package's entities. Feature settings restart the analysis's smoothing.
  void set_auto_gain(bool on);
  void set_sensitivity_db(float db);
  void set_attack_ms(float ms);
  void set_release_ms(float ms);
  void set_beat_sensitivity(float pct);
  void set_palette_kind(ms::PaletteKind kind);
  // false (and one warning in the log) when the text is not 2-5 #rrggbb stops; the last good one stays.
  bool set_custom_palette(const std::string &text);
  void set_intensity(float pct);
  void set_mounting(ms::Mounting mounting);
  void set_beat_strength(float pct);
  void set_bass(ms::BassPosition bass);
  void set_window(uint16_t first, uint16_t count);
  void set_power_limit_ma(float ma);

  // A copy of the render settings; the Single palette is built from the light's own colour.
  ms::RenderSettings render_settings(ms::Rgb single);
  // The effect's estimate of each frame's draw, for the Strip current sensor.
  void report_frame_ma(float ma);

 protected:
  static void worker_task_(void *arg);
  void worker_loop_();
  void process_hop_();
  void update_feature_settings_();
  void cap_solid_();

  microphone::MicrophoneSource *microphone_source_{nullptr};
  sensor::Sensor *current_sensor_{nullptr};
  light::LightState *light_{nullptr};
  // The light's maximum brightness as last set, and what a plain colour draws at it (0 with a style).
  uint8_t solid_max_{255};
  float solid_ma_{0};
  // The plain colour's inputs at the last calculation: the cap is recalculated only when they change.
  ms::Rgb solid_colour_{};
  float solid_limit_{-1};
  size_t solid_n_{0};
  uint8_t solid_cap_{255};
  std::unique_ptr<ring_buffer::RingBuffer> ring_buffer_;
  TaskHandle_t worker_handle_{nullptr};

  // Internal RAM, 16-byte aligned for esp-dsp's S3 kernels; owned for the device's lifetime.
  int16_t *samples_{nullptr};  // the last FFT_SIZE samples, oldest first
  float *window_{nullptr};     // Hann
  float *fft_{nullptr};        // FFT_SIZE complex, then power in place
  float *table_{nullptr};      // this component's own twiddles: audio_spectrum owns esp-dsp's global one
  bool fft_error_logged_{false};

  ms::FeatureExtractor extractor_;  // the worker's alone

  // Features from the worker to the effect, a sequence lock: odd while the worker writes.
  std::atomic<uint32_t> lock_seq_{0};
  ms::Features shared_{};
  uint32_t last_read_seq_{0};

  // Settings: written from the main loop's entities, read by the worker and the effect.
  std::mutex settings_mutex_;
  ms::FeatureSettings feature_settings_{};
  bool feature_settings_dirty_{true};
  ms::RenderSettings render_{};
  ms::PaletteKind palette_kind_{ms::PaletteKind::SPECTRUM};
  ms::Palette custom_palette_{};
  bool custom_warned_{false};

  // Strip current: the mean of the frames since the last publish.
  double ma_sum_{0};
  uint32_t ma_frames_{0};
  uint32_t last_current_ms_{0};
};

}  // namespace esphome::music_strip

#endif  // USE_ESP32
