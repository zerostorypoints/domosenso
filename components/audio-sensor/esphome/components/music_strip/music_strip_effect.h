#pragma once

#ifdef USE_ESP32

#include "music_strip.h"

#include "esphome/components/light/addressable_light_effect.h"
#include "esphome/core/hal.h"

#include <vector>

namespace esphome::music_strip {

// One of the strip's styles as an effect of its light. It draws only when the worker has new
// features (every 10.7 ms), so the strip never repeats a stale frame.
class MusicStripEffect : public light::AddressableLightEffect {
 public:
  MusicStripEffect(const char *name, MusicStripComponent *parent, ms::Style style)
      : AddressableLightEffect(name), parent_(parent), style_(style) {}

  void start() override {
    this->renderer_ = ms::Renderer();
    this->last_ms_ = millis();
  }

  void apply(light::AddressableLight &it, const Color &current_color) override {
    ms::Features f;
    if (!this->parent_->latest(f))
      return;
    const uint32_t now = millis();
    const float dt = (float) (now - this->last_ms_) / 1000.0f;
    this->last_ms_ = now;
    ms::RenderSettings s = this->parent_->render_settings(ms::Rgb{current_color.r, current_color.g, current_color.b});
    s.style = this->style_;
    // The limit works on what the LEDs draw: after the light's brightness and gamma, which ESPHome's
    // colour correction applies to the frame on its way out.
    const light::LightColorValues &v = this->state_->current_values;
    s.gamma = this->state_->get_gamma_correct();
    s.brightness = to_uint8_scale(v.get_brightness() * v.get_state());
    const size_t n = (size_t) it.size();
    this->frame_.resize(n);
    this->renderer_.render(f, s, dt, this->frame_.data(), n);
    for (size_t i = 0; i < n; i++)
      it[(int32_t) i] = Color(this->frame_[i].r, this->frame_[i].g, this->frame_[i].b);
    it.schedule_show();
    this->parent_->report_frame_ma(this->renderer_.last_ma());
  }

 protected:
  MusicStripComponent *parent_;
  ms::Style style_;
  ms::Renderer renderer_;
  std::vector<ms::Rgb> frame_;
  uint32_t last_ms_{0};
};

}  // namespace esphome::music_strip

#endif  // USE_ESP32
