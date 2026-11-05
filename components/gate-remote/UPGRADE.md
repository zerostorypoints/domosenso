# gate-remote: upgrade notes

Newest first. Each entry says what changed and what a home that already runs the component has to do.

## 0.1.1: entity ids with the area, the code in the private folder

- `provides` names the ids as Home Assistant builds them. When a node sets `area`, the area comes
  first: `button.<area slug>_<friendly name slug>_<label slug>`, likewise the LED and the Wi-Fi
  signal. Seen in the first home with Home Assistant 2026.9.2. The firmware changes only its
  project version (0.1.1).
- The README and the device file's header keep a gate's code in the home's private folder
  (`domosenso private adopt`, SPEC-035), not only behind a `.gitignore` line.

### What a home does

Nothing for the node. A home whose Ramka `actions` or own automations name a button without the
area, while the node sets `area`, uses the id Home Assistant shows. To move a code file out of the
checkout: `domosenso private adopt esphome/<name>-<slug>.code.yaml`.

## 0.1.0: first version

A gate opened by sending its own handset's fixed code from an ESP32 and a CC1101 (SPEC-034). Nothing
to upgrade.
