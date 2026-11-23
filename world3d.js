/* 첫 화면 무대 너머의 3D 세계 (three.js)
   여백은 넓게, 남긴 것은 정교하게: 성 · 달 위의 우주인 · 빛나는 그림책 · 로켓 · 고리 행성 · 지구 · 망원경.
   텍스처는 모두 코드로 그립니다(노이즈로 대륙·구름·성운·돌벽·지붕·나뭇결).
   WebGL이 안 되면 아무것도 하지 않고, index.html의 그림(SVG)이 그대로 보여요. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const host = document.getElementById("scene");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;

/* ---------- 노이즈 (가로로 이어지는 값 노이즈 + fBm) ---------- */
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, period, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const p = period || 1e9, x0 = ((xi % p) + p) % p, x1 = (((xi + 1) % p) + p) % p;
  const a = hash(x0, yi, s), b = hash(x1, yi, s), c = hash(x0, yi + 1, s), d = hash(x1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function fbm(x, y, period, s = 1, oct = 5) {
  let v = 0, amp = .5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, period ? period * f : 0, s + i * 17); norm += amp; amp *= .5; f *= 2; }
  return v / norm;
}
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const sstep = (a, b, t) => smooth(clamp01((t - a) / (b - a)));
function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function lerpCol(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }

function pixTex(w, h, fn, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, gg, b, a = 255] = fn(x / w, y / h, x, y), i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
function drawTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function radial(inner, outer, size = 256) {
  return drawTex(size, size, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function main() {
  if (!host) return;
  const canvas = document.createElement("canvas"); canvas.className = "world3d";
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); } catch { return; }
  host.insertBefore(canvas, host.querySelector(".valance2"));
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;   // 금속·유리의 은은한 반사
  scene.environmentIntensity = .35;

  const BASE_Y = -2.3;
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 400);
  camera.position.set(0, BASE_Y, 30);

  /* ---------- 하늘: 성운과 은하수(노이즈로 그린 배경) ---------- */
  const sky = pixTex(1024, 512, (u, v) => {
    const base = lerpCol(hex(0x07041c), hex(0x2a1b63), sstep(0, 1, v));
    const low = lerpCol(base, hex(0x5a3794), sstep(.55, 1, v));
    const n1 = fbm(u * 3, v * 2, 0, 3, 6), n2 = fbm(u * 5 + 7, v * 3, 0, 9, 5);
    const pink = sstep(.45, .8, n1) * (1 - Math.abs(u - .32) * 1.6);
    const blue = sstep(.5, .82, n2) * sstep(.45, 1, u);
    const band = Math.exp(-Math.pow((v - (.62 - u * .38)) / .09, 2));
    const dust = fbm(u * 14, v * 14, 0, 21, 5);
    let c = low;
    c = lerpCol(c, [214, 92, 205], clamp01(pink) * .55);
    c = lerpCol(c, [86, 132, 247], clamp01(blue) * .45);
    c = lerpCol(c, [228, 214, 255], band * sstep(.35, .75, dust) * .35);
    c = lerpCol(c, [10, 6, 28], band * sstep(.6, .8, fbm(u * 22, v * 22, 0, 33, 4)) * .45);
    return c;
  });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), new THREE.MeshBasicMaterial({ map: sky, depthWrite: false }));
  skyPlane.position.set(0, 4, -90); scene.add(skyPlane);
  scene.background = new THREE.Color(0x07041c);

  const starTex = radial("rgba(255,255,255,1)", "rgba(255,255,255,0)", 64);
  const starLayers = [[1400, .22, 0xffffff], [420, .42, 0xdfe7ff], [90, .8, 0xfff0c8]].map(([n, size, color]) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - .5) * 150; pos[i * 3 + 1] = (rnd() - .3) * 80; pos[i * 3 + 2] = -30 - rnd() * 45; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: starTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(p); return p;
  });

  /* ---------- 빛 ---------- */
  scene.add(new THREE.HemisphereLight(0xa995ff, 0x24133f, .9));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.9); key.position.set(-12, 16, 20);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0004; key.shadow.normalBias = .03;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 70 });
  key.target.position.set(-6.4, -6.5, 2); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7fb8ff, 1.4); rim.position.set(16, 6, -8); scene.add(rim);
  const bookLight = new THREE.PointLight(0xffc46a, 9, 12, 1.8); bookLight.position.set(0, -4.4, 7.2); scene.add(bookLight);

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: 0, ...o });
  const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .35, metalness: 0, clearcoat: .6, clearcoatRoughness: .25, ...o });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const glowSprite = (color, x, y, z, sx, sy, parent = scene, op = 1) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(color, "rgba(0,0,0,0)"), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
    s.position.set(x, y, z); s.scale.set(sx, sy, 1); parent.add(s); return s;
  };
  const atmosphere = (r, color, power = 3, strength = 1.2) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, p: { value: power }, s: { value: strength } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; uniform float p; uniform float s; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-max(dot(vN,vV),0.), p)*s; gl_FragColor = vec4(c*f, f); }",
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  }));

  /* ========== 지구 ========== */
  const LAND = .53;
  const earthField = (u, v) => fbm(u * 6, v * 3, 6, 5, 6) + (Math.abs(v - .5) > .38 ? -.08 : 0);
  const earthMap = pixTex(1024, 512, (u, v) => {
    const n = earthField(u, v), lat = Math.abs(v - .5) * 2;
    if (lat > .86 + fbm(u * 20, v * 10, 20, 8, 3) * .08) return [238, 244, 250];
    if (n < LAND) {
      const shallow = sstep(LAND - .06, LAND, n);
      return lerpCol(lerpCol(hex(0x0c2e78), hex(0x1d5fc4), sstep(.3, LAND, n)), hex(0x3fa6d8), shallow * .7);
    }
    const k = fbm(u * 40, v * 20, 40, 12, 4), dry = sstep(.2, .45, 1 - lat) * sstep(.55, .75, fbm(u * 9, v * 5, 9, 14, 3));
    let c = lerpCol(hex(0x3f8f46), hex(0x2a6a37), k);
    c = lerpCol(c, hex(0xc8a86a), dry * .7);
    c = lerpCol(c, hex(0x8d8f7a), sstep(LAND + .12, LAND + .2, n) * .6);
    return c;
  });
  const earthRough = pixTex(512, 256, (u, v) => { const g = earthField(u, v) < LAND ? 60 : 225; return [g, g, g]; }, false);
  const cloudMap = pixTex(1024, 512, (u, v) => {
    const n = fbm(u * 7 + 3, v * 3.5, 7, 41, 6), a = sstep(.6, .85, n) * 235;
    return [255, 255, 255, a];
  });
  const earthG = new THREE.Group(); earthG.position.set(11.4, -5.6, -2); earthG.rotation.z = .41; scene.add(earthG);
  const earth = add(new THREE.SphereGeometry(3.6, 96, 64), std(0xffffff, { map: earthMap, roughnessMap: earthRough, roughness: 1, metalness: 0 }), 0, 0, 0, earthG);
  const clouds = add(new THREE.SphereGeometry(3.66, 96, 64), std(0xffffff, { map: cloudMap, transparent: true, depthWrite: false, roughness: 1 }), 0, 0, 0, earthG);
  earthG.add(atmosphere(3.95, 0x6fb6ff, 2.6, 1.3));

  /* ========== 고리 행성 ========== */
  const bandMap = pixTex(1024, 512, (u, v) => {
    const t = v * 22 + (fbm(u * 6, v * 30, 6, 51, 4) - .5) * 2.2;
    const pal = [hex(0xc9a3f2), hex(0xe9cdfa), hex(0xa77be0), hex(0xf3d9c9), hex(0xb48ce8), hex(0xdcb6f5)];
    const i = Math.floor(((t % pal.length) + pal.length) % pal.length), f = t - Math.floor(t);
    const c = lerpCol(pal[i], pal[(i + 1) % pal.length], smooth(f));
    const storm = Math.exp(-(Math.pow((u - .3) / .04, 2) + Math.pow((v - .62) / .025, 2)));
    return lerpCol(c, hex(0xf6e6ff), storm * .8);
  });
  const ringMap = pixTex(512, 4, (u) => {
    const gap = 1 - Math.exp(-Math.pow((u - .58) / .025, 2)) * .95;
    const fine = .65 + .35 * Math.sin(u * 140) * Math.sin(u * 37);
    const a = sstep(0, .06, u) * sstep(1, .9, u) * gap * fine * 220;
    const c = lerpCol(hex(0xf6dcff), hex(0xd2b0f0), u);
    return [c[0], c[1], c[2], a];
  });
  const ringed = new THREE.Group(); ringed.position.set(-14.5, 5.6, -9); ringed.rotation.set(.32, 0, -.28); scene.add(ringed);
  const planet = add(new THREE.SphereGeometry(2, 96, 64), std(0xffffff, { map: bandMap, roughness: .75 }), 0, 0, 0, ringed);
  const ringGeo = new THREE.RingGeometry(2.7, 4.6, 160, 1);
  { const p = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v3 = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v3.fromBufferAttribute(p, i); uv.setXY(i, (v3.length() - 2.7) / 1.9, .5); } }
  const ring = add(ringGeo, new THREE.MeshStandardMaterial({ map: ringMap, side: THREE.DoubleSide, transparent: true, depthWrite: false, roughness: .6 }), 0, 0, 0, ringed);
  ring.rotation.x = Math.PI / 2 - .12;
  ringed.add(atmosphere(2.15, 0xe2b8ff, 3, .9));

  const ice = add(new THREE.SphereGeometry(.7, 64, 32), std(0xffffff, { map: pixTex(256, 128, (u, v) => lerpCol(hex(0x9fd6ff), hex(0xeaf6ff), fbm(u * 8, v * 4, 8, 61, 5))), roughness: .5 }), 15.2, 7.6, -10);
  const iceAtmo = atmosphere(.76, 0xaee0ff, 2.5, 1); iceAtmo.position.copy(ice.position); scene.add(iceAtmo);

  /* ========== 달 바위 + 우주인 ========== */
  const rockGeo = new THREE.SphereGeometry(1, 128, 64);
  { const p = rockGeo.attributes.position, uv = rockGeo.attributes.uv, v3 = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v3.fromBufferAttribute(p, i); const u = uv.getX(i), w = uv.getY(i);
      v3.multiplyScalar(1 + (fbm(u * 8, w * 4, 8, 71, 5) - .5) * .28);
      p.setXYZ(i, v3.x, v3.y, v3.z);
    } rockGeo.computeVertexNormals(); }
  const craters = []; for (let i = 0; i < 26; i++) craters.push([rnd(), .25 + rnd() * .5, .01 + rnd() * .035]);
  const craterF = (u, v) => {
    let h = 0;
    for (const [cu, cv, r] of craters) { const d = Math.hypot((u - cu) * 2, v - cv) / r; if (d < 1.4) h += d < 1 ? -(1 - d * d) * .6 : (1.4 - d) * .9; }
    return h;
  };
  const rockMap = pixTex(1024, 512, (u, v) => { const n = fbm(u * 30, v * 15, 30, 81, 5), c = craterF(u, v); return lerpCol(hex(0x6e6890), hex(0xa8a2c6), clamp01(n + c * .25)); });
  const rockBump = pixTex(1024, 512, (u, v) => { const g = clamp01(.5 + craterF(u, v) * .5 + (fbm(u * 60, v * 30, 60, 91, 4) - .5) * .3) * 255; return [g, g, g]; }, false);
  const rock = add(rockGeo, std(0xffffff, { map: rockMap, bumpMap: rockBump, bumpScale: 2.2, roughness: .95 }), -6.4, -8.6, 1.4);
  rock.scale.set(4.4, 1.7, 3); rock.receiveShadow = true;

  const astro = new THREE.Group(); astro.position.set(-6.25, -7.0, 3.3); astro.rotation.y = .42; scene.add(astro);
  const suit = phys(0xdcd8e6, { roughness: .62, clearcoat: .15 });
  const trim = std(0xa8adbd, { metalness: .85, roughness: .3 });
  const shade = std(0x8e93a6, { roughness: .7 });
  const cast = m => { m.castShadow = true; return m; };
  cast(add(new THREE.CapsuleGeometry(.48, .5, 12, 24), suit, 0, .62, 0, astro));
  cast(add(new RoundedBoxGeometry(.62, .42, .2, 4, .06), std(0xdcdde6, { roughness: .5 }), 0, .72, .4, astro));
  [[-.16, 0xe2345b], [0, 0x5fdc7a], [.16, 0x76bceb]].forEach(([x, c]) => { add(new THREE.CylinderGeometry(.045, .045, .04, 16), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .9 }), x, .78, .51, astro).rotation.x = Math.PI / 2; });
  add(new THREE.BoxGeometry(.36, .06, .02), std(0x2a2f45), 0, .64, .51, astro);
  cast(add(new RoundedBoxGeometry(.82, .92, .38, 4, .08), shade, 0, .78, -.48, astro));
  add(new THREE.TorusGeometry(.36, .07, 16, 48), trim, 0, 1.13, 0, astro).rotation.x = Math.PI / 2;
  cast(add(new THREE.SphereGeometry(.64, 64, 48), phys(0xe8e5f0, { roughness: .2, clearcoat: 1 }), 0, 1.55, 0, astro));
  add(new THREE.SphereGeometry(.655, 64, 48, Math.PI / 2 - .78, 1.56, .8, 1.0), new THREE.MeshPhysicalMaterial({ color: 0x9a6418, metalness: 1, roughness: .1, clearcoat: 1, envMapIntensity: 2.2, emissive: 0x2a1404 }), 0, 1.55, 0, astro);
  add(new THREE.SphereGeometry(.648, 64, 48, Math.PI / 2 - .88, 1.76, .72, 1.16), trim, 0, 1.55, 0, astro);
  [-.22, .22].forEach(x => {
    const thigh = cast(add(new THREE.CapsuleGeometry(.2, .42, 8, 16), suit, x, .14, .32, astro)); thigh.rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(.2, .045, 12, 32), shade, x, .14, .62, astro);
    cast(add(new THREE.CapsuleGeometry(.19, .4, 8, 16), suit, x, -.2, .66, astro));
    cast(add(new RoundedBoxGeometry(.3, .24, .44, 4, .07), std(0x6f7488, { roughness: .8 }), x, -.6, .74, astro));
  });
  const armL = new THREE.Group(); armL.position.set(-.56, .92, 0); armL.rotation.set(.5, 0, .38); astro.add(armL);
  cast(add(new THREE.CapsuleGeometry(.16, .5, 8, 16), suit, 0, -.38, 0, armL));
  add(new THREE.TorusGeometry(.16, .04, 12, 32), shade, 0, -.66, 0, armL).rotation.x = Math.PI / 2;
  cast(add(new THREE.SphereGeometry(.17, 24, 16), std(0x9aa0b4, { roughness: .6 }), 0, -.8, 0, armL));
  const armR = new THREE.Group(); armR.position.set(.56, .92, 0); astro.add(armR);
  cast(add(new THREE.CapsuleGeometry(.16, .5, 8, 16), suit, 0, .38, 0, armR));
  add(new THREE.TorusGeometry(.16, .04, 12, 32), shade, 0, .66, 0, armR).rotation.x = Math.PI / 2;
  cast(add(new THREE.SphereGeometry(.17, 24, 16), std(0x9aa0b4, { roughness: .6 }), 0, .8, 0, armR));
  add(new THREE.PlaneGeometry(.2, .13), new THREE.MeshStandardMaterial({ color: 0x3b6fd8, side: THREE.DoubleSide }), -.47, .98, .18, astro).rotation.y = -.9;

  /* ========== 성 ========== */
  const stone = pixTex(512, 512, (u, v, x, y) => {
    const row = Math.floor(y / 32), off = row % 2 ? 32 : 0, bx = Math.floor((x + off) / 64);
    const mx = (x + off) % 64, my = y % 32, mortar = mx < 3 || my < 3;
    const tone = hash(bx, row, 3) * .18 + fbm(u * 24, v * 24, 0, 101, 3) * .2;
    return mortar ? [150, 128, 108] : lerpCol(hex(0xdcc3a2), hex(0xb89a76), tone + .1);
  });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  const stoneBump = pixTex(512, 512, (u, v, x, y) => {
    const row = Math.floor(y / 32), off = row % 2 ? 32 : 0, mx = (x + off) % 64, my = y % 32;
    const g = (mx < 3 || my < 3) ? 40 : 200 + fbm(u * 40, v * 40, 0, 111, 3) * 55; return [g, g, g];
  }, false);
  stoneBump.wrapS = stoneBump.wrapT = THREE.RepeatWrapping;
  const roofTex = pixTex(256, 256, (u, v, x, y) => {
    const row = Math.floor(y / 16), off = row % 2 ? 8 : 0, cx = ((x + off) % 16) - 8, cy = y % 16;
    const edge = Math.hypot(cx, cy - 2) > 9.5;
    const c = lerpCol(hex(0x8c6be0), hex(0x5d3fb3), cy / 16 + hash(Math.floor((x + off) / 16), row, 7) * .25);
    return edge ? lerpCol(c, [40, 20, 80], .5) : c;
  });
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.repeat.set(4, 3);
  const wallCache = {};
  const wallMat = (rx, ry) => {
    const k = rx.toFixed(2) + "," + ry.toFixed(2); if (wallCache[k]) return wallCache[k];
    const map = stone.clone(), bump = stoneBump.clone(); map.repeat.set(rx, ry); bump.repeat.set(rx, ry); map.needsUpdate = bump.needsUpdate = true;
    return (wallCache[k] = std(0xffffff, { map, bumpMap: bump, bumpScale: 1.4, roughness: .9 }));
  };
  const roofMat = std(0xffffff, { map: roofTex, roughness: .45, metalness: .1, side: THREE.DoubleSide });
  const goldM = std(0xf2c25a, { metalness: .9, roughness: .25 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffc35c });
  const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.closePath(); return new THREE.ShapeGeometry(s, 16); };
  const castle = new THREE.Group(); castle.position.set(-11.6, -4.9, -3); castle.rotation.y = .28; scene.add(castle);
  const merlonGeo = new THREE.BoxGeometry(.22, .3, .22), merlonMat = wallMat(.3, .3);
  const merlons = (w, d, y, step = .42) => {
    for (let x = -w / 2 + step / 2; x <= w / 2; x += step) { add(merlonGeo, merlonMat, x, y, d / 2 - .11, castle); add(merlonGeo, merlonMat, x, y, -d / 2 + .11, castle); }
  };
  const ringMerlons = (parent, r, y, n) => { for (let i = 0; i < n; i++) { const a = i / n * TAU; add(merlonGeo, merlonMat, Math.cos(a) * r, y, Math.sin(a) * r, parent).rotation.y = -a; } };
  add(new THREE.BoxGeometry(4.4, 3.2, 2), wallMat(1.5, 1.1), 0, -1.6, 0, castle);
  merlons(4.4, 2, .15);
  const flags = [];
  const tower = (x, z, r, h, roofH) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); castle.add(g);
    add(new THREE.CylinderGeometry(r, r * 1.04, h, 40), wallMat(1.3 * r, h / 2.6), 0, h / 2 - 3.2, 0, g);
    add(new THREE.CylinderGeometry(r * 1.12, r * 1.12, .18, 40), wallMat(2.4 * r, .2), 0, h - 3.2, 0, g);
    ringMerlons(g, r * 1.02, h - 2.98, Math.round(r * 13));
    add(new THREE.ConeGeometry(r * 1.25, roofH, 40, 1, true), roofMat, 0, h - 3.2 + roofH / 2 + .1, 0, g);
    add(new THREE.SphereGeometry(.09, 16, 12), goldM, 0, h - 3.2 + roofH + .14, 0, g);
    add(new THREE.CylinderGeometry(.025, .025, .9, 8), goldM, 0, h - 3.2 + roofH + .55, 0, g);
    const fg = new THREE.PlaneGeometry(.62, .36, 12, 4); fg.translate(.31, 0, 0);
    const flag = add(fg, new THREE.MeshStandardMaterial({ color: 0xe2345b, side: THREE.DoubleSide, roughness: .7 }), .02, h - 3.2 + roofH + .82, 0, g);
    flag.userData.base = fg.attributes.position.array.slice(); flags.push(flag);
    for (let i = 0; i < 2; i++) add(arch(.26, .46), winMat, 0, h - 4.2 - i * 1.4, r + .01, g);
    return g;
  };
  tower(-2.3, .2, .66, 4.8, 2.1); tower(2.3, .2, .66, 4.8, 2.1); tower(0, -.5, .95, 6.9, 3.1);
  [-1.15, 1.15].forEach(x => add(arch(.3, .55), winMat, x, -1.6, 1.01, castle));
  add(arch(1, 1.5), std(0x4b2c20, { roughness: .8 }), 0, -3.2, 1.01, castle);
  add(new THREE.TorusGeometry(.5, .05, 8, 32, Math.PI), goldM, 0, -2.2, 1.03, castle);
  const castleGlow = glowSprite("rgba(255,190,90,.35)", 0, -1.2, 1.2, 7, 6, castle);

  /* ========== 펼친 그림책 ========== */
  const pageTex = drawTex(512, 256, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, w, 0); l.addColorStop(0, "#f7ecd6"); l.addColorStop(.8, "#eedcb4"); l.addColorStop(1, "#cfae72");
    g.fillStyle = l; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(110,78,40,.42)";
    for (let i = 0; i < 9; i++) { const y = 40 + i * 20; g.fillRect(40, y, (i % 3 === 2 ? .55 : .85) * (w - 120), 4); }
    g.strokeStyle = "rgba(150,110,60,.35)"; g.lineWidth = 3; g.beginPath(); g.arc(w - 90, 80, 34, 0, TAU); g.stroke();
    g.beginPath(); g.arc(w - 78, 70, 30, 0, TAU); g.fillStyle = "#fffaf0"; g.fill();
  });
  const leather = pixTex(256, 256, (u, v) => lerpCol(hex(0x5e1a12), hex(0x8a2c1c), fbm(u * 20, v * 20, 0, 121, 5)));
  const book = new THREE.Group(); book.position.set(0, -7.55, 4.6); book.rotation.x = -1.02; scene.add(book);
  const curl = (side, lift, width, inset) => {
    const g = new THREE.PlaneGeometry(width, 2.5 - inset, 48, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + width / 2; p.setX(i, side * x); p.setZ(i, Math.sin(x / width * Math.PI) * .42 + x * .09 + lift); }
    g.computeVertexNormals(); return g;
  };
  const pageMat = new THREE.MeshStandardMaterial({ map: pageTex, color: 0xc2b090, side: THREE.DoubleSide, roughness: .9, emissive: 0x3a2508, emissiveIntensity: .35 });
  const edgeMat = std(0xb8a684, { roughness: .95, side: THREE.DoubleSide });
  const leatherMat = std(0xffffff, { map: leather, roughness: .6 });
  [-1, 1].forEach(side => {
    for (let k = 0; k < 6; k++) add(curl(side, -k * .035, 3.45 - k * .02, k * .02), k ? edgeMat : pageMat, 0, 0, 0, book);
    add(new RoundedBoxGeometry(3.7, 2.75, .1, 3, .03), leatherMat, side * 1.85, 0, -.26, book);
    add(new THREE.BoxGeometry(3.66, .05, .03), goldM, side * 1.85, 1.31, -.2, book); add(new THREE.BoxGeometry(3.66, .05, .03), goldM, side * 1.85, -1.31, -.2, book);
  });
  add(new THREE.CylinderGeometry(.1, .1, 2.75, 16), std(0x5e1a12), 0, 0, -.25, book);
  add(new THREE.PlaneGeometry(.12, 1.6), new THREE.MeshStandardMaterial({ color: 0xc8193f, side: THREE.DoubleSide }), .25, -1.9, .05, book);
  const rayTex = drawTex(64, 256, (g, w, h) => { const l = g.createLinearGradient(0, h, 0, 0); l.addColorStop(0, "rgba(255,226,150,.9)"); l.addColorStop(1, "rgba(255,226,150,0)"); g.fillStyle = l; g.fillRect(0, 0, w, h); });
  // 빛줄기: 양옆과 위로 부드럽게 사라지는 얇은 판 여러 장
  const beamTex = drawTex(128, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = Math.pow(Math.sin(Math.PI * x / w), 3) * Math.pow(y / h, 1.6), i = (y * w + x) * 4; img.data[i] = 255; img.data[i + 1] = 222; img.data[i + 2] = 150; img.data[i + 3] = a * 255; }
    g.putImageData(img, 0, 0);
  });
  const rays = new THREE.Group(); rays.position.set(0, -3.9, 4.6); scene.add(rays);
  const beams = [];
  for (let i = 0; i < 7; i++) {
    const w = .5 + rnd() * .9, m = new THREE.Mesh(new THREE.PlaneGeometry(w, 5.4), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: .14 }));
    m.position.set((rnd() - .5) * 2.6, 0, (rnd() - .5) * .6); m.rotation.set(0, rnd() * Math.PI, (m.position.x) * -.12); m.userData.ph = rnd() * TAU; rays.add(m); beams.push(m);
  }
  const bookGlow = glowSprite("rgba(255,204,120,1)", 0, -5.6, 2.4, 9, 4.2);

  /* ========== 로켓 ========== */
  const rocket = new THREE.Group(); rocket.position.set(9.4, 2.4, 2); rocket.rotation.z = -.72; scene.add(rocket);
  const hull = phys(0xf5f4fa, { roughness: .28, clearcoat: 1, metalness: .15 });
  const red = phys(0xd81e45, { roughness: .3, clearcoat: 1 });
  const bodyPts = [[0, -1.5], [.46, -1.45], [.64, -1.1], [.72, -.4], [.7, .4], [.6, .95], [.42, 1.35]].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(bodyPts, 64), hull, 0, 0, 0, rocket);
  const nose = []; for (let i = 0; i <= 16; i++) { const t = i / 16; nose.push(new THREE.Vector2(.42 * Math.pow(Math.cos(t * Math.PI / 2), .8), 1.35 + t * 1.05)); }
  add(new THREE.LatheGeometry(nose, 64), red, 0, 0, 0, rocket);
  [-.95, .1, .95].forEach(y => { add(new THREE.TorusGeometry(.705 - Math.abs(y) * .07, .018, 8, 64), std(0xb9bccb, { metalness: .8, roughness: .3 }), 0, y, 0, rocket).rotation.x = Math.PI / 2; });
  add(new THREE.TorusGeometry(.69, .07, 12, 64), red, 0, -1.22, 0, rocket).rotation.x = Math.PI / 2;
  const port = new THREE.Group(); port.position.set(0, .45, .66); rocket.add(port);
  add(new THREE.TorusGeometry(.27, .065, 16, 48), std(0xc7cad6, { metalness: .95, roughness: .2 }), 0, 0, 0, port);
  add(new THREE.SphereGeometry(.25, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x5fb0ff, metalness: .2, roughness: .05, clearcoat: 1, emissive: 0x1d4fa8, emissiveIntensity: .6 }), 0, 0, -.06, port).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(new THREE.SphereGeometry(.022, 8, 6), std(0x9aa0b4, { metalness: .9 }), Math.cos(a) * .35, Math.sin(a) * .35, .02, port); }
  const fin = new THREE.Shape(); fin.moveTo(0, .2); fin.quadraticCurveTo(.5, -.2, .9, -.95); fin.lineTo(.92, -1.35); fin.quadraticCurveTo(.4, -1.05, 0, -1.05); fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: .07, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 2, curveSegments: 16 });
  for (let i = 0; i < 3; i++) { const pv = new THREE.Group(); pv.rotation.y = i * TAU / 3; rocket.add(pv); add(finGeo, red, .6, -.35, -.035, pv); }
  const bell = [[.36, -1.5], [.3, -1.62], [.38, -1.85], [.5, -2.0]].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(bell, 48), std(0x4a4e60, { metalness: .9, roughness: .35, side: THREE.DoubleSide }), 0, 0, 0, rocket);
  const flameTex = drawTex(64, 256, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, "rgba(255,250,220,1)"); l.addColorStop(.35, "rgba(255,190,70,.95)"); l.addColorStop(.75, "rgba(255,90,40,.5)"); l.addColorStop(1, "rgba(255,60,40,0)"); g.fillStyle = l; g.fillRect(0, 0, w, h); });
  const flames = [[.5, 2.4, .9], [.32, 1.6, 1]].map(([r, len, op]) => add(new THREE.CylinderGeometry(r, .05, len, 32, 1, true), new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: op }), 0, -2.0 - len / 2, 0, rocket));
  const engineGlow = glowSprite("rgba(255,180,80,1)", 0, -2.3, 0, 2.6, 2.6, rocket);
  const NE = 70, ePos = new Float32Array(NE * 3), eLife = new Float32Array(NE), eVel = [];
  for (let i = 0; i < NE; i++) { eLife[i] = rnd(); eVel.push(new THREE.Vector3()); ePos[i * 3 + 2] = -999; }
  const exGeo = new THREE.BufferGeometry(); exGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
  scene.add(new THREE.Points(exGeo, new THREE.PointsMaterial({ size: .5, map: radial("rgba(255,220,170,.7)", "rgba(255,200,150,0)", 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(.3, -6.2, 4.9), new THREE.Vector3(1.8, -2.6, 3.8), new THREE.Vector3(5, -.6, 2.8), new THREE.Vector3(8.3, .9, 2.2)]);
  const NS = 220, sp = new Float32Array(NS * 3), sOff = new Float32Array(NS); for (let i = 0; i < NS; i++) sOff[i] = rnd();
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: .26, map: starTex, color: 0xffdd88, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  const NF = 40, fPos = new Float32Array(NF * 3), fSeed = []; for (let i = 0; i < NF; i++) fSeed.push([rnd() * TAU, 1.5 + rnd() * 3, rnd() * 3, .3 + rnd() * .5]);
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
  scene.add(new THREE.Points(ffGeo, new THREE.PointsMaterial({ size: .22, map: starTex, color: 0xfff1b8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  /* ========== 구름 ========== */
  const puff = pixTex(256, 256, (u, v) => {
    const d = Math.hypot(u - .5, v - .5) * 2, n = fbm(u * 6, v * 6, 0, 141, 5);
    const a = sstep(1, .35, d + (n - .5) * .6) * 255, c = lerpCol(hex(0x6b58b0), hex(0xd8ccff), sstep(1, 0, v + (n - .5) * .4));
    return [c[0], c[1], c[2], a];
  });
  const cloudSprites = [];
  [[-16, -10, 6, 7], [-12.5, -10.8, 6.5, 5.5], [-9.6, -11.4, 7, 4.2], [-14.2, -8.6, 5, 4.4], [16, -10, 6, 7], [12.8, -10.8, 6.5, 5.5], [10, -11.4, 7, 4], [14.4, -8.7, 5, 4.2], [-3, -12.6, 8, 5], [3.4, -12.8, 8, 5]]
    .forEach(([x, y, z, s], i) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: .95 }));
      m.position.set(x, y, z); m.scale.set(s * 1.5, s, 1); m.userData = { x, ph: i * 1.7 }; scene.add(m); cloudSprites.push(m);
    });

  /* ---------- 빛번짐 ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .4, .9));
  composer.addPass(new OutputPass());

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 1.5 ? 30 * Math.pow(1.5 / camera.aspect, .72) : 30;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  let tx = 0, ty = 0;
  addEventListener("pointermove", e => { tx = (e.clientX / innerWidth - .5) * 1.4; ty = (e.clientY / innerHeight - .5) * -.9; }, { passive: true });

  const player = document.getElementById("player");
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), jit = new THREE.Vector3();
  let last = 0;
  function frame() {
    if (document.hidden || (player && !player.hidden)) return;   // 영상 볼 때는 쉬어요
    const t = clock.getElapsedTime(), dt = Math.min(t - last, .05) || .016; last = t;
    starLayers.forEach((s, i) => { s.material.opacity = .7 + Math.sin(t * (1.1 + i * .5) + i * 2) * .25; });
    earth.rotation.y = t * .05; clouds.rotation.y = t * .065; planet.rotation.y = t * .09; ice.rotation.y = t * .2;
    rocket.position.y = 2.4 + Math.sin(t * 1.1) * .22; rocket.position.x = 9.4 + Math.sin(t * .7) * .1; rocket.rotation.z = -.72 + Math.sin(t * .9) * .03;
    flames.forEach((f, i) => { const k = 1 + Math.sin(t * 24 + i) * .1 + Math.sin(t * 15 + i * 2) * .07; f.scale.set(k, k, k); });
    engineGlow.material.opacity = .8 + Math.sin(t * 20) * .15;
    rocket.updateMatrixWorld(); dir.set(0, -1, 0).applyQuaternion(rocket.quaternion);
    for (let i = 0; i < NE; i++) {
      eLife[i] += dt * .7;
      if (eLife[i] > 1) {
        eLife[i] = 0; tmp.set((rnd() - .5) * .2, -2.4, (rnd() - .5) * .2); rocket.localToWorld(tmp); ePos.set([tmp.x, tmp.y, tmp.z], i * 3);
        eVel[i].copy(dir).multiplyScalar(2 + rnd() * 1.5).add(jit.set((rnd() - .5) * .6, (rnd() - .5) * .6, 0));
      }
      ePos[i * 3] += eVel[i].x * dt; ePos[i * 3 + 1] += eVel[i].y * dt; ePos[i * 3 + 2] += eVel[i].z * dt;
    }
    exGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NS; i++) {
      const u = (sOff[i] + t * .08) % 1, p = curve.getPoint(u), s = (1 - u) * .45 + .05;
      sp[i * 3] = p.x + Math.sin(i * 12.9 + t * 2) * s; sp[i * 3 + 1] = p.y + Math.cos(i * 7.3 + t * 2) * s; sp[i * 3 + 2] = p.z + Math.sin(i * 3.1) * .2;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NF; i++) { const [a, r, h, s2] = fSeed[i], an = a + t * s2; fPos.set([Math.cos(an) * r, -6.4 + h + Math.sin(t * 1.3 + a) * .4, 4.6 + Math.sin(an) * r * .5], i * 3); }
    ffGeo.attributes.position.needsUpdate = true;
    armR.rotation.z = -2.5 + Math.sin(t * 3.2) * .35; armR.rotation.x = -.2;
    astro.position.y = -7.0 + Math.sin(t * 1.4) * .02;
    flags.forEach((f, k) => { const p = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(x * 9 - t * 5 + k) * .06 * x * 1.6); } p.needsUpdate = true; });
    bookGlow.material.opacity = .22 + Math.sin(t * 1.8) * .05; beams.forEach(b => { b.material.opacity = .1 + Math.sin(t * 1.1 + b.userData.ph) * .05; });
    castleGlow.material.opacity = .25 + Math.sin(t * 2.3) * .05;
    cloudSprites.forEach(c => { c.position.x = c.userData.x + Math.sin(t * .15 + c.userData.ph) * .4; });
    camera.position.x += (tx - camera.position.x) * .04; camera.position.y += (BASE_Y + ty - camera.position.y) * .04;
    camera.lookAt(0, BASE_Y, 0);
    composer.render();
  }
  if (still) addEventListener("resize", () => requestAnimationFrame(frame));
  else renderer.setAnimationLoop(frame);
  frame();
  host.classList.add("has3d");
}

try { main(); } catch (e) { console.warn("3D 무대를 그리지 못해 그림으로 보여요", e); }
