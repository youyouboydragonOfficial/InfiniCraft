import { BLOCKS, TILES } from '../world/blocks.js';
import { ITEMS } from '../game/items.js';
import { tileCanvases, blockFaceCanvas, DEFAULT_TINT, tintedCanvas } from './textures.js';

const cache = new Map();
const S = 64;

function drawIso(ctx, id) {
  const def = BLOCKS[id];
  const bh = (def && def.height) ? def.height : 1;
  const top = blockFaceCanvas(id, 2), left = blockFaceCanvas(id, 4), right = blockFaceCanvas(id, 0);
  ctx.imageSmoothingEnabled = false;
  const k = S / 64;
  const dy = (1 - bh) * 28 * k;
  const sh = Math.max(1, Math.round(32 * bh));
  ctx.save(); ctx.setTransform(0.875 * k, -0.4375 * k, 0.875 * k, 0.4375 * k, 4 * k, 18 * k + dy); ctx.drawImage(top, 0, 0); ctx.restore();
  ctx.save(); ctx.setTransform(0.875 * k, 0.4375 * k, 0, 0.875 * bh * k, 4 * k, 18 * k + dy); ctx.drawImage(left, 0, 0, 32, sh, 0, 0, 32, 32); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, 32, 32); ctx.restore();
  ctx.save(); ctx.setTransform(0.875 * k, -0.4375 * k, 0, 0.875 * bh * k, 32 * k, 32 * k + dy); ctx.drawImage(right, 0, 0, 32, sh, 0, 0, 32, 32); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, 0, 32, 32); ctx.restore();
}

function outline(ctx, fn, color, w, ow = 3) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,14,8,0.9)'; ctx.lineWidth = w + ow; ctx.beginPath(); fn(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); fn(); ctx.stroke();
}
function shadeColor(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function polyFill(ctx, pts, fill, stroke = 'rgba(20,14,8,0.9)', lw = 3) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill();
}

function drawItem(ctx, it) {
  const c = it.color || '#ccc';
  const handle = () => { ctx.moveTo(12, 54); ctx.lineTo(40, 26); };
  switch (it.draw) {
    case 'stick': outline(ctx, () => { ctx.moveTo(14, 52); ctx.lineTo(50, 14); }, '#9a7040', 6); break;
    case 'pickaxe':
      outline(ctx, handle, '#8a6236', 6);
      outline(ctx, () => { ctx.moveTo(18, 10); ctx.quadraticCurveTo(54, 10, 56, 46); }, c, 8);
      outline(ctx, () => { ctx.moveTo(24, 12); ctx.quadraticCurveTo(48, 14, 52, 38); }, shadeColor(c, 1.2), 2, 0);
      break;
    case 'hoe':
      outline(ctx, () => { ctx.moveTo(12, 54); ctx.lineTo(44, 22); }, '#8a6236', 6);
      outline(ctx, () => { ctx.moveTo(24, 12); ctx.quadraticCurveTo(44, 12, 50, 24); }, c, 8);
      outline(ctx, () => { ctx.moveTo(26, 12); ctx.lineTo(44, 16); }, shadeColor(c, 1.25), 2, 0);
      break;
    case 'axe':
      outline(ctx, () => { ctx.moveTo(12, 54); ctx.lineTo(46, 20); }, '#8a6236', 6);
      ctx.fillStyle = 'rgba(20,14,8,0.9)';
      ctx.beginPath(); ctx.moveTo(30, 10); ctx.lineTo(46, 4); ctx.lineTo(58, 22); ctx.lineTo(50, 34); ctx.lineTo(40, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(33, 11); ctx.lineTo(45, 7); ctx.lineTo(55, 22); ctx.lineTo(49, 30); ctx.lineTo(41, 23); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.25); ctx.fillRect(46, 10, 3, 14);
      break;
    case 'shovel':
      outline(ctx, () => { ctx.moveTo(12, 54); ctx.lineTo(38, 28); }, '#8a6236', 6);
      ctx.save(); ctx.translate(44, 20); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(20,14,8,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.25); ctx.fillRect(-2, -9, 3, 14);
      ctx.restore();
      break;
    case 'sword':
      outline(ctx, () => { ctx.moveTo(22, 42); ctx.lineTo(54, 10); }, c, 8);
      outline(ctx, () => { ctx.moveTo(26, 38); ctx.lineTo(50, 14); }, shadeColor(c, 1.3), 2, 0);
      outline(ctx, () => { ctx.moveTo(14, 34); ctx.lineTo(30, 50); }, '#5a3e22', 6);
      outline(ctx, () => { ctx.moveTo(10, 54); ctx.lineTo(22, 42); }, '#8a6236', 6);
      break;
    case 'coal':
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(26, 14); ctx.lineTo(46, 16); ctx.lineTo(52, 36); ctx.lineTo(38, 52); ctx.lineTo(18, 46); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a3a3e'; ctx.fillRect(26, 22, 6, 4); ctx.fillRect(38, 30, 5, 5); ctx.fillRect(22, 36, 4, 4);
      break;
    case 'flint':
      polyFill(ctx, [[30, 8], [48, 22], [44, 50], [20, 54], [14, 32]], '#3b3b42', '#141418', 3);
      polyFill(ctx, [[30, 12], [42, 24], [32, 34], [22, 28]], '#686874', '', 0);
      break;
    case 'flintsteel':
      outline(ctx, () => { ctx.arc(26, 28, 13, 0.6, 4.5); }, '#cfd4dc', 6);
      polyFill(ctx, [[38, 26], [52, 34], [46, 52], [32, 46]], '#383840', '#141418', 3);
      ctx.fillStyle = '#ffbe40'; ctx.fillRect(33, 18, 3, 3); ctx.fillRect(40, 14, 2, 2);
      break;
    case 'ingot':
      ctx.fillStyle = 'rgba(20,14,8,0.9)'; ctx.beginPath(); ctx.moveTo(6, 40); ctx.lineTo(22, 24); ctx.lineTo(58, 24); ctx.lineTo(48, 42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(10, 39); ctx.lineTo(23, 27); ctx.lineTo(54, 27); ctx.lineTo(46, 39); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.2); ctx.fillRect(24, 29, 26, 3);
      ctx.fillStyle = shadeColor(c, 0.7); ctx.fillRect(12, 37, 34, 2);
      break;
    case 'gem':
      ctx.fillStyle = 'rgba(10,30,30,0.9)'; ctx.beginPath(); ctx.moveTo(32, 6); ctx.lineTo(56, 26); ctx.lineTo(32, 58); ctx.lineTo(8, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(32, 10); ctx.lineTo(52, 26); ctx.lineTo(32, 53); ctx.lineTo(12, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.3); ctx.beginPath(); ctx.moveTo(32, 10); ctx.lineTo(40, 26); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
      break;
    case 'apple': {
      const body = it.color || '#d42a2a';
      const dark = it.color ? shadeColor(it.color, 0.5) : '#5a0c0c';
      const hi = it.color ? '#fff4b0' : '#ff8080';
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(32, 36, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(32, 36, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(25, 30, 4, 0, Math.PI * 2); ctx.fill();
      outline(ctx, () => { ctx.moveTo(32, 20); ctx.lineTo(34, 10); }, '#6a4a22', 3, 2);
      ctx.fillStyle = '#4caa3a'; ctx.beginPath(); ctx.ellipse(41, 13, 7, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'meat':
      ctx.fillStyle = 'rgba(30,10,10,0.9)'; ctx.beginPath(); ctx.ellipse(32, 34, 24, 17, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(32, 34, 21, 14, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,230,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(32, 34, 14, 8, -0.4, 0.4, 2.6); ctx.stroke();
      break;
    case 'steak':
      polyFill(ctx, [[12, 28], [26, 14], [50, 18], [54, 38], [38, 52], [16, 46]], c, 'rgba(30,12,8,0.9)', 4);
      ctx.strokeStyle = 'rgba(255,235,220,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, 26); ctx.quadraticCurveTo(34, 32, 44, 26); ctx.moveTo(32, 30); ctx.lineTo(30, 44); ctx.stroke();
      break;
    case 'drumstick':
      outline(ctx, () => { ctx.moveTo(14, 50); ctx.lineTo(28, 36); }, '#f2eee4', 6);
      ctx.fillStyle = '#f2eee4'; ctx.beginPath(); ctx.arc(12, 48, 4, 0, 6.28); ctx.arc(16, 52, 4, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(30,14,8,0.9)'; ctx.beginPath(); ctx.ellipse(38, 26, 17, 13, -0.6, 0, 6.28); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(38, 26, 14, 10, -0.6, 0, 6.28); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.22); ctx.beginPath(); ctx.ellipse(34, 22, 6, 3, -0.6, 0, 6.28); ctx.fill();
      break;
    case 'bread':
      ctx.fillStyle = '#3a240c'; ctx.beginPath(); ctx.ellipse(32, 36, 26, 13, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8873a'; ctx.beginPath(); ctx.ellipse(32, 35, 23, 10, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f0c070'; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 8, 30 + i * 2); ctx.lineTo(34 + i * 8, 38 + i * 2); ctx.stroke(); }
      break;
    case 'melon':
      ctx.save(); ctx.translate(32, 30); ctx.rotate(0.25);
      ctx.fillStyle = '#2d6e1e'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8ad046'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e23a3a'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1c1410';
      for (const [x, y] of [[-8, 6], [0, 9], [8, 6], [-4, 12], [5, 12]]) ctx.fillRect(x, y, 2, 3);
      ctx.restore();
      break;
    case 'dust':
      polyFill(ctx, [[12, 46], [24, 22], [32, 16], [42, 22], [52, 46], [36, 52], [20, 52]], c, 'rgba(20,16,14,0.85)', 3);
      ctx.fillStyle = shadeColor(c, 1.28);
      ctx.fillRect(28, 24, 5, 5); ctx.fillRect(22, 34, 6, 4); ctx.fillRect(36, 36, 5, 4);
      break;
    case 'string':
      outline(ctx, () => {
        ctx.moveTo(16, 48); ctx.bezierCurveTo(10, 26, 38, 12, 46, 24);
        ctx.bezierCurveTo(52, 34, 24, 54, 28, 34); ctx.quadraticCurveTo(32, 18, 50, 16);
      }, '#eceef2', 3.5, 2.5);
      break;
    case 'feather':
      outline(ctx, () => { ctx.moveTo(12, 52); ctx.lineTo(50, 14); }, '#dcdce4', 3, 2);
      polyFill(ctx, [[20, 44], [24, 24], [48, 10], [54, 16], [40, 40]], '#f6f6fa', 'rgba(30,30,40,0.8)', 2.5);
      outline(ctx, () => { ctx.moveTo(14, 50); ctx.lineTo(48, 16); }, '#cfd2dc', 2, 0);
      break;
    case 'bone':
      ctx.fillStyle = 'rgba(20,18,16,0.9)';
      for (const [x, y] of [[14, 46], [19, 51], [45, 13], [50, 18]]) { ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.28); ctx.fill(); }
      outline(ctx, () => { ctx.moveTo(17, 48); ctx.lineTo(47, 16); }, '#ede9dc', 7, 3);
      ctx.fillStyle = '#ede9dc';
      for (const [x, y] of [[14, 46], [19, 51], [45, 13], [50, 18]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.28); ctx.fill(); }
      break;
    case 'leather':
      polyFill(ctx, [[18, 12], [30, 16], [46, 12], [52, 26], [46, 40], [50, 52], [32, 48], [14, 52], [18, 38], [12, 24]], '#a86434', '#2a1608', 3);
      ctx.fillStyle = '#c07844'; ctx.fillRect(24, 22, 14, 16);
      break;
    case 'bow':
      outline(ctx, () => { ctx.moveTo(18, 10); ctx.lineTo(48, 52); }, '#dcdce2', 2.5, 2);
      outline(ctx, () => { ctx.moveTo(18, 10); ctx.quadraticCurveTo(54, 12, 48, 52); }, '#8e6234', 6, 3);
      outline(ctx, () => { ctx.moveTo(39, 21); ctx.lineTo(45, 29); }, '#52381c', 7, 0);
      break;
    case 'arrow':
      outline(ctx, () => { ctx.moveTo(14, 50); ctx.lineTo(48, 16); }, '#9a7040', 4, 2.5);
      polyFill(ctx, [[54, 10], [40, 14], [50, 24]], '#cfd4dc', '#18181c', 2.5);
      polyFill(ctx, [[10, 48], [18, 44], [20, 54], [14, 56]], '#f4f4f8', '#222', 2);
      break;
    case 'bucket':
      polyFill(ctx, [[14, 20], [50, 20], [44, 54], [20, 54]], '#b8bec8', '#1c2026', 3.5);
      ctx.fillStyle = '#dce2ec'; ctx.fillRect(20, 24, 6, 26);
      ctx.fillStyle = it.fill || '#3a404a';
      ctx.beginPath(); ctx.ellipse(32, 20, 18, 6, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#1c2026'; ctx.lineWidth = 2.5; ctx.stroke();
      if (it.fill) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(22, 18, 10, 3); }
      break;
    case 'seeds':
      for (const [x, y, r] of [[20, 40, -0.3], [32, 30, 0.2], [44, 42, 0.5], [26, 48, -0.1], [38, 48, 0.3], [30, 20, -0.4]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r);
        ctx.fillStyle = '#243a12'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 7, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#8cc446'; ctx.beginPath(); ctx.ellipse(0, 0, 3, 5.2, 0, 0, 6.28); ctx.fill();
        ctx.restore();
      }
      break;
    case 'wheat':
      for (const ox of [-9, 0, 9]) {
        outline(ctx, () => { ctx.moveTo(32 + ox * 0.6, 54); ctx.lineTo(32 + ox, 14); }, '#caa03c', 4, 2);
        ctx.fillStyle = '#eac45a';
        for (let y = 14; y < 34; y += 5) ctx.fillRect(29 + ox, y, 6, 4);
      }
      ctx.fillStyle = '#9a5228'; ctx.fillRect(22, 40, 20, 5);
      break;
    case 'orb':
      ctx.fillStyle = '#082622'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, 6.28); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(32, 32, 17, 0, 6.28); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.5); ctx.beginPath(); ctx.arc(26, 25, 6, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#cffaf0'; ctx.fillRect(23, 22, 4, 4);
      break;
    case 'rod':
      outline(ctx, () => { ctx.moveTo(14, 52); ctx.lineTo(50, 12); }, c, 7, 3);
      outline(ctx, () => { ctx.moveTo(16, 50); ctx.lineTo(48, 14); }, '#fff2a0', 2.5, 0);
      break;
    case 'eye':
      ctx.fillStyle = '#0a2a20'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#42b888'; ctx.beginPath(); ctx.arc(32, 32, 17, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#a8e870'; ctx.beginPath(); ctx.ellipse(32, 32, 12, 15, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#122018'; ctx.beginPath(); ctx.ellipse(32, 32, 4, 12, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#e8fff0'; ctx.fillRect(26, 24, 3, 3);
      break;
    case 'helmet':
      polyFill(ctx, [[12, 44], [12, 22], [20, 12], [44, 12], [52, 22], [52, 44], [42, 44], [42, 30], [22, 30], [22, 44]], c, '#18181c', 3.5);
      ctx.fillStyle = shadeColor(c, 1.25); ctx.fillRect(20, 16, 24, 5);
      break;
    case 'chestplate':
      polyFill(ctx, [[10, 16], [22, 12], [26, 20], [38, 20], [42, 12], [54, 16], [54, 30], [46, 30], [46, 52], [18, 52], [18, 30], [10, 30]], c, '#18181c', 3.5);
      ctx.fillStyle = shadeColor(c, 1.22); ctx.fillRect(22, 24, 8, 22);
      break;
    case 'leggings':
      polyFill(ctx, [[16, 12], [48, 12], [48, 52], [36, 52], [35, 28], [29, 28], [28, 52], [16, 52]], c, '#18181c', 3.5);
      ctx.fillStyle = shadeColor(c, 0.75); ctx.fillRect(18, 14, 28, 5);
      break;
    case 'boots':
      polyFill(ctx, [[10, 22], [26, 22], [26, 48], [8, 48], [8, 38], [14, 38]], c, '#18181c', 3.5);
      polyFill(ctx, [[38, 22], [54, 22], [56, 38], [56, 48], [38, 48]], c, '#18181c', 3.5);
      break;
    default:
      ctx.fillStyle = '#f0f'; ctx.fillRect(16, 16, 32, 32);
  }
}

export function iconCanvas(id) {
  if (cache.has(id)) return cache.get(id);
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const it = ITEMS[id];
  if (it) {
    if (it.block) {
      const d = BLOCKS[it.block];
      if (it.flat) {
        let src = tileCanvases[TILES[d.faces[0]]];
        if (d.tint === 1) src = tintedCanvas(src, DEFAULT_TINT);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 4, 4, 56, 56);
      } else drawIso(ctx, it.block);
    } else drawItem(ctx, it);
  }
  cache.set(id, cv);
  return cv;
}

const urlCache = new Map();
export function iconURL(id) {
  if (!urlCache.has(id)) urlCache.set(id, iconCanvas(id).toDataURL());
  return urlCache.get(id);
}

// HUD icons
export function hudIcon(type, state) {
  const k = type + state;
  if (urlCache.has(k)) return urlCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = 18;
  const ctx = cv.getContext('2d');
  const heart = () => { ctx.beginPath(); ctx.moveTo(9, 16); ctx.bezierCurveTo(1, 10, 0, 5, 3, 3); ctx.bezierCurveTo(6, 1, 8, 3, 9, 5); ctx.bezierCurveTo(10, 3, 12, 1, 15, 3); ctx.bezierCurveTo(18, 5, 17, 10, 9, 16); ctx.closePath(); };
  const drum = () => { ctx.beginPath(); ctx.ellipse(11, 7, 6, 5, 0.6, 0, Math.PI * 2); ctx.moveTo(7, 11); ctx.lineTo(3, 15); ctx.lineTo(5, 16); ctx.lineTo(8, 12); ctx.closePath(); };
  const bub = () => { ctx.beginPath(); ctx.arc(9, 9, 6, 0, Math.PI * 2); };
  const armor = () => {
    ctx.beginPath();
    ctx.moveTo(3, 3); ctx.lineTo(7, 2); ctx.lineTo(9, 5); ctx.lineTo(11, 2); ctx.lineTo(15, 3);
    ctx.lineTo(15, 8); ctx.lineTo(13, 8); ctx.lineTo(13, 15); ctx.lineTo(5, 15); ctx.lineTo(5, 8); ctx.lineTo(3, 8);
    ctx.closePath();
  };
  const shape = type === 'heart' ? heart : type === 'food' ? drum : type === 'armor' ? armor : bub;
  const full = type === 'heart' ? '#e8303a' : type === 'food' ? '#c07838' : type === 'armor' ? '#cfd8e6' : '#9ad8ff';
  ctx.lineWidth = 2; ctx.strokeStyle = '#120808';
  shape(); ctx.fillStyle = '#2a1a1a'; ctx.fill(); ctx.stroke();
  if (state > 0) {
    ctx.save();
    if (state === 1) { ctx.beginPath(); ctx.rect(0, 0, 9, 18); ctx.clip(); }
    shape(); ctx.fillStyle = full; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(4, 4, 3, 2);
    ctx.restore();
  }
  const url = cv.toDataURL();
  urlCache.set(k, url);
  return url;
}
