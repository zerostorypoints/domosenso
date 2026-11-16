# Atom Lite and LD2410C desktop mount — V5 publication

Scope: printable mount and assembly guide; no firmware, component versions or household data.
The V5 geometry remains the physically fitted baseline. A button-access bevel is a future
proposal, not a printable revision. One successful fitting does not establish fatigue life,
retention force or standing-base stability.

| Surface | Decision |
| --- | --- |
| Catalog and releases | No change — mount files do not release a component or change compatibility. |
| Examples and views | No change — no HA or Frame UI changes. |
| Hardware guides | Update — radar desktop/shelf assembly diagram, print/source links and measured-fit limitations; crosslink from Atom Lite. |
| Onboarding and upgrades | No change — no installation inputs, entity or firmware changes. |
| Journal and homepage | No change — document this optional mount with its hardware rather than announcing a software release. |
| Release ledger | No change — there is no component version bump. |

## Publication sequence

1. Merge the source/print guide PR with a merge commit, preserving its source revision.
2. Pin the website documentation and source assets to that revision, regenerate snapshots and
   merge the website PR after the first revision is reachable from public main.
3. Verify the two device routes, the radar page's `index.md`, the assembly image and pinned
   GitHub downloads after Cloudflare deployment. Record the Search engines workflow result.

The website exporter deliberately rejects a documentation commit absent from remote main.
A preview passing local checks is not production publication. The required independent human
PR approval remains separate from agent verification.

## Evidence and limitations

- The public illustration is rendered from the adjacent OpenSCAD model; no private photographs,
  printer account data or installation-specific 3MF profiles are published.
- Follow the existing CC1101 and CO2L device guides: describe the purpose, show the assembly,
  link printable/editable files, and distinguish physical fitting from unverified properties.
- The 120 mm jumper harness only just reached. Check actual plugs and cable slack at both yaw
  limits. Finger access below the stationary ring remains cramped in V5.
- Source and website PRs carry their exact checks, independent review and browser evidence.
- Deployment and search-engine verification remain pending until both PRs are merged.
