export type TileStyle = 'atlas' | 'osm' | 'satellite' | 'topo' | 'dark' | 'clean';

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
  topo: {
    label: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    maxNativeZoom: 17,
    maxZoom: 18,
  },
  dark: {
    label: 'Dark Matter',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; HERE, Garmin, OpenStreetMap contributors',
    maxNativeZoom: 16,
    maxZoom: 18,
  },
  clean: {
    label: 'No Labels',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 13,
    maxZoom: 16,
  },
};
