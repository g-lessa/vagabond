export type RoomPhase = 'lobby' | 'playing' | 'round_result' | 'game_over';

export type GameMode = 'classic' | 'battle_royale';

export type ImageryProvider = 'mapillary' | 'kartaview' | 'google';

export interface CustomBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GameSettings {
  roundsCount: number;
  roundTimeSeconds: number; // 0 = unlimited
  shortenTimerOnFirstGuess: boolean;
  firstGuessTimerSeconds: number;
  mapId: string;
  customBounds?: CustomBounds;
  only360: boolean;
  allowMoving: boolean;
  allowPanning: boolean;
  allowZooming: boolean;
  autoAdvanceSeconds: number; // 0 = manual host advance
  gameMode: GameMode;
  startingHp: number;
  enablePowerUps: boolean;
  imageryProvider: ImageryProvider;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  roundsCount: 5,
  roundTimeSeconds: 90,
  shortenTimerOnFirstGuess: true,
  firstGuessTimerSeconds: 15,
  mapId: 'world',
  only360: true,
  allowMoving: true,
  allowPanning: true,
  allowZooming: true,
  autoAdvanceSeconds: 0,
  gameMode: 'classic',
  startingHp: 10000,
  enablePowerUps: false,
  imageryProvider: 'mapillary',
};

export type PowerUpId = 'radar' | 'hemisphere' | 'mud' | 'peek';

export interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  totalScore: number;
  hasGuessedCurrentRound: boolean;
  lastRoundScore: number | null;
  hp: number;
  maxHp: number;
  isEliminated: boolean;
  powerUps: Record<PowerUpId, number>;
}

export interface RoundBrief {
  roundNumber: number;
  totalRounds: number;
  imageId: string;
  isPano: boolean;
  compassAngle: number;
  startTimeMs: number;
  endTimeMs: number | null;
  shortenedByPlayerName: string | null;
  mapName: string;
  only360: boolean;
  allowMoving: boolean;
  allowPanning: boolean;
  allowZooming: boolean;
  gameMode: GameMode;
  enablePowerUps: boolean;
  imageryProvider: ImageryProvider;
  photoUrl?: string | null;
  googleApiKey?: string | null;
  googlePanoId?: string | null;
}

export interface PlayerGuessResult {
  playerId: string;
  playerName: string;
  playerColor: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  score: number;
  totalScore: number;
  timeTakenMs: number | null;
  timedOut: boolean;
  damageTaken?: number;
  remainingHp?: number;
  isEliminated?: boolean;
}

export interface RoundResult {
  roundNumber: number;
  totalRounds: number;
  actual: {
    lat: number;
    lng: number;
    imageId: string;
    isPano: boolean;
    countryName: string | null;
    capturedAtYear?: number | null;
  };
  mapDiagonalMeters: number;
  guesses: PlayerGuessResult[];
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  settings: GameSettings;
  players: Player[];
  currentRound: RoundBrief | null;
  currentRoundResult: RoundResult | null;
  roundHistory: RoundResult[];
  nextRoundReady: boolean;
  spawningStatus: string | null;
  errorMessage: string | null;
}

export type MapCategory = 'global' | 'continent' | 'country' | 'custom' | 'themed';

export interface MapPreset {
  id: string;
  name: string;
  category: MapCategory;
  emoji: string;
  description: string;
  diagonalMeters: number;
  bounds: CustomBounds;
  countryIds?: string[];
}

export interface ServerPublicInfo {
  hasToken: boolean;
  hasGoogleKey: boolean;
  lanUrls: string[];
  port: number;
  tunnelUrl: string | null;
  tunnelAvailable: boolean;
  tunnelProvider: 'cloudflared' | 'ngrok' | null;
}

export interface AckResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface FloatingEmoji {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  emoji: string;
  timestamp: number;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: { playerId: string; playerName: string },
    ack: (res: AckResult<{ roomCode: string; hostSecret: string; mapillaryToken: string | null }>) => void,
  ) => void;
  'room:join': (
    payload: { roomCode: string; playerId: string; playerName: string; hostSecret?: string },
    ack: (res: AckResult<{ roomCode: string; mapillaryToken: string | null }>) => void,
  ) => void;
  'room:updateSettings': (
    payload: { roomCode: string; settings: Partial<GameSettings> },
    ack?: (res: AckResult) => void,
  ) => void;
  'room:startGame': (
    payload: { roomCode: string },
    ack?: (res: AckResult) => void,
  ) => void;
  'round:draftPin': (payload: { roomCode: string; lat: number; lng: number }) => void;
  'round:submitGuess': (
    payload: { roomCode: string; lat: number; lng: number },
    ack?: (res: AckResult) => void,
  ) => void;
  'round:next': (
    payload: { roomCode: string },
    ack?: (res: AckResult) => void,
  ) => void;
  'room:playAgain': (
    payload: { roomCode: string },
    ack?: (res: AckResult) => void,
  ) => void;
  'room:kickPlayer': (
    payload: { roomCode: string; targetPlayerId: string },
    ack?: (res: AckResult) => void,
  ) => void;
  'room:leave': (payload: { roomCode: string }) => void;
  'room:sendEmoji': (payload: { roomCode: string; emoji: string }) => void;
  'room:usePowerUp': (
    payload: { roomCode: string; powerUpId: PowerUpId; targetPlayerId?: string },
    ack: (res: AckResult<{ clue?: string; opponentPins?: Array<{ lat: number; lng: number; color: string; name: string }>; radarBox?: CustomBounds }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:token': (payload: { mapillaryToken: string | null }) => void;
  'room:timerShortened': (payload: { endTimeMs: number; triggeredBy: string; secondsLeft: number }) => void;
  'room:kicked': (payload: { reason: string }) => void;
  'room:emoji': (payload: FloatingEmoji) => void;
  'room:powerUpUsed': (payload: { sourcePlayerId: string; sourcePlayerName: string; powerUpId: PowerUpId; targetPlayerId?: string }) => void;
  'room:sabotaged': (payload: { byPlayerName: string; durationMs: number }) => void;
}
