import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Check, Crosshair } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import type { CustomBounds } from '@shared/types';
import { calculateBoundsDiagonalMeters, formatDistance } from '@shared/scoring';
import { MAP_TILE_LAYERS } from '../lib/mapTiles';

interface CustomAreaPickerDialogProps {
  open: boolean;
  onClose: () => void;
  initialBounds?: CustomBounds;
  onApply: (bounds: CustomBounds) => void;
}

const DEFAULT_CUSTOM: CustomBounds = {
  north: 48.92,
  south: 48.8,
  east: 2.45,
  west: 2.24,
};

export function CustomAreaPickerDialog({
  open,
  onClose,
  initialBounds,
  onApply,
}: CustomAreaPickerDialogProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const [bounds, setBounds] = useState<CustomBounds>(
    initialBounds ?? DEFAULT_CUSTOM,
  );

  useEffect(() => {
    if (!open || !mapElRef.current) return;

    const startBounds = initialBounds ?? DEFAULT_CUSTOM;
    setBounds(startBounds);

    const map = L.map(mapElRef.current, {
      worldCopyJump: true,
    });
    mapRef.current = map;

    const baseLayer = MAP_TILE_LAYERS.atlas;
    L.tileLayer(baseLayer.url, {
      attribution: baseLayer.attribution,
      maxNativeZoom: baseLayer.maxNativeZoom,
      maxZoom: baseLayer.maxZoom,
    }).addTo(map);

    map.fitBounds([
      [startBounds.south, startBounds.west],
      [startBounds.north, startBounds.east],
    ]);

    const rect = L.rectangle(
      [
        [startBounds.south, startBounds.west],
        [startBounds.north, startBounds.east],
      ],
      {
        color: '#10b981',
        weight: 2,
        fillOpacity: 0.16,
      },
    ).addTo(map);
    rectRef.current = rect;

    const syncFromViewport = () => {
      const b = map.getBounds();
      // Inset slightly (10%) from viewport edges so the playable box is visibly framed
      const latPad = (b.getNorth() - b.getSouth()) * 0.1;
      const lngPad = (b.getEast() - b.getWest()) * 0.1;
      const next: CustomBounds = {
        north: Number((b.getNorth() - latPad).toFixed(4)),
        south: Number((b.getSouth() + latPad).toFixed(4)),
        east: Number((b.getEast() - lngPad).toFixed(4)),
        west: Number((b.getWest() + lngPad).toFixed(4)),
      };
      setBounds(next);
      rect.setBounds([
        [next.south, next.west],
        [next.north, next.east],
      ]);
    };

    map.on('moveend', syncFromViewport);
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
      syncFromViewport();
    }, 80);

    return () => {
      clearTimeout(resizeTimer);
      map.off('moveend', syncFromViewport);
      map.remove();
      mapRef.current = null;
      rectRef.current = null;
    };
  }, [open, initialBounds]);

  const diag = calculateBoundsDiagonalMeters(bounds);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Pick Custom Play Area"
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onApply(bounds);
              onClose();
            }}
          >
            <Check size={16} aria-hidden="true" />
            Use Highlighted Area
          </button>
        </>
      }
    >
      <p className="field-hint">
        <Crosshair size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
        Pan and zoom the map to frame any city, island, or region inside the green rectangle.
        Diagonal scale: <strong>{formatDistance(diag)}</strong>
      </p>
      <div
        ref={mapElRef}
        style={{
          inlineSize: '100%',
          blockSize: '360px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}
      />
    </ModalDialog>
  );
}
