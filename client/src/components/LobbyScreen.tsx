import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Crown,
  Globe,
  KeyRound,
  MapPin,
  Play,
  Settings2,
  Share2,
  Timer,
  UserX,
  Users,
} from 'lucide-react';
import type {
  CustomBounds,
  GameSettings,
  MapPreset,
  RoomState,
} from '@shared/types';
import { CUSTOM_AREA_PRESET_ID } from '@shared/maps';
import type { ServerInfoClient } from '../hooks/useSocket';
import { CustomAreaPickerDialog } from './CustomAreaPickerDialog';
import { ShareDialog } from './ShareDialog';

interface LobbyScreenProps {
  room: RoomState;
  playerId: string;
  maps: MapPreset[];
  serverInfo: ServerInfoClient;
  onUpdateSettings: (
    patch: Partial<GameSettings>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onStartGame: () => Promise<{ ok: boolean; error?: string }>;
  onKickPlayer: (targetId: string) => void;
  onLeaveRoom: () => void;
  onOpenTokenDialog: () => void;
  onRefreshServerInfo: () => Promise<void>;
}

const ROUND_PRESETS = [3, 5, 8, 10, 15];
const TIME_PRESETS = [
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
  { label: 'Unlimited', value: 0 },
];
const PRESSURE_PRESETS = [10, 15, 20, 30];

export function LobbyScreen({
  room,
  playerId,
  maps,
  serverInfo,
  onUpdateSettings,
  onStartGame,
  onKickPlayer,
  onLeaveRoom,
  onOpenTokenDialog,
  onRefreshServerInfo,
}: LobbyScreenProps) {
  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);

  const [mapTab, setMapTab] = useState<
    'featured' | 'themed' | 'continents' | 'countries'
  >('featured');
  const [mapQuery, setMapQuery] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [roundsInput, setRoundsInput] = useState(String(room.settings.roundsCount));
  const [timeInput, setTimeInput] = useState(String(room.settings.roundTimeSeconds));
  const [pressureInput, setPressureInput] = useState(
    String(room.settings.firstGuessTimerSeconds),
  );

  useEffect(() => {
    setRoundsInput(String(room.settings.roundsCount));
  }, [room.settings.roundsCount]);

  useEffect(() => {
    setTimeInput(String(room.settings.roundTimeSeconds));
  }, [room.settings.roundTimeSeconds]);

  useEffect(() => {
    setPressureInput(String(room.settings.firstGuessTimerSeconds));
  }, [room.settings.firstGuessTimerSeconds]);

  const selectedMap = useMemo(
    () => maps.find((m) => m.id === room.settings.mapId) ?? maps[0],
    [maps, room.settings.mapId],
  );

  const filteredMaps = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    if (q) {
      return maps.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      );
    }
    if (mapTab === 'featured') {
      return maps.filter(
        (m) =>
          m.category === 'global' ||
          m.category === 'custom' ||
          m.category === 'themed' ||
          [
            'europe',
            'north-america',
            'asia',
            'country:840',
            'country:392',
            'country:826',
            'country:250',
            'country:276',
            'country:076',
          ].includes(m.id),
      );
    }
    if (mapTab === 'themed') {
      return maps.filter((m) => m.category === 'themed');
    }
    if (mapTab === 'continents') {
      return maps.filter(
        (m) => m.category === 'continent' || m.category === 'global',
      );
    }
    return maps.filter((m) => m.category === 'country');
  }, [maps, mapTab, mapQuery]);

  async function handleStart() {
    setStartError(null);
    setStarting(true);
    try {
      const res = await onStartGame();
      if (!res.ok) {
        setStartError(res.error ?? 'Could not start match.');
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleCopyInvite() {
    const base = serverInfo.tunnelUrl ?? window.location.origin;
    const url = `${base}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      setShareOpen(true);
    }
  }

  return (
    <main className="lobby-main">
      <section className="card" aria-labelledby="lobby-settings-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBlockEnd: '1.1rem',
          }}
        >
          <h1
            id="lobby-settings-heading"
            className="lobby-section-title"
            style={{ margin: 0 }}
          >
            <Settings2 size={20} aria-hidden="true" />
            Match Settings
          </h1>
          {!isHost ? (
            <span className="badge">Host controls settings</span>
          ) : null}
        </div>

        <div className="settings-grid">
          {/* Imagery Provider */}
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
              <label>Street View Provider</label>
              {room.settings.imageryProvider === 'google' && !serverInfo.hasGoogleKey && isHost ? (
                <button
                  type="button"
                  className="pill-btn"
                  style={{ fontSize: '0.75rem', color: '#f59e0b', borderColor: '#f59e0b' }}
                  onClick={onOpenTokenDialog}
                >
                  <KeyRound size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '0.25rem' }} />
                  Setup Google Key
                </button>
              ) : null}
            </div>
            <div className="preset-row">
              <button
                type="button"
                className="pill-btn"
                aria-pressed={room.settings.imageryProvider === 'mapillary'}
                disabled={!isHost}
                onClick={() =>
                  void onUpdateSettings({ imageryProvider: 'mapillary' })
                }
              >
                🟢 Mapillary (Free 360°)
              </button>
              <button
                type="button"
                className="pill-btn"
                aria-pressed={room.settings.imageryProvider === 'kartaview'}
                disabled={!isHost}
                onClick={() =>
                  void onUpdateSettings({ imageryProvider: 'kartaview' })
                }
              >
                🚙 KartaView (OpenStreetMap · Free)
              </button>
              <button
                type="button"
                className="pill-btn"
                aria-pressed={room.settings.imageryProvider === 'google'}
                disabled={!isHost}
                onClick={() =>
                  void onUpdateSettings({ imageryProvider: 'google' })
                }
              >
                🔑 Google Street View (BYO Key)
              </button>
            </div>
            <p className="field-hint" style={{ marginBlockStart: '0.3rem' }}>
              {room.settings.imageryProvider === 'kartaview'
                ? 'KartaView uses community road imagery from OpenStreetMap. Zero API keys or tokens required!'
                : room.settings.imageryProvider === 'google'
                  ? 'Authentic 360° Google Street View with road labels hidden to prevent cheating (host API key required).'
                  : 'Mapillary provides free high-res 360° panoramas worldwide.'}
            </p>
          </div>

          {/* Game Mode */}
          <div className="field">
            <label>Game Mode</label>
            <div className="preset-row">
              <button
                type="button"
                className="pill-btn"
                aria-pressed={room.settings.gameMode === 'classic'}
                disabled={!isHost}
                onClick={() => void onUpdateSettings({ gameMode: 'classic' })}
              >
                🎯 Classic Points (0–5000)
              </button>
              <button
                type="button"
                className="pill-btn"
                aria-pressed={room.settings.gameMode === 'battle_royale'}
                disabled={!isHost}
                onClick={() =>
                  void onUpdateSettings({ gameMode: 'battle_royale' })
                }
              >
                ⚔️ Battle Royale (HP Knockout)
              </button>
            </div>
            {room.settings.gameMode === 'battle_royale' ? (
              <div
                style={{
                  marginBlockStart: '0.45rem',
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span className="field-hint">Starting Health:</span>
                {[5000, 10000, 15000].map((hp) => (
                  <button
                    key={hp}
                    type="button"
                    className="pill-btn"
                    aria-pressed={room.settings.startingHp === hp}
                    disabled={!isHost}
                    onClick={() => void onUpdateSettings({ startingHp: hp })}
                    style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                  >
                    {hp.toLocaleString()} HP
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Number of Rounds */}
          <div className="field">
            <label htmlFor="rounds-count-input">
              Number of Rounds ({room.settings.roundsCount})
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
              <div className="preset-row">
                {ROUND_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="pill-btn"
                    aria-pressed={room.settings.roundsCount === n}
                    disabled={!isHost}
                    onClick={() => void onUpdateSettings({ roundsCount: n })}
                  >
                    {n} rounds
                  </button>
                ))}
              </div>
              <input
                id="rounds-count-input"
                type="number"
                className="input"
                min={1}
                max={20}
                disabled={!isHost}
                value={roundsInput}
                onChange={(e) => setRoundsInput(e.target.value)}
                onBlur={() => {
                  const v = Number(roundsInput);
                  if (Number.isFinite(v) && v >= 1 && v <= 20) {
                    void onUpdateSettings({ roundsCount: Math.round(v) });
                  } else {
                    setRoundsInput(String(room.settings.roundsCount));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                style={{ inlineSize: '96px' }}
              />
            </div>
          </div>

          {/* Round Time Limit */}
          <div className="field">
            <label htmlFor="round-time-input">
              <Timer size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
              Round Time Limit (
              {room.settings.roundTimeSeconds === 0
                ? 'Unlimited'
                : `${room.settings.roundTimeSeconds}s`}
              )
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
              <div className="preset-row">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="pill-btn"
                    aria-pressed={room.settings.roundTimeSeconds === preset.value}
                    disabled={!isHost}
                    onClick={() =>
                      void onUpdateSettings({ roundTimeSeconds: preset.value })
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                id="round-time-input"
                type="number"
                className="input"
                min={0}
                max={600}
                step={5}
                disabled={!isHost}
                value={timeInput}
                aria-label="Custom round time in seconds (0 for unlimited)"
                onChange={(e) => setTimeInput(e.target.value)}
                onBlur={() => {
                  const v = Number(timeInput);
                  if (Number.isFinite(v) && (v === 0 || (v >= 15 && v <= 600))) {
                    void onUpdateSettings({ roundTimeSeconds: Math.round(v) });
                  } else {
                    setTimeInput(String(room.settings.roundTimeSeconds));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                style={{ inlineSize: '104px' }}
              />
            </div>
            <p className="field-hint">
              Enter seconds (15–600), or 0 for Unlimited time.
            </p>
          </div>

          {/* GeoGuessr First-Guess Timer Pressure */}
          <div className="toggle-row">
            <div>
              <label
                htmlFor="toggle-first-guess-pressure"
                style={{ fontWeight: 600, display: 'block' }}
              >
                GeoGuessr Timer Pressure
              </label>
              <span className="field-hint">
                Shortens the remaining timer as soon as the first player locks in a guess.
              </span>
            </div>
            <input
              id="toggle-first-guess-pressure"
              type="checkbox"
              checked={room.settings.shortenTimerOnFirstGuess}
              disabled={!isHost}
              onChange={(e) =>
                void onUpdateSettings({
                  shortenTimerOnFirstGuess: e.target.checked,
                })
              }
            />
          </div>

          {room.settings.shortenTimerOnFirstGuess ? (
            <div className="field" style={{ paddingInlineStart: '0.75rem', borderInlineStart: '2px solid var(--accent-warning)' }}>
              <label htmlFor="first-guess-seconds-input">
                Countdown After First Guess ({room.settings.firstGuessTimerSeconds}s)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {PRESSURE_PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="pill-btn"
                    aria-pressed={room.settings.firstGuessTimerSeconds === s}
                    disabled={!isHost}
                    onClick={() =>
                      void onUpdateSettings({ firstGuessTimerSeconds: s })
                    }
                  >
                    {s}s
                  </button>
                ))}
                <input
                  id="first-guess-seconds-input"
                  type="number"
                  className="input"
                  min={5}
                  max={60}
                  disabled={!isHost}
                  value={pressureInput}
                  onChange={(e) => setPressureInput(e.target.value)}
                  onBlur={() => {
                    const v = Number(pressureInput);
                    if (Number.isFinite(v) && v >= 5 && v <= 60) {
                      void onUpdateSettings({
                        firstGuessTimerSeconds: Math.round(v),
                      });
                    } else {
                      setPressureInput(
                        String(room.settings.firstGuessTimerSeconds),
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  style={{ inlineSize: '90px' }}
                />
              </div>
            </div>
          ) : null}

          {/* Map & Region Picker */}
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label htmlFor="map-search-input">
                <Globe size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
                Playable Map: <strong>{selectedMap?.name ?? 'World'}</strong>
              </label>
              {isHost ? (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}
                  onClick={() => setAreaPickerOpen(true)}
                >
                  <MapPin size={14} aria-hidden="true" />
                  Draw Custom Area
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="preset-row" role="group" aria-label="Map categories">
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={mapTab === 'featured' && !mapQuery}
                  onClick={() => {
                    setMapTab('featured');
                    setMapQuery('');
                  }}
                >
                  Featured
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={mapTab === 'themed' && !mapQuery}
                  onClick={() => {
                    setMapTab('themed');
                    setMapQuery('');
                  }}
                >
                  🌲 Themed &amp; Wild
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={mapTab === 'continents' && !mapQuery}
                  onClick={() => {
                    setMapTab('continents');
                    setMapQuery('');
                  }}
                >
                  Continents
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={mapTab === 'countries' && !mapQuery}
                  onClick={() => {
                    setMapTab('countries');
                    setMapQuery('');
                  }}
                >
                  All Countries
                </button>
              </div>

              <search style={{ flex: '1 1 180px', maxInlineSize: '260px' }}>
                <input
                  id="map-search-input"
                  type="search"
                  className="input"
                  style={{ minBlockSize: '36px' }}
                  placeholder="Filter countries or regions…"
                  value={mapQuery}
                  onChange={(e) => setMapQuery(e.target.value)}
                />
              </search>
            </div>

            <div className="map-catalog-grid" role="group" aria-label="Map presets">
              {filteredMaps.map((preset) => {
                const active = room.settings.mapId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className="map-tile"
                    aria-pressed={active}
                    disabled={!isHost}
                    onClick={() => {
                      if (preset.id === CUSTOM_AREA_PRESET_ID && isHost) {
                        setAreaPickerOpen(true);
                      } else {
                        void onUpdateSettings({ mapId: preset.id });
                      }
                    }}
                  >
                    <span className="map-tile-title">
                      {preset.emoji} {preset.name}
                    </span>
                    <span className="map-tile-sub">{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* NMPZ Competitive Rules */}
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label>Movement &amp; Camera Restrictions (NMPZ)</label>
              <div className="preset-row">
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={
                    room.settings.allowMoving &&
                    room.settings.allowPanning &&
                    room.settings.allowZooming
                  }
                  disabled={!isHost}
                  onClick={() =>
                    void onUpdateSettings({
                      allowMoving: true,
                      allowPanning: true,
                      allowZooming: true,
                    })
                  }
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={
                    !room.settings.allowMoving &&
                    room.settings.allowPanning &&
                    room.settings.allowZooming
                  }
                  disabled={!isHost}
                  onClick={() =>
                    void onUpdateSettings({
                      allowMoving: false,
                      allowPanning: true,
                      allowZooming: true,
                    })
                  }
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                >
                  No Move (NM)
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={
                    !room.settings.allowMoving &&
                    !room.settings.allowPanning &&
                    room.settings.allowZooming
                  }
                  disabled={!isHost}
                  onClick={() =>
                    void onUpdateSettings({
                      allowMoving: false,
                      allowPanning: false,
                      allowZooming: true,
                    })
                  }
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                >
                  No Move &amp; Pan
                </button>
                <button
                  type="button"
                  className="pill-btn"
                  aria-pressed={
                    !room.settings.allowMoving &&
                    !room.settings.allowPanning &&
                    !room.settings.allowZooming
                  }
                  disabled={!isHost}
                  onClick={() =>
                    void onUpdateSettings({
                      allowMoving: false,
                      allowPanning: false,
                      allowZooming: false,
                    })
                  }
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                >
                  NMPZ (All Locked)
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                marginBlockStart: '0.6rem',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.86rem',
                  cursor: isHost ? 'pointer' : 'default',
                }}
              >
                <input
                  type="checkbox"
                  checked={room.settings.allowMoving}
                  disabled={!isHost}
                  onChange={(e) =>
                    void onUpdateSettings({ allowMoving: e.target.checked })
                  }
                />
                Allow Road Movement
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.86rem',
                  cursor: isHost ? 'pointer' : 'default',
                }}
              >
                <input
                  type="checkbox"
                  checked={room.settings.allowPanning}
                  disabled={!isHost}
                  onChange={(e) =>
                    void onUpdateSettings({ allowPanning: e.target.checked })
                  }
                />
                Allow Camera Panning (Rotate)
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.86rem',
                  cursor: isHost ? 'pointer' : 'default',
                }}
              >
                <input
                  type="checkbox"
                  checked={room.settings.allowZooming}
                  disabled={!isHost}
                  onChange={(e) =>
                    void onUpdateSettings({ allowZooming: e.target.checked })
                  }
                />
                Allow Camera Zoom
              </label>
            </div>
          </div>

          {/* Party Mode Power-Ups Toggle */}
          <div className="toggle-row">
            <div>
              <label
                htmlFor="toggle-enable-powerups"
                style={{ fontWeight: 600, display: 'block' }}
              >
                🍌 Party Mode (Power-Ups &amp; Sabotages)
              </label>
              <span className="field-hint">
                Adds 🥽 50/50 Radar, 🧭 Hemisphere Clues, 💨 Mud Splatter, and 🕵️ Pin Peek.
              </span>
            </div>
            <input
              id="toggle-enable-powerups"
              type="checkbox"
              checked={room.settings.enablePowerUps}
              disabled={!isHost}
              onChange={(e) =>
                void onUpdateSettings({ enablePowerUps: e.target.checked })
              }
            />
          </div>

          <div className="toggle-row">
            <div>
              <label
                htmlFor="toggle-only-360"
                style={{ fontWeight: 600, display: 'block' }}
              >
                360° Panoramas Only
              </label>
              <span className="field-hint">
                Closest to Street View. Turn off to allow flat/dashcam photos for rarer countries.
              </span>
            </div>
            <input
              id="toggle-only-360"
              type="checkbox"
              checked={room.settings.only360}
              disabled={!isHost}
              onChange={(e) =>
                void onUpdateSettings({ only360: e.target.checked })
              }
            />
          </div>
        </div>
      </section>

      {/* Right Column: Room Invite + Players + Launch */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <section className="card" aria-label="Room invite details">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <div className="field-hint">Room Code</div>
              <div className="room-code-display tabular-nums">{room.code}</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={handleCopyInvite}>
                {copiedCode ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Copy size={16} aria-hidden="true" />
                )}
                {copiedCode ? 'Copied Link' : 'Copy Invite'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setShareOpen(true)}
              >
                <Share2 size={16} aria-hidden="true" />
                LAN / Tunnel
              </button>
            </div>
          </div>

          {serverInfo.tunnelUrl ? (
            <p className="field-hint" style={{ marginBlockStart: '0.6rem', color: 'var(--accent-primary)' }}>
              Public tunnel active: {serverInfo.tunnelUrl}/?room={room.code}
            </p>
          ) : null}
        </section>

        <section className="card" aria-labelledby="players-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBlockEnd: '0.85rem' }}>
            <h2
              id="players-heading"
              className="lobby-section-title"
              style={{ margin: 0 }}
            >
              <Users size={19} aria-hidden="true" />
              Players ({room.players.length})
            </h2>
          </div>

          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id} className="player-row">
                <div className="player-identity">
                  <span
                    className="player-avatar"
                    style={{ '--player-color': p.color } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ minInlineSize: 0 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name} {p.id === playerId ? '(You)' : ''}
                    </div>
                    <div className="field-hint">
                      {p.connected ? 'Online' : 'Reconnecting…'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  {p.isHost ? (
                    <span className="badge badge--success">
                      <Crown size={12} aria-hidden="true" />
                      Host
                    </span>
                  ) : isHost ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--icon"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => onKickPlayer(p.id)}
                    >
                      <UserX size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {isHost && !serverInfo.hasToken ? (
          <div className="alert alert--warning">
            <KeyRound size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <span>
                {serverInfo.isLocalHost
                  ? 'Configure your free Mapillary Client Token to start.'
                  : 'No Mapillary token detected on the host server yet. Set MAPILLARY_ACCESS_TOKEN in .env or open the host app on localhost.'}
              </span>
              {serverInfo.isLocalHost ? (
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={onOpenTokenDialog}
                >
                  Configure Mapillary Token
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {startError || room.errorMessage ? (
          <div className="alert alert--error" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span>{startError ?? room.errorMessage}</span>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {isHost ? (
            <button
              type="button"
              className="btn btn--primary"
              style={{ minBlockSize: '50px', fontSize: '1.05rem' }}
              disabled={starting}
              onClick={handleStart}
            >
              <Play size={18} aria-hidden="true" />
              {starting || room.spawningStatus
                ? room.spawningStatus ?? 'Scouting Round 1…'
                : 'Start Match'}
            </button>
          ) : (
            <div className="alert" role="status">
              <span>
                {room.spawningStatus ??
                  'Waiting for host to configure settings and start the match…'}
              </span>
            </div>
          )}

          <button type="button" className="btn btn--ghost" onClick={onLeaveRoom}>
            Leave Room
          </button>
        </div>
      </aside>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomCode={room.code}
        serverInfo={serverInfo}
        onRefreshServerInfo={onRefreshServerInfo}
      />

      <CustomAreaPickerDialog
        open={areaPickerOpen}
        onClose={() => setAreaPickerOpen(false)}
        initialBounds={room.settings.customBounds}
        onApply={(bounds: CustomBounds) => {
          void onUpdateSettings({
            mapId: CUSTOM_AREA_PRESET_ID,
            customBounds: bounds,
          });
        }}
      />
    </main>
  );
}
