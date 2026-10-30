#pragma once
// When the spectrum goes out and what it carries, std only so a host test compiles it without ESPHome.
#include <cstdint>

namespace audio_spectrum {

// MEAN averages the frames since the last publish; LATEST sends the newest frame alone, since
// averaging blurs a hit across the frames around it.
enum class Mix { MEAN, LATEST };

struct Profile {
  uint32_t interval_ms;
  Mix mix;
};

// FAST is every other frame hop (2048 samples at 48 kHz, 42.7 ms), the newest frame: with 50 %
// overlap every sample is in a published frame, at half the state changes of every hop.
inline constexpr Profile ECO{500, Mix::MEAN}, NORMAL{200, Mix::MEAN}, FAST{85, Mix::LATEST};

// A frame lands a little after the hop and loop() sees it a little later: without slack, an 85 ms
// profile would wait for the next frame now and then and publish every other one.
constexpr uint32_t HOP_SLACK_MS = 10;

// Due when a new frame has landed and the interval (less the slack) has passed since the last
// publish. Never on a clock of its own: no frame, no publish. Unsigned subtraction survives the
// millis() wrap.
inline bool publish_due(uint32_t now_ms, uint32_t last_ms, uint32_t interval_ms, uint32_t frames) {
  if (frames == 0)
    return false;
  const uint32_t wait = interval_ms > HOP_SLACK_MS ? interval_ms - HOP_SLACK_MS : 0;
  return now_ms - last_ms >= wait;
}

}  // namespace audio_spectrum
