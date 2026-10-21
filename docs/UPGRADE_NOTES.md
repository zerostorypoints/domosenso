# Upgrade notes

Newest first. One entry per change to a surface in [COMPATIBILITY.md](COMPATIBILITY.md) that a home
has to act on; the steps are in the component's own `UPGRADE.md`.

## 2026-10-21: ramka 0.1.1

- **ramka 0.1.1** ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)): "Tomorrow" capitalised
  in en and de; the cards move to `www/domosenso/ramka/0.1.1/` and the twelve resource URLs change in
  place to `/local/domosenso/ramka/0.1.1/cards/<name>.js`.

## 2026-10-20: stage 1, the catalog

The first versions of the components, moved out of one home's configuration. No home ran a released
version before, so no bridge was kept: each rename below breaks a home that used the old name until
it follows the steps.

- **ramka 0.1.0** ([components/ramka/UPGRADE.md](../components/ramka/UPGRADE.md)):
  - helper option values are English: `input_select.<prefix>_mode` `kalendarz → calendar`;
    `input_select.<prefix>_ambient` `temperatury → climate`, `powietrze → air`, `rosliny → plants`,
    `zdjecia → photos` (`off`, `ambient`, `controls`, `status` unchanged);
  - the entity prefix is an input; entities renamed so that none names a player or a language
    (`binary_sensor.<prefix>_hegel_playing → binary_sensor.<prefix>_media_playing`,
    `input_text.ramka_zdjecie → input_text.<prefix>_photo`, `image.ramka → image.<prefix>_photo`,
    the shell commands `<prefix>_index` / `<prefix>_pick`);
  - package and dashboard are rendered from templates, one dashboard per language;
  - the cards install under `www/domosenso/ramka/0.1.0/` and each Lovelace resource's URL changes in
    place to `/local/domosenso/ramka/0.1.0/cards/<name>.js`;
  - restart Home Assistant rather than reloading the input_selects (a reload keeps a state that is
    no longer an option).
- **bermuda-presence 0.1.0** ([docs/pilot-bermuda-presence.md](pilot-bermuda-presence.md)): from the
  pilot. Device files pull the packages at the tag `bermuda-presence/0.1.0`; the room sensors and the
  offline alert are blueprint instances in the home's instance layer, with the entity ids
  `sensor.presence_<area slug>` and `automation.ble_proxy_offline` a home had before.
- **Every other component 0.1.0** (awnings, calendar, climate-air, lights, media, plants, weather):
  catalog entries describing what the Ramka reads; nothing for a home to change.
