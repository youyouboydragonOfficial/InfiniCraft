import { BLOCKS, TILES } from '../world/blocks.js';
import { ITEMS } from '../game/items.js';
import { tileCanvases, blockFaceCanvas, DEFAULT_TINT, tintedCanvas } from './textures.js';

const cache = new Map();
const S = 64;

function drawIso(ctx, id) {
  const top = blockFaceCanvas(id, 2), left = blockFaceCanvas(id, 4), right = blockFaceCanvas(id, 0);
  ctx.imageSmoothingEnabled = false;
  const k = S / 64;
  ctx.save(); ctx.setTransform(0.875 * k, -0.4375 * k, 0.875 * k, 0.4375 * k, 4 * k, 18 * k); ctx.drawImage(top, 0, 0); ctx.restore();
  ctx.save(); ctx.setTransform(0.875 * k, 0.4375 * k, 0, 0.875 * k, 4 * k, 18 * k); ctx.drawImage(left, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, 32, 32); ctx.restore();
  ctx.save(); ctx.setTransform(0.875 * k, -0.4375 * k, 0, 0.875 * k, 32 * k, 32 * k); ctx.drawImage(right, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, 0, 32, 32); ctx.restore();
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
    case 'ingot':
      ctx.fillStyle = 'rgba(20,14,8,0.9)'; ctx.beginPath(); ctx.moveTo(6, 40); ctx.lineTo(22, 24); ctx.lineTo(58, 24); ctx.lineTo(48, 42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(10, 39); ctx.lineTo(23, 27); ctx.lineTo(54, 27); ctx.lineTo(46, 39); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shadeColor(c, 1.2); ctx.fillRect(24, 29, 26, 3);
      ctx.fillStyle = shadeColor(c, 0.7); ctx.fillRect(12, 37, 34, 2);
      break;
    case 'gem':
      ctx.fillStyle = 'rgba(10,30,30,0.9)'; ctx.beginPath(); ctx.moveTo(32, 6); ctx.lineTo(56, 26); ctx.lineTo(32, 58); ctx.lineTo(8, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(32, 10); ctx.lineTo(52, 26); ctx.lineTo(32, 53); ctx.lineTo(12, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8fffa'; ctx.beginPath(); ctx.moveTo(32, 10); ctx.lineTo(40, 26); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
      break;
    case 'apple':
      ctx.fillStyle = '#5a0c0c'; ctx.beginPath(); ctx.arc(32, 36, 19, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d42a2a'; ctx.beginPath(); ctx.arc(32, 36, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8080'; ctx.beginPath(); ctx.arc(25, 30, 4, 0, Math.PI * 2); ctx.fill();
      outline(ctx, () => { ctx.moveTo(32, 20); ctx.lineTo(34, 10); }, '#6a4a22', 3, 2);
      ctx.fillStyle = '#4caa3a'; ctx.beginPath(); ctx.ellipse(41, 13, 7, 3.5, -0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'meat':
      ctx.fillStyle = 'rgba(30,10,10,0.9)'; ctx.beginPath(); ctx.ellipse(32, 34, 24, 17, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(32, 34, 21, 14, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,230,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(32, 34, 14, 8, -0.4, 0.4, 2.6); ctx.stroke();
      break;
    case 'bread':
      ctx.fillStyle = '#3a240c'; ctx.beginPath(); ctx.ellipse(32, 36, 26, 13, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8873a'; ctx.beginPath(); ctx.ellipse(32, 35, 23, 10, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f0c070'; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 8, 30 + i * 2); ctx.lineTo(34 + i * 8, 38 + i * 2); ctx.stroke(); }
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
  const shape = type === 'heart' ? heart : type === 'food' ? drum : bub;
  const full = type === 'heart' ? '#e8303a' : type === 'food' ? '#c07838' : '#9ad8ff';
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
