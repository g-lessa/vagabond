import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  Heart,
  Infinity as InfinityIcon,
  LogOut,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  AckResult,
  CustomBounds,
  FloatingEmoji,
  PowerUpId,
  RoomState,
} from '@shared/types';
import type { ShortenedNotice } from '../hooks/useSocket';
import {
  playCameraShutterSound,
  playEmojiPopSound,
  playGuessLockedSound,
  playMudSplatSound,
  playPowerUpSound,
  playTimerUrgentTick,
} from '../lib/sound';
import { StreetViewer } from './StreetViewer';
import { GuessMinimap } from './GuessMinimap';
import { ModalDialog } from './ModalDialog';

interface GamePlayScreenProps {
  room: RoomState;
  playerId: string;
  mapillaryToken: string;
  shortenedNotice: ShortenedNotice | null;
  floatingEmojis: FloatingEmoji[];
  sabotagedUntil: number | null;
  sabotageBy: string | null;
  powerUpNotice: { id: number; message: string } | null;
  muted: boolean;
  onToggleMute: () => void;
  onSendEmoji: (emoji: string) => void;
  onUsePowerUp: (
    powerUpId: PowerUpId,
    targetPlayerId?: string,
  ) => Promise<
    AckResult<{
      clue?: string;
      opponentPins?: Array<{
        lat: number;
        lng: number;
        color: string;
        name: string;
      }>;
      radarBox?: CustomBounds;
    }>
  >;
  onDraftPin: (lat: number, lng: number) => void;
  onSubmitGuess: (
    lat: number,
    lng: number,
  ) => Promise<{ ok: boolean; error?: string }>;
  onSubmitSnap?: (
    dataUrl: string,
  ) => Promise<{ ok: boolean; error?: string; bonusPoints?: number; bonusHp?: number }>;
  onReturnToLobby?: () => Promise<{ ok: boolean; error?: string }>;
}

const EMOJI_OPTIONS = ['😱', '📍', '🤡', '🚀', '💀', '🎉', '🔥', '❤️'];

function captureSnapshot(targetTitle: string, compassAngle: number, countryName?: string): string {
  try {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    let bestCanvas: HTMLCanvasElement | null = null;
    let maxArea = 0;
    for (const c of canvases) {
      const area = c.width * c.height;
      if (area > maxArea && !c.classList.contains('leaflet-tile')) {
        maxArea = area;
        bestCanvas = c;
      }
    }

    if (bestCanvas && maxArea > 1000) {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 640;
      exportCanvas.height = 480;
      const ctx = exportCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bestCanvas, 0, 0, 640, 480);
        const grad = ctx.createRadialGradient(320, 240, 160, 320, 240, 380);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`VAGABOND SNAP • ${new Date().toISOString().slice(0, 10)}`, 16, 460);
        return exportCanvas.toDataURL('image/jpeg', 0.85);
      }
    }
  } catch (err) {
    console.warn('Canvas capture fallback:', err);
  }

  const fallback = document.createElement('canvas');
  fallback.width = 640;
  fallback.height = 480;
  const ctx = fallback.getContext('2d');
  if (ctx) {
    const bgGrad = ctx.createLinearGradient(0, 0, 640, 480);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#1e293b');
    bgGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 640, 480);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`📸 ${targetTitle}`, 36, 180);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '18px sans-serif';
    ctx.fillText(countryName ? `Explored in ${countryName}` : 'Scavenger Snapshot Captured', 36, 220);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(`Heading: ${Math.round(compassAngle)}° | Verified by Vagabond`, 36, 260);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`VAGABOND POLAROID • ${new Date().toLocaleTimeString()}`, 36, 440);

    return fallback.toDataURL('image/jpeg', 0.85);
  }
  return '';
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
  floatingEmojis,
  sabotagedUntil,
  sabotageBy,
  powerUpNotice,
  muted,
  onToggleMute,
  onSendEmoji,
  onUsePowerUp,
  onDraftPin,
  onSubmitGuess,
  onSubmitSnap,
  onReturnToLobby,
}: GamePlayScreenProps) {
  const round = room.currentRound;
  const me = room.players.find((p) => p.id === playerId);
  const isEliminated = Boolean(me?.isEliminated);
  const hasGuessed = Boolean(me?.hasGuessedCurrentRound) || isEliminated;
  const isBattleRoyale = round?.gameMode === 'battle_royale';
  const isConquest = round?.gameMode === 'conquest';

  const [confirmTerminateOpen, setConfirmTerminateOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);

  const [bearing, setBearing] = useState(0);
  const [movedFromStart, setMovedFromStart] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [radarBox, setRadarBox] = useState<CustomBounds | null>(null);
  const [opponentPins, setOpponentPins] = useState<
    Array<{ lat: number; lng: number; color: string; name: string }>
  >([]);
  const [activeClue, setActiveClue] = useState<string | null>(null);
  const [powerUpUsing, setPowerUpUsing] = useState<string | null>(null);

  const [flashActive, setFlashActive] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const [snapFeedback, setSnapFeedback] = useState<string | null>(null);

  const lastDraftSentRef = useRef(0);
  const lastTickSecondRef = useRef<number | null>(null);
  const lastEmojiCountRef = useRef(floatingEmojis.length);

  const roundKey = round
    ? `${room.code}_${round.roundNumber}_${round.imageId}`
    : 'none';

  // Sound on new floating emoji
  useEffect(() => {
    if (floatingEmojis.length > lastEmojiCountRef.current) {
      playEmojiPopSound(muted);
    }
    lastEmojiCountRef.current = floatingEmojis.length;
  }, [floatingEmojis.length, muted]);

  // Sound on mud splatter
  useEffect(() => {
    if (sabotagedUntil && Date.now() < sabotagedUntil) {
      playMudSplatSound(muted);
    }
  }, [sabotagedUntil, muted]);

  // Reset round-specific power-up and snap state
  useEffect(() => {
    setPin(null);
    setResetSignal(0);
    setMovedFromStart(false);
    setRadarBox(null);
    setOpponentPins([]);
    setActiveClue(null);
    lastTickSecondRef.current = null;
    setSnapped(false);
    setSnapFeedback(null);
    setFlashActive(false);
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
      if (isEliminated) return;
      setPin(coords);
      const now = Date.now();
      if (now - lastDraftSentRef.current >= 200) {
        lastDraftSentRef.current = now;
        onDraftPin(coords.lat, coords.lng);
      } else {
        onDraftPin(coords.lat, coords.lng);
      }
    },
    [onDraftPin, isEliminated],
  );

  const handleSubmit = useCallback(async () => {
    if (!pin || hasGuessed || submitting || isEliminated) return;
    setSubmitting(true);
    try {
      const res = await onSubmitGuess(pin.lat, pin.lng);
      if (res.ok) {
        playGuessLockedSound(muted);
      }
    } finally {
      setSubmitting(false);
    }
  }, [pin, hasGuessed, submitting, isEliminated, onSubmitGuess, muted]);

  const handleSnap = useCallback(async () => {
    if (snapped || !round?.scavengerTarget || isEliminated) return;
    playCameraShutterSound(muted);
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 450);

    const dataUrl = captureSnapshot(
      round.scavengerTarget.title,
      bearing,
      round.mapName,
    );

    setSnapped(true);
    setSnapFeedback(`📸 Captured ${round.scavengerTarget.title}!`);
    setTimeout(() => setSnapFeedback(null), 4000);

    if (onSubmitSnap && dataUrl) {
      await onSubmitSnap(dataUrl);
    }
  }, [snapped, round?.scavengerTarget, round?.mapName, isEliminated, bearing, muted, onSubmitSnap]);

  // Handle Power-Up usage
  const handleTriggerPowerUp = async (id: PowerUpId) => {
    if (powerUpUsing || !me || (me.powerUps[id] ?? 0) <= 0) return;
    setPowerUpUsing(id);
    try {
      const res = await onUsePowerUp(id);
      if (res.ok && res.data) {
        if (id === 'mud') {
          playMudSplatSound(muted);
        } else {
          playPowerUpSound(muted);
        }
        if (res.data.radarBox) {
          setRadarBox(res.data.radarBox);
        }
        if (res.data.clue) {
          setActiveClue(res.data.clue);
        }
        if (res.data.opponentPins) {
          setOpponentPins(res.data.opponentPins);
          setTimeout(() => setOpponentPins([]), 4500);
        }
      }
    } finally {
      setPowerUpUsing(null);
    }
  };

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
      } else if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        void handleSnap();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, hasGuessed, handleSubmit, handleSnap]);

  if (!round) return null;

  const timerUrgent = secondsRemaining !== null && secondsRemaining <= 15;
  const timerCritical = secondsRemaining !== null && secondsRemaining <= 5;
  const showShortenedBanner =
    round.shortenedByPlayerName ||
    (shortenedNotice && Date.now() - shortenedNotice.id < 5000);

  const isSabotaged = Boolean(sabotagedUntil && Date.now() < sabotagedUntil);
  const sabotageSecondsLeft = sabotagedUntil
    ? Math.max(1, Math.ceil((sabotagedUntil - Date.now()) / 1000))
    : 0;

  const myHp = me?.hp ?? 10000;
  const myMaxHp = me?.maxHp ?? 10000;
  const hpPercent = Math.max(0, Math.min(100, Math.round((myHp / myMaxHp) * 100)));

  return (
    <main className="play-viewport" aria-label="Street Explorer gameplay">
      {flashActive ? <div className="camera-flash-overlay" aria-hidden="true" /> : null}

      <h1 className="visually-hidden">
        Round {round.roundNumber} of {round.totalRounds} — {round.mapName}
      </h1>

      <StreetViewer
        imageryProvider={round.imageryProvider}
        mapillaryToken={mapillaryToken}
        googleApiKey={round.googleApiKey}
        imageId={round.imageId}
        photoUrl={round.photoUrl}
        googlePanoId={round.googlePanoId}
        isPano={round.isPano}
        compassAngle={round.compassAngle}
        allowMoving={round.allowMoving}
        allowPanning={round.allowPanning}
        allowZooming={round.allowZooming}
        resetSignal={resetSignal}
        onBearingChange={setBearing}
        onMovedFromStart={setMovedFromStart}
      />

      {/* Sabotage / Mud Splatter Overlay */}
      {isSabotaged ? (
        <div className="sabotage-mud-overlay" role="alert">
          <div className="sabotage-mud-content">
            <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>💨</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f59e0b' }}>
              MUD SPLAT!
            </div>
            <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
              {sabotageBy ? `${sabotageBy} splashed your camera!` : 'Your camera was hit with mud!'}
            </div>
            <div className="badge badge--warning" style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
              Clearing in {sabotageSecondsLeft}s…
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Emojis Stage */}
      <div className="floating-emojis-container" aria-hidden="true">
        {floatingEmojis.map((e) => (
          <div key={e.id} className="floating-emoji-item">
            <span
              className="floating-emoji-name"
              style={{ background: e.playerColor }}
            >
              {e.playerName}
            </span>
            <span className="floating-emoji-icon">{e.emoji}</span>
          </div>
        ))}
      </div>

      {/* Top HUD */}
      <div className="hud-top">
        <div className="hud-pill" aria-label="Match progress">
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {round.mapName}
            </div>
            <div style={{ fontWeight: 800 }} className="tabular-nums">
              Round {round.roundNumber} / {round.totalRounds}
            </div>
          </div>

          <div
            style={{
              inlineSize: '1px',
              blockSize: '26px',
              background: 'var(--border-subtle)',
            }}
          />

          {isBattleRoyale ? (
            <div style={{ minWidth: '130px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Heart size={12} style={{ color: '#ef4444' }} /> HP
                </span>
                <span className="tabular-nums" style={{ color: hpPercent < 30 ? '#ef4444' : '#10b981' }}>
                  {myHp.toLocaleString()} / {myMaxHp.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  marginTop: '0.2rem',
                }}
              >
                <div
                  style={{
                    width: `${hpPercent}%`,
                    height: '100%',
                    background:
                      hpPercent > 50
                        ? '#10b981'
                        : hpPercent > 25
                          ? '#f59e0b'
                          : '#ef4444',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ) : isConquest ? (
            <div style={{ minWidth: '130px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  🏰 Territories
                </span>
                <span className="tabular-nums" style={{ color: '#d8b4fe' }}>
                  {me?.territoriesCount ?? 0} / {room.settings.targetTerritories ?? 5}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  marginTop: '0.2rem',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(((me?.territoriesCount ?? 0) / (room.settings.targetTerritories ?? 5)) * 100))}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontWeight: 700,
                }}
              >
                Score
              </div>
              <div
                style={{ fontWeight: 800, color: 'var(--accent-primary)' }}
                className="tabular-nums"
              >
                {(me?.totalScore ?? 0).toLocaleString('en-US')}
              </div>
            </div>
          )}
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
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <InfinityIcon size={20} aria-hidden="true" />
              <span style={{ fontSize: '0.85rem' }}>Unlimited</span>
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.45rem',
          }}
        >
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
                {isBattleRoyale ? (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: p.isEliminated ? '#ef4444' : '#10b981',
                    }}
                  >
                    {p.isEliminated ? '💀' : `${p.hp}`}
                  </span>
                ) : isConquest ? (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: '#d8b4fe',
                    }}
                  >
                    🏰 {p.territoriesCount ?? 0}
                  </span>
                ) : null}
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

            {me?.isHost ? (
              <button
                type="button"
                className="hud-pill"
                style={{
                  padding: '0.35rem 0.65rem',
                  minBlockSize: '32px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  borderColor: 'rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
                onClick={() => setConfirmTerminateOpen(true)}
                title="End match and return everyone to lobby"
              >
                <LogOut size={13} aria-hidden="true" />
                End Match
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Global Alerts / Banners */}
      {isEliminated ? (
        <div className="spectator-banner" role="status">
          <ShieldAlert size={16} aria-hidden="true" />
          <span>You have been eliminated! Spectator Mode is active.</span>
        </div>
      ) : showShortenedBanner ? (
        <div className="pressure-banner" role="status">
          <Zap
            size={15}
            style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }}
            aria-hidden="true"
          />
          {round.shortenedByPlayerName ?? shortenedNotice?.triggeredBy} guessed
          first! Timer shortened.
        </div>
      ) : null}

      {powerUpNotice ? (
        <div className="powerup-announcement" role="status">
          <Sparkles size={16} aria-hidden="true" />
          <span>{powerUpNotice.message}</span>
        </div>
      ) : null}

      {snapFeedback ? (
        <div
          className="powerup-announcement"
          role="status"
          style={{ borderColor: 'rgba(245, 158, 11, 0.6)', color: '#fbbf24' }}
        >
          <Camera size={16} aria-hidden="true" />
          <span>{snapFeedback}</span>
        </div>
      ) : null}

      {activeClue ? (
        <div className="clue-popup" role="status">
          <span style={{ fontWeight: 800 }}>🧭 INTEL:</span> {activeClue}
        </div>
      ) : null}

      {/* Live Reactions Dock (Bottom Center) */}
      <div className="reactions-dock" role="toolbar" aria-label="Live emoji reactions">
        {EMOJI_OPTIONS.map((em) => (
          <button
            key={em}
            type="button"
            className="btn-reaction"
            onClick={() => onSendEmoji(em)}
            aria-label={`Send ${em} reaction`}
          >
            {em}
          </button>
        ))}
      </div>

      {/* Bottom-Left Controls: Compass + Return to Start + Modifiers */}
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

        {/* Photo Scavenger Hunt Objective & Shutter Button */}
        {round.scavengerTarget ? (
          <div
            style={{
              display: 'flex',
              gap: '0.45rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              className="scavenger-hud-pill"
              title={round.scavengerTarget.description}
            >
              <span>{round.scavengerTarget.emoji}</span>
              <span>
                <strong>Objective:</strong> {round.scavengerTarget.title}
              </span>
              <span style={{ fontSize: '0.72rem', color: '#fde68a' }}>
                (+{round.scavengerTarget.bonusPoints} pts)
              </span>
            </div>

            <button
              type="button"
              className="btn-snap-camera"
              onClick={() => void handleSnap()}
              disabled={snapped || isEliminated}
              title={
                snapped
                  ? 'Photo captured for this round!'
                  : `Capture photo of ${round.scavengerTarget.title} (Key: C)`
              }
            >
              <Camera size={14} aria-hidden="true" />
              <span>{snapped ? '✓ Photo Snapped' : 'Snap Photo (C)'}</span>
            </button>
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: '0.45rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
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
            <span
              className="hud-pill badge--warning"
              style={{ fontSize: '0.78rem', fontWeight: 800 }}
            >
              🔒 No Move
            </span>
          )}

          {!round.allowPanning ? (
            <span
              className="hud-pill badge--warning"
              style={{ fontSize: '0.78rem', fontWeight: 800 }}
            >
              🔒 No Pan
            </span>
          ) : null}

          {!round.allowZooming ? (
            <span
              className="hud-pill badge--warning"
              style={{ fontSize: '0.78rem', fontWeight: 800 }}
            >
              🔒 No Zoom
            </span>
          ) : null}

          <span
            className="hud-pill"
            style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}
          >
            {round.isPano ? '360° Panorama' : 'Flat Street Photo'}
          </span>
        </div>

        {/* Power-Ups Action Tray (Party Mode) */}
        {round.enablePowerUps && !isEliminated ? (
          <div className="powerups-tray" role="group" aria-label="Available Power-Ups">
            <button
              type="button"
              className="btn-powerup"
              disabled={Boolean(powerUpUsing) || (me?.powerUps.radar ?? 0) <= 0}
              onClick={() => void handleTriggerPowerUp('radar')}
              title="50/50 Radar: Shades down half the world map"
            >
              <span>🥽 Radar</span>
              <span className="badge-count">{me?.powerUps.radar ?? 0}</span>
            </button>

            <button
              type="button"
              className="btn-powerup"
              disabled={Boolean(powerUpUsing) || (me?.powerUps.hemisphere ?? 0) <= 0}
              onClick={() => void handleTriggerPowerUp('hemisphere')}
              title="Hemisphere Clue: Reveals north/south & east/west location intel"
            >
              <span>🧭 Clue</span>
              <span className="badge-count">{me?.powerUps.hemisphere ?? 0}</span>
            </button>

            <button
              type="button"
              className="btn-powerup"
              disabled={Boolean(powerUpUsing) || (me?.powerUps.mud ?? 0) <= 0}
              onClick={() => void handleTriggerPowerUp('mud')}
              title="Mud Splatter: Blurs all opponents' viewports with mud for 6 seconds"
            >
              <span>💨 Mud</span>
              <span className="badge-count">{me?.powerUps.mud ?? 0}</span>
            </button>

            <button
              type="button"
              className="btn-powerup"
              disabled={Boolean(powerUpUsing) || (me?.powerUps.peek ?? 0) <= 0}
              onClick={() => void handleTriggerPowerUp('peek')}
              title="Pin Peek: Reveals opponents' current minimap draft pins"
            >
              <span>🕵️ Peek</span>
              <span className="badge-count">{me?.powerUps.peek ?? 0}</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Bottom-Right Guess Minimap */}
      <GuessMinimap
        roundKey={roundKey}
        hasGuessed={hasGuessed}
        playerColor={me?.color ?? '#38bdf8'}
        pin={pin}
        muted={muted}
        radarBox={radarBox}
        opponentPins={opponentPins}
        onPinChange={handlePinChange}
        onSubmitGuess={() => void handleSubmit()}
      />

      {confirmTerminateOpen ? (
        <ModalDialog
          open={confirmTerminateOpen}
          onClose={() => setConfirmTerminateOpen(false)}
          title="End Game & Return to Lobby?"
        >
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            Are you sure you want to end this match early? The current round will stop and all players will immediately be returned to the main lobby.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBlockStart: '1rem' }}>
            <button
              type="button"
              className="btn"
              disabled={terminating}
              onClick={() => setConfirmTerminateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={terminating}
              onClick={async () => {
                setTerminating(true);
                try {
                  await onReturnToLobby?.();
                  setConfirmTerminateOpen(false);
                } finally {
                  setTerminating(false);
                }
              }}
            >
              <LogOut size={15} aria-hidden="true" />
              {terminating ? 'Ending Match…' : 'Yes, End Match'}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </main>
  );
}
