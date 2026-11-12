import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RoundResult } from '@shared/types';
import { formatDistance } from '@shared/scoring';
import { MAP_TILE_LAYERS } from '../lib/mapTiles';

interface ResultsMapProps {
  rounds: RoundResult[];
  highlightedPlayerId?: string | null;
}

function buildTextBadge(text: string, bg: string, fg: string): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '28px';
  el.style.height = '28px';
  el.style.borderRadius = '999px';
  el.style.background = bg;
  el.style.color = fg;
  el.style.border = '3px solid #ffffff';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
  el.style.display = 'grid';
  el.style.placeItems = 'center';
  el.style.fontWeight = '800';
  el.style.fontSize = '10px';
  el.textContent = text;
  return el;
}

function buildPopupNode(lines: string[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.fontFamily = 'inherit';
  wrap.style.fontSize = '13px';
  lines.forEach((line, idx) => {
    const row = document.createElement('div');
    if (idx === 0) row.style.fontWeight = '700';
    row.textContent = line;
    wrap.appendChild(row);
  });
  return wrap;
}

export function ResultsMap({
  rounds,
  highlightedPlayerId = null,
}: ResultsMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = mapElRef.current;
    if (!el) return;

    const map = L.map(el, {
      worldCopyJump: true,
    });
    mapRef.current = map;

    const baseLayer = MAP_TILE_LAYERS.atlas;
    L.tileLayer(baseLayer.url, {
      attribution: baseLayer.attribution,
      maxNativeZoom: baseLayer.maxNativeZoom,
      maxZoom: baseLayer.maxZoom,
    }).addTo(map);

    layersRef.current = L.layerGroup().addTo(map);

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsCoords: Array<[number, number]> = [];

    for (const round of rounds) {
      const actualLatLng: [number, number] = [
        round.actual.lat,
        round.actual.lng,
      ];
      boundsCoords.push(actualLatLng);

      const flagEl = buildTextBadge(
        rounds.length > 1 ? `R${round.roundNumber}` : '★',
        '#fbbf24',
        '#1c1917',
      );
      const actualIcon = L.divIcon({
        className: 'vagabond-actual-pin',
        html: flagEl.outerHTML,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(actualLatLng, { icon: actualIcon, zIndexOffset: 500 })
        .bindPopup(
          buildPopupNode([
            `Round ${round.roundNumber} Actual Location`,
            round.actual.countryName ?? 'Unknown region',
            `${round.actual.lat.toFixed(4)}, ${round.actual.lng.toFixed(4)}`,
          ]),
        )
        .addTo(group);

      for (const guess of round.guesses) {
        if (guess.lat === null || guess.lng === null) continue;
        const guessLatLng: [number, number] = [guess.lat, guess.lng];
        boundsCoords.push(guessLatLng);

        const isHighlighted = highlightedPlayerId === guess.playerId;

        L.polyline([guessLatLng, actualLatLng], {
          color: guess.playerColor,
          weight: isHighlighted ? 4 : 2.5,
          opacity: highlightedPlayerId && !isHighlighted ? 0.35 : 0.9,
          dashArray: '6 6',
        }).addTo(group);

        const badge = buildTextBadge(
          guess.playerName.slice(0, 2).toUpperCase(),
          guess.playerColor,
          '#090e1a',
        );
        const guessIcon = L.divIcon({
          className: 'vagabond-player-pin',
          html: badge.outerHTML,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker(guessLatLng, {
          icon: guessIcon,
          opacity: highlightedPlayerId && !isHighlighted ? 0.5 : 1,
          zIndexOffset: isHighlighted ? 400 : 100,
        }).bindPopup(
          buildPopupNode([
            `${guess.playerName} (Round ${round.roundNumber})`,
            `Distance: ${formatDistance(guess.distanceMeters)}`,
            `Score: +${guess.score.toLocaleString('en-US')}`,
          ]),
        );

        marker.addTo(group);
        if (isHighlighted && rounds.length === 1) {
          marker.openPopup();
        }
      }
    }

    if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], 6);
    } else if (boundsCoords.length > 1) {
      map.fitBounds(boundsCoords, { padding: [46, 46], maxZoom: 15 });
    } else {
      map.setView([20, 0], 2);
    }
  }, [rounds, highlightedPlayerId]);

  return (
    <div
      ref={mapElRef}
      style={{ inlineSize: '100%', blockSize: '100%' }}
      aria-label="Round results map showing actual location and player guesses"
    />
  );
}
