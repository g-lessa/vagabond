export type BiomeType = 'tundra' | 'forest' | 'ocean' | 'rural' | 'urban';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeSourceNodes: AudioNode[] = [];
let birdIntervalId: NodeJS.Timeout | null = null;
let currentActiveBiome: BiomeType | null = null;

function getAudioContext(): AudioContext | null {
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

function createNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const bufferSize = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    // Pink-filtered noise for natural organic wind/waves
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + 0.02 * white) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5;
  }
  return buffer;
}

export function startBiomeSoundscape(
  biome: BiomeType | string = 'forest',
  muted = false,
  volume = 0.045,
): void {
  stopBiomeSoundscape();
  if (muted) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  currentActiveBiome = (biome as BiomeType) || 'forest';

  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.8);
  masterGain.connect(ctx.destination);

  const noiseBuffer = createNoiseBuffer(ctx, 5);
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuffer;
  noiseSrc.loop = true;

  if (currentActiveBiome === 'tundra') {
    // Arctic Tundra: Howling whistling wind with dynamic bandpass
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(380, ctx.currentTime);
    filter.Q.setValueAtTime(4.5, ctx.currentTime);

    // LFO for wind gust oscillation
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime); // 0.2 Hz slow gusts
    lfoGain.gain.setValueAtTime(260, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noiseSrc.connect(filter);
    filter.connect(masterGain);
    activeSourceNodes.push(noiseSrc, filter, lfo, lfoGain);
  } else if (currentActiveBiome === 'ocean') {
    // Ocean Coast: Rolling wave swells (low-pass noise with volume wave envelope)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, ctx.currentTime);

    const waveGain = ctx.createGain();
    waveGain.gain.setValueAtTime(0.2, ctx.currentTime);

    // LFO wave swell (0.15 Hz = ~6.5 second surf swell cycle)
    const swellLfo = ctx.createOscillator();
    const swellGain = ctx.createGain();
    swellLfo.frequency.setValueAtTime(0.16, ctx.currentTime);
    swellGain.gain.setValueAtTime(0.18, ctx.currentTime);
    swellLfo.connect(swellGain);
    swellGain.connect(waveGain.gain);
    swellLfo.start();

    noiseSrc.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(masterGain);
    activeSourceNodes.push(noiseSrc, filter, waveGain, swellLfo, swellGain);
  } else if (currentActiveBiome === 'rural') {
    // Rural / Mediterranean: Gentle breeze + procedural cicadas / crickets
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);

    noiseSrc.connect(filter);
    filter.connect(masterGain);
    activeSourceNodes.push(noiseSrc, filter);

    // Cicada chirp generator (modulated high freq oscillator)
    const cicadaOsc = ctx.createOscillator();
    const cicadaMod = ctx.createOscillator();
    const cicadaModGain = ctx.createGain();
    const cicadaGain = ctx.createGain();

    cicadaOsc.type = 'sine';
    cicadaOsc.frequency.setValueAtTime(4800, ctx.currentTime);

    cicadaMod.type = 'square';
    cicadaMod.frequency.setValueAtTime(22, ctx.currentTime); // 22Hz buzz
    cicadaModGain.gain.setValueAtTime(0.04, ctx.currentTime);

    cicadaMod.connect(cicadaModGain);
    cicadaModGain.connect(cicadaGain.gain);

    cicadaOsc.connect(cicadaGain);
    cicadaGain.connect(masterGain);

    cicadaOsc.start();
    cicadaMod.start();
    activeSourceNodes.push(cicadaOsc, cicadaMod, cicadaModGain, cicadaGain);
  } else if (currentActiveBiome === 'urban') {
    // Urban: Low-frequency city traffic rumble
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, ctx.currentTime);

    noiseSrc.connect(filter);
    filter.connect(masterGain);
    activeSourceNodes.push(noiseSrc, filter);
  } else {
    // Default Forest / Woods: Gentle foliage breeze + natural bird chirps
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, ctx.currentTime);

    noiseSrc.connect(filter);
    filter.connect(masterGain);
    activeSourceNodes.push(noiseSrc, filter);

    // Intermittent bird tweet generator
    const scheduleBirdTweet = () => {
      const delay = 2500 + Math.random() * 4500;
      birdIntervalId = setTimeout(() => {
        if (!masterGain || !audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const bGain = audioCtx.createGain();
        osc.type = 'triangle';

        const baseF = 2600 + Math.random() * 1200;
        osc.frequency.setValueAtTime(baseF, now);
        osc.frequency.exponentialRampToValueAtTime(baseF + 900, now + 0.06);
        osc.frequency.exponentialRampToValueAtTime(baseF + 200, now + 0.12);

        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(0.035, now + 0.02);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(bGain);
        bGain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.16);

        scheduleBirdTweet();
      }, delay);
    };
    scheduleBirdTweet();
  }

  noiseSrc.start();
}

export function stopBiomeSoundscape(): void {
  if (birdIntervalId) {
    clearTimeout(birdIntervalId);
    birdIntervalId = null;
  }
  if (masterGain && audioCtx) {
    try {
      masterGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      setTimeout(() => {
        for (const node of activeSourceNodes) {
          try {
            if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
              (node as AudioScheduledSourceNode).stop();
            }
            node.disconnect();
          } catch {
            // ignore cleanup errors
          }
        }
        activeSourceNodes = [];
        masterGain?.disconnect();
        masterGain = null;
      }, 450);
    } catch {
      activeSourceNodes = [];
      masterGain = null;
    }
  } else {
    activeSourceNodes = [];
  }
  currentActiveBiome = null;
}
