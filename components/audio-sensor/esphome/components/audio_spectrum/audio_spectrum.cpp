#include "audio_spectrum.h"

#ifdef USE_ESP32

#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <esp_dsp.h>
#include <esp_heap_caps.h>
#include <esp_timer.h>

#include <cmath>
#include <cstring>

namespace esphome::audio_spectrum {

static const char *const TAG = "audio_spectrum";

static constexpr uint32_t SAMPLE_RATE = 48000;
static constexpr size_t FFT_SIZE = 8192;
// 50 % overlap: a Hann frame weighs its ends near zero, so the next frame starts halfway.
static constexpr size_t HOP = FFT_SIZE / 2;
// esp-dsp's real FFT runs as a complex FFT of half the length.
static constexpr size_t HALF = FFT_SIZE / 2;
// One second of int16 samples: room for the worker to fall a few frames behind without a gap.
static constexpr size_t RING_BUFFER_BYTES = SAMPLE_RATE * sizeof(int16_t);
static constexpr uint32_t FAST_INTERVAL_MS = 200;
static constexpr uint32_t SLOW_INTERVAL_MS = 60000;

static constexpr uint32_t WORKER_STACK = 8192;
// Below Wi-Fi and lwIP; on core 1 so core 0's radio work is not delayed by a frame.
static constexpr UBaseType_t WORKER_PRIORITY = 2;
static constexpr BaseType_t WORKER_CORE = 1;

template<typename T> static T *alloc_psram(size_t count) {
  // 16-byte alignment: esp-dsp's S3 SIMD kernels require it.
  return static_cast<T *>(heap_caps_aligned_calloc(16, count, sizeof(T), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
}

void AudioSpectrumComponent::setup() {
  this->ring_buffer_ = ring_buffer::RingBuffer::create(RING_BUFFER_BYTES);
  this->samples_ = alloc_psram<int16_t>(FFT_SIZE);
  this->window_ = alloc_psram<float>(FFT_SIZE);
  this->fft_ = alloc_psram<float>(FFT_SIZE);
  // dsps_fft4r_init_fc32 with a caller's buffer writes 2 * HALF (cos, sin) pairs into it.
  this->fft_table_ = alloc_psram<float>(4 * HALF);
  if (this->ring_buffer_ == nullptr || this->samples_ == nullptr || this->window_ == nullptr ||
      this->fft_ == nullptr || this->fft_table_ == nullptr) {
    ESP_LOGE(TAG, "Could not allocate buffers");
    this->mark_failed();
    return;
  }

  // esp-dsp keeps the fft4r twiddle table in a global, not per caller: no other component on this
  // device may init fft4r with another size, or this worker's transforms would use its table.
  const esp_err_t err = dsps_fft4r_init_fc32(this->fft_table_, HALF);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "FFT init failed: %d", err);
    this->mark_failed();
    return;
  }
  bands::hann(this->window_, FFT_SIZE);
  this->band_map_ = std::make_unique<bands::BandMap>(FFT_SIZE, (float) SAMPLE_RATE);

  // The microphone's task only copies; everything slow happens in the worker.
  this->microphone_source_->add_data_callback([this](const std::vector<uint8_t> &data) {
    this->ring_buffer_->write((void *) data.data(), data.size());
  });

  if (xTaskCreatePinnedToCore(AudioSpectrumComponent::worker_task_, "audio_spectrum", WORKER_STACK, this,
                              WORKER_PRIORITY, &this->worker_handle_, WORKER_CORE) != pdPASS) {
    ESP_LOGE(TAG, "Could not start the worker task");
    this->mark_failed();
    return;
  }

  const uint32_t now = millis();
  this->last_fast_ms_ = now;
  this->last_slow_ms_ = now;
}

void AudioSpectrumComponent::worker_task_(void *arg) { static_cast<AudioSpectrumComponent *>(arg)->worker_loop_(); }

void AudioSpectrumComponent::worker_loop_() {
  uint8_t *const tail = reinterpret_cast<uint8_t *>(this->samples_ + (FFT_SIZE - HOP));
  const size_t hop_bytes = HOP * sizeof(int16_t);
  while (true) {
    // Keep the newer half as the start of the next frame, then wait for a hop of new samples.
    std::memmove(this->samples_, this->samples_ + HOP, (FFT_SIZE - HOP) * sizeof(int16_t));
    size_t got = 0;
    while (got < hop_bytes) {
      got += this->ring_buffer_->read(tail + got, hop_bytes - got, portMAX_DELAY);
    }
    this->process_frame_();
  }
}

void AudioSpectrumComponent::process_frame_() {
  const int64_t start = esp_timer_get_time();

  float *const x = this->fft_;
  for (size_t i = 0; i < FFT_SIZE; i++) {
    x[i] = (float) this->samples_[i] * this->window_[i];
  }
  // Real FFT: the frame as HALF complex points, then esp-dsp's split into the real spectrum.
  // Result: x[0] = X[0] (DC), x[1] = X[HALF] (Nyquist), (x[2k], x[2k + 1]) = X[k].
  dsps_fft4r_fc32(x, HALF);
  dsps_bit_rev4r_fc32(x, HALF);
  dsps_cplx2real_fc32(x, HALF);

  // Power in place: power[k] lands at index k, which every later read (2k and up) is past.
  const float nyquist = x[1] * x[1];
  x[0] = x[0] * x[0];
  for (size_t k = 1; k < HALF; k++) {
    x[k] = x[2 * k] * x[2 * k] + x[2 * k + 1] * x[2 * k + 1];
  }
  x[HALF] = nyquist;

  double frame_ms[bands::NUM_BANDS] = {};
  bands::accumulate_bands(x, *this->band_map_, FFT_SIZE, frame_ms);

  const uint64_t busy = (uint64_t) (esp_timer_get_time() - start);
  std::lock_guard<std::mutex> lock(this->mutex_);
  for (size_t i = 0; i < bands::NUM_BANDS; i++) {
    this->fast_ms_[i] += frame_ms[i];
    this->slow_ms_[i] += frame_ms[i];
  }
  this->fast_frames_++;
  this->slow_frames_++;
  this->busy_us_ += busy;
}

void AudioSpectrumComponent::loop() {
  const uint32_t now = millis();
  if (now - this->last_fast_ms_ >= FAST_INTERVAL_MS) {
    this->last_fast_ms_ = now;
    this->publish_fast_();
  }
  if (now - this->last_slow_ms_ >= SLOW_INTERVAL_MS) {
    const uint32_t elapsed = now - this->last_slow_ms_;
    this->last_slow_ms_ = now;
    this->publish_slow_(elapsed);
  }
}

void AudioSpectrumComponent::publish_fast_() {
  uint32_t frames;
  {
    std::lock_guard<std::mutex> lock(this->mutex_);
    std::memcpy(this->fast_copy_, this->fast_ms_, sizeof(this->fast_ms_));
    std::memset(this->fast_ms_, 0, sizeof(this->fast_ms_));
    frames = this->fast_frames_;
    this->fast_frames_ = 0;
  }
  // No frame in the window (the microphone is stopped): keep the last spectrum rather than invent one.
  if (frames == 0 || this->spectrum_sensor_ == nullptr)
    return;
  for (size_t i = 0; i < bands::NUM_BANDS; i++) {
    this->dbfs_[i] = bands::to_dbfs(this->fast_copy_[i] / frames);
  }
  const size_t len = bands::format_csv(this->dbfs_, bands::NUM_BANDS, this->csv_, sizeof(this->csv_));
  this->spectrum_sensor_->publish_state(this->csv_, len);
}

void AudioSpectrumComponent::publish_slow_(uint32_t elapsed_ms) {
  uint32_t frames;
  uint64_t busy_us;
  {
    std::lock_guard<std::mutex> lock(this->mutex_);
    std::memcpy(this->slow_copy_, this->slow_ms_, sizeof(this->slow_ms_));
    std::memset(this->slow_ms_, 0, sizeof(this->slow_ms_));
    frames = this->slow_frames_;
    this->slow_frames_ = 0;
    busy_us = this->busy_us_;
    this->busy_us_ = 0;
  }
  double octave_ms[bands::NUM_OCTAVES];
  bands::octaves_from_bands(this->slow_copy_, octave_ms);
  for (size_t j = 0; j < bands::NUM_OCTAVES; j++) {
    if (this->octave_sensors_[j] == nullptr)
      continue;
    // A minute without frames has no level; NAN says so instead of a -120 dB that looks real.
    this->octave_sensors_[j]->publish_state(frames > 0 ? bands::to_dbfs(octave_ms[j] / frames) : NAN);
  }
  if (this->load_sensor_ != nullptr) {
    this->load_sensor_->publish_state((float) ((double) busy_us / ((double) elapsed_ms * 1000.0) * 100.0));
  }
}

void AudioSpectrumComponent::dump_config() {
  ESP_LOGCONFIG(TAG,
                "Audio Spectrum:\n"
                "  FFT size: %u, hop: %u (Hann, 50%% overlap)\n"
                "  Sample rate: %" PRIu32 " Hz, bin width: %.2f Hz\n"
                "  Bands: %u third-octave, %u octave\n"
                "  Rates: spectrum %" PRIu32 " ms, octaves and load %" PRIu32 " ms",
                (unsigned) FFT_SIZE, (unsigned) HOP, SAMPLE_RATE, (float) SAMPLE_RATE / FFT_SIZE,
                (unsigned) bands::NUM_BANDS, (unsigned) bands::NUM_OCTAVES, FAST_INTERVAL_MS, SLOW_INTERVAL_MS);
  LOG_TEXT_SENSOR("  ", "Spectrum", this->spectrum_sensor_);
  for (size_t j = 0; j < bands::NUM_OCTAVES; j++) {
    LOG_SENSOR("  ", "Octave", this->octave_sensors_[j]);
  }
  LOG_SENSOR("  ", "Load", this->load_sensor_);
}

}  // namespace esphome::audio_spectrum

#endif  // USE_ESP32
