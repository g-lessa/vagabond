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
