import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  MapPin,
  Trophy,
} from 'lucide-react';
import type { RoomState } from '@shared/types';
import { formatDistance } from '@shared/scoring';
import { playRoundEndChime } from '../lib/sound';
import { ResultsMap } from './ResultsMap';

interface RoundResultScreenProps {
  room: RoomState;
  playerId: string;
  muted: boolean;
  onNextRound: () => Promise<{ ok: boolean; error?: string }>;
}

export function RoundResultScreen({
  room,
  playerId,
  muted,
  onNextRound,
}: RoundResultScreenProps) {
  const result = room.currentRoundResult;
  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (result) {
      playRoundEndChime(muted);
    }
    // Play chime once when entering round result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.roundNumber]);

  if (!result) return null;

  const isFinalRound = result.roundNumber >= result.totalRounds;
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
            <div className="field-hint">
              Round {result.roundNumber} of {result.totalRounds} Results
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
              <button
                type="button"
                className="btn btn--primary"
                style={{ minBlockSize: '44px', paddingInline: '1.25rem' }}
                disabled={advancing || Boolean(room.spawningStatus)}
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
              Round {result.roundNumber} Standings
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Distance</th>
                <th scope="col">Round Score</th>
                <th scope="col">Total Score</th>
              </tr>
            </thead>
            <tbody>
              {result.guesses.map((g, idx) => {
                const pct = Math.round((g.score / 5000) * 100);
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
                    <td data-label="Total Score" className="tabular-nums">
                      <strong>{g.totalScore.toLocaleString('en-US')}</strong>
                    </td>
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
