import type { GameAssets } from './assets';
import { H, ITEM_H, ITEM_W, SHELF_Y, W, getTarget } from './analytics';
import type { ArmJoints, GameState, ItemKind, MascotMood, Side, TargetSlot } from './types';

// Vector items are drawn in a 60x76 box and scaled up to ITEM_W x ITEM_H.
const BASE_W = 60;
const BASE_H = 76;
const K = ITEM_H / BASE_H;

// ---------------------------------------------------------------- helpers
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.46;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

// ------------------------------------------------------------- background
function drawBackground(ctx: CanvasRenderingContext2D, assets: GameAssets, now: number): void {
  const bg = assets.images.background;
  if (bg) {
    const s = Math.max(W / bg.width, H / bg.height);
    const dw = bg.width * s;
    const dh = bg.height * s;
    ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }

  // wall
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#f0fdf4');
  wall.addColorStop(0.65, '#d1fae5');
  wall.addColorStop(1, '#bae6fd');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // tiles
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.09)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 60; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // window with sun
  ctx.fillStyle = '#ffffff';
  rect(ctx, 1010, 108, 220, 100, 12);
  ctx.fill();
  const sky = ctx.createLinearGradient(0, 118, 0, 198);
  sky.addColorStop(0, '#7dd3fc');
  sky.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = sky;
  rect(ctx, 1018, 116, 204, 84, 8);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(1180, 148 + Math.sin(now * 0.001) * 2, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1118, 116, 6, 84);

  // warm light pools
  [320, 880].forEach((lx) => {
    const g = ctx.createRadialGradient(lx, 60, 10, lx, 330, 340);
    g.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
    g.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx - 20, 56);
    ctx.lineTo(lx + 300, 620);
    ctx.lineTo(lx - 300, 620);
    ctx.closePath();
    ctx.fill();
  });

  // striped awning
  const stripe = 80;
  for (let i = 0; i * stripe < W; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#059669' : '#ecfdf5';
    ctx.fillRect(i * stripe, 0, stripe, 52);
    ctx.beginPath();
    ctx.arc(i * stripe + stripe / 2, 52, stripe / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(6, 78, 59, 0.12)';
  ctx.fillRect(0, 92, W, 5);
}

// ----------------------------------------------------------------- shelves
function drawBoard(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  y: number,
  thick: number,
  glow: string | null,
  now: number,
): void {
  const x = 48;
  const w = W - 96;
  ctx.save();

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18 + (Math.sin(now * 0.006) + 1) * 8;
  } else {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
  }

  const shelfImg = assets.images.shelf;
  const bracketY = shelfImg ? y + 26 : y + thick;

  [140, 640, 1140].forEach((bx) => {
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.moveTo(bx - 11, bracketY);
    ctx.lineTo(bx + 11, bracketY);
    ctx.lineTo(bx + 4, bracketY + 26);
    ctx.lineTo(bx - 4, bracketY + 26);
    ctx.closePath();
    ctx.fill();
  });

  if (shelfImg) {
    ctx.drawImage(shelfImg, x, y - 22, w, 50);
  } else {
    const grad = ctx.createLinearGradient(0, y, 0, y + thick);
    grad.addColorStop(0, '#fef3c7');
    grad.addColorStop(0.25, '#d97706');
    grad.addColorStop(1, '#92400e');
    ctx.fillStyle = grad;
    rect(ctx, x, y, w, thick, 4);
    ctx.fill();
    ctx.fillStyle = glow ? '#fef08a' : '#fde68a';
    ctx.fillRect(x + 3, y, w - 6, 4);
  }

  if (glow) {
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    if (shelfImg) {
      rect(ctx, x - 3, y - 22, w + 6, 52, 8);
    } else {
      rect(ctx, x - 3, y - 3, w + 6, thick + 6, 6);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.font = '800 14px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 28;
  ctx.fillStyle = color;
  rect(ctx, x, y, w, 26, 6);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 14, y + 14);
  ctx.textBaseline = 'alphabetic';
}

function drawShelves(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  activeShelf: 'middle' | 'top' | null,
  now: number,
): void {
  const tagOffset = assets.images.shelf ? 34 : 30;
  drawBoard(ctx, assets, SHELF_Y.top, 18, activeShelf === 'top' ? '#fbbf24' : null, now);
  drawTag(ctx, 64, SHELF_Y.top + tagOffset, activeShelf === 'top' ? 'TARGET: HIGH SHELF  +150' : 'HIGH SHELF  +150', '#b45309');

  drawBoard(ctx, assets, SHELF_Y.middle, 18, activeShelf === 'middle' ? '#34d399' : null, now);
  drawTag(
    ctx,
    64,
    SHELF_Y.middle + tagOffset,
    activeShelf === 'middle' ? 'TARGET: MIDDLE SHELF  +100' : 'MIDDLE SHELF  +100',
    '#0f766e',
  );

  // counter
  const cy = SHELF_Y.counter;
  const counterImg = assets.images.counter;
  if (counterImg) {
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.24)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = -2;
    ctx.drawImage(counterImg, 20, cy - 8, W - 40, H - (cy - 8) + 4);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.fillRect(24, cy + 30, W - 48, 12);

    const top = ctx.createLinearGradient(0, cy, 0, cy + 28);
    top.addColorStop(0, '#b45309');
    top.addColorStop(0.35, '#92400e');
    top.addColorStop(1, '#451a03');
    ctx.fillStyle = top;
    rect(ctx, 24, cy, W - 48, 28, 5);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(28, cy, W - 56, 4);

    // cabinet front
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(24, cy + 28, W - 48, H - (cy + 28));
    for (let x = 60; x < W - 60; x += 200) {
      ctx.fillStyle = '#334155';
      rect(ctx, x, cy + 46, 170, H - (cy + 46) - 14, 8);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      rect(ctx, x + 70, cy + 58, 30, 6, 3);
      ctx.fill();
    }
  }
  drawTag(ctx, 64, cy + 34, 'COUNTER - HOVER A HAND OVER AN ITEM', '#0284c7');
}

// -------------------------------------------------------------------- items
function drawVectorItem(ctx: CanvasRenderingContext2D, kind: ItemKind): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1e293b';

  if (kind === 'cereal') {
    const grad = ctx.createLinearGradient(-BASE_W / 2, 0, BASE_W / 2, 0);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(0.5, '#fbbf24');
    grad.addColorStop(1, '#d97706');
    ctx.fillStyle = grad;
    rect(ctx, -BASE_W / 2, -BASE_H / 2, BASE_W, BASE_H, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#b45309';
    ctx.fillRect(-BASE_W / 2, -BASE_H / 2, BASE_W, 9);

    ctx.fillStyle = '#dc2626';
    rect(ctx, -BASE_W / 2 + 4, -BASE_H / 2 + 15, BASE_W - 8, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CRUNCH', 0, -BASE_H / 2 + 27);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 14, 16, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d97706';
    [-6, 0, 6].forEach((ox) => {
      ctx.beginPath();
      ctx.arc(ox, 13, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (kind === 'juice') {
    const bw = BASE_W - 6;
    const bh = BASE_H - 12;
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.moveTo(-bw / 2, bh / 2);
    ctx.lineTo(-bw / 2, -bh / 2 + 10);
    ctx.lineTo(-bw / 2 + 8, -bh / 2 - 8);
    ctx.lineTo(bw / 2 - 8, -bh / 2 - 8);
    ctx.lineTo(bw / 2, -bh / 2 + 10);
    ctx.lineTo(bw / 2, bh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -bh / 2 - 12, 12, 6);

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-bw / 2, -6);
    ctx.lineTo(bw / 2, -20);
    ctx.lineTo(bw / 2, 8);
    ctx.lineTo(-bw / 2, 22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 2, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'soup') {
    const cw = BASE_W - 10;
    const ch = BASE_H - 6;
    const grad = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    grad.addColorStop(0, '#b91c1c');
    grad.addColorStop(0.35, '#ef4444');
    grad.addColorStop(0.7, '#dc2626');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    rect(ctx, -cw / 2, -ch / 2, cw, ch, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-cw / 2, -ch / 2 + 18, cw, 26);
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(0, -ch / 2 + 31, 9, 0, Math.PI * 2);
    ctx.fill();

    const lid = ctx.createLinearGradient(-cw / 2, 0, cw / 2, 0);
    lid.addColorStop(0, '#94a3b8');
    lid.addColorStop(0.5, '#f8fafc');
    lid.addColorStop(1, '#64748b');
    ctx.fillStyle = lid;
    ctx.beginPath();
    ctx.ellipse(0, -ch / 2, cw / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, ch / 2, cw / 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const jw = BASE_W - 8;
    const jh = BASE_H - 12;
    const honey = ctx.createLinearGradient(-jw / 2, 0, jw / 2, 0);
    honey.addColorStop(0, '#d97706');
    honey.addColorStop(0.4, '#fbbf24');
    honey.addColorStop(0.8, '#f59e0b');
    honey.addColorStop(1, '#b45309');
    ctx.fillStyle = honey;
    rect(ctx, -jw / 2, -jh / 2 + 6, jw, jh - 6, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.ellipse(-jw / 2 + 6, 0, 3, jh / 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    rect(ctx, -jw / 2 - 3, -jh / 2 - 6, jw + 6, 14, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(0, 4, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(0, 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface ItemStyle {
  lifted: boolean;
  hovered: boolean;
  dwell: number;
  scale: number;
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  kind: ItemKind,
  cx: number,
  cy: number,
  style: ItemStyle,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  if (style.lifted) {
    ctx.scale(1.12 * style.scale, 1.12 * style.scale);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 16;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    ctx.lineWidth = 4;
    rect(ctx, -ITEM_W / 2 - 5, -ITEM_H / 2 - 5, ITEM_W + 10, ITEM_H + 10, 12);
    ctx.stroke();
  } else if (style.hovered) {
    ctx.scale(1.08 * style.scale, 1.08 * style.scale);
    ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    rect(ctx, -ITEM_W / 2 - 4, -ITEM_H / 2 - 4, ITEM_W + 8, ITEM_H + 8, 10);
    ctx.stroke();

    if (style.dwell > 0) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, -ITEM_H / 2 - 24, 14, -Math.PI / 2, -Math.PI / 2 + style.dwell * Math.PI * 2);
      ctx.stroke();
    }
  } else {
    ctx.scale(style.scale, style.scale);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 6;
  }

  const sprite = assets.images[kind];
  if (sprite) {
    const s = Math.min(ITEM_W / sprite.width, ITEM_H / sprite.height) * 1.08;
    ctx.drawImage(sprite, (-sprite.width * s) / 2, (-sprite.height * s) / 2, sprite.width * s, sprite.height * s);
  } else {
    ctx.scale(K, K);
    drawVectorItem(ctx, kind);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ mascot
function drawVectorMascot(ctx: CanvasRenderingContext2D, mood: MascotMood): void {
  ctx.fillStyle = '#854d0e';
  ctx.beginPath();
  ctx.ellipse(0, 10, 24, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#047857';
  rect(ctx, -14, 0, 28, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  drawStar(ctx, 0, 12, 5);

  [-16, 16].forEach((ex) => {
    ctx.fillStyle = '#854d0e';
    ctx.beginPath();
    ctx.arc(ex, -28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.arc(ex, -28, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.arc(0, -16, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.ellipse(0, -10, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -13, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (mood === 'celebrate') {
    ctx.arc(0, -9, 5, 0, Math.PI);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
  } else {
    ctx.arc(0, -9, 4, 0.1, Math.PI - 0.1);
  }
  ctx.stroke();

  const eyeUp = mood === 'cheer' ? 2 : 0;
  [-7, 7].forEach((ex) => {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(ex, -20 - eyeUp, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - 1, -21 - eyeUp, 1.2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
  [-13, 13].forEach((cx) => {
    ctx.beginPath();
    ctx.ellipse(cx, -12, 4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawMascot(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  mood: MascotMood,
  message: string,
  now: number,
): void {
  const baseX = 1120;
  const baseY = SHELF_Y.counter; // feet rest on the counter
  const bob = Math.sin(now * (mood === 'celebrate' ? 0.012 : 0.0035)) * (mood === 'celebrate' ? 8 : 3);

  const sprite = assets.images.character;
  ctx.save();
  if (sprite) {
    const h = 232;
    const w = (sprite.width / sprite.height) * h;
    ctx.drawImage(sprite, baseX - w / 2, baseY - h + 6 + bob, w, h);
  } else {
    ctx.translate(baseX, baseY - 68 + bob);
    ctx.scale(1.9, 1.9);
    drawVectorMascot(ctx, mood);
  }
  ctx.restore();

  // speech bubble
  const bw = 276;
  const bh = 74;
  const bx = 972;
  const by = 248;

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#047857';
  ctx.lineWidth = 3;
  rect(ctx, bx, by, bw, bh, 14);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + bw - 90, by + bh);
  ctx.lineTo(bx + bw - 60, by + bh + 22);
  ctx.lineTo(bx + bw - 44, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#047857';
  ctx.font = '800 12px system-ui, sans-serif';
  ctx.fillText('BARNABY THE GROCER', bx + 16, by + 22);
  ctx.fillStyle = '#1e293b';
  ctx.font = '600 15px system-ui, sans-serif';
  const lines = wrapLines(ctx, message, bw - 32);
  lines.forEach((line, i) => ctx.fillText(line, bx + 16, by + 44 + i * 18));
}

// ----------------------------------------------------------- target + arms
function drawTargetSlot(
  ctx: CanvasRenderingContext2D,
  assets: GameAssets,
  heldKind: ItemKind | null,
  t: TargetSlot,
  near: boolean,
  now: number,
): void {
  ctx.save();
  const pulse = Math.sin(now * (near ? 0.012 : 0.005)) * (near ? 7 : 4);
  const w = ITEM_W + 18 + pulse;
  const h = ITEM_H + 18 + pulse;

  ctx.setLineDash([12, 9]);
  ctx.lineDashOffset = -now * (near ? 0.08 : 0.04);
  ctx.lineWidth = near ? 5 : 4;
  ctx.strokeStyle = near ? '#34d399' : '#10b981';
  if (near) {
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.32)';
  } else {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  }
  rect(ctx, t.x - w / 2, t.y - h / 2, w, h, 12);
  ctx.fill();
  ctx.stroke();

  if (heldKind) {
    const sprite = assets.images[heldKind];
    if (sprite) {
      ctx.globalAlpha = near ? 0.48 : 0.26;
      const s = Math.min(ITEM_W / sprite.width, ITEM_H / sprite.height) * 0.96;
      ctx.drawImage(sprite, t.x - (sprite.width * s) / 2, t.y - (sprite.height * s) / 2, sprite.width * s, sprite.height * s);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#065f46';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(near ? 'ALMOST THERE!' : 'PLACE HERE', t.x, t.y + 4);

  const bob = Math.sin(now * (near ? 0.015 : 0.008)) * (near ? 7 : 5);
  ctx.fillStyle = near ? '#34d399' : '#10b981';
  ctx.beginPath();
  ctx.moveTo(t.x, t.y + ITEM_H / 2 + 26 + bob);
  ctx.lineTo(t.x - 10, t.y + ITEM_H / 2 + 12 + bob);
  ctx.lineTo(t.x + 10, t.y + ITEM_H / 2 + 12 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArmBones(ctx: CanvasRenderingContext2D, arms: Record<Side, ArmJoints>): void {
  const sides: Side[] = ['left', 'right'];
  for (const s of sides) {
    const a = arms[s];
    if (!a.shoulder || !a.wrist) continue;
    ctx.save();
    ctx.strokeStyle = s === 'left' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.shoulder.x, a.shoulder.y);
    if (a.elbow) ctx.lineTo(a.elbow.x, a.elbow.y);
    ctx.lineTo(a.wrist.x, a.wrist.y);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- effects
function drawEffects(ctx: CanvasRenderingContext2D, g: GameState): void {
  for (const s of g.stars) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.fillStyle = s.color;
    ctx.globalAlpha = Math.max(Math.min(s.life * 1.4, 1), 0);
    drawStar(ctx, 0, 0, s.size);
    ctx.restore();
  }

  for (const p of g.particles) {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(Math.min(p.life / p.maxLife, 1), 0);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const f of g.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.font = `800 ${Math.round(24 * f.scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, g: GameState): void {
  const b = g.banner;
  if (!b) return;
  const elapsed = b.maxLife - b.life;
  const alpha = Math.min(1, elapsed * 4, b.life * 3);
  const pop = 0.8 + Math.min(elapsed * 4, 1) * 0.2;

  ctx.save();
  ctx.globalAlpha = Math.max(alpha, 0);
  ctx.translate(W / 2, 250);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';

  ctx.font = '900 84px system-ui, sans-serif';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#064e3b';
  ctx.strokeText(b.text, 0, 0);
  ctx.fillStyle = '#fde047';
  ctx.fillText(b.text, 0, 0);

  ctx.font = '700 28px system-ui, sans-serif';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#064e3b';
  ctx.strokeText(b.sub, 0, 46);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(b.sub, 0, 46);
  ctx.restore();
}

function drawWaitingHint(ctx: CanvasRenderingContext2D, g: GameState, now: number): void {
  if (g.waitingAlpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = g.waitingAlpha;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  rect(ctx, W / 2 - 300, H / 2 - 70, 600, 140, 20);
  ctx.fill();
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3;
  rect(ctx, W / 2 - 300, H / 2 - 70, 600, 140, 20);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px system-ui, sans-serif';
  ctx.fillText('Step back so we can see you', W / 2, H / 2 - 14);
  ctx.fillStyle = '#a7f3d0';
  ctx.font = '600 18px system-ui, sans-serif';
  const dot = Math.sin(now * 0.005) > 0 ? '\u25CF' : '\u25CB';
  ctx.fillText(`${dot}  Your shoulders and hands must be visible`, W / 2, H / 2 + 24);
  ctx.restore();
}

// ------------------------------------------------------------------ scene
export function drawScene(ctx: CanvasRenderingContext2D, g: GameState, assets: GameAssets, now: number): void {
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, assets, now);

  const target = g.heldId !== null ? getTarget(g.placed) : null;
  drawShelves(ctx, assets, target ? target.shelf : null, now);
  drawArmBones(ctx, g.arms);

  if (target) {
    const heldItem = g.items.find((it) => it.id === g.heldId);
    drawTargetSlot(ctx, assets, heldItem ? heldItem.kind : null, target, g.targetProximity, now);
    const w = g.heldBy ? g.wrists[g.heldBy] : null;
    if (w) {
      ctx.save();
      ctx.strokeStyle = g.targetProximity ? 'rgba(52, 211, 153, 0.85)' : 'rgba(16, 185, 129, 0.45)';
      ctx.lineWidth = g.targetProximity ? 4 : 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const it of g.items) {
    if (it.state === 'held') continue;
    const hovered = it.id === g.hoverId;
    drawItem(ctx, assets, it.kind, it.x, it.y, {
      lifted: false,
      hovered,
      dwell: hovered ? g.dwellProgress : 0,
      scale: it.scale,
    });

    if (it.state === 'placed' && it.landingBounce > 0) {
      const a = Math.max(0, Math.min(it.landingBounce, 1));
      ctx.save();
      ctx.strokeStyle = `rgba(16, 185, 129, ${a * 0.8})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(it.x, it.y, ITEM_W / 2 + 8 + (1 - a) * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const it of g.items) {
    if (it.state === 'held') {
      drawItem(ctx, assets, it.kind, it.x, it.y, { lifted: true, hovered: false, dwell: 0, scale: it.scale });
    }
  }

  drawMascot(ctx, assets, g.mascotMood, g.mascotMessage, now);
  drawEffects(ctx, g);
  drawBanner(ctx, g);
  drawWaitingHint(ctx, g, now);
}
