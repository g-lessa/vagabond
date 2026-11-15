import type { ImageryProvider } from '@shared/types';
import { MapillaryViewer } from './MapillaryViewer';
import { KartaViewViewer } from './KartaViewViewer';
import { GoogleStreetViewViewer } from './GoogleStreetViewViewer';

interface StreetViewerProps {
  imageryProvider?: ImageryProvider;
  mapillaryToken: string;
  googleApiKey?: string | null;
  imageId: string;
  photoUrl?: string | null;
  googlePanoId?: string | null;
  isPano: boolean;
  compassAngle: number;
  allowMoving: boolean;
  allowPanning?: boolean;
  allowZooming?: boolean;
  resetSignal: number;
  onBearingChange: (bearing: number) => void;
  onMovedFromStart: (moved: boolean) => void;
}

export function StreetViewer({
  imageryProvider = 'mapillary',
  mapillaryToken,
  googleApiKey,
  imageId,
  photoUrl,
  googlePanoId,
  isPano,
  compassAngle,
  allowMoving,
  allowPanning = true,
  allowZooming = true,
  resetSignal,
  onBearingChange,
  onMovedFromStart,
}: StreetViewerProps) {
  if (imageryProvider === 'kartaview') {
    return (
      <KartaViewViewer
        photoUrl={photoUrl ?? null}
        isPano={isPano}
        compassAngle={compassAngle}
        allowMoving={allowMoving}
        allowPanning={allowPanning}
        allowZooming={allowZooming}
        resetSignal={resetSignal}
        onBearingChange={onBearingChange}
        onMovedFromStart={onMovedFromStart}
      />
    );
  }

  if (imageryProvider === 'google') {
    return (
      <GoogleStreetViewViewer
        apiKey={googleApiKey ?? null}
        googlePanoId={googlePanoId}
        imageId={imageId}
        compassAngle={compassAngle}
        allowMoving={allowMoving}
        allowPanning={allowPanning}
        allowZooming={allowZooming}
        resetSignal={resetSignal}
        onBearingChange={onBearingChange}
        onMovedFromStart={onMovedFromStart}
      />
    );
  }

  return (
    <MapillaryViewer
      accessToken={mapillaryToken}
      imageId={imageId}
      allowMoving={allowMoving}
      allowPanning={allowPanning}
      allowZooming={allowZooming}
      resetSignal={resetSignal}
      onBearingChange={onBearingChange}
      onMovedFromStart={onMovedFromStart}
    />
  );
}
