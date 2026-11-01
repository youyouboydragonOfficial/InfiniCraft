// Synthesized sound effects (WebAudio, no external assets)
let ctx = null, master = null, noiseBuf = null, ambient = null;
let volume = 0.7;

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function resumeAudio() { init(); if (ctx.state === 'suspended') ctx.resume(); }
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

const PROFILES = {
  stone: { f: 900, q: 1.2, dur: 0.12, type: 'bandpass', gain: 0.5 },
  wood: { f: 450, q: 3, dur: 0.14, type: 'bandpass', gain: 0.6, tone: 180 },
  grass: { f: 2500, q: 0.6, dur: 0.16, type: 'highpass', gain: 0.25 },
  gravel: { f: 1400, q: 0.8, dur: 0.15, type: 'bandpass', gain: 0.4 },
  sand: { f: 3000, q: 0.5, dur: 0.18, type: 'highpass', gain: 0.22 },
  snow: { f: 1800, q: 0.7, dur: 0.18, type: 'bandpass', gain: 0.25 },
  glass: { f: 3500, q: 4, dur: 0.25, type: 'bandpass', gain: 0.5, tone: 2400 },
  metal: { f: 2000, q: 6, dur: 0.3, type: 'bandpass', gain: 0.4, tone: 1200 },
  cloth: { f: 800, q: 0.5, dur: 0.12, type: 'lowpass', gain: 0.3 },
};

function noise(p, vol = 1, rate = 1, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = p.type; f.frequency.value = p.f * (0.85 + Math.random() * 0.3); f.Q.value = p.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.001, p.gain * vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 1.3); src.stop(t + p.dur + 0.05);
  if (p.tone) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = p.tone * (0.9 + Math.random() * 0.2);
    const og = ctx.createGain(); og.gain.setValueAtTime(p.gain * vol * 0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + p.dur * 0.8);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + p.dur);
  }
}

function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
}

function formant(freq, f1, f2, dur, type = 'sawtooth', vol = 0.16, vibHz = 0, vibAmt = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.linearRampToValueAtTime(freq * 0.92, t + dur);
  if (vibHz > 0) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = vibHz;
    const lg = ctx.createGain(); lg.gain.value = vibAmt;
    lfo.connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
  }
  const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 3.2;
  flt.frequency.setValueAtTime(f1, t);
  flt.frequency.linearRampToValueAtTime(f2, t + dur * 0.6);
  flt.frequency.linearRampToValueAtTime(f1 * 0.85, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(flt); flt.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.03);
}

function boneRattle(vol = 0.18, count = 3) {
  for (let i = 0; i < count; i++) {
    noise({ f: 1700 + i * 350, q: 7, dur: 0.055, type: 'bandpass', gain: vol, tone: 900 + i * 220 }, 1, 1.2, i * 0.045);
  }
}

export const sfx = {
  break(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: p.dur * 1.8 }, 1.2); noise(p, 0.7, 0.7); },
  hit(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: 0.06 }, 0.35); },
  place(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise(p, 0.9, 0.8); },
  step(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: 0.08 }, 0.35); },
  hurt() { if (!ctx) return; tone(220, 0.22, 'sawtooth', 0.15, 0.6); noise(PROFILES.cloth, 0.6); },
  pop() { if (!ctx) return; tone(600 + Math.random() * 400, 0.08, 'sine', 0.15, 1.8); },
  eat() { if (!ctx) return; for (let i = 0; i < 3; i++) noise({ ...PROFILES.gravel, dur: 0.08 }, 0.5, 1.4, i * 0.12); },
  splash() { if (!ctx) return; noise({ f: 1200, q: 0.4, dur: 0.6, type: 'lowpass', gain: 0.5 }, 1); },
  click() { if (!ctx) return; tone(1200, 0.04, 'square', 0.05); },

  // Weapons, tools, TNT & portals
  bow() {
    if (!ctx) return;
    tone(290 + Math.random() * 50, 0.14, 'triangle', 0.18, 1.75);
    noise({ f: 2200, q: 1.0, dur: 0.12, type: 'bandpass', gain: 0.22 }, 1, 1.3);
  },
  arrowHit() {
    if (!ctx) return;
    tone(680, 0.09, 'triangle', 0.16, 0.38);
    noise({ ...PROFILES.wood, dur: 0.07 }, 0.55);
  },
  ignite() {
    if (!ctx) return;
    noise({ f: 4200, q: 5, dur: 0.06, type: 'bandpass', gain: 0.45, tone: 2800 }, 1);
    noise({ f: 1400, q: 0.7, dur: 0.28, type: 'bandpass', gain: 0.28 }, 1, 0.9, 0.03);
  },
  fuse() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 1.4;
    flt.frequency.setValueAtTime(2400, t);
    flt.frequency.exponentialRampToValueAtTime(4800, t + 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.92);
  },
  explode(power = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.min(1.4, 0.6 + power * 0.2);
    tone(95, 0.65, 'sine', 0.45 * v, 0.24);
    tone(62, 0.85, 'triangle', 0.35 * v, 0.3);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.55;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(900, t);
    flt.frequency.exponentialRampToValueAtTime(95, t + 1.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t); src.stop(t + 1.2);
    noise({ f: 2400, q: 0.8, dur: 0.35, type: 'bandpass', gain: 0.25 * v }, 1, 0.8, 0.04);
  },
  bucket(lava = false) {
    if (!ctx) return;
    if (lava) {
      tone(160, 0.25, 'sine', 0.2, 0.65);
      noise({ f: 900, q: 1.5, dur: 0.25, type: 'lowpass', gain: 0.3 }, 1);
    } else {
      tone(480, 0.12, 'sine', 0.16, 1.7);
      tone(720, 0.1, 'sine', 0.12, 1.4, 0.06);
      noise({ f: 1500, q: 1.2, dur: 0.18, type: 'bandpass', gain: 0.22 }, 1);
    }
  },
  fizz() {
    if (!ctx) return;
    noise({ f: 3200, q: 0.9, dur: 0.45, type: 'bandpass', gain: 0.35 }, 1);
  },
  teleport() {
    if (!ctx) return;
    tone(240, 0.28, 'sine', 0.22, 0.28);
    tone(920, 0.18, 'triangle', 0.1, 0.45);
    noise({ f: 1800, q: 2, dur: 0.2, type: 'bandpass', gain: 0.2 }, 1);
  },
  portal() {
    if (!ctx) return;
    [220, 330, 440, 587].forEach((f, i) => tone(f, 0.9, 'sine', 0.08, 1.04, i * 0.06));
    noise({ f: 500, q: 1.5, dur: 0.9, type: 'bandpass', gain: 0.22 }, 1, 0.6);
  },
  wing() {
    if (!ctx) return;
    noise({ f: 220, q: 0.8, dur: 0.32, type: 'lowpass', gain: 0.35 }, 1, 0.5);
  },
  levelup() {
    if (!ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.14, 1.0, i * 0.09));
  },

  // Animal & Monster vocalizations
  mobSay(type) {
    if (!ctx) return;
    const r = 0.9 + Math.random() * 0.2;
    switch (type) {
      case 'cow': formant(102 * r, 340, 520, 0.75, 'sawtooth', 0.16, 5, 3); break;
      case 'sheep': formant(225 * r, 780, 1050, 0.52, 'sawtooth', 0.13, 26, 18); break;
      case 'chicken':
        tone(680 * r, 0.06, 'triangle', 0.1, 1.25);
        tone(760 * r, 0.07, 'triangle', 0.1, 0.85, 0.09);
        if (Math.random() < 0.5) tone(920 * r, 0.11, 'triangle', 0.11, 1.15, 0.19);
        break;
      case 'pig':
        formant(190 * r, 480, 760, 0.18, 'sawtooth', 0.11);
        if (Math.random() < 0.5) formant(210 * r, 520, 820, 0.16, 'sawtooth', 0.1, 0, 0);
        break;
      case 'zombie': formant(76 * r, 320, 480, 0.65, 'sawtooth', 0.14, 7, 4); break;
      case 'skeleton': boneRattle(0.14, 3); break;
      case 'spider':
        noise({ f: 3400, q: 1.5, dur: 0.18, type: 'highpass', gain: 0.14 }, 1);
        tone(420 * r, 0.07, 'sawtooth', 0.05, 0.7, 0.05);
        break;
      case 'enderman': formant(280 * r, 600, 1200, 0.42, 'sine', 0.12, 16, 35); break;
      case 'piglin': formant(135 * r, 420, 680, 0.26, 'sawtooth', 0.13); break;
      case 'ghast': formant(560 * r, 900, 620, 0.7, 'triangle', 0.14, 6, 15); break;
      case 'blaze':
        tone(880 * r, 0.22, 'triangle', 0.07, 0.85);
        noise({ f: 1800, q: 1.2, dur: 0.3, type: 'bandpass', gain: 0.15 }, 1);
        break;
      case 'dragon':
        formant(58 * r, 180, 340, 0.95, 'sawtooth', 0.26, 8, 5);
        noise({ f: 350, q: 1.0, dur: 0.7, type: 'lowpass', gain: 0.25 }, 1, 0.6);
        break;
      default: break;
    }
  },

  mobHurt(type) {
    if (!ctx) return;
    noise(PROFILES.cloth, 0.55);
    const r = 0.92 + Math.random() * 0.16;
    switch (type) {
      case 'cow': formant(145 * r, 450, 320, 0.42, 'sawtooth', 0.2); break;
      case 'sheep': formant(310 * r, 950, 750, 0.32, 'sawtooth', 0.17, 28, 22); break;
      case 'chicken':
        tone(950 * r, 0.12, 'sawtooth', 0.14, 1.45);
        tone(1180 * r, 0.14, 'triangle', 0.12, 0.65, 0.08);
        break;
      case 'pig': tone(520 * r, 0.22, 'sawtooth', 0.15, 1.45); break;
      case 'skeleton': boneRattle(0.24, 4); break;
      case 'creeper':
        noise({ f: 2600, q: 1.6, dur: 0.18, type: 'bandpass', gain: 0.28 }, 1);
        tone(260 * r, 0.12, 'triangle', 0.12, 0.65);
        break;
      case 'spider':
        noise({ f: 3200, q: 1.8, dur: 0.22, type: 'bandpass', gain: 0.22 }, 1);
        tone(340 * r, 0.14, 'sawtooth', 0.1, 0.55);
        break;
      case 'enderman': formant(440 * r, 1400, 500, 0.35, 'sawtooth', 0.18, 24, 50); break;
      case 'piglin': formant(185 * r, 550, 380, 0.28, 'sawtooth', 0.18); break;
      case 'ghast': formant(780 * r, 1400, 600, 0.45, 'sawtooth', 0.2, 12, 30); break;
      case 'blaze': noise(PROFILES.metal, 0.85, 1.15); break;
      case 'dragon':
        formant(78 * r, 280, 160, 0.55, 'sawtooth', 0.3);
        noise(PROFILES.stone, 0.7, 0.6);
        break;
      default:
        tone(125 * r, 0.3, 'sawtooth', 0.16, 0.7);
        break;
    }
  },

  bird() {
    if (!ctx) return;
    const base = 2200 + Math.random() * 1500;
    for (let i = 0; i < 3; i++) tone(base * (1 + i * 0.08), 0.09, 'sine', 0.03, 1.3, i * 0.11);
  },
};

export function updateAmbient(day, underground, underwater, dim = 'overworld') {
  if (!ctx) return;
  if (!ambient) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    ambient = { f, g };
  }
  const isOther = dim !== 'overworld';
  const target = underwater ? 0.09 : isOther ? 0.045 : underground ? 0.015 : 0.035;
  ambient.g.gain.value += (target - ambient.g.gain.value) * 0.05;
  ambient.f.frequency.value = underwater ? 250 : dim === 'nether' ? 180 : dim === 'end' ? 140 : 500;
  if (!isOther && !underground && !underwater && day > 0.6 && Math.random() < 0.002) sfx.bird();
}
