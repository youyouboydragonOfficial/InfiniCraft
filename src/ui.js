import { ITEMS, maxStack, itemName } from './game/items.js';
import { matchRecipe } from './game/crafting.js';
import { iconURL, hudIcon } from './render/icons.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.cursor = null; // held stack in container screens
    this.container = null; // {kind, n, craft:[], furnace}
    this.mouse = { x: 0, y: 0 };
    this.lastHotbarKey = '';
    this.lastStatsKey = '';
    this.nameTimer = 0;
    document.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const cs = $('cursor-stack'); cs.style.left = e.clientX + 'px'; cs.style.top = e.clientY + 'px';
      const tt = $('tooltip'); tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY - 10) + 'px';
    });
  }

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  toast(msg, ms = 2000) {
    const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => (t.style.opacity = 0), ms);
  }

  slotHTML(s) {
    if (!s) return '';
    const it = ITEMS[s.id];
    let h = `<img src="${iconURL(s.id)}" alt="">`;
    if (s.count > 1) h += `<span class="cnt">${s.count}</span>`;
    if (it && it.tool && s.dur !== undefined && s.dur < it.tool.dur) {
      const f = s.dur / it.tool.dur;
      h += `<span class="dur"><i style="width:${f * 100}%;background:hsl(${f * 120} 90% 50%)"></i></span>`;
    }
    return h;
  }

  // ---------- HUD ----------
  renderHUD(dt) {
    const g = this.game, inv = g.inventory, p = g.player;
    const hk = inv.selected + '|' + inv.slots.slice(0, 9).map(s => s ? s.id + ':' + s.count + ':' + (s.dur ?? '') : '-').join(',');
    if (hk !== this.lastHotbarKey) {
      const prevSel = this.lastHotbarKey.split('|')[0];
      this.lastHotbarKey = hk;
      $('hotbar').innerHTML = inv.slots.slice(0, 9).map((s, i) => `<div class="slot ${i === inv.selected ? 'sel' : ''}">${this.slotHTML(s)}</div>`).join('');
      if (prevSel !== String(inv.selected)) {
        const held = inv.held;
        $('item-name').textContent = held ? itemName(held.id) : '';
        $('item-name').style.opacity = held ? 1 : 0;
        this.nameTimer = 2;
      }
    }
    if (this.nameTimer > 0) { this.nameTimer -= dt; if (this.nameTimer <= 0) $('item-name').style.opacity = 0; }
    const survival = p.mode === 'survival';
    const sk = survival + '|' + Math.ceil(p.health) + '|' + Math.ceil(p.hunger) + '|' + Math.ceil(p.air) + '|' + p.headInWater;
    if (sk !== this.lastStatsKey) {
      const prevH = parseInt(this.lastStatsKey.split('|')[1] || '20');
      this.lastStatsKey = sk;
      $('stats').style.visibility = survival ? 'visible' : 'hidden';
      const row = (type, v) => { let h = ''; for (let i = 0; i < 10; i++) { const s = v >= (i + 1) * 2 ? 2 : v >= i * 2 + 1 ? 1 : 0; h += `<img src="${hudIcon(type, s)}" alt="">`; } return h; };
      $('hearts').innerHTML = row('heart', Math.ceil(p.health));
      $('hearts').classList.toggle('shake', Math.ceil(p.health) < prevH || p.health <= 4);
      $('food').innerHTML = row('food', Math.ceil(p.hunger));
      $('air').innerHTML = (p.headInWater || p.air < 10) ? row('bubble', Math.ceil(p.air) * 2) : '';
    }
    $('vignette').style.opacity = p.hurtTime > 0 ? Math.min(1, p.hurtTime * 2.5) : (survival && p.health <= 4 ? 0.35 : 0);
  }

  // ---------- containers ----------
  get isOpen() { return !!this.container; }

  openContainer(kind, furnace) {
    const g = this.game;
    const creative = g.player.mode === 'creative';
    const n = kind === 'crafting' ? 3 : 2;
    this.container = { kind, n, craft: new Array(n * n).fill(null), furnace, creative: creative && kind === 'inventory' };
    $('cont-title').textContent = kind === 'crafting' ? '作業台' : kind === 'furnace' ? 'かまど' : (this.container.creative ? 'クリエイティブ' : 'インベントリ');
    this.show('container');
    this.buildContainer();
  }

  closeContainer() {
    const c = this.container;
    if (!c) return;
    const g = this.game;
    for (const s of c.craft) if (s) this.giveBack(s);
    if (this.cursor) { this.giveBack(this.cursor); this.cursor = null; }
    this.container = null;
    this.renderCursor();
    $('tooltip').style.display = 'none';
    this.show(null);
  }

  giveBack(s) {
    const left = this.game.inventory.add(s.id, s.count, s.dur);
    if (left > 0) this.game.dropStack({ id: s.id, count: left, dur: s.dur });
  }

  buildContainer() {
    const c = this.container;
    const top = $('cont-top'), main = $('cont-main'), hot = $('cont-hotbar');
    top.innerHTML = ''; main.innerHTML = '';
    if (c.creative) {
      main.innerHTML = `<input id="palette-search" placeholder="アイテムを検索…" /><div id="palette"></div>`;
      const ids = ITEMS.filter(it => it && !it.hidden).map(it => it.id);
      const draw = (q) => {
        $('palette').innerHTML = ids.filter(id => !q || itemName(id).includes(q)).map(id => `<div class="slot" data-pal="${id}"><img src="${iconURL(id)}" alt=""></div>`).join('') + `<div class="trash" data-trash="1" title="捨てる">🗑</div>`;
      };
      draw('');
      $('palette-search').addEventListener('input', (e) => draw(e.target.value.trim()));
      $('palette-search').addEventListener('keydown', (e) => e.stopPropagation());
    } else {
      if (c.kind === 'furnace') {
        top.innerHTML = `<div class="furnace-col"><div class="slot" data-f="input"></div><div class="flame" id="f-flame">🔥</div><div class="slot" data-f="fuel"></div></div>
          <div class="arrow">➜<span class="prog" id="f-prog" style="width:0">➜</span></div>
          <div class="slot out" data-f="output"></div>`;
      } else {
        top.innerHTML = `<div class="craft-grid" style="grid-template-columns:repeat(${c.n},56px)">${c.craft.map((_, i) => `<div class="slot" data-c="${i}"></div>`).join('')}</div>
          <div class="arrow">➜</div><div class="slot out" data-out="1"></div>`;
      }
      main.className = 'grid9';
      main.innerHTML = Array.from({ length: 27 }, (_, i) => `<div class="slot" data-i="${i + 9}"></div>`).join('');
    }
    hot.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="slot" data-i="${i}"></div>`).join('');
    const panel = document.querySelector('#container .panel');
    panel.onmousedown = (e) => this.onClick(e);
    panel.oncontextmenu = (e) => e.preventDefault();
    panel.onmouseover = (e) => this.onHover(e);
    panel.onmouseleave = () => ($('tooltip').style.display = 'none');
    this.refresh();
  }

  craftResult() {
    const c = this.container;
    if (!c || (c.kind !== 'inventory' && c.kind !== 'crafting') || c.creative) return null;
    return matchRecipe(c.craft, c.n);
  }

  refresh() {
    const c = this.container;
    if (!c) return;
    const inv = this.game.inventory;
    for (const el of document.querySelectorAll('#container [data-i]')) el.innerHTML = this.slotHTML(inv.slots[+el.dataset.i]);
    for (const el of document.querySelectorAll('#container [data-c]')) el.innerHTML = this.slotHTML(c.craft[+el.dataset.c]);
    const out = document.querySelector('#container [data-out]');
    if (out) out.innerHTML = this.slotHTML(this.craftResult());
    if (c.furnace) for (const el of document.querySelectorAll('#container [data-f]')) el.innerHTML = this.slotHTML(c.furnace[el.dataset.f]);
    this.renderCursor();
  }

  updateFurnace() {
    const c = this.container;
    if (!c || !c.furnace) return;
    const f = c.furnace;
    const p = $('f-prog'); if (p) p.style.width = (f.prog / 10 * 100) + '%';
    const fl = $('f-flame'); if (fl) fl.classList.toggle('on', f.burn > 0);
    const key = JSON.stringify([f.input, f.fuel, f.output]);
    if (key !== this._fk) { this._fk = key; this.refresh(); }
  }

  renderCursor() {
    $('cursor-stack').innerHTML = this.cursor ? this.slotHTML(this.cursor) : '';
  }

  onHover(e) {
    const el = e.target.closest('.slot');
    const tt = $('tooltip');
    if (!el) { tt.style.display = 'none'; return; }
    const s = this.getSlot(el);
    if (s) { tt.textContent = itemName(s.id); tt.style.display = 'block'; } else tt.style.display = 'none';
  }

  getSlot(el) {
    const c = this.container, inv = this.game.inventory;
    if (el.dataset.i !== undefined) return inv.slots[+el.dataset.i];
    if (el.dataset.c !== undefined) return c.craft[+el.dataset.c];
    if (el.dataset.out !== undefined) return this.craftResult();
    if (el.dataset.f !== undefined) return c.furnace[el.dataset.f];
    if (el.dataset.pal !== undefined) return { id: +el.dataset.pal, count: 1 };
    return null;
  }
  setSlot(el, v) {
    const c = this.container, inv = this.game.inventory;
    if (v && v.count <= 0) v = null;
    if (el.dataset.i !== undefined) inv.slots[+el.dataset.i] = v;
    else if (el.dataset.c !== undefined) c.craft[+el.dataset.c] = v;
    else if (el.dataset.f !== undefined) c.furnace[el.dataset.f] = v;
  }

  onClick(e) {
    e.preventDefault();
    const c = this.container;
    const inv = this.game.inventory;
    this.game.sfx.click();
    if (e.target.closest('[data-trash]')) { this.cursor = null; this.refresh(); return; }
    const el = e.target.closest('.slot');
    if (!el) return;
    const right = e.button === 2, shift = e.shiftKey;

    // creative palette
    if (el.dataset.pal !== undefined) {
      const id = +el.dataset.pal;
      if (this.cursor) { this.cursor = null; }
      else if (shift) inv.add(id, maxStack(id));
      else { this.cursor = { id, count: right ? 1 : maxStack(id) }; if (ITEMS[id].tool) this.cursor.dur = ITEMS[id].tool.dur; }
      this.refresh(); return;
    }

    // craft output
    if (el.dataset.out !== undefined) {
      const res = this.craftResult();
      if (!res) return;
      const take = () => {
        for (let i = 0; i < c.craft.length; i++) if (c.craft[i]) { c.craft[i].count--; if (c.craft[i].count <= 0) c.craft[i] = null; }
      };
      if (shift) {
        let guard = 64;
        while (guard-- > 0) {
          const r = this.craftResult();
          if (!r || r.id !== res.id) break;
          const left = inv.add(r.id, r.count);
          take();
          if (left > 0) { this.game.dropStack({ id: r.id, count: left }); break; }
        }
      } else {
        if (!this.cursor) { this.cursor = { id: res.id, count: res.count }; if (ITEMS[res.id].tool) this.cursor.dur = ITEMS[res.id].tool.dur; take(); }
        else if (this.cursor.id === res.id && this.cursor.count + res.count <= maxStack(res.id)) { this.cursor.count += res.count; take(); }
      }
      this.refresh(); return;
    }

    // furnace output: take only
    const isOutput = el.dataset.f === 'output';
    let s = this.getSlot(el);

    if (shift && s) {
      // quick move
      if (el.dataset.i !== undefined) {
        const i = +el.dataset.i;
        const range = c.kind === 'furnace' ? null : (i < 9 ? [9, 36] : [0, 9]);
        if (c.kind === 'furnace') {
          const f = c.furnace;
          const target = ITEMS[s.id].fuel && !this.game.smeltable(s.id) ? 'fuel' : 'input';
          const cur = f[target];
          if (!cur) { f[target] = s; inv.slots[i] = null; }
          else if (cur.id === s.id) { const n = Math.min(maxStack(s.id) - cur.count, s.count); cur.count += n; s.count -= n; if (s.count <= 0) inv.slots[i] = null; }
        } else if (!c.creative) {
          inv.slots[i] = null;
          let left = s;
          for (let k = range[0]; k < range[1] && left; k++) {
            const t = inv.slots[k];
            if (t && t.id === left.id && t.count < maxStack(t.id)) { const n = Math.min(maxStack(t.id) - t.count, left.count); t.count += n; left.count -= n; if (left.count <= 0) left = null; }
          }
          for (let k = range[0]; k < range[1] && left; k++) if (!inv.slots[k]) { inv.slots[k] = left; left = null; }
          if (left) inv.slots[i] = left;
        } else inv.slots[i] = null;
      } else {
        const left = inv.add(s.id, s.count, s.dur);
        this.setSlot(el, left > 0 ? { ...s, count: left } : null);
      }
      this.refresh(); return;
    }

    if (isOutput) {
      if (!s) return;
      if (!this.cursor) { this.cursor = s; this.setSlot(el, null); }
      else if (this.cursor.id === s.id && this.cursor.count + s.count <= maxStack(s.id)) { this.cursor.count += s.count; this.setSlot(el, null); }
      this.refresh(); return;
    }

    const cur = this.cursor;
    if (!right) {
      if (!cur) { if (s) { this.cursor = s; this.setSlot(el, null); } }
      else if (!s) { this.setSlot(el, cur); this.cursor = null; }
      else if (s.id === cur.id && maxStack(s.id) > 1) {
        const n = Math.min(maxStack(s.id) - s.count, cur.count);
        s.count += n; cur.count -= n; if (cur.count <= 0) this.cursor = null;
      } else { this.setSlot(el, cur); this.cursor = s; }
    } else {
      if (!cur) {
        if (s) { const half = Math.ceil(s.count / 2); this.cursor = { ...s, count: half }; s.count -= half; if (s.count <= 0) this.setSlot(el, null); }
      } else if (!s) { this.setSlot(el, { ...cur, count: 1 }); cur.count--; if (cur.count <= 0) this.cursor = null; }
      else if (s.id === cur.id && s.count < maxStack(s.id)) { s.count++; cur.count--; if (cur.count <= 0) this.cursor = null; }
    }
    this.refresh();
  }
}
