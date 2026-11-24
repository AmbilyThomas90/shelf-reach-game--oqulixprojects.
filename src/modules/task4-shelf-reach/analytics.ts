import type {
  Achievement,
  GameParticle,
  GameState,
  ItemKind,
  Landmark,
  PoseEvent,
  Pt,
  SessionResult,
  ShelfItem,
  Side,
  TargetSlot,
  Telemetry,
} from './types';

// ---------------------------------------------------------------- constants
/** Fixed game world; the canvas is scaled to fill the screen. */
export const W = 1280;
export const H = 720;
export const TOTAL_ITEMS = 10;
export const STORAGE_KEY = 'task4_results';

export const ITEM_W = 80;
export const ITEM_H = 100;

/** y of the top surface of each shelf board (world px) */
export const SHELF_Y = { counter: 585, middle: 380, top: 200 } as const;

export const TORSO_METERS = 0.5; // assumed real torso length, used for the m/s estimate
export const MIN_VISIBILITY = 0.5;
export const PICK_DWELL_MS = 250;
export const PICK_PAD = 28;
export const SNAP_DIST = 62;
export const PROXIMITY_DIST = 130;
export const SMOOTH = 0.45;

/**
 * Part of the camera frame that maps to the whole screen, so patients do not
 * have to stretch to the very edges. Clinical reach % uses the raw landmarks.
 */
const PLAY_REGION = { x0: 0.12, x1: 0.88, y0: 0.08, y1: 0.82 };

export const SIDES: Side[] = ['left', 'right'];
export const KINDS: ItemKind[] = ['cereal', 'juice', 'soup', 'honey'];

export const COUNTER_X = [190, 360, 530, 700];
export const SLOT_X = [200, 380, 560, 740, 920];

/** Which shelf/slot each of the 10 items goes to, and the level it belongs to. */
export const TARGET_PLAN: ReadonlyArray<{ shelf: 'middle' | 'top'; slot: number; level: number }> = [
  { shelf: 'middle', slot: 0, level: 1 },
  { shelf: 'middle', slot: 1, level: 1 },
  { shelf: 'middle', slot: 2, level: 1 },
  { shelf: 'top', slot: 0, level: 2 },
  { shelf: 'middle', slot: 3, level: 2 },
  { shelf: 'top', slot: 1, level: 2 },
  { shelf: 'middle', slot: 4, level: 2 },
  { shelf: 'top', slot: 2, level: 3 },
  { shelf: 'top', slot: 3, level: 3 },
  { shelf: 'top', slot: 4, level: 3 },
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_item', title: 'First Reach', desc: 'Placed your first item' },
  { id: 'sky_high', title: 'Sky High', desc: 'Placed an item on the top shelf' },
  { id: 'halfway', title: 'Halfway There', desc: '5 items arranged' },
  { id: 'streak_3', title: 'On a Roll', desc: '3 items in a row without dropping' },
  { id: 'balanced', title: 'Balanced Arms', desc: 'Both arms reached evenly' },
  { id: 'overhead', title: 'Overhead Star', desc: 'Reached well above your shoulder' },
  { id: 'pantry_pro', title: 'Pantry Pro', desc: 'Organized all 10 items' },
];

// MediaPipe pose landmark indices
export const LM = {
  LS: 11,
  RS: 12,
  LE: 13,
  RE: 14,
  LW: 15,
  RW: 16,
  LH: 23,
  RH: 24,
} as const;

// ------------------------------------------------------------------- math
/** Accepts whatever shape the tracker gives us and returns 33 landmarks (or null). */
export function extractPose(raw: unknown): Landmark[] | null {
  if (!raw) return null;
  let cand: unknown = raw;
  if (!Array.isArray(cand) && typeof cand === 'object' && cand !== null && 'landmarks' in cand) {
    cand = (cand as { landmarks: unknown }).landmarks;
  }
  if (Array.isArray(cand) && cand.length > 0 && Array.isArray(cand[0])) {
    cand = cand[0]; // first person
  }
  if (!Array.isArray(cand) || cand.length < 25) return null;
  return cand as Landmark[];
}

export const visible = (l: Landmark | undefined): l is Landmark =>
  !!l && (l.visibility ?? 1) >= MIN_VISIBILITY;

/** Distance between shoulder midpoint and hip midpoint (normalised units). */
export function torsoLength(lm: Landmark[]): number {
  const sx = (lm[LM.LS].x + lm[LM.RS].x) / 2;
  const sy = (lm[LM.LS].y + lm[LM.RS].y) / 2;
  const hx = (lm[LM.LH].x + lm[LM.RH].x) / 2;
  const hy = (lm[LM.LH].y + lm[LM.RH].y) / 2;
  return Math.hypot(sx - hx, sy - hy);
}

/**
 * Relative reach height in % of torso length.
 * Image y grows downward, so (shoulderY - wristY) > 0 means wrist above shoulder.
 */
export function reachPct(shoulderY: number, wristY: number, torso: number): number {
  return ((shoulderY - wristY) / torso) * 100;
}

/** 100% = both arms reached equally high. */
export function symmetry(maxLeft: number, maxRight: number): number {
  const hi = Math.max(maxLeft, maxRight);
  if (hi <= 0) return 100;
  return (Math.max(Math.min(maxLeft, maxRight), 0) / hi) * 100;
}

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

/** Normalised landmark -> world pixels, mirrored (selfie view) and mapped from the play region. */
export function toCanvas(l: Landmark): Pt {
  const nx = clamp01((l.x - PLAY_REGION.x0) / (PLAY_REGION.x1 - PLAY_REGION.x0));
  const ny = clamp01((l.y - PLAY_REGION.y0) / (PLAY_REGION.y1 - PLAY_REGION.y0));
  return { x: (1 - nx) * W, y: ny * H };
}

// ------------------------------------------------------------ game helpers
export function makeItem(id: number, counterSlot: number): ShelfItem {
  return {
    id,
    kind: KINDS[id % KINDS.length],
    x: COUNTER_X[counterSlot],
    y: SHELF_Y.counter - ITEM_H / 2,
    state: 'counter',
    counterSlot,
    scale: 1,
    landingBounce: 0,
  };
}

export function createGame(): GameState {
  return {
    phase: 'waiting',
    paused: false,
    pausedAt: 0,
    pausedAccum: 0,
    items: [0, 1, 2, 3].map((i) => makeItem(i, i)),
    placed: 0,
    spawned: 4,
    level: 1,
    heldId: null,
    heldBy: null,
    heldLostAt: 0,
    dwellId: null,
    dwellSide: null,
    dwellStart: 0,
    dwellProgress: 0,
    hoverId: null,
    targetProximity: false,
    wrists: { left: null, right: null },
    arms: {
      left: { shoulder: null, elbow: null, wrist: null },
      right: { shoulder: null, elbow: null, wrist: null },
    },
    reach: { left: 0, right: 0 },
    maxReach: { left: 0, right: 0 },
    prevReach: { left: null, right: null },
    speed: 0,
    lastT: 0,
    startedAt: 0,
    endedAt: 0,
    stars: [],
    particles: [],
    floatingTexts: [],
    banner: null,
    score: 0,
    streak: 0,
    maxStreak: 0,
    achievements: [],
    pendingAchievements: [],
    mascotMood: 'idle',
    mascotMessage: 'Welcome to Happy Mart! Get ready to organize the shelves.',
    celebrationTimer: 0,
    waitingAlpha: 1,
    pendingSound: null,
  };
}

/** Level (1-3) that the next item to be placed belongs to. */
export function levelFor(placed: number): number {
  return TARGET_PLAN[Math.min(placed, TOTAL_ITEMS - 1)].level;
}

/** Target slot for the next item. */
export function getTarget(placed: number): TargetSlot {
  const plan = TARGET_PLAN[Math.min(placed, TOTAL_ITEMS - 1)];
  return {
    x: SLOT_X[plan.slot],
    y: SHELF_Y[plan.shelf] - ITEM_H / 2,
    shelf: plan.shelf,
    level: plan.level,
  };
}

/** Pause or resume the session clock. */
export function setPaused(g: GameState, paused: boolean, now: number): void {
  if (paused && !g.paused) {
    g.paused = true;
    g.pausedAt = now;
  } else if (!paused && g.paused) {
    g.paused = false;
    g.pausedAccum += now - g.pausedAt;
    g.lastT = 0; // avoid a huge dt after resuming
  }
}

function unlock(g: GameState, id: string): void {
  if (g.achievements.includes(id)) return;
  g.achievements.push(id);
  g.pendingAchievements.push(id);
}

export function release(g: GameState, item: ShelfItem): void {
  item.state = 'counter';
  item.x = COUNTER_X[item.counterSlot];
  item.y = SHELF_Y.counter - ITEM_H / 2;
  item.scale = 1;
  g.heldId = null;
  g.heldBy = null;
  g.heldLostAt = 0;
  g.streak = 0;
  g.targetProximity = false;
  g.mascotMood = 'idle';
  g.mascotMessage = 'The item slipped! Hover over it to pick it up again.';
}

export function burstConfetti(g: GameState, x: number, y: number, isFinal = false): void {
  const colors = ['#f59e0b', '#10b981', '#06b6d4', '#fbbf24', '#34d399', '#f472b6'];
  const starCount = isFinal ? 18 : 10;
  const dotCount = isFinal ? 22 : 14;

  for (let i = 0; i < starCount; i++) {
    const a = (Math.PI * 2 * i) / starCount + Math.random() * 0.3;
    const s = (isFinal ? 150 : 100) + Math.random() * 90;
    g.stars.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 60,
      life: 0.8 + Math.random() * 0.4,
      size: 7 + Math.random() * 5,
      color: colors[i % colors.length],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 8,
    });
  }

  for (let i = 0; i < dotCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 80 + Math.random() * 90;
    const p: GameParticle = {
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 30,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 3,
      life: 0.7 + Math.random() * 0.4,
      maxLife: 1.1,
    };
    g.particles.push(p);
  }
}

export function burstSelectionSparkles(g: GameState, x: number, y: number): void {
  const colors = ['#38bdf8', '#fbbf24', '#a7f3d0', '#fef08a'];
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.3;
    const s = 70 + Math.random() * 50;
    g.stars.push({
      x,
      y: y - 10,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 50,
      life: 0.6 + Math.random() * 0.3,
      size: 6 + Math.random() * 3,
      color: colors[i % colors.length],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 8,
    });
  }
}

let textCounter = 0;
export function addFloatingText(
  g: GameState,
  text: string,
  x: number,
  y: number,
  color = '#fbbf24',
  scale = 1,
): void {
  textCounter += 1;
  g.floatingTexts.push({
    id: textCounter,
    text,
    x,
    y,
    alpha: 1,
    life: 1.3,
    maxLife: 1.3,
    color,
    scale,
  });
}

export function stepEffects(g: GameState, dt: number): void {
  // fade the "step back" hint in and out
  if (g.phase === 'waiting') {
    g.waitingAlpha = Math.min(g.waitingAlpha + dt * 3.5, 1);
  } else {
    g.waitingAlpha = Math.max(g.waitingAlpha - dt * 4, 0);
  }

  // continuous celebration on completion
  if (g.phase === 'complete') {
    g.celebrationTimer += dt;
    if (g.celebrationTimer > 0.4) {
      g.celebrationTimer = 0;
      burstConfetti(g, 160 + Math.random() * (W - 320), 140 + Math.random() * 240);
    }
  }

  for (const s of g.stars) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 300 * dt;
    s.life -= dt;
    s.rotation += s.rotSpeed * dt;
  }
  g.stars = g.stars.filter((s) => s.life > 0);
  if (g.stars.length > 80) g.stars = g.stars.slice(-80);

  for (const p of g.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
  if (g.particles.length > 100) g.particles = g.particles.slice(-100);

  for (const f of g.floatingTexts) {
    f.y -= 50 * dt;
    f.life -= dt;
    f.alpha = Math.max(0, f.life / f.maxLife);
  }
  g.floatingTexts = g.floatingTexts.filter((f) => f.life > 0);
  if (g.floatingTexts.length > 10) g.floatingTexts = g.floatingTexts.slice(-10);

  if (g.banner) {
    g.banner.life -= dt;
    if (g.banner.life <= 0) g.banner = null;
  }

  for (const it of g.items) {
    if (it.landingBounce > 0) {
      it.landingBounce = Math.max(0, it.landingBounce - dt * 2.8);
      it.scale = 1 + Math.sin(it.landingBounce * Math.PI) * 0.22;
    } else {
      it.scale = it.state === 'held' ? 1.14 : 1;
    }
  }
}

function resetHover(g: GameState): void {
  g.dwellId = null;
  g.dwellSide = null;
  g.dwellProgress = 0;
  g.hoverId = null;
  g.targetProximity = false;
}

function lostHold(g: GameState, now: number, event: PoseEvent): void {
  const held = g.items.find((i) => i.id === g.heldId);
  if (!held) {
    g.heldId = null;
    g.heldBy = null;
    return;
  }
  if (!g.heldLostAt) {
    g.heldLostAt = now;
  } else if (now - g.heldLostAt > 2000) {
    release(g, held);
    event.lost = true;
  }
}

/**
 * Feed one pose frame into the game.
 * `active` is true only while the game screen is running (not menus/countdown).
 * Wrist cursors are always updated so patients can use hover-to-click on menus.
 */
export function processPose(g: GameState, lm: Landmark[] | null, now: number, active: boolean): PoseEvent {
  const event: PoseEvent = { snapped: false, pickedUp: false, lost: false };

  const dt = g.lastT ? Math.max((now - g.lastT) / 1000, 0.001) : 0.033;
  g.lastT = now;

  const track = active && !g.paused && g.phase !== 'complete';

  if (!lm) {
    g.wrists.left = null;
    g.wrists.right = null;
    g.arms.left = { shoulder: null, elbow: null, wrist: null };
    g.arms.right = { shoulder: null, elbow: null, wrist: null };
    g.speed *= 0.9;
    resetHover(g);
    if (track && g.heldId !== null) lostHold(g, now, event);
    return event;
  }

  // first tracked frame of an active session starts the clock
  if (track && g.phase === 'waiting') {
    g.phase = 'playing';
    g.startedAt = now;
    g.mascotMood = 'happy';
    g.mascotMessage = 'Hover a hand over an item on the counter to pick it up!';
  }

  // ---- 1. Joints and clinical reach measurements
  const torso = torsoLength(lm);
  const torsoOk = torso > 0.05;
  let bestSpeed = 0;

  for (const side of SIDES) {
    const sh = lm[side === 'left' ? LM.LS : LM.RS];
    const el = lm[side === 'left' ? LM.LE : LM.RE];
    const wr = lm[side === 'left' ? LM.LW : LM.RW];

    if (!visible(sh) || !visible(wr)) {
      g.wrists[side] = null;
      g.arms[side] = { shoulder: null, elbow: null, wrist: null };
      g.prevReach[side] = null;
      continue;
    }

    const pWr = toCanvas(wr);
    const prev = g.wrists[side];
    const smoothed = prev
      ? { x: prev.x + (pWr.x - prev.x) * SMOOTH, y: prev.y + (pWr.y - prev.y) * SMOOTH }
      : pWr;

    g.wrists[side] = smoothed;
    g.arms[side] = {
      shoulder: toCanvas(sh),
      elbow: visible(el) ? toCanvas(el) : null,
      wrist: smoothed,
    };

    if (track && torsoOk) {
      const pct = reachPct(sh.y, wr.y, torso);
      g.reach[side] = pct;
      if (pct > g.maxReach[side]) g.maxReach[side] = pct;
      const pp = g.prevReach[side];
      if (pp !== null) {
        bestSpeed = Math.max(bestSpeed, (((pct - pp) / 100) * TORSO_METERS) / dt);
      }
      g.prevReach[side] = pct;
    }
  }

  if (track) g.speed += (bestSpeed - g.speed) * 0.2;
  else g.speed *= 0.9;

  if (!track) {
    resetHover(g);
    return event;
  }

  // ---- 2. Carrying an item towards the target slot
  if (g.heldId !== null && g.heldBy) {
    g.dwellProgress = 0;
    g.hoverId = null;

    const held = g.items.find((i) => i.id === g.heldId);
    if (!held) {
      g.heldId = null;
      g.heldBy = null;
      g.targetProximity = false;
      return event;
    }

    const w = g.wrists[g.heldBy];
    if (!w) {
      lostHold(g, now, event);
      return event;
    }

    g.heldLostAt = 0;
    held.x = w.x;
    held.y = w.y;

    const t = getTarget(g.placed);
    const dist = Math.hypot(w.x - t.x, w.y - t.y);
    g.targetProximity = dist < PROXIMITY_DIST;

    const currentReach = Math.max(g.reach.left, g.reach.right);
    if (g.targetProximity) {
      g.mascotMood = 'cheer';
      g.mascotMessage = 'Almost there! Hold steady and it will snap into place.';
    } else if (currentReach > 90) {
      g.mascotMood = 'cheer';
      g.mascotMessage = 'Fantastic arm lift! Keep going!';
    } else {
      g.mascotMood = 'happy';
      g.mascotMessage = t.shelf === 'top' ? 'Stretch tall for the top shelf!' : 'Lift it up to the middle shelf!';
    }

    if (dist < SNAP_DIST) {
      const prevLevel = levelFor(g.placed);

      held.state = 'placed';
      held.x = t.x;
      held.y = t.y;
      held.landingBounce = 1;
      g.heldId = null;
      g.heldBy = null;
      g.targetProximity = false;
      g.placed += 1;

      // scoring
      const isTop = t.shelf === 'top';
      g.streak += 1;
      if (g.streak > g.maxStreak) g.maxStreak = g.streak;
      const points = (isTop ? 150 : 100) + (g.streak - 1) * 25;
      g.score += points;

      burstConfetti(g, t.x, t.y);
      addFloatingText(g, `+${points}`, t.x, t.y - 20, isTop ? '#fbbf24' : '#34d399', 1.5);
      if (g.streak > 2) {
        addFloatingText(g, `${g.streak}x streak!`, t.x, t.y - 62, '#f97316', 1.1);
      }

      // achievements
      unlock(g, 'first_item');
      if (isTop) unlock(g, 'sky_high');
      if (g.placed >= 5) unlock(g, 'halfway');
      if (g.streak >= 3) unlock(g, 'streak_3');
      if (Math.max(g.maxReach.left, g.maxReach.right) >= 90) unlock(g, 'overhead');
      if (
        Math.min(g.maxReach.left, g.maxReach.right) >= 30 &&
        symmetry(g.maxReach.left, g.maxReach.right) >= 80
      ) {
        unlock(g, 'balanced');
      }

      g.mascotMood = 'celebrate';
      if (g.placed >= 8 && g.placed < TOTAL_ITEMS) g.mascotMessage = 'Almost done! Just a couple left.';
      else if (g.placed === 5) g.mascotMessage = 'Halfway there! Superb shoulder lift.';
      else g.mascotMessage = isTop ? 'Incredible overhead reach!' : 'Clean placement! Keep it going.';

      if (g.spawned < TOTAL_ITEMS) {
        g.items.push(makeItem(g.spawned, held.counterSlot));
        g.spawned += 1;
      }

      if (g.placed >= TOTAL_ITEMS) {
        g.phase = 'complete';
        g.endedAt = now;
        g.mascotMessage = 'The pantry is perfectly organized. Well done, champion!';
        unlock(g, 'pantry_pro');
        burstConfetti(g, W / 2, H / 3, true);
        g.pendingSound = 'complete';
      } else {
        const newLevel = levelFor(g.placed);
        if (newLevel > prevLevel) {
          g.level = newLevel;
          g.banner = {
            text: `LEVEL ${newLevel}`,
            sub: newLevel === 2 ? 'Now alternate to the high shelf' : 'Top shelf only - reach tall!',
            life: 2.4,
            maxLife: 2.4,
          };
          g.pendingSound = 'levelup';
        } else {
          g.pendingSound = g.streak >= 3 ? 'combo' : 'snap';
        }
      }

      event.snapped = true;
    }
    return event;
  }

  // ---- 3. Hover over an item on the counter to grab it
  let hit: { item: ShelfItem; side: Side } | null = null;
  for (const side of SIDES) {
    const w = g.wrists[side];
    if (!w) continue;
    const item = g.items.find(
      (i) =>
        i.state === 'counter' &&
        Math.abs(w.x - i.x) < ITEM_W / 2 + PICK_PAD &&
        Math.abs(w.y - i.y) < ITEM_H / 2 + PICK_PAD,
    );
    if (item) {
      hit = { item, side };
      break;
    }
  }

  if (!hit) {
    g.dwellId = null;
    g.dwellSide = null;
    g.dwellProgress = 0;
    g.hoverId = null;
    return event;
  }

  g.hoverId = hit.item.id;
  if (g.dwellId === hit.item.id && g.dwellSide === hit.side) {
    const elapsed = now - g.dwellStart;
    g.dwellProgress = Math.min(elapsed / PICK_DWELL_MS, 1);

    if (elapsed >= PICK_DWELL_MS) {
      hit.item.state = 'held';
      hit.item.scale = 1.15;
      g.heldId = hit.item.id;
      g.heldBy = hit.side;
      g.heldLostAt = 0;
      g.dwellId = null;
      g.dwellSide = null;
      g.dwellProgress = 0;
      g.hoverId = null;

      burstSelectionSparkles(g, hit.item.x, hit.item.y);
      addFloatingText(g, 'Lift up!', hit.item.x, hit.item.y - 50, '#38bdf8', 1.1);
      g.mascotMood = 'cheer';
      g.mascotMessage = 'Got it! Lift your arm up to the glowing slot.';
      g.pendingSound = 'pickup';
      event.pickedUp = true;
    }
  } else {
    g.dwellId = hit.item.id;
    g.dwellSide = hit.side;
    g.dwellStart = now;
    g.dwellProgress = 0;
  }
  return event;
}

// -------------------------------------------------------- telemetry / save
export function calculateStars(g: GameState): number {
  const maxR = Math.max(g.maxReach.left, g.maxReach.right);
  const sym = symmetry(g.maxReach.left, g.maxReach.right);
  if (g.placed >= 10 && maxR >= 90 && sym >= 70) return 3;
  if (g.placed >= 7 || (g.placed >= 5 && maxR >= 75)) return 2;
  if (g.placed >= 3) return 1;
  return 0;
}

export function buildTelemetry(g: GameState): Telemetry {
  return {
    currentReachPct: Math.round(Math.max(g.reach.left, g.reach.right, 0)),
    maxReachPct: Math.round(Math.max(g.maxReach.left, g.maxReach.right)),
    symmetryPct: Math.round(symmetry(g.maxReach.left, g.maxReach.right)),
    itemsPlaced: g.placed,
    itemsTotal: TOTAL_ITEMS,
    reachSpeed: Math.round(Math.abs(g.speed) * 10) / 10,
    score: g.score,
    streak: g.streak,
    starsEarned: calculateStars(g),
    level: g.level,
  };
}

export function buildResult(g: GameState, now: number): SessionResult {
  const t = buildTelemetry(g);
  const end = g.endedAt || now;
  const durationMs = g.startedAt ? Math.max(end - g.startedAt - g.pausedAccum, 0) : 0;
  return {
    date: new Date().toISOString(),
    durationSec: Math.round(durationMs / 1000),
    itemsPlaced: g.placed,
    maxReachPct: t.maxReachPct,
    maxReachLeftPct: Math.round(g.maxReach.left),
    maxReachRightPct: Math.round(g.maxReach.right),
    symmetryPct: t.symmetryPct,
    reachSpeed: t.reachSpeed,
    score: g.score,
    starsEarned: t.starsEarned,
    maxStreak: g.maxStreak,
    achievements: [...g.achievements],
  };
}

export function loadResults(): SessionResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionResult[]) : [];
  } catch {
    return [];
  }
}

export function saveResult(r: SessionResult): void {
  try {
    const list = loadResults();
    list.push(r);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* storage unavailable - ignore */
  }
}
