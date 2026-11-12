import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../server/roomManager.js';
import * as configModule from '../server/config.js';

describe('RoomManager multiplayer state machine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createMockIO() {
    const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
      sockets: {
        sockets: new Map(),
      },
    };
    return { io: io as never, emitted };
  }

  it('supports editable rounds/timer, hides true coords while playing, shortens timer on first guess, and scores draft pins', async () => {
    vi.useFakeTimers();
    vi.spyOn(configModule, 'getMapillaryToken').mockReturnValue('MLY|test-token');

    let spawnCounter = 0;
    const manager = new RoomManager(async () => {
      spawnCounter++;
      return {
        imageId: `img-${spawnCounter}`,
        lat: 35.6812,
        lng: 139.7671,
        isPano: true,
        compassAngle: 90,
        sequenceId: `seq-${spawnCounter}`,
        countryName: 'Japan',
      };
    });

    const { io, emitted } = createMockIO();
    manager.attachIO(io);

    // Host creates room
    const created = manager.createRoom('sock-host', 'p-host', 'Alice');
    const code = created.roomCode;
    expect(created.state.players[0].isHost).toBe(true);

    // Guest joins
    const joined = manager.joinRoom('sock-guest', code, 'p-guest', 'Bob');
    expect(joined.ok).toBe(true);
    expect(joined.state?.players).toHaveLength(2);

    // Guest cannot update settings
    const guestEdit = manager.updateSettings('sock-guest', code, {
      roundsCount: 2,
    });
    expect(guestEdit.ok).toBe(false);

    // Host edits rounds count, round timer, and first-guess countdown
    const hostEdit = manager.updateSettings('sock-host', code, {
      roundsCount: 2,
      roundTimeSeconds: 120,
      shortenTimerOnFirstGuess: true,
      firstGuessTimerSeconds: 15,
      mapId: 'country:392',
    });
    expect(hostEdit.ok).toBe(true);
    expect(manager.getRoomState(code)?.settings.roundsCount).toBe(2);
    expect(manager.getRoomState(code)?.settings.roundTimeSeconds).toBe(120);

    // Start game
    const started = await manager.startGame('sock-host', code);
    expect(started.ok).toBe(true);

    const playingState = manager.getRoomState(code)!;
    expect(playingState.phase).toBe('playing');
    expect(playingState.currentRound?.roundNumber).toBe(1);
    expect(playingState.currentRound?.totalRounds).toBe(2);
    // Ensure true lat/lng are NOT leaked in round brief
    expect('lat' in (playingState.currentRound ?? {})).toBe(false);
    expect('lng' in (playingState.currentRound ?? {})).toBe(false);

    // Guest places a draft pin without locking in
    manager.setDraftPin('sock-guest', code, 35.69, 139.77);

    // Host locks in exact guess first -> triggers timer shortening to 15s!
    const guessRes = manager.submitGuess('sock-host', code, 35.6812, 139.7671);
    expect(guessRes.ok).toBe(true);

    const shortenedEvent = emitted.find(
      (e) => e.event === 'room:timerShortened',
    );
    expect(shortenedEvent).toBeDefined();

    // Advance 15 seconds -> timer expires and auto-scores Bob's draft pin!
    await vi.advanceTimersByTimeAsync(15_100);

    const resultState = manager.getRoomState(code)!;
    expect(resultState.phase).toBe('round_result');
    expect(resultState.currentRoundResult?.actual.countryName).toBe('Japan');

    const aliceRes = resultState.currentRoundResult?.guesses.find(
      (g) => g.playerId === 'p-host',
    );
    const bobRes = resultState.currentRoundResult?.guesses.find(
      (g) => g.playerId === 'p-guest',
    );
    expect(aliceRes?.score).toBe(5000);
    expect(bobRes?.score).toBeGreaterThan(4500);
    expect(bobRes?.timedOut).toBe(false);

    // Advance to Round 2
    const nextRes = await manager.nextRound('sock-host', code);
    expect(nextRes.ok).toBe(true);
    expect(manager.getRoomState(code)?.phase).toBe('playing');
    expect(manager.getRoomState(code)?.currentRound?.roundNumber).toBe(2);

    // Both players lock guesses -> finishes round immediately without waiting for timer!
    manager.submitGuess('sock-host', code, 35.6812, 139.7671);
    manager.submitGuess('sock-guest', code, 35.6812, 139.7671);
    expect(manager.getRoomState(code)?.phase).toBe('round_result');

    // Final advance -> game_over
    await manager.nextRound('sock-host', code);
    expect(manager.getRoomState(code)?.phase).toBe('game_over');
    expect(manager.getRoomState(code)?.roundHistory).toHaveLength(2);

    // Play again returns to lobby preserving players & settings
    const replay = manager.playAgain('sock-host', code);
    expect(replay.ok).toBe(true);
    const lobbyAgain = manager.getRoomState(code)!;
    expect(lobbyAgain.phase).toBe('lobby');
    expect(lobbyAgain.players).toHaveLength(2);
    expect(lobbyAgain.settings.roundsCount).toBe(2);
  });
});
