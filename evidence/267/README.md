# PR267 fictional browser evidence

Source:81ec7e3f3690ef1190b97809387ea8055f3ed168. HA2026.9.2, real frontend/custom cards in Chromium,1100x720 logical viewport, scale2. Light/dark are the actual Ramka theme helper settings. Native HA navigation remains visible; kiosk-mode is not installed.

`controls` uses the configured demo; `unavailable` sets only synthetic player/calendar/light/cover states unavailable. `minimal-controls` and `minimal-settings-*` use dashboards generated through the renderer from tests/fixtures/ramka-minimal.yaml over the same fictional runtime state. The full demo package/providers remain installed for browser evidence; this is not a fresh-runtime proof. The separate offline fresh-instance check covers configuration isolation.

No real household data, media, account or credentials. This branch is evidence only and must never merge into main. Images show top viewport only, not every scroll position. Light-mode black panel background/heading contrast is existing work tracked in issue101; these screenshots do not certify a light-mode redesign. Runtime restart is tested separately by the pinned HA script-engine cases; these images do not simulate Android hardware.
