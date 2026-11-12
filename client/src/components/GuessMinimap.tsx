import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CheckCircle2, Layers, Map as MapIcon, Maximize2, Minimize2, Send } from 'lucide-react';
import { MAP_TILE_LAYERS, type TileStyle } from '../lib/mapTiles';

type MapSize = 'sm' | 'md' | 'lg';

interface GuessMinimapProps {
  roundKey: string;
  hasGuessed: boolean;
  playerColor: string;
  pin: { lat: number; lng: number } | null;
  onPinChange: (coords: { lat: number; lng: number }) => void;
  onSubmitGuess: () => void;
}

export function GuessMinimap({
  roundKey,
  hasGuessed,
  playerColor,
  pin,
  onPinChange,
  onSubmitGuess,
}: GuessMinimapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const hasGuessedRef = useRef(hasGuessed);

  onPinChangeRef.current = onPinChange;
  hasGuessedRef.current = hasGuessed;

  const [mapSize, setMapSize] = useState<MapSize>('sm');
  const [tileStyle, setTileStyle] = useState<TileStyle>('atlas');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Initialize Leaflet minimap once per roundKey
  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [20, 0],
      zoom: 2,
      minZoom: 1,
      worldCopyJump: true,
      attributionControl: false,
      zoomControl: true,
    });
    mapRef.current = map;

    const initialLayer = MAP_TILE_LAYERS.atlas;
    tileRef.current = L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxNativeZoom: initialLayer.maxNativeZoom,
      maxZoom: initialLayer.maxZoom,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (hasGuessedRef.current) return;
      const wrapped = e.latlng.wrap();
      onPinChangeRef.current({ lat: wrapped.lat, lng: wrapped.lng });
    });

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markerRef.current = null;
    };
  }, [roundKey]);

  // Swap tile style seamlessly
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
    }
    const cfg = MAP_TILE_LAYERS[tileStyle];
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxNativeZoom: cfg.maxNativeZoom,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
  }, [tileStyle]);

  // Sync pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }

    const icon = L.divIcon({
      className: 'vagabond-guess-pin',
      html: `<div style="width:22px;height:22px;border-radius:999px;background:${playerColor};border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.6);"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([pin.lat, pin.lng]);
    } else {
      markerRef.current = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
    }
  }, [pin, playerColor]);

  function cycleTileStyle() {
    setTileStyle((prev) =>
      prev === 'atlas' ? 'osm' : prev === 'osm' ? 'satellite' : 'atlas',
    );
  }

  return (
    <div
      className="minimap-dock"
      data-size={mapSize}
      data-mobile-open={String(mobileOpen)}
    >
      <button
        type="button"
        className="btn btn--primary minimap-mobile-toggle"
        onClick={() => setMobileOpen((v) => !v)}
      >
        <MapIcon size={16} aria-hidden="true" />
        {mobileOpen ? 'Hide Guess Map' : pin ? 'Open Map (Pin Placed)' : 'Open Guess Map'}
      </button>

      <div className="minimap-card">
        <div className="minimap-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: '0.2rem 0.45rem', minBlockSize: '28px', fontSize: '0.75rem' }}
              onClick={cycleTileStyle}
              aria-label={`Switch map style (current: ${MAP_TILE_LAYERS[tileStyle].label})`}
            >
              <Layers size={13} aria-hidden="true" />
              {MAP_TILE_LAYERS[tileStyle].label}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {(['sm', 'md', 'lg'] as MapSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                className="pill-btn"
                style={{
                  padding: '0.15rem 0.45rem',
                  minBlockSize: '26px',
                  minInlineSize: '28px',
                  fontSize: '0.72rem',
                }}
                aria-pressed={mapSize === sz}
                aria-label={`Minimap size ${sz.toUpperCase()}`}
                onClick={() => setMapSize(sz)}
              >
                {sz.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: '0.15rem 0.35rem', minBlockSize: '26px', minInlineSize: '26px' }}
              aria-label={mapSize === 'lg' ? 'Shrink minimap' : 'Maximize minimap'}
              onClick={() => setMapSize((s) => (s === 'lg' ? 'sm' : 'lg'))}
            >
              {mapSize === 'lg' ? (
                <Minimize2 size={13} aria-hidden="true" />
              ) : (
                <Maximize2 size={13} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div
          ref={mapElRef}
          className="minimap-canvas"
          aria-label="Guessing map — click anywhere to place your pin"
        />
      </div>

      {hasGuessed ? (
        <div
          className="hud-pill"
          role="status"
          style={{
            justifyContent: 'center',
            borderColor: 'rgba(16, 185, 129, 0.7)',
            color: '#34d399',
            fontWeight: 700,
          }}
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          Guess Locked! Waiting for others…
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          disabled={!pin}
          onClick={onSubmitGuess}
          style={{
            minBlockSize: '46px',
            fontSize: '1rem',
            letterSpacing: '0.03em',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          }}
        >
          <Send size={17} aria-hidden="true" />
          {pin ? 'GUESS (Space)' : 'Click Map to Place Pin'}
        </button>
      )}
    </div>
  );
}
