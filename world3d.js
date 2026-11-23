/* 첫 화면 무대 너머의 3D 세계 (three.js)
   동화(성, 공룡, 그림책) · 우주(우주인, 로켓, 행성, 지구) · 과학(망원경, 원자)을 한 장면에.
   WebGL이 안 되면 이 파일은 아무것도 하지 않고, index.html의 그림(SVG)이 그대로 보여요. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const host = document.getElementById("scene");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTex(inner, outer) {
  return canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner); r.addColorStop(1, outer);
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function main() {
  if (!host) return;
  const canvas = document.createElement("canvas");
  canvas.className = "world3d";
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch { return; }
  host.insertBefore(canvas, host.querySelector(".valance2"));
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = canvasTex(4, 512, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, 0, h);
    l.addColorStop(0, "#0b0726"); l.addColorStop(.5, "#251a5c"); l.addColorStop(1, "#56368c");
    g.fillStyle = l; g.fillRect(0, 0, w, h);
  });
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 300);
  const BASE_Y = -1.6; camera.position.set(0, BASE_Y, 30);

  // 빛: 보랏빛 하늘 + 왼쪽 위 달빛 + 그림책의 따뜻한 빛
  scene.add(new THREE.HemisphereLight(0xb9a8ff, 0x2a1850, 1.1));
  const key = new THREE.DirectionalLight(0xfff0d5, 2.2); key.position.set(-10, 14, 18); scene.add(key);
  const rim = new THREE.DirectionalLight(0x76bceb, 1.2); rim.position.set(14, 6, -6); scene.add(rim);
  const bookLight = new THREE.PointLight(0xffc857, 26, 18, 1.6); bookLight.position.set(0, -4.6, 6); scene.add(bookLight);

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: 0, ...o });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ---------- 성운과 별 ----------
  const neb = (color, x, y, s) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(color, "rgba(0,0,0,0)"), blending: THREE.AdditiveBlending, depthWrite: false, opacity: .55 }));
    sp.position.set(x, y, -40); sp.scale.set(s, s * .55, 1); scene.add(sp);
  };
  neb("rgba(212,87,216,.9)", -10, 4, 70); neb("rgba(79,134,247,.8)", 16, 7, 70); neb("rgba(160,110,255,.7)", 0, -10, 80);
  const starTex = glowTex("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const starSets = [0, 1].map(k => {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - .5) * 130; pos[i * 3 + 1] = (rnd() - .35) * 70; pos[i * 3 + 2] = -20 - rnd() * 40; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: k ? .55 : .35, map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: k ? 0xfff3c4 : 0xffffff });
    const p = new THREE.Points(g, m); scene.add(p); return p;
  });

  // ---------- 작은 토성 ----------
  const mini = new THREE.Group(); mini.position.set(-8.6, 6.4, -6); scene.add(mini);
  add(new THREE.SphereGeometry(.6, 32, 16), std(0xf0a35a, { roughness: .7 }), 0, 0, 0, mini);
  const miniRing = add(new THREE.RingGeometry(.85, 1.15, 48), new THREE.MeshBasicMaterial({ color: 0xffe1b0, side: THREE.DoubleSide, transparent: true, opacity: .8 }), 0, 0, 0, mini);
  miniRing.rotation.set(1.2, .3, 0);

  // ---------- 고리 행성 ----------
  const ringed = new THREE.Group(); ringed.position.set(13.2, 6.4, -6); scene.add(ringed);
  const bands = canvasTex(256, 128, (g, w, h) => {
    const cols = ["#b98ff0", "#d8b4ff", "#9a6be0", "#e9c9ff", "#a77be8", "#c79cf5"];
    for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(0, i * h / 16, w, h / 16 + 1); }
  });
  const planet = add(new THREE.SphereGeometry(1.9, 64, 32), std(0xffffff, { map: bands, roughness: .65 }), 0, 0, 0, ringed);
  const ring = add(new THREE.RingGeometry(2.6, 4.1, 96), new THREE.MeshStandardMaterial({ color: 0xf2d3ff, side: THREE.DoubleSide, transparent: true, opacity: .7, roughness: .4 }), 0, 0, 0, ringed);
  ring.rotation.set(1.25, .35, 0);

  // ---------- 지구 ----------
  const earthTex = canvasTex(512, 256, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, 0, h); l.addColorStop(0, "#2b6fd8"); l.addColorStop(1, "#123f9a");
    g.fillStyle = l; g.fillRect(0, 0, w, h);
    g.fillStyle = "#4fb35e";
    for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(rnd() * w, 30 + rnd() * (h - 60), 18 + rnd() * 50, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); }
    g.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 40, 3 + rnd() * 4, rnd() * .6, 0, 7); g.fill(); }
  });
  const earth = add(new THREE.SphereGeometry(3.6, 64, 32), std(0xffffff, { map: earthTex, roughness: .7 }), 11.2, -5.4, -2);
  const atmo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("rgba(118,188,235,.65)", "rgba(118,188,235,0)"), blending: THREE.AdditiveBlending, depthWrite: false }));
  atmo.position.set(11.2, -5.4, -2.4); atmo.scale.set(10.5, 10.5, 1); scene.add(atmo);

  // ---------- 달 바위 + 우주인 ----------
  const rockGeo = new THREE.IcosahedronGeometry(1, 3);
  { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + (rnd() - .5) * .18); p.setXYZ(i, v.x, v.y, v.z); } rockGeo.computeVertexNormals(); }
  const rock = add(rockGeo, std(0x8a84b0, { roughness: .95, flatShading: true }), -6.4, -8.3, 1.5); rock.scale.set(4.6, 1.8, 3);
  const astro = new THREE.Group(); astro.position.set(-6.2, -5.75, 3.2); astro.rotation.y = .5; scene.add(astro);
  const suit = std(0xf6f3fc, { roughness: .45 });
  add(new THREE.CapsuleGeometry(.55, .6, 8, 16), suit, 0, 0, 0, astro);
  add(new THREE.BoxGeometry(.9, 1, .45), std(0xc9c3dd), 0, .05, -.5, astro);
  add(new THREE.SphereGeometry(.68, 32, 24), suit, 0, 1.15, 0, astro);
  const visor = add(new THREE.SphereGeometry(.5, 32, 24), std(0x1d2a66, { metalness: .9, roughness: .12, emissive: 0x16245e, emissiveIntensity: .4 }), 0, 1.15, .28, astro);
  visor.scale.set(1, .82, .7);
  const leg = new THREE.CapsuleGeometry(.24, .7, 6, 12);
  [-.28, .28].forEach(x => { const l = add(leg, suit, x, -.55, .55, astro); l.rotation.x = 1.45; });
  [-.7, .7].forEach(x => { const a = add(new THREE.CapsuleGeometry(.18, .55, 6, 12), suit, x, .15, .15, astro); a.rotation.z = x > 0 ? -.6 : .6; });
  add(new THREE.BoxGeometry(.4, .25, .05), std(0x76bceb, { emissive: 0x2a6fa8, emissiveIntensity: .6 }), 0, .2, .55, astro);

  // ---------- 성 ----------
  const castle = new THREE.Group(); castle.position.set(-11.2, -4.6, -2.5); scene.add(castle);
  const wall = std(0xf3dcc0, { roughness: .8 }), roof = std(0x7d5fd6, { roughness: .5 }), win = new THREE.MeshBasicMaterial({ color: 0xffc857 });
  add(new THREE.BoxGeometry(4.2, 3.2, 1.8), wall, 0, -1.6, 0, castle);
  [-2.25, 2.25].forEach(x => {
    add(new THREE.CylinderGeometry(.62, .62, 4.6, 24), wall, x, -.9, 0, castle);
    add(new THREE.ConeGeometry(.85, 2, 24), roof, x, 2.3, 0, castle);
    add(new THREE.PlaneGeometry(.3, .5), win, x, .4, .63, castle);
  });
  add(new THREE.CylinderGeometry(.9, .9, 6.4, 24), wall, 0, .1, -.2, castle);
  add(new THREE.ConeGeometry(1.2, 3, 24), roof, 0, 4.8, -.2, castle);
  add(new THREE.PlaneGeometry(.4, .7), win, 0, 1.8, .72, castle);
  add(new THREE.PlaneGeometry(.35, .55), win, -1.1, -1.2, .91, castle); add(new THREE.PlaneGeometry(.35, .55), win, 1.1, -1.2, .91, castle);
  add(new THREE.PlaneGeometry(1, 1.5), std(0x4a2f7c), 0, -2.45, .91, castle);
  [[-2.25, 3.3], [2.25, 3.3], [0, 6.3]].forEach(([x, y]) => {
    add(new THREE.CylinderGeometry(.03, .03, .8), std(0xf2c25a, { metalness: .6 }), x, y + .4, 0, castle);
    add(new THREE.PlaneGeometry(.5, .3), new THREE.MeshStandardMaterial({ color: 0xe2345b, side: THREE.DoubleSide }), x + .25, y + .65, 0, castle);
  });

  // ---------- 공룡 ----------
  const dino = new THREE.Group(); dino.position.set(-15.3, -6.6, 0); dino.rotation.y = .5; scene.add(dino);
  const green = std(0x4fae5a, { roughness: .6 }), belly = std(0xa8d88a), dark = std(0x2f7d3d);
  const body = add(new THREE.SphereGeometry(1, 32, 24), green, 0, 0, 0, dino); body.scale.set(1.6, 1.9, 1.3);
  const bel = add(new THREE.SphereGeometry(1, 32, 24), belly, .45, -.1, .5, dino); bel.scale.set(1, 1.4, .9);
  const head = add(new THREE.SphereGeometry(1, 32, 24), green, 1.3, 2.3, .1, dino); head.scale.set(1.4, .95, .95);
  add(new THREE.SphereGeometry(.22, 16, 12), std(0xffffff), 1.9, 2.75, .7, dino);
  add(new THREE.SphereGeometry(.11, 12, 8), std(0x1c2238), 2.0, 2.77, .88, dino);
  const tail = add(new THREE.ConeGeometry(.9, 3.2, 24), green, -2.1, -1, 0, dino); tail.rotation.z = 2.0;
  for (let i = 0; i < 5; i++) { const s = add(new THREE.ConeGeometry(.22, .6, 12), dark, -1.1 + i * .55, 1.6 + Math.sin(i / 4 * 3) * .5 - i * .05, 0, dino); s.rotation.z = -.3; }
  [-.6, .6].forEach(z => add(new THREE.CapsuleGeometry(.35, .6, 6, 12), green, .2, -1.9, z, dino));
  const arm = add(new THREE.CapsuleGeometry(.14, .4, 6, 10), green, 1.4, .6, .6, dino); arm.rotation.z = -1;

  // ---------- 펼친 그림책 + 빛 ----------
  const pageTex = canvasTex(256, 128, (g, w, h) => {
    const l = g.createLinearGradient(0, 0, w, 0); l.addColorStop(0, "#fff7e6"); l.addColorStop(1, "#f0d9a8");
    g.fillStyle = l; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(170,130,80,.35)"; g.lineWidth = 2;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.moveTo(20, i * 17); g.lineTo(w - 20, i * 17); g.stroke(); }
  });
  const book = new THREE.Group(); book.position.set(0, -7.4, 4.4); book.rotation.x = -1.05; scene.add(book);
  const pageGeo = (side) => {
    const g = new THREE.PlaneGeometry(3.4, 2.5, 32, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 1.7; p.setX(i, side * x); p.setZ(i, Math.sin(x / 3.4 * Math.PI) * .45 + x * .08); }
    g.computeVertexNormals(); return g;
  };
  add(pageGeo(1), new THREE.MeshStandardMaterial({ map: pageTex, side: THREE.DoubleSide, roughness: .8, emissive: 0x3a2a10 }), 0, 0, 0, book);
  add(pageGeo(-1), new THREE.MeshStandardMaterial({ map: pageTex, side: THREE.DoubleSide, roughness: .8, emissive: 0x3a2a10 }), 0, 0, 0, book);
  add(new THREE.BoxGeometry(7.2, 2.7, .12), std(0x7a3b1e, { roughness: .7 }), 0, 0, -.08, book);
  const bookGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("rgba(255,231,163,1)", "rgba(255,200,87,0)"), blending: THREE.AdditiveBlending, depthWrite: false }));
  bookGlow.position.set(0, -5.6, 5); bookGlow.scale.set(11, 6, 1); scene.add(bookGlow);

  // ---------- 로켓 + 반짝이는 꼬리 ----------
  const rocket = new THREE.Group(); rocket.position.set(8.4, 3.6, 2); rocket.rotation.z = -.72; scene.add(rocket);
  const prof = [[0, -1.5], [.5, -1.35], [.68, -.5], [.66, .5], [.5, 1.15], [.3, 1.5]].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(prof, 40), std(0xf6f3fc, { roughness: .35, metalness: .1 }), 0, 0, 0, rocket);
  add(new THREE.ConeGeometry(.31, .8, 40), std(0xe2345b, { roughness: .4 }), 0, 1.9, 0, rocket);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(.8, -.9); finShape.lineTo(.8, -1.3); finShape.lineTo(0, -.7); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: .08, bevelEnabled: false });
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(finGeo, std(0xe2345b)); f.position.y = -.5; const pivot = new THREE.Group(); pivot.rotation.y = i * Math.PI * 2 / 3; f.position.x = .55; pivot.add(f); rocket.add(pivot); }
  add(new THREE.TorusGeometry(.3, .07, 12, 32), std(0xc9c3dd, { metalness: .7, roughness: .3 }), 0, .35, .62, rocket);
  add(new THREE.CircleGeometry(.27, 32), std(0x6fb8ff, { emissive: 0x2a6fd8, emissiveIntensity: .8, metalness: .4, roughness: .15 }), 0, .35, .66, rocket);
  const flameO = add(new THREE.ConeGeometry(.45, 1.7, 24), new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: .9 }), 0, -2.3, 0, rocket); flameO.rotation.x = Math.PI;
  const flameI = add(new THREE.ConeGeometry(.25, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), 0, -2.05, 0, rocket); flameI.rotation.x = Math.PI;

  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(.4, -6.4, 4.6), new THREE.Vector3(1.6, -2.5, 3.6), new THREE.Vector3(4.6, .2, 2.8), new THREE.Vector3(7.5, 2.2, 2.2)]);
  const NS = 180, sp = new Float32Array(NS * 3), sOff = new Float32Array(NS);
  for (let i = 0; i < NS; i++) sOff[i] = rnd();
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: .32, map: starTex, color: 0xffd76e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(sparks);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, .07, 8), new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(tube);

  // ---------- 망원경, 책 더미, 원자 ----------
  const brass = std(0xd9a640, { metalness: .75, roughness: .3 }), wood = std(0x6b4a2a);
  const scope = new THREE.Group(); scope.position.set(13.8, -6.2, 1.5); scene.add(scope);
  [[-.6, .5], [.6, .5], [0, -.6]].forEach(([x, z]) => { const l = add(new THREE.CylinderGeometry(.06, .06, 2.6), wood, x * .5, -1.1, z * .5, scope); l.rotation.set(z * .25, 0, -x * .25); });
  const tubeS = add(new THREE.CylinderGeometry(.28, .38, 2.8, 24), brass, 0, .3, 0, scope); tubeS.rotation.z = 1.05;
  const stackCols = [0xb23a3a, 0x2f6f8f, 0x5c8a3a, 0x8a5bb5];
  stackCols.forEach((c, i) => { const b = add(new THREE.BoxGeometry(2 - i * .15, .38, 1.4), std(c, { roughness: .7 }), 15.6 + (i % 2 ? .1 : -.1), -8.4 + i * .4, 1.5, scene); b.rotation.y = (i % 2 ? .12 : -.1); });
  const atom = new THREE.Group(); atom.position.set(14, 1.6, 0); scene.add(atom);
  const gold = std(0xffc857, { metalness: .6, roughness: .25, emissive: 0x6a4a00, emissiveIntensity: .6 });
  const orbits = [0, 1, 2].map(i => { const t = add(new THREE.TorusGeometry(1.15, .045, 8, 64), gold, 0, 0, 0, atom); t.rotation.set(Math.PI / 2, 0, i * Math.PI / 3); t.rotation.order = "ZXY"; return t; });
  add(new THREE.SphereGeometry(.24, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd76e }), 0, 0, 0, atom);
  const electrons = [0, 1, 2].map(() => add(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }), 0, 0, 0, atom));

  // ---------- 구름 ----------
  const cloudMat = std(0xbfaeea, { roughness: 1, emissive: 0x3a2a70, emissiveIntensity: .35 });
  [[-15.5, -10.2, 5, 2.8], [-12.4, -10.8, 5.4, 2.2], [-9.8, -11.2, 6, 1.7], [15.5, -10.2, 5, 2.8], [12.6, -10.9, 5.4, 2.1], [10.2, -11.3, 6, 1.6], [-14, -9.2, 4.2, 1.6], [14.2, -9.3, 4.2, 1.5]]
    .forEach(([x, y, z, r]) => add(new THREE.SphereGeometry(r, 24, 16), cloudMat, x, y, z));

  // ---------- 빛번짐 ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .62, .5, .82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // 화면 비율이 바뀌어도 세로 높이는 고정, 좁은 화면은 양옆이 잘리게(가운데 그림책·우주인·로켓은 항상 보임)
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    // 세로로 좁은 화면은 조금 물러나서 로켓·지구까지 보이게
    camera.position.z = camera.aspect < 1.5 ? 30 * Math.pow(1.5 / camera.aspect, .55) : 30;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  // 손가락·마우스를 따라 살짝 시점이 움직여요
  let tx = 0, ty = 0;
  addEventListener("pointermove", e => { tx = (e.clientX / innerWidth - .5) * 1.6; ty = (e.clientY / innerHeight - .5) * -1; }, { passive: true });

  const player = document.getElementById("player");
  const clock = new THREE.Clock();
  function frame() {
    if (document.hidden || (player && !player.hidden)) return;   // 영상 볼 때는 쉬어요
    const t = clock.getElapsedTime();
    starSets[0].material.opacity = .65 + Math.sin(t * 1.3) * .3;
    starSets[1].material.opacity = .65 + Math.sin(t * 1.7 + 2) * .3;
    rocket.position.y = 3.6 + Math.sin(t * 1.2) * .25; rocket.position.x = 8.4 + Math.sin(t * .8) * .12;
    const f = 1 + Math.sin(t * 22) * .12 + Math.sin(t * 13) * .08; flameO.scale.set(f, f * 1.1, f); flameI.scale.set(f, f, f);
    for (let i = 0; i < NS; i++) {
      const u = (sOff[i] + t * .09) % 1, p = curve.getPoint(u), s = (1 - u) * .5;
      sp[i * 3] = p.x + Math.sin(i * 12.9 + t * 2) * s; sp[i * 3 + 1] = p.y + Math.cos(i * 7.3 + t * 2) * s; sp[i * 3 + 2] = p.z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    earth.rotation.y = t * .08; planet.rotation.y = t * .12; mini.rotation.y = t * .2;
    astro.position.y = -5.75 + Math.sin(t * 1.1) * .06;
    electrons.forEach((e, i) => { const a = t * 2.2 + i * 2.1, o = orbits[i]; e.position.set(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15).applyEuler(o.rotation); });
    bookGlow.material.opacity = .5 + Math.sin(t * 2) * .1;
    camera.position.x += (tx - camera.position.x) * .04; camera.position.y += (BASE_Y + ty - camera.position.y) * .04;
    camera.lookAt(0, BASE_Y, 0);
    composer.render();
  }
  if (still) { frame(); addEventListener("resize", () => requestAnimationFrame(frame)); }
  else renderer.setAnimationLoop(frame);
  frame();
  host.classList.add("has3d");
}

try { main(); } catch (e) { console.warn("3D 무대를 그리지 못해 그림으로 보여요", e); }
