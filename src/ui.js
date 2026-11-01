import { ITEMS, maxStack, maxDurability, itemName } from './game/items.js';
import { RECIPES, matchRecipe } from './game/crafting.js';
import { iconURL, hudIcon } from './render/icons.js';

const $ = (id) => document.getElementById(id);
const ARMOR_HINTS = ['🪖', '🦺', '👖', '👢'];

export class UI {
  constructor(game) {
    this.game = game;
    this.cursor = null; // held stack in container screens
    this.container = null; // {kind, n, craft:[], furnace, chest, ctab, showCraft}
    this.mouse = { x: 0, y: 0 };
    this.lastHotbarKey = '';
    this.lastStatsKey = '';
    this.nameTimer = 0;
    this.recipeOnlyCraftable = false;
    this.recipeQuery = '';
    this.rightDragVisited = new Set();
    this.rightDragging = false;

    document.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      const cs = $('cursor-stack'); cs.style.left = e.clientX + 'px'; cs.style.top = e.clientY + 'px';
      const tt = $('tooltip'); tt.style.left = Math.min(window.innerWidth - 220, e.clientX + 16) + 'px'; tt.style.top = Math.max(8, e.clientY - 10) + 'px';
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) { this.rightDragging = false; this.rightDragVisited.clear(); }
    });

    // Recipe book controls
    $('btn-recipe-filter').onclick = () => {
      this.recipeOnlyCraftable = !this.recipeOnlyCraftable;
      $('btn-recipe-filter').textContent = this.recipeOnlyCraftable ? '作れるのみ' : 'すべて';
      $('btn-recipe-filter').classList.toggle('on', this.recipeOnlyCraftable);
      this.game.sfx.click();
      this.renderRecipeBook();
    };
    $('recipe-search').addEventListener('input', (e) => {
      this.recipeQuery = e.target.value.trim();
      this.renderRecipeBook();
    });
    $('recipe-search').addEventListener('keydown', (e) => e.stopPropagation());
    $('recipe-list').onmousedown = (e) => {
      const btn = e.target.closest('[data-rec]');
      if (!btn) return;
      e.preventDefault();
      this.game.sfx.click();
      this.fillRecipe(+btn.dataset.rec, e.shiftKey);
    };
    $('recipe-list').onmouseover = (e) => {
      const btn = e.target.closest('[data-rec]');
      const tt = $('tooltip');
      if (!btn) { tt.style.display = 'none'; return; }
      tt.textContent = this.recipeTooltip(RECIPES[+btn.dataset.rec]);
      tt.style.display = 'block';
    };
    $('recipe-list').onmouseleave = () => ($('tooltip').style.display = 'none');

    // Creative tabs
    $('creative-tabs').onclick = (e) => {
      const b = e.target.closest('[data-ctab]');
      if (!b || !this.container) return;
      this.game.sfx.click();
      this.returnCraftToInv();
      this.container.ctab = b.dataset.ctab;
      for (const ch of $('creative-tabs').children) ch.classList.toggle('on', ch.dataset.ctab === this.container.ctab);
      this.buildContainer();
    };
  }

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
  }

  toast(msg, ms = 2200) {
    const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => (t.style.opacity = 0), ms);
  }

  slotHTML(s, hint = '') {
    if (!s) return hint ? `<span class="hint">${hint}</span>` : '';
    let h = `<img src="${iconURL(s.id)}" alt="">`;
    if (s.count > 1) h += `<span class="cnt">${s.count}</span>`;
    const md = maxDurability(s.id);
    if (md > 0 && s.dur !== undefined && s.dur < md) {
      const f = Math.max(0, s.dur / md);
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
    const ap = inv.armorPoints();
    const sk = survival + '|' + Math.ceil(p.health) + '|' + Math.ceil(p.hunger) + '|' + Math.ceil(p.air) + '|' + p.headInWater + '|' + ap;
    if (sk !== this.lastStatsKey) {
      const prevH = parseInt(this.lastStatsKey.split('|')[1] || '20');
      this.lastStatsKey = sk;
      $('stats').style.visibility = survival ? 'visible' : 'hidden';
      const row = (type, v) => { let h = ''; for (let i = 0; i < 10; i++) { const s = v >= (i + 1) * 2 ? 2 : v >= i * 2 + 1 ? 1 : 0; h += `<img src="${hudIcon(type, s)}" alt="">`; } return h; };
      $('armor').innerHTML = ap > 0 ? row('armor', ap) : '';
      $('hearts').innerHTML = row('heart', Math.ceil(p.health));
      $('hearts').classList.toggle('shake', Math.ceil(p.health) < prevH || p.health <= 4);
      $('food').innerHTML = row('food', Math.ceil(p.hunger));
      $('air').innerHTML = (p.headInWater || p.air < 10) ? row('bubble', Math.ceil(p.air) * 2) : '';
    }

    $('vignette').style.opacity = p.hurtTime > 0 ? Math.min(1, p.hurtTime * 2.5) : (survival && p.health <= 4 ? 0.35 : 0);
    $('portal-overlay').style.opacity = p.portalTime > 0 ? Math.min(0.9, p.portalTime / 2.4) : 0;
    $('fire-overlay').style.opacity = p.burnTime > 0 ? (0.48 + Math.sin(performance.now() * 0.02) * 0.12) : 0;

    // Bow draw bar
    const bw = $('bow-wrap');
    if (g.bowDraw > 0) {
      bw.classList.remove('hidden');
      $('bow-fill').style.width = Math.min(100, g.bowDraw * 100) + '%';
    } else bw.classList.add('hidden');

    // Boss HP bar
    const boss = g.mobs.getBoss();
    const bossEl = $('boss-wrap');
    if (boss) {
      bossEl.classList.remove('hidden');
      $('boss-name').textContent = boss.T.name;
      $('boss-fill').style.width = Math.max(0, (boss.hp / boss.T.hp) * 100) + '%';
    } else bossEl.classList.add('hidden');
  }

  // ---------- containers ----------
  get isOpen() { return !!this.container; }

  openContainer(kind, data) {
    const g = this.game;
    const creative = g.player.mode === 'creative';
    const n = kind === 'crafting' ? 3 : 2;
    this.container = {
      kind, n,
      craft: new Array(n * n).fill(null),
      furnace: kind === 'furnace' ? data : null,
      chest: kind === 'chest' ? data : null,
      creative: creative && kind === 'inventory',
      ctab: 'palette',
    };
    for (const ch of $('creative-tabs').children) ch.classList.toggle('on', ch.dataset.ctab === 'palette');
    this.show('container');
    this.buildContainer();
  }

  returnCraftToInv() {
    const c = this.container;
    if (!c) return;
    for (let i = 0; i < c.craft.length; i++) {
      if (c.craft[i]) { this.giveBack(c.craft[i]); c.craft[i] = null; }
    }
  }

  closeContainer() {
    const c = this.container;
    if (!c) return;
    this.returnCraftToInv();
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

    const showTabs = c.creative;
    $('creative-tabs').classList.toggle('hidden', !showTabs);
    const paletteMode = c.creative && c.ctab === 'palette';
    c.showCraft = c.kind === 'crafting' || (c.kind === 'inventory' && !paletteMode);
    $('recipe-panel').classList.toggle('hidden', !c.showCraft);

    $('cont-title').textContent =
      c.kind === 'crafting' ? '作業台（3×3 クラフト）' :
      c.kind === 'furnace' ? 'かまど' :
      c.kind === 'chest' ? 'チェスト' :
      paletteMode ? 'クリエイティブ' : 'インベントリ・装備・クラフト';

    if (paletteMode) {
      main.className = '';
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
      } else if (c.kind === 'chest') {
        top.innerHTML = `<div class="grid9">${Array.from({ length: 27 }, (_, i) => `<div class="slot" data-ch="${i}"></div>`).join('')}</div>`;
      } else if (c.kind === 'inventory') {
        top.innerHTML = `<div class="top-inv-wrap">
          <div class="armor-grid">${[0, 1, 2, 3].map(a => `<div class="slot" data-a="${a}"></div>`).join('')}</div>
          <div class="craft-area">
            <div class="craft-grid" style="grid-template-columns:repeat(2,54px)">${c.craft.map((_, i) => `<div class="slot" data-c="${i}"></div>`).join('')}</div>
            <div class="arrow">➜</div>
            <div class="slot out" data-out="1"></div>
          </div>
        </div>`;
      } else {
        top.innerHTML = `<div class="craft-area">
          <div class="craft-grid" style="grid-template-columns:repeat(3,54px)">${c.craft.map((_, i) => `<div class="slot" data-c="${i}"></div>`).join('')}</div>
          <div class="arrow">➜</div>
          <div class="slot out" data-out="1"></div>
        </div>`;
      }
      main.className = 'grid9';
      main.innerHTML = Array.from({ length: 27 }, (_, i) => `<div class="slot" data-i="${i + 9}"></div>`).join('');
    }
    hot.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="slot" data-i="${i}"></div>`).join('');

    const panel = document.querySelector('#container .panel.inv');
    panel.onmousedown = (e) => this.onClick(e);
    panel.oncontextmenu = (e) => e.preventDefault();
    panel.onmouseover = (e) => this.onHover(e);
    panel.onmouseleave = () => ($('tooltip').style.display = 'none');
    this.refresh();
  }

  // ---------- Recipe Book ----------
  recipeNeeds(r) {
    // Returns array of { key, options: number[], count: number }
    const counts = {};
    for (const row of r.pattern) for (const ch of row) if (ch !== ' ') counts[ch] = (counts[ch] || 0) + 1;
    return Object.entries(counts).map(([k, count]) => ({ key: k, options: r.keyMap[k], count }));
  }

  canCraftRecipe(r) {
    const c = this.container;
    if (!c) return false;
    if (r.w > c.n || r.h > c.n) return false;
    if (this.game.player.mode === 'creative') return true;
    const pool = new Map();
    for (const s of this.game.inventory.slots) if (s) pool.set(s.id, (pool.get(s.id) || 0) + s.count);
    for (const s of c.craft) if (s) pool.set(s.id, (pool.get(s.id) || 0) + s.count);
    // Check if each pattern cell can be satisfied from a consistent item per key or per cell
    const temp = new Map(pool);
    for (const need of this.recipeNeeds(r)) {
      let ok = false;
      for (const optId of need.options) {
        if ((temp.get(optId) || 0) >= need.count) {
          temp.set(optId, temp.get(optId) - need.count);
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  }

  recipeTooltip(r) {
    const c = this.container;
    const head = `${itemName(r.out)}${r.count > 1 ? ' ×' + r.count : ''}`;
    const needs = this.recipeNeeds(r).map(nd => `${itemName(nd.options[0])} ×${nd.count}`).join('、');
    const warn = (c && (r.w > c.n || r.h > c.n)) ? '\n⚠ 作業台（3×3）が必要' : '';
    return `${head}\n材料: ${needs}${warn}`;
  }

  renderRecipeBook() {
    const c = this.container;
    if (!c || !c.showCraft) return;
    const q = this.recipeQuery;
    const html = [];
    RECIPES.forEach((r, idx) => {
      const nm = itemName(r.out);
      if (q && !nm.includes(q)) return;
      const fits = r.w <= c.n && r.h <= c.n;
      const ok = this.canCraftRecipe(r);
      if (this.recipeOnlyCraftable && !ok) return;
      html.push(
        `<button class="r-btn ${ok ? 'ok' : 'lack'}" data-rec="${idx}">` +
        (!fits ? `<span class="need3">3×3</span>` : '') +
        `<img src="${iconURL(r.out)}" alt="">` +
        (r.count > 1 ? `<span class="cnt">${r.count}</span>` : '') +
        `</button>`
      );
    });
    $('recipe-list').innerHTML = html.length ? html.join('') : `<div style="grid-column:1/-1;color:var(--muted);font-size:12px;text-align:center;padding:16px">該当レシピなし</div>`;
  }

  fillRecipe(idx, maxFill = false) {
    const c = this.container;
    const r = RECIPES[idx];
    if (!c || !r) return;
    if (r.w > c.n || r.h > c.n) {
      this.toast('このレシピ（3×3）を作るには「作業台」を右クリックしてください！');
      return;
    }
    this.returnCraftToInv();
    const inv = this.game.inventory;
    const creative = this.game.player.mode === 'creative';

    if (creative) {
      const sets = maxFill ? Math.min(64, maxStack(r.out)) : 1;
      for (let y = 0; y < r.h; y++) {
        const row = r.pattern[y] || '';
        for (let x = 0; x < r.w; x++) {
          const ch = row[x] || ' ';
          if (ch === ' ') continue;
          const id = r.keyMap[ch][0];
          c.craft[x + y * c.n] = { id, count: Math.min(maxStack(id), sets) };
        }
      }
      this.refresh();
      return;
    }

    // Choose concrete item ID per key from player's inventory
    const chosen = {};
    let maxSets = maxFill ? 64 : 1;
    for (const need of this.recipeNeeds(r)) {
      let bestId = -1, bestCnt = 0;
      for (const optId of need.options) {
        const cnt = inv.count(optId);
        if (cnt > bestCnt) { bestCnt = cnt; bestId = optId; }
      }
      if (bestCnt < need.count) {
        this.toast(`材料が足りません（${itemName(need.options[0])} ×${need.count}）`);
        this.refresh();
        return;
      }
      chosen[need.key] = bestId;
      maxSets = Math.min(maxSets, Math.floor(bestCnt / need.count), maxStack(bestId));
    }
    const sets = Math.max(1, maxSets);
    for (let y = 0; y < r.h; y++) {
      const row = r.pattern[y] || '';
      for (let x = 0; x < r.w; x++) {
        const ch = row[x] || ' ';
        if (ch === ' ') continue;
        const id = chosen[ch];
        const got = inv.consumeId(id, sets);
        if (got > 0) c.craft[x + y * c.n] = { id, count: got };
      }
    }
    this.refresh();
  }

  craftResult() {
    const c = this.container;
    if (!c || !c.showCraft) return null;
    return matchRecipe(c.craft, c.n);
  }

  refresh() {
    const c = this.container;
    if (!c) return;
    const inv = this.game.inventory;
    for (const el of document.querySelectorAll('#container [data-i]')) el.innerHTML = this.slotHTML(inv.slots[+el.dataset.i]);
    for (const el of document.querySelectorAll('#container [data-a]')) {
      const ai = +el.dataset.a;
      el.innerHTML = this.slotHTML(inv.armor[ai], ARMOR_HINTS[ai]);
    }
    for (const el of document.querySelectorAll('#container [data-c]')) el.innerHTML = this.slotHTML(c.craft[+el.dataset.c]);
    for (const el of document.querySelectorAll('#container [data-ch]')) el.innerHTML = this.slotHTML(c.chest[+el.dataset.ch]);
    const out = document.querySelector('#container [data-out]');
    if (out) out.innerHTML = this.slotHTML(this.craftResult());
    if (c.furnace) for (const el of document.querySelectorAll('#container [data-f]')) el.innerHTML = this.slotHTML(c.furnace[el.dataset.f]);
    this.renderCursor();
    this.renderRecipeBook();
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

  slotKey(el) {
    for (const k of ['i', 'c', 'a', 'ch', 'f']) if (el.dataset[k] !== undefined) return k + ':' + el.dataset[k];
    return '';
  }

  onHover(e) {
    const el = e.target.closest('.slot');
    const tt = $('tooltip');
    if (!el) { tt.style.display = 'none'; return; }

    // Right-click drag painting 1 item into empty / matching slots
    if (this.rightDragging && this.cursor && this.cursor.count > 0 && (el.dataset.c !== undefined || el.dataset.i !== undefined || el.dataset.ch !== undefined)) {
      const sk = this.slotKey(el);
      if (!this.rightDragVisited.has(sk)) {
        const curSlot = this.getSlot(el);
        if (!curSlot) {
          this.rightDragVisited.add(sk);
          this.setSlot(el, { ...this.cursor, count: 1 });
          this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
          this.refresh();
        } else if (curSlot.id === this.cursor.id && curSlot.count < maxStack(curSlot.id)) {
          this.rightDragVisited.add(sk);
          curSlot.count++;
          this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
          this.refresh();
        }
      }
    }

    const s = this.getSlot(el);
    if (s) {
      const it = ITEMS[s.id];
      let text = itemName(s.id);
      if (it && it.tool) text += `\n攻撃力 +${it.tool.dmg} · 耐久 ${s.dur ?? it.tool.dur}/${it.tool.dur}`;
      else if (it && it.armor) text += `\n防御 +${it.armor.pts} · 耐久 ${s.dur ?? it.armor.dur}/${it.armor.dur}`;
      tt.textContent = text;
      tt.style.display = 'block';
    } else tt.style.display = 'none';
  }

  getSlot(el) {
    const c = this.container, inv = this.game.inventory;
    if (el.dataset.i !== undefined) return inv.slots[+el.dataset.i];
    if (el.dataset.a !== undefined) return inv.armor[+el.dataset.a];
    if (el.dataset.c !== undefined) return c.craft[+el.dataset.c];
    if (el.dataset.ch !== undefined) return c.chest[+el.dataset.ch];
    if (el.dataset.out !== undefined) return this.craftResult();
    if (el.dataset.f !== undefined) return c.furnace[el.dataset.f];
    if (el.dataset.pal !== undefined) return { id: +el.dataset.pal, count: 1 };
    return null;
  }

  setSlot(el, v) {
    const c = this.container, inv = this.game.inventory;
    if (v && v.count <= 0) v = null;
    if (el.dataset.i !== undefined) inv.slots[+el.dataset.i] = v;
    else if (el.dataset.a !== undefined) inv.armor[+el.dataset.a] = v;
    else if (el.dataset.c !== undefined) c.craft[+el.dataset.c] = v;
    else if (el.dataset.ch !== undefined) c.chest[+el.dataset.ch] = v;
    else if (el.dataset.f !== undefined) c.furnace[el.dataset.f] = v;
  }

  makeStack(id, count) {
    const st = { id, count };
    const md = maxDurability(id);
    if (md > 0) st.dur = md;
    return st;
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
    const paletteMode = c.creative && c.ctab === 'palette';

    // creative palette
    if (el.dataset.pal !== undefined) {
      const id = +el.dataset.pal;
      if (this.cursor && this.cursor.id !== id) { this.cursor = null; }
      else if (shift) inv.add(id, maxStack(id));
      else if (!this.cursor) this.cursor = this.makeStack(id, right ? 1 : maxStack(id));
      else if (this.cursor.id === id) this.cursor.count = Math.min(maxStack(id), this.cursor.count + 1);
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
        if (!this.cursor) { this.cursor = this.makeStack(res.id, res.count); take(); }
        else if (this.cursor.id === res.id && this.cursor.count + res.count <= maxStack(res.id)) { this.cursor.count += res.count; take(); }
      }
      this.refresh(); return;
    }

    const isOutput = el.dataset.f === 'output';
    let s = this.getSlot(el);

    // Armor slot validation
    if (el.dataset.a !== undefined && !shift) {
      const ai = +el.dataset.a;
      if (this.cursor) {
        const arm = ITEMS[this.cursor.id]?.armor;
        if (!arm || arm.slot !== ai) return;
      }
    }

    if (shift && s) {
      if (el.dataset.i !== undefined) {
        const i = +el.dataset.i;
        const arm = ITEMS[s.id]?.armor;
        if (c.kind === 'inventory' && !paletteMode && arm && !inv.armor[arm.slot]) {
          inv.armor[arm.slot] = s;
          inv.slots[i] = null;
          this.refresh(); return;
        }
        if (c.kind === 'chest') {
          let left = s;
          inv.slots[i] = null;
          for (let k = 0; k < 27 && left; k++) {
            const t = c.chest[k];
            if (t && t.id === left.id && t.count < maxStack(t.id)) {
              const n = Math.min(maxStack(t.id) - t.count, left.count);
              t.count += n; left.count -= n; if (left.count <= 0) left = null;
            }
          }
          for (let k = 0; k < 27 && left; k++) if (!c.chest[k]) { c.chest[k] = left; left = null; }
          if (left) inv.slots[i] = left;
          this.refresh(); return;
        }
        if (c.kind === 'furnace') {
          const f = c.furnace;
          const target = ITEMS[s.id].fuel && !this.game.smeltable(s.id) ? 'fuel' : 'input';
          const cur = f[target];
          if (!cur) { f[target] = s; inv.slots[i] = null; }
          else if (cur.id === s.id) { const n = Math.min(maxStack(s.id) - cur.count, s.count); cur.count += n; s.count -= n; if (s.count <= 0) inv.slots[i] = null; }
        } else if (!paletteMode) {
          const range = i < 9 ? [9, 36] : [0, 9];
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
      } else if (!s) {
        this.setSlot(el, { ...cur, count: 1 });
        cur.count--; if (cur.count <= 0) this.cursor = null;
        this.rightDragging = true;
        this.rightDragVisited.add(this.slotKey(el));
      } else if (s.id === cur.id && s.count < maxStack(s.id)) {
        s.count++;
        cur.count--; if (cur.count <= 0) this.cursor = null;
        this.rightDragging = true;
        this.rightDragVisited.add(this.slotKey(el));
      }
    }
    this.refresh();
  }
}
