import * as THREE from 'three';
import { moveAABB, collides } from './physics.js';
import { B } from '../world/blocks.js';

export const PW = 0.3, PH = 1.8;

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.flying = false; this.inWater = false; this.headInWater = false; this.inLava = false;
    this.sprinting = false; this.sprintLatch = false; this.sneaking = false;
    this.mode = 'survival';
    this.health = 20; this.hunger = 20; this.saturation = 5; this.exhaustion = 0; this.air = 10;
    this.fallStart = null; this.regenTimer = 0; this.starveTimer = 0; this.airTimer = 0; this.lavaTimer = 0;
    this.regenBoost = 0; this.regenBoostTick = 0;
    this.burnTime = 0; this.burnTick = 0;
    this.portalTime = 0; this.portalCooldown = 0;
    this.hurtTime = 0; this.dead = false;
    this.walkDist = 0; this.stepAcc = 0; this.bob = 0;
    this.spawn = new THREE.Vector3();
    this.spawnDim = 'overworld';
    this.onArmorDamage = null; // (rawDmg, cause) => reducedDmg
  }

  get eyeHeight() { return this.sneaking ? 1.32 : 1.62; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z); }
  lookDir(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  toggleFly() { if (this.mode === 'creative') { this.flying = !this.flying; this.vel.y = 0; } }

  update(dt, input, world, events) {
    if (this.dead) return;
    const creative = this.mode === 'creative';
    if (!creative) this.flying = false;
    const feet = world.getBlock(this.pos.x, this.pos.y + 0.2, this.pos.z);
    const mid = world.getBlock(this.pos.x, this.pos.y + 0.9, this.pos.z);
    const below = world.getBlock(this.pos.x, this.pos.y - 0.15, this.pos.z);
    const head = world.getBlock(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    const wasInWater = this.inWater;
    this.inWater = feet === B.WATER || mid === B.WATER;
    this.headInWater = head === B.WATER;
    this.inLava = feet === B.LAVA || mid === B.LAVA;
    if (this.inWater) this.burnTime = 0;
    if (this.inLava && !creative) this.burnTime = Math.max(this.burnTime, 5);
    if (this.inWater && !wasInWater && this.vel.y < -4) events.push({ type: 'splash' });

    // portals
    const inNetherP = feet === B.NETHER_PORTAL || mid === B.NETHER_PORTAL;
    const inEndP = feet === B.END_PORTAL || mid === B.END_PORTAL || below === B.END_PORTAL;
    if (this.portalCooldown > 0) {
      if (!inNetherP && !inEndP) this.portalCooldown = Math.max(0, this.portalCooldown - dt);
      this.portalTime = Math.max(0, this.portalTime - dt * 2);
    } else if (inEndP) {
      this.portalCooldown = 3;
      this.portalTime = 0;
      events.push({ type: 'endPortal' });
    } else if (inNetherP) {
      this.portalTime += dt * (creative ? 3.5 : 1);
      if (this.portalTime >= 2.6) {
        this.portalTime = 0;
        this.portalCooldown = 3.5;
        events.push({ type: 'netherPortal' });
      }
    } else {
      this.portalTime = Math.max(0, this.portalTime - dt * 1.8);
    }

    this.sneaking = !!input.sneak && !this.flying;
    // movement wish
    let fx = 0, fz = 0;
    if (input.forward) fz -= 1; if (input.back) fz += 1;
    if (input.left) fx -= 1; if (input.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }

    // Latch sprinting via Ctrl or double-tap W while forward remains held
    if ((input.sprint || input.sprintTap) && input.forward) {
      this.sprintLatch = true;
      input.sprintTap = false;
    }
    if (!input.forward || this.sneaking || (!creative && this.hunger <= 6)) {
      this.sprintLatch = false;
    }
    this.sprinting = this.sprintLatch && input.forward && !this.sneaking && (creative || this.hunger > 6);

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin, wz = -fx * sin + fz * cos;

    let speed = 4.32;
    if (this.sprinting) speed = 6.35;
    if (this.sneaking) speed = 1.35;
    if (below === B.SOUL_SAND && !this.flying) speed *= 0.58;
    if (input.usingBow && !this.flying) speed *= 0.45;
    if (this.flying) speed = this.sprinting ? 22.5 : 11.2;
    else if (this.inWater || this.inLava) speed = this.inLava ? 1.2 : (this.sprinting ? 3.5 : 2.3);

    if (this.flying) {
      const k = 1 - Math.exp(-dt * 10);
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;
      let vy = 0; if (input.jump) vy += 8.5; if (input.sneak) vy -= 8.5;
      this.vel.y += (vy - this.vel.y) * k;
    } else if (this.inWater || this.inLava) {
      const k = 1 - Math.exp(-dt * 6);
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;
      this.vel.y -= 9 * dt;
      this.vel.y *= Math.exp(-dt * 2.5);
      if (input.jump) this.vel.y = Math.min(this.vel.y + 22 * dt, 3.2);
      if (this.vel.y < -3.5) this.vel.y = -3.5;
      this.fallStart = null;
    } else {
      const k = 1 - Math.exp(-dt * (this.onGround ? 18 : 2.8));
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;
      this.vel.y -= 30 * dt;
      if (this.vel.y < -60) this.vel.y = -60;
      if (input.jump && this.onGround) {
        this.vel.y = 8.95;
        if (this.sprinting) { this.vel.x += wx * 1.9; this.vel.z += wz * 1.9; this.exhaustion += 0.2; }
        else this.exhaustion += 0.05;
      }
    }

    const ox = this.pos.x, oz = this.pos.z;
    const wasOnGround = this.onGround;
    const r = moveAABB(world, this.pos, this.vel, dt, PW, PH, { sneak: this.sneaking, wasOnGround, stepHeight: this.flying ? 0 : 0.58 });
    if ((r.hitX || r.hitZ) && !this.flying && Math.hypot(this.vel.x, this.vel.z) < 0.5) this.sprintLatch = false;
    if (this.inWater && (r.hitX || r.hitZ) && input.jump) this.vel.y = 4.6;
    this.onGround = r.onGround && !this.flying;
    if (creative && this.flying && r.onGround) this.flying = false;

    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.onGround) {
      this.walkDist += moved;
      this.stepAcc += moved;
      if (this.stepAcc > (this.sprinting ? 1.65 : 2.0)) { this.stepAcc = 0; events.push({ type: 'step' }); }
    }
    this.bob += moved * (this.sprinting ? 2.5 : 2.2);
    if (!creative) this.exhaustion += moved * (this.sprinting ? 0.1 : 0.01);

    // fall damage
    if (!this.onGround && !this.flying && !this.inWater) {
      if (this.fallStart === null || this.pos.y > this.fallStart) this.fallStart = this.pos.y;
    }
    if (this.onGround && this.fallStart !== null) {
      const dist = this.fallStart - this.pos.y;
      if (dist > 3.4 && !creative) this.damage(Math.floor(dist - 3), events, 'fall');
      if (dist > 1) events.push({ type: 'land' });
      this.fallStart = null;
    }
    if (this.flying || this.inWater) this.fallStart = null;

    // void
    if (this.pos.y < -20) { if (creative) { this.pos.y = 110; this.vel.set(0, 0, 0); } else this.damage(100, events, 'void'); }

    if (!creative) this.survivalTick(dt, events);
    if (this.hurtTime > 0) this.hurtTime -= dt;
  }

  survivalTick(dt, events) {
    // air
    if (this.headInWater) {
      this.airTimer += dt;
      if (this.airTimer > 1.5) { this.airTimer = 0; if (this.air > 0) this.air--; else this.damage(2, events, 'drown'); }
    } else { this.air = Math.min(10, this.air + dt * 5); this.airTimer = 0; }
    // lava & fire
    if (this.inLava) { this.lavaTimer += dt; if (this.lavaTimer > 0.5) { this.lavaTimer = 0; this.damage(4, events, 'lava'); } }
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      this.burnTick += dt;
      if (this.burnTick >= 1) { this.burnTick = 0; if (!this.inLava) this.damage(1, events, 'fire'); }
    } else this.burnTick = 0;
    // golden apple regeneration
    if (this.regenBoost > 0) {
      this.regenBoost -= dt;
      this.regenBoostTick += dt;
      if (this.regenBoostTick >= 0.6) { this.regenBoostTick = 0; this.health = Math.min(20, this.health + 1); }
    }
    // hunger
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
    this.regenTimer += dt;
    if (this.hunger >= 18 && this.health < 20) {
      if (this.regenTimer > 2.5) { this.regenTimer = 0; this.health = Math.min(20, this.health + 1); this.exhaustion += 3; }
    } else if (this.hunger <= 0) {
      if (this.regenTimer > 4) { this.regenTimer = 0; this.damage(1, events, 'starve'); }
    } else this.regenTimer = Math.min(this.regenTimer, 2.5);
  }

  damage(n, events, cause) {
    if (this.mode === 'creative' || this.dead || n <= 0) return;
    if (this.hurtTime > 0.2 && cause !== 'void' && cause !== 'explosion') return;
    let dmg = n;
    if (this.onArmorDamage && cause !== 'void' && cause !== 'starve' && cause !== 'drown' && cause !== 'fall') {
      dmg = this.onArmorDamage(n, cause);
    }
    this.health -= dmg;
    this.hurtTime = 0.4;
    this.exhaustion += 0.1;
    events.push({ type: 'hurt', cause });
    if (this.health <= 0) { this.health = 0; this.dead = true; events.push({ type: 'death', cause }); }
  }

  eat(food, sat, regen = false) {
    this.hunger = Math.min(20, this.hunger + food);
    this.saturation = Math.min(this.hunger, this.saturation + sat);
    if (regen) { this.regenBoost = 8; this.regenBoostTick = 0; }
  }

  respawn() {
    this.dead = false; this.health = 20; this.hunger = 20; this.saturation = 5; this.air = 10; this.exhaustion = 0;
    this.burnTime = 0; this.regenBoost = 0; this.portalTime = 0;
    this.pos.copy(this.spawn); this.vel.set(0, 0, 0); this.fallStart = null;
  }

  stuck(world) { return collides(world, this.pos, PW, PH); }
}
