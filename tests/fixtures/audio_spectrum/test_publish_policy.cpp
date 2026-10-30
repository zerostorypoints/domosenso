// Host test for publish_policy.h; prints "ok <name>" or "FAIL <name>: ..." per check.
#include "publish_policy.h"

#include <cstdio>

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

int main() {
  check(!publish_due(1000, 900, 200, 3), "before interval", "published 100 ms into a 200 ms interval");
  check(publish_due(1100, 900, 200, 3), "interval passed", "did not publish after 200 ms");
  check(!publish_due(1100, 900, 200, 0), "no new frame", "published without a frame (stale repeat)");
  check(publish_due(985, 900, 85, 1), "fast hop", "85 ms profile skipped a frame at +85 ms");
  check(publish_due(980, 900, 85, 1), "hop slack", "frame inside the 10 ms slack was skipped");
  check(!publish_due(974, 900, 85, 1), "beyond slack", "published earlier than interval minus slack");
  check(!publish_due(5, 0xFFFFFFF0u, 85, 1), "wrap early", "millis wrap published too early");
  check(publish_due(80, 0xFFFFFFF0u, 85, 1), "wrap due", "millis wrap blocked a due publish");
  check(FAST.mix == Mix::LATEST && FAST.interval_ms == 85, "fast profile", "fast is not the newest frame at 85 ms");
  check(NORMAL.mix == Mix::MEAN && NORMAL.interval_ms == 200, "normal profile", "normal is not the mean at 200 ms");
  check(ECO.mix == Mix::MEAN && ECO.interval_ms == 500, "eco profile", "eco is not the mean at 500 ms");
  return failures ? 1 : 0;
}
