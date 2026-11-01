import * as THREE from 'three';
import { moveAABB } from '../player/physics.js';
import { B, SOLID } from '../world/blocks.js';
import { I } from './items.js';
import { iconCanvas } from '../render/icons.js';
import { blockFaceCanvas } from '../render/textures.js';
import { CH, CS } from '../world/constants.js';
import { isFortressChunk, endPillars } from '../world/generator.js';

// ---------------- dropped items ----------------
const texCache = new Map();
function itemTex(id) {
  if (!texCache.has(id)) {
    const t = new THREE.CanvasTexture(iconCanvas(id));
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    texCache.set(id, t);
  }
  return texCache.get(id);
}

export class Drops {
  constructor(scene) { this.scene = scene; this.list = []; }
  spawn(id, count, pos, vel, dur) {
    if (!id || count <= 0) return;
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
      if (!player.dead && d.age > 0.55) {
        const dx = player.pos.x - d.pos.x, dy = (player.pos.y + 0.9) - d.pos.y, dz = player.pos.z - d.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1.65) {
          const left = inventory.add(d.id, d.count, d.dur);
          if (left < d.count) onPickup();
          d.count = left;
        } else if (dist < 3.2) {
          d.vel.x += dx * dt * 10; d.vel.y += dy * dt * 10; d.vel.z += dz * dt * 10;
        }
      }
      if (d.count <= 0 || d.age > 300 || d.pos.y < -15) {
        this.scene.remove(d.sprite); d.sprite.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }
  clear() { for (const d of this.list) { this.scene.remove(d.sprite); d.sprite.material.dispose(); } this.list = []; }
}

// ---------------- projectiles, primed TNT & End Crystals ----------------
let tntMats = null;
function getTntMaterials() {
  if (tntMats) return tntMats;
  tntMats = [0, 1, 2, 3, 4, 5].map(f => {
    const t = new THREE.CanvasTexture(blockFaceCanvas(B.TNT, f));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({ map: t });
  });
  return tntMats;
}

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.tnts = [];
    this.crystals = [];
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.healBeam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xe870ff, linewidth: 2 }));
    this.healBeam.visible = false;
    this.healBeam.frustumCulled = false;
    scene.add(this.healBeam);
  }

  spawnArrow(pos, vel, fromPlayer, dmg = 6) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.55), new THREE.MeshLambertMaterial({ color: 0x9a7040 }));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), new THREE.MeshLambertMaterial({ color: 0xd0d4dc }));
    tip.position.z = 0.28;
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), new THREE.MeshLambertMaterial({ color: 0xf4f4f8 }));
    fletch.position.z = -0.25;
    g.add(shaft, tip, fletch);
    g.position.copy(pos);
    this.scene.add(g);
    this.list.push({ kind: 'arrow', mesh: g, pos: pos.clone(), vel: vel.clone(), fromPlayer, dmg, age: 0, stuck: false });
  }

  spawnPearl(pos, vel) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex(I.ENDER_PEARL) }));
    s.scale.set(0.35, 0.35, 0.35);
    s.position.copy(pos);
    this.scene.add(s);
    this.list.push({ kind: 'pearl', mesh: s, pos: pos.clone(), vel: vel.clone(), age: 0 });
  }

  spawnEye(pos, targetPos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: itemTex(I.EYE_OF_ENDER) }));
    s.scale.set(0.42, 0.42, 0.42);
    s.position.copy(pos);
    this.scene.add(s);
    const dx = targetPos.x - pos.x, dz = targetPos.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const travel = Math.min(12, d);
    const goal = new THREE.Vector3(pos.x + (dx / d) * travel, pos.y + (d < 18 ? -2.5 : 4.8), pos.z + (dz / d) * travel);
    this.list.push({ kind: 'eye', mesh: s, pos: pos.clone(), goal, age: 0 });
  }

  spawnFireball(pos, vel, big = false) {
    const sz = big ? 0.55 : 0.28;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(sz, sz, sz),
      new THREE.MeshBasicMaterial({ color: big ? 0xff7820 : 0xffb830 })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.list.push({ kind: big ? 'ghastBall' : 'blazeBall', mesh: m, pos: pos.clone(), vel: vel.clone(), age: 0, reflected: false });
  }

  spawnTNT(x, y, z, fuse = 3.5, vel = null) {
    const mats = getTntMaterials().map(m => m.clone());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), mats);
    const pos = new THREE.Vector3(x, y, z);
    mesh.position.set(x, y + 0.49, z);
    this.scene.add(mesh);
    const v = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 1.6, 4.2, (Math.random() - 0.5) * 1.6);
    this.tnts.push({ mesh, mats, pos, vel: v, fuse, maxFuse: fuse });
  }

  spawnEndCrystals(seed) {
    this.clearCrystals();
    for (const p of endPillars(seed)) {
      const g = new THREE.Group();
      const pos = new THREE.Vector3(p.x + 0.5, p.topY + 1.4, p.z + 0.5);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshLambertMaterial({ color: 0xe070ff, emissive: 0x4a1068, transparent: true, opacity: 0.78 }));
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshBasicMaterial({ color: 0xffd0ff }));
      g.add(outer, inner);
      g.position.copy(pos);
      this.scene.add(g);
      this.crystals.push({ g, outer, inner, pos, alive: true, phase: Math.random() * 6.28 });
    }
  }

  clearCrystals() {
    for (const c of this.crystals) this.scene.remove(c.g);
    this.crystals = [];
    this.healBeam.visible = false;
  }

  raycastHit(origin, dir, maxDist) {
    // Check End Crystals & deflectable Ghast fireballs
    let best = null, bestT = maxDist;
    const testSphere = (center, rad, tag) => {
      const oc = center.clone().sub(origin);
      const b = oc.dot(dir);
      if (b < 0 || b > bestT) return;
      const c2 = oc.lengthSq() - b * b;
      if (c2 <= rad * rad) { bestT = b; best = tag; }
    };
    for (const c of this.crystals) if (c.alive) testSphere(c.pos, 0.85, { type: 'crystal', ref: c });
    for (const p of this.list) if (p.kind === 'ghastBall') testSphere(p.pos, 0.75, { type: 'fireball', ref: p });
    return best ? { ...best, dist: bestT } : null;
  }

  damageCrystal(c, onExplode) {
    if (!c.alive) return;
    c.alive = false;
    this.scene.remove(c.g);
    onExplode(c.pos.clone(), 4.5, 'crystal');
  }

  deflectFireball(p, dir, sfx) {
    p.vel.copy(dir).multiplyScalar(22);
    p.reflected = true;
    sfx.hit('metal');
  }

  update(dt, world, player, mobs, drops, events, sfx, onExplode, onPearlLand) {
    // Primed TNT
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i];
      t.fuse -= dt;
      t.vel.y -= 24 * dt;
      t.vel.x *= Math.exp(-dt * 2);
      t.vel.z *= Math.exp(-dt * 2);
      const r = moveAABB(world, t.pos, t.vel, dt, 0.48, 0.98, { stepHeight: 0 });
      if (r.onGround) { t.vel.x *= 0.65; t.vel.z *= 0.65; }
      const flash = Math.floor(t.fuse * 7) % 2 === 0 ? 0.7 : 0;
      const swell = t.fuse < 0.45 ? 1 + (0.45 - t.fuse) * 0.55 : 1;
      for (const m of t.mats) m.emissive.setRGB(flash, flash, flash);
      t.mesh.scale.setScalar(swell);
      t.mesh.position.set(t.pos.x, t.pos.y + 0.49 * swell, t.pos.z);
      if (t.fuse <= 0) {
        this.scene.remove(t.mesh);
        for (const m of t.mats) m.dispose();
        const ep = t.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.tnts.splice(i, 1);
        onExplode(ep, 4.0, 'tnt');
      }
    }

    // End Crystals animation + Dragon heal beam
    const dragon = mobs.list.find(m => m.type === 'dragon' && !m.dead);
    let nearestCrystal = null, nearestDist = 30;
    const nowT = performance.now() * 0.001;
    for (const c of this.crystals) {
      if (!c.alive) continue;
      c.outer.rotation.y += dt * 1.4; c.outer.rotation.x += dt * 0.9;
      c.inner.rotation.y -= dt * 2.2; c.inner.rotation.z += dt * 1.6;
      c.g.position.y = c.pos.y + Math.sin(nowT * 2.5 + c.phase) * 0.22;
      if (dragon) {
        const d = dragon.pos.distanceTo(c.pos);
        if (d < nearestDist) { nearestDist = d; nearestCrystal = c; }
      }
    }
    if (dragon && nearestCrystal) {
      dragon.hp = Math.min(dragon.T.hp, dragon.hp + dt * 2.5);
      const posAttr = this.healBeam.geometry.attributes.position;
      posAttr.setXYZ(0, nearestCrystal.pos.x, nearestCrystal.g.position.y, nearestCrystal.pos.z);
      posAttr.setXYZ(1, dragon.pos.x, dragon.pos.y + 1.2, dragon.pos.z);
      posAttr.needsUpdate = true;
      this.healBeam.visible = true;
    } else {
      this.healBeam.visible = false;
    }

    // Projectiles
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.kind === 'eye') {
        p.pos.lerp(p.goal, Math.min(1, dt * 4.5));
        p.mesh.position.copy(p.pos);
        if (p.age > 1.55) {
          this.removeProj(i);
          if (Math.random() < 0.8) { drops.spawn(I.EYE_OF_ENDER, 1, p.pos, new THREE.Vector3(0, 1, 0)); sfx.pop(); }
          else sfx.break('glass');
        }
        continue;
      }

      if (p.kind === 'arrow') {
        if (p.stuck) {
          if (p.fromPlayer && !player.dead && player.pos.distanceTo(p.pos) < 1.5 && p.age > 0.5) {
            if (player.mode === 'survival') drops.spawn(I.ARROW, 1, p.pos, new THREE.Vector3());
            sfx.pop();
            this.removeProj(i);
            continue;
          }
          if (p.age > 12) this.removeProj(i);
          continue;
        }
        p.vel.y -= 20 * dt;
      } else if (p.kind === 'pearl') {
        p.vel.y -= 22 * dt;
      }

      const steps = 3;
      let removed = false;
      for (let s = 0; s < steps && !removed; s++) {
        const prev = p.pos.clone();
        p.pos.addScaledVector(p.vel, dt / steps);
        const bid = world.getBlock(p.pos.x, p.pos.y, p.pos.z);
        if (bid > 0 && SOLID[bid]) {
          if (p.kind === 'arrow') {
            p.stuck = true;
            sfx.arrowHit();
          } else if (p.kind === 'pearl') {
            onPearlLand(prev);
            this.removeProj(i);
          } else if (p.kind === 'ghastBall') {
            const ep = prev.clone();
            this.removeProj(i);
            onExplode(ep, 2.2, 'ghast');
          } else {
            this.removeProj(i);
          }
          removed = true;
          break;
        }

        // Hit End Crystal with player arrow
        if (p.kind === 'arrow' && p.fromPlayer) {
          for (const c of this.crystals) {
            if (c.alive && c.pos.distanceTo(p.pos) < 1.0) {
              this.damageCrystal(c, onExplode);
              this.removeProj(i);
              removed = true;
              break;
            }
          }
          if (removed) break;
        }

        // Hit mobs
        if ((p.kind === 'arrow' && p.fromPlayer) || (p.kind === 'ghastBall' && p.reflected)) {
          for (const m of mobs.list) {
            if (m.dead) continue;
            if (Math.abs(p.pos.x - m.pos.x) < m.T.hw + 0.25 && Math.abs(p.pos.z - m.pos.z) < m.T.hw + 0.25 && p.pos.y >= m.pos.y - 0.1 && p.pos.y <= m.pos.y + m.T.h + 0.2) {
              if (m.type === 'enderman' && p.kind === 'arrow') {
                mobs.teleportMob(m, world, sfx);
                this.removeProj(i);
                removed = true;
                break;
              }
              const dir = p.vel.clone().normalize();
              const dmg = p.kind === 'ghastBall' ? 100 : p.dmg;
              mobs.hit(m, dmg, dir, drops, sfx, true);
              sfx.arrowHit();
              if (p.kind === 'ghastBall') onExplode(p.pos.clone(), 2.2, 'ghast');
              this.removeProj(i);
              removed = true;
              break;
            }
          }
          if (removed) break;
        }

        // Hit player
        if (!p.fromPlayer && !p.reflected && (p.kind === 'arrow' || p.kind === 'ghastBall' || p.kind === 'blazeBall') && !player.dead) {
          if (Math.abs(p.pos.x - player.pos.x) < 0.5 && Math.abs(p.pos.z - player.pos.z) < 0.5 && p.pos.y >= player.pos.y && p.pos.y <= player.pos.y + 1.85) {
            if (p.kind === 'arrow') {
              player.damage(4, events, 'skeleton');
              sfx.arrowHit();
            } else if (p.kind === 'blazeBall') {
              player.burnTime = Math.max(player.burnTime, 5);
              player.damage(5, events, 'blaze');
            } else if (p.kind === 'ghastBall') {
              onExplode(p.pos.clone(), 2.2, 'ghast');
            }
            this.removeProj(i);
            removed = true;
            break;
          }
        }
      }
      if (removed) continue;

      p.mesh.position.copy(p.pos);
      if (p.kind === 'arrow' && !p.stuck && p.vel.lengthSq() > 0.01) {
        p.mesh.lookAt(p.pos.clone().add(p.vel));
      } else if (p.kind === 'ghastBall' || p.kind === 'blazeBall') {
        p.mesh.rotation.x += dt * 6; p.mesh.rotation.y += dt * 5;
      }
      if (p.age > 15 || p.pos.y < -30) this.removeProj(i);
    }
  }

  removeProj(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
    for (const t of this.tnts) { this.scene.remove(t.mesh); for (const m of t.mats) m.dispose(); }
    this.tnts = [];
    this.clearCrystals();
  }
}

// ---------------- 13 Mob Models & AI ----------------
function box(w, h, d, color, x, y, z, parent, emissive = 0) {
  const mat = new THREE.MeshLambertMaterial({ color });
  if (emissive) mat.emissive.setHex(emissive);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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

function buildCow() {
  const g = new THREE.Group();
  const brown = 0x4b3424, patch = 0xdcd8d0;
  const body = box(0.74, 0.68, 1.16, brown, 0, 0.88, 0, g);
  box(0.76, 0.32, 0.38, patch, 0, 0.96, -0.15, g);
  box(0.32, 0.1, 0.28, 0xe8a8a8, 0, 0.52, 0.22, g);
  const head = new THREE.Group(); head.position.set(0, 1.08, -0.72); g.add(head);
  box(0.5, 0.5, 0.44, brown, 0, 0, 0, head);
  box(0.32, 0.2, 0.08, 0xd8b8a8, 0, -0.1, -0.24, head);
  box(0.08, 0.18, 0.08, 0xc8c0a8, -0.26, 0.24, -0.05, head);
  box(0.08, 0.18, 0.08, 0xc8c0a8, 0.26, 0.24, -0.05, head);
  box(0.07, 0.07, 0.02, 0x181818, -0.15, 0.06, -0.23, head);
  box(0.07, 0.07, 0.02, 0x181818, 0.15, 0.06, -0.23, head);
  const legs = [];
  for (const [x, z] of [[-0.22, -0.4], [0.22, -0.4], [-0.22, 0.4], [0.22, 0.4]]) legs.push(pivotLimb(0.22, 0.56, 0.22, brown, x, 0.56, z, g));
  return { g, head, legs, arms: [], body };
}

const SHEEP_COATS = [
  { hex: 0xf0f0f0, block: B.WOOL },
  { hex: 0xf0f0f0, block: B.WOOL },
  { hex: 0xf0f0f0, block: B.WOOL },
  { hex: 0x26262a, block: B.BLACK_WOOL },
  { hex: 0xc83830, block: B.RED_WOOL },
  { hex: 0xf0c830, block: B.YELLOW_WOOL },
];
function buildSheep() {
  const g = new THREE.Group();
  const coat = SHEEP_COATS[Math.floor(Math.random() * SHEEP_COATS.length)];
  const body = box(0.76, 0.68, 1.08, coat.hex, 0, 0.82, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.02, -0.62); g.add(head);
  box(0.46, 0.46, 0.48, 0xd8c4b0, 0, 0, 0, head);
  box(0.5, 0.22, 0.42, coat.hex, 0, 0.18, 0.04, head);
  box(0.07, 0.07, 0.02, 0x181818, -0.14, 0.02, -0.25, head);
  box(0.07, 0.07, 0.02, 0x181818, 0.14, 0.02, -0.25, head);
  const legs = [];
  for (const [x, z] of [[-0.2, -0.34], [0.2, -0.34], [-0.2, 0.34], [0.2, 0.34]]) {
    const p = pivotLimb(0.18, 0.5, 0.18, 0xd8c4b0, x, 0.5, z, g);
    box(0.24, 0.22, 0.24, coat.hex, 0, -0.12, 0, p);
    legs.push(p);
  }
  return { g, head, legs, arms: [], body, woolBlock: coat.block };
}

function buildChicken() {
  const g = new THREE.Group();
  const white = 0xf6f6f8;
  const body = box(0.38, 0.36, 0.5, white, 0, 0.44, 0, g);
  const head = new THREE.Group(); head.position.set(0, 0.68, -0.24); g.add(head);
  box(0.26, 0.32, 0.24, white, 0, 0, 0, head);
  box(0.14, 0.08, 0.14, 0xe8a828, 0, -0.02, -0.18, head);
  box(0.08, 0.1, 0.08, 0xd82828, 0, -0.11, -0.15, head);
  box(0.05, 0.05, 0.02, 0x111111, -0.09, 0.06, -0.13, head);
  box(0.05, 0.05, 0.02, 0x111111, 0.09, 0.06, -0.13, head);
  const wingL = pivotLimb(0.06, 0.26, 0.38, 0xeaeaee, -0.22, 0.58, 0, g);
  const wingR = pivotLimb(0.06, 0.26, 0.38, 0xeaeaee, 0.22, 0.58, 0, g);
  const legs = [
    pivotLimb(0.06, 0.26, 0.06, 0xe8b828, -0.09, 0.26, 0, g),
    pivotLimb(0.06, 0.26, 0.06, 0xe8b828, 0.09, 0.26, 0, g),
  ];
  return { g, head, legs, arms: [], wings: [wingL, wingR], body };
}

function buildZombie() {
  const g = new THREE.Group();
  const skin = 0x4f8a3c, shirt = 0x2f8f9a, pants = 0x3c3f8a;
  const body = box(0.5, 0.75, 0.26, shirt, 0, 1.12, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.5, 0); g.add(head);
  box(0.5, 0.5, 0.5, skin, 0, 0.25, 0, head);
  box(0.1, 0.06, 0.02, 0x101010, -0.12, 0.28, -0.26, head); box(0.1, 0.06, 0.02, 0x101010, 0.12, 0.28, -0.26, head);
  box(0.2, 0.05, 0.02, 0x2a4a20, 0, 0.12, -0.26, head);
  const legs = [pivotLimb(0.24, 0.75, 0.24, pants, -0.13, 0.75, 0, g), pivotLimb(0.24, 0.75, 0.24, pants, 0.13, 0.75, 0, g)];
  const arms = [pivotLimb(0.22, 0.72, 0.22, skin, -0.37, 1.45, 0, g), pivotLimb(0.22, 0.72, 0.22, skin, 0.37, 1.45, 0, g)];
  arms.forEach(a => (a.rotation.x = -Math.PI / 2));
  return { g, head, legs, arms, body };
}

function buildSkeleton() {
  const g = new THREE.Group();
  const bone = 0xdad6ca, dark = 0x8a867c;
  const body = box(0.42, 0.72, 0.2, bone, 0, 1.12, 0, g);
  for (let r = 0; r < 3; r++) box(0.44, 0.06, 0.22, dark, 0, 0.94 + r * 0.16, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.48, 0); g.add(head);
  box(0.48, 0.48, 0.48, bone, 0, 0.24, 0, head);
  box(0.12, 0.1, 0.03, 0x181818, -0.12, 0.26, -0.25, head);
  box(0.12, 0.1, 0.03, 0x181818, 0.12, 0.26, -0.25, head);
  box(0.22, 0.06, 0.03, 0x222222, 0, 0.1, -0.25, head);
  const legs = [pivotLimb(0.13, 0.76, 0.13, bone, -0.13, 0.76, 0, g), pivotLimb(0.13, 0.76, 0.13, bone, 0.13, 0.76, 0, g)];
  const arms = [pivotLimb(0.12, 0.72, 0.12, bone, -0.3, 1.44, 0, g), pivotLimb(0.12, 0.72, 0.12, bone, 0.3, 1.44, 0, g)];
  // Held bow on right arm (-X in local facing -Z)
  box(0.06, 0.52, 0.14, 0x8a5e32, 0, -0.62, -0.14, arms[0]);
  arms[0].rotation.x = -1.35;
  arms[1].rotation.x = -1.1;
  return { g, head, legs, arms, body };
}

function buildCreeper() {
  const g = new THREE.Group();
  const green = 0x48a83e, darkG = 0x2f7c28;
  const body = box(0.48, 0.88, 0.28, green, 0, 0.84, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.28, 0); g.add(head);
  box(0.5, 0.5, 0.5, green, 0, 0.25, 0, head);
  // Iconic creeper face
  box(0.1, 0.1, 0.03, 0x111111, -0.12, 0.32, -0.26, head);
  box(0.1, 0.1, 0.03, 0x111111, 0.12, 0.32, -0.26, head);
  box(0.12, 0.12, 0.03, 0x111111, 0, 0.2, -0.26, head);
  box(0.07, 0.14, 0.03, 0x111111, -0.1, 0.12, -0.26, head);
  box(0.07, 0.14, 0.03, 0x111111, 0.1, 0.12, -0.26, head);
  const legs = [];
  for (const [x, z] of [[-0.16, -0.22], [0.16, -0.22], [-0.16, 0.22], [0.16, 0.22]]) {
    legs.push(pivotLimb(0.22, 0.4, 0.22, darkG, x, 0.4, z, g));
  }
  return { g, head, legs, arms: [], body };
}

function buildSpider() {
  const g = new THREE.Group();
  const dark = 0x241e1c, abd = 0x302624;
  const body = box(0.42, 0.34, 0.42, dark, 0, 0.42, -0.05, g);
  box(0.62, 0.48, 0.72, abd, 0, 0.48, 0.48, g);
  const head = new THREE.Group(); head.position.set(0, 0.44, -0.38); g.add(head);
  box(0.44, 0.38, 0.38, dark, 0, 0, 0, head);
  for (const [x, y] of [[-0.13, 0.06], [0.13, 0.06], [-0.06, -0.03], [0.06, -0.03]]) {
    box(0.07, 0.06, 0.03, 0xe81c1c, x, y, -0.2, head, 0x900808);
  }
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const z = -0.22 + i * 0.18;
    const lL = pivotLimb(0.65, 0.1, 0.1, dark, -0.22, 0.42, z, g);
    lL.rotation.z = 0.55;
    const lR = pivotLimb(0.65, 0.1, 0.1, dark, 0.22, 0.42, z, g);
    lR.rotation.z = -0.55;
    legs.push(lL, lR);
  }
  return { g, head, legs, arms: [], body, spiderLegs: true };
}

function buildEnderman() {
  const g = new THREE.Group();
  const blk = 0x121016;
  const body = box(0.42, 0.85, 0.22, blk, 0, 1.85, 0, g);
  const head = new THREE.Group(); head.position.set(0, 2.28, 0); g.add(head);
  box(0.46, 0.46, 0.46, blk, 0, 0.23, 0, head);
  box(0.13, 0.05, 0.03, 0xe850ff, -0.12, 0.22, -0.24, head, 0xa020d0);
  box(0.13, 0.05, 0.03, 0xe850ff, 0.12, 0.22, -0.24, head, 0xa020d0);
  const legs = [pivotLimb(0.12, 1.42, 0.12, blk, -0.11, 1.42, 0, g), pivotLimb(0.12, 1.42, 0.12, blk, 0.11, 1.42, 0, g)];
  const arms = [pivotLimb(0.11, 1.4, 0.11, blk, -0.28, 2.24, 0, g), pivotLimb(0.11, 1.4, 0.11, blk, 0.28, 2.24, 0, g)];
  return { g, head, legs, arms, body };
}

function buildPiglin() {
  const g = new THREE.Group();
  const pink = 0xd88c84, zom = 0x628e48, cloth = 0x6b4628;
  const body = box(0.5, 0.74, 0.26, pink, 0, 1.12, 0, g);
  box(0.52, 0.24, 0.28, cloth, 0, 0.82, 0, g);
  const head = new THREE.Group(); head.position.set(0, 1.5, 0); g.add(head);
  box(0.52, 0.5, 0.5, pink, 0, 0.25, 0, head);
  box(0.26, 0.51, 0.51, zom, 0.13, 0.25, 0, head);
  box(0.24, 0.18, 0.08, 0xc87068, 0, 0.16, -0.27, head);
  box(0.08, 0.24, 0.18, pink, -0.3, 0.24, 0, head);
  box(0.08, 0.07, 0.03, 0x181818, -0.14, 0.28, -0.26, head);
  box(0.08, 0.07, 0.03, 0xf8f8f8, 0.14, 0.28, -0.26, head);
  const legs = [pivotLimb(0.23, 0.75, 0.23, pink, -0.13, 0.75, 0, g), pivotLimb(0.23, 0.75, 0.23, zom, 0.13, 0.75, 0, g)];
  const arms = [pivotLimb(0.21, 0.72, 0.21, pink, -0.36, 1.44, 0, g), pivotLimb(0.21, 0.72, 0.21, zom, 0.36, 1.44, 0, g)];
  // Golden sword in right hand
  box(0.08, 0.1, 0.58, 0xf8d248, 0, -0.68, -0.22, arms[0], 0x403005);
  arms[0].rotation.x = -0.65;
  return { g, head, legs, arms, body };
}

function buildGhast() {
  const g = new THREE.Group();
  const white = 0xf0f0f4, grey = 0xc8c8d0;
  const body = box(2.4, 2.4, 2.4, white, 0, 2.2, 0, g);
  const head = new THREE.Group(); head.position.set(0, 2.2, 0); g.add(head);
  const eyeL = box(0.45, 0.16, 0.06, 0x302028, -0.55, 0.25, -1.22, head);
  const eyeR = box(0.45, 0.16, 0.06, 0x302028, 0.55, 0.25, -1.22, head);
  box(0.14, 0.5, 0.05, grey, -0.55, -0.12, -1.21, head);
  box(0.14, 0.5, 0.05, grey, 0.55, -0.12, -1.21, head);
  const mouth = box(0.5, 0.22, 0.06, 0x281820, 0, -0.45, -1.22, head);
  const legs = [];
  for (let tz = -1; tz <= 1; tz++) for (let tx = -1; tx <= 1; tx++) {
    legs.push(pivotLimb(0.24, 1.15 + ((tx + tz) & 1) * 0.35, 0.24, grey, tx * 0.75, 1.0, tz * 0.75, g));
  }
  return { g, head, legs, arms: [], body, eyes: [eyeL, eyeR, mouth] };
}

function buildBlaze() {
  const g = new THREE.Group();
  const head = new THREE.Group(); head.position.set(0, 1.45, 0); g.add(head);
  box(0.5, 0.5, 0.5, 0xf8b020, 0, 0, 0, head, 0x603800);
  box(0.12, 0.08, 0.04, 0xfff8b0, -0.12, 0.05, -0.26, head, 0x806010);
  box(0.12, 0.08, 0.04, 0xfff8b0, 0.12, 0.05, -0.26, head, 0x806010);
  const ring1 = new THREE.Group(); ring1.position.set(0, 1.15, 0); g.add(ring1);
  const ring2 = new THREE.Group(); ring2.position.set(0, 0.65, 0); g.add(ring2);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    box(0.12, 0.62, 0.12, 0xffd038, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, ring1, 0x704800);
    box(0.12, 0.55, 0.12, 0xf89818, Math.cos(a + 0.78) * 0.38, 0, Math.sin(a + 0.78) * 0.38, ring2, 0x603000);
  }
  return { g, head, legs: [], arms: [], body: head, rings: [ring1, ring2] };
}

function buildDragon() {
  const g = new THREE.Group();
  const blk = 0x16141c, grey = 0x3a3644, wingMem = 0x262030;
  const body = box(1.8, 1.5, 3.6, blk, 0, 1.2, 0, g);
  for (let i = -1; i <= 1; i++) box(0.24, 0.45, 0.5, grey, 0, 2.1, i * 1.0, g);
  const head = new THREE.Group(); head.position.set(0, 1.5, -2.5); g.add(head);
  box(1.1, 0.95, 1.2, blk, 0, 0, -0.3, head);
  box(0.75, 0.5, 1.0, blk, 0, -0.18, -1.2, head);
  box(0.18, 0.42, 0.5, grey, -0.32, 0.55, 0, head);
  box(0.18, 0.42, 0.5, grey, 0.32, 0.55, 0, head);
  box(0.2, 0.14, 0.06, 0xe850ff, -0.36, 0.12, -0.92, head, 0xb030e0);
  box(0.2, 0.14, 0.06, 0xe850ff, 0.36, 0.12, -0.92, head, 0xb030e0);
  // Tail
  const tail = new THREE.Group(); tail.position.set(0, 1.2, 1.8); g.add(tail);
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.18;
    box(0.9 * s, 0.8 * s, 1.1, blk, 0, 0, 0.55 + i * 1.05, tail);
    box(0.18, 0.32, 0.4, grey, 0, 0.5 * s, 0.55 + i * 1.05, tail);
  }
  // Articulated Wings
  const wingL = new THREE.Group(); wingL.position.set(-0.9, 1.75, -0.4); g.add(wingL);
  box(4.2, 0.18, 0.24, grey, -2.1, 0, -0.9, wingL);
  box(4.0, 0.06, 2.4, wingMem, -2.0, -0.04, 0.3, wingL);
  const wingR = new THREE.Group(); wingR.position.set(0.9, 1.75, -0.4); g.add(wingR);
  box(4.2, 0.18, 0.24, grey, 2.1, 0, -0.9, wingR);
  box(4.0, 0.06, 2.4, wingMem, 2.0, -0.04, 0.3, wingR);
  return { g, head, legs: [], arms: [], body, wings: [wingL, wingR], tail };
}

export const MOB_TYPES = {
  pig:      { name: 'ブタ', hp: 10, speed: 1.35, hw: 0.42, h: 0.9, build: buildPig, passive: true },
  cow:      { name: 'ウシ', hp: 10, speed: 1.25, hw: 0.45, h: 1.35, build: buildCow, passive: true },
  sheep:    { name: 'ヒツジ', hp: 8, speed: 1.3, hw: 0.44, h: 1.25, build: buildSheep, passive: true },
  chicken:  { name: 'ニワトリ', hp: 4, speed: 1.5, hw: 0.25, h: 0.72, build: buildChicken, passive: true },
  zombie:   { name: 'ゾンビ', hp: 20, speed: 2.45, hw: 0.3, h: 1.95, build: buildZombie, hostile: true, dmg: 3, sunBurn: true },
  skeleton: { name: 'スケルトン', hp: 20, speed: 2.35, hw: 0.3, h: 1.95, build: buildSkeleton, hostile: true, dmg: 2, sunBurn: true },
  creeper:  { name: 'クリーパー', hp: 20, speed: 2.3, hw: 0.3, h: 1.75, build: buildCreeper, hostile: true },
  spider:   { name: 'クモ', hp: 16, speed: 3.1, hw: 0.55, h: 0.85, build: buildSpider, hostile: true, dmg: 2 },
  enderman: { name: 'エンダーマン', hp: 40, speed: 3.4, hw: 0.32, h: 2.85, build: buildEnderman, neutral: true, dmg: 6 },
  piglin:   { name: 'ゾンビピグリン', hp: 20, speed: 2.6, hw: 0.3, h: 1.95, build: buildPiglin, neutral: true, dmg: 5, fireImmune: true },
  ghast:    { name: 'ガスト', hp: 10, speed: 3.2, hw: 1.25, h: 2.6, build: buildGhast, hostile: true, flying: true, fireImmune: true },
  blaze:    { name: 'ブレイズ', hp: 20, speed: 2.7, hw: 0.35, h: 1.8, build: buildBlaze, hostile: true, flying: true, fireImmune: true },
  dragon:   { name: 'エンダードラゴン', hp: 200, speed: 11, hw: 2.2, h: 3.2, build: buildDragon, hostile: true, flying: true, boss: true, dmg: 8, fireImmune: true },
};

export class Mobs {
  constructor(scene) { this.scene = scene; this.list = []; this.spawnTimer = 0.4; }

  spawn(type, x, y, z) {
    const T = MOB_TYPES[type];
    if (!T) return null;
    const model = T.build();
    this.scene.add(model.g);
    const m = {
      type, T, model,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * 6.28,
      hp: T.hp,
      onGround: false,
      ai: 0,
      wish: new THREE.Vector2(),
      targetY: y,
      walk: 0,
      hurt: 0,
      attackCd: 1 + Math.random(),
      dead: 0,
      sayTimer: 2 + Math.random() * 8,
      burn: 0,
      angry: 0,
      fuse: 0,
      perchTimer: 18,
      perching: 0,
      orbitAngle: Math.random() * 6.28,
      wingPhase: 0,
    };
    model.g.position.set(x, y, z);
    this.list.push(m);
    return m;
  }

  raycast(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.list) {
      if (m.dead) continue;
      const pad = m.type === 'dragon' ? 0.6 : 0.08;
      const min = [m.pos.x - m.T.hw - pad, m.pos.y - pad, m.pos.z - m.T.hw - pad];
      const max = [m.pos.x + m.T.hw + pad, m.pos.y + m.T.h + pad, m.pos.z + m.T.hw + pad];
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

  teleportMob(m, world, sfx) {
    for (let tries = 0; tries < 14; tries++) {
      const nx = Math.floor(m.pos.x + (Math.random() - 0.5) * 28);
      const nz = Math.floor(m.pos.z + (Math.random() - 0.5) * 28);
      if (!world.isLoaded(nx, nz)) continue;
      const y = world.topSolid(nx, nz);
      if (y > 2 && world.getBlock(nx, y, nz) !== B.WATER && world.getBlock(nx, y, nz) !== B.LAVA) {
        m.pos.set(nx + 0.5, y + 1.01, nz + 0.5);
        m.vel.set(0, 0, 0);
        sfx.teleport();
        return true;
      }
    }
    return false;
  }

  hit(m, dmg, dir, drops, sfx, byPlayer = true) {
    if (m.dead || m.hurt > 0.25) return false;
    m.hp -= dmg;
    m.hurt = 0.42;
    const kb = m.T.boss ? 0.8 : (m.T.flying ? 3 : 6);
    m.vel.x += dir.x * kb; m.vel.z += dir.z * kb;
    if (!m.T.flying && !m.T.boss) m.vel.y = 4.6;
    sfx.mobHurt(m.type);

    if (m.T.passive) { m.ai = 3; m.panic = 4.5; }
    if (byPlayer && m.T.neutral) {
      m.angry = 25;
      if (m.type === 'piglin') {
        for (const o of this.list) if (o.type === 'piglin' && o.pos.distanceTo(m.pos) < 24) o.angry = 25;
      }
    }

    if (m.hp <= 0) {
      m.dead = 1;
      this.spawnDrops(m, drops);
      return true;
    }
    return false;
  }

  spawnDrops(m, drops) {
    const p = m.pos.clone().add(new THREE.Vector3(0, 0.5, 0));
    const cooked = m.burn > 0;
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    switch (m.type) {
      case 'pig': drops.spawn(cooked ? I.COOKED_PORK : I.RAW_PORK, rnd(1, 3), p); break;
      case 'cow':
        drops.spawn(cooked ? I.STEAK : I.RAW_BEEF, rnd(1, 3), p);
        drops.spawn(I.LEATHER, rnd(0, 2), p);
        break;
      case 'sheep':
        drops.spawn(m.model.woolBlock || B.WOOL, rnd(1, 2), p);
        drops.spawn(cooked ? I.COOKED_MUTTON : I.RAW_MUTTON, rnd(1, 2), p);
        break;
      case 'chicken':
        drops.spawn(I.FEATHER, rnd(1, 2), p);
        drops.spawn(cooked ? I.COOKED_CHICKEN : I.RAW_CHICKEN, 1, p);
        break;
      case 'zombie': drops.spawn(I.ROTTEN_FLESH, rnd(0, 2), p); break;
      case 'skeleton':
        drops.spawn(I.BONE, rnd(1, 2), p);
        drops.spawn(I.ARROW, rnd(0, 2), p);
        break;
      case 'creeper': drops.spawn(I.GUNPOWDER, rnd(1, 3), p); break;
      case 'spider': drops.spawn(I.STRING, rnd(1, 2), p); break;
      case 'enderman': drops.spawn(I.ENDER_PEARL, rnd(1, 2), p); break;
      case 'piglin':
        drops.spawn(I.ROTTEN_FLESH, rnd(0, 1), p);
        if (Math.random() < 0.5) drops.spawn(I.GOLD_INGOT, 1, p);
        break;
      case 'ghast': drops.spawn(I.GUNPOWDER, rnd(1, 3), p); break;
      case 'blaze': drops.spawn(I.BLAZE_ROD, rnd(1, 2), p); break;
      default: break;
    }
  }

  update(dt, world, player, sky, drops, projs, events, sfx, opts = {}) {
    const dim = world.dim || 'overworld';
    const day = sky.day;
    const survival = player.mode === 'survival' && !player.dead;

    // Spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.list.length < 10 ? 0.35 : 0.9;
      this.trySpawn(world, player, dim, day);
    }

    const eye = player.eye();
    const look = player.lookDir();

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const dxp = player.pos.x - m.pos.x, dzp = player.pos.z - m.pos.z;
      const distP = Math.hypot(dxp, dzp);
      if ((!m.T.boss && distP > 115) || m.dead > 1) {
        if (m.T.boss && m.dead > 1 && opts.onDragonKilled) opts.onDragonKilled(m.pos.clone());
        this.scene.remove(m.model.g);
        this.list.splice(i, 1);
        continue;
      }
      if (m.dead) {
        m.dead += dt * (m.T.boss ? 0.45 : 1);
        m.model.g.rotation.z = Math.min(Math.PI / 2, m.dead * 5);
        this.tint(m, 1);
        if (m.dead > 1) m.dead = 2;
        continue;
      }
      if (!m.T.boss && !world.isLoaded(m.pos.x, m.pos.z)) continue;

      m.ai -= dt; m.hurt -= dt; m.attackCd -= dt; m.sayTimer -= dt;
      if (m.angry > 0) m.angry -= dt;
      if (m.sayTimer < 0) {
        m.sayTimer = (m.T.boss ? 5 : 6) + Math.random() * 10;
        if (distP < (m.T.boss ? 90 : 22)) sfx.mobSay(m.type);
      }

      // ---- Ender Dragon Boss AI ----
      if (m.type === 'dragon') {
        this.updateDragon(m, dt, player, projs, events, sfx);
        continue;
      }

      // ---- Flying Nether Mobs (Ghast & Blaze) ----
      if (m.T.flying) {
        this.updateFlyingMob(m, dt, world, player, projs, sfx, survival, dxp, dzp, distP);
        continue;
      }

      // Enderman gaze aggro & water allergy
      if (m.type === 'enderman') {
        if (world.getBlock(m.pos.x, m.pos.y + 0.2, m.pos.z) === B.WATER) {
          this.hit(m, 1, new THREE.Vector3(), drops, sfx, false);
          this.teleportMob(m, world, sfx);
        } else if (survival && m.angry <= 0 && distP < 28) {
          const toHead = m.pos.clone().add(new THREE.Vector3(0, 2.4, 0)).sub(eye).normalize();
          if (look.dot(toHead) > 0.985) { m.angry = 25; sfx.mobSay('enderman'); }
        }
        if (m.angry > 0 && m.hurt > 0.32 && Math.random() < 0.35) this.teleportMob(m, world, sfx);
      }

      const spiderAggro = m.type === 'spider' ? (day < 0.45 || m.angry > 0) : true;
      const wantsAttack = ((m.T.hostile && spiderAggro) || m.angry > 0) && (survival || m.angry > 0) && !player.dead && distP < 34 && Math.abs(player.pos.y - m.pos.y) < 14;

      let speed = m.T.speed;
      if (wantsAttack) {
        if (m.type === 'skeleton') {
          // Strafe & shoot arrows
          if (distP > 11) m.wish.set(dxp, dzp).normalize();
          else if (distP < 6) m.wish.set(-dxp, -dzp).normalize();
          else m.wish.set(-dzp, dxp).normalize().multiplyScalar(0.6);
          m.yaw = Math.atan2(-dxp, -dzp);
          if (distP < 20 && m.attackCd <= 0) {
            m.attackCd = 2.1;
            const orig = m.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
            const aim = player.pos.clone().add(new THREE.Vector3(0, 1.2 + distP * 0.09, 0)).sub(orig).normalize().multiplyScalar(21);
            projs.spawnArrow(orig, aim, false, 4);
            sfx.bow();
          }
        } else if (m.type === 'creeper') {
          if (distP < 3.1) {
            if (m.fuse === 0) sfx.fuse();
            m.fuse += dt;
            m.wish.set(0, 0);
            if (m.fuse >= 1.5) {
              m.dead = 2;
              if (opts.onExplode) opts.onExplode(m.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 3.2, 'creeper');
              continue;
            }
          } else {
            if (distP > 6) m.fuse = 0;
            else m.fuse = Math.max(0, m.fuse - dt);
            m.wish.set(dxp, dzp).normalize();
          }
        } else {
          m.wish.set(dxp, dzp).normalize();
          if (m.type === 'enderman') speed *= 1.35;
          if (m.type === 'spider' && distP > 2.2 && distP < 5.5 && m.onGround && m.attackCd <= 0) {
            m.vel.x += m.wish.x * 6.5; m.vel.z += m.wish.y * 6.5; m.vel.y = 5.5;
            m.attackCd = 1.2;
          }
          if (distP < (m.T.hw + 0.95) && Math.abs(player.pos.y - m.pos.y) < 2.0 && m.attackCd <= 0) {
            m.attackCd = 1.0;
            player.damage(m.T.dmg || 3, events, m.type);
            player.vel.x += (dxp / (distP || 1)) * 5;
            player.vel.z += (dzp / (distP || 1)) * 5;
            player.vel.y = 3.8;
          }
        }
      } else {
        m.fuse = Math.max(0, m.fuse - dt * 2);
        if (m.panic > 0) {
          m.panic -= dt; speed *= 2.0;
          if (m.ai <= 0) { m.ai = 0.7; const a = Math.random() * 6.28; m.wish.set(Math.cos(a), Math.sin(a)); }
        } else if (m.ai <= 0) {
          m.ai = 2 + Math.random() * 4.5;
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
      if (inW) { m.vel.y += 14 * dt; m.vel.y = Math.min(m.vel.y, 2.6); }
      const inLava = world.getBlock(m.pos.x, m.pos.y + 0.3, m.pos.z) === B.LAVA;
      if (inLava && !m.T.fireImmune) {
        m.burn = 3;
        m.hp -= dt * 6;
        if (m.hp <= 0) { m.dead = 1; this.spawnDrops(m, drops); continue; }
      }
      m.vel.y -= (m.type === 'chicken' ? 12 : 28) * dt;
      if (m.type === 'chicken' && m.vel.y < -2.4) m.vel.y = -2.4;

      const r = moveAABB(world, m.pos, m.vel, dt, m.T.hw, m.T.h);
      m.onGround = r.onGround;
      if (r.hitX || r.hitZ) {
        if (m.type === 'spider' && m.wish.lengthSq() > 0) m.vel.y = 4.2;
        else if (m.onGround && m.wish.lengthSq() > 0) m.vel.y = 8.2;
      }
      if (m.pos.y < -15) m.dead = 2;

      // Sunlight burns undead in Overworld
      if (m.T.sunBurn && dim === 'overworld' && day > 0.6 && !inW) {
        const skyClear = world.topSolid(m.pos.x, m.pos.z) <= Math.floor(m.pos.y);
        if (skyClear) {
          m.burn += dt;
          if (m.burn > 1) {
            m.burn = 0.01; m.hp -= 2; m.hurt = 0.25;
            if (m.hp <= 0) { m.dead = 1; this.spawnDrops(m, drops); continue; }
          }
        }
      }

      // Animation
      if (m.wish.lengthSq() > 0.01 && m.type !== 'skeleton') {
        const target = Math.atan2(-m.wish.x, -m.wish.y);
        let d = target - m.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
        m.yaw += d * Math.min(1, dt * 7);
      }
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.walk += hs * dt * 3.5;
      const sw = Math.sin(m.walk) * Math.min(1, hs / 1.4) * 0.7;
      if (m.model.spiderLegs) {
        m.model.legs.forEach((l, j) => { l.rotation.y = (j % 2 === 0 ? 1 : -1) * Math.sin(m.walk * 1.5 + j) * 0.35; });
      } else {
        m.model.legs.forEach((l, j) => { l.rotation.x = (j % 2 === (j < 2 ? 0 : 1) ? sw : -sw); });
      }
      if (m.model.wings) {
        const flap = !m.onGround ? Math.sin(performance.now() * 0.025) * 0.7 : 0;
        m.model.wings[0].rotation.z = flap; m.model.wings[1].rotation.z = -flap;
      }
      if (m.model.arms.length && m.type !== 'skeleton') {
        const base = m.type === 'zombie' ? -Math.PI / 2 : (m.type === 'piglin' ? -0.5 : 0);
        m.model.arms[0].rotation.x = base + sw * 0.4;
        if (m.model.arms[1]) m.model.arms[1].rotation.x = base - sw * 0.4;
      }

      const creeperFlash = m.fuse > 0 && Math.floor(m.fuse * 10) % 2 === 0;
      const swell = m.fuse > 0 ? 1 + (m.fuse / 1.5) * 0.28 : 1;
      m.model.g.scale.set(swell, swell, swell);
      m.model.g.position.copy(m.pos);
      m.model.g.rotation.y = m.yaw;
      this.tint(m, m.hurt > 0 ? 1 : (creeperFlash ? 2 : 0));
    }
  }

  updateFlyingMob(m, dt, world, player, projs, sfx, survival, dxp, dzp, distP) {
    if (m.model.rings) {
      m.model.rings[0].rotation.y += dt * 3.2;
      m.model.rings[1].rotation.y -= dt * 2.1;
    }
    if (m.type === 'ghast') {
      const t = performance.now() * 0.003;
      m.model.legs.forEach((l, j) => { l.rotation.x = 0.2 + Math.sin(t + j) * 0.25; });
    }
    if (m.ai <= 0) {
      m.ai = 2 + Math.random() * 3;
      const a = Math.random() * 6.28;
      m.wish.set(Math.cos(a), Math.sin(a));
      m.targetY = Math.max(38, Math.min(92, player.pos.y + (m.type === 'ghast' ? 8 + Math.random() * 12 : 2 + Math.random() * 6)));
    }
    if (survival && distP < 48) {
      m.yaw = Math.atan2(-dxp, -dzp);
      if (m.type === 'blaze' && distP > 10) m.wish.set(dxp, dzp).normalize();
      if (m.attackCd <= 0) {
        if (m.type === 'ghast') {
          m.attackCd = 3.2;
          const orig = m.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          const aim = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(orig).normalize().multiplyScalar(15);
          projs.spawnFireball(orig, aim, true);
          sfx.mobSay('ghast');
        } else if (m.type === 'blaze' && distP < 26) {
          m.attackCd = 3.0;
          for (let b = 0; b < 3; b++) {
            setTimeout(() => {
              if (m.dead) return;
              const orig = m.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
              const aim = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 1.0, (Math.random() - 0.5) * 0.9)).sub(orig).normalize().multiplyScalar(16);
              projs.spawnFireball(orig, aim, false);
            }, b * 240);
          }
          sfx.mobSay('blaze');
        }
      }
    }
    m.vel.x += (m.wish.x * m.T.speed - m.vel.x) * dt * 2;
    m.vel.z += (m.wish.y * m.T.speed - m.vel.z) * dt * 2;
    m.vel.y += ((m.targetY - m.pos.y) * 1.4 - m.vel.y) * dt * 2;
    moveAABB(world, m.pos, m.vel, dt, m.T.hw, m.T.h, { stepHeight: 0 });
    m.model.g.position.copy(m.pos);
    m.model.g.rotation.y = m.yaw;
    this.tint(m, m.hurt > 0 ? 1 : 0);
  }

  updateDragon(m, dt, player, projs, events, sfx) {
    m.perchTimer -= dt;
    if (m.perchTimer <= 0 && m.perching <= 0) {
      m.perching = 7.5;
      m.perchTimer = 20;
    }
    let goal;
    if (m.perching > 0) {
      m.perching -= dt;
      goal = new THREE.Vector3(0, 64.5, 0);
    } else {
      m.orbitAngle += dt * 0.42;
      const r = 34 + Math.sin(m.orbitAngle * 2) * 8;
      goal = new THREE.Vector3(Math.cos(m.orbitAngle) * r, 76 + Math.sin(m.orbitAngle * 1.7) * 9, Math.sin(m.orbitAngle) * r);
      // Periodically swoop toward player if survival
      if (player.mode === 'survival' && !player.dead && Math.sin(m.orbitAngle * 1.3) > 0.72) {
        goal.copy(player.pos).add(new THREE.Vector3(0, 2.5, 0));
      }
    }
    const toGoal = goal.clone().sub(m.pos);
    const d = toGoal.length();
    const spd = m.perching > 0 && d < 3 ? d * 2 : m.T.speed;
    if (d > 0.2) toGoal.normalize().multiplyScalar(spd);
    m.vel.lerp(toGoal, Math.min(1, dt * 2.6));
    m.pos.addScaledVector(m.vel, dt);

    if (m.vel.lengthSq() > 0.2) m.yaw = Math.atan2(-m.vel.x, -m.vel.z);
    else m.yaw = Math.atan2(-(player.pos.x - m.pos.x), -(player.pos.z - m.pos.z));

    // Melee sweep / dragon breath
    const dp = player.pos.distanceTo(m.pos);
    if (!player.dead && player.mode === 'survival') {
      if (dp < 4.2 && m.attackCd <= 0) {
        m.attackCd = 1.1;
        player.damage(8, events, 'dragon');
        const push = player.pos.clone().sub(m.pos).setY(0.4).normalize().multiplyScalar(10);
        player.vel.add(push);
      } else if (dp > 10 && dp < 45 && m.attackCd <= 0 && m.perching <= 0) {
        m.attackCd = 4.5;
        const orig = m.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const aim = player.pos.clone().add(new THREE.Vector3(0, 1, 0)).sub(orig).normalize().multiplyScalar(17);
        projs.spawnFireball(orig, aim, true);
      }
    }

    // Flap wings & sway tail
    const prevFlap = Math.sin(m.wingPhase);
    m.wingPhase += dt * (m.perching > 0 && d < 2 ? 7.5 : 4.8);
    const flap = Math.sin(m.wingPhase);
    if (prevFlap < 0 && flap >= 0 && dp < 70) sfx.wing();
    m.model.wings[0].rotation.z = flap * 0.55;
    m.model.wings[1].rotation.z = -flap * 0.55;
    m.model.tail.rotation.y = Math.sin(m.wingPhase * 0.7) * 0.22;
    m.model.g.position.copy(m.pos);
    m.model.g.rotation.y = m.yaw;
    m.model.g.rotation.x = THREE.MathUtils.clamp(m.vel.y * 0.04, -0.45, 0.45);
    this.tint(m, m.hurt > 0 ? 1 : 0);
  }

  trySpawn(world, player, dim, day) {
    const sampleGround = (rMin = 15, rMax = 44) => {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
      if (!world.isLoaded(x, z)) return null;
      const y = world.topSolid(x, z);
      if (y < 1 || y > CH - 6) return null;
      return { x: x + 0.5, y: y + 1, z: z + 0.5, bx: x, bz: z, ground: world.getBlock(x, y, z), above: world.getBlock(x, y + 1, z) };
    };

    if (dim === 'end') {
      let endermen = 0;
      for (const m of this.list) if (m.type === 'enderman') endermen++;
      if (endermen < 14) {
        const p = sampleGround(14, 42);
        if (p && p.ground === B.END_STONE && p.above === 0) {
          this.spawn('enderman', p.x, p.y, p.z);
        }
      }
      return;
    }

    if (dim === 'nether') {
      if (this.list.length >= 16) return;
      const p = sampleGround(14, 44);
      if (!p) return;
      const fort = isFortressChunk(world.seed, Math.floor(p.bx / CS), Math.floor(p.bz / CS));
      if (fort && Math.random() < 0.65) {
        this.spawn('blaze', p.x, p.y + 0.5, p.z);
      } else if (Math.random() < 0.25) {
        this.spawn('ghast', p.x, Math.min(90, p.y + 10), p.z);
      } else if (p.above === 0) {
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.spawn('piglin', p.x + i * 0.5, p.y, p.z);
      }
      return;
    }

    // Overworld
    let passives = 0, hostiles = 0;
    for (const m of this.list) { if (m.T.passive) passives++; else hostiles++; }
    if (passives < 18) {
      const p = sampleGround(14, 42);
      if (p && (p.ground === B.GRASS || p.ground === B.SNOW_GRASS) && (p.above === 0 || p.above === B.TALL_GRASS || p.above === B.FERN)) {
        const kinds = ['pig', 'cow', 'sheep', 'chicken'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.spawn(kind, p.x + (i % 2) * 0.8, p.y, p.z + (i >> 1) * 0.8);
      }
    }
    if (day < 0.32 && hostiles < 16) {
      const p = sampleGround(18, 46);
      if (p && p.above === 0 && SOLID[p.ground] && p.ground !== B.LEAVES && p.ground !== B.WATER) {
        const r = Math.random();
        const kind = r < 0.30 ? 'zombie' : r < 0.56 ? 'skeleton' : r < 0.78 ? 'creeper' : r < 0.93 ? 'spider' : 'enderman';
        this.spawn(kind, p.x, p.y, p.z);
      }
    }
  }

  tint(m, k) {
    if (m._tint === k) return;
    m._tint = k;
    m.model.g.traverse(o => {
      if (!o.material || !o.material.emissive) return;
      if (k === 1) o.material.emissive.setRGB(0.65, 0.05, 0.05);
      else if (k === 2) o.material.emissive.setRGB(0.75, 0.75, 0.75);
      else o.material.emissive.setRGB(0, 0, 0);
    });
  }

  getBoss() {
    return this.list.find(m => m.T.boss && !m.dead) || null;
  }

  clear() {
    for (const m of this.list) this.scene.remove(m.model.g);
    this.list = [];
  }

  serialize() {
    return this.list.filter(m => !m.dead && m.T.passive).slice(0, 24).map(m => [m.type, m.pos.x, m.pos.y, m.pos.z]);
  }
}
