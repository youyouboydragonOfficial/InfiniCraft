// Synthesized sound effects (WebAudio, no assets)
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

function noise(p, vol = 1, rate = 1) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = p.type; f.frequency.value = p.f * (0.85 + Math.random() * 0.3); f.Q.value = p.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain * vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 1.5); src.stop(t + p.dur + 0.05);
  if (p.tone) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = p.tone * (0.9 + Math.random() * 0.2);
    const og = ctx.createGain(); og.gain.setValueAtTime(p.gain * vol * 0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + p.dur * 0.8);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + p.dur);
  }
}

function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  break(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: p.dur * 1.8 }, 1.2); noise(p, 0.7, 0.7); },
  hit(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: 0.06 }, 0.35); },
  place(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise(p, 0.9, 0.8); },
  step(sound) { if (!ctx) return; const p = PROFILES[sound] || PROFILES.stone; noise({ ...p, dur: 0.08 }, 0.35); },
  hurt() { if (!ctx) return; tone(220, 0.25, 'sawtooth', 0.15, 0.6); noise(PROFILES.cloth, 0.6); },
  pop() { if (!ctx) return; tone(600 + Math.random() * 400, 0.08, 'sine', 0.15, 1.8); },
  eat() { if (!ctx) return; for (let i = 0; i < 3; i++) setTimeout(() => noise({ ...PROFILES.gravel, dur: 0.08 }, 0.5, 1.4), i * 120); },
  splash() { if (!ctx) return; noise({ f: 1200, q: 0.4, dur: 0.6, type: 'lowpass', gain: 0.5 }, 1); },
  click() { if (!ctx) return; tone(1200, 0.04, 'square', 0.05); },
  mobHurt(type) { if (!ctx) return; type === 'pig' ? tone(500, 0.2, 'sawtooth', 0.12, 1.4) : tone(120, 0.35, 'sawtooth', 0.15, 0.7); },
  mobSay(type) { if (!ctx) return; type === 'pig' ? tone(380, 0.18, 'sawtooth', 0.06, 1.3) : tone(90, 0.6, 'sawtooth', 0.07, 0.8); },
  bird() {
    if (!ctx) return;
    const base = 2200 + Math.random() * 1500;
    for (let i = 0; i < 3; i++) setTimeout(() => tone(base * (1 + i * 0.08), 0.09, 'sine', 0.03, 1.3), i * 110);
  },
};

export function updateAmbient(day, underground, underwater) {
  if (!ctx) return;
  if (!ambient) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    ambient = { f, g };
  }
  const target = underwater ? 0.09 : underground ? 0.015 : 0.035;
  ambient.g.gain.value += (target - ambient.g.gain.value) * 0.05;
  ambient.f.frequency.value = underwater ? 250 : 500;
  if (!underground && !underwater && day > 0.6 && Math.random() < 0.002) sfx.bird();
}
