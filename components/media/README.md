# media: field notes

What a home needs to know beyond `component.yaml`. Tested with the Hegel H400 through
`hegel_streaming` 0.1.7 ([zerostorypoints/hegel-home-assistant](https://github.com/zerostorypoints/hegel-home-assistant)).

## Hegel H150 / H400 / H600 (`hegel_streaming`)

- These models run StreamUnlimited's Stream SDK; Hegel publishes no IP control codes for them. Core
  Home Assistant's `hegel` integration (IP control on port 50001) gets connections accepted and
  never answered on the H400, so it does not work for this generation.
- In network standby the amplifier's web API still answers; switched off at the mains it does not.
- Home Assistant may also create `cast` and `dlna_dmr` media players for the same amplifier. Point
  the Ramka at the `hegel_streaming` one.
- **Spotify Connect exposes only pause.** A plain play after a pause ends the Spotify session;
  0.1.7 resumes it instead. Previous and next follow what the player offers, which is why the Ramka
  hides them while `sensor.<player>_streaming_service` reads Spotify.
- Until it is in the HACS default list, add the repository to HACS as a custom repository, or copy
  a release into `custom_components` by hand.

## Player states, for automations

- A start goes off → on → buffering → playing. An automation for "music started" needs
  `to: [buffering, playing]`; with `to: playing` alone it did not fire once in 20 starts.
- A track change blips through buffering or paused for 0.5 to 3 seconds. A "playing" binary sensor
  with `delay_off: 5 s` keeps a view from flashing. A templated `delay_off` is rendered after the
  state changes, from the old value, so "no delay when the music stops" cannot be written that way.
