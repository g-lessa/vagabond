import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  CustomBounds,
  FloatingEmoji,
  GameSettings,
  MapPreset,
  PowerUpId,
  RoomState,
  ServerPublicInfo,
  ServerToClientEvents,
} from '@shared/types';
import { CURATED_MAP_PRESETS } from '@shared/maps';
import {
  getOrCreatePlayerId,
  getRoomCodeFromUrl,
  getSavedHostSecret,
  getSavedPlayerName,
  saveHostSecret,
  setRoomCodeInUrl,
} from '../lib/identity';

const ACTIVE_ROOM_KEY = 'vagabond_active_room';

export interface ServerInfoClient extends ServerPublicInfo {
  isLocalHost: boolean;
}

export interface ShortenedNotice {
  triggeredBy: string;
  secondsLeft: number;
  id: number;
}

export function useVagabondClient() {
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mapillaryToken, setMapillaryToken] = useState<string | null>(null);
  const [maps, setMaps] = useState<MapPreset[]>(CURATED_MAP_PRESETS);
  const [serverInfo, setServerInfo] = useState<ServerInfoClient>({
    hasToken: false,
    hasGoogleKey: false,
    isLocalHost: false,
    lanUrls: [],
    port: 3000,
    tunnelUrl: null,
    tunnelAvailable: false,
    tunnelProvider: null,
  });
  const [shortenedNotice, setShortenedNotice] =
    useState<ShortenedNotice | null>(null);
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [sabotagedUntil, setSabotagedUntil] = useState<number | null>(null);
  const [sabotageBy, setSabotageBy] = useState<string | null>(null);
  const [powerUpNotice, setPowerUpNotice] = useState<{
    id: number;
    message: string;
  } | null>(null);

  const refreshServerInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = (await res.json()) as ServerInfoClient;
        setServerInfo(data);
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    void refreshServerInfo();
    void (async () => {
      try {
        const res = await fetch('/api/maps');
        if (res.ok) {
          const data = (await res.json()) as { maps?: MapPreset[] };
          if (data.maps && data.maps.length > 0) {
            setMaps(data.maps);
          }
        }
      } catch {
        // fallback to curated presets
      }
    })();
  }, [refreshServerInfo]);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      void refreshServerInfo();
      const activeCode = sessionStorage.getItem(ACTIVE_ROOM_KEY);
      const urlCode = getRoomCodeFromUrl();
      const savedName = getSavedPlayerName().trim();
      const codeToRejoin = activeCode || urlCode;
      if (activeCode && codeToRejoin && savedName) {
        const hostSecret = getSavedHostSecret(codeToRejoin);
        socket.emit(
          'room:join',
          { roomCode: codeToRejoin, playerId, playerName: savedName, hostSecret },
          (res) => {
            if (res.ok && res.data) {
              setMapillaryToken(res.data.mapillaryToken);
            } else {
              sessionStorage.removeItem(ACTIVE_ROOM_KEY);
            }
          },
        );
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('room:state', (state) => {
      setRoomState(state);
    });

    socket.on('room:token', ({ mapillaryToken: tok }) => {
      setMapillaryToken(tok);
      void refreshServerInfo();
    });

    socket.on('room:timerShortened', ({ triggeredBy, secondsLeft }) => {
      setShortenedNotice({
        triggeredBy,
        secondsLeft,
        id: Date.now(),
      });
    });

    socket.on('room:kicked', ({ reason }) => {
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
      setRoomState(null);
      setRoomCodeInUrl(null);
      setKickedReason(reason);
    });

    socket.on('room:emoji', (emoji) => {
      setFloatingEmojis((prev) => [...prev.slice(-15), emoji]);
      setTimeout(() => {
        setFloatingEmojis((prev) => prev.filter((e) => e.id !== emoji.id));
      }, 4000);
    });

    socket.on('room:powerUpUsed', ({ sourcePlayerName, powerUpId }) => {
      const labels: Record<string, string> = {
        radar: '🥽 50/50 Radar',
        hemisphere: '🧭 Hemisphere Clue',
        mud: '💨 Mud Splatter',
        peek: '🕵️ Pin Peek',
      };
      setPowerUpNotice({
        id: Date.now(),
        message: `${sourcePlayerName} activated ${labels[powerUpId] ?? powerUpId}!`,
      });
      setTimeout(() => setPowerUpNotice(null), 4500);
    });

    socket.on('room:sabotaged', ({ byPlayerName, durationMs }) => {
      setSabotageBy(byPlayerName);
      setSabotagedUntil(Date.now() + durationMs);
      setTimeout(() => {
        setSabotagedUntil((cur) => (cur && cur <= Date.now() ? null : cur));
        setSabotageBy(null);
      }, durationMs);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [playerId, refreshServerInfo]);

  const createRoom = useCallback(
    (playerName: string): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock) {
          resolve({ ok: false, error: 'Not connected to server.' });
          return;
        }
        setKickedReason(null);
        sock.emit('room:create', { playerId, playerName }, (res) => {
          if (res.ok && res.data) {
            saveHostSecret(res.data.roomCode, res.data.hostSecret);
            sessionStorage.setItem(ACTIVE_ROOM_KEY, res.data.roomCode);
            setMapillaryToken(res.data.mapillaryToken);
            setRoomCodeInUrl(res.data.roomCode);
            resolve({ ok: true });
          } else {
            resolve({ ok: false, error: res.error ?? 'Could not create room.' });
          }
        });
      });
    },
    [playerId],
  );

  const joinRoom = useCallback(
    (
      roomCode: string,
      playerName: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock) {
          resolve({ ok: false, error: 'Not connected to server.' });
          return;
        }
        setKickedReason(null);
        const cleanCode = roomCode.trim().toUpperCase();
        const hostSecret = getSavedHostSecret(cleanCode);
        sock.emit(
          'room:join',
          { roomCode: cleanCode, playerId, playerName, hostSecret },
          (res) => {
            if (res.ok && res.data) {
              sessionStorage.setItem(ACTIVE_ROOM_KEY, res.data.roomCode);
              setMapillaryToken(res.data.mapillaryToken);
              setRoomCodeInUrl(res.data.roomCode);
              resolve({ ok: true });
            } else {
              resolve({ ok: false, error: res.error ?? 'Could not join room.' });
            }
          },
        );
      });
    },
    [playerId],
  );

  const updateSettings = useCallback(
    (patch: Partial<GameSettings>): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock || !roomState) {
          resolve({ ok: false, error: 'Not in a room.' });
          return;
        }
        sock.emit(
          'room:updateSettings',
          { roomCode: roomState.code, settings: patch },
          (res) => resolve(res ?? { ok: true }),
        );
      });
    },
    [roomState],
  );

  const startGame = useCallback((): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const sock = socketRef.current;
      if (!sock || !roomState) {
        resolve({ ok: false, error: 'Not in a room.' });
        return;
      }
      sock.emit('room:startGame', { roomCode: roomState.code }, (res) =>
        resolve(res ?? { ok: true }),
      );
    });
  }, [roomState]);

  const sendDraftPin = useCallback(
    (lat: number, lng: number) => {
      if (!socketRef.current || !roomState) return;
      socketRef.current.emit('round:draftPin', {
        roomCode: roomState.code,
        lat,
        lng,
      });
    },
    [roomState],
  );

  const submitGuess = useCallback(
    (lat: number, lng: number): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock || !roomState) {
          resolve({ ok: false, error: 'Not in a room.' });
          return;
        }
        sock.emit(
          'round:submitGuess',
          { roomCode: roomState.code, lat, lng },
          (res) => resolve(res ?? { ok: true }),
        );
      });
    },
    [roomState],
  );

  const submitSnap = useCallback(
    (dataUrl: string): Promise<{ ok: boolean; error?: string; bonusPoints?: number; bonusHp?: number }> => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock || !roomState) {
          resolve({ ok: false, error: 'Not in a room.' });
          return;
        }
        sock.emit(
          'round:submitSnap',
          { roomCode: roomState.code, dataUrl },
          (res) => resolve(res ? { ok: res.ok, error: res.error, ...res.data } : { ok: true }),
        );
      });
    },
    [roomState],
  );

  const nextRound = useCallback((): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const sock = socketRef.current;
      if (!sock || !roomState) {
        resolve({ ok: false, error: 'Not in a room.' });
        return;
      }
      sock.emit('round:next', { roomCode: roomState.code }, (res) =>
        resolve(res ?? { ok: true }),
      );
    });
  }, [roomState]);

  const playAgain = useCallback((): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const sock = socketRef.current;
      if (!sock || !roomState) {
        resolve({ ok: false, error: 'Not in a room.' });
        return;
      }
      sock.emit('room:playAgain', { roomCode: roomState.code }, (res) =>
        resolve(res ?? { ok: true }),
      );
    });
  }, [roomState]);

  const terminateGame = useCallback((): Promise<{ ok: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const sock = socketRef.current;
      if (!sock || !roomState) {
        resolve({ ok: false, error: 'Not in a room.' });
        return;
      }
      sock.emit('room:terminateGame', { roomCode: roomState.code }, (res) =>
        resolve(res ?? { ok: true }),
      );
    });
  }, [roomState]);

  const kickPlayer = useCallback(
    (targetPlayerId: string) => {
      if (!socketRef.current || !roomState) return;
      socketRef.current.emit('room:kickPlayer', {
        roomCode: roomState.code,
        targetPlayerId,
      });
    },
    [roomState],
  );

  const sendEmoji = useCallback(
    (emoji: string) => {
      if (!socketRef.current || !roomState) return;
      socketRef.current.emit('room:sendEmoji', {
        roomCode: roomState.code,
        emoji,
      });
    },
    [roomState],
  );

  const usePowerUp = useCallback(
    (
      powerUpId: PowerUpId,
      targetPlayerId?: string,
    ): Promise<
      AckResult<{
        clue?: string;
        opponentPins?: Array<{
          lat: number;
          lng: number;
          color: string;
          name: string;
        }>;
        radarBox?: CustomBounds;
      }>
    > => {
      return new Promise((resolve) => {
        const sock = socketRef.current;
        if (!sock || !roomState) {
          resolve({ ok: false, error: 'Not in a room.' });
          return;
        }
        sock.emit(
          'room:usePowerUp',
          { roomCode: roomState.code, powerUpId, targetPlayerId },
          (res) => resolve(res),
        );
      });
    },
    [roomState],
  );

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    if (socketRef.current && roomState) {
      socketRef.current.emit('room:leave', { roomCode: roomState.code });
    }
    setRoomState(null);
    setRoomCodeInUrl(null);
  }, [roomState]);

  return {
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
    submitSnap,
    nextRound,
    playAgain,
    terminateGame,
    kickPlayer,
    sendEmoji,
    usePowerUp,
    leaveRoom,
  };
}
