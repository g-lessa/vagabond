import crypto from 'node:crypto';
import type { Server as SocketIOServer } from 'socket.io';
import {
  DEFAULT_GAME_SETTINGS,
  type AckResult,
  type ClientToServerEvents,
  type ConquestEvent,
  type ConquestTerritory,
  type CustomBounds,
  type FloatingEmoji,
  type GameSettings,
  type Player,
  type PlayerGuessResult,
  type PowerUpId,
  type RoomState,
  type RoundBrief,
  type RoundResult,
  type ScavengerSnap,
  type ScavengerTarget,
  type ServerToClientEvents,
} from '../shared/types.js';
import {
  calculateGeoGuessrScore,
  haversineDistanceMeters,
} from '../shared/scoring.js';
import {
  detectBiome,
  getRandomScavengerTarget,
  getTerritoryForLocation,
} from '../shared/scavenger.js';
import { geoCatalog } from './geoCatalog.js';
import { getGoogleKey, getMapillaryToken } from './config.js';
import {
  spawnMapillaryLocation,
  type SpawnedLocation,
  type SpawnRequest,
} from './mapillarySpawner.js';
import { spawnKartaViewLocation } from './kartaviewSpawner.js';
import { spawnGoogleLocation } from './googleSpawner.js';

function createDefaultPowerUps(): Record<PowerUpId, number> {
  return {
    radar: 1,
    hemisphere: 1,
    mud: 1,
    peek: 1,
  };
}

const PLAYER_COLORS = [
  '#38bdf8',
  '#fb7185',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#f97316',
  '#2dd4bf',
  '#e879f9',
  '#facc15',
  '#60a5fa',
  '#4ade80',
  '#f43f5e',
];

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface InternalPlayer extends Player {
  socketId: string | null;
}

interface InternalGuess {
  lat: number;
  lng: number;
  submittedAtMs: number;
}

interface ActiveRoundInternal {
  roundNumber: number;
  location: SpawnedLocation;
  mapName: string;
  mapDiagonalMeters: number;
  startTimeMs: number;
  endTimeMs: number | null;
  shortenedByPlayerName: string | null;
  draftPins: Map<string, { lat: number; lng: number }>;
  lockedGuesses: Map<string, InternalGuess>;
  timerHandle: NodeJS.Timeout | null;
  scavengerTarget: ScavengerTarget | null;
  biome: string | null;
}

interface RoomInternal {
  code: string;
  hostSecret: string;
  phase: RoomState['phase'];
  settings: GameSettings;
  players: Map<string, InternalPlayer>;
  currentRound: ActiveRoundInternal | null;
  currentRoundResult: RoundResult | null;
  roundHistory: RoundResult[];
  usedImageIds: Set<string>;
  usedSequenceIds: Set<string>;
  prewarmedRound: {
    roundNumber: number;
    promise: Promise<SpawnedLocation>;
    resolved: SpawnedLocation | null;
  } | null;
  autoAdvanceHandle: NodeJS.Timeout | null;
  cleanupHandle: NodeJS.Timeout | null;
  spawningStatus: string | null;
  errorMessage: string | null;
  territories: Map<string, ConquestTerritory>;
  currentRoundSnaps: ScavengerSnap[];
}

export type LocationSpawnerFn = (
  req: SpawnRequest,
  token: string,
) => Promise<SpawnedLocation>;

export class RoomManager {
  private readonly rooms = new Map<string, RoomInternal>();
  private readonly socketToPlayer = new Map<
    string,
    { roomCode: string; playerId: string }
  >();
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null =
    null;
  private readonly spawner: LocationSpawnerFn;

  constructor(spawner: LocationSpawnerFn = spawnMapillaryLocation) {
    this.spawner = spawner;
  }

  attachIO(
    io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  ): void {
    this.io = io;
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code +=
          ROOM_CODE_ALPHABET[
            Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)
          ];
      }
      if (!this.rooms.has(code)) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private sanitizeSettings(
    current: GameSettings,
    patch: Partial<GameSettings>,
  ): GameSettings {
    const next: GameSettings = { ...current, ...patch };
    next.roundsCount = Math.max(
      1,
      Math.min(20, Math.round(Number(next.roundsCount) || 5)),
    );
    const rawTime = Math.round(Number(next.roundTimeSeconds));
    next.roundTimeSeconds =
      rawTime <= 0 ? 0 : Math.max(15, Math.min(600, rawTime));
    next.firstGuessTimerSeconds = Math.max(
      5,
      Math.min(60, Math.round(Number(next.firstGuessTimerSeconds) || 15)),
    );
    next.shortenTimerOnFirstGuess = Boolean(next.shortenTimerOnFirstGuess);
    next.only360 = Boolean(next.only360);
    next.allowMoving = Boolean(next.allowMoving);
    next.allowPanning = Boolean(next.allowPanning);
    next.allowZooming = Boolean(next.allowZooming);
    next.enablePowerUps = Boolean(next.enablePowerUps);
    next.enableScavengerHunt = Boolean(next.enableScavengerHunt ?? true);
    next.enableAmbientAudio = Boolean(next.enableAmbientAudio ?? true);
    next.targetTerritories = Math.max(
      2,
      Math.min(20, Math.round(Number(next.targetTerritories) || 5)),
    );
    next.gameMode = ['battle_royale', 'conquest'].includes(next.gameMode)
      ? next.gameMode
      : 'classic';
    next.startingHp = Math.max(
      1000,
      Math.min(30000, Math.round(Number(next.startingHp) || 10000)),
    );
    next.imageryProvider = ['mapillary', 'kartaview', 'google'].includes(
      next.imageryProvider,
    )
      ? next.imageryProvider
      : 'mapillary';
    const rawAuto = Math.round(Number(next.autoAdvanceSeconds) || 0);
    next.autoAdvanceSeconds =
      rawAuto <= 0 ? 0 : Math.max(5, Math.min(30, rawAuto));
    if (typeof next.mapId !== 'string' || next.mapId.trim() === '') {
      next.mapId = 'world';
    }
    return next;
  }

  private toPublicState(room: RoomInternal): RoomState {
    let currentRound: RoundBrief | null = null;
    if (room.currentRound && room.phase === 'playing') {
      currentRound = {
        roundNumber: room.currentRound.roundNumber,
        totalRounds: room.settings.roundsCount,
        imageId: room.currentRound.location.imageId,
        isPano: room.currentRound.location.isPano,
        compassAngle: room.currentRound.location.compassAngle,
        startTimeMs: room.currentRound.startTimeMs,
        endTimeMs: room.currentRound.endTimeMs,
        shortenedByPlayerName: room.currentRound.shortenedByPlayerName,
        mapName: room.currentRound.mapName,
        only360: room.settings.only360,
        allowMoving: room.settings.allowMoving,
        allowPanning: room.settings.allowPanning,
        allowZooming: room.settings.allowZooming,
        gameMode: room.settings.gameMode,
        enablePowerUps: room.settings.enablePowerUps,
        imageryProvider: room.settings.imageryProvider,
        photoUrl: room.currentRound.location.photoUrl ?? null,
        googleApiKey:
          room.settings.imageryProvider === 'google' ? getGoogleKey() : null,
        googlePanoId: room.currentRound.location.googlePanoId ?? null,
        scavengerTarget: room.currentRound.scavengerTarget ?? null,
        biome: room.currentRound.biome ?? null,
      };
    }

    const players: Player[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isHost: p.isHost,
      connected: p.connected,
      totalScore: p.totalScore,
      hasGuessedCurrentRound: p.hasGuessedCurrentRound,
      lastRoundScore: p.lastRoundScore,
      hp: p.hp,
      maxHp: p.maxHp,
      isEliminated: p.isEliminated,
      powerUps: p.powerUps,
      territoriesCount: p.territoriesCount ?? 0,
      hasSnappedCurrentRound: Boolean(p.hasSnappedCurrentRound),
    }));

    return {
      code: room.code,
      phase: room.phase,
      settings: room.settings,
      players,
      currentRound,
      currentRoundResult: room.currentRoundResult,
      roundHistory: room.roundHistory,
      nextRoundReady: Boolean(room.prewarmedRound?.resolved),
      spawningStatus: room.spawningStatus,
      errorMessage: room.errorMessage,
      territories: Object.fromEntries(room.territories.entries()),
    };
  }

  private broadcastRoom(room: RoomInternal): void {
    if (!this.io) return;
    this.io.to(room.code).emit('room:state', this.toPublicState(room));
  }

  broadcastTokenToAllRooms(): void {
    if (!this.io) return;
    const token = getMapillaryToken();
    for (const room of this.rooms.values()) {
      this.io.to(room.code).emit('room:token', { mapillaryToken: token });
    }
  }

  getRoomState(code: string): RoomState | null {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toPublicState(room) : null;
  }

  createRoom(
    socketId: string,
    playerId: string,
    playerName: string,
  ): { roomCode: string; hostSecret: string; state: RoomState } {
    const code = this.generateRoomCode();
    const hostSecret = crypto.randomBytes(16).toString('hex');
    const cleanName = playerName.trim().slice(0, 24) || 'Host';

    const room: RoomInternal = {
      code,
      hostSecret,
      phase: 'lobby',
      settings: { ...DEFAULT_GAME_SETTINGS },
      players: new Map(),
      currentRound: null,
      currentRoundResult: null,
      roundHistory: [],
      usedImageIds: new Set(),
      usedSequenceIds: new Set(),
      prewarmedRound: null,
      autoAdvanceHandle: null,
      cleanupHandle: null,
      spawningStatus: null,
      errorMessage: null,
      territories: new Map(),
      currentRoundSnaps: [],
    };

    room.players.set(playerId, {
      id: playerId,
      name: cleanName,
      color: PLAYER_COLORS[0],
      isHost: true,
      connected: true,
      totalScore: 0,
      hasGuessedCurrentRound: false,
      lastRoundScore: null,
      hp: room.settings.startingHp,
      maxHp: room.settings.startingHp,
      isEliminated: false,
      powerUps: createDefaultPowerUps(),
      territoriesCount: 0,
      hasSnappedCurrentRound: false,
      socketId,
    });

    this.rooms.set(code, room);
    this.socketToPlayer.set(socketId, { roomCode: code, playerId });
    return { roomCode: code, hostSecret, state: this.toPublicState(room) };
  }

  joinRoom(
    socketId: string,
    rawCode: string,
    playerId: string,
    playerName: string,
    hostSecret?: string,
  ): { ok: boolean; error?: string; state?: RoomState } {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: `Room "${code}" was not found.` };
    }

    if (room.cleanupHandle) {
      clearTimeout(room.cleanupHandle);
      room.cleanupHandle = null;
    }

    const cleanName = playerName.trim().slice(0, 24) || 'Traveler';
    const existing = room.players.get(playerId);

    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      if (cleanName) existing.name = cleanName;
      if (hostSecret && hostSecret === room.hostSecret) {
        existing.isHost = true;
      }
    } else {
      const color =
        PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
      const isHost = Boolean(hostSecret && hostSecret === room.hostSecret);
      room.players.set(playerId, {
        id: playerId,
        name: cleanName,
        color,
        isHost,
        connected: true,
        totalScore: 0,
        hasGuessedCurrentRound: false,
        lastRoundScore: null,
        hp: room.settings.startingHp,
        maxHp: room.settings.startingHp,
        isEliminated: false,
        powerUps: createDefaultPowerUps(),
        territoriesCount: 0,
        hasSnappedCurrentRound: false,
        socketId,
      });
    }

    this.socketToPlayer.set(socketId, { roomCode: code, playerId });
    this.broadcastRoom(room);
    return { ok: true, state: this.toPublicState(room) };
  }

  updateSettings(
    socketId: string,
    roomCode: string,
    patch: Partial<GameSettings>,
  ): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };

    const sender = this.findPlayerBySocket(room, socketId);
    if (!sender?.isHost) {
      return { ok: false, error: 'Only the host can edit game settings.' };
    }
    if (room.phase !== 'lobby') {
      return {
        ok: false,
        error: 'Settings can only be edited in the lobby.',
      };
    }

    const prevMap = room.settings.mapId;
    const prevPano = room.settings.only360;
    const prevBounds = JSON.stringify(room.settings.customBounds ?? null);

    room.settings = this.sanitizeSettings(room.settings, patch);

    if (
      prevMap !== room.settings.mapId ||
      prevPano !== room.settings.only360 ||
      prevBounds !== JSON.stringify(room.settings.customBounds ?? null)
    ) {
      room.prewarmedRound = null;
    }

    room.errorMessage = null;
    this.broadcastRoom(room);
    return { ok: true };
  }

  async startGame(
    socketId: string,
    roomCode: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };

    const sender = this.findPlayerBySocket(room, socketId);
    if (!sender?.isHost) {
      return { ok: false, error: 'Only the host can start the match.' };
    }

    const provider = room.settings.imageryProvider;
    if (provider === 'mapillary') {
      const token = getMapillaryToken();
      if (!token) {
        return {
          ok: false,
          error: 'Configure your Mapillary Client Token before starting.',
        };
      }
    } else if (provider === 'google') {
      const gKey = getGoogleKey();
      if (!gKey) {
        return {
          ok: false,
          error:
            'Configure your Google Maps API Key before starting Google Street View.',
        };
      }
    }

    this.clearTimers(room);
    room.roundHistory = [];
    room.currentRoundResult = null;
    room.currentRound = null;
    room.usedImageIds.clear();
    room.usedSequenceIds.clear();
    room.prewarmedRound = null;
    room.errorMessage = null;
    room.territories.clear();
    room.currentRoundSnaps = [];

    for (const player of room.players.values()) {
      player.totalScore = 0;
      player.hasGuessedCurrentRound = false;
      player.lastRoundScore = null;
      player.hp = room.settings.startingHp;
      player.maxHp = room.settings.startingHp;
      player.isEliminated = false;
      player.powerUps = createDefaultPowerUps();
      player.territoriesCount = 0;
      player.hasSnappedCurrentRound = false;
    }

    return await this.launchRound(room, 1);
  }

  async nextRound(
    socketId: string,
    roomCode: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };

    const sender = this.findPlayerBySocket(room, socketId);
    if (!sender?.isHost) {
      return { ok: false, error: 'Only the host can advance rounds.' };
    }
    if (room.phase !== 'round_result') {
      return { ok: false, error: 'Cannot advance from the current phase.' };
    }

    if (room.autoAdvanceHandle) {
      clearTimeout(room.autoAdvanceHandle);
      room.autoAdvanceHandle = null;
    }

    const finishedRoundNumber = room.roundHistory.length;
    const isBattleRoyale = room.settings.gameMode === 'battle_royale';
    const isConquest = room.settings.gameMode === 'conquest';
    const connectedPlayers = Array.from(room.players.values()).filter(
      (p) => p.connected,
    );
    const alivePlayers = connectedPlayers.filter((p) => !p.isEliminated);
    const brDecided =
      isBattleRoyale && connectedPlayers.length > 1 && alivePlayers.length <= 1;

    const conquestWinner = isConquest
      ? Array.from(room.players.values()).find(
          (p) => p.territoriesCount >= (room.settings.targetTerritories || 5),
        )
      : undefined;

    if (
      finishedRoundNumber >= room.settings.roundsCount ||
      brDecided ||
      Boolean(conquestWinner)
    ) {
      room.phase = 'game_over';
      room.currentRound = null;
      this.broadcastRoom(room);
      return { ok: true };
    }

    return await this.launchRound(room, finishedRoundNumber + 1);
  }

  playAgain(
    socketId: string,
    roomCode: string,
  ): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    const sender = this.findPlayerBySocket(room, socketId);
    if (!sender?.isHost) {
      return { ok: false, error: 'Only the host can reset to the lobby.' };
    }

    this.clearTimers(room);
    room.phase = 'lobby';
    room.currentRound = null;
    room.currentRoundResult = null;
    room.roundHistory = [];
    room.prewarmedRound = null;
    room.spawningStatus = null;
    room.errorMessage = null;
    room.territories.clear();
    room.currentRoundSnaps = [];
    for (const player of room.players.values()) {
      player.totalScore = 0;
      player.hasGuessedCurrentRound = false;
      player.lastRoundScore = null;
      player.hp = room.settings.startingHp;
      player.maxHp = room.settings.startingHp;
      player.isEliminated = false;
      player.powerUps = createDefaultPowerUps();
      player.territoriesCount = 0;
      player.hasSnappedCurrentRound = false;
    }
    this.broadcastRoom(room);
    return { ok: true };
  }

  terminateGame(
    socketId: string,
    roomCode: string,
  ): { ok: boolean; error?: string } {
    return this.playAgain(socketId, roomCode);
  }

  kickPlayer(
    socketId: string,
    roomCode: string,
    targetPlayerId: string,
  ): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    const sender = this.findPlayerBySocket(room, socketId);
    if (!sender?.isHost) {
      return { ok: false, error: 'Only the host can remove players.' };
    }
    const target = room.players.get(targetPlayerId);
    if (!target || target.isHost) {
      return { ok: false, error: 'Cannot remove that player.' };
    }
    if (target.socketId && this.io) {
      this.io
        .to(target.socketId)
        .emit('room:kicked', { reason: 'Removed from room by host.' });
      const sock = this.io.sockets.sockets.get(target.socketId);
      sock?.leave(room.code);
      this.socketToPlayer.delete(target.socketId);
    }
    room.players.delete(targetPlayerId);
    this.broadcastRoom(room);
    this.maybeFinishRoundEarly(room);
    return { ok: true };
  }

  setDraftPin(
    socketId: string,
    roomCode: string,
    lat: number,
    lng: number,
  ): void {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room || room.phase !== 'playing' || !room.currentRound) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const player = this.findPlayerBySocket(room, socketId);
    if (!player || player.hasGuessedCurrentRound) return;

    room.currentRound.draftPins.set(player.id, { lat, lng });
  }

  submitGuess(
    socketId: string,
    roomCode: string,
    lat: number,
    lng: number,
  ): { ok: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room || room.phase !== 'playing' || !room.currentRound) {
      return { ok: false, error: 'No active round.' };
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: 'Invalid coordinates.' };
    }
    const player = this.findPlayerBySocket(room, socketId);
    if (!player) {
      return { ok: false, error: 'Player not in room.' };
    }
    if (player.hasGuessedCurrentRound) {
      return { ok: true };
    }

    const now = Date.now();
    const isFirstGuess = room.currentRound.lockedGuesses.size === 0;
    room.currentRound.lockedGuesses.set(player.id, {
      lat,
      lng,
      submittedAtMs: now,
    });
    player.hasGuessedCurrentRound = true;

    // GeoGuessr timer pressure: shorten remaining time after the first guess
    if (isFirstGuess && room.settings.shortenTimerOnFirstGuess) {
      const targetEndMs = now + room.settings.firstGuessTimerSeconds * 1000;
      const shouldShorten =
        room.currentRound.endTimeMs === null ||
        room.currentRound.endTimeMs > targetEndMs;
      if (shouldShorten) {
        room.currentRound.endTimeMs = targetEndMs;
        room.currentRound.shortenedByPlayerName = player.name;
        this.scheduleRoundTimeout(room, targetEndMs);
        this.io?.to(room.code).emit('room:timerShortened', {
          endTimeMs: targetEndMs,
          triggeredBy: player.name,
          secondsLeft: room.settings.firstGuessTimerSeconds,
        });
      }
    }

    const everyoneGuessed = this.haveAllConnectedPlayersGuessed(room);
    if (everyoneGuessed) {
      this.finishRound(room);
    } else {
      this.broadcastRoom(room);
    }
    return { ok: true };
  }

  submitSnap(
    socketId: string,
    roomCode: string,
    dataUrl: string,
  ): AckResult<{ bonusPoints?: number; bonusHp?: number }> {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room || room.phase !== 'playing' || !room.currentRound) {
      return { ok: false, error: 'No active round.' };
    }
    const player = this.findPlayerBySocket(room, socketId);
    if (!player) return { ok: false, error: 'Player not found.' };
    if (player.hasSnappedCurrentRound) {
      return { ok: false, error: 'Already submitted a snap this round.' };
    }

    const target = room.currentRound.scavengerTarget;
    const bonus = target?.bonusPoints ?? 350;

    player.hasSnappedCurrentRound = true;
    let bonusHp: number | undefined;

    if (room.settings.gameMode === 'battle_royale') {
      player.hp = Math.min(player.maxHp, player.hp + 1000);
      bonusHp = 1000;
    } else {
      player.totalScore += bonus;
      player.lastRoundScore = (player.lastRoundScore ?? 0) + bonus;
    }

    room.currentRoundSnaps.push({
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      dataUrl,
      timestamp: Date.now(),
    });

    this.broadcastRoom(room);
    return { ok: true, data: { bonusPoints: bonus, bonusHp } };
  }

  sendEmoji(socketId: string, roomCode: string, emoji: string): void {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return;
    const player = this.findPlayerBySocket(room, socketId);
    if (!player) return;

    const cleanEmoji = emoji.slice(0, 4);
    const item: FloatingEmoji = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      emoji: cleanEmoji,
      timestamp: Date.now(),
    };

    if (this.io) {
      this.io.to(room.code).emit('room:emoji', item);
    }
  }

  usePowerUp(
    socketId: string,
    roomCode: string,
    powerUpId: PowerUpId,
    targetPlayerId?: string,
  ): AckResult<{
    clue?: string;
    opponentPins?: Array<{
      lat: number;
      lng: number;
      color: string;
      name: string;
    }>;
    radarBox?: CustomBounds;
  }> {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room || room.phase !== 'playing' || !room.currentRound) {
      return { ok: false, error: 'No active round.' };
    }
    const player = this.findPlayerBySocket(room, socketId);
    if (!player) return { ok: false, error: 'Player not in room.' };

    if (!room.settings.enablePowerUps) {
      return { ok: false, error: 'Power-ups are disabled in this match.' };
    }

    const remaining = player.powerUps[powerUpId] ?? 0;
    if (remaining <= 0) {
      return {
        ok: false,
        error: `You already used your ${powerUpId} power-up!`,
      };
    }

    player.powerUps[powerUpId] = remaining - 1;

    const loc = room.currentRound.location;
    const data: {
      clue?: string;
      opponentPins?: Array<{
        lat: number;
        lng: number;
        color: string;
        name: string;
      }>;
      radarBox?: CustomBounds;
    } = {};

    if (powerUpId === 'radar') {
      const latSpan = 30;
      const lngSpan = 50;
      const offsetLat = (Math.random() - 0.5) * 12;
      const offsetLng = (Math.random() - 0.5) * 18;
      data.radarBox = {
        north: Math.min(85, loc.lat + latSpan / 2 + offsetLat),
        south: Math.max(-60, loc.lat - latSpan / 2 + offsetLat),
        east: Math.min(180, loc.lng + lngSpan / 2 + offsetLng),
        west: Math.max(-180, loc.lng - lngSpan / 2 + offsetLng),
      };
    } else if (powerUpId === 'hemisphere') {
      const ns = loc.lat >= 0 ? 'Northern' : 'Southern';
      const ew = loc.lng >= 0 ? 'Eastern' : 'Western';
      const countryHint = loc.countryName
        ? ` · Near ${loc.countryName}`
        : '';
      data.clue = `${ns} & ${ew} Hemispheres${countryHint}`;
    } else if (powerUpId === 'peek') {
      const pins: Array<{
        lat: number;
        lng: number;
        color: string;
        name: string;
      }> = [];
      for (const [id, pin] of room.currentRound.draftPins.entries()) {
        if (id !== player.id) {
          const other = room.players.get(id);
          if (other) {
            pins.push({
              lat: pin.lat,
              lng: pin.lng,
              color: other.color,
              name: other.name,
            });
          }
        }
      }
      for (const [id, guess] of room.currentRound.lockedGuesses.entries()) {
        if (id !== player.id) {
          const other = room.players.get(id);
          if (other && !pins.some((p) => p.name === other.name)) {
            pins.push({
              lat: guess.lat,
              lng: guess.lng,
              color: other.color,
              name: other.name,
            });
          }
        }
      }
      data.opponentPins = pins;
    } else if (powerUpId === 'mud') {
      if (this.io) {
        for (const other of room.players.values()) {
          if (other.id !== player.id && other.socketId) {
            this.io.to(other.socketId).emit('room:sabotaged', {
              byPlayerName: player.name,
              durationMs: 6000,
            });
          }
        }
      }
    }

    if (this.io) {
      this.io.to(room.code).emit('room:powerUpUsed', {
        sourcePlayerId: player.id,
        sourcePlayerName: player.name,
        powerUpId,
        targetPlayerId,
      });
    }
    this.broadcastRoom(room);

    return { ok: true, data };
  }

  handleDisconnect(socketId: string): void {
    const binding = this.socketToPlayer.get(socketId);
    if (!binding) return;
    this.socketToPlayer.delete(socketId);

    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    const player = room.players.get(binding.playerId);
    if (!player || player.socketId !== socketId) return;

    player.connected = false;
    player.socketId = null;

    this.broadcastRoom(room);
    this.maybeFinishRoundEarly(room);

    const anyConnected = Array.from(room.players.values()).some(
      (p) => p.connected,
    );
    if (!anyConnected) {
      room.cleanupHandle = setTimeout(() => {
        this.clearTimers(room);
        this.rooms.delete(room.code);
      }, 15 * 60 * 1000);
    }
  }

  private findPlayerBySocket(
    room: RoomInternal,
    socketId: string,
  ): InternalPlayer | undefined {
    const binding = this.socketToPlayer.get(socketId);
    if (binding && binding.roomCode === room.code) {
      return room.players.get(binding.playerId);
    }
    for (const p of room.players.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }

  private haveAllConnectedPlayersGuessed(room: RoomInternal): boolean {
    const connected = Array.from(room.players.values()).filter(
      (p) => p.connected,
    );
    return (
      connected.length > 0 &&
      connected.every((p) => p.hasGuessedCurrentRound)
    );
  }

  private maybeFinishRoundEarly(room: RoomInternal): void {
    if (room.phase === 'playing' && this.haveAllConnectedPlayersGuessed(room)) {
      this.finishRound(room);
    }
  }

  private async launchRound(
    room: RoomInternal,
    roundNumber: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const provider = room.settings.imageryProvider;
    const token = getMapillaryToken() ?? '';
    const googleKey = getGoogleKey() ?? '';

    if (provider === 'mapillary' && !token) {
      return { ok: false, error: 'Missing Mapillary access token.' };
    }
    if (provider === 'google' && !googleKey) {
      return { ok: false, error: 'Missing Google Maps API key.' };
    }

    room.spawningStatus = `Scouting Round ${roundNumber} (${provider === 'kartaview' ? 'KartaView' : provider === 'google' ? 'Google' : 'Mapillary'})…`;
    room.errorMessage = null;
    this.broadcastRoom(room);

    try {
      let location: SpawnedLocation;
      if (room.prewarmedRound?.roundNumber === roundNumber) {
        location =
          room.prewarmedRound.resolved ?? (await room.prewarmedRound.promise);
      } else {
        const req: SpawnRequest = {
          mapId: room.settings.mapId,
          customBounds: room.settings.customBounds,
          only360: room.settings.only360,
          excludeImageIds: room.usedImageIds,
          excludeSequenceIds: room.usedSequenceIds,
        };
        if (provider === 'kartaview') {
          location = await spawnKartaViewLocation(req);
        } else if (provider === 'google') {
          location = await spawnGoogleLocation(req, googleKey);
        } else {
          location = await this.spawner(req, token);
        }
      }
      room.prewarmedRound = null;

      room.usedImageIds.add(location.imageId);
      if (location.sequenceId) {
        room.usedSequenceIds.add(location.sequenceId);
      }

      const targetMeta = geoCatalog.getMapTarget(
        room.settings.mapId,
        room.settings.customBounds,
      );

      const startTimeMs = Date.now();
      const endTimeMs =
        room.settings.roundTimeSeconds > 0
          ? startTimeMs + room.settings.roundTimeSeconds * 1000
          : null;

      for (const player of room.players.values()) {
        player.hasGuessedCurrentRound = false;
        player.hasSnappedCurrentRound = false;
      }
      room.currentRoundSnaps = [];

      const scavengerTarget = room.settings.enableScavengerHunt
        ? getRandomScavengerTarget()
        : null;
      const biome = detectBiome(
        location.lat,
        location.lng,
        location.countryName,
      );

      room.currentRound = {
        roundNumber,
        location,
        mapName: targetMeta.name,
        mapDiagonalMeters: targetMeta.diagonalMeters,
        startTimeMs,
        endTimeMs,
        shortenedByPlayerName: null,
        draftPins: new Map(),
        lockedGuesses: new Map(),
        timerHandle: null,
        scavengerTarget,
        biome,
      };
      room.currentRoundResult = null;
      room.phase = 'playing';
      room.spawningStatus = null;

      if (endTimeMs !== null) {
        this.scheduleRoundTimeout(room, endTimeMs);
      }

      if (token) {
        this.io?.to(room.code).emit('room:token', { mapillaryToken: token });
      }
      this.broadcastRoom(room);

      // Background pre-warm for the next round
      if (roundNumber < room.settings.roundsCount) {
        this.prewarmNextRound(room, roundNumber + 1);
      }

      return { ok: true };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `Failed to load ${provider} round.`;
      room.spawningStatus = null;
      room.errorMessage = msg;
      this.broadcastRoom(room);
      return { ok: false, error: msg };
    }
  }

  private prewarmNextRound(
    room: RoomInternal,
    nextRoundNumber: number,
  ): void {
    const excludeImgs = new Set(room.usedImageIds);
    const excludeSeqs = new Set(room.usedSequenceIds);
    const provider = room.settings.imageryProvider;
    const token = getMapillaryToken() ?? '';
    const googleKey = getGoogleKey() ?? '';

    const req: SpawnRequest = {
      mapId: room.settings.mapId,
      customBounds: room.settings.customBounds,
      only360: room.settings.only360,
      excludeImageIds: excludeImgs,
      excludeSequenceIds: excludeSeqs,
    };

    const promise =
      provider === 'kartaview'
        ? spawnKartaViewLocation(req)
        : provider === 'google'
          ? spawnGoogleLocation(req, googleKey)
          : this.spawner(req, token);

    const entry: RoomInternal['prewarmedRound'] = {
      roundNumber: nextRoundNumber,
      promise,
      resolved: null,
    };
    room.prewarmedRound = entry;

    promise
      .then((loc) => {
        if (room.prewarmedRound === entry) {
          entry.resolved = loc;
          this.broadcastRoom(room);
        }
      })
      .catch(() => {
        if (room.prewarmedRound === entry) {
          room.prewarmedRound = null;
        }
      });
  }

  private scheduleRoundTimeout(room: RoomInternal, endTimeMs: number): void {
    if (!room.currentRound) return;
    if (room.currentRound.timerHandle) {
      clearTimeout(room.currentRound.timerHandle);
    }
    const delay = Math.max(0, endTimeMs - Date.now());
    room.currentRound.timerHandle = setTimeout(() => {
      if (room.phase === 'playing') {
        this.finishRound(room);
      }
    }, delay);
  }

  private finishRound(room: RoomInternal): void {
    const round = room.currentRound;
    if (!round || room.phase !== 'playing') return;

    if (round.timerHandle) {
      clearTimeout(round.timerHandle);
      round.timerHandle = null;
    }

    const { lat: actualLat, lng: actualLng } = round.location;
    const guesses: PlayerGuessResult[] = [];
    const isBattleRoyale = room.settings.gameMode === 'battle_royale';

    let minDistanceMeters = Infinity;
    for (const player of room.players.values()) {
      if (player.isEliminated) continue;
      const locked = round.lockedGuesses.get(player.id);
      const draft = round.draftPins.get(player.id);
      const chosen = locked ?? draft ?? null;
      if (chosen) {
        const d = haversineDistanceMeters(
          actualLat,
          actualLng,
          chosen.lat,
          chosen.lng,
        );
        if (d < minDistanceMeters) {
          minDistanceMeters = d;
        }
      }
    }
    const bestDistanceMeters = Number.isFinite(minDistanceMeters)
      ? minDistanceMeters
      : 0;

    for (const player of room.players.values()) {
      const locked = round.lockedGuesses.get(player.id);
      const draft = round.draftPins.get(player.id);
      const chosen = locked ?? draft ?? null;

      let distanceMeters: number | null = null;
      let score = 0;
      let timeTakenMs: number | null = null;
      let timedOut = false;
      let damageTaken = 0;

      if (chosen) {
        distanceMeters = haversineDistanceMeters(
          actualLat,
          actualLng,
          chosen.lat,
          chosen.lng,
        );
        score = calculateGeoGuessrScore(
          distanceMeters,
          round.mapDiagonalMeters,
        );
        if (locked) {
          timeTakenMs = Math.max(0, locked.submittedAtMs - round.startTimeMs);
        } else if (round.endTimeMs) {
          timeTakenMs = Math.max(0, round.endTimeMs - round.startTimeMs);
        }
      } else {
        timedOut = true;
      }

      if (isBattleRoyale) {
        if (!player.isEliminated) {
          if (distanceMeters !== null) {
            const diffKm = Math.max(
              0,
              (distanceMeters - bestDistanceMeters) / 1000,
            );
            damageTaken = Math.min(player.hp, Math.round(diffKm * 2.5));
          } else {
            damageTaken = Math.min(player.hp, 4000);
          }
          player.hp = Math.max(0, player.hp - damageTaken);
          player.isEliminated = player.hp <= 0;
        }
      }

      player.totalScore += score;
      player.lastRoundScore = score;

      guesses.push({
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        lat: chosen ? chosen.lat : null,
        lng: chosen ? chosen.lng : null,
        distanceMeters,
        score,
        totalScore: player.totalScore,
        timeTakenMs,
        timedOut,
        damageTaken,
        remainingHp: player.hp,
        isEliminated: player.isEliminated,
        hasSnap: Boolean(player.hasSnappedCurrentRound),
        snapBonus: player.hasSnappedCurrentRound
          ? round.scavengerTarget?.bonusPoints
          : undefined,
      });
    }

    guesses.sort((a, b) => {
      if (isBattleRoyale) {
        return (
          (b.remainingHp ?? 0) - (a.remainingHp ?? 0) ||
          b.score - a.score ||
          (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)
        );
      }
      return (
        b.score - a.score ||
        (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)
      );
    });

    // Handle Conquest Mode Territory Capture
    let conquestEvent: ConquestEvent | null = null;
    if (room.settings.gameMode === 'conquest') {
      const winnerGuess = guesses.find((g) => g.distanceMeters !== null);
      if (winnerGuess) {
        const territory = getTerritoryForLocation(
          round.location.lng,
          round.location.lat,
          round.location.countryName,
        );
        const existing = room.territories.get(territory.id);
        const isStolen = Boolean(
          existing && existing.ownerId !== winnerGuess.playerId,
        );
        const previousOwnerName = existing?.ownerName;

        room.territories.set(territory.id, {
          id: territory.id,
          name: territory.name,
          color: winnerGuess.playerColor,
          ownerId: winnerGuess.playerId,
          ownerName: winnerGuess.playerName,
          conqueredRound: round.roundNumber,
        });

        for (const p of room.players.values()) {
          p.territoriesCount = Array.from(room.territories.values()).filter(
            (t) => t.ownerId === p.id,
          ).length;
        }

        conquestEvent = {
          territoryId: territory.id,
          territoryName: territory.name,
          winnerId: winnerGuess.playerId,
          winnerName: winnerGuess.playerName,
          winnerColor: winnerGuess.playerColor,
          isStolen,
          previousOwnerName,
        };
      }
    }

    const result: RoundResult = {
      roundNumber: round.roundNumber,
      totalRounds: room.settings.roundsCount,
      actual: {
        lat: round.location.lat,
        lng: round.location.lng,
        imageId: round.location.imageId,
        isPano: round.location.isPano,
        countryName: round.location.countryName,
        capturedAtYear: round.location.capturedAtYear,
      },
      mapDiagonalMeters: round.mapDiagonalMeters,
      guesses,
      conquestEvent,
      snaps: [...room.currentRoundSnaps],
    };

    room.currentRoundResult = result;
    room.roundHistory.push(result);
    room.phase = 'round_result';

    if (
      room.settings.autoAdvanceSeconds > 0 &&
      round.roundNumber < room.settings.roundsCount
    ) {
      room.autoAdvanceHandle = setTimeout(() => {
        if (room.phase === 'round_result') {
          void this.launchRound(room, round.roundNumber + 1);
        }
      }, room.settings.autoAdvanceSeconds * 1000);
    }

    this.broadcastRoom(room);
  }

  private clearTimers(room: RoomInternal): void {
    if (room.currentRound?.timerHandle) {
      clearTimeout(room.currentRound.timerHandle);
      room.currentRound.timerHandle = null;
    }
    if (room.autoAdvanceHandle) {
      clearTimeout(room.autoAdvanceHandle);
      room.autoAdvanceHandle = null;
    }
    if (room.cleanupHandle) {
      clearTimeout(room.cleanupHandle);
      room.cleanupHandle = null;
    }
  }
}

export const roomManager = new RoomManager();
