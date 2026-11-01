// Procedural sound synthesis engine (OfflineAudioContext -> WAV Blob -> pooled HTMLAudioElement).
// Uses OfflineAudioContext + HTMLAudioElement instead of live AudioContext because Chromium/Electron
// on some multi-driver Windows 11 systems freezes live AudioContext.currentTime at 0 while <audio> works reliably.

const SR = 32000;
const NOISE_SEC = 3;
const noiseData = new Float32Array(SR * NOISE_SEC);
for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
// Crossfade tail of noiseData so looping ambient buffers have zero click at seam
const fadeN = Math.floor(SR * 0.08);
for (let i = 0; i < fadeN; i++) {
  const k = i / fadeN;
  const endIdx = noiseData.length - fadeN + i;
  noiseData[endIdx] = noiseData[endIdx] * (1 - k) + noiseData[i] * k;
}

let volume = 0.7;
let currentSinkId = '';
const cache = new Map();     // key -> string (objectURL) | Promise<string>
const pool = [];             // reusable HTMLAudioElements (capped at MAX_VOICES)
const MAX_VOICES = 24;
let warmed = false;

let ambientEl = null;
let ambientKind = '';
let ambientGain = 0;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function encodeWav(audioBuffer) {
  const pcm = audioBuffer.getChannelData(0);
  const len = pcm.length;
  const ab = new ArrayBuffer(44 + len * 2);
  const dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF');
  dv.setUint32(4, 36 + len * 2, true);
  ws(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, 'data');
  dv.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    // Soft clip so layered explosions / resonances stay punchy without harsh digital clipping
    const s = Math.tanh(pcm[i] * 1.15);
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
}

function makeNoiseBuffer(ctx) {
  const b = ctx.createBuffer(1, noiseData.length, SR);
  b.getChannelData(0).set(noiseData);
  return b;
}

function getClip(key, dur, buildFn) {
  const hit = cache.get(key);
  if (hit) return hit;
  const frames = Math.max(256, Math.ceil((dur + 0.06) * SR));
  const off = new OfflineAudioContext(1, frames, SR);
  const nb = makeNoiseBuffer(off);
  buildFn(off, off.destination, nb);
  const p = off.startRendering().then((rendered) => {
    const url = encodeWav(rendered);
    cache.set(key, url);
    return url;
  }).catch(() => '');
  cache.set(key, p);
  return p;
}

function allocVoice() {
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (a.paused || a.ended) return a;
  }
  if (pool.length < MAX_VOICES) {
    const a = new Audio();
    a.preload = 'auto';
    if ('preservesPitch' in a) a.preservesPitch = false;
    else if ('webkitPreservesPitch' in a) a.webkitPreservesPitch = false;
    if (currentSinkId && a.setSinkId) a.setSinkId(currentSinkId).catch(() => {});
    pool.push(a);
    return a;
  }
  // Steal oldest / furthest-along voice
  let best = pool[0], bestProg = -1;
  for (const a of pool) {
    const prog = a.duration ? a.currentTime / a.duration : 0;
    if (prog > bestProg) { bestProg = prog; best = a; }
  }
  return best;
}

function triggerUrl(url, gain = 1, rate = 1) {
  if (!url || volume <= 0.001) return;
  const a = allocVoice();
  a.src = url;
  if ('preservesPitch' in a) a.preservesPitch = false;
  a.playbackRate = clamp(rate, 0.45, 2.2);
  a.volume = clamp(volume * gain, 0, 1);
  a.currentTime = 0;
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
}

function play(key, dur, buildFn, gain = 1, rate = 1) {
  if (volume <= 0.001) return;
  const clip = getClip(key, dur, buildFn);
  if (typeof clip === 'string') triggerUrl(clip, gain, rate);
  else clip.then((url) => triggerUrl(url, gain, rate));
}

export function resumeAudio() {
  if (!warmed) {
    warmed = true;
    // Pre-warm common sounds asynchronously so first footsteps / clicks are instant
    setTimeout(() => {
      getClip('click', 0.06, (c, d) => addTone(c, d, 1200, 0.04, 'square', 0.14));
      for (const k of Object.keys(PROFILES)) {
        const p = PROFILES[k];
        getClip('step:' + k, 0.14, (c, d, nb) => addNoise(c, d, nb, { ...p, dur: 0.09 }, 0.65));
        getClip('break:' + k, p.dur * 1.9, (c, d, nb) => {
          addNoise(c, d, nb, { ...p, dur: p.dur * 1.8 }, 1.25);
          addNoise(c, d, nb, p, 0.8, 0.72);
        });
      }
    }, 10);
  }
  if (ambientEl && ambientEl.paused && volume > 0.001 && ambientGain > 0.002) {
    ambientEl.play().catch(() => {});
  }
}

export function setVolume(v) {
  volume = clamp(v, 0, 1);
  if (ambientEl) {
    ambientEl.volume = clamp(ambientGain * volume, 0, 1);
    if (volume <= 0.001 && !ambientEl.paused) ambientEl.pause();
    else if (volume > 0.001 && ambientEl.paused && ambientGain > 0.002) ambientEl.play().catch(() => {});
  }
}

export async function setOutputDevice(sinkId) {
  currentSinkId = sinkId || '';
  const all = ambientEl ? [...pool, ambientEl] : [...pool];
  for (const a of all) {
    if (a.setSinkId) {
      try { await a.setSinkId(currentSinkId); } catch (e) { /* ignore invalid sink */ }
    }
  }
}

export async function listOutputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.filter(d => d.kind === 'audiooutput');
  } catch (e) {
    return [];
  }
}

// ---------------- Synthesis building blocks ----------------
const PROFILES = {
  stone: { f: 920, q: 1.2, dur: 0.13, type: 'bandpass', gain: 0.65 },
  wood: { f: 460, q: 2.8, dur: 0.15, type: 'bandpass', gain: 0.75, tone: 185 },
  grass: { f: 2400, q: 0.65, dur: 0.16, type: 'highpass', gain: 0.42 },
  gravel: { f: 1400, q: 0.85, dur: 0.16, type: 'bandpass', gain: 0.55 },
  sand: { f: 2900, q: 0.55, dur: 0.18, type: 'highpass', gain: 0.38 },
  snow: { f: 1850, q: 0.75, dur: 0.18, type: 'bandpass', gain: 0.42 },
  glass: { f: 3400, q: 3.8, dur: 0.26, type: 'bandpass', gain: 0.65, tone: 2400 },
  metal: { f: 2000, q: 5.5, dur: 0.3, type: 'bandpass', gain: 0.55, tone: 1200 },
  cloth: { f: 820, q: 0.55, dur: 0.13, type: 'lowpass', gain: 0.48 },
};

function addNoise(ctx, dest, nb, p, vol = 1, rate = 1, delay = 0, offset = 0.15) {
  const t = delay;
  const src = ctx.createBufferSource();
  src.buffer = nb;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = p.type;
  f.frequency.value = p.f;
  f.Q.value = p.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.001, p.gain * vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, offset % 1.8);
  src.stop(t + p.dur + 0.04);
  if (p.tone) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = p.tone;
    const og = ctx.createGain();
    og.gain.setValueAtTime(p.gain * vol * 0.32, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + p.dur * 0.85);
    o.connect(og); og.connect(dest);
    o.start(t); o.stop(t + p.dur);
  }
}

function addTone(ctx, dest, freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
  const t = delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(22, freq * slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.03);
}

function addFormant(ctx, dest, freq, f1, f2, dur, type = 'sawtooth', vol = 0.38, vibHz = 0, vibAmt = 0, delay = 0) {
  const t = delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.linearRampToValueAtTime(freq * 0.9, t + dur);
  if (vibHz > 0 && vibAmt > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vibHz;
    const lg = ctx.createGain();
    lg.gain.value = vibAmt;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  const flt = ctx.createBiquadFilter();
  flt.type = 'bandpass';
  flt.Q.value = 3.0;
  flt.frequency.setValueAtTime(f1, t);
  flt.frequency.linearRampToValueAtTime(f2, t + dur * 0.58);
  flt.frequency.linearRampToValueAtTime(f1 * 0.85, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.045);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(flt); flt.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.03);
}

function addBoneRattle(ctx, dest, nb, vol = 0.35, count = 3) {
  for (let i = 0; i < count; i++) {
    addNoise(ctx, dest, nb, { f: 1750 + i * 340, q: 6.5, dur: 0.06, type: 'bandpass', gain: vol, tone: 920 + i * 210 }, 1, 1.2, i * 0.048, 0.2 + i * 0.3);
  }
}

const rPitch = (spread = 0.14) => 1 + (Math.random() - 0.5) * spread * 2;

export const sfx = {
  break(sound = 'stone') {
    const k = PROFILES[sound] ? sound : 'stone';
    const p = PROFILES[k];
    play('break:' + k, p.dur * 1.9, (c, d, nb) => {
      addNoise(c, d, nb, { ...p, dur: p.dur * 1.8 }, 1.25, 1, 0, 0.1);
      addNoise(c, d, nb, p, 0.8, 0.72, 0, 0.55);
    }, 0.95, rPitch(0.12));
  },
  hit(sound = 'stone') {
    const k = PROFILES[sound] ? sound : 'stone';
    const p = PROFILES[k];
    play('hit:' + k, 0.1, (c, d, nb) => addNoise(c, d, nb, { ...p, dur: 0.075 }, 0.65, 1, 0, 0.35), 0.75, rPitch(0.14));
  },
  place(sound = 'stone') {
    const k = PROFILES[sound] ? sound : 'stone';
    const p = PROFILES[k];
    play('place:' + k, p.dur + 0.04, (c, d, nb) => addNoise(c, d, nb, p, 1.05, 0.82, 0, 0.7), 0.9, rPitch(0.1));
  },
  step(sound = 'stone') {
    const k = PROFILES[sound] ? sound : 'stone';
    const p = PROFILES[k];
    play('step:' + k, 0.13, (c, d, nb) => addNoise(c, d, nb, { ...p, dur: 0.09 }, 0.65, 1, 0, 0.9), 0.65, rPitch(0.14));
  },
  hurt() {
    play('hurt', 0.28, (c, d, nb) => {
      addTone(c, d, 225, 0.22, 'sawtooth', 0.32, 0.58);
      addNoise(c, d, nb, PROFILES.cloth, 0.85);
    }, 0.95, rPitch(0.08));
  },
  pop() {
    play('pop', 0.12, (c, d) => addTone(c, d, 680, 0.085, 'sine', 0.32, 1.85), 0.85, rPitch(0.22));
  },
  eat() {
    play('eat', 0.38, (c, d, nb) => {
      for (let i = 0; i < 3; i++) addNoise(c, d, nb, { ...PROFILES.gravel, dur: 0.085 }, 0.8, 1.35, i * 0.11, 0.2 * i);
    }, 0.9, rPitch(0.1));
  },
  splash() {
    play('splash', 0.65, (c, d, nb) => {
      addNoise(c, d, nb, { f: 1250, q: 0.45, dur: 0.58, type: 'lowpass', gain: 0.72 }, 1, 0.95);
      addNoise(c, d, nb, { f: 2600, q: 1.1, dur: 0.28, type: 'bandpass', gain: 0.35 }, 1, 1.2, 0.04, 0.6);
    }, 0.95, rPitch(0.08));
  },
  click() {
    play('click', 0.06, (c, d) => addTone(c, d, 1200, 0.04, 'square', 0.14), 0.7, 1);
  },

  // Weapons, tools, TNT & portals
  bow() {
    play('bow', 0.2, (c, d, nb) => {
      addTone(c, d, 310, 0.14, 'triangle', 0.36, 1.75);
      addNoise(c, d, nb, { f: 2200, q: 1.0, dur: 0.13, type: 'bandpass', gain: 0.38 }, 1, 1.3);
    }, 0.95, rPitch(0.1));
  },
  arrowHit() {
    play('arrowHit', 0.14, (c, d, nb) => {
      addTone(c, d, 680, 0.09, 'triangle', 0.32, 0.38);
      addNoise(c, d, nb, { ...PROFILES.wood, dur: 0.08 }, 0.8);
    }, 0.9, rPitch(0.1));
  },
  ignite() {
    play('ignite', 0.36, (c, d, nb) => {
      addNoise(c, d, nb, { f: 4200, q: 4.5, dur: 0.07, type: 'bandpass', gain: 0.65, tone: 2800 }, 1);
      addNoise(c, d, nb, { f: 1450, q: 0.75, dur: 0.28, type: 'bandpass', gain: 0.45 }, 1, 0.9, 0.03, 0.5);
    }, 0.95, rPitch(0.08));
  },
  fuse() {
    play('fuse', 0.96, (c, d, nb) => {
      const src = c.createBufferSource(); src.buffer = nb;
      const flt = c.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 1.4;
      flt.frequency.setValueAtTime(2400, 0);
      flt.frequency.exponentialRampToValueAtTime(4800, 0.85);
      const g = c.createGain();
      g.gain.setValueAtTime(0.03, 0);
      g.gain.linearRampToValueAtTime(0.48, 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, 0.9);
      src.connect(flt); flt.connect(g); g.connect(d);
      src.start(0, 0.2); src.stop(0.93);
    }, 0.95, rPitch(0.06));
  },
  explode(power = 1) {
    play('explode', 1.25, (c, d, nb) => {
      addTone(c, d, 96, 0.68, 'sine', 0.72, 0.24);
      addTone(c, d, 62, 0.9, 'triangle', 0.58, 0.3);
      const src = c.createBufferSource(); src.buffer = nb; src.playbackRate.value = 0.55;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass';
      flt.frequency.setValueAtTime(1050, 0);
      flt.frequency.exponentialRampToValueAtTime(95, 1.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.85, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 1.18);
      src.connect(flt); flt.connect(g); g.connect(d);
      src.start(0, 0.1); src.stop(1.22);
      addNoise(c, d, nb, { f: 2400, q: 0.8, dur: 0.36, type: 'bandpass', gain: 0.42 }, 1, 0.8, 0.03, 0.7);
    }, clamp(0.75 + power * 0.18, 0.7, 1.0), rPitch(0.08));
  },
  bucket(lava = false) {
    if (lava) {
      play('bucket:lava', 0.3, (c, d, nb) => {
        addTone(c, d, 165, 0.25, 'sine', 0.38, 0.65);
        addNoise(c, d, nb, { f: 900, q: 1.5, dur: 0.25, type: 'lowpass', gain: 0.48 }, 1);
      }, 0.9, rPitch(0.08));
    } else {
      play('bucket:water', 0.24, (c, d, nb) => {
        addTone(c, d, 480, 0.12, 'sine', 0.32, 1.7);
        addTone(c, d, 720, 0.1, 'sine', 0.26, 1.4, 0.06);
        addNoise(c, d, nb, { f: 1500, q: 1.2, dur: 0.18, type: 'bandpass', gain: 0.38 }, 1);
      }, 0.9, rPitch(0.08));
    }
  },
  fizz() {
    play('fizz', 0.5, (c, d, nb) => addNoise(c, d, nb, { f: 3200, q: 0.9, dur: 0.45, type: 'bandpass', gain: 0.58 }, 1), 0.9, rPitch(0.08));
  },
  teleport() {
    play('teleport', 0.34, (c, d, nb) => {
      addTone(c, d, 250, 0.28, 'sine', 0.42, 0.28);
      addTone(c, d, 940, 0.18, 'triangle', 0.24, 0.45);
      addNoise(c, d, nb, { f: 1800, q: 2, dur: 0.22, type: 'bandpass', gain: 0.36 }, 1);
    }, 0.95, rPitch(0.1));
  },
  portal() {
    play('portal', 1.15, (c, d, nb) => {
      [220, 330, 440, 587].forEach((f, i) => addTone(c, d, f, 0.9, 'sine', 0.18, 1.05, i * 0.06));
      addNoise(c, d, nb, { f: 520, q: 1.5, dur: 0.95, type: 'bandpass', gain: 0.38 }, 1, 0.6);
    }, 0.95, rPitch(0.05));
  },
  wing() {
    play('wing', 0.36, (c, d, nb) => addNoise(c, d, nb, { f: 230, q: 0.85, dur: 0.32, type: 'lowpass', gain: 0.62 }, 1, 0.5), 0.85, rPitch(0.1));
  },
  levelup() {
    play('levelup', 0.65, (c, d) => {
      [523, 659, 784, 1046].forEach((f, i) => addTone(c, d, f, 0.28, 'triangle', 0.28, 1.0, i * 0.09));
    }, 0.95, 1);
  },

  // Animal & Monster vocalizations
  mobSay(type) {
    play('say:' + type, 1.0, (c, d, nb) => {
      switch (type) {
        case 'cow': addFormant(c, d, 104, 350, 540, 0.76, 'sawtooth', 0.52, 5.5, 4); break;
        case 'sheep': addFormant(c, d, 230, 800, 1080, 0.54, 'sawtooth', 0.44, 26, 18); break;
        case 'chicken':
          addTone(c, d, 690, 0.065, 'triangle', 0.28, 1.25, 0);
          addTone(c, d, 770, 0.075, 'triangle', 0.28, 0.85, 0.09);
          addTone(c, d, 930, 0.11, 'triangle', 0.3, 1.15, 0.19);
          break;
        case 'pig':
          addFormant(c, d, 192, 490, 770, 0.18, 'sawtooth', 0.38, 0, 0, 0);
          addFormant(c, d, 212, 530, 830, 0.16, 'sawtooth', 0.35, 0, 0, 0.21);
          break;
        case 'zombie': addFormant(c, d, 78, 330, 490, 0.66, 'sawtooth', 0.46, 7, 5); break;
        case 'skeleton': addBoneRattle(c, d, nb, 0.38, 3); break;
        case 'creeper': addNoise(c, d, nb, { f: 2800, q: 1.5, dur: 0.25, type: 'bandpass', gain: 0.38 }, 1); break;
        case 'spider':
          addNoise(c, d, nb, { f: 3300, q: 1.5, dur: 0.19, type: 'highpass', gain: 0.34 }, 1);
          addTone(c, d, 420, 0.08, 'sawtooth', 0.16, 0.7, 0.05);
          break;
        case 'enderman': addFormant(c, d, 285, 620, 1240, 0.44, 'sine', 0.4, 16, 35); break;
        case 'piglin': addFormant(c, d, 138, 430, 690, 0.28, 'sawtooth', 0.42); break;
        case 'ghast': addFormant(c, d, 560, 920, 620, 0.72, 'triangle', 0.44, 6, 16); break;
        case 'blaze':
          addTone(c, d, 880, 0.22, 'triangle', 0.2, 0.85);
          addNoise(c, d, nb, { f: 1800, q: 1.2, dur: 0.32, type: 'bandpass', gain: 0.38 }, 1);
          break;
        case 'dragon':
          addFormant(c, d, 60, 190, 350, 0.92, 'sawtooth', 0.68, 8, 6);
          addNoise(c, d, nb, { f: 360, q: 1.0, dur: 0.75, type: 'lowpass', gain: 0.52 }, 1, 0.6);
          break;
        default: addTone(c, d, 220, 0.2, 'sawtooth', 0.25, 0.8); break;
      }
    }, 0.85, rPitch(0.12));
  },

  mobHurt(type) {
    play('hurt:' + type, 0.65, (c, d, nb) => {
      addNoise(c, d, nb, PROFILES.cloth, 0.8);
      switch (type) {
        case 'cow': addFormant(c, d, 148, 460, 320, 0.42, 'sawtooth', 0.55); break;
        case 'sheep': addFormant(c, d, 315, 960, 750, 0.33, 'sawtooth', 0.48, 28, 22); break;
        case 'chicken':
          addTone(c, d, 950, 0.12, 'sawtooth', 0.34, 1.45, 0);
          addTone(c, d, 1180, 0.14, 'triangle', 0.3, 0.65, 0.08);
          break;
        case 'pig': addTone(c, d, 520, 0.22, 'sawtooth', 0.36, 1.45); break;
        case 'skeleton': addBoneRattle(c, d, nb, 0.48, 4); break;
        case 'creeper':
          addNoise(c, d, nb, { f: 2600, q: 1.6, dur: 0.19, type: 'bandpass', gain: 0.5 }, 1, 1, 0, 0.4);
          addTone(c, d, 260, 0.13, 'triangle', 0.28, 0.65);
          break;
        case 'spider':
          addNoise(c, d, nb, { f: 3200, q: 1.8, dur: 0.22, type: 'bandpass', gain: 0.45 }, 1, 1, 0, 0.5);
          addTone(c, d, 340, 0.14, 'sawtooth', 0.24, 0.55);
          break;
        case 'enderman': addFormant(c, d, 440, 1400, 500, 0.36, 'sawtooth', 0.48, 24, 50); break;
        case 'piglin': addFormant(c, d, 185, 550, 380, 0.28, 'sawtooth', 0.46); break;
        case 'ghast': addFormant(c, d, 780, 1400, 600, 0.46, 'sawtooth', 0.5, 12, 30); break;
        case 'blaze': addNoise(c, d, nb, PROFILES.metal, 1.1, 1.15, 0, 0.3); break;
        case 'dragon':
          addFormant(c, d, 80, 290, 165, 0.56, 'sawtooth', 0.68);
          addNoise(c, d, nb, PROFILES.stone, 0.95, 0.6, 0, 0.4);
          break;
        default:
          addTone(c, d, 128, 0.3, 'sawtooth', 0.38, 0.7);
          break;
      }
    }, 0.95, rPitch(0.1));
  },

  bird() {
    play('bird', 0.42, (c, d) => {
      const base = 2600;
      for (let i = 0; i < 3; i++) addTone(c, d, base * (1 + i * 0.08), 0.09, 'sine', 0.1, 1.3, i * 0.11);
    }, 0.65, rPitch(0.2));
  },
};

function getAmbientLoop(kind, freq) {
  return getClip('amb:' + kind, NOISE_SEC - 0.12, (c, d, nb) => {
    const src = c.createBufferSource();
    src.buffer = nb;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = 0.55;
    src.connect(f); f.connect(g); g.connect(d);
    src.start(0, 0);
  });
}

export function updateAmbient(day, underground, underwater, dim = 'overworld') {
  if (!ambientEl) {
    ambientEl = new Audio();
    ambientEl.loop = true;
    ambientEl.volume = 0;
    if (currentSinkId && ambientEl.setSinkId) ambientEl.setSinkId(currentSinkId).catch(() => {});
  }
  const kind = underwater ? 'water' : dim !== 'overworld' ? 'realm' : underground ? 'cave' : 'wind';
  const freq = underwater ? 250 : dim === 'nether' ? 180 : dim === 'end' ? 140 : underground ? 280 : 500;
  if (kind !== ambientKind) {
    ambientKind = kind;
    const clip = getAmbientLoop(kind, freq);
    const apply = (url) => {
      if (!url || ambientKind !== kind) return;
      ambientEl.src = url;
      ambientEl.loop = true;
      if (volume > 0.001) ambientEl.play().catch(() => {});
    };
    if (typeof clip === 'string') apply(clip);
    else clip.then(apply);
  }
  const isOther = dim !== 'overworld';
  const target = underwater ? 0.18 : isOther ? 0.1 : underground ? 0.05 : 0.075;
  ambientGain += (target - ambientGain) * 0.06;
  ambientEl.volume = clamp(ambientGain * volume, 0, 1);
  if (volume > 0.001 && ambientEl.src && ambientEl.paused) {
    ambientEl.play().catch(() => {});
  }
  if (!isOther && !underground && !underwater && day > 0.6 && Math.random() < 0.002) sfx.bird();
}
