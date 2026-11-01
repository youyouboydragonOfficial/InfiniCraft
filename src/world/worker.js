import { Generator } from './generator.js';
import { buildMesh } from './mesher.js';
import { CS } from './constants.js';

let gen = null;

function tintGrid(cx, cz) {
  const g = new Float32Array((CS + 1) * (CS + 1) * 3);
  for (let z = 0; z <= CS; z++) for (let x = 0; x <= CS; x++) {
    const c = gen.grassColor(cx * CS + x, cz * CS + z);
    const k = (x + z * (CS + 1)) * 3;
    g[k] = c[0]; g[k + 1] = c[1]; g[k + 2] = c[2];
  }
  return g;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    gen = new Generator(m.seed, m.dim || 'overworld');
  } else if (m.type === 'gen') {
    const data = gen.generate(m.cx, m.cz);
    self.postMessage({ type: 'gen', key: m.key, data }, [data.buffer]);
  } else if (m.type === 'mesh') {
    const r = buildMesh(m.vol, tintGrid(m.cx, m.cz));
    const tr = [];
    for (const p of ['solid', 'plants', 'water']) for (const k in r[p]) if (r[p][k].buffer) tr.push(r[p][k].buffer);
    self.postMessage({ type: 'mesh', key: m.key, version: m.version, r }, tr);
  }
};
