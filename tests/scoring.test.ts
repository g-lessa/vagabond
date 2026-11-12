import { describe, expect, it } from 'vitest';
import {
  WORLD_DIAGONAL_METERS,
  calculateBoundsDiagonalMeters,
  calculateGeoGuessrScore,
  formatDistance,
  haversineDistanceMeters,
} from '../shared/scoring.js';

describe('scoring', () => {
  it('computes accurate haversine distances', () => {
    expect(haversineDistanceMeters(35.6762, 139.6503, 35.6762, 139.6503)).toBe(0);
    // Tokyo to London is ~9,560 km
    const dist = haversineDistanceMeters(35.6762, 139.6503, 51.5072, -0.1276);
    expect(dist).toBeGreaterThan(9_400_000);
    expect(dist).toBeLessThan(9_750_000);
  });

  it('awards 5000 inside the perfect threshold and decays exponentially', () => {
    expect(calculateGeoGuessrScore(0, WORLD_DIAGONAL_METERS)).toBe(5000);
    expect(calculateGeoGuessrScore(120, WORLD_DIAGONAL_METERS)).toBe(5000);
    expect(calculateGeoGuessrScore(500_000, WORLD_DIAGONAL_METERS)).toBeGreaterThan(3500);
    expect(calculateGeoGuessrScore(5_000_000, WORLD_DIAGONAL_METERS)).toBeLessThan(200);
  });

  it('scales penalty steeper on smaller regional maps than on World', () => {
    const cityDiag = 20_000;
    const tenKmScoreOnCity = calculateGeoGuessrScore(10_000, cityDiag);
    const tenKmScoreOnWorld = calculateGeoGuessrScore(10_000, WORLD_DIAGONAL_METERS);
    expect(tenKmScoreOnWorld).toBeGreaterThan(4950);
    expect(tenKmScoreOnCity).toBeLessThan(50);
  });

  it('formats meters and kilometers cleanly', () => {
    expect(formatDistance(null)).toBe('—');
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1_840)).toBe('1.84 km');
    expect(formatDistance(24_500)).toBe('24.5 km');
    expect(formatDistance(1_240_500)).toBe('1,241 km');
  });

  it('computes World diagonal constant for global bounds', () => {
    const d = calculateBoundsDiagonalMeters({
      north: 72,
      south: -56,
      east: 180,
      west: -180,
    });
    expect(d).toBe(WORLD_DIAGONAL_METERS);
  });
});
