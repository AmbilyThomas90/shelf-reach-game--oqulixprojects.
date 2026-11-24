import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CameraOff,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Star as StarIcon,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import { describeCameraError } from '@/services/camera/errorMessages';
import {
  ACHIEVEMENTS,
  H,
  W,
  buildResult,
  buildTelemetry,
  createGame,
  extractPose,
  processPose,
  saveResult,
  setPaused,
  stepEffects,
} from './analytics';
import { loadAssets } from './assets';
import type { GameAssets } from './assets';
import {
  disposeAudio,
  playSound,
  registerAudioAssets,
  setMuted as setAudioMuted,
  startMusic,
  stopMusic,
  unlockAudio,
} from './audio';
import { drawScene } from './draw';
import type { GameState, Pt, SessionResult, Side, Telemetry } from './types';
import './shelfReach.css';

type Screen = 'loading' | 'start' | 'countdown' | 'play' | 'paused' | 'results';

/** How long a wrist must hover over a menu button to press it. */
const HOVER_CLICK_MS = 1000;

export default function ShelfReachModule() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorLeftRef = useRef<HTMLDivElement>(null);
  const cursorRightRef = useRef<HTMLDivElement>(null);

  const gameRef = useRef<GameState>(createGame());
  const assetsRef = useRef<GameAssets>({ images: {}, audio: {} });
  const scaleRef = useRef(1);
  const screenRef = useRef<Screen>('loading');
  const savedRef = useRef(false);
  const hoverRef = useRef<{ el: HTMLElement | null; since: number; cooldownUntil: number }>({
    el: null,
    since: 0,
    cooldownUntil: 0,
  });
  const toastTimerRef = useRef<number | null>(null);
  const resultsTimerRef = useRef<number | null>(null);

  const [screen, setScreen] = useState<Screen>('loading');
  const [assetProgress, setAssetProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState<Telemetry>(() => buildTelemetry(gameRef.current));
  const [result, setResult] = useState<SessionResult | null>(null);
  const [muted, setMutedState] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<{ id: number; title: string; desc: string } | null>(null);

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  }, []);

  // ---------------------------------------------------------------- camera + tracker (run in the background)
  const camera = useCamera(videoRef);
  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef: trackerCanvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const lm = extractPose((frame as unknown as { pose?: unknown }).pose);
      processPose(gameRef.current, lm, performance.now(), screenRef.current === 'play');
    },
  });

  useEffect(() => {
    if (camera.status === 'idle') void camera.start();
  }, [camera]);

  // ---------------------------------------------------------------- asset loading
  useEffect(() => {
    let cancelled = false;
    const minimumDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 1400));
    Promise.all([
      loadAssets((p) => {
        if (!cancelled) setAssetProgress(p);
      }),
      minimumDelay,
    ])
      .then(([assets]) => {
        if (cancelled) return;
        assetsRef.current = assets;
        registerAudioAssets(assets);
        setAssetsReady(true);
      })
      .catch(() => {
        if (!cancelled) setAssetsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (screen === 'loading' && assetsReady && camera.status === 'active') go('start');
  }, [screen, assetsReady, camera.status, go]);

  // ---------------------------------------------------------------- helpers
  const showToast = useCallback((title: string, desc: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ id, title, desc });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3200);
  }, []);

  const startCountdown = useCallback(() => {
    setCount(3);
    go('countdown');
  }, [go]);

  const beginPlay = useCallback(() => {
    go('play');
    startMusic();
  }, [go]);

  const handleStart = useCallback(() => {
    unlockAudio();
    const root = rootRef.current;
    if (root && !document.fullscreenElement) {
      try {
        void root.requestFullscreen().catch(() => undefined);
      } catch {
        /* fullscreen not supported - ignore */
      }
    }
    startCountdown();
  }, [startCountdown]);

  const pauseGame = useCallback(() => {
    if (screenRef.current !== 'play') return;
    setPaused(gameRef.current, true, performance.now());
    stopMusic();
    go('paused');
  }, [go]);

  const resumeGame = useCallback(() => {
    setPaused(gameRef.current, false, performance.now());
    startMusic();
    go('play');
  }, [go]);

  const restartGame = useCallback(() => {
    if (resultsTimerRef.current) window.clearTimeout(resultsTimerRef.current);
    stopMusic();
    gameRef.current = createGame();
    savedRef.current = false;
    setResult(null);
    setHud(buildTelemetry(gameRef.current));
    unlockAudio();
    startCountdown();
  }, [startCountdown]);

  const exitGame = useCallback(() => {
    stopMusic();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    // standalone build: go back if there is history, otherwise restart the page
    if (window.history.length > 1) window.history.back();
    else window.location.reload();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  }, [muted]);

  const toggleFullscreen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      try {
        void root.requestFullscreen().catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }, []);

  // ---------------------------------------------------------------- countdown 3-2-1-GO
  useEffect(() => {
    if (screen !== 'countdown') return;
    const ids = [
      window.setTimeout(() => setCount(2), 900),
      window.setTimeout(() => setCount(1), 1800),
      window.setTimeout(() => setCount(0), 2700),
      window.setTimeout(beginPlay, 3400),
    ];
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [screen, beginPlay]);

  // ---------------------------------------------------------------- fit canvas to the screen (crisp on any display)
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.min(stage.clientWidth / W, stage.clientHeight / H);
      if (!Number.isFinite(scale) || scale <= 0) return;
      scaleRef.current = scale * dpr;
      canvas.style.width = `${W * scale}px`;
      canvas.style.height = `${H * scale}px`;
      canvas.width = Math.round(W * scale * dpr);
      canvas.height = Math.round(H * scale * dpr);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // pause automatically if the tab is hidden
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pauseGame();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseGame]);

  // unlock audio on any real user gesture
  useEffect(() => {
    const events = ['pointerdown', 'click', 'touchend'] as const;
    events.forEach((e) => window.addEventListener(e, unlockAudio));
    return () => events.forEach((e) => window.removeEventListener(e, unlockAudio));
  }, []);

  // ---------------------------------------------------------------- main loop: draw, sounds, achievements, cursors, hover-to-click
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const updateHover = (root: HTMLElement, points: Pt[], now: number) => {
      const h = hoverRef.current;
      let hit: HTMLElement | null = null;

      if (screenRef.current !== 'play' && now >= h.cooldownUntil) {
        const buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-hover-btn]'));
        hit =
          buttons.find((b) => {
            const r = b.getBoundingClientRect();
            return points.some((p) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
          }) ?? null;
      }

      if (h.el && h.el !== hit) h.el.style.setProperty('--hover', '0');
      if (!hit) {
        h.el = null;
        return;
      }
      if (h.el !== hit) {
        h.el = hit;
        h.since = now;
      }
      const progress = Math.min((now - h.since) / HOVER_CLICK_MS, 1);
      hit.style.setProperty('--hover', String(progress));
      if (progress >= 1) {
        hit.style.setProperty('--hover', '0');
        h.el = null;
        h.cooldownUntil = now + 1500;
        hit.click();
      }
    };

    const loop = (now: number) => {
      const g = gameRef.current;
      const canvas = canvasRef.current;
      const root = rootRef.current;
      const ctx = canvas?.getContext('2d');
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (canvas && ctx) {
        if (!g.paused) stepEffects(g, dt);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const s = scaleRef.current;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        drawScene(ctx, g, assetsRef.current, now);
      }

      if (g.pendingSound) {
        const sound = g.pendingSound;
        g.pendingSound = null;
        playSound(sound);
      }

      if (g.pendingAchievements.length > 0) {
        const ids = g.pendingAchievements.splice(0, g.pendingAchievements.length);
        const found = ids
          .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
          .filter((a): a is (typeof ACHIEVEMENTS)[number] => !!a);
        if (found.length === 1) showToast(found[0].title, found[0].desc);
        else if (found.length > 1) showToast(found.map((a) => a.title).join('  +  '), 'New achievements unlocked!');
      }

      // wrist cursors (DOM, so they stay visible above menus) and hover-to-click on menu buttons
      if (canvas && root) {
        const cr = canvas.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        const cursors: Array<[Side, HTMLDivElement | null]> = [
          ['left', cursorLeftRef.current],
          ['right', cursorRightRef.current],
        ];
        const points: Pt[] = [];
        for (const [side, el] of cursors) {
          if (!el) continue;
          const w = g.wrists[side];
          if (!w || screenRef.current === 'loading') {
            el.style.opacity = '0';
            continue;
          }
          const x = cr.left - rr.left + (w.x / W) * cr.width;
          const y = cr.top - rr.top + (w.y / H) * cr.height;
          el.style.opacity = '1';
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
          points.push({ x: x + rr.left, y: y + rr.top });
        }
        updateHover(root, points, now);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showToast]);

  // ---------------------------------------------------------------- HUD refresh (10 Hz) + completion
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gameRef.current;
      const t = buildTelemetry(g);
      setHud((prev) =>
        prev.itemsPlaced === t.itemsPlaced &&
        prev.level === t.level &&
        prev.streak === t.streak &&
        prev.starsEarned === t.starsEarned &&
        prev.score === t.score
          ? prev
          : t,
      );

      if (g.phase === 'complete' && !savedRef.current) {
        savedRef.current = true;
        const r = buildResult(g, performance.now());
        saveResult(r);
        setResult(r);
        stopMusic();
        // let the player enjoy the celebration before the summary appears
        resultsTimerRef.current = window.setTimeout(() => {
          if (gameRef.current.phase === 'complete') go('results');
        }, 1800);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [go]);

  // ---------------------------------------------------------------- cleanup
  useEffect(() => {
    return () => {
      const g = gameRef.current;
      if (!savedRef.current && g.placed > 0) saveResult(buildResult(g, performance.now()));
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (resultsTimerRef.current) window.clearTimeout(resultsTimerRef.current);
      disposeAudio();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // ---------------------------------------------------------------- render
  const cameraGuidance = camera.error ? describeCameraError(camera.error) : null;
  const cameraProgress = camera.status === 'active' ? 1 : 0.25;
  const loadPercent = Math.round((assetProgress * 0.7 + cameraProgress * 0.3) * 100);
  const showHud = screen === 'countdown' || screen === 'play' || screen === 'paused';
  const progressPct = (hud.itemsPlaced / hud.itemsTotal) * 100;

  return (
    <div ref={rootRef} className="sr-root">
      {/* Camera + tracker run in the background and are never shown to the patient */}
      <video ref={videoRef} className="sr-video-hidden" playsInline muted autoPlay aria-hidden="true" />
      <canvas ref={trackerCanvasRef} className="sr-tracker-hidden" aria-hidden="true" />

      <div ref={stageRef} className="sr-stage">
        <canvas ref={canvasRef} className="sr-canvas" aria-label="Shelf organizer game" />
      </div>

      {/* Minimal HUD: stars, items, level, controls */}
      {showHud && (
        <header className="sr-hud">
          <div className="sr-hud-left">
            <div className="sr-stars" aria-label={`${hud.starsEarned} of 3 stars`}>
              {[1, 2, 3].map((i) => (
                <StarIcon key={i} size={26} className={i <= hud.starsEarned ? 'sr-star-on' : 'sr-star-off'} />
              ))}
            </div>
            <div className="sr-chip">
              <strong>{hud.itemsPlaced}</strong> / {hud.itemsTotal}
            </div>
          </div>

          <div className="sr-hud-center">
            <div className="sr-chip sr-chip-level">Level {hud.level}</div>
            {hud.streak >= 2 && <div className="sr-chip sr-chip-combo">Combo x{hud.streak}</div>}
          </div>

          <div className="sr-hud-right">
            <button type="button" className="sr-iconbtn" onClick={pauseGame} aria-label="Pause" title="Pause">
              <Pause size={20} />
            </button>
            <button
              type="button"
              className="sr-iconbtn"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              type="button"
              className="sr-iconbtn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
            <button type="button" className="sr-iconbtn" onClick={exitGame} aria-label="Exit" title="Exit">
              <X size={20} />
            </button>
          </div>
        </header>
      )}

      {showHud && (
        <div className="sr-bottom-bar" aria-hidden="true">
          <div className="sr-bottom-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {toast && (
        <div key={toast.id} className="sr-toast" role="status" aria-live="polite">
          <StarIcon size={22} className="sr-star-on" />
          <div>
            <div className="sr-toast-title">{toast.title}</div>
            <div className="sr-toast-desc">{toast.desc}</div>
          </div>
        </div>
      )}

      {/* LOADING */}
      {screen === 'loading' && camera.status !== 'error' && (
        <div className="sr-screen">
          <div className="sr-card sr-card-narrow">
            <span className="sr-tag">SHOULDER REHAB ARCADE</span>
            <h1 className="sr-card-title">Shoulder Shelf Reach</h1>
            <p className="sr-card-lead">Getting your pantry ready...</p>
            <div className="sr-progress" role="progressbar" aria-valuenow={loadPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="sr-progress-fill" style={{ width: `${loadPercent}%` }} />
            </div>
            <ul className="sr-load-list">
              <li className={assetsReady ? 'is-done' : ''}>Game art and sounds</li>
              <li className={camera.status === 'active' ? 'is-done' : ''}>Camera (running privately in the background)</li>
            </ul>
          </div>
        </div>
      )}

      {/* CAMERA ERROR */}
      {camera.status === 'error' && (
        <div className="sr-screen">
          <div className="sr-card sr-card-narrow" role="alert">
            <div className="sr-error-glyph">
              <CameraOff size={32} />
            </div>
            <h2 className="sr-card-title">{cameraGuidance?.title || 'Camera problem'}</h2>
            <p className="sr-card-lead">
              {cameraGuidance?.message || camera.error?.message || 'The camera could not be started.'}
            </p>
            {cameraGuidance?.hints && cameraGuidance.hints.length > 0 && (
              <ul className="sr-hints">
                {cameraGuidance.hints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ul>
            )}
            <button type="button" className="sr-btn sr-btn-primary" data-hover-btn onClick={() => void camera.start()}>
              <RefreshCw size={18} />
              <span>Try again</span>
            </button>
          </div>
        </div>
      )}

      {/* TRACKER ERROR */}
      {camera.status === 'active' && tracker.status === 'error' && (
        <div className="sr-screen">
          <div className="sr-card sr-card-narrow" role="alert">
            <h2 className="sr-card-title">Tracking problem</h2>
            <p className="sr-card-lead">{tracker.error?.message || 'The motion tracker could not start.'}</p>
            <button type="button" className="sr-btn sr-btn-primary" data-hover-btn onClick={() => tracker.retry()}>
              <RefreshCw size={18} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* START */}
      {screen === 'start' && tracker.status !== 'error' && (
        <div className="sr-screen">
          <div className="sr-card">
            <span className="sr-tag">SHOULDER REHAB ARCADE</span>
            <h1 className="sr-card-title">Shoulder Shelf Reach</h1>
            <p className="sr-card-lead">
              Help Barnaby organize the pantry. Your arm movements control the game.
            </p>
            <ol className="sr-steps">
              <li>
                <span className="sr-step-num">1</span>
                <span>
                  <strong>Grab</strong> - hold a hand over an item on the counter.
                </span>
              </li>
              <li>
                <span className="sr-step-num">2</span>
                <span>
                  <strong>Reach</strong> - lift your arm toward the glowing shelf.
                </span>
              </li>
              <li>
                <span className="sr-step-num">3</span>
                <span>
                  <strong>Place</strong> - get close to the dashed slot to snap it in.
                </span>
              </li>
            </ol>
            <button type="button" className="sr-btn sr-btn-primary sr-btn-big" data-hover-btn onClick={handleStart}>
              <span>Start exercise</span>
              <ArrowRight size={22} />
            </button>
            <p className="sr-hold-hint">Stand about 2 metres back. You can also hold a hand over this button for 1 second.</p>
          </div>
        </div>
      )}

      {/* COUNTDOWN */}
      {screen === 'countdown' && (
        <div className="sr-screen sr-screen-clear" aria-live="assertive">
          <div key={count} className="sr-countdown">
            {count > 0 ? count : 'GO!'}
          </div>
        </div>
      )}

      {/* PAUSED */}
      {screen === 'paused' && (
        <div className="sr-screen">
          <div className="sr-card sr-card-narrow">
            <h2 className="sr-card-title">Paused</h2>
            <div className="sr-stack">
              <button type="button" className="sr-btn sr-btn-primary sr-btn-big" data-hover-btn onClick={resumeGame}>
                <Play size={20} />
                <span>Resume</span>
              </button>
              <button type="button" className="sr-btn sr-btn-ghost" data-hover-btn onClick={restartGame}>
                <RotateCcw size={18} />
                <span>Restart</span>
              </button>
              <button type="button" className="sr-btn sr-btn-ghost" data-hover-btn onClick={exitGame}>
                <X size={18} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS */}
      {screen === 'results' && result && (
        <div className="sr-screen">
          <div className="sr-card">
            <Trophy size={52} className="sr-trophy" />
            <h2 className="sr-card-title">Pantry organized!</h2>
            <div className="sr-results-stars">
              {[1, 2, 3].map((i) => (
                <StarIcon
                  key={i}
                  size={40}
                  className={i <= result.starsEarned ? 'sr-star-on sr-star-pop' : 'sr-star-off'}
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="sr-card-lead">
              {result.score} points in {result.durationSec} seconds
            </p>

            <div className="sr-metrics">
              <div className="sr-metric">
                <span className="sr-metric-label">Items arranged</span>
                <span className="sr-metric-value">{result.itemsPlaced} / 10</span>
              </div>
              <div className="sr-metric">
                <span className="sr-metric-label">Highest reach</span>
                <span className="sr-metric-value">{result.maxReachPct}%</span>
              </div>
              <div className="sr-metric">
                <span className="sr-metric-label">Arm balance</span>
                <span className="sr-metric-value">{result.symmetryPct}%</span>
              </div>
              <div className="sr-metric">
                <span className="sr-metric-label">Reach speed</span>
                <span className="sr-metric-value">{result.reachSpeed.toFixed(1)} m/s</span>
              </div>
            </div>

            {result.achievements.length > 0 && (
              <ul className="sr-chips" aria-label="Achievements">
                {result.achievements.map((id) => (
                  <li key={id} className="sr-chip-ach">
                    {ACHIEVEMENTS.find((a) => a.id === id)?.title ?? id}
                  </li>
                ))}
              </ul>
            )}

            <div className="sr-row">
              <button type="button" className="sr-btn sr-btn-primary sr-btn-big" data-hover-btn onClick={restartGame}>
                <RotateCcw size={20} />
                <span>Play again</span>
              </button>
              <button type="button" className="sr-btn sr-btn-ghost" onClick={exitGame}>
                <X size={18} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hand cursors follow the tracked wrists above everything else */}
      <div ref={cursorLeftRef} className="sr-cursor sr-cursor-left" aria-hidden="true">
        L
      </div>
      <div ref={cursorRightRef} className="sr-cursor sr-cursor-right" aria-hidden="true">
        R
      </div>
    </div>
  );
}
