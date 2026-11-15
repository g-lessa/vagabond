import type { ScavengerTarget } from './types.js';

export const SCAVENGER_TARGETS: ScavengerTarget[] = [
  {
    id: 'flag',
    emoji: '🚩',
    title: 'Flag / Coat of Arms',
    description: 'Find a national or regional flag, emblem, or state banner.',
    bonusPoints: 400,
  },
  {
    id: 'yellow_vehicle',
    emoji: '🚕',
    title: 'Yellow Vehicle',
    description: 'Snap a yellow taxi, bus, delivery truck, or car.',
    bonusPoints: 500,
  },
  {
    id: 'distinct_flora',
    emoji: '🌴',
    title: 'Native Flora',
    description: 'Snap local palm trees, cacti, pine forests, or crop fields.',
    bonusPoints: 350,
  },
  {
    id: 'road_sign',
    emoji: '🚸',
    title: 'Directional Road Sign',
    description: 'Snap a highway sign, town marker, or distinctive road warning.',
    bonusPoints: 300,
  },
  {
    id: 'architecture',
    emoji: '🏛️',
    title: 'Distinct Architecture',
    description: 'Snap a church, temple, unique roofline, or historical building.',
    bonusPoints: 350,
  },
  {
    id: 'two_wheeler',
    emoji: '🚲',
    title: 'Bicycle or Scooter',
    description: 'Snap a bike, moped, or motorcycle on the roadside.',
    bonusPoints: 400,
  },
  {
    id: 'water',
    emoji: '🌊',
    title: 'Body of Water',
    description: 'Snap an ocean, river, canal, lake, or coastline.',
    bonusPoints: 450,
  },
  {
    id: 'animal',
    emoji: '🐕',
    title: 'Wildlife or Pet',
    description: 'Snap a domestic animal, horse, cow, bird, or pet.',
    bonusPoints: 600,
  },
  {
    id: 'pedestrian',
    emoji: '🚶',
    title: 'Local Pedestrian',
    description: 'Snap someone walking, working, or crossing the street.',
    bonusPoints: 350,
  },
  {
    id: 'storefront',
    emoji: '🏪',
    title: 'Storefront or Market',
    description: 'Snap a local cafe, grocery store, market stall, or shop sign.',
    bonusPoints: 350,
  },
  {
    id: 'bridge_or_tunnel',
    emoji: '🌉',
    title: 'Bridge or Overpass',
    description: 'Snap a bridge, highway overpass, footbridge, or railway crossing.',
    bonusPoints: 400,
  },
  {
    id: 'clean_energy',
    emoji: '⚡',
    title: 'Clean Energy / Infrastructure',
    description: 'Snap a solar panel, wind turbine, electrical pylon, or water tower.',
    bonusPoints: 450,
  },
];

export function getRandomScavengerTarget(): ScavengerTarget {
  return SCAVENGER_TARGETS[Math.floor(Math.random() * SCAVENGER_TARGETS.length)];
}

export function getTerritoryForLocation(
  _lng: number,
  lat: number,
  countryName: string | null,
): { id: string; name: string } {
  if (countryName && countryName.trim().length > 0) {
    const clean = countryName.trim();
    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { id, name: clean };
  }

  // Fallback to continental coordinate bands
  if (lat > 50) return { id: 'northern-realm', name: 'Northern Territories' };
  if (lat > 20) return { id: 'temperate-north', name: 'North Temperate Lands' };
  if (lat > -20) return { id: 'equatorial-belt', name: 'Equatorial Frontier' };
  return { id: 'southern-reach', name: 'Southern Wilds' };
}
