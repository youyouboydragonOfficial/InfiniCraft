import * as THREE from 'three';
import { CS, CH, PAD } from './constants.js';
import { SHAPE, SOLID, BLOCKS } from './blocks.js';

const W = CS + 2 * PAD;
const key = (cx, cz) => cx + ',' + cz;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = key(cx, cz);
    this.data = null; this.genPending = false;
    this.version = 0; this.builtVersion = -1; this.meshPending = false;
    this.meshes = []; this.modified = false;
  }
}

export class World {
  constructor(scene, seed, materials, savedChunks) {
    this.scene = scene; this.seed = seed; this.mats = materials;
    this.chunks = new Map();
    this.saved = savedChunks || new Map(); // key -> Uint8Array (modified chunks)
    this.renderDist = 8;
    this.offsets = [];
    this.urgent = new Set();
    this.shadowDist = 4;
    const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (e) => { w.busy--; this.onMessage(e.data); };
      w.onerror = (e) => console.error('worker error', e.message || e);
      w.postMessage({ type: 'init', seed });
      this.workers.push(w);
    }
    this.frame = 0;
  }

  setRenderDistance(rd) {
    this.renderDist = rd;
    const r = rd + 1;
    const o = [];
    for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) if (x * x + z * z <= r * r + 1) o.push([x, z, x * x + z * z]);
    o.sort((a, b) => a[2] - b[2]);
    this.offsets = o;
  }

  freeWorker() {
    let best = null;
    for (const w of this.workers) if (w.busy < 2 && (!best || w.busy < best.busy)) best = w;
    return best;
  }

  getChunk(cx, cz) { return this.chunks.get(key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return -1;
    return c.data[(x - cx * CS) + (z - cz * CS) * CS + y * CS * CS];
  }

  isLoaded(x, z) {
    const c = this.chunks.get(key(Math.floor(x / CS), Math.floor(z / CS)));
    return !!(c && c.data);
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CH) return false;
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return false;
    const lx = x - cx * CS, lz = z - cz * CS;
    c.data[lx + lz * CS + y * CS * CS] = id;
    c.modified = true;
    this.saved.set(c.key, c.data);
    this.markDirty(c);
    const dx = lx < PAD ? -1 : (lx >= CS - PAD ? 1 : 0);
    const dz = lz < PAD ? -1 : (lz >= CS - PAD ? 1 : 0);
    if (dx) this.markDirty(this.getChunk(cx + dx, cz));
    if (dz) this.markDirty(this.getChunk(cx, cz + dz));
    if (dx && dz) this.markDirty(this.getChunk(cx + dx, cz + dz));
    return true;
  }

  markDirty(c) { if (!c) return; c.version++; this.urgent.add(c.key); }

  topSolid(x, z) {
    for (let y = CH - 1; y > 0; y--) { const b = this.getBlock(x, y, z); if (b > 0 && SOLID[b]) return y; }
    return -1;
  }

  update(px, pz) {
    this.frame++;
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    // urgent remeshes first
    for (const k of this.urgent) {
      const c = this.chunks.get(k);
      if (!c) { this.urgent.delete(k); continue; }
      if (c.meshPending) continue;
      if (this.requestMesh(c)) this.urgent.delete(k); else break;
    }
    for (const [ox, oz, d2] of this.offsets) {
      const cx = pcx + ox, cz = pcz + oz;
      const k = key(cx, cz);
      let c = this.chunks.get(k);
      if (!c) {
        c = new Chunk(cx, cz);
        this.chunks.set(k, c);
        const s = this.saved.get(k);
        if (s) { c.data = s; c.modified = true; }
      }
      if (!c.data && !c.genPending) {
        const w = this.freeWorker();
        if (!w) continue;
        w.busy++; c.genPending = true;
        w.postMessage({ type: 'gen', key: k, cx, cz });
        continue;
      }
      const rd = this.renderDist;
      if (c.data && !c.meshPending && c.builtVersion !== c.version && d2 <= rd * rd + 1) this.requestMesh(c);
    }
    // shadows only for near chunks
    if (this.frame % 20 === 0) {
      const sd = this.shadowDist;
      for (const c of this.chunks.values()) {
        const near = Math.abs(c.cx - pcx) <= sd && Math.abs(c.cz - pcz) <= sd;
        if (c.meshes[0]) c.meshes[0].castShadow = near;
      }
    }
    // unload
    if (this.frame % 30 === 0) {
      const lim = this.renderDist + 3;
      for (const [k, c] of this.chunks) {
        if (Math.abs(c.cx - pcx) > lim || Math.abs(c.cz - pcz) > lim) {
          this.disposeMeshes(c);
          this.chunks.delete(k);
          this.urgent.delete(k);
        }
      }
    }
  }

  requestMesh(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n || !n.data) return false;
    }
    const w = this.freeWorker();
    if (!w) return false;
    const vol = new Uint8Array(W * W * CH);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz).data;
      // source x range in neighbor chunk
      const sx0 = dx === -1 ? CS - PAD : 0, sx1 = dx === 1 ? PAD : CS;
      const sz0 = dz === -1 ? CS - PAD : 0, sz1 = dz === 1 ? PAD : CS;
      const tx0 = dx === -1 ? 0 : (dx === 0 ? PAD : PAD + CS);
      const tz0 = dz === -1 ? 0 : (dz === 0 ? PAD : PAD + CS);
      const len = sx1 - sx0;
      for (let y = 0; y < CH; y++) {
        for (let z = sz0; z < sz1; z++) {
          const s = sx0 + z * CS + y * CS * CS;
          const t = tx0 + (tz0 + z - sz0) * W + y * W * W;
          vol.set(n.subarray(s, s + len), t);
        }
      }
    }
    w.busy++;
    c.meshPending = true;
    w.postMessage({ type: 'mesh', key: c.key, cx: c.cx, cz: c.cz, version: c.version, vol }, [vol.buffer]);
    return true;
  }

  onMessage(m) {
    const c = this.chunks.get(m.key);
    if (m.type === 'gen') {
      if (!c) return;
      c.genPending = false;
      if (!c.data) c.data = m.data;
    } else if (m.type === 'mesh') {
      if (!c) return;
      c.meshPending = false;
      this.applyMesh(c, m.r);
      c.builtVersion = m.version;
      if (m.version < c.version) this.urgent.add(c.key);
    }
  }

  applyMesh(c, r) {
    this.disposeMeshes(c);
    const parts = [['solid', this.mats.solid], ['plants', this.mats.plants], ['water', this.mats.water]];
    const center = new THREE.Vector3(CS / 2, (r.minY + r.maxY) / 2, CS / 2);
    const radius = Math.sqrt(CS * CS / 2 + ((r.maxY - r.minY) / 2) ** 2) + 1;
    parts.forEach(([name, mat], i) => {
      const p = r[name];
      if (!p.count) { c.meshes[i] = null; return; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(p.normal, 3, true));
      g.setAttribute('aUv', new THREE.BufferAttribute(p.aUv, 2));
      g.setAttribute('aData', new THREE.BufferAttribute(p.aData, 4));
      g.setAttribute('aTint', new THREE.BufferAttribute(p.aTint, 3, true));
      g.setIndex(new THREE.BufferAttribute(p.index, 1));
      g.boundingSphere = new THREE.Sphere(center.clone(), radius);
      g.boundingBox = new THREE.Box3(new THREE.Vector3(0, r.minY, 0), new THREE.Vector3(CS, r.maxY + 1, CS));
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(c.cx * CS, 0, c.cz * CS);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = name !== 'water';
      mesh.castShadow = false;
      if (name === 'water') mesh.renderOrder = 1;
      this.scene.add(mesh);
      c.meshes[i] = mesh;
    });
  }

  disposeMeshes(c) {
    for (const m of c.meshes) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = [];
  }

  isReady(x, z) {
    const c = this.getChunk(Math.floor(x / CS), Math.floor(z / CS));
    return c && c.data && c.builtVersion >= 0;
  }

  stats() {
    let meshed = 0;
    for (const c of this.chunks.values()) if (c.builtVersion >= 0) meshed++;
    return { loaded: this.chunks.size, meshed };
  }

  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : (origin.x - x) * tdx;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : (origin.y - y) * tdy;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : (origin.z - z) * tdz;
    if (!isFinite(tmx)) tmx = Infinity; if (!isFinite(tmy)) tmy = Infinity; if (!isFinite(tmz)) tmz = Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id > 0 && SHAPE[id] !== 4 && SHAPE[id] !== 0) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeMeshes(c);
    this.chunks.clear();
    for (const w of this.workers) w.terminate();
  }
}

export { BLOCKS };
