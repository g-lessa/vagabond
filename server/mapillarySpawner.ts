import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import {
  boundsToTileRange,
  lngLatToTile,
  pointInBounds,
} from '../shared/geo.js';
import { CURATED_MAP_PRESETS } from '../shared/maps.js';
import { geoCatalog } from './geoCatalog.js';
import type { CustomBounds } from '../shared/types.js';

export interface SpawnedLocation {
  imageId: string;
  lat: number;
  lng: number;
  isPano: boolean;
  compassAngle: number;
  sequenceId: string | null;
  countryName: string | null;
}

export interface SpawnRequest {
  mapId: string;
  customBounds?: CustomBounds;
  only360: boolean;
  excludeImageIds?: Set<string>;
  excludeSequenceIds?: Set<string>;
}

interface TileCacheEntry {
  tile: VectorTile | null;
  expiresAt: number;
}

const TILE_CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_TILE_CACHE_SIZE = 600;
const tileCache = new Map<string, TileCacheEntry>();

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomChoice<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchVectorTile(
  z: number,
  x: number,
  y: number,
  token: string,
): Promise<VectorTile | null> {
  const key = `${z}/${x}/${y}`;
  const now = Date.now();
  const cached = tileCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.tile;
  }

  const url = `https://tiles.mapillary.com/maps/vtp/mly1_public/2/${z}/${x}/${y}?access_token=${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Mapillary rejected the access token (HTTP ' + res.status + '). Please check your Client Token.',
      );
    }
    let tile: VectorTile | null = null;
    if (res.ok && res.status !== 204) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0) {
        tile = new VectorTile(new Pbf(new Uint8Array(buf)));
      }
    }
    if (tileCache.size >= MAX_TILE_CACHE_SIZE) {
      const oldestKey = tileCache.keys().next().value;
      if (oldestKey) tileCache.delete(oldestKey);
    }
    tileCache.set(key, { tile, expiresAt: now + TILE_CACHE_TTL_MS });
    return tile;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyImageViaGraph(
  imageId: string,
  token: string,
  requirePano: boolean,
  sequenceId: string | null,
): Promise<SpawnedLocation | null> {
  const url = `https://graph.mapillary.com/${encodeURIComponent(
    imageId,
  )}?fields=id,geometry,computed_geometry,is_pano,compass_angle`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `OAuth ${token}` },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Mapillary rejected the access token while verifying an image.',
      );
    }
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      is_pano?: boolean;
      compass_angle?: number;
      geometry?: { coordinates?: [number, number] };
      computed_geometry?: { coordinates?: [number, number] };
    };
    const isPano = Boolean(data.is_pano);
    if (requirePano && !isPano) {
      return null;
    }
    const coords =
      data.computed_geometry?.coordinates ?? data.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      return null;
    }
    const [lng, lat] = coords;
    const countryName = geoCatalog.findCountryName(lng, lat);
    return {
      imageId: String(data.id ?? imageId),
      lat,
      lng,
      isPano,
      compassAngle:
        typeof data.compass_angle === 'number' ? data.compass_angle : 0,
      sequenceId,
      countryName,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('access token')) {
      throw err;
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface ImageCandidate {
  id: string;
  lng: number;
  lat: number;
  isPano: boolean;
  sequenceId: string | null;
  qualityScore: number;
}

function extractImageCandidatesFromTile(
  tile: VectorTile,
  z: number,
  x: number,
  y: number,
  only360: boolean,
  matchPoint: (lng: number, lat: number) => boolean,
  excludeImageIds?: Set<string>,
  excludeSequenceIds?: Set<string>,
): ImageCandidate[] {
  const layer = tile.layers['image'];
  if (!layer || layer.length === 0) return [];

  const candidates: ImageCandidate[] = [];
  const step = layer.length > 350 ? Math.ceil(layer.length / 250) : 1;

  for (let i = 0; i < layer.length; i += step) {
    const feat = layer.feature(i);
    const props = feat.properties;
    const isPano = props.is_pano === true;
    if (only360 && !isPano) continue;

    const id = props.id != null ? String(props.id) : null;
    if (!id) continue;
    if (excludeImageIds?.has(id)) continue;

    const seqId = props.sequence_id != null ? String(props.sequence_id) : null;
    if (seqId && excludeSequenceIds?.has(seqId)) continue;

    const geo = feat.toGeoJSON(x, y, z);
    if (geo.geometry.type !== 'Point') continue;
    const [lng, lat] = geo.geometry.coordinates;
    if (!matchPoint(lng, lat)) continue;

    const quality =
      typeof props.quality_score === 'number' ? props.quality_score : 0.5;
    candidates.push({
      id,
      lng,
      lat,
      isPano,
      sequenceId: seqId,
      qualityScore: quality,
    });
  }

  // Bias mildly toward higher quality imagery while preserving randomness
  candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  const topPool = candidates.slice(0, Math.max(12, Math.ceil(candidates.length * 0.5)));
  return shuffleInPlace(topPool);
}

async function pickFromZ14Tile(
  x: number,
  y: number,
  token: string,
  only360: boolean,
  matchPoint: (lng: number, lat: number) => boolean,
  excludeImageIds?: Set<string>,
  excludeSequenceIds?: Set<string>,
): Promise<SpawnedLocation | null> {
  const tile = await fetchVectorTile(14, x, y, token);
  if (!tile) return null;

  const candidates = extractImageCandidatesFromTile(
    tile,
    14,
    x,
    y,
    only360,
    matchPoint,
    excludeImageIds,
    excludeSequenceIds,
  );
  for (const cand of candidates.slice(0, 3)) {
    const verified = await verifyImageViaGraph(
      cand.id,
      token,
      only360,
      cand.sequenceId,
    );
    if (verified && matchPoint(verified.lng, verified.lat)) {
      return verified;
    }
  }
  return null;
}

function sampleLandPoints(
  bounds: CustomBounds,
  matchPoint: (lng: number, lat: number) => boolean,
  desiredCount: number,
): Array<{ lng: number; lat: number }> {
  const points: Array<{ lng: number; lat: number }> = [];
  const maxAttempts = desiredCount * 80;
  for (let i = 0; i < maxAttempts && points.length < desiredCount; i++) {
    const lat = bounds.south + Math.random() * (bounds.north - bounds.south);
    const lng = bounds.west + Math.random() * (bounds.east - bounds.west);
    if (matchPoint(lng, lat)) {
      points.push({ lng, lat });
    }
  }
  return points;
}

async function spawnInTarget(
  target: ReturnType<typeof geoCatalog.getMapTarget>,
  token: string,
  only360: boolean,
  excludeImageIds?: Set<string>,
  excludeSequenceIds?: Set<string>,
): Promise<SpawnedLocation | null> {
  const z14Range = boundsToTileRange(target.bounds, 14);
  const z14TileCount =
    (z14Range.maxX - z14Range.minX + 1) * (z14Range.maxY - z14Range.minY + 1);

  // Small areas (e.g., custom city boxes): inspect z=14 directly
  if (z14TileCount <= 64) {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let x = z14Range.minX; x <= z14Range.maxX; x++) {
      for (let y = z14Range.minY; y <= z14Range.maxY; y++) {
        tiles.push({ x, y });
      }
    }
    shuffleInPlace(tiles);
    for (const t of tiles.slice(0, 12)) {
      const loc = await pickFromZ14Tile(
        t.x,
        t.y,
        token,
        only360,
        target.matchPoint,
        excludeImageIds,
        excludeSequenceIds,
      );
      if (loc) return loc;
    }
    return null;
  }

  // Medium areas (small countries / states): check z=10 sequences directly
  const spanDeg = Math.max(
    target.bounds.north - target.bounds.south,
    target.bounds.east - target.bounds.west,
  );
  if (spanDeg <= 4.5) {
    const z10Range = boundsToTileRange(target.bounds, 10);
    const z10Tiles: Array<{ x: number; y: number }> = [];
    for (let x = z10Range.minX; x <= z10Range.maxX; x++) {
      for (let y = z10Range.minY; y <= z10Range.maxY; y++) {
        z10Tiles.push({ x, y });
      }
    }
    shuffleInPlace(z10Tiles);
    for (const t of z10Tiles.slice(0, 10)) {
      const z10Tile = await fetchVectorTile(10, t.x, t.y, token);
      const seqLayer = z10Tile?.layers['sequence'];
      if (!seqLayer || seqLayer.length === 0) continue;

      const indices = shuffleInPlace(
        Array.from({ length: Math.min(seqLayer.length, 40) }, (_, idx) =>
          Math.floor((idx / Math.min(seqLayer.length, 40)) * seqLayer.length),
        ),
      );
      for (const idx of indices.slice(0, 6)) {
        const geo = seqLayer.feature(idx).toGeoJSON(t.x, t.y, 10);
        if (geo.geometry.type !== 'LineString' || geo.geometry.coordinates.length === 0) {
          continue;
        }
        const pt = randomChoice(geo.geometry.coordinates);
        if (!pt || !target.matchPoint(pt[0], pt[1])) continue;
        const z14 = lngLatToTile(pt[0], pt[1], 14);
        const loc = await pickFromZ14Tile(
          z14.x,
          z14.y,
          token,
          only360,
          target.matchPoint,
          excludeImageIds,
          excludeSequenceIds,
        );
        if (loc) return loc;
      }
    }
  }

  // Large areas (countries / continents): Stage 1 overview at z=5
  const z5Range = boundsToTileRange(target.bounds, 5);
  const z5CandidateMap = new Map<string, { x: number; y: number }>();

  const totalZ5 =
    (z5Range.maxX - z5Range.minX + 1) * (z5Range.maxY - z5Range.minY + 1);
  if (totalZ5 <= 36) {
    for (let x = z5Range.minX; x <= z5Range.maxX; x++) {
      for (let y = z5Range.minY; y <= z5Range.maxY; y++) {
        z5CandidateMap.set(`${x}/${y}`, { x, y });
      }
    }
  } else {
    const landPts = sampleLandPoints(target.bounds, target.matchPoint, 28);
    for (const p of landPts) {
      const t = lngLatToTile(p.lng, p.lat, 5);
      z5CandidateMap.set(`${t.x}/${t.y}`, t);
    }
    if (z5CandidateMap.size === 0) {
      for (let i = 0; i < 16; i++) {
        const x =
          z5Range.minX +
          Math.floor(Math.random() * (z5Range.maxX - z5Range.minX + 1));
        const y =
          z5Range.minY +
          Math.floor(Math.random() * (z5Range.maxY - z5Range.minY + 1));
        z5CandidateMap.set(`${x}/${y}`, { x, y });
      }
    }
  }

  const z5Tiles = shuffleInPlace(Array.from(z5CandidateMap.values()));

  const overviewHits: Array<{
    id: string;
    lng: number;
    lat: number;
    sequenceId: string | null;
  }> = [];

  for (const t of z5Tiles.slice(0, 12)) {
    const tile = await fetchVectorTile(5, t.x, t.y, token);
    const layer = tile?.layers['overview'];
    if (!layer || layer.length === 0) continue;

    const sampleStep = layer.length > 200 ? Math.ceil(layer.length / 150) : 1;
    for (let i = 0; i < layer.length; i += sampleStep) {
      const feat = layer.feature(i);
      const props = feat.properties;
      if (only360 && props.is_pano !== true) continue;
      const id = props.id != null ? String(props.id) : null;
      if (!id || excludeImageIds?.has(id)) continue;
      const seqId = props.sequence_id != null ? String(props.sequence_id) : null;
      if (seqId && excludeSequenceIds?.has(seqId)) continue;

      const geo = feat.toGeoJSON(t.x, t.y, 5);
      if (geo.geometry.type !== 'Point') continue;
      const [lng, lat] = geo.geometry.coordinates;
      if (!pointInBounds(lng, lat, target.bounds)) continue;
      if (!target.matchPoint(lng, lat)) continue;

      overviewHits.push({ id, lng, lat, sequenceId: seqId });
    }
    if (overviewHits.length >= 24) break;
  }

  if (overviewHits.length === 0) return null;

  shuffleInPlace(overviewHits);
  for (const hit of overviewHits.slice(0, 5)) {
    // Try z=10 road exploration near this overview point for rich road variety
    const z10 = lngLatToTile(hit.lng, hit.lat, 10);
    const z10Tile = await fetchVectorTile(10, z10.x, z10.y, token);
    const seqLayer = z10Tile?.layers['sequence'];
    if (seqLayer && seqLayer.length > 0) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const feat = seqLayer.feature(Math.floor(Math.random() * seqLayer.length));
        const geo = feat.toGeoJSON(z10.x, z10.y, 10);
        if (geo.geometry.type === 'LineString' && geo.geometry.coordinates.length > 0) {
          const pt = randomChoice(geo.geometry.coordinates);
          if (pt && target.matchPoint(pt[0], pt[1])) {
            const z14 = lngLatToTile(pt[0], pt[1], 14);
            const loc = await pickFromZ14Tile(
              z14.x,
              z14.y,
              token,
              only360,
              target.matchPoint,
              excludeImageIds,
              excludeSequenceIds,
            );
            if (loc) return loc;
          }
        }
      }
    }

    // Fallback directly to the z=14 tile containing the overview hit (already verified pano)
    const hitZ14 = lngLatToTile(hit.lng, hit.lat, 14);
    const directTileLoc = await pickFromZ14Tile(
      hitZ14.x,
      hitZ14.y,
      token,
      only360,
      target.matchPoint,
      excludeImageIds,
      excludeSequenceIds,
    );
    if (directTileLoc) return directTileLoc;

    // Last fallback: verify the overview image ID itself
    const directGraph = await verifyImageViaGraph(
      hit.id,
      token,
      only360,
      hit.sequenceId,
    );
    if (directGraph && target.matchPoint(directGraph.lng, directGraph.lat)) {
      return directGraph;
    }
  }

  return null;
}

const WORLD_CONTINENT_IDS = [
  'europe',
  'north-america',
  'south-america',
  'asia',
  'africa',
  'oceania',
];

export async function spawnMapillaryLocation(
  req: SpawnRequest,
  token: string,
): Promise<SpawnedLocation> {
  if (req.mapId === 'world') {
    const continentPool = shuffleInPlace([...WORLD_CONTINENT_IDS]);
    // Pick across continents evenly, picking individual countries inside each continent
    for (let attempt = 0; attempt < 18; attempt++) {
      const contId = continentPool[attempt % continentPool.length];
      const contPreset = CURATED_MAP_PRESETS.find((p) => p.id === contId);
      const candidateIds = (contPreset?.countryIds ?? []).filter((cid) =>
        geoCatalog.countriesById.has(cid),
      );
      const pickedCid = randomChoice(candidateIds);
      const targetId = pickedCid ? `country:${pickedCid}` : contId;
      const target = geoCatalog.getMapTarget(targetId);

      // Clip country target bounds to continent bounds for overseas territories (e.g. France)
      if (contPreset) {
        target.bounds = {
          north: Math.min(target.bounds.north, contPreset.bounds.north),
          south: Math.max(target.bounds.south, contPreset.bounds.south),
          east: Math.min(target.bounds.east, contPreset.bounds.east),
          west: Math.max(target.bounds.west, contPreset.bounds.west),
        };
      }
      if (target.bounds.north <= target.bounds.south || target.bounds.east <= target.bounds.west) {
        continue;
      }

      const loc = await spawnInTarget(
        target,
        token,
        req.only360,
        req.excludeImageIds,
        req.excludeSequenceIds,
      );
      if (loc) return loc;
    }
  } else {
    const target = geoCatalog.getMapTarget(req.mapId, req.customBounds);
    for (let attempt = 0; attempt < 5; attempt++) {
      const loc = await spawnInTarget(
        target,
        token,
        req.only360,
        req.excludeImageIds,
        req.excludeSequenceIds,
      );
      if (loc) return loc;
    }
  }

  throw new Error(
    req.only360
      ? 'Could not find a 360° panorama in the selected area. Try turning off "360° panoramas only" in lobby settings or picking a larger region.'
      : 'Could not find Mapillary imagery in the selected area. Try expanding the region.',
  );
}
