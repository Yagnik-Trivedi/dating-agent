// ~100 Indian cities with coordinates (plan 30 S0), so the gate's optional radius works. A city that isn't listed
// ("Other") is matched on its name only.
import { readFileSync } from 'node:fs';

const LIST = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url), 'utf8'));
export const CITY_NAMES = LIST.map(([name]) => name);
const BY_NAME = new Map(LIST.map(([name, lat, lng]) => [name.toLowerCase(), { type: 'Point', coordinates: [lng, lat] }]));

/** GeoJSON point for a listed city (case-insensitive), else undefined. */
export const cityGeo = (name) => BY_NAME.get(String(name ?? '').trim().toLowerCase());

/** Great-circle distance in km between two GeoJSON points. */
export function distanceKm(a, b) {
  const [lng1, lat1] = a.coordinates, [lng2, lat2] = b.coordinates;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
