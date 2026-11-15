import { geoCatalog } from './geoCatalog.js';
import type { SpawnedLocation, SpawnRequest } from './mapillarySpawner.js';

interface GoogleStreetViewMetadataResponse {
  status: 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND' | 'REQUEST_DENIED' | 'OVER_QUERY_LIMIT';
  pano_id?: string;
  location?: {
    lat: number;
    lng: number;
  };
  date?: string; // e.g. "2021-08"
  copyright?: string;
  error_message?: string;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export async function spawnGoogleLocation(
  req: SpawnRequest,
  apiKey: string,
): Promise<SpawnedLocation> {
  const target = geoCatalog.getMapTarget(req.mapId, req.customBounds);
  const bounds = target.bounds;

  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const lat = randomInRange(bounds.south, bounds.north);
    const lng = randomInRange(bounds.west, bounds.east);

    if (!target.matchPoint(lng, lat)) {
      continue;
    }

    const radius = 100000; // 100km search radius
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat.toFixed(5)},${lng.toFixed(5)}&radius=${radius}&source=outdoor&key=${encodeURIComponent(apiKey)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const data = (await res.json()) as GoogleStreetViewMetadataResponse;

      if (data.status === 'REQUEST_DENIED') {
        throw new Error(data.error_message ?? 'Google rejected the API key. Please check your Google Maps Key.');
      }

      if (data.status === 'OK' && data.location && data.pano_id) {
        const actualLat = data.location.lat;
        const actualLng = data.location.lng;

        if (req.excludeImageIds?.has(data.pano_id)) {
          continue;
        }

        const countryName = geoCatalog.findCountryName(actualLng, actualLat);
        let capturedAtYear: number | null = null;
        if (data.date) {
          const yr = parseInt(data.date.split('-')[0], 10);
          if (!Number.isNaN(yr)) capturedAtYear = yr;
        }

        return {
          imageId: `g_${data.pano_id}`,
          googlePanoId: data.pano_id,
          lat: actualLat,
          lng: actualLng,
          isPano: true,
          compassAngle: 0,
          sequenceId: null,
          countryName,
          capturedAtYear,
        };
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Google rejected')) {
        throw err;
      }
      // transient failure, continue loop
    }
  }

  throw new Error(`Could not find a Google Street View panorama in ${target.name} after multiple attempts. Try a wider area or Mapillary.`);
}
