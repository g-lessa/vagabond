import { describe, expect, it } from 'vitest';
import { lngLatToTile, pointInBounds, tileToBounds } from '../shared/geo.js';
import { geoCatalog } from '../server/geoCatalog.js';

describe('geoCatalog & tile math', () => {
  it('converts coordinates to web mercator tiles and back consistently', () => {
    const lng = 139.7671;
    const lat = 35.6812;
    const t = lngLatToTile(lng, lat, 14);
    const bounds = tileToBounds(t.x, t.y, 14);
    expect(pointInBounds(lng, lat, bounds)).toBe(true);
  });

  it('reverse-geocodes countries offline and returns null in open ocean', () => {
    expect(geoCatalog.findCountryName(139.7671, 35.6812)).toBe('Japan');
    expect(geoCatalog.findCountryName(2.3522, 48.8566)).toBe('France');
    expect(geoCatalog.findCountryName(-74.006, 40.7128)).toBe(
      'United States of America',
    );
    expect(geoCatalog.findCountryName(-150, 0)).toBeNull();
  });

  it('matches target polygons accurately for Europe and individual countries', () => {
    const europe = geoCatalog.getMapTarget('europe');
    expect(europe.matchPoint(2.3522, 48.8566)).toBe(true);
    expect(europe.matchPoint(-52.33, 4.93)).toBe(false); // French Guiana excluded from Europe bounds
    expect(europe.matchPoint(139.7671, 35.6812)).toBe(false);

    const custom = geoCatalog.getMapTarget('custom', {
      north: 49,
      south: 48.7,
      east: 2.6,
      west: 2.1,
    });
    expect(custom.matchPoint(2.3522, 48.8566)).toBe(true);
    expect(custom.matchPoint(10, 48.85)).toBe(false);
  });
});
