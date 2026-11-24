export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Pt {
  x: number;
  y: number;
}

export type Side = 'left' | 'right';
export type Shelf = 'middle' | 'top';
export type ItemKind = 'cereal' | 'juice' | 'soup' | 'honey';
export type ItemState = 'counter' | 'held' | 'placed';
export type GamePhase = 'waiting' | 'playing' | 'complete';
export type MascotMood = 'idle' | 'happy' | 'cheer' | 'celebrate';
export type SoundName = 'pickup' | 'snap' | 'combo' | 'levelup' | 'complete';

export interface ArmJoints {
  shoulder: Pt | null;
  elbow: Pt | null;
  wrist: Pt | null;
}

export interface PoseEvent {
  snapped: boolean;
  pickedUp: boolean;
  lost: boolean;
}

export interface ShelfItem {
  id: number;
  kind: ItemKind;
  /** centre of the item in world pixels */
  x: number;
  y: number;
  state: ItemState;
  /** which counter position this item came from */
  counterSlot: number;
  scale: number;
  /** 0..1 landing bounce timer */
  landingBounce: number;
}

export interface TargetSlot {
  x: number;
  y: number;
  shelf: Shelf;
  level: number;
}

export interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
  rotation: number;
  rotSpeed: number;
}

export interface GameParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

export interface Banner {
  text: string;
  sub: string;
  life: number;
  maxLife: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
}

export interface GameState {
  phase: GamePhase;
  paused: boolean;
  pausedAt: number;
  pausedAccum: number;
  items: ShelfItem[];
  placed: number;
  spawned: number;
  level: number;
  heldId: number | null;
  heldBy: Side | null;
  heldLostAt: number;
  dwellId: number | null;
  dwellSide: Side | null;
  dwellStart: number;
  /** 0..1 progress of the hover-to-grab ring */
  dwellProgress: number;
  hoverId: number | null;
  /** true when the held item is close to its target slot */
  targetProximity: boolean;
  /** smoothed wrist positions in world pixels (mirrored, selfie view) */
  wrists: Record<Side, Pt | null>;
  arms: Record<Side, ArmJoints>;
  /** live reach height (% of torso above the shoulder line) */
  reach: Record<Side, number>;
  maxReach: Record<Side, number>;
  prevReach: Record<Side, number | null>;
  /** smoothed upward arm speed in m/s */
  speed: number;
  lastT: number;
  startedAt: number;
  endedAt: number;
  stars: Star[];
  particles: GameParticle[];
  floatingTexts: FloatingText[];
  banner: Banner | null;
  score: number;
  streak: number;
  maxStreak: number;
  achievements: string[];
  pendingAchievements: string[];
  mascotMood: MascotMood;
  mascotMessage: string;
  celebrationTimer: number;
  waitingAlpha: number;
  pendingSound: SoundName | null;
}

export interface Telemetry {
  currentReachPct: number;
  maxReachPct: number;
  symmetryPct: number;
  itemsPlaced: number;
  itemsTotal: number;
  reachSpeed: number;
  score: number;
  streak: number;
  starsEarned: number;
  level: number;
}

export interface SessionResult {
  date: string;
  durationSec: number;
  itemsPlaced: number;
  maxReachPct: number;
  maxReachLeftPct: number;
  maxReachRightPct: number;
  symmetryPct: number;
  reachSpeed: number;
  score: number;
  starsEarned: number;
  maxStreak: number;
  achievements: string[];
}
