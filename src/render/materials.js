import * as THREE from 'three';

export function createMaterials(atlas) {
  const shared = {
    uAtlas: { value: atlas },
    uTime: { value: 0 },
    uDay: { value: 1 },
    uMinLight: { value: 0.05 },
    uSkyColor: { value: new THREE.Color(0.5, 0.7, 1.0) },
  };

  const terrainVertex = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aData; attribute vec2 aUv; attribute vec3 aTint;
        uniform float uTime;
        varying vec3 vTerr; varying vec2 vTUv; varying float vLayer; varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float layer = aData.x; float sway = 0.0;
        if (layer >= 999.5) { layer -= 1000.0; sway = 1.0; }
        vLayer = layer; vTUv = aUv; vTerr = aData.yzw; vTint = pow(aTint, vec3(2.2));
        if (sway > 0.5) {
          vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
          float ph = wp0.x * 0.7 + wp0.z * 0.55 + wp0.y * 0.3;
          transformed.x += sin(uTime * 1.7 + ph) * 0.045 + sin(uTime * 3.1 + ph * 1.7) * 0.015;
          transformed.z += cos(uTime * 1.3 + ph) * 0.04;
        }`);
  };

  const terrainFragment = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uAtlas; uniform float uDay; uniform float uMinLight;
        varying vec3 vTerr; varying vec2 vTUv; varying float vLayer; varying vec3 vTint;`)
      .replace('#include <map_fragment>', `
        vec4 texel = texture(uAtlas, vec3(vTUv, floor(vLayer + 0.5)));
        diffuseColor *= texel;
        diffuseColor.rgb *= vTint;`)
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `
        float skyL = vTerr.x / 15.0;
        float blkL = vTerr.y / 15.0;
        float ao = vTerr.z;
        float skyF = skyL * skyL;
        float sunMask = smoothstep(0.55, 0.95, skyL);
        vec3 torch = vec3(1.0, 0.72, 0.42) * pow(blkL, 1.8) * 1.35 * (1.0 - skyF * uDay * 0.6);
        vec3 outgoingLight = reflectedLight.directDiffuse * sunMask * mix(0.75, 1.0, ao)
                           + reflectedLight.indirectDiffuse * mix(uMinLight, 1.0, skyF) * ao
                           + diffuseColor.rgb * torch * ao
                           + diffuseColor.rgb * (0.012 + uMinLight * 0.16) * ao;`);
  };

  const make = (opts) => {
    const m = new THREE.MeshLambertMaterial(Object.assign({ alphaTest: 0.5 }, opts));
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared);
      terrainVertex(shader);
      terrainFragment(shader);
    };
    return m;
  };

  const solid = make({ side: THREE.FrontSide });
  const plants = make({ side: THREE.DoubleSide });
  plants.customProgramCacheKey = () => 'plants';
  solid.customProgramCacheKey = () => 'solid';

  // ---- water ----
  const water = new THREE.MeshPhongMaterial({
    color: new THREE.Color(0.06, 0.24, 0.36), transparent: true, opacity: 0.8,
    shininess: 160, specular: new THREE.Color(0.9, 0.9, 0.85), side: THREE.DoubleSide, depthWrite: false,
  });
  water.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aData; uniform float uTime; varying vec3 vWPos; varying vec2 vWL;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpw = modelMatrix * vec4(transformed, 1.0);
        if (aData.x > 0.5) {
          transformed.y += (sin(wpw.x * 0.9 + uTime * 1.6) * 0.5 + sin(wpw.z * 0.7 + uTime * 1.25) * 0.5) * 0.045 - 0.03;
        }
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWL = aData.yz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uDay; uniform vec3 uSkyColor; varying vec3 vWPos; varying vec2 vWL;
        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          g += vec2(0.9, 0.0) * cos(p.x * 0.9 + t * 1.6) * 0.5;
          g += vec2(0.0, 0.7) * cos(p.y * 0.7 + t * 1.25) * 0.5;
          vec2 d1 = normalize(vec2(0.8, 0.6)); float k1 = 2.3; g += d1 * k1 * cos(dot(p, d1) * k1 + t * 2.4) * 0.12;
          vec2 d2 = normalize(vec2(-0.5, 0.85)); float k2 = 3.7; g += d2 * k2 * cos(dot(p, d2) * k2 + t * 3.1) * 0.07;
          vec2 d3 = normalize(vec2(0.2, -0.95)); float k3 = 6.1; g += d3 * k3 * cos(dot(p, d3) * k3 + t * 4.3) * 0.035;
          vec2 d4 = normalize(vec2(-0.9, -0.3)); float k4 = 9.3; g += d4 * k4 * cos(dot(p, d4) * k4 + t * 5.7) * 0.018;
          return g;
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          vec3 wn = vec3(0.0, 1.0, 0.0);
          if (abs(vNormal.y) > 0.0 || true) {
            vec2 g = waveGrad(vWPos.xz, uTime) * 0.09;
            vec3 pn = normalize(vec3(-g.x, 1.0, -g.y));
            vec3 vn = normalize((viewMatrix * vec4(pn, 0.0)).xyz);
            float up = abs(dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)));
            normal = normalize(mix(normal, vn * sign(dot(normal, vn) + 0.0001), up));
          }
        }`)
      .replace('#include <opaque_fragment>', `
        vec3 V = normalize(vViewPosition);
        float fres = pow(1.0 - clamp(abs(dot(V, normal)), 0.0, 1.0), 4.0);
        float wsky = clamp(vWL.x / 15.0, 0.0, 1.0);
        float wblk = clamp(vWL.y / 15.0, 0.0, 1.0);
        outgoingLight *= mix(0.12, 1.0, wsky * wsky);
        outgoingLight += uSkyColor * fres * 0.8 * wsky * wsky;
        outgoingLight += vec3(1.0, 0.7, 0.4) * diffuseColor.rgb * wblk * wblk * 1.5;
        diffuseColor.a = mix(0.72, 0.97, fres);
        #include <opaque_fragment>`);
  };
  water.customProgramCacheKey = () => 'water';

  return { solid, plants, water, shared };
}
