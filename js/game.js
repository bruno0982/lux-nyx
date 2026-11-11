// LUX & NYX — moteur du jeu (coop locale, 2 joueurs ou solo)
(() => {
'use strict';
const T = 40, COLS = 32, ROWS = 18, W = 1280, H = 720, GRAV = 2000, STEP = 1 / 120;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const dk = document.createElement('canvas'); dk.width = W; dk.height = H; const dctx = dk.getContext('2d');
const CH_COL = ['#fff', '#ff6b6b', '#3ddbd9', '#a6e22e', '#ff8fd8'];
const LUXC = '#ffd76a', NYXC = '#8f6bff';
const FONT = '"Trebuchet MS","Segoe UI",sans-serif';
const INFO = {};
'ABCD'.split('').forEach((c, i) => INFO[c] = { t: 'door', ch: i + 1 });
'WXYZ'.split('').forEach((c, i) => INFO[c] = { t: 'bridge', ch: i + 1 });
'abcd'.split('').forEach((c, i) => INFO[c] = { t: 'plate', ch: i + 1 });
'pqrs'.split('').forEach((c, i) => INFO[c] = { t: 'heavy', ch: i + 1 });
'ghij'.split('').forEach((c, i) => INFO[c] = { t: 'lever', ch: i + 1 });
'6789'.split('').forEach((c, i) => INFO[c] = { t: 'lantern', ch: i + 1 });
'tuvz'.split('').forEach((c, i) => INFO[c] = { t: 'timer', ch: i + 1 });
'FGHI'.split('').forEach((c, i) => INFO[c] = { t: 'idoor', ch: i + 1 });
INFO.m = { t: 'moon', ch: 0 };
const THEMES = [
  { top: '#06222b', bot: '#14452f', tile: '#2f5d3a', tileD: '#27502f', edge: '#86e08f', deco: 'tree', scale: [262, 294, 330, 392, 440] },
  { top: '#07071a', bot: '#1c1647', tile: '#3a3f6b', tileD: '#31365d', edge: '#8fb8ff', deco: 'crystal', scale: [220, 262, 294, 330, 392] },
  { top: '#221106', bot: '#51300f', tile: '#7a5230', tileD: '#6a4628', edge: '#f0b45a', deco: 'gear', scale: [196, 233, 262, 294, 349] },
  { top: '#040620', bot: '#33246b', tile: '#aab6e0', tileD: '#98a4d0', edge: '#ffffff', deco: 'cloud', scale: [330, 392, 440, 494, 587] }
];

// ---------- sauvegarde
let save = { done: {}, shards: {}, room: {}, mode: 2 };
try { const s = JSON.parse(localStorage.getItem('luxnyx_save2')); if (s) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem('luxnyx_save2', JSON.stringify(save)); } catch (e) {} }
const roomCount = i => 1 + (LEVELS[i].more ? LEVELS[i].more.length : 0);
const roomDef = (i, r) => r ? LEVELS[i].more[r - 1] : LEVELS[i];
const TOTAL_SHARDS = LEVELS.reduce((n, l, i) => n + roomCount(i) * 3, 0);

// ---------- audio
let AC = null, muted = false, musT = 0, musI = 2;
function audioInit() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
function tone(f, d, type, v, f2, delay) {
  if (!AC || muted) return;
  const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v || 0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.03);
}
const SFX = {
  jump: () => tone(430, .12, 'triangle', .05, 660), jump2: () => tone(640, .12, 'triangle', .05, 940),
  njump: () => tone(170, .15, 'triangle', .08, 250), bounce: () => tone(300, .22, 'sine', .08, 900),
  shard: () => { tone(880, .1, 'sine', .06); tone(1320, .2, 'sine', .06, 0, .08); },
  die: () => tone(300, .35, 'sawtooth', .05, 70), door: () => tone(140, .2, 'square', .035, 210),
  lever: () => tone(520, .06, 'square', .04), lantern: () => { tone(660, .15, 'sine', .06); tone(990, .3, 'sine', .05, 0, .1); },
  crack: () => tone(110, .2, 'sawtooth', .07, 50), ui: () => tone(700, .05, 'sine', .04),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .28, 'sine', .07, 0, i * .11)),
  swap: () => tone(500, .07, 'sine', .04, 760)
};
function music(dt) {
  if (!AC || muted) return;
  musT -= dt; if (musT > 0) return;
  const sc = THEMES[lv ? world(lv.i) : 3].scale;
  musI = Math.max(0, Math.min(sc.length - 1, musI + Math.floor(Math.random() * 3) - 1));
  tone(sc[musI] / 2, 1.6, 'sine', .022);
  if (Math.random() < .35) tone(sc[(musI + 2) % sc.length], 1.2, 'sine', .012, 0, .25);
  musT = Math.random() < .3 ? 1.2 : .6;
}

// ---------- entrées
const keys = {}, pressed = {};
addEventListener('keydown', e => {
  if (!keys[e.code]) pressed[e.code] = true; keys[e.code] = true; audioInit();
  if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
cv.addEventListener('click', () => { audioInit(); pressed.Enter = true; });
// ---------- tactile (téléphone / tablette) : boutons à l'écran, pensés pour le mode solo
let touchOn = false, tapQ = [], tHeld = {}, tEdge = {}, tapUI = { ok: false, back: false, tab: false };
const touches = new Map();
// caméra : sur écran tactile, on zoome sur le personnage actif (une salle entière serait minuscule sur un téléphone)
let camX = W / 2, camY = H / 2, camZ = 1, overview = false;
function camFrame(dt) {
  let zt = 1, tx = W / 2, ty = H / 2;
  if (touchOn && !overview && lv && (state === 'play' || state === 'pause' || state === 'win')) {
    zt = cv.clientWidth < 1000 ? 2.1 : 1.6;
    const solo = save.mode === 1, a = active === 0 ? lux : nyx, b = solo ? a : (active === 0 ? nyx : lux);
    tx = (a.x + a.w / 2 + b.x + b.w / 2) / 2; ty = (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 20;
  }
  const k = Math.min(1, dt * 6);
  camZ += (zt - camZ) * k;
  // en zoom, la caméra peut dépasser un peu des bords pour que le personnage ne reste pas caché sous les boutons
  const hw = W / (2 * camZ), hh = H / (2 * camZ), mx = (camZ - 1) * 150, my = (camZ - 1) * 50;
  tx = Math.max(hw - mx, Math.min(W - hw + mx, tx)); ty = Math.max(hh, Math.min(H - hh + my, ty));
  camX += (tx - camX) * k; camY += (ty - camY) * k;
  camX = Math.max(hw - mx, Math.min(W - hw + mx, camX)); camY = Math.max(hh, Math.min(H - hh + my, camY));
}
const TB = { view: { x: 555, y: 32, r: 28 }, left: { x: 105, y: 615, r: 72 }, right: { x: 265, y: 615, r: 72 }, jump: { x: 1170, y: 605, r: 82 }, use: { x: 1005, y: 650, r: 58 }, swap: { x: 1175, y: 430, r: 56 }, pause: { x: 640, y: 32, r: 28 } };
function tpos(t) { const r = cv.getBoundingClientRect(); return { x: (t.clientX - r.left) * W / r.width, y: (t.clientY - r.top) * H / r.height }; }
cv.addEventListener('touchstart', e => { e.preventDefault(); touchOn = true; audioInit(); for (const t of e.changedTouches) { const p = tpos(t); touches.set(t.identifier, p); tapQ.push(p); } }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) touches.set(t.identifier, tpos(t)); }, { passive: false });
// plein écran : doit partir d'un doigt qui se lève (exigence des navigateurs). Automatique au premier toucher, puis bouton dédié.
let fsAsked = false;
const fsPos = () => state === 'play' ? { x: 725, y: 32, r: 28 } : { x: 1228, y: 46, r: 32 };
function goFull(toggle) {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement) { if (toggle) document.exitFullscreen(); return; }
    const rq = el.requestFullscreen || el.webkitRequestFullscreen; if (!rq) return;
    const pr = rq.call(el, { navigationUI: 'hide' });
    if (pr && pr.then) pr.then(() => { try { const l = screen.orientation.lock('landscape'); if (l && l.catch) l.catch(() => {}); } catch (e) {} }).catch(() => {});
  } catch (e) {}
}
const tEnd = e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = touches.get(t.identifier), b = fsPos();
    if (p && Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.3) goFull(true);
    else if (!fsAsked) { fsAsked = true; goFull(false); }
    touches.delete(t.identifier);
  }
};
function drawFs() {
  if (!touchOn) return;
  const b = fsPos(), s = b.r * .42;
  ctx.globalAlpha = .28; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill();
  ctx.globalAlpha = .9; ctx.strokeStyle = '#0b0b18'; ctx.lineWidth = 3.5; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(b.x + sx * s, b.y + sy * s * .35); ctx.lineTo(b.x + sx * s, b.y + sy * s); ctx.lineTo(b.x + sx * s * .35, b.y + sy * s); }
  ctx.stroke(); ctx.globalAlpha = 1;
}
cv.addEventListener('touchend', tEnd, { passive: false }); cv.addEventListener('touchcancel', tEnd, { passive: false });
function touchFrame() {
  const prev = tHeld; tHeld = {}; tEdge = {};
  for (const k in TB) { const b = TB[k]; let h = false; for (const p of touches.values()) if (Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.2) h = true; tHeld[k] = h; tEdge[k] = h && !prev[k]; }
  if (tEdge.view && state === 'play') overview = !overview;
  tapUI = { ok: false, back: false, tab: false };
  const q = tapQ; tapQ = [];
  for (const p of q) {
    if (state === 'menu') { for (let k = 0; k < 3; k++) { const y = 460 + k * 54; if (Math.abs(p.x - W / 2) < 280 && p.y > y - 38 && p.y < y + 18) { menuSel = k; tapUI.ok = true; } } }
    else if (state === 'select') {
      if (p.y < 112 && p.x < 280) tapUI.back = true; else if (p.y > H - 60) tapUI.tab = true;
      else for (let i = 0; i < 20; i++) { const x = 90 + (i % 5) * 224, y = 150 + Math.floor(i / 5) * 128; if (p.x > x && p.x < x + 204 && p.y > y && p.y < y + 108) { selSel = i; tapUI.ok = true; } }
    }
    else if (state === 'pause') { for (let k = 0; k < 5; k++) { const y = 290 + k * 54; if (Math.abs(p.x - W / 2) < 280 && p.y > y - 38 && p.y < y + 18) { pauseSel = k; tapUI.ok = true; } } }
    else if (state === 'story' || state === 'win' || state === 'ending') tapUI.ok = true;
  }
}
let pads = []; const padPrev = [{}, {}];
function pollPads() {
  pads = []; let gps = []; try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) {}
  for (const gp of gps) {
    if (!gp || pads.length >= 2) continue;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    // croix directionnelle : boutons 12-15 (manettes standard) ou axes 6/7 (autres manettes)
    const hx = gp.axes[6] || 0, hy = gp.axes[7] || 0;
    const s = { left: ax < -.4 || b(14) || hx < -.5, right: ax > .4 || b(15) || hx > .5, up: ay < -.6 || b(12) || hy < -.5, down: ay > .5 || b(13) || hy > .5,
      a: b(0), b: b(1), use: b(1) || b(2), x: b(3) || b(4) || b(5), start: b(9) };
    const pv = padPrev[pads.length], p = {};
    for (const k in s) p[k] = s[k] && !pv[k];
    padPrev[pads.length] = s; s.p = p; pads.push(s);
  }
}
const padP = k => pads.some(p => p.p[k]);
const EMPTY = { left: false, right: false, jump: false, down: false, jp: false, dp: false };
const orIn = (...a) => { const o = {}; for (const k in EMPTY) o[k] = a.some(i => i[k]); return o; };
function uiIn() {
  return {
    up: pressed.ArrowUp || pressed.KeyW || padP('up'), down: pressed.ArrowDown || pressed.KeyS || padP('down'),
    left: pressed.ArrowLeft || pressed.KeyA || padP('left'), right: pressed.ArrowRight || pressed.KeyD || padP('right'),
    ok: pressed.Enter || pressed.Space || padP('a') || tapUI.ok, back: pressed.Escape || padP('b') || padP('start') || tapUI.back, tab: pressed.Tab || padP('x') || tapUI.tab
  };
}
function playIn() {
  const solo = save.mode === 1;
  const k1 = { left: !!keys.KeyA, right: !!keys.KeyD, jump: !!(keys.KeyW || (solo && keys.Space)), down: !!keys.KeyS, jp: !!(pressed.KeyW || (solo && pressed.Space)), dp: !!pressed.KeyS };
  const k2 = { left: !!keys.ArrowLeft, right: !!keys.ArrowRight, jump: !!keys.ArrowUp, down: !!keys.ArrowDown, jp: !!pressed.ArrowUp, dp: !!pressed.ArrowDown };
  const g = i => pads[i] ? { left: pads[i].left, right: pads[i].right, jump: pads[i].a, down: pads[i].down || pads[i].use, jp: pads[i].p.a, dp: pads[i].p.down || pads[i].p.use } : EMPTY;
  const kt = touchOn ? { left: !!tHeld.left, right: !!tHeld.right, jump: !!tHeld.jump, down: !!tHeld.use, jp: !!tEdge.jump, dp: !!tEdge.use } : EMPTY;
  if (solo) { const m = orIn(k1, k2, g(0), g(1), kt); return active === 0 ? [m, EMPTY] : [EMPTY, m]; }
  return [orIn(k1, g(0), kt), orIn(k2, g(1))];
}

// ---------- état
let state = 'menu', lv = null, lux = null, nyx = null, active = 0, parts = [], tGlobal = 0;
let menuSel = 0, selSel = 0, pauseSel = 0, talkI = 0, winT = 0, endI = 0, hudT = 0;
const world = i => Math.floor(i / 5);
const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cellRect = (x, y) => ({ x: x * T, y: y * T, w: T, h: T });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function mkPlayer(kind, sp) {
  const lx = kind === 'lux';
  const p = { kind, w: lx ? 22 : 30, h: lx ? 26 : 34, speed: lx ? 260 : 215, jumpV: lx ? 660 : 620, vx: 0, vy: 0, ground: false, air: true, coy: 0, buf: 0, face: 1, dead: false, deadT: 0, onNyx: false, pushing: false, sx: sp.x, sy: sp.y, sq: 0 };
  place(p); return p;
}
function place(p) { p.x = p.sx * T + (T - p.w) / 2; p.y = (p.sy + 1) * T - p.h; p.vx = p.vy = 0; p.dead = false; p.onNyx = false; }

function loadLevel(i, r) {
  r = r || 0;
  const def = roomDef(i, r), g = [];
  for (let y = 0; y < ROWS; y++) { g.push([]); for (let x = 0; x < COLS; x++) g[y].push(x === 0 || x === COLS - 1 || y === 0 || y >= ROWS - 2 ? '#' : '.'); }
  const L = { i, r, def, g, sol: [], dyn: [], crates: [], plates: [], levers: [], lanterns: [], shards: [], movers: [], frag: [], crumb: [], pads: [], foes: [], orbs: [], timers: [], chan: [0, 0, 0, 0, 0], t: 0, exitT: 0, spawn: {}, exit: { x: 29, y: 15 }, deco: [] };
  for (const tok of def.map.trim().split(/\s+/)) {
    const c = tok[0], n = tok.slice(2).split(',').map(Number);
    const x1 = n[0], y1 = n[1], x2 = n.length > 2 ? n[2] : x1, y2 = n.length > 2 ? n[3] : y1;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const inf = INFO[c];
      if (c === '1' || c === '2') L.spawn[c] = { x, y };
      else if (c === 'E') L.exit = { x, y };
      else if (c === '*') L.shards.push({ x, y, got: false });
      else if (c === 'o') L.crates.push({ kind: 'crate', x: x * T + 2, y: y * T, w: 36, h: 40, vy: 0, sx: x, sy: y });
      else if (inf && inf.t === 'plate') L.plates.push({ x, y, ch: inf.ch, heavy: false, on: false });
      else if (inf && inf.t === 'heavy') L.plates.push({ x, y, ch: inf.ch, heavy: true, on: false });
      else if (inf && inf.t === 'lever') L.levers.push({ x, y, ch: inf.ch, on: false });
      else if (inf && inf.t === 'lantern') L.lanterns.push({ x, y, ch: inf.ch, lit: false });
      else if (inf && inf.t === 'timer') L.timers.push({ x, y, ch: inf.ch, t: 0 });
      else if (c === 'T') L.pads.push({ x, y, t: 0 });
      else if (c === 'k') L.foes.push({ x: x * T + 6, y: (y + 1) * T - 24, w: 28, h: 24, dir: 1, alive: true });
      else g[y][x] = c;
    }
  }
  for (let y = 0; y < ROWS; y++) {
    L.sol.push([]);
    for (let x = 0; x < COLS; x++) {
      const inf = INFO[g[y][x]]; L.sol[y].push(false);
      if (inf && (inf.t === 'door' || inf.t === 'bridge' || inf.t === 'moon' || inf.t === 'idoor')) { L.dyn.push({ x, y, t: inf.t, ch: inf.ch }); L.sol[y][x] = inf.t === 'door'; }
      if (g[y][x] === '~') L.frag.push({ x, y, st: 0, t: 0 });
      if (g[y][x] === '=') L.crumb.push({ x, y, st: 0, t: 0 });
    }
  }
  for (const m of def.movers || []) L.movers.push({ kind: 'mover', x: m.x * T, y: m.y * T, w: m.w * T, h: 16, ax: m.x * T, ay: m.y * T, bx: m.bx * T, by: m.by * T, ch: m.ch || 0, dir: 1, pause: 1 });
  for (const o of def.orbs || []) L.orbs.push({ x: o.x * T + 20, y: o.y * T + 20, ax: o.x * T + 20, ay: o.y * T + 20, bx: o.bx * T + 20, by: o.by * T + 20, s: o.s || 90, dir: 1 });
  const r0 = r, th = THEMES[world(i)]; r = rng(i * 977 + 13 + r0 * 31);
  for (let k = 0; k < 14; k++) L.deco.push({ x: r() * W, y: r() * H, s: .5 + r(), a: r() * 6.28, t: th.deco });
  L.stars = []; for (let k = 0; k < 70; k++) L.stars.push({ x: r() * W, y: r() * H * .8, s: r() * 1.6 + .4, p: r() * 6.28 });
  lv = L; lux = mkPlayer('lux', L.spawn['1']); nyx = mkPlayer('nyx', L.spawn['2']); active = 0; parts = [];
}
function startLevel(i, skipStory, r) {
  if (r == null) r = Math.min(save.room[i] || 0, roomCount(i) - 1);
  loadLevel(i, r); talkI = 0; hudT = 0; state = skipStory || r > 0 ? 'play' : 'story';
}
function nextRoom() {
  const i = lv.i, r = lv.r;
  if (r < roomCount(i) - 1) { save.room[i] = r + 1; persist(); startLevel(i, true, r + 1); }
  else if (i < 19) { save.room[i] = 0; persist(); startLevel(i + 1, false, 0); }
  else { save.room[i] = 0; persist(); state = 'ending'; endI = 0; }
}
function laserOn(x, y, c, lead) {
  const d = lv.def.laser || { on: 1.2, off: 1.6, wave: .5 }, ph = (lv.t + (lead || 0) + (c === '|' ? x : y) * d.wave) % (d.on + d.off);
  return ph < d.on;
}

// ---------- collisions
function solid(tx, ty, kind) {
  if (tx < 0 || tx >= COLS || ty < 0) return true;
  if (ty >= ROWS) return false;
  const c = lv.g[ty][tx];
  if (c === '.' || c === 'w' || c === '^' || c === 'x' || c === '-' || c === '|' || c === '!') return false;
  if (c === '#' || c === '~' || c === '%' || c === '=') return true;
  if (c === 'L') return kind !== 'lux';
  if (c === 'N') return kind !== 'nyx';
  return lv.sol[ty][tx];
}
function rects(b) { const o = lv.movers.slice(); for (const c of lv.crates) if (c !== b) o.push(c); return o; }
function moveX(b, dx) {
  if (!dx) return false;
  b.x += dx; let hit = false;
  const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - .01) / T), tx = Math.floor((dx > 0 ? b.x + b.w - .01 : b.x) / T);
  for (let ty = y0; ty <= y1; ty++) if (solid(tx, ty, b.kind)) { b.x = dx > 0 ? tx * T - b.w : (tx + 1) * T; hit = true; break; }
  for (const r of rects(b)) {
    if (!ov(b, r)) continue;
    if (b.kind === 'nyx' && r.kind === 'crate') {
      const pen = dx > 0 ? b.x + b.w - r.x : r.x + r.w - b.x;
      moveX(r, dx > 0 ? pen : -pen); b.pushing = true;
      if (!ov(b, r)) continue;
    }
    b.x = dx > 0 ? r.x - b.w : r.x + r.w; hit = true;
  }
  return hit;
}
function moveY(b, dy) {
  if (!dy) return 0;
  b.y += dy; let hit = 0;
  const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - .01) / T), ty = Math.floor((dy > 0 ? b.y + b.h - .01 : b.y) / T);
  for (let tx = x0; tx <= x1; tx++) {
    if (solid(tx, ty, b.kind)) { b.y = dy > 0 ? ty * T - b.h : (ty + 1) * T; hit = dy > 0 ? 1 : -1; break; }
    // planche : on passe à travers par en dessous, on se pose dessus par au-dessus
    if (dy > 0 && ty < ROWS && lv.g[ty][tx] === '-' && b.y + b.h - dy <= ty * T + .5) { b.y = ty * T - b.h; hit = 1; break; }
  }
  for (const r of rects(b)) { if (!ov(b, r)) continue; b.y = dy > 0 ? r.y - b.h : r.y + r.h; hit = dy > 0 ? 1 : -1; }
  if (b.kind === 'lux' && dy > 0 && !nyx.dead && b.x + b.w > nyx.x + 2 && b.x < nyx.x + nyx.w - 2) {
    const pb = b.y + b.h - dy;
    if (pb <= nyx.y + 6 && b.y + b.h >= nyx.y) { b.y = nyx.y - b.h; hit = 1; b.onNyx = true; }
  }
  return hit;
}
const bodies = () => [lux, nyx].filter(p => !p.dead).concat(lv.crates);

// ---------- particules
function burst(x, y, col, n, sp, grav) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = Math.random() * (sp || 160); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .4 + Math.random() * .5, max: .9, col, size: 2 + Math.random() * 3, grav: grav == null ? 300 : grav }); }
}

// ---------- simulation
function die(p) { if (p.dead) return; lv.deaths = (lv.deaths || 0) + 1; p.dead = true; p.deadT = .8; p.onNyx = false; burst(p.x + p.w / 2, p.y + p.h / 2, p.kind === 'lux' ? LUXC : NYXC, 26, 260); SFX.die(); }
function updPlayer(p, inp, dt) {
  if (p.dead) { p.deadT -= dt; if (p.deadT <= 0) { place(p); burst(p.x + p.w / 2, p.y + p.h / 2, '#fff', 14, 120, 0); } return; }
  const L = lv;
  for (const c of L.crates) if (ov(p, c)) p.x = (p.x + p.w / 2 < c.x + c.w / 2) ? c.x - p.w : c.x + c.w;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), target = dir * p.speed * (p.pushing ? .6 : 1);
  p.pushing = false;
  const acc = (p.ground ? 3200 : 2200) * dt;
  p.vx = p.vx < target ? Math.min(target, p.vx + acc) : Math.max(target, p.vx - acc);
  if (dir) p.face = dir;
  p.coy = p.ground ? .09 : p.coy - dt;
  p.buf = inp.jp ? .12 : p.buf - dt;
  if (p.buf > 0 && p.coy > 0) {
    p.vy = -p.jumpV; p.buf = 0; p.coy = 0; p.ground = false; p.sq = -.25;
    (p.kind === 'lux' ? SFX.jump : SFX.njump)(); burst(p.x + p.w / 2, p.y + p.h, '#ffffff', 5, 70);
  } else if (inp.jp && p.kind === 'lux' && p.air && !p.ground) {
    p.vy = -580; p.air = false; p.buf = 0; p.sq = -.25; SFX.jump2(); burst(p.x + p.w / 2, p.y + p.h, LUXC, 10, 110);
  }
  p.noCut = (p.noCut || 0) - dt;
  if (!inp.jump && p.vy < 0 && p.noCut <= 0) p.vy += 2400 * dt;
  p.vy = Math.min(p.vy + GRAV * dt, 1100);
  if (p.kind === 'lux') {
    const cx = Math.floor((p.x + p.w / 2) / T), cy = Math.floor((p.y + p.h / 2) / T);
    if (cy >= 0 && cy < ROWS && L.g[cy][cx] === 'w') { if (p.vy > -420) p.vy = Math.max(-420, p.vy - 3400 * dt); p.air = true; p.noCut = .1; }
  }
  const dx = p.vx * dt;
  if (moveX(p, dx)) p.vx = 0;
  if (p.kind === 'nyx' && dir) {
    const tx = Math.floor((dir > 0 ? p.x + p.w + 2 : p.x - 2) / T);
    for (let ty = Math.floor(p.y / T); ty <= Math.floor((p.y + p.h - 1) / T); ty++)
      if (tx >= 0 && tx < COLS && L.g[ty] && L.g[ty][tx] === '%') {
        SFX.crack(); const st = [[tx, ty]]; // tout le pan de mur fissuré s'effondre
        while (st.length) { const [x, y] = st.pop(); if (!L.g[y] || L.g[y][x] !== '%') continue; L.g[y][x] = '.'; burst(x * T + 20, y * T + 20, THEMES[world(L.i)].edge, 16, 220); st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
      }
  }
  p.onNyx = false;
  const vy0 = p.vy, hy = moveY(p, p.vy * dt);
  if (hy === 1) { if (!p.ground && vy0 > 320) { p.sq = .3; burst(p.x + p.w / 2, p.y + p.h, '#ffffff', 4, 60); } p.ground = true; p.vy = 0; p.air = true; }
  else { p.ground = false; if (hy === -1) p.vy = 0; }
  if (p.onNyx && vy0 > 150 && inp.jump) { p.vy = -780; p.ground = false; p.air = true; p.sq = -.35; nyx.sq = .35; SFX.bounce(); burst(p.x + p.w / 2, p.y + p.h, NYXC, 12, 150); }
  if (hy === 1) for (const pad of L.pads) if (ov(p, { x: pad.x * T + 2, y: pad.y * T + T - 12, w: T - 4, h: 14 })) {
    p.vy = -860; p.ground = false; p.air = true; p.noCut = .7; p.sq = -.35; pad.t = .3; SFX.bounce(); burst(pad.x * T + 20, pad.y * T + T, '#ff9a5c', 10, 150);
  }
  p.sq *= Math.pow(.002, dt);
  // dangers
  if (p.y > H + 60) return die(p);
  for (let ty = Math.floor(p.y / T); ty <= Math.floor((p.y + p.h - .01) / T); ty++) for (let tx = Math.floor(p.x / T); tx <= Math.floor((p.x + p.w - .01) / T); tx++) {
    if (ty < 0 || ty >= ROWS) continue;
    const c = L.g[ty][tx];
    if ((c === '^' || (c === 'x' && p.kind === 'lux')) && ov(p, { x: tx * T + 10, y: ty * T + 20, w: T - 20, h: 20 })) return die(p);
    if (c === '|' && laserOn(tx, ty, c) && ov(p, { x: tx * T + 14, y: ty * T, w: 12, h: T })) return die(p);
    if (c === '!' && laserOn(tx, ty, c) && ov(p, { x: tx * T, y: ty * T + 14, w: T, h: 12 })) return die(p);
  }
}
function updFoes(dt) {
  const L = lv;
  for (const f of L.foes) {
    if (!f.alive) continue;
    const nx = f.x + f.dir * 70 * dt, tx = Math.floor((f.dir > 0 ? nx + f.w : nx) / T), ty = Math.floor((f.y + f.h - 1) / T);
    const below = L.g[ty + 1] ? L.g[ty + 1][tx] : '.', here = L.g[ty][tx];
    if (solid(tx, ty, 'crate') || !(solid(tx, ty + 1, 'crate') || below === '-') || here === '^' || L.crates.some(c => ov({ x: nx, y: f.y, w: f.w, h: f.h }, c))) f.dir *= -1; else f.x = nx;
    for (const p of [nyx, lux]) {
      if (p.dead || !ov(p, f)) continue;
      if (p.kind === 'nyx' && p.vy > 120 && p.y + p.h < f.y + 16) { f.alive = false; p.vy = -420; p.noCut = .3; SFX.crack(); burst(f.x + 14, f.y + 12, '#ff5a6e', 22, 220); }
      else die(p);
    }
  }
  for (const o of L.orbs) {
    const tx = o.dir > 0 ? o.bx : o.ax, ty = o.dir > 0 ? o.by : o.ay, d = Math.hypot(tx - o.x, ty - o.y);
    if (d < 1) o.dir *= -1; else { const mv = Math.min(d, o.s * dt); o.x += (tx - o.x) / d * mv; o.y += (ty - o.y) / d * mv; }
    for (const p of [nyx, lux]) {
      if (p.dead) continue;
      const qx = Math.max(p.x, Math.min(o.x, p.x + p.w)), qy = Math.max(p.y, Math.min(o.y, p.y + p.h));
      if (Math.hypot(qx - o.x, qy - o.y) < 11) die(p);
    }
  }
}
function updMovers(dt) {
  for (const m of lv.movers) {
    let tx, ty;
    if (m.ch) { const on = lv.chan[m.ch]; tx = on ? m.bx : m.ax; ty = on ? m.by : m.ay; }
    else {
      tx = m.dir > 0 ? m.bx : m.ax; ty = m.dir > 0 ? m.by : m.ay;
      if (Math.abs(tx - m.x) < .01 && Math.abs(ty - m.y) < .01) { m.pause -= dt; if (m.pause <= 0) { m.dir *= -1; m.pause = 1; } continue; }
    }
    const ddx = tx - m.x, ddy = ty - m.y, d = Math.hypot(ddx, ddy);
    if (d < .01) continue;
    const mv = Math.min(d, (m.ch ? 120 : 90) * dt), dx = ddx / d * mv, dy = ddy / d * mv;
    const all = bodies(), riders = all.filter(b => Math.abs(b.y + b.h - m.y) < 3 && b.x + b.w > m.x && b.x < m.x + m.w);
    const nr = { x: m.x + dx, y: m.y + dy, w: m.w, h: m.h };
    if (all.some(b => !riders.includes(b) && ov(b, nr))) continue;
    const extra = riders.includes(nyx) && lux.onNyx && !lux.dead && !riders.includes(lux);
    if (dy < 0) { for (const r of riders) moveY(r, dy); if (extra) moveY(lux, dy); }
    m.x += dx; m.y += dy;
    for (const r of riders) { if (dx) moveX(r, dx); if (dy > 0) r.y = m.y - r.h; }
    if (extra) { if (dx) moveX(lux, dx); if (dy > 0) lux.y += dy; }
  }
}
function updWorld(dt) {
  const L = lv, all = bodies();
  // canaux
  const ch = [0, 0, 0, 0, 0];
  for (const p of L.plates) {
    const s = { x: p.x * T + 8, y: p.y * T + T - 8, w: T - 16, h: 8 };
    const on = all.some(b => (!p.heavy || b.kind !== 'lux') && ov(b, s));
    if (on && !p.on) SFX.lever(); p.on = on; if (on) ch[p.ch] = 1;
  }
  for (const l of L.levers) if (l.on) ch[l.ch] = 1;
  for (const l of L.lanterns) if (l.lit) ch[l.ch] = 1;
  for (const tm of L.timers) if (tm.t > 0) { ch[tm.ch] = 1; tm.t -= dt; }
  for (const pad of L.pads) pad.t -= dt;
  for (const c of L.crumb) {
    if (c.st === 0) { if ([lux, nyx].some(p => !p.dead && p.ground && Math.abs(p.y + p.h - c.y * T) < 1.5 && p.x + p.w > c.x * T && p.x < c.x * T + T)) { c.st = 1; c.t = .45; } }
    else if (c.st === 1) { c.t -= dt; if (c.t <= 0) { L.g[c.y][c.x] = '.'; c.st = 2; c.t = 3; burst(c.x * T + 20, c.y * T + 10, THEMES[world(L.i)].edge, 8, 120); } }
    else { c.t -= dt; if (c.t <= 0 && !all.some(b => ov(b, cellRect(c.x, c.y)))) { L.g[c.y][c.x] = '='; c.st = 0; } }
  }
  for (let i = 1; i < 5; i++) if (ch[i] !== L.chan[i]) SFX.door();
  L.chan = ch;
  // tuiles dynamiques
  const lcx = lux.x + lux.w / 2, lcy = lux.y + lux.h / 2;
  for (const d of L.dyn) {
    let want;
    if (d.t === 'door') want = !ch[d.ch];
    else if (d.t === 'bridge' || d.t === 'idoor') want = !!ch[d.ch];
    else want = !lux.dead && Math.hypot(d.x * T + 20 - lcx, d.y * T + 20 - lcy) < 185;
    if (!want) L.sol[d.y][d.x] = false;
    else if (!L.sol[d.y][d.x]) { const r = cellRect(d.x, d.y); if (!all.some(b => ov(b, r))) L.sol[d.y][d.x] = true; }
  }
  // verre
  for (const f of L.frag) {
    if (f.st === 0) { if (!nyx.dead && nyx.ground && Math.abs(nyx.y + nyx.h - f.y * T) < 1.5 && nyx.x + nyx.w > f.x * T && nyx.x < f.x * T + T) { f.st = 1; f.t = .25; } }
    else if (f.st === 1) { f.t -= dt; if (f.t <= 0) { L.g[f.y][f.x] = '.'; f.st = 2; f.t = 4; burst(f.x * T + 20, f.y * T + 10, '#cfe9ff', 10, 140); SFX.crack(); } }
    else { f.t -= dt; if (f.t <= 0 && !all.some(b => ov(b, cellRect(f.x, f.y)))) { L.g[f.y][f.x] = '~'; f.st = 0; } }
  }
}
function interact(inL, inN) {
  const L = lv;
  for (const [p, inp] of [[lux, inL], [nyx, inN]]) {
    if (p.dead) continue;
    if (inp.dp) for (const l of L.levers) if (ov(p, cellRect(l.x, l.y))) { l.on = !l.on; SFX.lever(); burst(l.x * T + 20, l.y * T + 20, CH_COL[l.ch], 8, 90); }
    if (inp.dp) for (const tm of L.timers) if (ov(p, cellRect(tm.x, tm.y))) { tm.t = L.def.timer || 5; SFX.lever(); burst(tm.x * T + 20, tm.y * T + 24, CH_COL[tm.ch], 8, 90); }
    for (const s of L.shards) if (!s.got && ov(p, { x: s.x * T + 6, y: s.y * T + 6, w: 28, h: 28 })) { s.got = true; SFX.shard(); burst(s.x * T + 20, s.y * T + 20, '#fff6c9', 16, 170, 0); }
  }
  if (!lux.dead) for (const l of L.lanterns) if (!l.lit && ov(lux, cellRect(l.x, l.y))) { l.lit = true; SFX.lantern(); burst(l.x * T + 20, l.y * T + 14, CH_COL[l.ch], 20, 180, 0); }
  const z = { x: (L.exit.x - 1) * T, y: (L.exit.y - 1) * T, w: 3 * T, h: 2 * T };
  if (!lux.dead && !nyx.dead && ov(lux, z) && ov(nyx, z)) { L.exitT += STEP; if (L.exitT > .6) complete(); } else L.exitT = 0;
}
function step(dt, inL, inN) {
  const L = lv; L.t += dt;
  updWorld(dt);
  updMovers(dt);
  for (const c of L.crates) {
    c.vy = Math.min(c.vy + GRAV * dt, 1100);
    if (moveY(c, c.vy * dt)) c.vy = 0;
    if (c.y > H + 80) { c.x = c.sx * T + 2; c.y = c.sy * T; c.vy = 0; }
  }
  const nx = nyx.x, ny = nyx.y, wasDead = nyx.dead;
  updPlayer(nyx, inN, dt);
  if (lux.onNyx && !lux.dead && !nyx.dead && !wasDead) {
    const dx = nyx.x - nx, dy = nyx.y - ny;
    // Lux reste collée sur la tête de Nyx, même quand il saute
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { if (dx) moveX(lux, dx); const gy = nyx.y - lux.h - lux.y; if (gy && Math.abs(gy) < 24) moveY(lux, gy); }
  }
  updPlayer(lux, inL, dt);
  updFoes(dt);
  interact(inL, inN);
}
function complete() {
  const i = lv.i, key = i + '_' + lv.r, last = lv.r >= roomCount(i) - 1;
  if (last) save.done[i] = true;
  const old = save.shards[key] || [false, false, false];
  save.shards[key] = lv.shards.map((s, k) => s.got || !!old[k]);
  persist(); SFX.win(); state = 'win'; winT = 0;
  for (let k = 0; k < 40; k++) burst(lv.exit.x * T + 20, lv.exit.y * T, k % 2 ? LUXC : NYXC, 1, 320, 80);
}
function nextChapter() { for (let i = 0; i < LEVELS.length; i++) if (!save.done[i]) return i; return 0; }
function totalShards() { let n = 0; for (const k in save.shards) n += save.shards[k].filter(Boolean).length; return n; }

// ---------- dessin
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function glow(x, y, r, col, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
function text(s, x, y, size, col, align, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); }
function wrap(s, x, y, maxW, lh, size, col, align) {
  ctx.font = size + 'px ' + FONT; const words = s.split(' '); let line = '';
  for (const w of words) { if (ctx.measureText(line + w).width > maxW && line) { text(line.trim(), x, y, size, col, align); y += lh; line = ''; } line += w + ' '; }
  text(line.trim(), x, y, size, col, align); return y;
}
function starPath(cx, cy, ro, ri, rot) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? ri : ro; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); }
function drawBg(wi, L) {
  const th = THEMES[wi], g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.top); g.addColorStop(1, th.bot); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!L) return;
  for (const s of L.stars) { ctx.globalAlpha = (wi === 3 ? .8 : .3) * (.5 + .5 * Math.sin(tGlobal * 1.5 + s.p)); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.s, s.s); }
  ctx.globalAlpha = 1;
  if (wi === 3) { glow(1040, 130, 150, '#fff7d6', .35); ctx.fillStyle = '#fdf6d8'; ctx.beginPath(); ctx.arc(1040, 130, 46, 0, 6.3); ctx.fill(); }
  for (const d of L.deco) {
    ctx.save(); ctx.globalAlpha = .16; ctx.fillStyle = th.edge; ctx.strokeStyle = th.edge;
    if (d.t === 'tree') { const x = d.x, b = H - 80, h = 180 + d.s * 160; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x, b - h + k * h * .22); ctx.lineTo(x - 40 - k * 22, b - h * .45 + k * h * .22); ctx.lineTo(x + 40 + k * 22, b - h * .45 + k * h * .22); ctx.fill(); } ctx.fillRect(x - 6, b - h * .2, 12, h * .2 + 80); }
    else if (d.t === 'crystal') { const x = d.x, y = d.y < H / 2 ? 0 : H - 80, s = 60 + d.s * 90, up = d.y < H / 2 ? 1 : -1; ctx.beginPath(); ctx.moveTo(x - s * .22, y); ctx.lineTo(x + s * .22, y); ctx.lineTo(x + s * .08, y + up * s); ctx.fill(); }
    else if (d.t === 'gear') { ctx.translate(d.x, d.y); ctx.rotate(tGlobal * .25 * (d.s > 1 ? 1 : -1) + d.a); const r = 30 + d.s * 45; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.stroke(); for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-7, r, 14, 14); } ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); }
    else { const x = (d.x + tGlobal * 8 * d.s) % (W + 300) - 150, y = d.y * .8 + 60, s = 30 + d.s * 30; ctx.globalAlpha = .1; ctx.beginPath(); ctx.arc(x, y, s, 0, 6.3); ctx.arc(x + s, y + 6, s * .8, 0, 6.3); ctx.arc(x - s, y + 8, s * .7, 0, 6.3); ctx.fill(); }
    ctx.restore();
  }
}
function drawTiles(L) {
  const th = THEMES[world(L.i)], g = L.g;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = g[y][x], px = x * T, py = y * T;
    if (c === '.') continue;
    if (c === '#') {
      ctx.fillStyle = (x * 7 + y * 13) % 5 < 2 ? th.tileD : th.tile; ctx.fillRect(px, py, T, T);
      if (y > 0 && g[y - 1][x] !== '#') { ctx.fillStyle = th.edge; ctx.fillRect(px, py, T, 5); ctx.globalAlpha = .25; ctx.fillRect(px, py + 5, T, 4); ctx.globalAlpha = 1; }
    } else if (c === '^') {
      ctx.fillStyle = '#e8ecf5'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + k * 10, py + T); ctx.lineTo(px + k * 10 + 5, py + 16); ctx.lineTo(px + k * 10 + 10, py + T); ctx.fill(); }
    } else if (c === 'x') {
      ctx.strokeStyle = '#b05cff'; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 0; k < 3; k++) { const bx = px + 6 + k * 14, sw = Math.sin(tGlobal * 2 + x + k) * 3; ctx.moveTo(bx, py + T); ctx.quadraticCurveTo(bx + 8 + sw, py + 28, bx + sw - 2, py + 18); }
      ctx.stroke(); ctx.fillStyle = '#2a0f4a'; ctx.fillRect(px, py + 34, T, 6);
    } else if (c === 'w') {
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) { const yy = py + T - ((tGlobal * 140 + k * 20 + x * 11) % T), xx = px + 10 + k * 20; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 12); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(px, py, T, T);
    } else if (c === '~') {
      const f = L.frag.find(f => f.x === x && f.y === y), sh = f && f.st === 1 ? Math.sin(tGlobal * 80) * 2 : 0;
      ctx.fillStyle = 'rgba(190,230,255,.55)'; ctx.fillRect(px + sh, py, T, 12); ctx.strokeStyle = '#eaf7ff'; ctx.lineWidth = 1.5; ctx.strokeRect(px + sh + 1, py + 1, T - 2, 10);
      ctx.beginPath(); ctx.moveTo(px + 8, py + 2); ctx.lineTo(px + 16, py + 10); ctx.moveTo(px + 26, py + 2); ctx.lineTo(px + 22, py + 10); ctx.stroke();
    } else if (c === '%') {
      ctx.fillStyle = th.tileD; ctx.fillRect(px, py, T, T); ctx.strokeStyle = '#111'; ctx.globalAlpha = .7; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(px + 4, py + 6); ctx.lineTo(px + 18, py + 18); ctx.lineTo(px + 12, py + 34); ctx.moveTo(px + 18, py + 18); ctx.lineTo(px + 36, py + 12); ctx.moveTo(px + 22, py + 38); ctx.lineTo(px + 30, py + 24); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = NYXC; ctx.lineWidth = 1; ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
    } else if (c === '-') {
      ctx.fillStyle = '#c9a16a'; ctx.fillRect(px, py, T, 7); ctx.fillStyle = '#7a5a30'; ctx.fillRect(px, py + 7, T, 3); ctx.fillRect(px + 18, py, 2, 7);
    } else if (c === '=') {
      const f = L.crumb.find(f => f.x === x && f.y === y), sh = f && f.st === 1 ? Math.sin(tGlobal * 70) * 2 : 0;
      ctx.fillStyle = th.tileD; ctx.fillRect(px + sh, py, T, 16); ctx.fillStyle = th.edge; ctx.globalAlpha = .6; ctx.fillRect(px + sh, py, T, 3); ctx.globalAlpha = 1;
      ctx.fillStyle = '#0008'; for (let k = 0; k < 4; k++) ctx.fillRect(px + sh + 4 + k * 10, py + 6, 3, 10);
    } else if (c === '|' || c === '!') {
      continue; // lasers dessinés avec les menaces (par-dessus l'obscurité)
    } else if (c === 'L' || c === 'N') {
      const col = c === 'L' ? LUXC : NYXC; ctx.fillStyle = col;
      for (let k = 0; k < 5; k++) { ctx.globalAlpha = .18 + .14 * Math.sin(tGlobal * 3 + k + x + y); ctx.fillRect(px + k * 8, py, 6, T); }
      ctx.globalAlpha = 1;
    } else {
      const inf = INFO[c], so = L.sol[y][x], col = CH_COL[inf.ch];
      if (inf.t === 'idoor') {
        if (so) { ctx.fillStyle = '#1b1b26'; ctx.fillRect(px + 8, py, T - 16, T); ctx.fillStyle = col; for (let k = 0; k < 4; k++) ctx.fillRect(px + 8, py + 3 + k * 10, T - 16, 4); }
        else { ctx.globalAlpha = .35; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(px + 9, py + 1, T - 18, T - 2); ctx.beginPath(); ctx.moveTo(px + 9, py + 1); ctx.lineTo(px + T - 9, py + T - 1); ctx.stroke(); ctx.globalAlpha = 1; }
      } else if (inf.t === 'door') {
        if (so) { ctx.fillStyle = '#1b1b26'; ctx.fillRect(px + 8, py, T - 16, T); ctx.fillStyle = col; ctx.fillRect(px + 12, py, 5, T); ctx.fillRect(px + 23, py, 5, T); ctx.fillRect(px + 8, py + 17, T - 16, 5); }
        else { ctx.globalAlpha = .3; ctx.strokeStyle = col; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeRect(px + 9, py + 1, T - 18, T - 2); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      } else if (inf.t === 'bridge') {
        if (so) { ctx.globalAlpha = .75; ctx.fillStyle = col; ctx.fillRect(px, py, T, 12); ctx.globalAlpha = .2; ctx.fillRect(px, py + 12, T, T - 12); ctx.globalAlpha = 1; }
        else { ctx.globalAlpha = .35; ctx.strokeStyle = col; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, T - 2, 10); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      } else {
        if (so) { ctx.fillStyle = '#eef3ff'; ctx.globalAlpha = .9; rr(px + 1, py, T - 2, 14, 5); ctx.fill(); ctx.globalAlpha = .18; ctx.fillRect(px, py + 14, T, T - 14); ctx.globalAlpha = 1; }
        else { ctx.fillStyle = '#cfd8ff'; ctx.globalAlpha = .3 + .15 * Math.sin(tGlobal * 2 + x); ctx.beginPath(); ctx.arc(px + 20, py + 7, 3, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
      }
    }
  }
}
function drawObjects(L) {
  for (const p of L.plates) {
    const px = p.x * T, py = p.y * T, col = CH_COL[p.ch], h = p.on ? 3 : 7;
    ctx.fillStyle = '#15151f'; ctx.fillRect(px + 2, py + T - 3, T - 4, 3);
    ctx.fillStyle = col; if (p.heavy) { ctx.fillRect(px + 2, py + T - h - 2, T - 4, h + 2); ctx.fillStyle = '#15151f'; ctx.fillRect(px + 16, py + T - h - 1, 8, 2); } else ctx.fillRect(px + 8, py + T - h, T - 16, h);
  }
  for (const l of L.levers) {
    const px = l.x * T + 20, py = l.y * T + T, col = CH_COL[l.ch];
    ctx.fillStyle = '#15151f'; ctx.fillRect(px - 12, py - 6, 24, 6); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, py - 5); const a = l.on ? .6 : -.6; ctx.lineTo(px + Math.sin(a) * 24, py - 5 - Math.cos(a) * 24); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + Math.sin(a) * 24, py - 5 - Math.cos(a) * 24, 6, 0, 6.3); ctx.fill();
  }
  for (const l of L.lanterns) {
    const px = l.x * T + 20, py = l.y * T + 14, col = CH_COL[l.ch];
    if (l.lit) glow(px, py, 70, col, .45);
    ctx.fillStyle = '#15151f'; ctx.fillRect(px - 2, py + 10, 4, 16); ctx.fillRect(px - 8, py + 24, 16, 3);
    ctx.strokeStyle = col; ctx.lineWidth = 3; rr(px - 9, py - 11, 18, 22, 5); ctx.stroke();
    ctx.fillStyle = l.lit ? '#fff4b8' : '#2a2a38'; rr(px - 6, py - 8, 12, 16, 3); ctx.fill();
  }
  for (const tm of L.timers) {
    const px = tm.x * T + 20, py = tm.y * T + 26, col = CH_COL[tm.ch], dur = L.def.timer || 5;
    ctx.fillStyle = '#15151f'; ctx.fillRect(px - 3, py, 6, 14); ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.3); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 11, 0, 6.3); ctx.stroke();
    if (tm.t > 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 9, -Math.PI / 2, -Math.PI / 2 + 6.283 * tm.t / dur); ctx.fill(); }
    else { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py - 6); ctx.lineTo(px, py); ctx.lineTo(px + 4, py + 3); ctx.stroke(); }
  }
  for (const p of L.pads) {
    const px = p.x * T, py = p.y * T + T, up = p.t > 0 ? 8 : 0;
    ctx.strokeStyle = '#8a8fa8'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(px + 8, py - 2 - k * (2 + up / 4)); ctx.lineTo(px + 32, py - 4 - k * (2 + up / 4)); } ctx.stroke();
    ctx.fillStyle = '#ff7a3c'; rr(px + 3, py - 14 - up, T - 6, 6, 3); ctx.fill();
  }
  const ex = L.exit.x * T + 20, ey = L.exit.y * T, pulse = 1 + .08 * Math.sin(tGlobal * 3);
  glow(ex, ey, 90, '#ffffff', .2 + (L.exitT > 0 ? .3 : 0));
  ctx.save(); ctx.translate(ex, ey); ctx.lineWidth = 4;
  ctx.rotate(tGlobal); ctx.strokeStyle = LUXC; ctx.beginPath(); ctx.arc(0, 0, 30 * pulse, 0, 3.6); ctx.stroke();
  ctx.rotate(-tGlobal * 2.2); ctx.strokeStyle = NYXC; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, 3.6); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#fff'; starPath(ex, ey, 9, 4, tGlobal * .5); ctx.fill();
  const old = save.shards[L.i + '_' + L.r] || [];
  L.shards.forEach((s, k) => { if (s.got) return; const sx = s.x * T + 20, sy = s.y * T + 20 + Math.sin(tGlobal * 2.5 + s.x) * 4; glow(sx, sy, 22, '#fff6c9', old[k] ? .15 : .5); ctx.globalAlpha = old[k] ? .35 : 1; ctx.fillStyle = '#fff6c9'; starPath(sx, sy, 9, 4, tGlobal); ctx.fill(); ctx.globalAlpha = 1; });
  for (const m of L.movers) { ctx.fillStyle = '#20202c'; rr(m.x, m.y, m.w, m.h, 5); ctx.fill(); ctx.fillStyle = m.ch ? CH_COL[m.ch] : '#d8d8e8'; ctx.fillRect(m.x + 4, m.y, m.w - 8, 5); }
  for (const c of L.crates) { ctx.fillStyle = '#9a6b3c'; rr(c.x, c.y, c.w, c.h, 4); ctx.fill(); ctx.strokeStyle = '#5b3c1e'; ctx.lineWidth = 3; ctx.strokeRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6); ctx.beginPath(); ctx.moveTo(c.x + 3, c.y + 3); ctx.lineTo(c.x + c.w - 3, c.y + c.h - 3); ctx.moveTo(c.x + c.w - 3, c.y + 3); ctx.lineTo(c.x + 3, c.y + c.h - 3); ctx.stroke(); }
}
function eyes(cx, cy, gap, face, col, r) {
  const blink = (tGlobal * 1.3 + (col === '#1b1030' ? 0 : .5)) % 4 < .12; ctx.fillStyle = col;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * gap + face * 2.5, cy, r, blink ? .8 : r * 1.4, 0, 0, 6.3); ctx.fill(); }
}
function drawLux(p) {
  if (p.dead) return;
  const cx = p.x + p.w / 2, by = p.y + p.h;
  glow(cx, by - 13, 52, LUXC, .4);
  ctx.save(); ctx.translate(cx, by); ctx.scale(1 + p.sq, 1 - p.sq); ctx.rotate(p.vx / 1400);
  ctx.fillStyle = LUXC; ctx.strokeStyle = '#fff6c9'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  starPath(0, -14, 18, 10.5, 0); ctx.fill(); ctx.stroke();
  eyes(0, -13, 4.5, p.face, '#1b1030', 2.2); ctx.restore();
}
function drawNyx(p) {
  if (p.dead) return;
  const cx = p.x + p.w / 2, by = p.y + p.h;
  glow(cx, by - 17, 50, NYXC, .3);
  ctx.save(); ctx.translate(cx, by); ctx.scale(1 + p.sq, 1 - p.sq);
  const g = ctx.createLinearGradient(0, -34, 0, 0); g.addColorStop(0, '#7a55ee'); g.addColorStop(1, '#3c2496');
  ctx.fillStyle = g; rr(-15, -34, 30, 34, 9); ctx.fill(); ctx.strokeStyle = '#b9a2ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#e4d9ff'; ctx.beginPath(); ctx.arc(0, -27, 5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#6a48dc'; ctx.beginPath(); ctx.arc(2.5, -28, 4.3, 0, 6.3); ctx.fill();
  eyes(0, -16, 6, p.face, '#ffffff', 2.6);
  ctx.fillStyle = '#2a1870'; ctx.fillRect(-11, -3, 8, 3); ctx.fillRect(3, -3, 8, 3); ctx.restore();
}
function drawDark(L) {
  dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, W, H); dctx.fillStyle = 'rgba(3,3,12,.88)'; dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => { const g = dctx.createRadialGradient(x, y, r * .25, x, y, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); dctx.fillStyle = g; dctx.fillRect(x - r, y - r, r * 2, r * 2); };
  if (!lux.dead) hole(lux.x + 11, lux.y + 13, 215 + Math.sin(tGlobal * 3) * 5);
  if (!nyx.dead) hole(nyx.x + 15, nyx.y + 17, 105);
  for (const l of L.lanterns) if (l.lit) hole(l.x * T + 20, l.y * T + 14, 170);
  hole(L.exit.x * T + 20, L.exit.y * T, 80);
  for (const s of L.shards) if (!s.got) hole(s.x * T + 20, s.y * T + 20, 34);
  ctx.drawImage(dk, 0, 0);
}
function drawThreats(L) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = L.g[y][x]; if (c !== '|' && c !== '!') continue;
    const px = x * T, py = y * T, on = laserOn(x, y, c), soon = !on && laserOn(x, y, c, .4), v = c === '|';
    if (on) {
      ctx.fillStyle = 'rgba(255,60,90,.25)'; if (v) ctx.fillRect(px + 8, py, 24, T); else ctx.fillRect(px, py + 8, T, 24);
      ctx.fillStyle = '#ff3c5a'; if (v) ctx.fillRect(px + 15, py, 10, T); else ctx.fillRect(px, py + 15, T, 10);
      ctx.fillStyle = '#fff'; if (v) ctx.fillRect(px + 18, py, 4, T); else ctx.fillRect(px, py + 18, T, 4);
    } else {
      ctx.fillStyle = soon ? 'rgba(255,60,90,' + (.4 + .4 * Math.sin(tGlobal * 40)) + ')' : 'rgba(255,60,90,.22)';
      if (v) { ctx.fillRect(px + 19, py + 4, 2, 8); ctx.fillRect(px + 19, py + 24, 2, 8); } else { ctx.fillRect(px + 4, py + 19, 8, 2); ctx.fillRect(px + 24, py + 19, 8, 2); }
    }
  }
  for (const f of L.foes) {
    if (!f.alive) continue;
    const bob = Math.sin(tGlobal * 9 + f.x * .05) * 1.5;
    ctx.fillStyle = '#2a1016'; rr(f.x, f.y + bob, f.w, f.h - bob, 9); ctx.fill(); ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff5a6e'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(f.x + 4 + k * 8, f.y + bob + 2); ctx.lineTo(f.x + 8 + k * 8, f.y + bob - 5); ctx.lineTo(f.x + 12 + k * 8, f.y + bob + 2); ctx.fill(); }
    ctx.fillStyle = '#ffe14a'; ctx.fillRect(f.x + 8 + f.dir * 4, f.y + 9 + bob, 4, 5); ctx.fillRect(f.x + 17 + f.dir * 4, f.y + 9 + bob, 4, 5);
  }
  for (const o of L.orbs) {
    glow(o.x, o.y, 34, '#ff3c5a', .55); ctx.fillStyle = '#ff3c5a'; ctx.beginPath(); ctx.arc(o.x, o.y, 11, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#ffd9df'; ctx.beginPath(); ctx.arc(o.x - 3, o.y - 3, 4, 0, 6.3); ctx.fill();
  }
}
function drawLevel() {
  const L = lv; drawBg(world(L.i), L); drawTiles(L); drawObjects(L); drawNyx(nyx); drawLux(lux);
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1;
  if (L.def.dark) drawDark(L);
  drawThreats(L);
}
function drawHud() {
  const L = lv, solo = save.mode === 1;
  ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(12, 10, 420, 34, 10); ctx.fill();
  text('Chapitre ' + (L.i + 1) + ' — ' + LEVELS[L.i].title + (roomCount(L.i) > 1 ? '   ·   salle ' + (L.r + 1) + '/' + roomCount(L.i) : ''), 26, 33, 18, '#fff', 'left', true);
  L.shards.forEach((s, k) => { ctx.fillStyle = s.got ? '#fff6c9' : 'rgba(255,255,255,.2)'; starPath(W - 90 + k * 28, 28, 10, 4.5, 0); ctx.fill(); });
  const a = hudT < 9 ? 1 : Math.max(.35, 1 - (hudT - 9));
  ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(140, touchOn ? 65 : H - 34, W - 280, 28, 10); ctx.fill();
  text(touchOn ? L.def.hint.replace(/touche BAS/g, 'bouton ▼').replace(/^Lux : Z Q S D — Nyx : flèches\. /, '') : L.def.hint + (solo ? '   [TAB : changer de personnage]' : ''), W / 2, touchOn ? 84 : H - 15, 15, '#e8e8f5', 'center'); ctx.globalAlpha = 1;
  if (touchOn) {
    const btn = (k, label) => { const b = TB[k]; ctx.globalAlpha = tHeld[k] ? .5 : .22; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.fill(); ctx.globalAlpha = .85; text(label, b.x, b.y + b.r * .26, b.r * .75, '#0b0b18', 'center', true); ctx.globalAlpha = 1; };
    btn('left', '◀'); btn('right', '▶'); btn('jump', '▲'); btn('use', '▼'); if (solo) btn('swap', '⇄'); btn('pause', 'II'); btn('view', overview ? '+' : '◎');
  }
  const tag = (p, s, col) => { if (p.dead) return; const px = (p.x + p.w / 2 - camX) * camZ + W / 2, y = (p.y - camY) * camZ + H / 2 - 12 + Math.sin(tGlobal * 5) * 3; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - 7, y - 8); ctx.lineTo(px + 7, y - 8); ctx.lineTo(px, y); ctx.fill(); if (s) text(s, px, y - 13, 13, col, 'center', true); };
  if (solo) tag(active === 0 ? lux : nyx, '', '#fff');
  else if (hudT < 5) { tag(lux, 'J1', LUXC); tag(nyx, 'J2', NYXC); }
  if (L.t < .4) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - L.t / .4) + ')'; ctx.fillRect(0, 0, W, H); }
}
function panel(who, s, footer) {
  const col = who === 'L' ? LUXC : who === 'N' ? NYXC : '#cfd3ea';
  ctx.fillStyle = 'rgba(8,8,20,.88)'; rr(160, H - 210, W - 320, 150, 18); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
  if (who !== '*') text(who === 'L' ? 'LUX' : 'NYX', 200, H - 170, 22, col, 'left', true);
  ctx.font = (who === '*' ? 'italic ' : '') + '24px ' + FONT;
  wrap(s, 200, who === '*' ? H - 150 : H - 132, W - 400, 32, 24, who === '*' ? '#dfe3f5' : '#fff');
  text(footer, W - 190, H - 74, 14, 'rgba(255,255,255,.55)', 'right');
}
function menuList(items, sel, y0) {
  items.forEach((s, k) => { const y = y0 + k * 54, on = k === sel; if (on) { ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(W / 2 - 250, y - 32, 500, 46, 14); ctx.fill(); } text(s, W / 2, y, on ? 28 : 24, on ? '#fff' : 'rgba(255,255,255,.6)', 'center', on); });
}
function drawTitleSky() {
  drawBg(3, null);
  const r = rng(7); for (let k = 0; k < 140; k++) { ctx.globalAlpha = .3 + .5 * Math.abs(Math.sin(tGlobal + k)); ctx.fillStyle = '#fff'; ctx.fillRect(r() * W, r() * H, 1.6, 1.6); } ctx.globalAlpha = 1;
}
function drawTwin(cx, cy, R) {
  const a = tGlobal * 1.2, x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R * .45, x2 = cx - Math.cos(a) * R, y2 = cy - Math.sin(a) * R * .45;
  glow(x1, y1, 70, LUXC, .5); ctx.fillStyle = LUXC; starPath(x1, y1, 20, 10, a); ctx.fill();
  glow(x2, y2, 70, NYXC, .5); ctx.fillStyle = NYXC; starPath(x2, y2, 24, 12, -a); ctx.fill();
}

// ---------- boucle
function update(dt) {
  tGlobal += dt; pollPads(); touchFrame(); camFrame(dt); music(dt);
  const ui = uiIn();
  if (pressed.KeyM) muted = !muted;
  if (pressed.KeyF) { if (document.fullscreenElement) document.exitFullscreen(); else if (cv.requestFullscreen) cv.requestFullscreen().catch(() => {}); }
  for (const p of parts) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.life > 0);
  if (state === 'menu') {
    if (ui.up) { menuSel = (menuSel + 2) % 3; SFX.ui(); } if (ui.down) { menuSel = (menuSel + 1) % 3; SFX.ui(); }
    if (ui.ok) { SFX.ui(); if (menuSel === 2) { state = 'select'; selSel = nextChapter(); } else { save.mode = menuSel === 0 && !(tapUI.ok && pads.length < 2) ? 2 : 1; persist(); startLevel(nextChapter()); } }
  } else if (state === 'select') {
    if (ui.left) selSel = (selSel + 19) % 20; if (ui.right) selSel = (selSel + 1) % 20; if (ui.up) selSel = (selSel + 15) % 20; if (ui.down) selSel = (selSel + 5) % 20;
    if (ui.tab) { save.mode = save.mode === 1 ? 2 : 1; persist(); SFX.ui(); }
    if (ui.ok) { SFX.ui(); startLevel(selSel, false, 0); } else if (ui.back) state = 'menu';
  } else if (state === 'story') {
    if (pressed.Escape) state = 'play';
    else if (ui.ok || pressed.KeyW || pressed.ArrowUp) { talkI++; SFX.ui(); if (talkI >= lv.def.talk.length) state = 'play'; }
  } else if (state === 'play') {
    hudT += dt;
    if (pressed.Escape || pressed.KeyP || padP('start') || tEdge.pause) { state = 'pause'; pauseSel = 0; }
    else if (pressed.KeyR) startLevel(lv.i, true, lv.r);
    else {
      if (save.mode === 1 && (pressed.Tab || pressed.KeyE || pressed.ShiftLeft || pressed.ShiftRight || padP('x') || tEdge.swap)) { active = 1 - active; SFX.swap(); const p = active ? nyx : lux; burst(p.x + p.w / 2, p.y + p.h / 2, '#fff', 8, 90, 0); }
      const [a, b] = playIn(); let n = Math.max(1, Math.round(dt / STEP));
      for (let k = 0; k < n && state === 'play'; k++) step(STEP, k ? Object.assign({}, a, { jp: false, dp: false }) : a, k ? Object.assign({}, b, { jp: false, dp: false }) : b);
    }
  } else if (state === 'pause') {
    if (ui.up) pauseSel = (pauseSel + 4) % 5; if (ui.down) pauseSel = (pauseSel + 1) % 5;
    if (pressed.Escape) state = 'play';
    else if (ui.ok) {
      if (pauseSel === 0) state = 'play'; else if (pauseSel === 1) startLevel(lv.i, true, lv.r);
      else if (pauseSel === 2) nextRoom();
      else if (pauseSel === 3) { save.mode = save.mode === 1 ? 2 : 1; persist(); }
      else state = 'menu';
    }
  } else if (state === 'win') {
    winT += dt;
    const mid = lv.r < roomCount(lv.i) - 1;
    if ((mid && winT > 1.1) || (winT > .6 && (ui.ok || winT > 4))) nextRoom();
  } else if (state === 'ending') {
    if (ui.ok) { endI++; SFX.ui(); if (endI >= ENDING.length) { state = 'menu'; menuSel = 2; } }
  }
  for (const k in pressed) delete pressed[k];
}
function render() {
  if (state === 'menu') {
    drawTitleSky(); drawTwin(W / 2, 170, 120);
    text('LUX & NYX', W / 2, 330, 84, '#fff', 'center', true);
    text("Deux éclats d'une même étoile — une aventure à deux en 20 chapitres", W / 2, 372, 20, '#cfd3ea', 'center');
    const n = nextChapter() + 1;
    menuList(['Jouer à deux  (chapitre ' + n + ')', 'Jouer en solo  (chapitre ' + n + ')', 'Choisir un chapitre'], menuSel, 460);
    text('J1 Lux : Z Q S D     J2 Nyx : flèches     M : son     F : plein écran     Échap : pause', W / 2, H - 64, 15, 'rgba(255,255,255,.6)', 'center');
    text('Manette : A = sauter     B ou X = levier / bouton (ou stick vers le bas)     Y ou gâchettes hautes = changer de personnage en solo', W / 2, H - 42, 15, 'rgba(255,255,255,.6)', 'center');
    text('Éclats retrouvés : ' + totalShards() + ' / ' + TOTAL_SHARDS, W / 2, H - 20, 15, '#fff6c9', 'center');
  } else if (state === 'select') {
    drawTitleSky(); text('Chapitres', W / 2, 70, 40, '#fff', 'center', true);
    for (let i = 0; i < 20; i++) {
      const x = 90 + (i % 5) * 224, y = 150 + Math.floor(i / 5) * 128, on = i === selSel, th = THEMES[world(i)];
      ctx.fillStyle = th.bot; rr(x, y, 204, 108, 14); ctx.fill(); ctx.strokeStyle = on ? '#fff' : th.edge; ctx.lineWidth = on ? 4 : 1.5; ctx.globalAlpha = on ? 1 : .6; ctx.stroke(); ctx.globalAlpha = 1;
      text(String(i + 1), x + 16, y + 40, 30, '#fff', 'left', true); text(LEVELS[i].title, x + 16, y + 68, 15, '#e8e8f5');
      let got = 0; for (let r = 0; r < roomCount(i); r++) got += (save.shards[i + '_' + r] || []).filter(Boolean).length;
      ctx.fillStyle = '#fff6c9'; starPath(x + 24, y + 90, 8, 3.6, 0); ctx.fill(); text(got + ' / ' + roomCount(i) * 3 + '     ' + roomCount(i) + (roomCount(i) > 1 ? ' salles' : ' salle'), x + 40, y + 95, 13, '#e8e8f5');
      if (save.done[i]) text('✓', x + 178, y + 36, 22, '#86e08f', 'center', true);
    }
    text(WORLDS[world(selSel)].name, W / 2, 104, 20, THEMES[world(selSel)].edge, 'center');
    if (touchOn) { text('◀ Retour', 40, 74, 22, '#fff', 'left', true); text('Touchez un chapitre pour jouer     ·     touchez ici pour changer de mode : ' + (save.mode === 1 ? 'SOLO' : 'DEUX JOUEURS'), W / 2, H - 24, 17, '#fff', 'center'); }
    else text('Entrée : jouer     TAB : mode ' + (save.mode === 1 ? 'SOLO' : 'DEUX JOUEURS') + '     Échap : retour', W / 2, H - 24, 17, '#fff', 'center');
  } else if (state === 'ending') {
    drawTitleSky(); drawTwin(W / 2, 250, 130);
    const e = ENDING[Math.min(endI, ENDING.length - 1)]; panel(e[0], e[1], 'Entrée ▸');
    text('Éclats retrouvés : ' + totalShards() + ' / ' + TOTAL_SHARDS, W / 2, 40, 16, '#fff6c9', 'center');
  } else {
    ctx.fillStyle = '#05050c'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(camZ, camZ); ctx.translate(-camX, -camY); drawLevel(); ctx.restore();
    if (state === 'story') {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H);
      text(WORLDS[world(lv.i)].name, W / 2, 150, 22, THEMES[world(lv.i)].edge, 'center');
      text('Chapitre ' + (lv.i + 1), W / 2, 215, 56, '#fff', 'center', true); text(lv.def.title, W / 2, 262, 30, '#e8e8f5', 'center');
      const e = lv.def.talk[Math.min(talkI, lv.def.talk.length - 1)]; panel(e[0], e[1], touchOn ? 'Touchez l\'écran ▸' : 'Entrée ▸    Échap : passer');
    } else {
      drawHud();
      if (state === 'pause') {
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H); text('Pause', W / 2, 190, 52, '#fff', 'center', true);
        menuList(['Reprendre', 'Recommencer la salle', 'Passer cette salle', 'Mode : ' + (save.mode === 1 ? 'solo' : 'deux joueurs'), 'Menu principal'], pauseSel, 290);
      } else if (state === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,' + Math.min(.6, winT) + ')'; ctx.fillRect(0, 0, W, H);
        const mid = lv.r < roomCount(lv.i) - 1;
        text(mid ? 'Salle ' + (lv.r + 1) + '/' + roomCount(lv.i) + ' franchie' : 'Chapitre ' + (lv.i + 1) + ' terminé !', W / 2, 310, mid ? 38 : 50, '#fff', 'center', true);
        lv.shards.forEach((s, k) => { ctx.fillStyle = s.got ? '#fff6c9' : 'rgba(255,255,255,.2)'; starPath(W / 2 - 60 + k * 60, 380, 22, 10, 0); ctx.fill(); });
        if (!mid) text('Entrée pour continuer', W / 2, 450, 18, 'rgba(255,255,255,.7)', 'center');
      }
    }
  }
  drawFs();
  if (muted) text('son coupé', W - 16, H - 10, 12, 'rgba(255,255,255,.5)', 'right');
}
let last = 0;
function frame(t) { const dt = Math.min(.05, (t - last) / 1000 || 0); last = t; update(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// accès test (console)
window.__G = {
  load(i, mode, r) { save.mode = mode || 2; startLevel(i, true, r || 0); },
  rooms: i => roomCount(i),
  snap() { return JSON.stringify({ lv, lux, nyx, state }); },
  restore(s) { const o = JSON.parse(s); lv = o.lv; lux = o.lux; nyx = o.nyx; state = o.state; },
  laserOn: (x, y, c, lead) => laserOn(x, y, c, lead),
  sim(n, f) {
    for (let k = 0; k < n && state === 'play'; k++) {
      const r = f(k) || [], A = Object.assign({}, EMPTY, r[0]), B = Object.assign({}, EMPTY, r[1]);
      step(STEP, A, B); step(STEP, Object.assign({}, A, { jp: false, dp: false }), Object.assign({}, B, { jp: false, dp: false }));
    }
    return this.info();
  },
  info() { return { state, lux: { x: Math.round(lux.x), y: Math.round(lux.y), dead: lux.dead, g: lux.ground }, nyx: { x: Math.round(nyx.x), y: Math.round(nyx.y), dead: nyx.dead, g: nyx.ground }, chan: lv.chan.join(''), crates: lv.crates.map(c => [Math.round(c.x), Math.round(c.y)]), foes: lv.foes.filter(f => f.alive).map(f => Math.round(f.x)) }; },
  get lv() { return lv; }, get lux() { return lux; }, get nyx() { return nyx; }
};
})();
