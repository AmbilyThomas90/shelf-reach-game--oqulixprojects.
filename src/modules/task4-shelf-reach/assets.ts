/**
 * Asset loader.
 *
 * Drop real game art and sounds into ./assets and they are picked up by FILE NAME
 * (any sub-folder is fine). Anything missing falls back to the built-in vector
 * art and synthesized sounds, so the game always runs.
 *
 *   Images: background, shelf, cereal, juice, soup, honey, character   (.png .jpg .webp .svg)
 *   Audio : pickup, place, combo, levelup, complete, music             (.mp3 .ogg .wav)
 */

export type ImageKey = 'background' | 'shelf' | 'cereal' | 'juice' | 'soup' | 'honey' | 'character';
export type AudioKey = 'pickup' | 'place' | 'combo' | 'levelup' | 'complete' | 'music';

export interface GameAssets {
  images: Partial<Record<ImageKey, HTMLImageElement>>;
  audio: Partial<Record<AudioKey, HTMLAudioElement>>;
}

const IMAGE_KEYS: ImageKey[] = ['background', 'shelf', 'cereal', 'juice', 'soup', 'honey', 'character'];
const AUDIO_KEYS: AudioKey[] = ['pickup', 'place', 'combo', 'levelup', 'complete', 'music'];

const imageFiles = import.meta.glob<string>('./assets/**/*.{png,jpg,jpeg,webp,svg,gif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const audioFiles = import.meta.glob<string>('./assets/**/*.{mp3,ogg,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function findUrl(files: Record<string, string>, name: string): string | null {
  const key = Object.keys(files).find((k) => {
    const file = k.split('/').pop() ?? '';
    return file.replace(/\.[^.]+$/, '').toLowerCase() === name;
  });
  return key ? files[key] : null;
}

/** Preloads every asset that exists. Never rejects: failed files are simply skipped. */
export async function loadAssets(onProgress: (progress: number) => void): Promise<GameAssets> {
  const assets: GameAssets = { images: {}, audio: {} };
  const tasks: Array<Promise<void>> = [];

  const imageJobs = IMAGE_KEYS.flatMap((key) => {
    const url = findUrl(imageFiles, key);
    return url ? [{ key, url }] : [];
  });
  const audioJobs = AUDIO_KEYS.flatMap((key) => {
    const url = findUrl(audioFiles, key);
    return url ? [{ key, url }] : [];
  });

  const total = imageJobs.length + audioJobs.length;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress(total === 0 ? 1 : done / total);
  };

  if (total === 0) {
    onProgress(1);
    return assets;
  }

  for (const { key, url } of imageJobs) {
    tasks.push(
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          assets.images[key] = img;
          tick();
          resolve();
        };
        img.onerror = () => {
          tick();
          resolve();
        };
        img.src = url;
      }),
    );
  }

  for (const { key, url } of audioJobs) {
    tasks.push(
      new Promise<void>((resolve) => {
        const el = new Audio();
        let finished = false;
        const finish = (ok: boolean) => {
          if (finished) return;
          finished = true;
          if (ok) assets.audio[key] = el;
          tick();
          resolve();
        };
        el.preload = 'auto';
        el.addEventListener('canplaythrough', () => finish(true), { once: true });
        el.addEventListener('error', () => finish(false), { once: true });
        window.setTimeout(() => finish(true), 5000); // do not block the loading screen forever
        el.src = url;
        el.load();
      }),
    );
  }

  await Promise.all(tasks);
  return assets;
}
