import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Compass,
  Globe2,
  KeyRound,
  Timer,
  Users,
} from 'lucide-react';
import { getRoomCodeFromUrl, savePlayerName } from '../lib/identity';
import type { ServerInfoClient } from '../hooks/useSocket';

interface LandingScreenProps {
  initialName: string;
  connected: boolean;
  serverInfo: ServerInfoClient;
  kickedReason: string | null;
  onCreateRoom: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onJoinRoom: (
    code: string,
    name: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenTokenDialog: () => void;
}

export function LandingScreen({
  initialName,
  connected,
  serverInfo,
  kickedReason,
  onCreateRoom,
  onJoinRoom,
  onOpenTokenDialog,
}: LandingScreenProps) {
  const urlCode = getRoomCodeFromUrl();
  const [tab, setTab] = useState<'host' | 'join'>(urlCode ? 'join' : 'host');
  const [name, setName] = useState(initialName);
  const [roomCode, setRoomCode] = useState(urlCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(kickedReason);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your display name.');
      return;
    }
    savePlayerName(trimmedName);
    setBusy(true);
    try {
      const res =
        tab === 'host'
          ? await onCreateRoom(trimmedName)
          : await onJoinRoom(roomCode, trimmedName);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing-main">
      <div className="landing-container">
        <section>
          <div className="hero-eyebrow">
            <Compass size={16} aria-hidden="true" />
            100% Free &amp; Self-Hosted Street Explorer
          </div>
          <h1 className="hero-title">
            Drop onto any road on Earth. Guess with friends.
          </h1>
          <p className="hero-copy">
            Powered by free Mapillary street imagery and OpenStreetMap. Host a
            multiplayer room straight from your machine—no subscriptions, no API
            billing, no rented server required.
          </p>

          <ul className="feature-pills">
            <li className="badge">
              <Users size={14} aria-hidden="true" />
              Real-time Multiplayer
            </li>
            <li className="badge">
              <Timer size={14} aria-hidden="true" />
              Editable Timer &amp; Rounds
            </li>
            <li className="badge">
              <Globe2 size={14} aria-hidden="true" />
              World, Continents &amp; 170+ Countries
            </li>
          </ul>
        </section>

        <section className="card" aria-label="Room entry">
          <div className="tabs" role="tablist" aria-label="Choose host or join">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'host'}
              className="tab-btn"
              onClick={() => {
                setTab('host');
                setError(null);
              }}
            >
              Host a Room
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'join'}
              className="tab-btn"
              onClick={() => {
                setTab('join');
                setError(null);
              }}
            >
              Join with Code
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div className="field">
              <label htmlFor="landing-player-name">Your Display Name</label>
              <input
                id="landing-player-name"
                type="text"
                className="input"
                maxLength={24}
                placeholder="e.g. Magellan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
                required
              />
            </div>

            {tab === 'join' ? (
              <div className="field">
                <label htmlFor="landing-room-code">Room Code</label>
                <input
                  id="landing-room-code"
                  type="text"
                  className="input"
                  maxLength={8}
                  placeholder="e.g. XK7M"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  style={{ letterSpacing: '0.16em', fontWeight: 800 }}
                  required
                />
              </div>
            ) : null}

            {tab === 'host' &&
            serverInfo.isLocalHost &&
            !serverInfo.hasToken ? (
              <div className="alert alert--warning">
                <KeyRound size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <span>
                    Host needs a free <strong>Mapillary Client Token</strong>{' '}
                    before starting a match.
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={onOpenTokenDialog}
                  >
                    <KeyRound size={15} aria-hidden="true" />
                    Set Mapillary Token
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="alert alert--error" role="alert">
                <AlertCircle size={18} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={!connected || busy}
              style={{ minBlockSize: '46px', fontSize: '1rem' }}
            >
              {!connected
                ? 'Connecting to Host…'
                : busy
                  ? 'Joining…'
                  : tab === 'host'
                    ? 'Create Multiplayer Room'
                    : 'Join Room'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
