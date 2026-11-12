const PLAYER_ID_KEY = 'vagabond_player_id';
const PLAYER_NAME_KEY = 'vagabond_player_name';
const HOST_SECRETS_KEY = 'vagabond_host_secrets';
const SOUND_MUTED_KEY = 'vagabond_sound_muted';
const THEME_KEY = 'vagabond_theme';

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing && existing.length > 4) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return `p_${Math.random().toString(36).slice(2)}`;
  }
}

export function getSavedPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // ignore storage failures
  }
}

export function getSavedHostSecret(roomCode: string): string | undefined {
  try {
    const raw = localStorage.getItem(HOST_SECRETS_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[roomCode.toUpperCase()];
  } catch {
    return undefined;
  }
}

export function saveHostSecret(roomCode: string, secret: string): void {
  try {
    const raw = localStorage.getItem(HOST_SECRETS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[roomCode.toUpperCase()] = secret;
    localStorage.setItem(HOST_SECRETS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function getRoomCodeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') ?? '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function setRoomCodeInUrl(code: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (code) {
      url.searchParams.set('room', code.toUpperCase());
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore
  }
}

export function getSavedMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, String(muted));
  } catch {
    // ignore
  }
}

export type ThemeChoice = 'system' | 'dark' | 'light';

export function getSavedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'dark' || v === 'light' || v === 'system') return v;
    return 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
