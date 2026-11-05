// The trend sheet's chart drawn by Home Assistant's own cards, as the Ramka draws its charts: axes,
// gridlines and a finger's tooltip come with them. Plain ES module but for mountHaChart.
//
//   haChartConfig(spec, range, state) -> card config
//       24 h, and any range of a sensor without long-term statistics (no state_class) or of an
//       on/off timeline: history-graph over that many hours. 7 d / 30 d of a sensor with statistics:
//       statistics-graph with its mean and its min / max (hourly for 7 d, daily for 30 d), as the
//       Ramka's climate charts.
//   haCharts() -> boolean      whether Home Assistant's card helpers are there (a dashboard)
//   mountHaChart(host, config, hass) -> {update(hass)}   the card in `host`, created by the helpers;
//       until they answer, nothing; a card that fails to load leaves the host empty

const HOURS = { "24h": 24, "7d": 7 * 24, "30d": 30 * 24 };
const DAYS = { "7d": 7, "30d": 30 };
const PERIOD = { "7d": "hour", "30d": "day" };

export function haChartConfig(spec, range, state) {
  const hasStatistics = !spec.timeline && !!state?.attributes?.state_class;
  if (range !== "24h" && hasStatistics && DAYS[range]) {
    return { type: "statistics-graph", entities: [spec.entity], days_to_show: DAYS[range], period: PERIOD[range],
      stat_types: ["mean", "min", "max"], chart_type: "line", hide_legend: true };
  }
  return { type: "history-graph", entities: [{ entity: spec.entity }], hours_to_show: HOURS[range] ?? 24 };
}

export const haCharts = () => typeof window !== "undefined" && typeof window.loadCardHelpers === "function";

export function mountHaChart(host, config, hass) {
  const state = { card: null, hass, gone: false };
  window.loadCardHelpers().then((helpers) => {
    if (state.gone) return;
    const card = helpers.createCardElement(config);
    card.hass = state.hass;
    state.card = card;
    host.replaceChildren(card);
  }, () => {});
  return {
    update(next) {
      state.hass = next;
      if (state.card) state.card.hass = next;
    },
    drop() {
      state.gone = true;
      host.replaceChildren();
    },
  };
}
