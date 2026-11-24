import type { AudioKey, GameAssets } from './assets';
import type { SoundName } from './types';

let ctx: AudioContext | null = null;
let muted = false;
let files: GameAssets['audio'] = {};
let musicOn = false;
let musicTimer: number | null = null;
let musicStep = 0;
const lastPlayed: Partial<Record<SoundName, number>> = {};

type ActivationNavigator = Navigator & { userActivation?: { hasBeenActive: boolean } };

const FILE_FOR: Record<SoundName, AudioKey> = {
  pickup: 'pickup',
  snap: 'place',
  combo: 'combo',
  levelup: 'levelup',
  complete: 'complete',
};

export function registerAudioAssets(assets: GameAssets): void {
  files = assets.audio;
}

/** Creates/resumes audio only after the browser confirms a real user gesture. */
export function unlockAudio(): void {
  const activation = (navigator as ActivationNavigator).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio not supported - ignore */
  }
}

function ready(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function synth(name: SoundName): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  switch (name) {
    case 'pickup':
      tone(c, 523.25, t, 0.1, 'sine', 0.09);
      tone(c, 783.99, t, 0.1, 'sine', 0.05);
      break;
    case 'snap':
      [659.25, 830.61, 987.77].forEach((f, i) => tone(c, f, t + i * 0.04, 0.17, 'sine', 0.11));
      break;
    case 'combo':
      [783.99, 987.77, 1174.66].forEach((f, i) => tone(c, f, t + i * 0.05, 0.22, 'triangle', 0.11));
      break;
    case 'levelup':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, f, t + i * 0.09, 0.3, 'triangle', 0.12));
      break;
    case 'complete':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(c, f, t + i * 0.1, 0.45, i === 3 ? 'sine' : 'triangle', 0.13),
      );
      break;
  }
}

export function playSound(name: SoundName): void {
  if (muted) return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? 0) < 150) return;
  lastPlayed[name] = now;

  const file = files[FILE_FOR[name]];
  if (file) {
    try {
      const clone = file.cloneNode(true) as HTMLAudioElement;
      clone.volume = 0.7;
      void clone.play().catch(() => undefined);
      return;
    } catch {
      /* fall back to synth */
    }
  }
  synth(name);
}

export function setMuted(value: boolean): void {
  muted = value;
  if (files.music) files.music.muted = value;
}

/** Soft looping background music (uses music.mp3 if provided, otherwise a gentle synthesized pad). */
export function startMusic(): void {
  if (musicOn) return;
  musicOn = true;

  const track = files.music;
  if (track) {
    track.loop = true;
    track.volume = 0.25;
    track.muted = muted;
    void track.play().catch(() => undefined);
    return;
  }

  const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33];
  musicTimer = window.setInterval(() => {
    const c = ready();
    if (!c || muted) return;
    const t = c.currentTime;
    tone(c, scale[musicStep % scale.length], t, 1.1, 'sine', 0.025);
    if (musicStep % 4 === 0) tone(c, 130.81, t, 1.8, 'sine', 0.03);
    musicStep += 1;
  }, 520);
}

export function stopMusic(): void {
  musicOn = false;
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (files.music) files.music.pause();
}

export function disposeAudio(): void {
  stopMusic();
  if (ctx) {
    try {
      if (ctx.state !== 'closed') void ctx.close();
    } catch {
      /* ignore */
    }
    ctx = null;
  }
}
