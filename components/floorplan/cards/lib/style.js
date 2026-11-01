// The floor plan card's stylesheet, kept apart so the card file holds behaviour.
export const STYLE = `
  :host { display: block; height: 100%; }
  ha-card { height: 100%; box-sizing: border-box; display: flex; flex-direction: column;
            overflow: hidden; font: 14px var(--ha-font-family-body, sans-serif); }
  .bar, .area-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 12px; }
  .area-panel:empty { display: none; }
  .bar .spacer { flex: 1; }
  button { font: inherit; cursor: pointer; padding: 4px 10px; border-radius: 14px; background: none;
           color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  button.on, button.primary { color: var(--text-primary-color, #fff); background: var(--primary-color);
                              border-color: var(--primary-color); }
  button:disabled { opacity: 0.4; cursor: default; }
  select, input { font: inherit; }
  .body { flex: 1; display: flex; min-height: 280px; position: relative; }
  svg { flex: 1; min-width: 0; height: 100%; min-height: 280px; touch-action: none; user-select: none; }
  .room { fill: var(--secondary-background-color, #f2f2f2); stroke: var(--primary-text-color);
          stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .room.selected, .room.picked { fill: var(--primary-color); fill-opacity: 0.25; }
  .label { fill: var(--secondary-text-color); text-anchor: middle; dominant-baseline: middle;
           pointer-events: none; }
  .label.missing { font-style: italic; opacity: 0.6; }
  .edge { stroke: transparent; stroke-width: 12; vector-effect: non-scaling-stroke; }
  .corner { fill: var(--card-background-color, #fff); stroke: var(--primary-color); stroke-width: 2;
            vector-effect: non-scaling-stroke; cursor: move; }
  .pick { fill: var(--accent-color, #ff9800); pointer-events: none; }
  .marker circle { fill: var(--primary-color); stroke: var(--card-background-color, #fff);
                   stroke-width: 2; vector-effect: non-scaling-stroke; }
  .editing .marker { cursor: move; }
  .marker.unplaced circle { fill-opacity: 0.4; stroke-dasharray: 3 2; }
  .marker line.leader { stroke: var(--secondary-text-color); stroke-width: 1; vector-effect: non-scaling-stroke;
                        pointer-events: none; }
  .marker circle.role-ring { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .marker text { fill: var(--primary-text-color); text-anchor: middle; pointer-events: none; }
  .marker.picked circle { stroke: var(--accent-color, #ff9800); }
  .ghost { opacity: 0.6; pointer-events: none; }
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
  .marker rect, .marker polygon { stroke: var(--card-background-color, #fff); stroke-width: 2;
                                  vector-effect: non-scaling-stroke; }
  .marker.unplaced rect, .marker.unplaced polygon { fill-opacity: 0.4; stroke-dasharray: 3 2; }
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
  .message, .hint { padding: 0 12px 8px; color: var(--secondary-text-color); }
  .message:empty, .hint:empty { display: none; }
  .notice { padding: 16px; color: var(--secondary-text-color); }
`;
