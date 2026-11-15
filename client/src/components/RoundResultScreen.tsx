import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Camera,
  ExternalLink,
  LogOut,
  MapPin,
  Trophy,
} from 'lucide-react';
import type { RoomState } from '@shared/types';
import { formatDistance } from '@shared/scoring';
import {
  playDamageHitSound,
  playEliminatedSound,
  playRoundEndChime,
} from '../lib/sound';
import { ResultsMap } from './ResultsMap';

interface RoundResultScreenProps {
  room: RoomState;
  playerId: string;
  muted: boolean;
  onNextRound: () => Promise<{ ok: boolean; error?: string }>;
  onReturnToLobby?: () => Promise<{ ok: boolean; error?: string }>;
}

export function RoundResultScreen({
  room,
  playerId,
  muted,
  onNextRound,
  onReturnToLobby,
}: RoundResultScreenProps) {
  const result = room.currentRoundResult;
  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const isBattleRoyale = room.settings.gameMode === 'battle_royale';
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [terminating, setTerminating] = useState(false);

  useEffect(() => {
    if (result) {
      const myGuess = result.guesses.find((g) => g.playerId === playerId);
      if (isBattleRoyale && myGuess?.isEliminated) {
        playEliminatedSound(muted);
      } else if (isBattleRoyale && (myGuess?.damageTaken ?? 0) > 0) {
        playDamageHitSound(muted);
      } else {
        playRoundEndChime(muted);
      }
    }
    // Play sound once when entering round result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.roundNumber]);

  if (!result) return null;

  const connectedPlayers = room.players.filter((p) => p.connected);
  const alivePlayers = connectedPlayers.filter((p) => !p.isEliminated);
  const isBrDecided =
    isBattleRoyale && connectedPlayers.length > 1 && alivePlayers.length <= 1;
  const isFinalRound =
    result.roundNumber >= result.totalRounds || isBrDecided;
  const mapillaryExternalUrl = `https://www.mapillary.com/app/?pKey=${encodeURIComponent(
    result.actual.imageId,
  )}&focus=photo`;

  async function handleNext() {
    setAdvancing(true);
    try {
      await onNextRound();
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <main className="results-layout">
      <div className="results-map-stage">
        <ResultsMap rounds={[result]} highlightedPlayerId={highlightedId} />
      </div>

      <section className="results-panel" aria-labelledby="round-result-heading">
        <div className="results-header-bar">
          <div>
            <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>Round {result.roundNumber} of {result.totalRounds} Results</span>
              {result.actual.capturedAtYear ? (
                <span className="badge" style={{ fontSize: '0.75rem' }}>
                  <Camera size={12} aria-hidden="true" />
                  Captured {result.actual.capturedAtYear}
                </span>
              ) : null}
            </div>
            <h1
              id="round-result-heading"
              style={{
                margin: '0.15rem 0 0',
                fontSize: '1.45rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <MapPin size={22} style={{ color: '#fbbf24' }} aria-hidden="true" />
              <span>{result.actual.countryName ?? 'Unknown Territory'}</span>
              <span className="field-hint tabular-nums" style={{ fontSize: '0.88rem' }}>
                ({result.actual.lat.toFixed(4)}, {result.actual.lng.toFixed(4)})
              </span>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <a
              href={mapillaryExternalUrl}
              target="_blank"
              rel="noreferrer"
              className="btn"
            >
              View on Mapillary
              <ExternalLink size={15} aria-hidden="true" />
            </a>

            {isHost ? (
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    minBlockSize: '44px',
                    paddingInline: '0.9rem',
                    color: '#fca5a5',
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                  }}
                  disabled={terminating || advancing}
                  onClick={async () => {
                    setTerminating(true);
                    try {
                      await onReturnToLobby?.();
                    } finally {
                      setTerminating(false);
                    }
                  }}
                  title="End match early and return to lobby"
                >
                  <LogOut size={16} aria-hidden="true" />
                  {terminating ? 'Ending…' : 'End Match'}
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ minBlockSize: '44px', paddingInline: '1.25rem' }}
                  disabled={advancing || terminating || Boolean(room.spawningStatus)}
                  onClick={handleNext}
                >
                  {isFinalRound ? (
                    <>
                      <Trophy size={17} aria-hidden="true" />
                      View Final Standings
                    </>
                  ) : (
                    <>
                      <ArrowRight size={17} aria-hidden="true" />
                      {room.spawningStatus ??
                        `Next Round (${result.roundNumber + 1}/${result.totalRounds})`}
                    </>
                  )}
                </button>
              </div>
            ) : (
              <span className="badge" role="status">
                {room.spawningStatus ?? 'Waiting for host to continue…'}
              </span>
            )}
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="round-standings-caption"
          className="table-wrapper"
        >
          <table className="results-table">
            <caption id="round-standings-caption">
              Round {result.roundNumber} Standings {isBattleRoyale ? '— Battle Royale' : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Distance</th>
                <th scope="col">Round Score</th>
                {isBattleRoyale ? (
                  <>
                    <th scope="col">Damage</th>
                    <th scope="col">Remaining HP</th>
                  </>
                ) : (
                  <th scope="col">Total Score</th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.guesses.map((g, idx) => {
                const pct = Math.round((g.score / 5000) * 100);
                const startingHp = room.settings.startingHp || 10000;
                const hpPct = Math.max(
                  0,
                  Math.min(100, Math.round(((g.remainingHp ?? 0) / startingHp) * 100)),
                );
                return (
                  <tr
                    key={g.playerId}
                    onMouseEnter={() => setHighlightedId(g.playerId)}
                    onMouseLeave={() => setHighlightedId(null)}
                  >
                    <td data-label="Rank" className="tabular-nums">
                      #{idx + 1}
                    </td>
                    <th scope="row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span
                          className="player-avatar"
                          style={{ '--player-color': g.playerColor } as React.CSSProperties}
                          aria-hidden="true"
                        >
                          {g.playerName.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          {g.playerName}
                          {g.playerId === playerId ? ' (You)' : ''}
                        </span>
                        {g.isEliminated ? (
                          <span className="badge badge--danger" style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}>
                            💀 Out
                          </span>
                        ) : null}
                      </div>
                    </th>
                    <td data-label="Distance" className="tabular-nums">
                      {g.timedOut ? 'No guess' : formatDistance(g.distanceMeters)}
                    </td>
                    <td data-label="Round Score" className="tabular-nums">
                      <span
                        className="score-bar-track"
                        style={{ '--score-pct': pct } as React.CSSProperties}
                        aria-hidden="true"
                      >
                        <span className="score-bar-fill" />
                      </span>
                      <strong>+{g.score.toLocaleString('en-US')}</strong>
                    </td>

                    {isBattleRoyale ? (
                      <>
                        <td data-label="Damage" className="tabular-nums" style={{ color: (g.damageTaken ?? 0) > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {(g.damageTaken ?? 0) > 0 ? `-${(g.damageTaken ?? 0).toLocaleString()} HP` : '0 HP'}
                        </td>
                        <td data-label="Remaining HP" className="tabular-nums">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              className="score-bar-track"
                              style={{
                                '--score-pct': hpPct,
                                inlineSize: '65px',
                              } as React.CSSProperties}
                              aria-hidden="true"
                            >
                              <span
                                className="score-bar-fill"
                                style={{
                                  background:
                                    hpPct > 50
                                      ? '#10b981'
                                      : hpPct > 25
                                        ? '#f59e0b'
                                        : '#ef4444',
                                }}
                              />
                            </span>
                            <strong style={{ color: g.isEliminated ? '#ef4444' : undefined }}>
                              {g.isEliminated ? '0 HP (Eliminated)' : `${(g.remainingHp ?? 0).toLocaleString()} HP`}
                            </strong>
                          </div>
                        </td>
                      </>
                    ) : (
                      <td data-label="Total Score" className="tabular-nums">
                        <strong>{g.totalScore.toLocaleString('en-US')}</strong>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
