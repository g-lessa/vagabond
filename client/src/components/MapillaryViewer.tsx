import { useEffect, useRef, useState } from 'react';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';

interface MapillaryViewerProps {
  accessToken: string;
  imageId: string;
  allowMoving: boolean;
  allowPanning?: boolean;
  allowZooming?: boolean;
  resetSignal: number;
  onBearingChange: (bearing: number) => void;
  onMovedFromStart: (moved: boolean) => void;
}

export function MapillaryViewer({
  accessToken,
  imageId,
  allowMoving,
  allowPanning = true,
  allowZooming = true,
  resetSignal,
  onBearingChange,
  onMovedFromStart,
}: MapillaryViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const startIdRef = useRef<string>(imageId);
  const onBearingChangeRef = useRef(onBearingChange);
  const onMovedFromStartRef = useRef(onMovedFromStart);
  onBearingChangeRef.current = onBearingChange;
  onMovedFromStartRef.current = onMovedFromStart;
  const [loading, setLoading] = useState(true);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !accessToken || !imageId) return;

    let disposed = false;
    el.replaceChildren();
    setLoading(true);
    setViewerError(null);
    startIdRef.current = imageId;
    onMovedFromStartRef.current(false);

    const viewer = new Viewer({
      accessToken,
      container: el,
      imageId,
      component: {
        cover: false,
        bearing: false,
        sequence: false,
        spatial: false,
        popup: false,
        attribution: true,
        direction: allowMoving,
        zoom: allowZooming,
        keyboard: {
          keyPlay: false,
          keySequenceNavigation: allowMoving,
          keySpatialNavigation: allowMoving,
        },
      },
    });
    viewerRef.current = viewer;

    const handleBearing = (ev: { bearing: number }) => {
      if (!disposed) onBearingChangeRef.current(ev.bearing);
    };
    const handleImage = (ev: { image: { id: string } }) => {
      if (disposed) return;
      setLoading(false);
      onMovedFromStartRef.current(ev.image.id !== startIdRef.current);
      void viewer
        .getBearing()
        .then((b) => {
          if (!disposed) onBearingChangeRef.current(b);
        })
        .catch(() => {});
    };
    const handleLoad = () => {
      if (!disposed) setLoading(false);
    };

    viewer.on('bearing', handleBearing);
    viewer.on('image', handleImage);
    viewer.on('load', handleLoad);

    const resizeObserver = new ResizeObserver(() => {
      viewer.resize();
    });
    resizeObserver.observe(el);

    const loadFallback = setTimeout(() => {
      if (!disposed) setLoading(false);
    }, 4500);

    return () => {
      disposed = true;
      clearTimeout(loadFallback);
      resizeObserver.disconnect();
      viewer.off('bearing', handleBearing);
      viewer.off('image', handleImage);
      viewer.remove();
      viewerRef.current = null;
      el.replaceChildren();
    };
    // Re-init cleanly when token, round start imageId, or interaction rules change
  }, [accessToken, imageId, allowMoving, allowPanning, allowZooming]);

  useEffect(() => {
    if (resetSignal === 0) return;
    const viewer = viewerRef.current;
    if (!viewer || !startIdRef.current) return;
    viewer
      .moveTo(startIdRef.current)
      .then(() => {
        onMovedFromStartRef.current(false);
      })
      .catch(() => {
        setViewerError('Could not return to start image.');
      });
  }, [resetSignal]);

  return (
    <div
      style={{ position: 'relative', inlineSize: '100%', blockSize: '100%' }}
      onWheel={!allowZooming ? (e) => e.stopPropagation() : undefined}
    >
      <div ref={containerRef} className="panorama-host" />
      {!allowPanning ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 410,
            cursor: 'not-allowed',
            background: 'transparent',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Camera angle locked (No-Pan mode)"
        />
      ) : null}
      {loading ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(2, 6, 23, 0.55)',
            pointerEvents: 'none',
            zIndex: 420,
          }}
        >
          <div className="hud-pill">Loading Street Imagery…</div>
        </div>
      ) : null}
      {viewerError ? (
        <div
          role="alert"
          className="alert alert--error"
          style={{ position: 'absolute', insetBlockEnd: '5rem', insetInlineStart: '1rem', zIndex: 460 }}
        >
          <span>{viewerError}</span>
        </div>
      ) : null}
    </div>
  );
}
