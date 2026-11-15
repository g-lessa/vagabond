import { describe, expect, it } from 'vitest';
import {
  getRandomScavengerTarget,
  getTerritoryForLocation,
  SCAVENGER_TARGETS,
} from '../shared/scavenger';
import { RoomManager } from '../server/roomManager';

describe('Feature 4: Photo Scavenger Hunt Deck', () => {
  it('has a diverse collection of scavenger targets', () => {
    expect(SCAVENGER_TARGETS.length).toBeGreaterThanOrEqual(10);
    for (const t of SCAVENGER_TARGETS) {
      expect(t.id).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.bonusPoints).toBeGreaterThan(0);
    }
  });

  it('getRandomScavengerTarget picks a valid target', () => {
    const target = getRandomScavengerTarget();
    expect(target).toBeDefined();
    expect(target.bonusPoints).toBeGreaterThanOrEqual(200);
  });
});

describe('Feature 3: World Conquest & Territories', () => {
  it('generates consistent territories for locations', () => {
    const terr1 = getTerritoryForLocation(48.8566, 2.3522, 'France');
    expect(terr1.name).toBe('France');
    expect(terr1.id).toBe('france');

    const terr2 = getTerritoryForLocation(35.6762, 139.6503, 'Japan');
    expect(terr2.name).toBe('Japan');
    expect(terr2.id).toBe('japan');
  });

  it('plays conquest mode and claims territories for closest guesser', () => {
    const mgr = new RoomManager();
    const createRes = mgr.createRoom('sock_host', 'player_host', 'HostPlayer');
    const code = createRes.roomCode;

    mgr.updateSettings('sock_host', code, {
      gameMode: 'conquest',
      targetTerritories: 2,
      enableScavengerHunt: true,
      roundsCount: 3,
    });

    const p2Res = mgr.joinRoom('sock_p2', code, 'player_p2', 'P2');
    expect(p2Res.ok).toBe(true);

    const roomState = mgr.getRoomState(code)!;
    expect(roomState.settings.gameMode).toBe('conquest');
    expect(roomState.settings.targetTerritories).toBe(2);

    const room = (mgr as unknown as { rooms: Map<string, any> }).rooms.get(code)!;

    // Mock round launch
    room.phase = 'playing';
    room.currentRound = {
      roundNumber: 1,
      totalRounds: 3,
      imageId: 'mock_img_1',
      isPano: true,
      compassAngle: 0,
      startTimeMs: Date.now(),
      endTimeMs: Date.now() + 60000,
      shortenedByPlayerName: null,
      mapName: 'World',
      only360: true,
      allowMoving: true,
      allowPanning: true,
      allowZooming: true,
      gameMode: 'conquest',
      enablePowerUps: false,
      imageryProvider: 'mapillary',
      scavengerTarget: getRandomScavengerTarget(),
      lockedGuesses: new Map(),
      draftPins: new Map(),
      snaps: [],
      location: {
        lat: 48.8566,
        lng: 2.3522,
        imageId: 'mock_img_1',
        isPano: true,
        countryName: 'France',
      },
    };

    // P2 snaps a photo
    const snapRes = mgr.submitSnap('sock_p2', code, 'data:image/jpeg;base64,mockphoto');
    expect(snapRes.ok).toBe(true);

    const p2 = room.players.get('player_p2')!;
    expect(p2.hasSnappedCurrentRound).toBe(true);

    // Host guesses close (Paris)
    mgr.submitGuess('sock_host', code, 48.86, 2.35);
    // P2 guesses far (Tokyo)
    mgr.submitGuess('sock_p2', code, 35.67, 139.65);

    expect(room.phase).toBe('round_result');
    const result = room.currentRoundResult!;
    expect(result.conquestEvent).toBeDefined();
    expect(result.conquestEvent?.territoryName).toBe('France');
    expect(result.conquestEvent?.winnerName).toBe('HostPlayer');
    expect(result.conquestEvent?.isStolen).toBe(false);

    // Snaps are attached to round result
    expect(result.snaps).toHaveLength(1);
    expect(result.snaps![0].playerName).toBe('P2');

    const host = room.players.get('player_host')!;
    expect(host.territoriesCount).toBe(1);

    // Next round
    room.phase = 'playing';
    room.currentRound = {
      ...room.currentRound,
      roundNumber: 2,
      lockedGuesses: new Map(),
      draftPins: new Map(),
      snaps: [],
      location: {
        lat: 48.8566,
        lng: 2.3522,
        imageId: 'mock_img_2',
        isPano: true,
        countryName: 'France', // same territory!
      },
    };
    // reset round guess status
    host.hasGuessedCurrentRound = false;
    p2.hasGuessedCurrentRound = false;

    // Now P2 guesses closer than Host (invading and stealing France)
    mgr.submitGuess('sock_p2', code, 48.8566, 2.3522);
    mgr.submitGuess('sock_host', code, 40.0, 10.0);

    const result2 = room.currentRoundResult!;
    expect(result2.conquestEvent?.isStolen).toBe(true);
    expect(result2.conquestEvent?.winnerName).toBe('P2');
    expect(result2.conquestEvent?.previousOwnerName).toBe('HostPlayer');

    expect(host.territoriesCount).toBe(0);
    expect(p2.territoriesCount).toBe(1);
  });
});
