let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
    }
  }
  if (audioCtx?.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.08,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function playPinDropSound(muted: boolean): void {
  if (muted) return;
  playTone(720, 0.05, 'sine', 0.06);
}

export function playGuessLockedSound(muted: boolean): void {
  if (muted) return;
  playTone(587.33, 0.14, 'triangle', 0.08);
  setTimeout(() => playTone(880, 0.18, 'triangle', 0.07), 70);
}

export function playTimerUrgentTick(muted: boolean): void {
  if (muted) return;
  playTone(440, 0.06, 'sine', 0.05);
}

export function playRoundEndChime(muted: boolean): void {
  if (muted) return;
  playTone(523.25, 0.16, 'triangle', 0.07);
  setTimeout(() => playTone(659.25, 0.18, 'triangle', 0.07), 90);
  setTimeout(() => playTone(783.99, 0.28, 'triangle', 0.07), 180);
}

export function playDamageHitSound(muted: boolean): void {
  if (muted) return;
  playTone(180, 0.18, 'sawtooth', 0.1);
  setTimeout(() => playTone(120, 0.25, 'sawtooth', 0.09), 60);
}

export function playEliminatedSound(muted: boolean): void {
  if (muted) return;
  playTone(330, 0.2, 'sawtooth', 0.08);
  setTimeout(() => playTone(293.66, 0.25, 'sawtooth', 0.08), 120);
  setTimeout(() => playTone(220, 0.45, 'sawtooth', 0.1), 250);
}

export function playPowerUpSound(muted: boolean): void {
  if (muted) return;
  playTone(440, 0.1, 'sine', 0.07);
  setTimeout(() => playTone(659.25, 0.12, 'sine', 0.08), 50);
  setTimeout(() => playTone(880, 0.16, 'triangle', 0.09), 110);
}

export function playMudSplatSound(muted: boolean): void {
  if (muted) return;
  playTone(140, 0.15, 'square', 0.07);
  setTimeout(() => playTone(90, 0.2, 'sawtooth', 0.08), 50);
}

export function playEmojiPopSound(muted: boolean): void {
  if (muted) return;
  playTone(660, 0.08, 'sine', 0.06);
  setTimeout(() => playTone(990, 0.1, 'sine', 0.05), 40);
}
