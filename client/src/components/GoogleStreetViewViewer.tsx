import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: any;
    __googleMapsLoadingPromise?: Promise<void>;
  }
}

interface GoogleStreetViewViewerProps {
  apiKey: string | null;
  googlePanoId?: string | null;
  imageId: string;
  compassAngle: number;
  allowMoving: boolean;
  allowPanning?: boolean;
  allowZooming?: boolean;
  resetSignal: number;
  onBearingChange: (bearing: number) => void;
  onMovedFromStart: (moved: boolean) => void;
}

function loadGoogleMapsScript(key: string): Promise<void> {
  if (window.google?.maps?.StreetViewPanorama) {
    return Promise.resolve();
  }
  if (window.__googleMapsLoadingPromise) {
    return window.__googleMapsLoadingPromise;
  }

  window.__googleMapsLoadingPromise = new Promise((resolve, reject) => {
    // Check if script element already exists
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script. Check your API key.'));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoadingPromise;
}

export function GoogleStreetViewViewer({
  apiKey,
  googlePanoId,
  imageId,
  compassAngle,
  allowMoving,
  allowPanning = true,
  allowZooming = true,
  resetSignal,
  onBearingChange,
  onMovedFromStart,
}: GoogleStreetViewViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<any>(null);
  const startPanoRef = useRef<string>('');
  const onBearingChangeRef = useRef(onBearingChange);
  const onMovedFromStartRef = useRef(onMovedFromStart);
  onBearingChangeRef.current = onBearingChange;
  onMovedFromStartRef.current = onMovedFromStart;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetPano = googlePanoId || imageId.replace(/^g_/, '');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!apiKey) {
      setError('Google Maps API Key is missing. Host must configure it in Lobby Settings.');
      setLoading(false);
      return;
    }

    if (!targetPano) {
      setError('No Google Street View panorama ID found.');
      setLoading(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    setError(null);
    startPanoRef.current = targetPano;
    onMovedFromStartRef.current(false);

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (disposed || !containerRef.current) return;

        el.replaceChildren();

        const panorama = new window.google.maps.StreetViewPanorama(containerRef.current, {
          pano: targetPano,
          pov: {
            heading: compassAngle,
            pitch: 0,
          },
          zoom: 1,
          addressControl: false,
          showRoadLabels: false, // Hide street names to prevent cheating
          linksControl: allowMoving,
          clickToGo: allowMoving,
          panControl: allowPanning,
          zoomControl: allowZooming,
          scrollwheel: allowZooming,
          disableDefaultUI: true,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
        });

        panoramaRef.current = panorama;

        const povListener = panorama.addListener('pov_changed', () => {
          if (disposed) return;
          const currentPov = panorama.getPov();
          if (currentPov && typeof currentPov.heading === 'number') {
            onBearingChangeRef.current(currentPov.heading);
          }
        });

        const panoListener = panorama.addListener('pano_changed', () => {
          if (disposed) return;
          const currentPano = panorama.getPano();
          if (currentPano) {
            onMovedFromStartRef.current(currentPano !== startPanoRef.current);
          }
        });

        const statusListener = panorama.addListener('status_changed', () => {
          if (disposed) return;
          const status = panorama.getStatus();
          setLoading(false);
          if (status !== 'OK') {
            setError(`Google Street View returned status: ${status}`);
          }
        });

        // Fallback to remove loader
        const timeout = setTimeout(() => {
          if (!disposed) setLoading(false);
        }, 3000);

        return () => {
          clearTimeout(timeout);
          window.google.maps.event.removeListener(povListener);
          window.google.maps.event.removeListener(panoListener);
          window.google.maps.event.removeListener(statusListener);
        };
      })
      .catch((err: unknown) => {
        if (!disposed) {
          setLoading(false);
          setError(err instanceof Error ? err.message : 'Could not load Google Street View.');
        }
      });

    return () => {
      disposed = true;
      panoramaRef.current = null;
      if (el) el.replaceChildren();
    };
  }, [apiKey, targetPano, compassAngle, allowMoving, allowPanning, allowZooming]);

  useEffect(() => {
    if (resetSignal === 0) return;
    const panorama = panoramaRef.current;
    if (!panorama || !startPanoRef.current) return;

    panorama.setPano(startPanoRef.current);
    panorama.setPov({ heading: compassAngle, pitch: 0 });
    onMovedFromStartRef.current(false);
    onBearingChangeRef.current(compassAngle);
  }, [resetSignal, compassAngle]);

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
          <div className="hud-pill">Loading Google Street View…</div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="alert alert--error"
          style={{
            position: 'absolute',
            insetBlockEnd: '5rem',
            insetInlineStart: '1rem',
            zIndex: 460,
          }}
        >
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
