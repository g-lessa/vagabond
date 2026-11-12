import { useMemo, useState } from 'react';
import { Award, RotateCcw, Trophy } from 'lucide-react';
import type { RoomState } from '@shared/types';
import { formatDistance } from '@shared/scoring';
import { ResultsMap } from './ResultsMap';

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
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [resetting, setResetting] = useState(false);

  const standings = useMemo(
    () =>
      [...room.players].sort((a, b) => b.totalScore - a.totalScore),
    [room.players],
  );

  const mapRounds = useMemo(() => {
    if (selectedRound === 'all') return room.roundHistory;
    return room.roundHistory.filter((r) => r.roundNumber === selectedRound);
  }, [room.roundHistory, selectedRound]);

  const maxPossible = room.settings.roundsCount * 5000;

  async function handlePlayAgain() {
    setResetting(true);
    try {
      await onPlayAgain();
    } finally {
      setResetting(false);
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
              Match Complete · {room.settings.roundsCount} Rounds
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
              <Trophy size={24} style={{ color: '#fbbf24' }} aria-hidden="true" />
              Final Podium &amp; Match Breakdown
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                  #{idx + 1} Place
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
              <div className="tabular-nums" style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
                {p.totalScore.toLocaleString('en-US')}{' '}
                <span className="field-hint">/ {maxPossible.toLocaleString('en-US')}</span>
              </div>
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
