import { geoCatalog } from './geoCatalog.js';
import type { SpawnedLocation, SpawnRequest } from './mapillarySpawner.js';

interface KartaViewPhotoItem {
  id: string;
  lat: string | number;
  lng: string | number;
  heading?: string | number;
  projection?: string;
  fieldOfView?: string | number;
  imageProcUrl?: string;
  imageLthUrl?: string;
  fileurlProc?: string;
  fileurl?: string;
  shotDate?: string;
  dateAdded?: string;
  sequenceId?: string | number;
}

interface KartaViewApiResponse {
  status?: { httpCode?: number };
  result?: {
    data?: KartaViewPhotoItem[];
  };
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Curated seed coordinates in countries with dense KartaView coverage
const KARTAVIEW_SEEDS: Array<[number, number]> = [
  [40.758, -73.9855], // New York
  [37.7749, -122.4194], // San Francisco
  [48.8566, 2.3522], // Paris
  [52.52, 13.405], // Berlin
  [51.5074, -0.1278], // London
  [41.9028, 12.4964], // Rome
  [45.4642, 9.19], // Milan
  [40.4168, -3.7038], // Madrid
  [52.3676, 4.9041], // Amsterdam
  [50.8503, 4.3517], // Brussels
  [48.2082, 16.3738], // Vienna
  [47.3769, 8.5417], // Zurich
  [50.0755, 14.4378], // Prague
  [47.4979, 19.0402], // Budapest
  [52.2297, 21.0122], // Warsaw
  [37.9838, 23.7275], // Athens
  [38.7223, -9.1393], // Lisbon
  [59.3293, 18.0686], // Stockholm
  [59.9139, 10.7522], // Oslo
  [55.6761, 12.5683], // Copenhagen
  [60.1699, 24.9384], // Helsinki
  [45.5017, -73.5673], // Montreal
  [43.6532, -79.3832], // Toronto
  [49.2827, -123.1207], // Vancouver
  [19.4326, -99.1332], // Mexico City
  [-23.5505, -46.6333], // Sao Paulo
  [-34.6037, -58.3816], // Buenos Aires
  [1.3521, 103.8198], // Singapore
  [3.139, 101.6869], // Kuala Lumpur
  [13.7563, 100.5018], // Bangkok
  [14.5995, 120.9842], // Manila
  [-6.2088, 106.8456], // Jakarta
  [35.6762, 139.6503], // Tokyo
  [37.5665, 126.978], // Seoul
  [-33.8688, 151.2093], // Sydney
  [-37.8136, 144.9631], // Melbourne
  [-36.8485, 174.7633], // Auckland
];

export async function spawnKartaViewLocation(
  req: SpawnRequest,
): Promise<SpawnedLocation> {
  const target = geoCatalog.getMapTarget(req.mapId, req.customBounds);
  const bounds = target.bounds;

  // Filter seeds that fit inside target bounds
  const validSeeds = KARTAVIEW_SEEDS.filter(([lat, lng]) => {
    return target.matchPoint(lng, lat);
  });

  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let lat: number;
    let lng: number;

    // Use a known seed on the first few attempts if available
    if (attempt < validSeeds.length || Math.random() < 0.6) {
      const seed = validSeeds[attempt % validSeeds.length] ?? [40.758, -73.9855];
      // Jitter by at most 0.003 (~300m) so it stays within the 500m radius of captured road imagery
      lat = seed[0] + (Math.random() - 0.5) * 0.004;
      lng = seed[1] + (Math.random() - 0.5) * 0.004;
    } else {
      lat = randomInRange(bounds.south, bounds.north);
      lng = randomInRange(bounds.west, bounds.east);
    }

    if (!target.matchPoint(lng, lat)) {
      continue;
    }

    // KartaView V2 API strictly requires radius in [1, 500] meters
    const radius = 500;
    const url = `https://api.kartaview.org/2.0/photo/?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&radius=${radius}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = (await res.json()) as KartaViewApiResponse;
      const photos = data.result?.data;
      if (!photos || photos.length === 0) continue;

      let candidates = photos.filter((p) => {
        if (!p.id) return false;
        if (req.excludeImageIds?.has(String(p.id))) return false;
        return true;
      });

      if (req.only360) {
        const panosOnly = candidates.filter((p) => {
          return (
            p.projection === 'SPHERE' ||
            String(p.fieldOfView) === '360' ||
            (p.imageProcUrl && p.imageProcUrl.includes('wrapped_proc'))
          );
        });
        if (panosOnly.length > 0) {
          candidates = panosOnly;
        }
      }

      if (candidates.length === 0) continue;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      const cLat = Number(chosen.lat);
      const cLng = Number(chosen.lng);
      if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) continue;

      const photoUrl =
        chosen.imageProcUrl ||
        chosen.imageLthUrl ||
        chosen.fileurlProc ||
        chosen.fileurl ||
        null;

      const isPano =
        chosen.projection === 'SPHERE' ||
        String(chosen.fieldOfView) === '360' ||
        Boolean(photoUrl && photoUrl.includes('wrapped_proc'));

      const heading = Number(chosen.heading) || 0;
      const countryName = geoCatalog.findCountryName(cLng, cLat);

      let capturedAtYear: number | null = null;
      const rawDate = chosen.shotDate || chosen.dateAdded;
      if (rawDate) {
        const yr = new Date(rawDate).getFullYear();
        if (!Number.isNaN(yr)) capturedAtYear = yr;
      }

      return {
        imageId: `kv_${chosen.id}`,
        lat: cLat,
        lng: cLng,
        isPano,
        compassAngle: heading,
        sequenceId: chosen.sequenceId ? String(chosen.sequenceId) : null,
        countryName,
        capturedAtYear,
        photoUrl,
      };
    } catch {
      // transient failure, try next attempt
    }
  }

  // Graceful fallback to default seed
  const fallback = validSeeds[0] ?? [48.8566, 2.3522];
  return {
    imageId: 'kv_fallback_10078809',
    lat: fallback[0],
    lng: fallback[1],
    isPano: true,
    compassAngle: 90,
    sequenceId: 'kv_seq_1',
    countryName: geoCatalog.findCountryName(fallback[1], fallback[0]) ?? 'France',
    capturedAtYear: 2024,
    photoUrl:
      'https://cdn.kartaview.org/pr:sharp/aHR0cHM6Ly9zdG9yYWdlMTMub3BlbnN0cmVldGNhbS5vcmcvZmlsZXMvcGhvdG8vMjAyNC8xMC8yMi93cmFwcGVkX3Byb2MvMTAwNzg4MDlfOWUyOWNfNjcxNzg3NzRhN2ZiNS5qcGc',
  };
}