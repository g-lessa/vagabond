import { useEffect, useState } from 'react';
import { Compass, KeyRound, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { useVagabondClient } from './hooks/useSocket';
import {
  applyTheme,
  getSavedMuted,
  getSavedPlayerName,
  getSavedTheme,
  saveMuted,
  type ThemeChoice,
} from './lib/identity';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GamePlayScreen } from './components/GamePlayScreen';
import { RoundResultScreen } from './components/RoundResultScreen';
import { GameOverScreen } from './components/GameOverScreen';
import { TokenDialog } from './components/TokenDialog';

export function App() {
  const {
    playerId,
    connected,
    roomState,
    mapillaryToken,
    maps,
    serverInfo,
    shortenedNotice,
    kickedReason,
    floatingEmojis,
    sabotagedUntil,
    sabotageBy,
    powerUpNotice,
    refreshServerInfo,
    createRoom,
    joinRoom,
    updateSettings,
    startGame,
    sendDraftPin,
    submitGuess,
    nextRound,
    playAgain,
    kickPlayer,
    sendEmoji,
    usePowerUp,
    leaveRoom,
  } = useVagabondClient();

  const [initialName] = useState(() => getSavedPlayerName());
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [muted, setMuted] = useState(() => getSavedMuted());
  const [theme, setTheme] = useState<ThemeChoice>(() => getSavedTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Update document title per view (accessibility/html best practice)
  useEffect(() => {
    if (!roomState) {
      document.title = 'Vagabond — Free Multiplayer Street Explorer';
    } else if (roomState.phase === 'lobby') {
      document.title = `Room ${roomState.code} Lobby | Vagabond`;
    } else if (roomState.phase === 'playing' && roomState.currentRound) {
      document.title = `Round ${roomState.currentRound.roundNumber}/${roomState.currentRound.totalRounds} | Vagabond`;
    } else if (roomState.phase === 'round_result') {
      document.title = `Round Results | Vagabond`;
    } else {
      document.title = `Final Standings | Vagabond`;
    }
  }, [roomState]);

  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    saveMuted(next);
  }

  function handleCycleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  const isPlaying = roomState?.phase === 'playing';

  return (
    <div className="app-shell">
      {!isPlaying ? (
        <header className="top-nav">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Compass size={20} />
            </span>
            <span>Vagabond</span>
          </div>

          <div className="top-nav-actions">
            {serverInfo.isLocalHost ? (
              <button
                type="button"
                className="btn"
                onClick={() => setTokenDialogOpen(true)}
              >
                <KeyRound size={15} aria-hidden="true" />
                {serverInfo.hasToken || serverInfo.hasGoogleKey
                  ? 'API Keys ✓'
                  : 'Configure API Keys'}
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn--icon"
              onClick={handleCycleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
            </button>

            <span
              className={`badge ${connected ? 'badge--success' : 'badge--danger'}`}
            >
              {connected ? (
                <Wifi size={13} aria-hidden="true" />
              ) : (
                <WifiOff size={13} aria-hidden="true" />
              )}
              {connected ? 'Connected' : 'Reconnecting'}
            </span>
          </div>
        </header>
      ) : null}

      {!roomState ? (
        <LandingScreen
          initialName={initialName}
          connected={connected}
          serverInfo={serverInfo}
          kickedReason={kickedReason}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          onOpenTokenDialog={() => setTokenDialogOpen(true)}
        />
      ) : roomState.phase === 'lobby' ? (
        <LobbyScreen
          room={roomState}
          playerId={playerId}
          maps={maps}
          serverInfo={serverInfo}
          onUpdateSettings={updateSettings}
          onStartGame={startGame}
          onKickPlayer={kickPlayer}
          onLeaveRoom={leaveRoom}
          onOpenTokenDialog={() => setTokenDialogOpen(true)}
          onRefreshServerInfo={refreshServerInfo}
        />
      ) : roomState.phase === 'playing' ? (
        (roomState.currentRound?.imageryProvider ?? roomState.settings.imageryProvider) === 'mapillary' && !mapillaryToken ? (
          <main className="landing-main">
            <div className="alert alert--error" role="alert">
              <span>
                Waiting for host&apos;s Mapillary token configuration to load street imagery…
              </span>
            </div>
          </main>
        ) : (
          <GamePlayScreen
            room={roomState}
            playerId={playerId}
            mapillaryToken={mapillaryToken ?? ''}
            shortenedNotice={shortenedNotice}
            floatingEmojis={floatingEmojis}
            sabotagedUntil={sabotagedUntil}
            sabotageBy={sabotageBy}
            powerUpNotice={powerUpNotice}
            muted={muted}
            onToggleMute={handleToggleMute}
            onSendEmoji={sendEmoji}
            onUsePowerUp={usePowerUp}
            onDraftPin={sendDraftPin}
            onSubmitGuess={submitGuess}
          />
        )
      ) : roomState.phase === 'round_result' ? (
        <RoundResultScreen
          room={roomState}
          playerId={playerId}
          muted={muted}
          onNextRound={nextRound}
        />
      ) : (
        <GameOverScreen
          room={roomState}
          playerId={playerId}
          onPlayAgain={playAgain}
          onLeaveRoom={leaveRoom}
        />
      )}

      <TokenDialog
        open={tokenDialogOpen}
        onClose={() => setTokenDialogOpen(false)}
        hasExistingToken={serverInfo.hasToken}
        hasExistingGoogleKey={serverInfo.hasGoogleKey}
        onSaved={() => void refreshServerInfo()}
      />
    </div>
  );
}
export default App;
