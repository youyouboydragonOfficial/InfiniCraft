import { SOLID } from '../world/blocks.js';

const EPS = 0.001;

// Collides an AABB (feet-centered) against solid voxels. Moves pos in place, zeroes blocked velocity.
export function moveAABB(world, pos, vel, dt, hw, h, opts = {}) {
  const res = { onGround: false, hitX: false, hitZ: false, hitY: false };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt / 0.4));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (const axis of ['y', 'x', 'z']) {
      const d = vel[axis] * sdt;
      if (d === 0) continue;
      const prev = pos[axis];
      pos[axis] += d;
      if (collides(world, pos, hw, h)) {
        pos[axis] = prev;
        // approach surface precisely
        if (axis === 'y') {
          if (d < 0) { pos.y = Math.floor(prev + d) + 1 + EPS; if (collides(world, pos, hw, h)) pos.y = prev; res.onGround = true; }
          else { pos.y = Math.ceil(prev + h) - h - EPS; if (collides(world, pos, hw, h)) pos.y = prev; }
          res.hitY = true;
        } else {
          const edge = d > 0 ? Math.ceil(prev + hw) - hw - EPS : Math.floor(prev - hw) + hw + EPS;
          pos[axis] = edge;
          if (collides(world, pos, hw, h)) pos[axis] = prev;
          if (axis === 'x') res.hitX = true; else res.hitZ = true;
        }
        vel[axis] = 0;
      } else if (axis !== 'y' && opts.sneak && opts.wasOnGround) {
        // sneaking: don't walk off edges
        pos.y -= 0.6;
        const supported = collides(world, pos, hw - 0.05, 0.6);
        pos.y += 0.6;
        if (!supported) { pos[axis] = prev; vel[axis] = 0; }
      }
    }
  }
  return res;
}

export function collides(world, pos, hw, h) {
  const x0 = Math.floor(pos.x - hw), x1 = Math.floor(pos.x + hw);
  const y0 = Math.floor(pos.y), y1 = Math.floor(pos.y + h);
  const z0 = Math.floor(pos.z - hw), z1 = Math.floor(pos.z + hw);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const b = world.getBlock(x, y, z);
    if (b < 0) return true; // unloaded = solid
    if (SOLID[b]) return true;
  }
  return false;
}

export function aabbIntersectsBlock(pos, hw, h, bx, by, bz) {
  return pos.x + hw > bx && pos.x - hw < bx + 1 && pos.y + h > by && pos.y < by + 1 && pos.z + hw > bz && pos.z - hw < bz + 1;
}
