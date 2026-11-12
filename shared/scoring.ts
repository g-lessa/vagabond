import type { CustomBounds } from './types.js';

export const EARTH_RADIUS_METERS = 6_371_000;
export const WORLD_DIAGONAL_METERS = 14_917_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function calculateBoundsDiagonalMeters(bounds: CustomBounds): number {
  const spanLng = Math.abs(bounds.east - bounds.west);
  const spanLat = Math.abs(bounds.north - bounds.south);
  if (spanLng >= 300 && spanLat >= 120) {
    return WORLD_DIAGONAL_METERS;
  }
  const diagonal = haversineDistanceMeters(
    bounds.south,
    bounds.west,
    bounds.north,
    bounds.east,
  );
  // Clamp minimum diagonal to 1,000m so tiny custom city areas still have a meaningful curve
  return Math.max(1_000, Math.round(diagonal));
}

export function calculateGeoGuessrScore(
  distanceMeters: number,
  mapDiagonalMeters: number,
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return 0;
  }
  const safeDiagonal = Math.max(1_000, mapDiagonalMeters);
  const perfectThreshold = Math.max(25, safeDiagonal / 100_000);
  if (distanceMeters <= perfectThreshold) {
    return 5000;
  }
  const raw = 5000 * Math.exp((-10 * distanceMeters) / safeDiagonal);
  return Math.max(0, Math.min(5000, Math.round(raw)));
}

export function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) {
    return '—';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  if (km < 10) {
    return `${km.toFixed(2)} km`;
  }
  if (km < 100) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
