// The home's areas as the pocket shows them: the rooms of the card config in the home's order,
// then the Outside pseudo-area when the home names `outside` or `weather`. Plain ES module: no DOM.
//
//   areasOf(config, t?) -> [area]      an area is a room of config.rooms, or the Outside:
//       {id: "outside", name: t("card.pocket.area.outside"), outside: true,
//        climate: {temperature?, humidity?}, weather?}
//   comfortOf(thresholds, area)        the area's comfort range ids: thresholds.rooms.<id>, or
//                                      thresholds.outside for the Outside
//   climateReadings(area)              the climate readings the area can show, in order
//   climateValue(hass, area, reading)  a climate reading as a number, or null
//
// The Outside's readings come from config.outside's sensors; one it does not name comes from the
// weather entity's attribute of the same name (temperature, humidity), as weather entities give them.

import { numberOf } from "./level.js";

export const OUTSIDE = "outside";
const CLIMATE = ["temperature", "humidity"];

export function outsideArea(config, t) {
  if (!config?.outside && !config?.weather) return null;
  const climate = {};
  for (const reading of CLIMATE) if (config.outside?.[reading]) climate[reading] = config.outside[reading];
  const area = { id: OUTSIDE, name: t ? t("card.pocket.area.outside") : "", outside: true, climate };
  if (config.weather) area.weather = config.weather;
  return area;
}

export function areasOf(config, t) {
  const rooms = Array.isArray(config?.rooms) ? config.rooms : [];
  const outside = outsideArea(config, t);
  return outside ? [...rooms, outside] : rooms;
}

export function comfortOf(thresholds, area) {
  return area?.outside ? thresholds?.outside : thresholds?.rooms?.[area?.id];
}

export function climateReadings(area) {
  return CLIMATE.filter((reading) => area?.climate?.[reading] || area?.weather);
}

export function climateValue(hass, area, reading) {
  const entity = area?.climate?.[reading];
  if (entity) return numberOf(hass, entity);
  const value = area?.weather ? hass?.states?.[area.weather]?.attributes?.[reading] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
