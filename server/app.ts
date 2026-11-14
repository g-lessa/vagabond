import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/types.js';
import {
  getLanUrls,
  getMapillaryToken,
  isLoopbackRequest,
  setMapillaryToken,
  tunnelManager,
  validateMapillaryToken,
} from './config.js';
import { geoCatalog } from './geoCatalog.js';
import { RoomManager } from './roomManager.js';

export interface AppInstanceOptions {
  publicPort?: number;
  serveStatic?: boolean;
  rooms?: RoomManager;
}

export function createVagabondServer(options: AppInstanceOptions = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const publicPort = options.publicPort ?? (Number(process.env.PORT) || 3000);
  const serveStatic = options.serveStatic ?? isProd;
  const manager = options.rooms ?? new RoomManager();

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/maps', (_req, res) => {
    res.json({ maps: geoCatalog.allPresets });
  });

  app.get('/api/info', (req, res) => {
    const isLocal = isLoopbackRequest(req);
    const provider = tunnelManager.getProvider();
    res.json({
      hasToken: Boolean(getMapillaryToken()),
      isLocalHost: isLocal,
      port: publicPort,
      lanUrls: isLocal ? getLanUrls(publicPort) : [],
      tunnelUrl: isLocal ? tunnelManager.getUrl() : null,
      tunnelAvailable: isLocal ? provider !== null : false,
      tunnelProvider: isLocal ? provider : null,
    });
  });

  app.post('/api/config/token', async (req, res) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({
        ok: false,
        error:
          'Only the host machine (localhost) can configure the Mapillary token.',
      });
      return;
    }

    const rawToken =
      typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!rawToken) {
      res
        .status(400)
        .json({ ok: false, error: 'Please paste a Mapillary Client Token.' });
      return;
    }

    const check = await validateMapillaryToken(rawToken);
    if (!check.valid) {
      res.status(400).json({
        ok: false,
        error: check.error ?? 'Invalid Mapillary token.',
      });
      return;
    }

    setMapillaryToken(rawToken);
    manager.broadcastTokenToAllRooms();
    res.json({ ok: true, hasToken: true });
  });

  app.post('/api/tunnel/start', async (req, res) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({
        ok: false,
        error: 'Only the host machine (localhost) can launch a tunnel.',
      });
      return;
    }
    try {
      const result = await tunnelManager.start(publicPort);
      res.json({ ok: true, url: result.url, provider: result.provider });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to start tunnel.',
      });
    }
  });

  app.post('/api/tunnel/stop', (req, res) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({ ok: false, error: 'Forbidden.' });
      return;
    }
    tunnelManager.stop();
    res.json({ ok: true });
  });

  if (serveStatic) {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
          next();
          return;
        }
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  const httpServer = http.createServer(app);
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: isProd ? undefined : { origin: true, credentials: true },
    },
  );

  manager.attachIO(io);

  io.on('connection', (socket) => {
    socket.on('room:create', ({ playerId, playerName }, ack) => {
      const { roomCode, hostSecret, state } = manager.createRoom(
        socket.id,
        playerId,
        playerName,
      );
      socket.join(roomCode);
      socket.emit('room:state', state);
      ack({
        ok: true,
        data: {
          roomCode,
          hostSecret,
          mapillaryToken: getMapillaryToken(),
        },
      });
    });

    socket.on(
      'room:join',
      ({ roomCode, playerId, playerName, hostSecret }, ack) => {
        const result = manager.joinRoom(
          socket.id,
          roomCode,
          playerId,
          playerName,
          hostSecret,
        );
        if (!result.ok || !result.state) {
          ack({ ok: false, error: result.error ?? 'Could not join room.' });
          return;
        }
        socket.join(result.state.code);
        socket.emit('room:state', result.state);
        ack({
          ok: true,
          data: {
            roomCode: result.state.code,
            mapillaryToken: getMapillaryToken(),
          },
        });
      },
    );

    socket.on('room:updateSettings', ({ roomCode, settings }, ack) => {
      const res = manager.updateSettings(socket.id, roomCode, settings);
      ack?.(res);
    });

    socket.on('room:startGame', async ({ roomCode }, ack) => {
      const res = await manager.startGame(socket.id, roomCode);
      ack?.(res);
    });

    socket.on('round:draftPin', ({ roomCode, lat, lng }) => {
      manager.setDraftPin(socket.id, roomCode, lat, lng);
    });

    socket.on('round:submitGuess', ({ roomCode, lat, lng }, ack) => {
      const res = manager.submitGuess(socket.id, roomCode, lat, lng);
      ack?.(res);
    });

    socket.on('round:next', async ({ roomCode }, ack) => {
      const res = await manager.nextRound(socket.id, roomCode);
      ack?.(res);
    });

    socket.on('room:playAgain', ({ roomCode }, ack) => {
      const res = manager.playAgain(socket.id, roomCode);
      ack?.(res);
    });

    socket.on('room:kickPlayer', ({ roomCode, targetPlayerId }, ack) => {
      const res = manager.kickPlayer(socket.id, roomCode, targetPlayerId);
      ack?.(res);
    });

    socket.on('room:sendEmoji', ({ roomCode, emoji }) => {
      manager.sendEmoji(socket.id, roomCode, emoji);
    });

    socket.on(
      'room:usePowerUp',
      ({ roomCode, powerUpId, targetPlayerId }, ack) => {
        const res = manager.usePowerUp(
          socket.id,
          roomCode,
          powerUpId,
          targetPlayerId,
        );
        ack(res);
      },
    );

    socket.on('room:leave', ({ roomCode }) => {
      socket.leave(roomCode.toUpperCase());
      manager.handleDisconnect(socket.id);
    });

    socket.on('disconnect', () => {
      manager.handleDisconnect(socket.id);
    });
  });

  return { app, httpServer, io, roomManager: manager };
}
