import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as clientIO, type Socket } from 'socket.io-client';
import { createVagabondServer } from '../server/app.js';
import { RoomManager } from '../server/roomManager.js';
import * as configModule from '../server/config.js';
import type {
  ClientToServerEvents,
  RoomState,
  ServerToClientEvents,
} from '../shared/types.js';

describe('HTTP & Socket.io server integration', () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const close of closers.splice(0)) {
      await close();
    }
  });

  it('serves API endpoints, protects host token endpoint from tunneled headers, and syncs multiplayer rooms over WebSockets', async () => {
    vi.spyOn(configModule, 'getMapillaryToken').mockReturnValue('MLY|smoke-test');

    const rooms = new RoomManager(async () => ({
      imageId: '999888777',
      lat: 48.8566,
      lng: 2.3522,
      isPano: true,
      compassAngle: 180,
      sequenceId: 'seq-smoke',
      countryName: 'France',
    }));

    const { httpServer, io } = createVagabondServer({
      serveStatic: false,
      rooms,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    let hostSock: Socket<ServerToClientEvents, ClientToServerEvents> | null =
      null;
    let guestSock: Socket<ServerToClientEvents, ClientToServerEvents> | null =
      null;

    closers.push(async () => {
      hostSock?.disconnect();
      guestSock?.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    // 1. Check REST endpoints
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true });

    const mapsRes = await fetch(`${baseUrl}/api/maps`);
    expect(mapsRes.status).toBe(200);
    const mapsData = (await mapsRes.json()) as { maps: unknown[] };
    expect(mapsData.maps.length).toBeGreaterThan(150);

    // 2. Verify proxied/tunneled headers are rejected by /api/config/token
    const blockedRes = await fetch(`${baseUrl}/api/config/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.50',
      },
      body: JSON.stringify({ token: 'MLY|hijack' }),
    });
    expect(blockedRes.status).toBe(403);

    // 3. Connect host & guest via real Socket.io
    hostSock = clientIO(baseUrl, { transports: ['websocket'] });
    guestSock = clientIO(baseUrl, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((resolve) => hostSock!.on('connect', resolve)),
      new Promise<void>((resolve) => guestSock!.on('connect', resolve)),
    ]);

    const latestGuestStates: RoomState[] = [];
    guestSock.on('room:state', (s) => latestGuestStates.push(s));

    const createAck = await new Promise<{
      ok: boolean;
      data?: { roomCode: string; hostSecret: string };
    }>((resolve) => {
      hostSock!.emit(
        'room:create',
        { playerId: 'h1', playerName: 'HostAlice' },
        resolve,
      );
    });
    expect(createAck.ok).toBe(true);
    const roomCode = createAck.data!.roomCode;

    const joinAck = await new Promise<{ ok: boolean }>((resolve) => {
      guestSock!.emit(
        'room:join',
        { roomCode, playerId: 'g1', playerName: 'GuestBob' },
        resolve,
      );
    });
    expect(joinAck.ok).toBe(true);

    // Host updates rounds and timer
    const editAck = await new Promise<{ ok: boolean }>((resolve) => {
      hostSock!.emit(
        'room:updateSettings',
        {
          roomCode,
          settings: { roundsCount: 3, roundTimeSeconds: 45 },
        },
        resolve,
      );
    });
    expect(editAck.ok).toBe(true);

    // Host starts game
    const startAck = await new Promise<{ ok: boolean }>((resolve) => {
      hostSock!.emit('room:startGame', { roomCode }, resolve);
    });
    expect(startAck.ok).toBe(true);

    // Wait briefly for guest state sync
    await new Promise((r) => setTimeout(r, 40));
    const latest = latestGuestStates[latestGuestStates.length - 1];
    expect(latest.phase).toBe('playing');
    expect(latest.settings.roundsCount).toBe(3);
    expect(latest.settings.roundTimeSeconds).toBe(45);
    expect(latest.currentRound?.imageId).toBe('999888777');

    // Both submit guesses -> immediate round_result
    await new Promise<{ ok: boolean }>((resolve) => {
      hostSock!.emit(
        'round:submitGuess',
        { roomCode, lat: 48.8566, lng: 2.3522 },
        resolve,
      );
    });
    await new Promise<{ ok: boolean }>((resolve) => {
      guestSock!.emit(
        'round:submitGuess',
        { roomCode, lat: 51.5072, lng: -0.1276 },
        resolve,
      );
    });

    await new Promise((r) => setTimeout(r, 40));
    const afterRound = latestGuestStates[latestGuestStates.length - 1];
    expect(afterRound.phase).toBe('round_result');
    expect(afterRound.currentRoundResult?.guesses[0].score).toBe(5000);
  });
});
