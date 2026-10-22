import { maxStack, ITEMS } from './items.js';

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // 0-8 hotbar
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
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(ms, count);
        this.slots[i] = { id, count: n };
        if (dur !== undefined) this.slots[i].dur = dur;
        else if (ITEMS[id] && ITEMS[id].tool) this.slots[i].dur = ITEMS[id].tool.dur;
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

  damageHeld() {
    const s = this.slots[this.selected];
    if (!s || s.dur === undefined) return false;
    s.dur--;
    if (s.dur <= 0) { this.slots[this.selected] = null; return true; }
    return false;
  }

  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.count; return c; }

  serialize() { return { slots: this.slots, selected: this.selected }; }
  load(o) { if (!o) return; this.slots = o.slots.slice(0, 36); while (this.slots.length < 36) this.slots.push(null); this.selected = o.selected || 0; }
}
