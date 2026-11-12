import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Infinity as InfinityIcon,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type { RoomState } from '@shared/types';
import type { ShortenedNotice } from '../hooks/useSocket';
import {
  playGuessLockedSound,
  playTimerUrgentTick,
} from '../lib/sound';
import { MapillaryViewer } from './MapillaryViewer';
import { GuessMinimap } from './GuessMinimap';

interface GamePlayScreenProps {
  room: RoomState;
  playerId: string;
  mapillaryToken: string;
  shortenedNotice: ShortenedNotice | null;
  muted: boolean;
  onToggleMute: () => void;
  onDraftPin: (lat: number, lng: number) => void;
  onSubmitGuess: (
    lat: number,
    lng: number,
  ) => Promise<{ ok: boolean; error?: string }>;
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function GamePlayScreen({
  room,
  playerId,
  mapillaryToken,
  shortenedNotice,
  muted,
  onToggleMute,
  onDraftPin,
  onSubmitGuess,
}: GamePlayScreenProps) {
  const round = room.currentRound;
  const me = room.players.find((p) => p.id === playerId);
  const hasGuessed = Boolean(me?.hasGuessedCurrentRound);

  const [bearing, setBearing] = useState(0);
  const [movedFromStart, setMovedFromStart] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const lastDraftSentRef = useRef(0);
  const lastTickSecondRef = useRef<number | null>(null);

  const roundKey = round ? `${room.code}_${round.roundNumber}_${round.imageId}` : 'none';

  // Reset pin cleanly each round
  useEffect(() => {
    setPin(null);
    setResetSignal(0);
    setMovedFromStart(false);
    lastTickSecondRef.current = null;
  }, [roundKey]);

  // Smooth countdown timer tick
  useEffect(() => {
    if (!round?.endTimeMs) return;
    setNowMs(Date.now());
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [round?.endTimeMs]);

  const secondsRemaining =
    round?.endTimeMs != null
      ? Math.max(0, (round.endTimeMs - nowMs) / 1000)
      : null;

  // Urgent tick sound in final 5 seconds
  useEffect(() => {
    if (secondsRemaining === null || hasGuessed) return;
    const whole = Math.ceil(secondsRemaining);
    if (whole > 0 && whole <= 5 && lastTickSecondRef.current !== whole) {
      lastTickSecondRef.current = whole;
      playTimerUrgentTick(muted);
    }
  }, [secondsRemaining, hasGuessed, muted]);

  const handlePinChange = useCallback(
    (coords: { lat: number; lng: number }) => {
      setPin(coords);
      const now = Date.now();
      if (now - lastDraftSentRef.current >= 200) {
        lastDraftSentRef.current = now;
        onDraftPin(coords.lat, coords.lng);
      } else {
        // Ensure latest pin reaches server promptly
        onDraftPin(coords.lat, coords.lng);
      }
    },
    [onDraftPin],
  );

  const handleSubmit = useCallback(async () => {
    if (!pin || hasGuessed || submitting) return;
    setSubmitting(true);
    try {
      const res = await onSubmitGuess(pin.lat, pin.lng);
      if (res.ok) {
        playGuessLockedSound(muted);
      }
    } finally {
      setSubmitting(false);
    }
  }, [pin, hasGuessed, submitting, onSubmitGuess, muted]);

  // Keyboard shortcuts: Space to guess, R to return to start
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && pin && !hasGuessed) {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        void handleSubmit();
      } else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        setResetSignal((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, hasGuessed, handleSubmit]);

  if (!round) return null;

  const timerUrgent = secondsRemaining !== null && secondsRemaining <= 15;
  const timerCritical = secondsRemaining !== null && secondsRemaining <= 5;
  const showShortenedBanner =
    round.shortenedByPlayerName ||
    (shortenedNotice && Date.now() - shortenedNotice.id < 5000);

  return (
    <main className="play-viewport" aria-label="Street Explorer gameplay">
      <h1 className="visually-hidden">
        Round {round.roundNumber} of {round.totalRounds} — {round.mapName}
      </h1>

      <MapillaryViewer
        accessToken={mapillaryToken}
        imageId={round.imageId}
        allowMoving={round.allowMoving}
        resetSignal={resetSignal}
        onBearingChange={setBearing}
        onMovedFromStart={setMovedFromStart}
      />

      {/* Top HUD */}
      <div className="hud-top">
        <div className="hud-pill" aria-label="Match progress">
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {round.mapName}
            </div>
            <div style={{ fontWeight: 800 }} className="tabular-nums">
              Round {round.roundNumber} / {round.totalRounds}
            </div>
          </div>
          <div style={{ inlineSize: '1px', blockSize: '26px', background: 'var(--border-subtle)' }} />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              Score
            </div>
            <div style={{ fontWeight: 800, color: 'var(--accent-primary)' }} className="tabular-nums">
              {(me?.totalScore ?? 0).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        <div
          className={`hud-pill hud-timer tabular-nums ${
            timerCritical
              ? 'hud-timer--critical'
              : timerUrgent
                ? 'hud-timer--urgent'
                : ''
          }`}
          role="timer"
          aria-label="Time remaining"
        >
          <Clock size={18} aria-hidden="true" />
          {secondsRemaining !== null ? (
            <span>{formatClock(secondsRemaining)}</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <InfinityIcon size={20} aria-hidden="true" />
              <span style={{ fontSize: '0.85rem' }}>Unlimited</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem' }}>
          <div className="hud-players-strip" aria-label="Player guess status">
            {room.players.map((p) => (
              <span key={p.id} className="hud-player-chip">
                <span
                  style={{
                    inlineSize: '10px',
                    blockSize: '10px',
                    borderRadius: '999px',
                    background: p.color,
                  }}
                  aria-hidden="true"
                />
                <span>{p.name}</span>
                {p.hasGuessedCurrentRound ? (
                  <CheckCircle2
                    size={14}
                    style={{ color: 'var(--accent-primary)' }}
                    aria-label="guessed"
                  />
                ) : null}
              </span>
            ))}
            <button
              type="button"
              className="hud-pill btn--icon"
              style={{ padding: '0.35rem 0.5rem', minBlockSize: '32px' }}
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
            >
              {muted ? (
                <VolumeX size={16} aria-hidden="true" />
              ) : (
                <Volume2 size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {showShortenedBanner ? (
        <div className="pressure-banner" role="status">
          <Zap size={15} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
          {round.shortenedByPlayerName ?? shortenedNotice?.triggeredBy} guessed
          first! Timer shortened.
        </div>
      ) : null}

      {/* Bottom-Left Controls: Compass + Return to Start + Imagery Badge */}
      <div className="hud-bottom-left">
        <div
          className="compass-widget"
          aria-label={`Compass heading ${Math.round(bearing)} degrees`}
        >
          <div
            className="compass-ring"
            style={{ '--compass-deg': bearing } as React.CSSProperties}
          >
            <span className="compass-n">N</span>
            <span className="compass-needle" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {round.allowMoving ? (
            <button
              type="button"
              className="hud-pill"
              style={{ fontWeight: 700, fontSize: '0.82rem' }}
              disabled={!movedFromStart}
              onClick={() => setResetSignal((n) => n + 1)}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Return to Start (R)
            </button>
          ) : (
            <span className="hud-pill" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
              No-Move Mode
            </span>
          )}
          <span className="hud-pill" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {round.isPano ? '360° Panorama' : 'Flat Street Photo'}
          </span>
        </div>
      </div>

      {/* Bottom-Right Guess Minimap */}
      <GuessMinimap
        roundKey={roundKey}
        hasGuessed={hasGuessed}
        playerColor={me?.color ?? '#38bdf8'}
        pin={pin}
        onPinChange={handlePinChange}
        onSubmitGuess={() => void handleSubmit()}
      />
    </main>
  );
}
