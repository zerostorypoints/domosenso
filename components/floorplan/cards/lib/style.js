// The floor plan card's stylesheet, kept apart so the card file holds behaviour.
export const STYLE = `
  :host { display: block; height: 100%; }
  ha-card { height: 100%; box-sizing: border-box; display: flex; flex-direction: column;
            overflow: hidden; font: 14px var(--ha-font-family-body, sans-serif); }
  .bar, .area-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; }
  .area-panel:empty, .bar:empty { display: none; }
  .bar .spacer { flex: 1; }
  button { font: inherit; cursor: pointer; padding: 4px 10px; border-radius: 14px; background: none;
           color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  button.on, button.primary { color: var(--text-primary-color, #fff); background: var(--primary-color);
                              border-color: var(--primary-color); }
  button:disabled { opacity: 0.4; cursor: default; }
  /* A host on a phone asks for finger-sized targets (--floorplan-target: 44px); unset, as before. */
  .bar button, .chip { min-width: var(--floorplan-target, auto); min-height: var(--floorplan-target, auto); }
  select, input { font: inherit; }
  .body { flex: 1; display: flex; min-height: 280px; position: relative; }
  svg { flex: 1; min-width: 0; height: 100%; min-height: 280px; touch-action: none; user-select: none; }
  /* zoom: false: the plan stays as fitted and a finger on it scrolls the page. */
  .fixed svg { touch-action: pan-y; }
  .room { fill: var(--secondary-background-color, #f2f2f2); stroke: var(--primary-text-color);
          stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .room.selected, .room.picked { fill: var(--primary-color); fill-opacity: 0.25; }
  /* Amendment 3: with Wi-Fi on, the rooms keep their fill and the walls are drawn as lines by weight. */
  .room.walled { stroke: none; }
  .wall-line { stroke: var(--primary-text-color); stroke-linecap: square; vector-effect: non-scaling-stroke;
               pointer-events: none; }
  .wall-line.light { stroke-width: 1.5; }
  .wall-line.solid { stroke-width: 3; }
  .wall-line.heavy { stroke-width: 5; }
  .wall-line.glass { stroke: var(--floorplan-glass, #7cb9e8); }
  .wall-line.half { stroke-dasharray: 6 4; stroke-linecap: butt; }
  .wall-line.none { stroke: var(--secondary-text-color); stroke-width: 1; stroke-dasharray: 1 4; stroke-opacity: 0.6;
                    stroke-linecap: round; }
  .wall-key .wall-swatch { display: inline-block; width: 14px; height: 0; border-top: solid var(--primary-text-color);
                           vertical-align: middle; }
  .wall-key .wall-swatch.light { border-top-width: 1.5px; }
  .wall-key .wall-swatch.solid { border-top-width: 3px; }
  .wall-key .wall-swatch.heavy { border-top-width: 5px; }
  .walls, .ranges { pointer-events: none; }
  .range { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .range.weak { stroke-dasharray: 6 4; }
  .range-ring { fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke; }
  /* Its halo's width is an attribute, 3 px in plan metres: a CSS width here would override it. */
  .range-name { text-anchor: middle; font-weight: 600; paint-order: stroke; stroke: var(--card-background-color, #fff);
                stroke-linejoin: round; }
  .half-check { display: inline-flex; align-items: center; gap: 4px; }
  .label { fill: var(--secondary-text-color); text-anchor: middle; dominant-baseline: middle;
           pointer-events: none; }
  .label.missing { font-style: italic; opacity: 0.6; }
  .edge { stroke: transparent; stroke-width: 12; vector-effect: non-scaling-stroke; }
  .corner { fill: var(--card-background-color, #fff); stroke: var(--primary-color); stroke-width: 2;
            vector-effect: non-scaling-stroke; cursor: move; }
  .pick { fill: var(--accent-color, #ff9800); pointer-events: none; }
  .marker .shape { fill: var(--primary-color); stroke: var(--card-background-color, #fff); stroke-width: 2;
                  vector-effect: non-scaling-stroke; }
  .editing .marker { cursor: move; }
  .marker.unplaced .shape { fill-opacity: 0.4; stroke-dasharray: 3 2; }
  .marker line.leader { stroke: var(--secondary-text-color); stroke-width: 1; vector-effect: non-scaling-stroke;
                        pointer-events: none; }
  .marker circle.role-ring { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .marker text { fill: var(--primary-text-color); text-anchor: middle; pointer-events: none; }
  .marker.picked .shape { stroke: var(--accent-color, #ff9800); }
  .ghost { opacity: 0.6; pointer-events: none; }
  /* context: true: the rooms around the area, for orientation only. */
  .context { opacity: 0.3; pointer-events: none; }
  .to-wall { stroke: var(--primary-color); stroke-width: 1; stroke-dasharray: 4 3;
             vector-effect: non-scaling-stroke; pointer-events: none; }
  .tray { width: 180px; overflow-y: auto; border-left: 1px solid var(--divider-color); padding: 8px;
          user-select: none; -webkit-user-select: none; }
  .tray:empty { display: none; }
  .tray h3 { margin: 0 0 6px; font-size: 13px; }
  .tray .item { padding: 6px 8px; margin-bottom: 4px; border-radius: 8px; cursor: grab;
                border: 1px solid var(--divider-color); touch-action: none; }
  .tray details { margin-bottom: 6px; }
  .tray summary { padding: 4px 2px; cursor: grab; touch-action: none; font-weight: 500; }
  .tray summary .count { color: var(--secondary-text-color); font-weight: normal; }
  .tray details .item { margin-left: 12px; }
  .grid { stroke: var(--primary-text-color); stroke-opacity: 0.08; stroke-width: 1;
          vector-effect: non-scaling-stroke; pointer-events: none; }
  .grid.minor { stroke-opacity: 0.04; }
  .dim { fill: var(--secondary-text-color); text-anchor: middle; dominant-baseline: middle;
         pointer-events: none; }
  .dim.wall, .dim.to-wall { fill: var(--primary-color); }
  .layers { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 0 12px 6px; }
  .layers:empty { display: none; }
  .layers-label { color: var(--secondary-text-color); font-size: 12px; margin-right: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 8px; }
  .chip[aria-pressed="false"] { opacity: 0.45; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px;
         vertical-align: middle; }
  .ring { display: inline-block; width: 8px; height: 8px; border-radius: 50%; border: 2px solid
          var(--secondary-text-color); margin-right: 4px; vertical-align: middle; }
  .ring-legend { color: var(--secondary-text-color); font-size: 12px; margin-left: 8px; }
  .tip-roles { color: var(--secondary-text-color); margin: 2px 0; }
  .point-panel { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .joined-label { color: var(--secondary-text-color); }
  .joined button { margin-left: 4px; font-size: 12px; padding: 2px 8px; }
  .link { stroke: var(--primary-color); stroke-width: 1.5; stroke-opacity: 0.7; vector-effect: non-scaling-stroke;
          pointer-events: none; }
  .cluster circle { fill: var(--card-background-color, #fff); stroke: var(--primary-color); stroke-width: 2;
                    vector-effect: non-scaling-stroke; cursor: pointer; }
  .cluster text { fill: var(--primary-text-color); text-anchor: middle; pointer-events: none; font-weight: 500; }
  .cluster-list { position: absolute; z-index: 2; max-height: 50%; overflow-y: auto; min-width: 160px;
                  padding: 6px; background: var(--card-background-color, #fff); user-select: none;
                  -webkit-user-select: none; border: 1px solid var(--divider-color); border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); font-size: 13px; }
  .cluster-list[hidden] { display: none; }
  .cluster-list .item { padding: 4px 6px; border-radius: 6px; cursor: grab; touch-action: none; white-space: nowrap; }
  .cluster-list .item:hover { background: var(--secondary-background-color); }
  .link-label { fill: var(--primary-color); text-anchor: middle; pointer-events: none; }
  .tip { position: absolute; z-index: 2; pointer-events: none; max-width: 180px; padding: 6px;
         background: var(--card-background-color, #fff); border: 1px solid var(--divider-color);
         border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); font-size: 12px; }
  .tip img { display: block; width: 168px; height: 126px; object-fit: cover; border-radius: 6px;
             margin-bottom: 4px; }
  .tip-name { font-weight: 500; }
  .tip-value { color: var(--secondary-text-color); }
  .maps { display: inline-flex; gap: 4px; margin-right: 8px; }
  .heat { pointer-events: none; opacity: 0.8; }
  .heat .no-sensor, .heat .handover { fill: url(#fp-hatch); }
  .heat .wall { fill: none; stroke: var(--primary-text-color); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .hatch-line { stroke: var(--divider-color, #888); }
  .marker .glow { fill: url(#fp-glow); stroke: none; pointer-events: none; }
  .marker text.value.main { font-weight: 600; }
  .legend { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--secondary-text-color); }
  .legend .scale { position: relative; width: 90px; height: 8px; border-radius: 4px; }
  .legend .mark { position: absolute; top: -2px; width: 2px; height: 12px; margin-left: -1px;
                  background: var(--primary-text-color); }
  .traffic-links { pointer-events: none; }
  .traffic-links .client { pointer-events: auto; cursor: default; }
  .client circle { stroke: var(--card-background-color, #fff); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .client.unplaced circle { stroke: var(--primary-text-color); }
  .client-ring { fill: none; vector-effect: non-scaling-stroke; pointer-events: none; opacity: 0.9; }
  .client-ring.stale { stroke: var(--disabled-text-color, #9e9e9e); }
  .client-line { vector-effect: non-scaling-stroke; pointer-events: none; opacity: 0.85; }
  .client-label { fill: var(--primary-text-color); text-anchor: middle; pointer-events: none; paint-order: stroke;
                  stroke: var(--card-background-color, #fff); stroke-width: 3px; stroke-linejoin: round; }
  .client.stale circle { fill: var(--disabled-text-color, #9e9e9e); }
  .client-line.stale { stroke: var(--disabled-text-color, #9e9e9e); }
  .banner { font-size: 12px; padding: 2px 8px; border-radius: 4px; background: color-mix(in srgb, var(--warning-color, #ffa600) 30%, transparent); color: var(--primary-text-color); }
  .legend .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
  .legend .hatch { display: inline-block; width: 10px; height: 10px; margin-left: 6px;
                   background: repeating-linear-gradient(45deg, var(--divider-color, #888) 0 2px, transparent 2px 5px); }
  .opening line, .opening path { vector-effect: non-scaling-stroke; fill: none; }
  .opening .gap { stroke: var(--card-background-color, #fff); stroke-width: 4; }
  .opening .leaf, .opening .pane { stroke: var(--primary-text-color); stroke-width: 1.5; }
  .opening .sash { stroke: var(--primary-text-color); stroke-width: 1; }
  .opening.fixed .pane { stroke: var(--secondary-text-color); stroke-width: 1; }
  .opening .track { stroke: var(--secondary-text-color); stroke-width: 1; stroke-dasharray: 2 3; }
  .opening.sliding .leaf { stroke-width: 2.5; }
  .opening .jamb { stroke: var(--primary-text-color); stroke-width: 1.5; }
  .opening.closed .leaf { stroke: var(--secondary-text-color); stroke-width: 2.5; }
  .opening .swing { stroke: var(--secondary-text-color); stroke-width: 1; stroke-dasharray: 3 3; }
  .opening.linked.open .leaf, .opening.linked.open .pane, .opening.linked.open .swing { stroke: var(--floorplan-security, #e53935); }
  .opening.unknown .leaf, .opening.unknown .pane { stroke-dasharray: 4 3; }
  .opening.selected .leaf, .opening.selected .pane, .opening.selected .swing, .opening.selected .sash, .opening.selected .track { stroke: var(--accent-color, #ff9800); }
  .opening.selected .gap { stroke: var(--accent-color, #ff9800); stroke-opacity: 0.35; stroke-width: 8; }
  .opening .hit { stroke: transparent; stroke-width: 16; cursor: move; }
  .opening-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .opening-panel input { width: 5em; }
  .wall-selected { stroke: var(--accent-color, #ff9800); stroke-width: 5; stroke-opacity: 0.6; stroke-linecap: round;
    vector-effect: non-scaling-stroke; pointer-events: none; }
  .wall-panel, .ap-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .wifi-disabled { font-size: 12px; color: var(--secondary-text-color); }
  .wifi-disabled ul { margin: 4px 0 0; padding-left: 18px; }
  .wall-panel input[type=number], .point-panel input[type=number] { width: 5em; }
  .wall-panel .floor-label { margin-left: 12px; }
  .ap-check, .outdoor-check { display: inline-flex; align-items: center; gap: 4px; }
  .sample { pointer-events: none; }
  .sample circle { fill: var(--primary-text-color); stroke: var(--card-background-color, #fff); stroke-width: 1;
                   vector-effect: non-scaling-stroke; }
  .sample[data-source=manual] circle { fill: var(--secondary-text-color); }
  .sample-label { fill: var(--primary-text-color); paint-order: stroke; stroke: var(--card-background-color, #fff);
                  stroke-linejoin: round; }
  .next-spot { fill: none; stroke: var(--accent-color, #ff9800); stroke-width: 2; stroke-dasharray: 4 3;
               vector-effect: non-scaling-stroke; pointer-events: none; }
  .next-spot-label { fill: var(--accent-color, #ff9800); text-anchor: middle; font-weight: 600; pointer-events: none; }
  .survey-spot, .reading-spot { fill: var(--primary-color); fill-opacity: 0.35; stroke: var(--primary-color); stroke-width: 2;
                                vector-effect: non-scaling-stroke; pointer-events: none; }
  .survey { padding: 0 12px 8px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .survey:empty { display: none; }
  .survey-link { font-variant-numeric: tabular-nums; font-weight: 600; }
  .survey-actions, .reading-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .reading-panel input { width: 5em; }
  .survey-progress { display: inline-block; width: 120px; height: 6px; border-radius: 3px; overflow: hidden;
                     background: var(--divider-color, #888); }
  .survey-progress span { display: block; height: 100%; width: 0; background: var(--primary-color);
                          animation: survey-fill 10s linear forwards; }
  @keyframes survey-fill { to { width: 100%; } }
  .survey-note, .survey-help, .survey-next { color: var(--secondary-text-color); }
  .survey-next ol { display: inline; margin: 0; padding-left: 0; }
  .survey-next li { display: inline; margin-left: 8px; }
  .survey-next li::before { content: counter(list-item) ". "; }
  .survey-help { margin: 0; font-size: 12px; }
  .open-wall-mask { stroke: var(--card-background-color, #fff); stroke-width: 3; vector-effect: non-scaling-stroke;
                    pointer-events: none; }
  .open-wall { stroke: var(--secondary-text-color); stroke-width: 1.5; stroke-dasharray: 5 4;
               vector-effect: non-scaling-stroke; pointer-events: none; }
  .open-to { color: var(--secondary-text-color); }
  .message, .hint { padding: 0 12px 8px; color: var(--secondary-text-color); }
  .message:empty, .hint:empty { display: none; }
  .notice { padding: 16px; color: var(--secondary-text-color); }
`;
