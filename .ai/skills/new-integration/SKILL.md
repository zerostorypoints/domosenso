---
name: new-integration
description: Bring a device the catalog does not know into Domosenso — find the Home Assistant integration that serves it (built in, from HACS, or written new, with Hegel as the worked example) and add the device to the catalog in a pull request. Use when someone owns a device Domosenso does not list, for example a music player for the Ramka.
---

# new-integration

The guide is `docs/integrate-a-device.md`; read it first and follow its four steps in order. This
skill adds where you stop and what you may not do.

Rules, all steps:

- Their Home Assistant is read-only for you: `domosenso discover`, `domosenso recommend --from-ha`,
  the REST API with their token. You never install, add, configure or remove an integration, and
  never restart Home Assistant. HACS and the Settings UI are theirs; tell them what to click.
- Nothing household-specific goes into the catalog: no addresses, room or person names, entity ids
  from their home, serial numbers or tokens. A device file carries make, model and the strings Home
  Assistant reports for every unit of that model.
- A change to a component's contract (its `integrations`, `inputs` or `provides`) is spec first:
  skill `write-component-spec`, and stop for approval.
- Catalog changes go on a branch with a pull request (AGENTS.md "Main, tags and pull requests").

1. **What Home Assistant already has.** Run `discover` and `recommend --from-ha --json`; find the
   device under `unmatched` and the integrations already offering it. Compare the candidate
   `media_player` (or whatever the component needs) with the component's contract; for a player that
   is `media_player_contract` in `components/ramka/component.yaml`. Ask them to try the actions you
   cannot check read-only (turn on from standby, volume). **Stop:** tell them which integration you
   would use and why; they choose.
2. **HACS**, only if nothing built in fits. Search HACS and GitHub; read each candidate's README,
   tests, CI and last release, and report them side by side. They install the one they choose through
   HACS and add it in the UI; then check it against the contract again. **Stop** at the choice.
3. **Write one**, only if nothing fits. **Stop and ask** before starting: it is a separate public
   repository they will maintain. Follow the Hegel table in the guide part by part; the integration
   lives in its own repository, never in this catalog.
4. **Into the catalog.** On a branch:
   - `devices/<id>.yaml` with `names` (en, de, pl), `description_key`, `does_key`, `component`,
     `tested: {homes: 1}` and `match` rules from the strings `recommend --from-ha --json` showed,
     with a comment naming the Home Assistant version they were seen on. **Stop:** show them the
     match rules before writing them.
   - the texts under `meta.devices.<id>` in the component's `translations/{en,de,pl}.json`;
   - the device id in the component's `devices.requires[].recommend`;
   - the id in `DEVICES` in `tests/test_catalog_content.py`;
   - if the integration is not yet in the component's `integrations`: that is a contract change
     (the guide's step 4), spec first.

   Then `tools/check-all.sh` green, and `recommend --catalog <this branch> --from-ha` on their Home
   Assistant lists the device under the component. **Stop** before pushing and opening the pull
   request; they say yes.
