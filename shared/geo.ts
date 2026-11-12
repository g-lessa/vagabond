import type { CustomBounds } from './types.js';

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GeoGeometry = GeoPolygon | GeoMultiPolygon;

const MAX_MERCATOR_LAT = 85.05112878;

export function clampLat(lat: number): number {
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
}

export function normalizeLng(lng: number): number {
  let x = lng;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

export function lngLatToTile(
  lng: number,
  lat: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = clampLat(lat);
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((normalizeLng(lng) + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(
      n - 1,
      Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
      ),
    ),
  );
  return { x, y };
}

export function tileToBounds(x: number, y: number, z: number): CustomBounds {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  return {
    north: (northRad * 180) / Math.PI,
    south: (southRad * 180) / Math.PI,
    east,
    west,
  };
}

export function boundsToTileRange(
  bounds: CustomBounds,
  z: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const nw = lngLatToTile(bounds.west, bounds.north, z);
  const se = lngLatToTile(bounds.east, bounds.south, z);
  return {
    minX: Math.min(nw.x, se.x),
    maxX: Math.max(nw.x, se.x),
    minY: Math.min(nw.y, se.y),
    maxY: Math.max(nw.y, se.y),
  };
}

export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0 || !pointInRing(lng, lat, rings[0])) {
    return false;
  }
  // Check interior holes
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) {
      return false;
    }
  }
  return true;
}

export function pointInGeometry(
  lng: number,
  lat: number,
  geometry: GeoGeometry,
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoords(lng, lat, geometry.coordinates);
  }
  for (const polygon of geometry.coordinates) {
    if (pointInPolygonCoords(lng, lat, polygon)) {
      return true;
    }
  }
  return false;
}

export function pointInBounds(lng: number, lat: number, bounds: CustomBounds): boolean {
  return (
    lat <= bounds.north &&
    lat >= bounds.south &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}
