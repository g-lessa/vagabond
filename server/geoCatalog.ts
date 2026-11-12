import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import {
  CURATED_MAP_PRESETS,
  CUSTOM_AREA_PRESET_ID,
  resolveMapMeta,
} from '../shared/maps.js';
import {
  pointInBounds,
  pointInGeometry,
  type GeoGeometry,
} from '../shared/geo.js';
import { calculateBoundsDiagonalMeters } from '../shared/scoring.js';
import type { CustomBounds, MapPreset } from '../shared/types.js';

const require = createRequire(import.meta.url);

export interface CountryFeature {
  id: string;
  name: string;
  geometry: GeoGeometry;
  bounds: CustomBounds;
  diagonalMeters: number;
}

interface CountryProps {
  name?: string;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function computePolygonBounds(geometry: GeoGeometry): CustomBounds {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  const visitRing = (ring: number[][]) => {
    for (const [lng, lat] of ring) {
      if (lat > north) north = lat;
      if (lat < south) south = lat;
      if (lng > east) east = lng;
      if (lng < west) west = lng;
    }
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) visitRing(ring);
  } else {
    // Handle antimeridian-crossing multipolygons (e.g., Russia, Fiji) by checking span
    for (const poly of geometry.coordinates) {
      let polyEast = -180;
      let polyWest = 180;
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (lat > north) north = lat;
          if (lat < south) south = lat;
          if (lng > polyEast) polyEast = lng;
          if (lng < polyWest) polyWest = lng;
        }
      }
      // Skip tiny antimeridian wrap slivers if eastern hemisphere already spans wide
      if (polyEast - polyWest < 180) {
        if (polyEast > east) east = polyEast;
        if (polyWest < west) west = polyWest;
      }
    }
    if (east < west) {
      west = -180;
      east = 180;
    }
  }

  // If a country spans > 260 degrees longitudinally (e.g. Russia/USA Aleutians/Fiji wrap),
  // constrain overly-wide bounds from huge ocean spans where needed
  if (east - west > 260) {
    // Re-evaluate keeping eastern hemisphere if majority of points are > 0
    let posCount = 0;
    let negCount = 0;
    const countSide = (ring: number[][]) => {
      for (const [lng] of ring) {
        if (lng >= 0) posCount++;
        else negCount++;
      }
    };
    if (geometry.type === 'Polygon') {
      countSide(geometry.coordinates[0] ?? []);
    } else {
      for (const poly of geometry.coordinates) countSide(poly[0] ?? []);
    }
    if (posCount > negCount * 3) {
      let pWest = 180;
      let pEast = -180;
      const visitPos = (ring: number[][]) => {
        for (const [lng] of ring) {
          if (lng >= 0) {
            if (lng < pWest) pWest = lng;
            if (lng > pEast) pEast = lng;
          }
        }
      };
      if (geometry.type === 'Polygon') visitPos(geometry.coordinates[0] ?? []);
      else for (const poly of geometry.coordinates) visitPos(poly[0] ?? []);
      if (pWest <= pEast) {
        west = pWest;
        east = pEast;
      }
    }
  }

  return { north, south, east, west };
}

class GeoCatalog {
  readonly countries: CountryFeature[] = [];
  readonly countriesById = new Map<string, CountryFeature>();
  readonly allPresets: MapPreset[] = [];
  readonly worldCandidateCountries: CountryFeature[] = [];

  constructor() {
    const atlasPath = require.resolve('world-atlas/countries-110m.json');
    const raw = JSON.parse(fs.readFileSync(atlasPath, 'utf8')) as Topology<{
      countries: GeometryCollection<CountryProps>;
    }>;

    const geoCollection = feature(raw, raw.objects.countries);

    for (const feat of geoCollection.features) {
      const geom = feat.geometry;
      if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
        continue;
      }
      const name = feat.properties?.name?.trim() || 'Unknown';
      const rawId = feat.id != null ? String(feat.id) : slugifyName(name);
      // Exclude Antarctica & uninhabited French Southern Antarctic Lands
      if (rawId === '010' || rawId === '260') {
        continue;
      }
      const bounds = computePolygonBounds(geom as GeoGeometry);
      const diagonalMeters = calculateBoundsDiagonalMeters(bounds);
      const country: CountryFeature = {
        id: rawId,
        name,
        geometry: geom as GeoGeometry,
        bounds,
        diagonalMeters,
      };
      this.countries.push(country);
      this.countriesById.set(rawId, country);
    }

    // Build preset catalog: curated first, then remaining countries alphabetically
    const curatedMapIds = new Set(CURATED_MAP_PRESETS.map((p) => p.id));
    const additionalCountries: MapPreset[] = this.countries
      .filter((c) => !curatedMapIds.has(`country:${c.id}`))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        id: `country:${c.id}`,
        name: c.name,
        category: 'country',
        emoji: '📍',
        description: `Explore street imagery across ${c.name}.`,
        diagonalMeters: c.diagonalMeters,
        bounds: c.bounds,
        countryIds: [c.id],
      }));

    this.allPresets = [...CURATED_MAP_PRESETS, ...additionalCountries];

    // World candidates: exclude tiny micro-geometries whose 110m area is negligible (< 15km diagonal)
    this.worldCandidateCountries = this.countries.filter(
      (c) => c.diagonalMeters >= 50_000,
    );
  }

  findCountryName(lng: number, lat: number): string | null {
    for (const country of this.countries) {
      if (!pointInBounds(lng, lat, country.bounds)) {
        continue;
      }
      if (pointInGeometry(lng, lat, country.geometry)) {
        return country.name;
      }
    }
    return null;
  }

  getMapTarget(
    mapId: string,
    customBounds?: CustomBounds,
  ): {
    id: string;
    name: string;
    bounds: CustomBounds;
    diagonalMeters: number;
    polygons: GeoGeometry[];
    matchPoint: (lng: number, lat: number) => boolean;
  } {
    if (mapId === CUSTOM_AREA_PRESET_ID && customBounds) {
      const meta = resolveMapMeta(mapId, this.allPresets, customBounds);
      return {
        id: CUSTOM_AREA_PRESET_ID,
        name: meta.name,
        bounds: meta.bounds,
        diagonalMeters: meta.diagonalMeters,
        polygons: [],
        matchPoint: (lng: number, lat: number) => pointInBounds(lng, lat, meta.bounds),
      };
    }

    const preset =
      this.allPresets.find((p) => p.id === mapId) ?? CURATED_MAP_PRESETS[0];

    const polygons: GeoGeometry[] = [];
    if (preset.countryIds && preset.countryIds.length > 0) {
      for (const cid of preset.countryIds) {
        const c = this.countriesById.get(cid);
        if (c) polygons.push(c.geometry);
      }
    }

    const bounds = preset.bounds;
    const matchPoint = (lng: number, lat: number): boolean => {
      if (!pointInBounds(lng, lat, bounds)) {
        return false;
      }
      if (polygons.length === 0) {
        // World map: match any inhabited landmass country when available
        return this.findCountryName(lng, lat) !== null;
      }
      for (const poly of polygons) {
        if (pointInGeometry(lng, lat, poly)) {
          return true;
        }
      }
      return false;
    };

    return {
      id: preset.id,
      name: preset.name,
      bounds,
      diagonalMeters: preset.diagonalMeters,
      polygons,
      matchPoint,
    };
  }
}

export const geoCatalog = new GeoCatalog();
