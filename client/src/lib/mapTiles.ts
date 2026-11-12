export type TileStyle = 'atlas' | 'osm' | 'satellite';

export interface TileLayerConfig {
  label: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
  maxZoom: number;
}

export const MAP_TILE_LAYERS: Record<TileStyle, TileLayerConfig> = {
  atlas: {
    label: 'Atlas',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors',
    maxNativeZoom: 18,
    maxZoom: 19,
  },
  osm: {
    label: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
    maxZoom: 19,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 18,
    maxZoom: 19,
  },
};
