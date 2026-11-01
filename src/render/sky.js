import * as THREE from 'three';
import { CH } from '../world/constants.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.day = 1;
    this.dim = 'overworld';

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9cc8ff, 0x6b5a40, 1.2);
    scene.add(this.hemi);
    this.setShadowQuality('high');

    this.uniforms = { uSunDir: { value: this.sunDir }, uDay: { value: 1 }, uTime: { value: 0 }, uDim: { value: 0 } };
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform float uDay; uniform float uTime; uniform float uDim; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          if (uDim > 1.5) {
            // The End: dark purple void + static cosmic dust/stars
            float neb = sin(d.x * 5.0 + d.z * 3.0) * sin(d.y * 4.0 - d.x * 2.0) * 0.5 + 0.5;
            vec3 col = mix(vec3(0.03, 0.012, 0.055), vec3(0.09, 0.035, 0.14), neb * 0.7);
            vec3 p = floor(d * 220.0);
            float s = hash(p);
            col += vec3(0.75, 0.55, 1.0) * step(0.9965, s) * 0.9;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
            return;
          }
          if (uDim > 0.5) {
            // Nether: deep crimson haze
            float g = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = mix(vec3(0.24, 0.045, 0.03), vec3(0.10, 0.015, 0.015), g);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
            return;
          }
          float h = max(d.y, 0.0);
          vec3 zenD = vec3(0.10,0.30,0.78), horD = vec3(0.55,0.72,0.92);
          vec3 zenN = vec3(0.002,0.004,0.014), horN = vec3(0.012,0.02,0.045);
          vec3 zen = mix(zenN, zenD, uDay), hor = mix(horN, horD, uDay);
          vec3 col = mix(hor, zen, pow(h, 0.45));
          float sd = max(dot(d, uSunDir), 0.0);
          float sunset = clamp(1.0 - abs(uSunDir.y) * 3.0, 0.0, 1.0);
          col += vec3(1.0,0.38,0.10) * pow(sd, 5.0) * sunset * (1.0 - h) * 1.1;
          col += vec3(1.0,0.55,0.25) * pow(1.0 - h, 6.0) * sunset * 0.35 * smoothstep(-0.3,0.3,dot(normalize(d.xz+1e-4), normalize(uSunDir.xz+1e-4)));
          // mie halo + disc
          col += vec3(1.0,0.85,0.6) * pow(sd, 60.0) * 0.6 * smoothstep(-0.1,0.05,uSunDir.y);
          col += vec3(1.0,0.95,0.85) * smoothstep(0.9990, 0.9994, sd) * 6.0 * smoothstep(-0.05,0.02,uSunDir.y);
          float md = dot(d, -uSunDir);
          col += vec3(0.75,0.82,1.0) * smoothstep(0.9993, 0.9995, md) * 1.6;
          col += vec3(0.4,0.5,0.8) * pow(max(md,0.0), 200.0) * 0.25 * (1.0-uDay);
          // stars
          float night = clamp(1.0 - uDay * 1.6, 0.0, 1.0);
          if (night > 0.0) {
            vec3 p = floor(d * 280.0);
            float s = hash(p);
            float tw = 0.7 + 0.3 * sin(uTime * 3.0 + s * 100.0);
            col += vec3(0.9,0.95,1.0) * step(0.9975, s) * night * tw * smoothstep(0.0, 0.25, d.y) * 1.4;
          }
          if (d.y < 0.0) col = hor;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // clouds
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uDay: this.uniforms.uDay, uSunDir: this.uniforms.uSunDir, uCam: { value: new THREE.Vector3() } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime; uniform float uDay; uniform vec3 uSunDir; uniform vec3 uCam; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=vn(p)*a; p*=2.03; a*=0.5; } return s; }
        void main(){
          vec2 p = (vW.xz + vec2(uTime * 2.0, uTime * 0.6)) / 180.0;
          float n = fbm(p);
          float c = smoothstep(0.5, 0.75, n);
          float dist = length(vW.xz - uCam.xz);
          float fade = 1.0 - smoothstep(250.0, 480.0, dist);
          float shade = 0.75 + 0.25 * smoothstep(0.5, 0.9, n);
          vec3 day = vec3(1.0) * shade;
          vec3 sunset = vec3(1.0, 0.65, 0.45) * shade;
          float ss = clamp(1.0 - abs(uSunDir.y) * 3.0, 0.0, 1.0);
          vec3 col = mix(vec3(0.06,0.07,0.1), mix(day, sunset, ss), uDay);
          gl_FragColor = vec4(col, c * fade * 0.85);
          #include <colorspace_fragment>
        }`,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 2;
    scene.add(this.clouds);

    this.fogColor = new THREE.Color();
    this.skyColor = new THREE.Color();
  }

  setDimension(dim) {
    this.dim = dim || 'overworld';
    this.uniforms.uDim.value = this.dim === 'end' ? 2 : this.dim === 'nether' ? 1 : 0;
  }

  setShadowQuality(q) {
    this.quality = q;
    const s = this.sun.shadow;
    if (q === 'off') { this.sun.castShadow = false; return; }
    this.sun.castShadow = true;
    const size = q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024;
    const ext = q === 'ultra' ? 96 : q === 'high' ? 72 : 48;
    if (s.map) { s.map.dispose(); s.map = null; }
    s.mapSize.set(size, size);
    s.camera.left = -ext; s.camera.right = ext; s.camera.top = ext; s.camera.bottom = -ext;
    s.camera.near = 1; s.camera.far = 400;
    s.camera.updateProjectionMatrix();
    this.texel = (ext * 2) / size;
  }

  update(time, camera, underwater) {
    this.dome.position.copy(camera.position);

    if (this.dim === 'nether') {
      this.day = 0.25;
      this.uniforms.uDay.value = 0.25;
      this.sunDir.set(0.3, 0.9, 0.2).normalize();
      this.sun.intensity = 0.45;
      this.sun.color.setRGB(1.0, 0.55, 0.35);
      this.hemi.color.setRGB(0.95, 0.42, 0.28);
      this.hemi.groundColor.setRGB(0.45, 0.14, 0.12);
      this.hemi.intensity = 1.45;
      this.fogColor.setRGB(0.18, 0.035, 0.025);
      this.skyColor.setRGB(0.25, 0.05, 0.03);
      this.clouds.visible = false;
      return;
    }

    if (this.dim === 'end') {
      this.day = 0.35;
      this.uniforms.uDay.value = 0.35;
      this.sunDir.set(0.4, 0.85, 0.3).normalize();
      this.sun.intensity = 1.35;
      this.sun.color.setRGB(0.85, 0.78, 1.0);
      this.hemi.color.setRGB(0.62, 0.54, 0.82);
      this.hemi.groundColor.setRGB(0.28, 0.24, 0.36);
      this.hemi.intensity = 1.25;
      const tgt = camera.position.clone();
      const t = this.texel || 0.1;
      tgt.x = Math.round(tgt.x / t) * t; tgt.y = Math.round(tgt.y / t) * t; tgt.z = Math.round(tgt.z / t) * t;
      this.sun.target.position.copy(tgt);
      this.sun.position.copy(tgt).addScaledVector(this.sunDir, 180);
      this.sun.target.updateMatrixWorld();
      this.fogColor.setRGB(0.055, 0.025, 0.09);
      this.skyColor.setRGB(0.08, 0.04, 0.13);
      this.clouds.visible = false;
      return;
    }

    const a = time * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
    const sy = this.sunDir.y;
    const day = sstep(-0.15, 0.25, sy);
    this.day = day;
    this.uniforms.uDay.value = day;

    // sun / moon light
    const isSun = sy > -0.08;
    const ldir = isSun ? this.sunDir : this.sunDir.clone().negate();
    const sunset = Math.max(0, 1 - Math.abs(sy) * 3);
    if (isSun) {
      const k = sstep(-0.08, 0.2, sy);
      this.sun.intensity = 3.2 * k;
      const c = mix3([1, 0.97, 0.9], [1, 0.55, 0.3], sunset);
      this.sun.color.setRGB(c[0], c[1], c[2]);
    } else {
      this.sun.intensity = 0.35 * sstep(0.0, 0.3, -sy);
      this.sun.color.setRGB(0.6, 0.7, 1.0);
    }
    const hs = mix3([0.06, 0.08, 0.16], [0.55, 0.72, 1.0], day);
    this.hemi.color.setRGB(hs[0], hs[1], hs[2]);
    const hg = mix3([0.03, 0.03, 0.04], [0.42, 0.36, 0.28], day);
    this.hemi.groundColor.setRGB(hg[0], hg[2] !== undefined ? hg[1] : 0.36, hg[2]);
    this.hemi.intensity = 1.0 + day * 0.6;

    // shadow camera follows player (texel snapped)
    const tgt = camera.position.clone();
    const t = this.texel || 0.1;
    tgt.x = Math.round(tgt.x / t) * t; tgt.y = Math.round(tgt.y / t) * t; tgt.z = Math.round(tgt.z / t) * t;
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).addScaledVector(ldir, 180);
    this.sun.target.updateMatrixWorld();

    // fog = horizon color
    const hor = mix3([0.012, 0.02, 0.045], [0.55, 0.72, 0.92], day);
    const sc = [hor[0] + 0.35 * sunset * day, hor[1] + 0.12 * sunset * day, hor[2] - 0.05 * sunset * day];
    this.fogColor.setRGB(sc[0], sc[1], sc[2]);
    const sk = mix3([0.02, 0.03, 0.06], [0.35, 0.55, 0.9], day);
    this.skyColor.setRGB(sk[0], sk[1], sk[2]);

    this.clouds.position.set(camera.position.x, CH + 24, camera.position.z);
    this.clouds.material.uniforms.uCam.value.copy(camera.position);
    this.clouds.visible = !underwater;
  }
}
