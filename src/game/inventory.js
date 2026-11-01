import { maxStack, maxDurability, ITEMS } from './items.js';

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // 0-8 hotbar, 9-35 main
    this.armor = [null, null, null, null]; // helmet, chestplate, leggings, boots
    this.selected = 0;
  }
  get held() { return this.slots[this.selected]; }

  add(id, count, dur) {
    const ms = maxStack(id);
    if (ms > 1) {
      for (let i = 0; i < 36 && count > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < ms) { const n = Math.min(ms - s.count, count); s.count += n; count -= n; }
      }
    }
    const md = maxDurability(id);
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(ms, count);
        this.slots[i] = { id, count: n };
        if (dur !== undefined) this.slots[i].dur = dur;
        else if (md > 0) this.slots[i].dur = md;
        count -= n;
      }
    }
    return count;
  }

  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  consumeId(id, n = 1) {
    let taken = 0;
    for (let i = 0; i < 36 && taken < n; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(s.count, n - taken);
        s.count -= k;
        taken += k;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return taken;
  }

  damageHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s || s.dur === undefined) return false;
    s.dur -= n;
    if (s.dur <= 0) { this.slots[this.selected] = null; return true; }
    return false;
  }

  armorPoints() {
    let pts = 0;
    for (const s of this.armor) {
      if (s && ITEMS[s.id] && ITEMS[s.id].armor) pts += ITEMS[s.id].armor.pts;
    }
    return pts;
  }

  damageArmor(n = 1) {
    let broke = false;
    for (let i = 0; i < 4; i++) {
      const s = this.armor[i];
      if (!s) continue;
      if (s.dur === undefined) s.dur = maxDurability(s.id);
      s.dur -= n;
      if (s.dur <= 0) { this.armor[i] = null; broke = true; }
    }
    return broke;
  }

  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.count; return c; }
  countAny(ids) { let c = 0; for (const s of this.slots) if (s && ids.includes(s.id)) c += s.count; return c; }

  serialize() { return { slots: this.slots, armor: this.armor, selected: this.selected }; }
  load(o) {
    if (!o) return;
    this.slots = (o.slots || []).slice(0, 36);
    while (this.slots.length < 36) this.slots.push(null);
    this.armor = (o.armor || [null, null, null, null]).slice(0, 4);
    while (this.armor.length < 4) this.armor.push(null);
    this.selected = o.selected || 0;
  }
}
