# Shared timers

Development implementation of SPEC-031. Core Home Assistant timer helpers own the countdown;
Frame does not run a competing timer engine. Requires HA 2026.9.2 or newer.

## DomoSenso setup

Install the `timers` component when a release tag is available. Inputs are a slug `prefix`
(default `domosenso`) and 1–16 timers with unique slug `id`, plain `label`, and integer
`duration_seconds` from 1 through 86400. The default is one General timer for five minutes.
Managed helpers enable `restore: true` and carry `component: timers` metadata.

Map chosen helpers into Ramka's optional `timers: [{entity: timer.domosenso_general, label: General}]`
input to show core HA timer tiles in Controls and a countdown badge on every classic screen.
Tap the tile/badge for HA's existing timer dialog. The pinned frontend20260826.7 has no `timer-actions` feature; the classic path intentionally uses the supported dialog instead. The controls retain HA's normal restart behavior.
No timer replaces settings, page rotation, radar or fullscreen preferences.

## Vanilla HA and native Frame

Create a **Timer** helper in HA Settings → Devices & services → Helpers and enable Restore.
In the matching Frame bridge Timer mapping, select only intended countdown helpers, opt in to
commands, and designate one paired tablet for sound. Do not select internal Ramka rotation timers.
This mapping is explicit in both installation types. Metadata never gives permission to write.
The native app must support SPEC-031; older versions retain their read-only behavior.

The separate private `domosenso/assistant-actions/timers.yaml` artifact declares four fixed actions.
It is not a Home Assistant package, a browser asset, executable instructions, or an access grant.
The existing read artifact remains under `domosenso/assistant/timers.yaml`.

## Recovery limits

HA restores active/paused timers. A finish during HA downtime does not replay the timer.finished
event. The bridge records outcomes and reconciles missed deadlines; idle alone never proves a
finish. A frame disconnected after an acknowledged start can alarm at the last confirmed deadline,
but cannot know about a later remote cancellation until reconnecting. New shared commands require
connection. Android background alarm access is opt-in, otherwise sound is foreground-only.

No component release or physical alarm reliability is implied by this development source.
