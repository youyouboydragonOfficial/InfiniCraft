import * as THREE from 'three';
import { moveAABB } from '../player/physics.js';
import { B, SOLID } from '../world/blocks.js';
import { I } from './items.js';
import { iconCanvas } from '../render/icons.js';
import { CH } from '../world/constants.js';

// ---------------- dropped items ----------------
const texCache = new Map();
function itemTex(id) {
  if (!texCache.has(id)) {
    const t = new THREE.CanvasTexture(iconCanvas(id));
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    texCache.set(id, t);
  }
  return texCache.get(id);
}

export class Drops {
  constructor(scene) { this.scene = scene; this.list = []; }
  spawn(id, count, pos, vel, dur) {
    const mat = new THREE.SpriteMaterial({ map: itemTex(id), alphaTest: 0.1 });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.35, 0.35, 0.35);
    this.scene.add(s);
    const v = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
    this.list.push({ id, count, dur, pos: pos.clone(), vel: v, age: 0, sprite: s, phase: Math.random() * 6 });
  }
  update(dt, world, player, inventory, onPickup) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      d.vel.y -= 20 * dt;
      d.vel.x *= Math.exp(-dt * 2); d.vel.z *= Math.exp(-dt * 2);
      const inW = world.getBlock(d.pos.x, d.pos.y, d.pos.z) === B.WATER;
      if (inW) { d.vel.y = Math.max(d.vel.y, -1); d.vel.y += 25 * dt; }
      const r = moveAABB(world, d.pos, d.vel, dt, 0.12, 0.25);
      if (r.onGround) { d.vel.x *= 0.5; d.vel.z *= 0.5; }
      d.sprite.position.set(d.pos.x, d.pos.y + 0.25 + Math.sin(d.age * 3 + d.phase) * 0.06, d.pos.z);
      // pickup
      if (!player.dead && d.age > 0.6) {
        const dx = player.pos.x - d.pos.x, dy = (player.pos.y + 0.9) - d.pos.y, dz = player.pos.z - d.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1.6) {
          const left = inventory.add(d.id, d.count, d.dur);
          if (left < d.count) onPickup();
          d.count = left;
        } else if (dist < 3) {
          d.vel.x += dx * dt * 10; d.vel.y += dy * dt * 10; d.vel.z += dz * dt * 10;
        }
      }
      if (d.count <= 0 || d.age > 300 || d.pos.y < -10) {
        this.scene.remove(d.sprite); d.sprite.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
  clear() { for (const d of this.list) this.scene.remove(d.sprite); this.list = []; }
}

// ---------------- mobs ----------------
function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivotLimb(w, h, d, color, x, y, z, parent) {
  const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
  box(w, h, d, color, 0, -h / 2, 0, p);
  return p;
}

function buildPig() {
  const g = new THREE.Group();
  const pink = 0xeea0a0;
  const body = box(0.62, 0.55, 1.0, pink, 0, 0.62, 0, g);
  const head = new THREE.Group(); head.position.set(0, 0.78, -0.62); g.add(head);
  box(0.5, 0.5, 0.45, pink, 0, 0, 0, head);
  box(0.26, 0.18, 0.08, 0xd88080, 0, -0.06, -0.26, head);
  box(0.07, 0.07, 0.02, 0x222222, -0.14, 0.08, -0.23, head); box(0.07, 0.07, 0.02, 0x222222, 0.14, 0.08, -0.23, head);
  box(0.06, 0.06, 0.02, 0xffffff, -0.2, 0.08, -0.23, head); box(0.06, 0.06, 0.02, 0xffffff, 0.2, 0.08, -0.23, head);
  const legs = [];
  for (const [x, z] of [[-0.18, -0.32], [0.18, -0.32], [-0.18, 0.32], [0.18, 0.32]]) legs.push(pivotLimb(0.2, 0.36, 0.2, 0xe09090, x, 0.36, z, g));
  return { g, head, legs, arms: [], body };
}

function buildZombie() {
  const g = new THREE.Group();
  const skin = 0x4f8a3c, shirt = 0x2f8f9a, pants = 0x3c3f8a;
  const body = box(0.5, 0.75, 0.26, shirt, 0, 1.12, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.5 + 0.0, 0); g.add(head);
  box(0.5, 0.5, 0.5, skin, 0, 0.25, 0, head);
  box(0.1, 0.06, 0.02, 0x101010, -0.12, 0.28, -0.26, head); box(0.1, 0.06, 0.02, 0x101010, 0.12, 0.28, -0.26, head);
  box(0.2, 0.05, 0.02, 0x2a4a20, 0, 0.12, -0.26, head);
  const legs = [pivotLimb(0.24, 0.75, 0.24, pants, -0.13, 0.75, 0, g), pivotLimb(0.24, 0.75, 0.24, pants, 0.13, 0.75, 0, g)];
  const arms = [pivotLimb(0.22, 0.72, 0.22, skin, -0.37, 1.45, 0, g), pivotLimb(0.22, 0.72, 0.22, skin, 0.37, 1.45, 0, g)];
  arms.forEach(a => a.rotation.x = -Math.PI / 2);
  return { g, head, legs, arms, body };
}

const TYPES = {
  pig: { hp: 10, speed: 1.3, hw: 0.45, h: 0.9, build: buildPig },
  zombie: { hp: 20, speed: 2.4, hw: 0.3, h: 1.95, build: buildZombie, hostile: true },
};

export class Mobs {
  constructor(scene) { this.scene = scene; this.list = []; this.spawnTimer = 0; }

  spawn(type, x, y, z) {
    const T = TYPES[type];
    const model = T.build();
    this.scene.add(model.g);
    const m = { type, T, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: Math.random() * 6.28, hp: T.hp, onGround: false,
      ai: 0, wish: new THREE.Vector2(), walk: 0, hurt: 0, attackCd: 0, dead: 0, sayTimer: 3 + Math.random() * 10, burn: 0 };
    this.list.push(m);
    return m;
  }

  raycast(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.list) {
      if (m.dead) continue;
      const min = [m.pos.x - m.T.hw, m.pos.y, m.pos.z - m.T.hw], max = [m.pos.x + m.T.hw, m.pos.y + m.T.h, m.pos.z + m.T.hw];
      const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
      let t0 = 0, t1 = bestT, ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-8) { if (o[a] < min[a] || o[a] > max[a]) { ok = false; break; } continue; }
        let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < bestT) { bestT = t0; best = m; }
    }
    return best ? { mob: best, dist: bestT } : null;
  }

  hit(m, dmg, dir, drops, sfx) {
    if (m.dead || m.hurt > 0.3) return;
    m.hp -= dmg;
    m.hurt = 0.5;
    m.vel.x += dir.x * 6; m.vel.z += dir.z * 6; m.vel.y = 5;
    sfx.mobHurt(m.type);
    if (m.type === 'pig') { m.ai = 3; m.panic = 4; }
    if (m.hp <= 0) {
      m.dead = 1;
      const p = m.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
      if (m.type === 'pig') drops.spawn(I.RAW_PORK, 1 + Math.floor(Math.random() * 3), p);
      if (m.type === 'zombie') drops.spawn(I.ROTTEN_FLESH, Math.floor(Math.random() * 3), p);
    }
  }

  update(dt, world, player, sky, drops, events, sfx, peaceful) {
    const day = sky.day;
    // spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      let pigs = 0, zombies = 0;
      for (const m of this.list) { if (m.type === 'pig') pigs++; else zombies++; }
      const tryPos = () => {
        const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 30;
        const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
        if (!world.isLoaded(x, z)) return null;
        const y = world.topSolid(x, z);
        if (y < 0 || y > CH - 4) return null;
        return { x: x + 0.5, y: y + 1, z: z + 0.5, ground: world.getBlock(x, y, z), above: world.getBlock(x, y + 1, z) };
      };
      if (pigs < 6 && Math.random() < 0.3) {
        const p = tryPos();
        if (p && p.ground === B.GRASS && (p.above === 0 || p.above === B.TALL_GRASS)) {
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) this.spawn('pig', p.x + i * 0.3, p.y, p.z);
        }
      }
      if (!peaceful && day < 0.25 && zombies < 8 && Math.random() < 0.5) {
        const p = tryPos();
        if (p && p.above === 0 && SOLID[p.ground] && p.ground !== B.LEAVES && p.ground !== B.WATER) this.spawn('zombie', p.x, p.y, p.z);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const dxp = player.pos.x - m.pos.x, dzp = player.pos.z - m.pos.z;
      const distP = Math.hypot(dxp, dzp);
      if (distP > 110 || m.dead > 1 || (peaceful && m.T.hostile)) { this.scene.remove(m.model.g); this.list.splice(i, 1); continue; }
      if (m.dead) { m.dead += dt; m.model.g.rotation.z = Math.min(Math.PI / 2, m.dead * 6); this.tint(m, 1); if (m.dead > 1) m.dead = 2; continue; }
      if (!world.isLoaded(m.pos.x, m.pos.z)) continue;

      m.ai -= dt; m.hurt -= dt; m.attackCd -= dt; m.sayTimer -= dt;
      if (m.sayTimer < 0) { m.sayTimer = 6 + Math.random() * 12; if (distP < 16) sfx.mobSay(m.type); }
      let speed = m.T.speed;
      if (m.T.hostile && !player.dead && player.mode === 'survival' && distP < 32 && Math.abs(player.pos.y - m.pos.y) < 12) {
        m.wish.set(dxp, dzp).normalize();
        if (distP < 1.3 && Math.abs(player.pos.y - m.pos.y) < 1.8 && m.attackCd <= 0) {
          m.attackCd = 1;
          player.damage(3, events, 'zombie');
          player.vel.x += (dxp / (distP || 1)) * 5; player.vel.z += (dzp / (distP || 1)) * 5; player.vel.y = 4;
        }
      } else {
        if (m.panic > 0) { m.panic -= dt; speed *= 2; }
        if (m.ai <= 0) {
          m.ai = 2 + Math.random() * 5;
          if (Math.random() < 0.4) m.wish.set(0, 0);
          else { const a = Math.random() * 6.28; m.wish.set(Math.cos(a), Math.sin(a)); }
        }
      }
      const k = 1 - Math.exp(-dt * (m.onGround ? 10 : 2));
      if (m.hurt < 0.2) {
        m.vel.x += (m.wish.x * speed - m.vel.x) * k;
        m.vel.z += (m.wish.y * speed - m.vel.z) * k;
      }
      const inW = world.getBlock(m.pos.x, m.pos.y + 0.4, m.pos.z) === B.WATER;
      if (inW) { m.vel.y += 14 * dt; m.vel.y = Math.min(m.vel.y, 2.5); }
      m.vel.y -= 28 * dt;
      const r = moveAABB(world, m.pos, m.vel, dt, m.T.hw, m.T.h);
      m.onGround = r.onGround;
      if ((r.hitX || r.hitZ) && m.onGround && (m.wish.lengthSq() > 0)) m.vel.y = 8;
      // fall into void
      if (m.pos.y < -10) m.dead = 2;
      // sun burns zombies
      if (m.type === 'zombie' && day > 0.6) {
        m.burn += dt;
        if (m.burn > 1) { m.burn = 0; m.hp -= 2; m.hurt = 0.3; if (m.hp <= 0) this.hit(m, 0, new THREE.Vector3(), drops, sfx), m.dead = 1; }
      }
      // animate
      if (m.wish.lengthSq() > 0.01) {
        const target = Math.atan2(-m.wish.x, -m.wish.y);
        let d = target - m.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        m.yaw += d * Math.min(1, dt * 6);
      }
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.walk += hs * dt * 3.2;
      const sw = Math.sin(m.walk) * Math.min(1, hs / 1.5) * 0.7;
      m.model.legs.forEach((l, j) => l.rotation.x = (j % 2 === (j < 2 ? 0 : 1) ? sw : -sw));
      if (m.model.arms.length) { m.model.arms[0].rotation.x = -Math.PI / 2 + sw * 0.3; m.model.arms[1].rotation.x = -Math.PI / 2 - sw * 0.3; }
      m.model.g.position.copy(m.pos);
      m.model.g.rotation.y = m.yaw;
      this.tint(m, m.hurt > 0 ? 1 : 0);
    }
  }

  tint(m, k) {
    if (m._tint === k) return;
    m._tint = k;
    m.model.g.traverse(o => { if (o.material) o.material.emissive.setRGB(k * 0.6, 0, 0); });
  }

  clear() { for (const m of this.list) this.scene.remove(m.model.g); this.list = []; }
  serialize() { return this.list.filter(m => !m.dead && m.type === 'pig').map(m => [m.type, m.pos.x, m.pos.y, m.pos.z]); }
}
