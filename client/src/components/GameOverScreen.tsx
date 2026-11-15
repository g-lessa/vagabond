import { useMemo, useState } from 'react';
import {
  Award,
  Check,
  Copy,
  Plane,
  RotateCcw,
} from 'lucide-react';
import type { RoomState } from '@shared/types';
import { formatDistance } from '@shared/scoring';
import { ResultsMap } from './ResultsMap';
import { VagabondLogo } from './VagabondLogo';

interface GameOverScreenProps {
  room: RoomState;
  playerId: string;
  onPlayAgain: () => Promise<{ ok: boolean; error?: string }>;
  onLeaveRoom: () => void;
}

export function GameOverScreen({
  room,
  playerId,
  onPlayAgain,
  onLeaveRoom,
}: GameOverScreenProps) {
  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const isBattleRoyale = room.settings.gameMode === 'battle_royale';
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [resetting, setResetting] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const standings = useMemo(() => {
    return [...room.players].sort((a, b) => {
      if (isBattleRoyale) {
        return (
          b.hp - a.hp ||
          b.totalScore - a.totalScore
        );
      }
      return b.totalScore - a.totalScore;
    });
  }, [room.players, isBattleRoyale]);

  const mapRounds = useMemo(() => {
    if (selectedRound === 'all') return room.roundHistory;
    return room.roundHistory.filter((r) => r.roundNumber === selectedRound);
  }, [room.roundHistory, selectedRound]);

  const maxPossible = room.settings.roundsCount * 5000;

  // Itinerary & Stats for Passport
  const visitedCountries = useMemo(() => {
    const names = room.roundHistory
      .map((r) => r.actual.countryName)
      .filter((c): c is string => Boolean(c));
    return names.length > 0 ? names : ['Global Wilds'];
  }, [room.roundHistory]);

  const myGuesses = useMemo(() => {
    return room.roundHistory
      .map((r) => r.guesses.find((g) => g.playerId === playerId))
      .filter(Boolean);
  }, [room.roundHistory, playerId]);

  const myTotalDistanceMeters = useMemo(() => {
    return myGuesses.reduce((acc, g) => acc + (g?.distanceMeters ?? 0), 0);
  }, [myGuesses]);

  // Unlocked Passport Stamps
  const stamps = useMemo(() => {
    const list: Array<{ id: string; emoji: string; title: string; desc: string }> = [];
    const bestDistance = Math.min(
      ...myGuesses.map((g) => g?.distanceMeters ?? Infinity),
    );
    if (bestDistance <= 25_000) {
      list.push({
        id: 'sniper',
        emoji: '🎯',
        title: 'Deadly Accurate',
        desc: 'Pinpointed within 25 km of actual street drop!',
      });
    }
    if (new Set(visitedCountries).size >= 3) {
      list.push({
        id: 'explorer',
        emoji: '🗺️',
        title: 'World Explorer',
        desc: 'Explored 3 or more distinct territories.',
      });
    }
    if (standings[0]?.id === playerId) {
      list.push({
        id: 'champion',
        emoji: '👑',
        title: 'Grand Champion',
        desc: '#1 podium finish in this match!',
      });
    }
    if (isBattleRoyale && !me?.isEliminated) {
      list.push({
        id: 'survivor',
        emoji: '💀',
        title: 'Apex Survivor',
        desc: 'Survived the Battle Royale knockout mode!',
      });
    }
    const fastestGuessMs = Math.min(
      ...myGuesses.map((g) => g?.timeTakenMs ?? Infinity),
    );
    if (fastestGuessMs < 12_000) {
      list.push({
        id: 'speed',
        emoji: '⚡',
        title: 'Lightning Reflexes',
        desc: 'Submitted a guess in under 12 seconds.',
      });
    }
    return list;
  }, [myGuesses, visitedCountries, standings, playerId, isBattleRoyale, me]);

  async function handlePlayAgain() {
    setResetting(true);
    try {
      await onPlayAgain();
    } finally {
      setResetting(false);
    }
  }

  async function handleCopySummary() {
    const winner = standings[0];
    const text = [
      `🧭 Vagabond Travel Boarding Pass (Room ${room.code})`,
      `🏆 Winner: ${winner?.name ?? 'Traveler'} (${isBattleRoyale ? `${winner?.hp.toLocaleString()} HP remaining` : `${winner?.totalScore.toLocaleString()} pts`})`,
      `✈️ Route: ${visitedCountries.join(' ➔ ')}`,
      `📏 Total Travel: ${formatDistance(myTotalDistanceMeters)}`,
      stamps.length > 0
        ? `🎖️ Passport Stamps: ${stamps.map((s) => `${s.emoji} ${s.title}`).join(', ')}`
        : '',
      `🎮 Vagabond — Free Self-Hosted Street Explorer`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      // clipboard failure fallback
    }
  }

  return (
    <main className="results-layout">
      <div className="results-map-stage">
        <ResultsMap rounds={mapRounds} />
      </div>

      <section className="results-panel" aria-labelledby="final-standings-heading">
        <div className="results-header-bar">
          <div>
            <div className="field-hint">
              Match Complete · {room.settings.roundsCount} Rounds · {isBattleRoyale ? 'Battle Royale' : 'Classic Mode'}
            </div>
            <h1
              id="final-standings-heading"
              style={{
                margin: '0.15rem 0 0',
                fontSize: '1.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
              }}
            >
              <VagabondLogo size={24} variant="icon" />
              Final Podium &amp; Travel Recap
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={handleCopySummary}
              title="Copy boarding pass & summary to clipboard"
            >
              {copiedSummary ? <Check size={16} /> : <Copy size={16} />}
              {copiedSummary ? 'Copied Summary!' : 'Share Boarding Pass'}
            </button>
            {isHost ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={resetting}
                onClick={handlePlayAgain}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Play Again (Back to Lobby)
              </button>
            ) : (
              <span className="badge" role="status">
                Host can restart in lobby
              </span>
            )}
            <button type="button" className="btn" onClick={onLeaveRoom}>
              Leave Room
            </button>
          </div>
        </div>

        {/* Travel Itinerary / Boarding Pass Card */}
        <div className="boarding-pass-card">
          <div className="boarding-pass-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Plane size={18} style={{ color: 'var(--accent-secondary)' }} aria-hidden="true" />
              <span style={{ fontWeight: 800, letterSpacing: '0.05em' }}>
                VAGABOND AIRWAYS · FLIGHT #VGB-{room.code}
              </span>
            </div>
            <span className="badge badge--success" style={{ fontSize: '0.75rem' }}>
              BOARDING PASS
            </span>
          </div>

          <div className="boarding-pass-body">
            <div className="boarding-pass-item">
              <span className="boarding-pass-label">PASSENGER</span>
              <span className="boarding-pass-val">{me?.name ?? 'Traveler'}</span>
            </div>
            <div className="boarding-pass-item">
              <span className="boarding-pass-label">FLIGHT PATH</span>
              <span className="boarding-pass-val" style={{ fontSize: '0.9rem' }}>
                {visitedCountries.join(' ➔ ')}
              </span>
            </div>
            <div className="boarding-pass-item">
              <span className="boarding-pass-label">TOTAL DISTANCE</span>
              <span className="boarding-pass-val tabular-nums">
                {formatDistance(myTotalDistanceMeters)}
              </span>
            </div>
            <div className="boarding-pass-item">
              <span className="boarding-pass-label">FINAL OUTCOME</span>
              <span className="boarding-pass-val tabular-nums" style={{ color: 'var(--accent-primary)' }}>
                {isBattleRoyale
                  ? me?.isEliminated
                    ? '💀 Eliminated'
                    : `${(me?.hp ?? 0).toLocaleString()} HP Left`
                  : `${(me?.totalScore ?? 0).toLocaleString()} pts`}
              </span>
            </div>
          </div>

          {/* Unlocked Passport Stamps */}
          {stamps.length > 0 ? (
            <div className="passport-stamps-bar">
              <span className="field-hint" style={{ fontWeight: 700, marginInlineEnd: '0.4rem' }}>
                Passport Stamps:
              </span>
              {stamps.map((s) => (
                <span
                  key={s.id}
                  className="passport-stamp-badge"
                  title={`${s.title}: ${s.desc}`}
                >
                  <span aria-hidden="true">{s.emoji}</span>
                  <span>{s.title}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Round Map Filter Pills */}
        <div className="preset-row" role="group" aria-label="Filter map by round">
          <button
            type="button"
            className="pill-btn"
            aria-pressed={selectedRound === 'all'}
            onClick={() => setSelectedRound('all')}
          >
            All Rounds
          </button>
          {room.roundHistory.map((r) => (
            <button
              key={r.roundNumber}
              type="button"
              className="pill-btn"
              aria-pressed={selectedRound === r.roundNumber}
              onClick={() => setSelectedRound(r.roundNumber)}
            >
              R{r.roundNumber}: {r.actual.countryName ?? 'Drop'}
            </button>
          ))}
        </div>

        {/* Top Podium Cards */}
        <div className="podium-grid">
          {standings.slice(0, 3).map((p, idx) => (
            <div
              key={p.id}
              className={idx === 0 ? 'podium-card podium-card--first' : 'podium-card'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="badge">
                  <Award size={13} aria-hidden="true" />
                  #{idx + 1} {idx === 0 ? (isBattleRoyale ? 'Survivor' : 'Winner') : 'Place'}
                </span>
                <span
                  className="player-avatar"
                  style={{ '--player-color': p.color } as React.CSSProperties}
                  aria-hidden="true"
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>
                {p.name}
                {p.id === playerId ? ' (You)' : ''}
              </div>
              {isBattleRoyale ? (
                <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 900, color: p.isEliminated ? '#ef4444' : '#10b981' }}>
                  {p.isEliminated ? '💀 Eliminated' : `${p.hp.toLocaleString()} HP`}
                  <div className="field-hint" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {p.totalScore.toLocaleString()} points
                  </div>
                </div>
              ) : (
                <div className="tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
                  {p.totalScore.toLocaleString('en-US')}{' '}
                  <span className="field-hint">/ {maxPossible.toLocaleString('en-US')}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Full Round-by-Round Table */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="match-breakdown-caption"
          className="table-wrapper"
        >
          <table className="results-table">
            <caption id="match-breakdown-caption">
              Round-by-Round Score Breakdown
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                {room.roundHistory.map((r) => (
                  <th key={r.roundNumber} scope="col">
                    R{r.roundNumber}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((p, idx) => (
                <tr key={p.id}>
                  <td data-label="Rank" className="tabular-nums">
                    #{idx + 1}
                  </td>
                  <th scope="row">
                    {p.name}
                    {p.id === playerId ? ' (You)' : ''}
                  </th>
                  {room.roundHistory.map((r) => {
                    const g = r.guesses.find((x) => x.playerId === p.id);
                    return (
                      <td
                        key={r.roundNumber}
                        data-label={`Round ${r.roundNumber}`}
                        className="tabular-nums"
                      >
                        {g ? (
                          <span>
                            <strong>{g.score.toLocaleString('en-US')}</strong>{' '}
                            <span className="field-hint">
                              ({formatDistance(g.distanceMeters)})
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                  <td data-label="Total" className="tabular-nums">
                    <strong>{p.totalScore.toLocaleString('en-US')}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
