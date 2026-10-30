#pragma once

#ifdef USE_ESP32

#include "publish_policy.h"
#include "spectrum_bands.h"

#include "esphome/components/microphone/microphone_source.h"
#include "esphome/components/ring_buffer/ring_buffer.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/components/text_sensor/text_sensor.h"
#include "esphome/core/component.h"

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include <memory>
#include <mutex>

namespace esphome::audio_spectrum {

// The band maths and the publish rule live outside esphome:: so the host tests compile them
// without ESPHome.
namespace bands = ::audio_spectrum;

// Third-octave spectrum of a passive microphone source: a worker task runs the FFT and band sums,
// loop() publishes. The audio-sensor component's README describes the entities it feeds.
class AudioSpectrumComponent : public Component {
 public:
  void setup() override;
  void loop() override;
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::AFTER_CONNECTION; }

  void set_microphone_source(microphone::MicrophoneSource *source) { this->microphone_source_ = source; }
  void set_spectrum_sensor(text_sensor::TextSensor *sensor) { this->spectrum_sensor_ = sensor; }
  void set_octave_sensor(size_t i, sensor::Sensor *sensor) { this->octave_sensors_[i] = sensor; }
  void set_load_sensor(sensor::Sensor *sensor) { this->load_sensor_ = sensor; }
  // From the Spectrum rate select's lambda; the frames gathered so far are dropped, so the first
  // publish after a change is not a mix of both rates.
  void set_profile(const bands::Profile &profile);

 protected:
  static void worker_task_(void *arg);
  void worker_loop_();
  void process_frame_();
  void publish_fast_(uint32_t now);
  void publish_slow_(uint32_t elapsed_ms);

  microphone::MicrophoneSource *microphone_source_{nullptr};
  text_sensor::TextSensor *spectrum_sensor_{nullptr};
  sensor::Sensor *octave_sensors_[bands::NUM_OCTAVES]{};
  sensor::Sensor *load_sensor_{nullptr};

  std::unique_ptr<ring_buffer::RingBuffer> ring_buffer_;
  std::unique_ptr<bands::BandMap> band_map_;
  TaskHandle_t worker_handle_{nullptr};

  // PSRAM, 16-byte aligned for esp-dsp's SIMD paths. Owned for the device's lifetime.
  int16_t *samples_{nullptr};   // the last FFT_SIZE samples, oldest first
  float *window_{nullptr};      // Hann, FFT_SIZE
  float *fft_{nullptr};         // FFT_SIZE complex: windowed input, then spectrum, then power in place
  float *fft_table_{nullptr};   // esp-dsp's radix-2 twiddles, FFT_SIZE floats
  bool fft_error_logged_{false};  // the worker logs a refused transform once

  // Shared between the worker (adds) and loop() (takes and resets).
  std::mutex mutex_;
  bands::Profile profile_{bands::NORMAL};
  double fast_ms_[bands::NUM_BANDS]{};
  double latest_ms_[bands::NUM_BANDS]{};  // the newest frame alone, for Mix::LATEST
  double slow_ms_[bands::NUM_BANDS]{};
  uint32_t fast_frames_{0};
  uint32_t slow_frames_{0};
  uint64_t busy_us_{0};

  // loop()'s own copies, so publishing happens outside the lock and allocates nothing.
  double fast_copy_[bands::NUM_BANDS]{};
  double slow_copy_[bands::NUM_BANDS]{};
  float dbfs_[bands::NUM_BANDS]{};
  char csv_[256]{};
  uint32_t last_fast_ms_{0};
  uint32_t last_slow_ms_{0};
};

}  // namespace esphome::audio_spectrum

#endif  // USE_ESP32
