import * as THREE from 'three';
import './styles.css';
import { World } from './world/world.js';
import { Generator, BIOME_NAMES, nearestStronghold } from './world/generator.js';
import { CS, CH, DAY_LENGTH } from './world/constants.js';
import { B, BLOCKS, SH, SHAPE, SOLID, HEIGHT, TILES } from './world/blocks.js';
import { buildTextures, crackTextures, blockFaceCanvas, tileCanvases } from './render/textures.js';
import { createMaterials } from './render/materials.js';
import { Sky } from './render/sky.js';
import { iconCanvas } from './render/icons.js';
import { Player, PW, PH } from './player/player.js';
import { aabbIntersectsBlock } from './player/physics.js';
import { Inventory } from './game/inventory.js';
import { I, ITEMS, blockDrops, breakTime, canHarvest, maxStack, maxDurability } from './game/items.js';
import { SMELT } from './game/crafting.js';
import { Drops, Projectiles, Mobs } from './game/entities.js';
import { sfx, resumeAudio, setVolume, updateAmbient } from './game/audio.js';
import * as Save from './game/save.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');

// ---------------- settings ----------------
const DEFAULTS = { rd: 8, fov: 75, sens: 1, vol: 0.7, shadow: 'high', bob: 1 };
const settings = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('ic-settings') || '{}'));
const saveSettings = () => localStorage.setItem('ic-settings', JSON.stringify(settings));

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: AUTO });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
$('view').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x88aaff, 60, 120);
const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.06, 1200);
camera.rotation.order = 'YXZ';

const atlas = buildTextures();
const mats = createMaterials(atlas);
const cracks = crackTextures();
const sky = new Sky(scene);
sky.setShadowQuality(settings.shadow);

// selection + crack overlay
const selBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
);
selBox.visible = false; scene.add(selBox);
const crackMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const crackBox = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), crackMat);
crackBox.visible = false; scene.add(crackBox);

// ---------------- hand (first-person held item) ----------------
const handScene = new THREE.Scene();
const handCam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
const handAmb = new THREE.AmbientLight(0xffffff, 1.2); handScene.add(handAmb);
const handDir = new THREE.DirectionalLight(0xffffff, 1.6); handDir.position.set(-1, 2, 1); handScene.add(handDir);
const handGroup = new THREE.Group(); handScene.add(handGroup);
let handHeldId = -1, swing = 0, handBob = 0;

function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rebuildHand(id) {
  handHeldId = id;
  while (handGroup.children.length) { const c = handGroup.children.pop(); c.geometry?.dispose(); }
  const it = ITEMS[id];
  let m;
  if (!it) {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.75), new THREE.MeshLambertMaterial({ color: 0xd8a27c }));
    m.position.set(0.5, -0.45, -0.55); m.rotation.set(0.15, -0.1, 0.1);
  } else if (it.block && !it.flat) {
    const bh = BLOCKS[id]?.height || 1;
    const faces = [0, 1, 2, 3, 4, 5].map(f => new THREE.MeshLambertMaterial({ map: canvasTex(blockFaceCanvas(id, f)), transparent: true, alphaTest: 0.4 }));
    m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4 * bh, 0.4), faces);
    m.position.set(0.55, -0.5, -0.8); m.rotation.set(0.1, 0.75, 0);
  } else {
    m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshLambertMaterial({ map: canvasTex(iconCanvas(id)), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    m.position.set(0.52, -0.38, -0.75); m.rotation.set(0, -1.2, 0.25);
  }
  handGroup.add(m);
}

// ---------------- particles ----------------
const particles = [];
const pGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);

function burst(x, y, z, id, n = 14) {
  const def = BLOCKS[id];
  if (!def) return;
  const cv = tileCanvases[TILES[def.faces[0]]];
  if (!cv) return;
  const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < n; i++) {
    let k = (Math.floor(Math.random() * cv.width * cv.height)) * 4;
    if (data[k + 3] < 50) k = (cv.width * cv.height / 2) * 4;
    const col = new THREE.Color(data[k] / 255, data[k + 1] / 255, data[k + 2] / 255).convertSRGBToLinear();
    if (def.tint || def.tintTop) col.multiply(new THREE.Color(0.45, 0.72, 0.3));
    const m = new THREE.Mesh(pGeo, new THREE.MeshLambertMaterial({ color: col }));
    m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
    scene.add(m);
    particles.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 4 + 1, (Math.random() - 0.5) * 3), life: 0.6 + Math.random() * 0.5 });
  }
}

function burstColor(pos, hex, n = 20, speed = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: hex }));
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
    scene.add(m);
    particles.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1, (Math.random() - 0.5) * speed), life: 0.5 + Math.random() * 0.6 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; p.v.y -= 16 * dt;
    p.m.position.addScaledVector(p.v, dt);
    const b = game.world ? game.world.getBlock(p.m.position.x, p.m.position.y, p.m.position.z) : 0;
    if (b > 0 && SOLID[b]) p.v.set(0, 0, 0);
    p.m.scale.setScalar(Math.max(0.01, p.life * 1.5));
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
  }
}

// ---------------- game state ----------------
const game = {
  state: 'title',
  world: null, gen: null, meta: null, savedChunks: new Map(), preview: false,
  dim: 'overworld',
  player: new Player(),
  inventory: new Inventory(),
  drops: new Drops(scene),
  projs: new Projectiles(scene),
  mobs: new Mobs(scene),
  furnaces: new Map(),
  chests: new Map(),
  bowDraw: 0,
  sfx,
  dropStack(s) {
    const p = this.player;
    const dir = p.lookDir();
    this.drops.spawn(s.id, s.count, p.eye().addScaledVector(dir, 0.3).add(new THREE.Vector3(0, -0.3, 0)), dir.multiplyScalar(6).add(new THREE.Vector3(0, 1.5, 0)), s.dur);
  },
  smeltable(id) { return SMELT[id] !== undefined; },
};

// Armor damage reduction hook
game.player.onArmorDamage = (raw) => {
  const pts = game.inventory.armorPoints();
  if (pts <= 0) return raw;
  if (game.inventory.damageArmor(1)) sfx.break('metal');
  return Math.max(0.5, raw * (1 - Math.min(0.8, pts * 0.04)));
};

const ui = new UI(game);
setVolume(settings.vol);

const input = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false, sprintTap: false, usingBow: false };
let leftDown = false, rightDown = false, useCooldown = 0, breakCooldown = 0;
let breaking = null;
let showDebug = false, lastSpace = 0, lastWTap = 0, ignoreUnlock = false;
let fps = 0, fpsAcc = 0, fpsN = 0;

// ---------------- world & dimension lifecycle ----------------
function applyDimVisuals(dim) {
  game.dim = dim;
  sky.setDimension(dim);
  mats.shared.uMinLight.value = dim === 'end' ? 0.38 : dim === 'nether' ? 0.34 : 0.05;
}

function disposeWorld() {
  if (game.world) game.world.dispose();
  game.world = null;
  game.drops.clear();
  game.projs.clear();
  game.mobs.clear();
  for (const p of particles) scene.remove(p.m);
  particles.length = 0;
}

function startPreview() {
  disposeWorld();
  const seed = Math.floor(Math.random() * 1e9);
  game.preview = true;
  applyDimVisuals('overworld');
  game.gen = new Generator(seed, 'overworld');
  game.world = new World(scene, seed, mats, new Map(), 'overworld');
  game.world.setRenderDistance(Math.min(settings.rd, 7));
  game.world.shadowDist = 3;
  const sp = game.gen.findSpawn();
  game.previewCenter = new THREE.Vector3(sp.x, sp.y, sp.z);
  game.previewTime = 0.08 + Math.random() * 0.25;
  game.state = 'title';
  ui.show('title');
  $('hud').classList.add('hidden');
}

async function startWorld(meta) {
  disposeWorld();
  game.preview = false;
  game.meta = meta;
  game.state = 'loading';
  ui.show('loading');
  $('loading-text').textContent = 'ワールドを読み込み中...';
  game.savedChunks = meta.temp ? new Map() : await Save.loadChunks(meta.id, CS * CS * CH);
  const dim = meta.dim || 'overworld';
  applyDimVisuals(dim);
  game.gen = new Generator(meta.seed, dim);
  game.world = new World(scene, meta.seed, mats, game.savedChunks, dim);
  game.world.setRenderDistance(settings.rd);
  game.world.shadowDist = settings.shadow === 'ultra' ? 6 : 4;

  const p = game.player;
  p.mode = meta.mode;
  const inv = game.inventory;
  inv.slots = new Array(36).fill(null);
  inv.armor = [null, null, null, null];
  inv.selected = 0;
  game.furnaces = new Map(meta.furnaces || []);
  game.chests = new Map(meta.chests || []);
  game.needPortalFrame = false;

  if (meta.player) {
    const s = meta.player;
    p.pos.set(s.x, s.y, s.z); p.yaw = s.yaw; p.pitch = s.pitch;
    p.health = s.health; p.hunger = s.hunger; p.saturation = s.sat ?? 5; p.flying = !!s.flying;
    p.spawn.set(s.sx, s.sy, s.sz);
    p.spawnDim = s.sdim || 'overworld';
    inv.load(meta.inventory);
    game.needPlace = false;
  } else {
    const sp = game.gen.findSpawn();
    p.pos.set(sp.x, sp.y, sp.z); p.spawn.copy(p.pos); p.spawnDim = 'overworld';
    p.yaw = dim === 'end' ? Math.PI / 2 : 0; p.pitch = 0;
    p.health = 20; p.hunger = 20; p.saturation = 5; p.flying = false;
    game.needPlace = dim !== 'end';
    if (meta.mode === 'creative') {
      [B.GRASS, B.STONE, B.PLANKS, B.TNT, I.FLINT_AND_STEEL, B.OBSIDIAN, I.BOW, I.EYE_OF_ENDER, B.CRAFTING_TABLE].forEach((id, i) => {
        inv.slots[i] = { id, count: maxStack(id) };
        const md = maxDurability(id);
        if (md > 0) inv.slots[i].dur = md;
      });
    }
  }
  p.vel.set(0, 0, 0); p.dead = false; p.air = 10; p.fallStart = null; p.portalTime = 0; p.portalCooldown = 1.5;
  if (dim === 'end') setupEndBoss();
  else for (const m of meta.mobs || []) game.mobs.spawn(m[0], m[1], m[2], m[3]);
  rebuildHand(-2);
}

function setupEndBoss() {
  game.projs.spawnEndCrystals(game.meta.seed);
  if (!game.meta.dragonKilled) {
    game.mobs.spawn('dragon', 0, 78, -28);
  }
}

function switchDimension(targetDim) {
  if (!game.world || game.dim === targetDim) return;
  const p = game.player;
  const prevDim = game.dim;
  disposeWorld();
  game.meta.dim = targetDim;
  applyDimVisuals(targetDim);
  game.gen = new Generator(game.meta.seed, targetDim);
  game.world = new World(scene, game.meta.seed, mats, game.savedChunks, targetDim);
  game.world.setRenderDistance(settings.rd);
  game.world.shadowDist = settings.shadow === 'ultra' ? 6 : 4;

  game.needPortalFrame = false;
  if (targetDim === 'nether') {
    p.pos.set(Math.round(p.pos.x / 4) + 0.5, 56, Math.round(p.pos.z / 4) + 0.5);
    game.needPlace = true;
    game.needPortalFrame = true;
  } else if (targetDim === 'overworld' && prevDim === 'nether') {
    p.pos.set(Math.round(p.pos.x * 4) + 0.5, 80, Math.round(p.pos.z * 4) + 0.5);
    game.needPlace = true;
    game.needPortalFrame = true;
  } else if (targetDim === 'end') {
    p.pos.set(50.5, 59.05, 0.5);
    p.yaw = Math.PI / 2; p.pitch = 0;
    game.needPlace = false;
    setupEndBoss();
  } else {
    p.pos.copy(p.spawn);
    game.needPlace = true;
  }
  p.vel.set(0, 0, 0);
  p.fallStart = null;
  p.portalTime = 0;
  p.portalCooldown = 3.5;
  sfx.portal();
  game.state = 'loading';
  $('hud').classList.add('hidden');
  ui.show('loading');
  $('loading-bar').style.width = '0%';
  $('loading-text').textContent = targetDim === 'nether' ? 'ネザーへ移動中...' : targetDim === 'end' ? 'ジ・エンドへ移動中...' : 'オーバーワールドへ帰還中...';
}

function buildArrivalNetherPortal(wx, wy, wz) {
  const w = game.world;
  // Clear 5x5x5 space + solid platform + 4x5 Obsidian Nether Portal offset by +2 in Z
  for (let dz = -2; dz <= 3; dz++) for (let dx = -2; dx <= 2; dx++) {
    w.setBlock(wx + dx, wy - 1, wz + dz, game.dim === 'nether' ? B.NETHERRACK : B.STONE_BRICKS);
    for (let dy = 0; dy <= 4; dy++) w.setBlock(wx + dx, wy + dy, wz + dz, B.AIR);
  }
  const pz = wz + 2;
  for (let dx = -1; dx <= 2; dx++) {
    for (let dy = 0; dy <= 4; dy++) {
      const border = dx === -1 || dx === 2 || dy === 0 || dy === 4;
      w.setBlock(wx + dx, wy + dy, pz, border ? B.OBSIDIAN : B.NETHER_PORTAL);
    }
  }
}

function finishLoading() {
  const p = game.player, w = game.world;
  if (game.needPlace) {
    let y = w.topSolid(p.pos.x, p.pos.z);
    if (y < 2) y = game.dim === 'nether' ? 54 : 68;
    p.pos.y = y + 1.02;
    if (!game.meta.player && game.dim === 'overworld') p.spawn.copy(p.pos);
    game.needPlace = false;
    if (game.needPortalFrame) {
      // Check if a portal already exists within 10 blocks; otherwise build arrival portal
      let found = false;
      const bx = Math.floor(p.pos.x), by = Math.floor(p.pos.y), bz = Math.floor(p.pos.z);
      for (let dz = -10; dz <= 10 && !found; dz++) for (let dx = -10; dx <= 10 && !found; dx++) for (let dy = -12; dy <= 12 && !found; dy++) {
        if (w.getBlock(bx + dx, by + dy, bz + dz) === B.NETHER_PORTAL) {
          p.pos.set(bx + dx + 0.5, by + dy + 0.05, bz + dz + 1.5);
          found = true;
        }
      }
      if (!found) buildArrivalNetherPortal(bx, Math.floor(p.pos.y), bz);
      game.needPortalFrame = false;
    }
  }
  if (game.dim === 'end' && game.meta.dragonKilled) lightEndExitPortal();
  game.state = 'play';
  ui.show(null);
  $('hud').classList.remove('hidden');
  lockPointer();
  const dimMsg = game.dim === 'nether' ? '🔥 ネザー — 要塞とブレイズを探そう！'
    : game.dim === 'end' ? '🐉 ジ・エンド — クリスタルを破壊してエンダードラゴンを倒せ！'
    : (p.mode === 'creative' ? 'クリエイティブモード（Eでレシピ・装備タブも利用可能）' : 'サバイバルモード — Eでレシピブックを開けます');
  ui.toast(dimMsg, 3000);
}

function lightEndExitPortal() {
  const w = game.world;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dz === 0) continue;
    w.setBlock(dx, 60, dz, B.END_PORTAL);
  }
}

function onDragonKilled(pos) {
  if (game.meta.dragonKilled) return;
  game.meta.dragonKilled = true;
  sfx.explode(1.4);
  sfx.levelup();
  burstColor(pos, 0xe860ff, 60, 12);
  lightEndExitPortal();
  game.world.setBlock(0, 64, 0, B.DRAGON_EGG);
  game.drops.spawn(I.DIAMOND, 8, new THREE.Vector3(2, 62, 0));
  game.drops.spawn(I.GOLDEN_APPLE, 2, new THREE.Vector3(-2, 62, 0));
  ui.toast('🏆 エンダードラゴンを討伐しました！中央にドラゴンの卵と帰還ポータルが出現！', 6000);
  saveGame();
}

function serializeMeta() {
  const p = game.player, m = game.meta;
  m.dim = game.dim;
  m.player = {
    x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch,
    health: p.health, hunger: p.hunger, sat: p.saturation, flying: p.flying,
    sx: p.spawn.x, sy: p.spawn.y, sz: p.spawn.z, sdim: p.spawnDim,
  };
  m.mode = p.mode;
  m.inventory = game.inventory.serialize();
  m.furnaces = [...game.furnaces.entries()];
  m.chests = [...game.chests.entries()];
  if (game.dim === 'overworld') m.mobs = game.mobs.serialize();
  m.lastPlayed = Date.now();
  return m;
}

async function saveGame() {
  if (!game.meta || game.preview || game.meta.temp || !game.world) return;
  try { await Save.saveWorld(serializeMeta(), game.savedChunks); } catch (e) { console.error('save failed', e); }
}

// ---------------- pointer lock ----------------
function lockPointer() { if (AUTO) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignore */ } }
function unlockPointer() { if (document.pointerLockElement) { ignoreUnlock = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    leftDown = rightDown = false; breaking = null; game.bowDraw = 0; input.usingBow = false;
    for (const k in input) input[k] = false;
    if (ignoreUnlock) { ignoreUnlock = false; return; }
    if (game.state === 'play') pause();
  }
});
canvas.addEventListener('click', () => { resumeAudio(); if (game.state === 'play' && document.pointerLockElement !== canvas) lockPointer(); });

function pause() { game.state = 'pause'; ui.show('pause'); saveGame(); }
function resume() { game.state = 'play'; ui.show(null); lockPointer(); }

function openContainer(kind, data) {
  game.state = 'container';
  unlockPointer();
  ui.openContainer(kind, data);
}
function closeContainer() {
  ui.closeContainer();
  game.state = 'play';
  lockPointer();
}

// ---------------- input ----------------
const KEYMAP = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'jump', ShiftLeft: 'sneak', ShiftRight: 'sneak',
  ControlLeft: 'sprint', ControlRight: 'sprint',
};

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  resumeAudio();
  if (e.code === 'F3') { e.preventDefault(); showDebug = !showDebug; $('debug').classList.toggle('hidden', !showDebug); return; }
  if (e.code === 'F11' && !window.api) { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); return; }
  if (game.state === 'container') {
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); closeContainer(); }
    return;
  }
  if (game.state === 'pause' && e.code === 'Escape') { resume(); return; }
  if (game.state !== 'play') return;
  if (KEYMAP[e.code]) {
    e.preventDefault();
    input[KEYMAP[e.code]] = true;
    if (e.code === 'KeyW' && !e.repeat) {
      const now = performance.now();
      if (now - lastWTap < 330) { input.sprintTap = true; lastWTap = 0; }
      else lastWTap = now;
    }
    if (e.code === 'Space' && !e.repeat) {
      const now = performance.now();
      if (now - lastSpace < 300) { game.player.toggleFly(); lastSpace = 0; } else lastSpace = now;
    }
  }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) game.inventory.selected = n - 1; }
  if (e.code === 'KeyE') openContainer('inventory');
  if (e.code === 'KeyQ') {
    const inv = game.inventory, s = inv.held;
    if (s) {
      const n = e.ctrlKey ? s.count : 1;
      game.dropStack({ id: s.id, count: n, dur: s.dur });
      inv.consumeHeld(n);
    }
  }
  if (e.ctrlKey && (e.code === 'KeyW' || e.code === 'KeyR' || e.code === 'KeyS')) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false;
});
window.addEventListener('blur', () => { for (const k in input) input[k] = false; leftDown = rightDown = false; game.bowDraw = 0; });

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || game.state !== 'play') return;
  const p = game.player, k = 0.0022 * settings.sens;
  p.yaw -= e.movementX * k;
  p.pitch -= e.movementY * k;
  p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
});

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || game.state !== 'play') return;
  if (e.button === 0) { leftDown = true; attackOrStart(); }
  if (e.button === 2) { rightDown = true; useCooldown = 0; }
  if (e.button === 1) { e.preventDefault(); pickBlock(); }
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { leftDown = false; breaking = null; }
  if (e.button === 2) {
    if (game.bowDraw > 0) releaseBow();
    rightDown = false;
    input.usingBow = false;
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (game.state !== 'play') return;
  const inv = game.inventory;
  inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
  game.bowDraw = 0; input.usingBow = false;
}, { passive: true });

// ---------------- explosions, portals & world mechanics ----------------
function explode(center, radius, cause = 'explosion') {
  const w = game.world;
  if (!w) return;
  sfx.explode(radius / 3);
  burstColor(center, 0xff9830, 32, 10);
  burstColor(center, 0xdddddd, 24, 7);

  const rCeil = Math.ceil(radius);
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  for (let y = cy - rCeil; y <= cy + rCeil; y++) {
    if (y < 1 || y >= CH) continue;
    for (let z = cz - rCeil; z <= cz + rCeil; z++) {
      for (let x = cx - rCeil; x <= cx + rCeil; x++) {
        const d = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z);
        if (d > radius * (0.8 + Math.random() * 0.35)) continue;
        const b = w.getBlock(x, y, z);
        if (b <= 0) continue;
        if (b === B.TNT) {
          w.setBlock(x, y, z, B.AIR);
          game.projs.spawnTNT(x + 0.5, y, z + 0.5, 0.45 + Math.random() * 0.7);
          continue;
        }
        const def = BLOCKS[b];
        if (!def || def.hardness < 0 || def.hardness >= 40) continue; // Bedrock, Obsidian, Portal frames survive
        w.setBlock(x, y, z, B.AIR);
        dropContainerContents(b, x, y, z);
        if (Math.random() < 0.32) {
          for (const [did, n] of blockDrops(b, Math.random)) {
            if (n > 0) game.drops.spawn(did, n, new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5));
          }
        }
      }
    }
  }

  // Damage mobs & player
  const blastR = radius * 2.1;
  for (const m of game.mobs.list) {
    if (m.dead) continue;
    const mp = m.pos.clone().add(new THREE.Vector3(0, m.T.h * 0.5, 0));
    const d = mp.distanceTo(center);
    if (d < blastR) {
      const f = 1 - d / blastR;
      const dmg = Math.max(1, Math.round(f * f * radius * 9));
      const dir = mp.sub(center).normalize();
      game.mobs.hit(m, dmg, dir, game.drops, sfx, false);
    }
  }
  const p = game.player;
  const pp = p.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  const dp = pp.distanceTo(center);
  if (dp < blastR) {
    const f = 1 - dp / blastR;
    const dmg = Math.max(1, Math.round(f * f * radius * 7));
    p.damage(dmg, events, cause);
    const dir = pp.sub(center).normalize();
    p.vel.addScaledVector(dir, f * 12);
    p.vel.y += f * 6;
  }
}

function dropContainerContents(id, x, y, z) {
  const k = `${game.dim}:${x},${y},${z}`;
  const kLegacy = `${x},${y},${z}`;
  if (id === B.FURNACE) {
    const f = game.furnaces.get(k) || game.furnaces.get(kLegacy);
    if (f) {
      for (const s of [f.input, f.fuel, f.output]) if (s) game.drops.spawn(s.id, s.count, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), null, s.dur);
      game.furnaces.delete(k); game.furnaces.delete(kLegacy);
    }
  } else if (id === B.CHEST) {
    const ch = game.chests.get(k);
    if (ch) {
      for (const s of ch) if (s) game.drops.spawn(s.id, s.count, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), null, s.dur);
      game.chests.delete(k);
    }
  }
}

function tryLightNetherPortal(ox, oy, oz) {
  const w = game.world;
  if (game.dim === 'end') return false;
  for (const axis of ['x', 'z']) {
    const get = (u, y) => axis === 'x' ? w.getBlock(ox + u, y, oz) : w.getBlock(ox, y, oz + u);
    const set = (u, y, id) => axis === 'x' ? w.setBlock(ox + u, y, oz, id) : w.setBlock(ox, y, oz + u, id);
    let uMin = 0, uMax = 0, yMin = oy, yMax = oy;
    while (uMin > -5 && get(uMin - 1, oy) === B.AIR) uMin--;
    while (uMax < 5 && get(uMax + 1, oy) === B.AIR) uMax++;
    while (yMin > 1 && get(0, yMin - 1) === B.AIR) yMin--;
    while (yMax < CH - 2 && get(0, yMax + 1) === B.AIR) yMax++;
    const pw = uMax - uMin + 1, ph = yMax - yMin + 1;
    if (pw < 2 || pw > 5 || ph < 3 || ph > 6) continue;
    let ok = true;
    for (let u = uMin; u <= uMax && ok; u++) {
      if (get(u, yMin - 1) !== B.OBSIDIAN || get(u, yMax + 1) !== B.OBSIDIAN) ok = false;
      for (let y = yMin; y <= yMax && ok; y++) if (get(u, y) !== B.AIR) ok = false;
    }
    for (let y = yMin; y <= yMax && ok; y++) {
      if (get(uMin - 1, y) !== B.OBSIDIAN || get(uMax + 1, y) !== B.OBSIDIAN) ok = false;
    }
    if (ok) {
      for (let y = yMin; y <= yMax; y++) for (let u = uMin; u <= uMax; u++) set(u, y, B.NETHER_PORTAL);
      sfx.portal();
      ui.toast('✨ ネザーポータルが起動しました！中に入ってネザーへ移動しよう');
      return true;
    }
  }
  return false;
}

function tryCheckEndPortalRing(fx, fy, fz) {
  const w = game.world;
  for (let cz = fz - 2; cz <= fz + 2; cz++) {
    for (let cx = fx - 2; cx <= fx + 2; cx++) {
      const frames = [
        [cx - 1, cz - 2], [cx, cz - 2], [cx + 1, cz - 2],
        [cx - 1, cz + 2], [cx, cz + 2], [cx + 1, cz + 2],
        [cx - 2, cz - 1], [cx - 2, cz], [cx - 2, cz + 1],
        [cx + 2, cz - 1], [cx + 2, cz], [cx + 2, cz + 1],
      ];
      if (frames.every(([x, z]) => w.getBlock(x, fy, z) === B.END_PORTAL_FRAME_EYE)) {
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          w.setBlock(cx + dx, fy, cz + dz, B.END_PORTAL);
        }
        sfx.portal();
        ui.toast('🌌 エンドポータルが開きました！飛び込んでジ・エンドへ！', 4000);
        return true;
      }
    }
  }
  return false;
}

function growSapling(x, y, z, id) {
  const w = game.world;
  const type = BLOCKS[id]?.sapling || 'oak';
  w.setBlock(x, y, z, B.AIR);
  game.gen.placeTree(type, x, y, z, Math.random(), (tx, ty, tz, bid, force) => {
    const cur = w.getBlock(tx, ty, tz);
    if (force) {
      if (cur === B.AIR || BLOCKS[cur]?.leaves || BLOCKS[cur]?.replaceable || BLOCKS[cur]?.sapling) w.setBlock(tx, ty, tz, bid);
    } else if (cur === B.AIR) w.setBlock(tx, ty, tz, bid);
  });
}

function checkLiquidMix(x, y, z) {
  const w = game.world;
  const cur = w.getBlock(x, y, z);
  if (cur !== B.WATER && cur !== B.LAVA) return;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const nb = w.getBlock(x + dx, y + dy, z + dz);
    if (cur === B.WATER && nb === B.LAVA) {
      w.setBlock(x + dx, y + dy, z + dz, B.OBSIDIAN);
      sfx.fizz();
    } else if (cur === B.LAVA && nb === B.WATER) {
      w.setBlock(x, y, z, B.OBSIDIAN);
      sfx.fizz();
      return;
    }
  }
}

// ---------------- interaction ----------------
function reach() { return game.player.mode === 'creative' ? 6 : 4.6; }
let target = null, mobTarget = null, projTarget = null;

function updateTarget() {
  const p = game.player;
  const eye = p.eye(), dir = p.lookDir();
  const heldId = game.inventory.held?.id;
  target = game.world.raycast(eye, dir, reach(), heldId === I.BUCKET);
  const mh = game.mobs.raycast(eye, dir, 4.2);
  mobTarget = mh && (!target || mh.dist < target.dist) ? mh.mob : null;
  const ph = game.projs.raycastHit(eye, dir, 5.5);
  projTarget = ph && (!target || ph.dist < target.dist) ? ph : null;
}

function attackOrStart() {
  swing = 1;
  const p = game.player, dir = p.lookDir();
  if (projTarget) {
    if (projTarget.type === 'crystal') game.projs.damageCrystal(projTarget.ref, explode);
    else if (projTarget.type === 'fireball') game.projs.deflectFireball(projTarget.ref, dir, sfx);
    leftDown = false;
    return;
  }
  if (mobTarget) {
    const it = ITEMS[game.inventory.held?.id];
    const baseDmg = it && it.tool ? it.tool.dmg : 1;
    const crit = !p.onGround && !p.flying && p.vel.y < -0.5 ? 1.5 : 1;
    const dmg = Math.max(1, Math.round(baseDmg * crit));
    if (crit > 1) burstColor(mobTarget.pos.clone().add(new THREE.Vector3(0, mobTarget.T.h * 0.6, 0)), 0xffe880, 10, 4);
    game.mobs.hit(mobTarget, dmg, dir, game.drops, sfx, true);
    if (it && it.tool && p.mode === 'survival') {
      if (game.inventory.damageHeld()) sfx.break('wood');
    }
    p.exhaustion += 0.1;
    leftDown = false;
    return;
  }
  if (p.mode === 'creative' && target) { breakBlock(target); breakCooldown = 0.22; }
}

function releaseBow() {
  const charge = Math.min(1, game.bowDraw);
  game.bowDraw = 0;
  input.usingBow = false;
  if (charge < 0.15) return;
  const p = game.player, inv = game.inventory;
  if (p.mode === 'survival') {
    if (inv.consumeId(I.ARROW, 1) < 1) return;
    if (inv.damageHeld()) sfx.break('wood');
  }
  const dir = p.lookDir();
  const speed = 10 + charge * 25;
  const dmg = Math.round(3 + charge * 7);
  game.projs.spawnArrow(p.eye().addScaledVector(dir, 0.4), dir.multiplyScalar(speed), true, dmg);
  sfx.bow();
  swing = 1;
}

function breakBlock(t) {
  const w = game.world, id = t.id, p = game.player;
  const def = BLOCKS[id];
  if (!def || def.hardness < 0) return;
  w.setBlock(t.x, t.y, t.z, B.AIR);
  sfx.break(def.sound);
  burst(t.x, t.y, t.z, id);

  // Clean up adjacent Nether Portal blocks if Obsidian or Portal broken
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    if (w.getBlock(t.x + dx, t.y + dy, t.z + dz) === B.NETHER_PORTAL) {
      floodRemovePortal(t.x + dx, t.y + dy, t.z + dz);
    }
  }

  const survival = p.mode === 'survival';
  const held = game.inventory.held?.id;
  if (survival && canHarvest(id, held)) {
    for (const [did, n] of blockDrops(id, Math.random)) if (n > 0) game.drops.spawn(did, n, new THREE.Vector3(t.x + 0.5, t.y + 0.3, t.z + 0.5));
  }
  if (survival) {
    const it = ITEMS[held];
    if (it && it.tool && def.hardness > 0 && game.inventory.damageHeld()) sfx.break('wood');
    p.exhaustion += 0.005;
  }
  dropContainerContents(id, t.x, t.y, t.z);

  // unsupported plants/torches/crops above
  const above = w.getBlock(t.x, t.y + 1, t.z);
  if (above > 0 && (SHAPE[above] === SH.CROSS || SHAPE[above] === SH.TORCH || above === B.CACTUS)) {
    breakBlock({ x: t.x, y: t.y + 1, z: t.z, id: above });
  }
  // water flows in
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    if (w.getBlock(t.x + dx, t.y + dy, t.z + dz) === B.WATER) { w.setBlock(t.x, t.y, t.z, B.WATER); break; }
  }
}

function floodRemovePortal(sx, sy, sz) {
  const w = game.world;
  const q = [[sx, sy, sz]];
  while (q.length) {
    const [x, y, z] = q.pop();
    if (w.getBlock(x, y, z) !== B.NETHER_PORTAL) continue;
    w.setBlock(x, y, z, B.AIR);
    q.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
  }
}

function useItem() {
  const p = game.player, w = game.world, inv = game.inventory;
  const held = inv.held, it = held && ITEMS[held.id];
  const survival = p.mode === 'survival';

  // Block interactions (unless sneaking)
  if (target && !input.sneak) {
    // Dragon Egg teleports when clicked unless breaking
    if (target.id === B.DRAGON_EGG) {
      w.setBlock(target.x, target.y, target.z, B.AIR);
      game.drops.spawn(B.DRAGON_EGG, 1, new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5));
      sfx.teleport();
      return true;
    }
    // TNT ignition with Flint & Steel / Blaze Powder / Torch
    if (target.id === B.TNT && held && (held.id === I.FLINT_AND_STEEL || held.id === I.BLAZE_POWDER || held.id === B.TORCH)) {
      w.setBlock(target.x, target.y, target.z, B.AIR);
      sfx.ignite(); sfx.fuse();
      game.projs.spawnTNT(target.x + 0.5, target.y, target.z + 0.5, 3.5);
      if (survival) {
        if (held.id === I.FLINT_AND_STEEL) { if (inv.damageHeld()) sfx.break('metal'); }
        else if (held.id === I.BLAZE_POWDER) inv.consumeHeld();
      }
      swing = 1;
      return true;
    }
    // End Portal Frame + Eye of Ender
    if (target.id === B.END_PORTAL_FRAME && held && held.id === I.EYE_OF_ENDER) {
      w.setBlock(target.x, target.y, target.z, B.END_PORTAL_FRAME_EYE);
      sfx.place('glass');
      if (survival) inv.consumeHeld();
      tryCheckEndPortalRing(target.x, target.y, target.z);
      swing = 1;
      return true;
    }
    if (target.id === B.CRAFTING_TABLE) { openContainer('crafting'); return true; }
    if (target.id === B.FURNACE) {
      const k = `${game.dim}:${target.x},${target.y},${target.z}`;
      const kLeg = `${target.x},${target.y},${target.z}`;
      if (!game.furnaces.has(k) && game.furnaces.has(kLeg)) game.furnaces.set(k, game.furnaces.get(kLeg));
      if (!game.furnaces.has(k)) game.furnaces.set(k, { input: null, fuel: null, output: null, burn: 0, burnMax: 0, prog: 0 });
      openContainer('furnace', game.furnaces.get(k));
      return true;
    }
    if (target.id === B.CHEST) {
      const k = `${game.dim}:${target.x},${target.y},${target.z}`;
      if (!game.chests.has(k)) game.chests.set(k, new Array(27).fill(null));
      openContainer('chest', game.chests.get(k));
      return true;
    }
    if (target.id === B.BED) {
      if (game.dim !== 'overworld') {
        w.setBlock(target.x, target.y, target.z, B.AIR);
        explode(new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5), 4.5, 'bed');
        return true;
      }
      p.spawn.set(target.x + 0.5, target.y + 1.05, target.z + 0.5);
      p.spawnDim = 'overworld';
      if (sky.day < 0.45) {
        game.meta.time = 0.03;
        p.health = Math.min(20, p.health + 4);
        ui.toast('💤 ぐっすり眠って朝になりました（リスポーン地点を設定）');
      } else {
        ui.toast('🛏 リスポーン地点を設定しました（夜になると眠れます）');
      }
      return true;
    }
  }

  if (!held || !it) return false;

  // Bow drawing is handled continuously while rightDown
  if (held.id === I.BOW) return false;

  // Quick-equip Armor on Right-Click
  if (it.armor) {
    const slot = it.armor.slot;
    const prev = inv.armor[slot];
    inv.armor[slot] = held;
    inv.slots[inv.selected] = prev;
    sfx.place('cloth');
    ui.lastHotbarKey = ''; ui.lastStatsKey = '';
    return true;
  }

  // Eating food (Golden Apple can always be eaten even at full hunger!)
  if (it.food && ((survival && p.hunger < 20) || it.regen)) {
    p.eat(it.food, it.sat, !!it.regen);
    if (survival) inv.consumeHeld();
    sfx.eat(); swing = 1;
    return true;
  }

  // Throw Ender Pearl
  if (held.id === I.ENDER_PEARL) {
    const dir = p.lookDir();
    game.projs.spawnPearl(p.eye().addScaledVector(dir, 0.35), dir.multiplyScalar(22).add(new THREE.Vector3(0, 2.2, 0)));
    if (survival) inv.consumeHeld();
    sfx.bow(); swing = 1;
    return true;
  }

  // Throw Eye of Ender to locate Stronghold
  if (held.id === I.EYE_OF_ENDER && (!target || target.id !== B.END_PORTAL_FRAME)) {
    if (game.dim !== 'overworld') { ui.toast('エンダーアイはオーバーワールドで地下要塞を指し示します'); return true; }
    const sh = nearestStronghold(game.meta.seed, p.pos.x, p.pos.z);
    game.projs.spawnEye(p.eye(), sh);
    if (survival) inv.consumeHeld();
    sfx.portal(); swing = 1;
    const dist = Math.round(Math.hypot(sh.x - p.pos.x, sh.z - p.pos.z));
    if (dist < 24) ui.toast('👁 エンダーアイが足元へ吸い込まれていく…この真下に要塞がある！');
    return true;
  }

  // Buckets
  if (held.id === I.BUCKET && target && (target.id === B.WATER || target.id === B.LAVA)) {
    const lava = target.id === B.LAVA;
    w.setBlock(target.x, target.y, target.z, B.AIR);
    sfx.bucket(lava);
    const fillId = lava ? I.LAVA_BUCKET : I.WATER_BUCKET;
    if (survival) {
      inv.consumeHeld(1);
      if (inv.add(fillId, 1) > 0) game.dropStack({ id: fillId, count: 1 });
    }
    ui.lastHotbarKey = '';
    swing = 1;
    return true;
  }
  if ((held.id === I.WATER_BUCKET || held.id === I.LAVA_BUCKET) && target) {
    const lava = held.id === I.LAVA_BUCKET;
    const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
    if (y > 0 && y < CH) {
      const cur = w.getBlock(x, y, z);
      if (cur === B.AIR || BLOCKS[cur]?.replaceable || cur === B.WATER || cur === B.LAVA) {
        if (!lava && game.dim === 'nether') {
          sfx.fizz();
          burstColor(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), 0xeeeeee, 16, 4);
          ui.toast('ネザーの熱で水が一瞬で蒸発した！');
        } else {
          w.setBlock(x, y, z, lava ? B.LAVA : B.WATER);
          sfx.bucket(lava);
          checkLiquidMix(x, y, z);
        }
        if (survival) inv.slots[inv.selected] = { id: I.BUCKET, count: 1 };
        ui.lastHotbarKey = '';
        swing = 1;
        return true;
      }
    }
  }

  // Flint & Steel (Nether Portal lighting or spark)
  if (held.id === I.FLINT_AND_STEEL && target) {
    const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
    sfx.ignite();
    burstColor(new THREE.Vector3(x + 0.5, y + 0.3, z + 0.5), 0xffb830, 10, 3);
    tryLightNetherPortal(x, y, z);
    if (survival && inv.damageHeld()) sfx.break('metal');
    swing = 1;
    return true;
  }

  // Hoe tilling Grass/Dirt -> Farmland
  if (it.tool?.type === 'hoe' && target) {
    if ((target.id === B.GRASS || target.id === B.DIRT || target.id === B.SNOW_GRASS) && w.getBlock(target.x, target.y + 1, target.z) === B.AIR) {
      w.setBlock(target.x, target.y, target.z, B.FARMLAND);
      sfx.step('gravel');
      if (survival && inv.damageHeld()) sfx.break('wood');
      swing = 1;
      return true;
    }
  }

  // Wheat seeds planting on Farmland
  if (held.id === I.WHEAT_SEEDS && target && target.id === B.FARMLAND && w.getBlock(target.x, target.y + 1, target.z) === B.AIR) {
    w.setBlock(target.x, target.y + 1, target.z, B.WHEAT0);
    sfx.place('grass');
    if (survival) inv.consumeHeld();
    swing = 1;
    return true;
  }

  // Bone Meal fertilizing crops, saplings & grass
  if (held.id === I.BONE_MEAL && target) {
    const tid = target.id;
    if (tid === B.WHEAT0 || tid === B.WHEAT1 || tid === B.WHEAT2) {
      w.setBlock(target.x, target.y, target.z, Math.min(B.WHEAT3, tid + 1 + (Math.random() < 0.5 ? 1 : 0)));
      burstColor(new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5), 0x60f060, 14, 3);
      sfx.pop();
      if (survival) inv.consumeHeld();
      swing = 1;
      return true;
    }
    if (BLOCKS[tid]?.sapling) {
      burstColor(new THREE.Vector3(target.x + 0.5, target.y + 0.5, target.z + 0.5), 0x60f060, 18, 4);
      if (Math.random() < 0.65) growSapling(target.x, target.y, target.z, tid);
      sfx.pop();
      if (survival) inv.consumeHeld();
      swing = 1;
      return true;
    }
    if (tid === B.GRASS) {
      for (let i = 0; i < 12; i++) {
        const gx = target.x + Math.floor((Math.random() - 0.5) * 6);
        const gz = target.z + Math.floor((Math.random() - 0.5) * 6);
        if (w.getBlock(gx, target.y, gz) === B.GRASS && w.getBlock(gx, target.y + 1, gz) === B.AIR) {
          const r = Math.random();
          w.setBlock(gx, target.y + 1, gz, r < 0.7 ? B.TALL_GRASS : r < 0.85 ? B.DANDELION : B.ROSE);
        }
      }
      burstColor(new THREE.Vector3(target.x + 0.5, target.y + 1, target.z + 0.5), 0x60f060, 16, 4);
      sfx.pop();
      if (survival) inv.consumeHeld();
      swing = 1;
      return true;
    }
  }

  // Standard block placement
  if (!target || !it.block) return false;
  const bid = it.block;
  let x = target.x, y = target.y, z = target.z;
  const tdef = BLOCKS[target.id];
  if (!(tdef.replaceable && target.id !== bid)) { x += target.nx; y += target.ny; z += target.nz; }
  if (y < 0 || y >= CH) return false;
  const cur = w.getBlock(x, y, z);
  if (cur < 0) return false;
  if (cur !== 0 && cur !== B.WATER && !(BLOCKS[cur] && BLOCKS[cur].replaceable)) return false;
  const bdef = BLOCKS[bid];
  if (bdef.shape === SH.CROSS || bdef.shape === SH.TORCH || bid === B.CACTUS) {
    const below = w.getBlock(x, y - 1, z);
    if (!(below > 0 && SOLID[below])) return false;
    if (bdef.sapling && below !== B.GRASS && below !== B.DIRT && below !== B.SNOW_GRASS) return false;
  }
  if (bdef.solid) {
    const bh = HEIGHT[bid];
    if (aabbIntersectsBlock(p.pos, PW, PH, x, y, z, bh)) return false;
    for (const m of game.mobs.list) if (!m.dead && aabbIntersectsBlock(m.pos, m.T.hw, m.T.h, x, y, z, bh)) return false;
  }
  w.setBlock(x, y, z, bid);
  sfx.place(bdef.sound);
  swing = 1;
  if (survival) inv.consumeHeld();
  return true;
}

function pickBlock() {
  if (!target || game.player.mode !== 'creative') return;
  const inv = game.inventory;
  let id = target.id;
  if (id === B.WHEAT0 || id === B.WHEAT1 || id === B.WHEAT2 || id === B.WHEAT3) id = I.WHEAT_SEEDS;
  if (id === B.FARMLAND) id = B.DIRT;
  if (id === B.END_PORTAL_FRAME_EYE) id = B.END_PORTAL_FRAME;
  for (let i = 0; i < 9; i++) if (inv.slots[i] && inv.slots[i].id === id) { inv.selected = i; return; }
  inv.slots[inv.selected] = { id, count: maxStack(id) };
}

// ---------------- furnaces & crop ticks ----------------
function tickFurnaces(dt) {
  for (const f of game.furnaces.values()) {
    const out = f.input && SMELT[f.input.id];
    const can = out !== undefined && f.input && (!f.output || (f.output.id === out && f.output.count < maxStack(out)));
    if (f.burn > 0) f.burn -= dt;
    if (f.burn <= 0 && can && f.fuel && ITEMS[f.fuel.id]?.fuel) {
      const fuelId = f.fuel.id;
      f.burn = f.burnMax = ITEMS[fuelId].fuel;
      if (fuelId === I.LAVA_BUCKET) f.fuel = { id: I.BUCKET, count: 1 };
      else { f.fuel.count--; if (f.fuel.count <= 0) f.fuel = null; }
    }
    if (f.burn > 0 && can) {
      f.prog += dt;
      if (f.prog >= 10) {
        f.prog = 0;
        if (f.output) f.output.count++; else f.output = { id: out, count: 1 };
        f.input.count--; if (f.input.count <= 0) f.input = null;
      }
    } else f.prog = Math.max(0, f.prog - dt * 2);
  }
}

let cropAcc = 0;
function tickRandomBlocks(dt) {
  cropAcc += dt;
  if (cropAcc < 1.2) return;
  cropAcc = 0;
  const w = game.world, p = game.player;
  if (!w || game.dim !== 'overworld') return;
  for (let i = 0; i < 24; i++) {
    const rx = Math.floor(p.pos.x + (Math.random() - 0.5) * 64);
    const rz = Math.floor(p.pos.z + (Math.random() - 0.5) * 64);
    const ry = w.topSolid(rx, rz);
    if (ry < 1) continue;
    const above = w.getBlock(rx, ry + 1, rz);
    if (above === B.WHEAT0 || above === B.WHEAT1 || above === B.WHEAT2) {
      if (Math.random() < 0.35) w.setBlock(rx, ry + 1, rz, above + 1);
    } else if (BLOCKS[above]?.sapling && Math.random() < 0.15) {
      growSapling(rx, ry + 1, rz, above);
    }
  }
}

// ---------------- main update ----------------
const events = [];
let autosave = 0;

function updatePlay(dt) {
  const p = game.player, w = game.world, inv = game.inventory;
  if (game.dim === 'overworld') game.meta.time = (game.meta.time + dt / DAY_LENGTH) % 1;

  // Bow drawing
  const holdingBow = inv.held?.id === I.BOW;
  if (rightDown && game.state === 'play' && holdingBow && !p.dead && (p.mode === 'creative' || inv.count(I.ARROW) > 0)) {
    game.bowDraw = Math.min(1, game.bowDraw + dt / 0.85);
    input.usingBow = true;
  } else if (!holdingBow) {
    game.bowDraw = 0;
    input.usingBow = false;
  }

  if (w.isLoaded(p.pos.x, p.pos.z)) p.update(dt, game.state === 'play' ? input : {}, w, events);

  updateTarget();
  breakCooldown -= dt; useCooldown -= dt;
  if (leftDown && game.state === 'play' && target && !p.dead && !mobTarget && !projTarget) {
    if (p.mode === 'creative') {
      if (breakCooldown <= 0) { breakBlock(target); breakCooldown = 0.22; swing = 1; }
    } else {
      if (!breaking || breaking.x !== target.x || breaking.y !== target.y || breaking.z !== target.z) {
        breaking = { x: target.x, y: target.y, z: target.z, progress: 0, hit: 0 };
      }
      const bt = breakTime(target.id, inv.held?.id);
      breaking.progress += dt / bt;
      breaking.hit -= dt;
      if (breaking.hit <= 0) { breaking.hit = 0.22; sfx.hit(BLOCKS[target.id].sound); swing = 1; }
      if (breaking.progress >= 1) { breakBlock(target); breaking = null; }
    }
  } else breaking = null;

  if (rightDown && game.state === 'play' && !holdingBow && useCooldown <= 0 && !p.dead) {
    useItem();
    useCooldown = 0.22;
  }

  game.drops.update(dt, w, p, inv, () => sfx.pop());
  game.projs.update(dt, w, p, game.mobs, game.drops, events, sfx, explode, (landPos) => {
    if (!p.dead) {
      p.pos.set(landPos.x, landPos.y + 0.1, landPos.z);
      p.vel.set(0, 0, 0);
      p.fallStart = null;
      sfx.teleport();
      burstColor(p.pos, 0xb040ff, 20, 5);
      p.damage(5, events, 'pearl');
    }
  });
  game.mobs.update(dt, w, p, sky, game.drops, game.projs, events, sfx, {
    onExplode: explode,
    onDragonKilled,
  });
  tickFurnaces(dt);
  tickRandomBlocks(dt);
  ui.updateFurnace();

  let pendingDim = null;
  for (const ev of events) {
    if (ev.type === 'step' || ev.type === 'land') {
      const b = w.getBlock(p.pos.x, p.pos.y - 0.2, p.pos.z);
      if (b > 0 && BLOCKS[b]) sfx.step(BLOCKS[b].sound);
    } else if (ev.type === 'hurt') sfx.hurt();
    else if (ev.type === 'splash') sfx.splash();
    else if (ev.type === 'death') onDeath(ev.cause);
    else if (ev.type === 'netherPortal') pendingDim = game.dim === 'nether' ? 'overworld' : 'nether';
    else if (ev.type === 'endPortal') pendingDim = game.dim === 'end' ? 'overworld' : 'end';
  }
  events.length = 0;
  if (pendingDim && !p.dead) {
    switchDimension(pendingDim);
    return;
  }

  autosave += dt;
  if (autosave > 60) { autosave = 0; saveGame(); }
}

const CAUSES = {
  fall: '高いところから落ちた',
  zombie: 'ゾンビに倒された',
  skeleton: 'スケルトンに射抜かれた',
  creeper: 'クリーパーに爆破された',
  spider: 'クモに襲われた',
  enderman: 'エンダーマンに倒された',
  piglin: 'ゾンビピグリンに倒された',
  ghast: 'ガストの火球で爆破された',
  blaze: 'ブレイズの炎に焼かれた',
  dragon: 'エンダードラゴンに吹き飛ばされた',
  tnt: 'TNTの爆発に巻き込まれた',
  crystal: 'エンドクリスタルの爆発に巻き込まれた',
  bed: '異次元のベッド爆発に巻き込まれた',
  explosion: '爆発に巻き込まれた',
  pearl: 'エンダーパールの衝撃で倒れた',
  fire: '炎に焼かれてしまった',
  drown: '溺れてしまった',
  lava: '溶岩で焼かれた',
  starve: '餓死した',
  void: '奈落に落ちた',
};

function onDeath(cause) {
  const p = game.player, inv = game.inventory;
  for (let i = 0; i < 36; i++) {
    if (inv.slots[i]) {
      game.drops.spawn(inv.slots[i].id, inv.slots[i].count, p.pos.clone().add(new THREE.Vector3(0, 1, 0)), null, inv.slots[i].dur);
      inv.slots[i] = null;
    }
  }
  for (let i = 0; i < 4; i++) {
    if (inv.armor[i]) {
      game.drops.spawn(inv.armor[i].id, 1, p.pos.clone().add(new THREE.Vector3(0, 1, 0)), null, inv.armor[i].dur);
      inv.armor[i] = null;
    }
  }
  if (ui.isOpen) ui.closeContainer();
  game.state = 'dead';
  unlockPointer();
  $('death-cause').textContent = CAUSES[cause] || '';
  ui.show('death');
}

function updateCamera(dt) {
  const p = game.player;
  p.eye(camera.position);
  let bobY = 0, bobX = 0;
  if (settings.bob && p.onGround) {
    const sp = Math.min(1.25, Math.hypot(p.vel.x, p.vel.z) / 5);
    bobY = Math.abs(Math.sin(p.bob)) * 0.065 * sp;
    bobX = Math.cos(p.bob) * 0.032 * sp;
  }
  camera.position.y += bobY;
  camera.rotation.set(p.pitch, p.yaw, 0);
  camera.translateX(bobX);
  const sprintMul = p.sprinting ? 1.16 : 1;
  const bowMul = game.bowDraw > 0 ? (1 - game.bowDraw * 0.14) : 1;
  const targetFov = settings.fov * sprintMul * (p.flying && p.sprinting ? 1.06 : 1) * bowMul;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  handBob = p.bob;
}

function updateHand(dt) {
  const held = game.inventory.held;
  const id = held ? held.id : -1;
  if (id !== handHeldId) rebuildHand(id);
  swing = Math.max(0, swing - dt * 4);
  const s = Math.sin((1 - swing) * Math.PI) * (swing > 0 ? 1 : 0);
  const p = game.player;
  const moving = Math.min(1.2, Math.hypot(p.vel.x, p.vel.z) / 5) * (p.onGround ? 1 : 0);
  const drawPull = game.bowDraw * 0.16;
  handGroup.position.set(
    Math.cos(handBob) * 0.02 * moving - s * 0.15 - drawPull * 0.4,
    -Math.abs(Math.sin(handBob)) * 0.03 * moving - s * 0.12 + drawPull * 0.25,
    -s * 0.15 + drawPull
  );
  handGroup.rotation.set(-s * 0.9 + drawPull * 0.5, s * 0.3, 0);
  let covered = false;
  if (game.dim === 'overworld') {
    for (let y = Math.floor(p.pos.y + 2); y < Math.min(CH, p.pos.y + 40); y++) {
      const b = game.world.getBlock(p.pos.x, y, p.pos.z);
      if (b > 0 && BLOCKS[b].opaque) { covered = true; break; }
    }
  }
  const torch = held && ITEMS[held.id]?.block && BLOCKS[held.id].light ? 0.6 : 0;
  const lvl = game.dim !== 'overworld' ? 0.65 : (covered ? 0.25 : 0.25 + sky.day * 0.85);
  handAmb.intensity = (lvl + torch) * 1.4;
  handDir.intensity = covered ? 0.3 : Math.max(0.4, sky.day * 1.8);
}

function updateSelection() {
  if (target && game.state === 'play' && SHAPE[target.id] !== SH.LIQUID) {
    const bh = HEIGHT[target.id];
    selBox.visible = true;
    selBox.scale.set(1, bh, 1);
    selBox.position.set(target.x + 0.5, target.y + bh * 0.5, target.z + 0.5);
    if (breaking && breaking.progress > 0) {
      crackBox.visible = true;
      crackBox.scale.set(1, bh, 1);
      crackBox.position.copy(selBox.position);
      crackMat.map = cracks[Math.min(9, Math.floor(breaking.progress * 10))];
      crackMat.needsUpdate = true;
    } else crackBox.visible = false;
  } else {
    selBox.visible = false;
    crackBox.visible = false;
  }
}

function updateFog(eyeBlock) {
  const far = Math.max(2, game.world.renderDist - 1) * CS;
  if (eyeBlock === B.WATER) {
    scene.fog.color.setRGB(0.03, 0.14, 0.24); scene.fog.near = 0.5; scene.fog.far = 22;
  } else if (eyeBlock === B.LAVA) {
    scene.fog.color.setRGB(0.6, 0.15, 0.02); scene.fog.near = 0.1; scene.fog.far = 3.5;
  } else if (game.dim === 'nether') {
    scene.fog.color.copy(sky.fogColor); scene.fog.near = Math.min(28, far * 0.25); scene.fog.far = Math.min(96, far * 0.85);
  } else {
    scene.fog.color.copy(sky.fogColor); scene.fog.near = far * 0.62; scene.fog.far = far;
  }
  $('water-overlay').style.opacity = eyeBlock === B.WATER ? 1 : 0;
}

function updateDebug() {
  if (!showDebug) return;
  const p = game.player, w = game.world;
  const col = game.gen.column(Math.floor(p.pos.x), Math.floor(p.pos.z));
  const st = w.stats();
  const tt = ((game.meta?.time ?? 0) * 24 + 6) % 24;
  const hrs = Math.floor(tt), mins = Math.floor((tt % 1) * 60);
  $('debug').textContent =
    `InfiniCraft v2.0.0   ${fps} FPS   [${game.dim.toUpperCase()}]\n` +
    `XYZ: ${p.pos.x.toFixed(2)} / ${p.pos.y.toFixed(2)} / ${p.pos.z.toFixed(2)}${p.sprinting ? ' [DASH]' : ''}\n` +
    `チャンク: ${Math.floor(p.pos.x / CS)}, ${Math.floor(p.pos.z / CS)}   読込 ${st.loaded} / 描画 ${st.meshed}\n` +
    `バイオーム: ${BIOME_NAMES[col.b] || game.dim}   地表高度: ${col.h}\n` +
    `時刻: ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}   シード: ${game.meta?.seed}\n` +
    `モード: ${p.mode}${p.flying ? ' (飛行)' : ''}   Mob: ${game.mobs.list.length}\n` +
    (target ? `注視: ${BLOCKS[target.id].name} (${target.x}, ${target.y}, ${target.z})` : '');
}

// ---------------- loop ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  mats.shared.uTime.value = now / 1000;
  sky.uniforms.uTime.value = now / 1000;

  const w = game.world;
  if (game.state === 'title' && w) {
    const t = now / 1000 * 0.03;
    const c = game.previewCenter;
    camera.position.set(c.x + Math.cos(t) * 30, Math.max(c.y + 22, 80), c.z + Math.sin(t) * 30);
    camera.lookAt(c.x + Math.cos(t + 1.2) * 60, c.y, c.z + Math.sin(t + 1.2) * 60);
    w.update(camera.position.x, camera.position.z);
    sky.update(game.previewTime, camera, false);
    updateFog(0);
  } else if (w && game.state !== 'title') {
    if (game.state === 'loading') {
      const p = game.player;
      w.update(p.pos.x, p.pos.z);
      const st = w.stats();
      const need = Math.min(48, w.offsets.length);
      $('loading-bar').style.width = Math.min(100, st.meshed / need * 100) + '%';
      $('loading-text').textContent = `地形を生成中... ${Math.min(100, Math.floor(st.meshed / need * 100))}%`;
      if (w.isReady(p.pos.x, p.pos.z) && st.meshed >= need) finishLoading();
      p.eye(camera.position);
    } else {
      if (game.state === 'play' || game.state === 'container' || game.state === 'dead') updatePlay(dt);
      if (game.world) {
        game.world.update(game.player.pos.x, game.player.pos.z);
        updateCamera(dt);
        updateHand(dt);
        updateSelection();
        ui.renderHUD(dt);
      }
    }
    if (game.world) {
      const eyeBlock = game.world.getBlock(camera.position.x, camera.position.y, camera.position.z);
      const underwater = eyeBlock === B.WATER;
      sky.update(game.meta.time, camera, underwater);
      updateFog(eyeBlock);
      const p = game.player;
      const underground = game.dim === 'overworld' && p.pos.y < 50 && game.world.topSolid(p.pos.x, p.pos.z) > p.pos.y + 3;
      updateAmbient(sky.day, underground, underwater, game.dim);
      updateDebug();
    }
  }
  updateParticles(dt);
  mats.shared.uDay.value = sky.day;
  mats.shared.uSkyColor.value.copy(sky.skyColor);

  renderer.setClearColor(scene.fog.color);
  renderer.clear();
  renderer.render(scene, camera);
  if (game.state === 'play' || game.state === 'container') {
    renderer.clearDepth();
    renderer.render(handScene, handCam);
  }
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = handCam.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); handCam.updateProjectionMatrix();
});

// ---------------- menus ----------------
let settingsReturn = 'title';
async function showWorldList() {
  ui.show('worlds');
  const list = await Save.listWorlds();
  const el = $('world-list');
  if (!list.length) { el.innerHTML = `<div class="world-empty">まだワールドがありません。新しく作成しましょう！</div>`; return; }
  el.innerHTML = list.map(m => `
    <div class="world-item">
      <div class="info"><div class="name">${escapeHTML(m.name)}</div>
      <div class="meta">${m.mode === 'creative' ? 'クリエイティブ' : 'サバイバル'} · シード ${m.seed} · ${new Date(m.lastPlayed || m.created).toLocaleString('ja-JP')}</div></div>
      <button class="btn small primary" data-play="${m.id}">プレイ</button>
      <button class="btn small danger" data-del="${m.id}">削除</button>
    </div>`).join('');
  el.onclick = async (e) => {
    const pl = e.target.closest('[data-play]'), del = e.target.closest('[data-del]');
    if (pl) { const m = list.find(x => x.id === pl.dataset.play); resumeAudio(); startWorld(m); }
    if (del && confirm('このワールドを削除しますか？（元に戻せません）')) { await Save.deleteWorld(del.dataset.del); showWorldList(); }
  };
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function seedFrom(str) {
  if (!str) return Math.floor(Math.random() * 2147483647);
  if (/^-?\d+$/.test(str)) return parseInt(str) | 0;
  let h = 0; for (const c of str) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return h;
}

function segBind(id, getter, setter) {
  const seg = $(id);
  const sync = () => { for (const b of seg.children) b.classList.toggle('on', b.dataset.v === String(getter())); };
  seg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; setter(b.dataset.v); sync(); sfx.click(); };
  sync();
  return sync;
}
let newMode = 'survival';
segBind('seg-mode', () => newMode, (v) => {
  newMode = v;
  $('mode-desc').textContent = v === 'creative'
    ? '全ブロック・アイテム使い放題、スペース2回で飛行。モブの体力やクラフトも本格挙動です。'
    : '資源を集め、装備を整え、ネザーとジ・エンドのエンダードラゴン討伐を目指そう。';
});

function initSettingsUI() {
  const bind = (id, key, fmt) => {
    const el = $(id), v = $(id.replace('s-', 'v-'));
    el.value = settings[key]; v.textContent = fmt(settings[key]);
    el.oninput = () => {
      settings[key] = parseFloat(el.value); v.textContent = fmt(settings[key]); saveSettings();
      if (key === 'rd' && game.world) game.world.setRenderDistance(game.preview ? Math.min(7, settings.rd) : settings.rd);
      if (key === 'vol') setVolume(settings.vol);
    };
  };
  bind('s-rd', 'rd', v => v + ' チャンク');
  bind('s-fov', 'fov', v => v + '°');
  bind('s-sens', 'sens', v => v.toFixed(1));
  bind('s-vol', 'vol', v => Math.round(v * 100) + '%');
  segBind('seg-shadow', () => settings.shadow, (v) => { settings.shadow = v; saveSettings(); sky.setShadowQuality(v); if (game.world) game.world.shadowDist = v === 'ultra' ? 6 : 4; });
  segBind('seg-bob', () => settings.bob, (v) => { settings.bob = +v; saveSettings(); });
}
initSettingsUI();

$('btn-play').onclick = () => { resumeAudio(); sfx.click(); showWorldList(); };
$('btn-settings').onclick = () => { sfx.click(); settingsReturn = 'title'; ui.show('settings'); };
$('btn-help').onclick = () => { sfx.click(); ui.show('help'); };
$('btn-help-back').onclick = () => ui.show('title');
$('btn-quit').onclick = () => { if (window.api) window.api.quit(); else window.close(); };
$('btn-worlds-back').onclick = () => ui.show('title');
$('btn-new-world').onclick = () => { $('in-name').value = '新しいワールド'; $('in-seed').value = ''; ui.show('create'); };
$('btn-create-back').onclick = () => showWorldList();
$('btn-create').onclick = async () => {
  const meta = {
    id: 'w' + Date.now().toString(36),
    name: $('in-name').value.trim() || '新しいワールド',
    seed: seedFrom($('in-seed').value.trim()),
    mode: newMode,
    dim: 'overworld',
    created: Date.now(), lastPlayed: Date.now(), time: 0.02,
  };
  await Save.saveWorld(meta, new Map());
  startWorld(meta);
};
$('btn-settings-back').onclick = () => ui.show(settingsReturn);
$('btn-resume').onclick = () => resume();
$('btn-pause-settings').onclick = () => { settingsReturn = 'pause'; ui.show('settings'); };
$('btn-pause-mode').onclick = () => {
  const p = game.player;
  p.mode = p.mode === 'creative' ? 'survival' : 'creative';
  if (p.mode === 'survival') p.flying = false;
  ui.lastStatsKey = '';
  ui.toast(p.mode === 'creative' ? 'クリエイティブモードに切り替えました' : 'サバイバルモードに切り替えました');
  resume();
};
$('btn-save-quit').onclick = async () => { await saveGame(); startPreview(); };
$('btn-respawn').onclick = () => {
  const p = game.player;
  p.respawn();
  if (game.dim !== (p.spawnDim || 'overworld')) {
    switchDimension(p.spawnDim || 'overworld');
  } else {
    game.state = 'play'; ui.show(null); ui.lastStatsKey = ''; lockPointer();
  }
};
$('btn-death-quit').onclick = async () => { game.player.respawn(); await saveGame(); startPreview(); };

// Electron: save before close
if (window.api) {
  window.api.onBeforeClose(async () => { try { await saveGame(); } finally { window.api.closeOk(); } });
}

// ---------------- boot ----------------
if (params.has('icon')) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(iconCanvas(B.GRASS), 0, 0, 256, 256);
  window.api?.saveIcon(cv.toDataURL('image/png'));
} else if (AUTO) {
  const mode = params.get('mode') || 'survival';
  const dim = params.get('dim') || 'overworld';
  const meta = { id: 'auto', name: 'auto', seed: parseInt(params.get('seed') || '12345'), mode, dim, created: Date.now(), time: parseFloat(params.get('time') || '0.08'), temp: true };
  if (params.has('pos')) {
    const [px, py, pz] = params.get('pos').split(',').map(Number);
    meta.player = {
      x: px, y: py, z: pz,
      yaw: parseFloat(params.get('yaw') || (dim === 'end' ? '1.57' : '0.6')),
      pitch: parseFloat(params.get('pitch') || '-0.12'),
      health: 20, hunger: 20, sat: 5, flying: params.has('fly'),
      sx: px, sy: py, sz: pz, sdim: dim,
    };
  }
  startWorld(meta).then(() => {
    const chk = setInterval(() => {
      if (game.state === 'play') {
        clearInterval(chk);
        const p = game.player;
        p.yaw = parseFloat(params.get('yaw') || (dim === 'end' ? '1.57' : '0.6'));
        p.pitch = parseFloat(params.get('pitch') || '-0.12');
        if (params.has('fly')) { p.mode = 'creative'; p.flying = true; p.pos.y += parseFloat(params.get('fly')); }
        if (params.has('give')) params.get('give').split(',').forEach(id => game.inventory.add(+id, maxStack(+id)));
        if (params.has('armor')) {
          params.get('armor').split(',').forEach((id, i) => {
            if (+id > 0 && i < 4) game.inventory.armor[i] = { id: +id, count: 1, dur: maxDurability(+id) };
          });
        }
        if (params.has('spawn')) {
          const dir = p.lookDir();
          const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
          const list = params.get('spawn').split(',');
          list.forEach((tp, idx) => {
            const off = (idx - (list.length - 1) / 2) * 2.2;
            const dist = 5.5 + (idx % 2) * 1.4;
            const sx = p.pos.x + dir.x * dist + right.x * off;
            const sz = p.pos.z + dir.z * dist + right.z * off;
            const sy = tp === 'ghast' || tp === 'blaze' ? p.pos.y + (tp === 'ghast' ? 3.5 : 1.5) : game.world.topSolid(sx, sz);
            const m = game.mobs.spawn(tp, sx, (tp === 'ghast' || tp === 'blaze' ? sy : (sy > 0 ? sy + 1.05 : p.pos.y)), sz);
            if (m) { m.yaw = Math.atan2(-(p.pos.x - sx), -(p.pos.z - sz)); m.ai = 5; m.wish.set(0, 0); m.targetY = m.pos.y; }
          });
        }
        if (params.has('lookdragon')) {
          const dr = game.mobs.list.find(m => m.type === 'dragon');
          if (dr) {
            dr.pos.set(14, 72, 6);
            dr.orbitAngle = 0.35;
            dr.yaw = Math.atan2(-(p.pos.x - dr.pos.x), -(p.pos.z - dr.pos.z));
          }
        }
        ui.lastHotbarKey = ''; ui.lastStatsKey = '';
        if (params.has('ui')) openContainer(params.get('ui'));
        if (params.has('autofill')) ui.fillRecipe(+params.get('autofill'), false);
        console.log('AUTO_READY');
      }
    }, 200);
  });
} else {
  startPreview();
}
