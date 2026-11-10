import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/css3d';
import {
  loadStores, youtubeId, embedUrl, thumbUrl, waLink, normalizeUrl, initials, STORAGE_KEY, assignSlots,
} from './data.js';

/* =========================================================================
   Medidas del edificio (metros). Patio central rodeado de 3 pisos de locales.
   ========================================================================= */
const FH = 6;            // alto de cada piso
const FLOORS = 3;
const GX = 17, GZ = 27;  // línea de fachadas de los locales (izq/der en x, fondo en -z) y vidriera del frente (+z)
const VX = 12, VZ = 22;  // vacío del patio central en los pisos 2 y 3
const ROOF = 18;         // techo
const SD = 5;            // profundidad visible de cada local
const EYE = 1.7;
const PX = 0.005;        // metros por píxel en letreros y videos
const PXP = 0.0025;      // metros por píxel en las tarjetas de producto (más nítidas)

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const MAX_LIVE = isTouch ? 3 : 6;
const LIVE_DIST = 30;
const CSS_DIST = 42;

/* =========================================================================
   Renderizadores: HTML 3D debajo, WebGL arriba con "huecos" transparentes
   ========================================================================= */
const glLayer = document.getElementById('gl-layer');
const cssLayer = document.getElementById('css-layer');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
glLayer.appendChild(renderer.domElement);

const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
cssLayer.appendChild(cssRenderer.domElement);

const scene = new THREE.Scene();
const cssScene = new THREE.Scene();
const HORIZON = new THREE.Color('#dbe8f0');
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 160, 520);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.rotation.order = 'YXZ';

const holeMat = new THREE.MeshBasicMaterial({
  color: 0x000000, opacity: 0, transparent: false, blending: THREE.NoBlending,
  side: THREE.FrontSide, fog: false, toneMapped: false,
});

/* =========================================================================
   Utilidades y texturas procedurales
   ========================================================================= */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function std(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts }); }

const world = new THREE.Group();
scene.add(world);
function box(w, h, d, mat, x, y, z, parent = world) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}
function plane(w, h, mat, parent = world) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); parent.add(m); return m; }

// Terrazo: la textura cubre 4 m x 4 m con juntas cada 2 m
function terrazzo(wm, lm, base = '#e8e3da') {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rand(7);
    const chips = ['#b9b1a4', '#9c8f7d', '#d3c9b8', '#7e8f88', '#c7a98a', '#f5f2ec'];
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = chips[(r() * chips.length) | 0];
      const s = r() * 5 + 1;
      g.globalAlpha = 0.3 + r() * 0.45;
      g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.6), r() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(90,80,66,0.3)'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke();
    }
  }, [wm / 4, lm / 4]);
}

// Adoquín gris claro de la plaza exterior (la textura cubre 6 m)
const paverTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#cfcac2'; g.fillRect(0, 0, w, h);
  const r = rand(12); const n = 8, s = w / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 195 + ((r() * 26) | 0);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
  }
}, [400 / 6, 400 / 6]);

const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6f9a4a'; g.fillRect(0, 0, w, h);
  const r = rand(4);
  for (let i = 0; i < 3000; i++) { g.fillStyle = r() > 0.5 ? '#80aa58' : '#5f8a3e'; g.fillRect(r() * w, r() * h, 2, 3); }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;

// Fachada exterior: piedra arena con ranuras horizontales cada 0,9 m (la textura cubre 7,2 m de alto)
const shellTex = canvasTex(256, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#d9c5a7'); gr.addColorStop(1, '#cfb898');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rand(2);
  for (let i = 0; i < 2500; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(80,60,30,0.05)'; g.fillRect(r() * w, r() * h, 2, 2); }
  for (let i = 0; i < 8; i++) {
    const y = i * h / 8;
    g.fillStyle = 'rgba(90,70,45,0.28)'; g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y + 3, w, 2);
  }
});
shellTex.wrapS = shellTex.wrapT = THREE.RepeatWrapping;
shellTex.repeat.set(1 / 6, 1 / 7.2);

const skyTex = canvasTex(16, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#5e9bd6'); gr.addColorStop(0.42, '#a9cdea'); gr.addColorStop(0.5, '#dbe8f0'); gr.addColorStop(1, '#dbe8f0');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

// Reflejo suave para vidrieras
const glassTex = canvasTex(512, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (const [x, wd, a] of [[60, 70, 0.10], [150, 22, 0.07], [330, 110, 0.05], [470, 30, 0.08]]) {
    g.save(); g.translate(x, 0); g.transform(1, 0, -0.45, 1, 0, 0);
    const gr = g.createLinearGradient(0, 0, wd, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, wd, h * 2); g.restore();
  }
});
const sheenMat = new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
const railGlass = new THREE.MeshStandardMaterial({ color: 0xcfe6ea, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
const facadeGlass = new THREE.MeshStandardMaterial({ color: 0x9fc3d1, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
const metalDark = std(0x2a2e33, { metalness: 0.7, roughness: 0.35 });
const white = std(0xf4f2ee, { roughness: 0.7 });

// Estantes con productos de colores (decorado interior de los locales)
const shelfTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#f3efe8'; g.fillRect(0, 0, w, h);
  const r = rand(31);
  const cols = ['#c8361f', '#f2b134', '#1f5fa8', '#2f8f4e', '#7a2f8f', '#e0702a', '#22a07a', '#d9d2c6', '#3a3a3a'];
  for (let row = 0; row < 4; row++) {
    const y = 8 + row * 62;
    g.fillStyle = '#c9b79c'; g.fillRect(0, y + 50, w, 6);
    let x = 6;
    while (x < w - 20) {
      const bw = 12 + r() * 26, bh = 18 + r() * 28;
      g.fillStyle = cols[(r() * cols.length) | 0];
      g.fillRect(x, y + 50 - bh, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 2, y + 52 - bh, 3, bh - 6);
      x += bw + 4 + r() * 8;
    }
  }
});
const ceilTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const cx = 64 + x * 128, cy = 64 + y * 128;
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 26);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#fff4dc'); gr.addColorStop(1, 'rgba(247,245,240,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
  }
});
ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
const woodFloorTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#c8a77f'; g.fillRect(0, 0, w, h);
  const r = rand(17);
  for (let y = 0; y < h; y += 32) {
    for (let x = (y / 32) % 2 ? -60 : 0; x < w; x += 120) {
      const v = 180 + ((r() * 40) | 0);
      g.fillStyle = `rgb(${v},${v - 34},${v - 76})`; g.fillRect(x + 1, y + 1, 118, 30);
    }
  }
});
woodFloorTex.wrapS = woodFloorTex.wrapT = THREE.RepeatWrapping;

const comingSoonTex = canvasTex(1024, 560, (g, w, h) => {
  // vinilo esmerilado sobre vidrio, discreto
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#f4f1ec'); gr.addColorStop(1, '#e9e4dc');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(160,150,130,0.25)'; g.lineWidth = 2;
  for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#22a07a'; g.fillRect(w / 2 - 40, 196, 80, 4);
  g.fillStyle = '#5d6b66'; g.font = '600 26px "Instrument Sans", sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '6px';
  g.fillText('PRÓXIMAMENTE', w / 2, 240);
  if (g.letterSpacing !== undefined) g.letterSpacing = '0px';
  g.fillStyle = '#163a33'; g.font = '700 52px "Bricolage Grotesque", sans-serif';
  g.fillText('Tu emprendimiento aquí', w / 2, 300);
  g.fillStyle = '#7d8a85'; g.font = '500 24px "Instrument Sans", sans-serif';
  g.fillText('Local disponible', w / 2, 352);
});

function numberTex(text) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2e33'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 54px "Instrument Sans", sans-serif'; g.fillText(text, w / 2, h / 2 + 2);
  });
}

/* =========================================================================
   Estado del mundo
   ========================================================================= */
let stores = [];
let units = [];        // locales ocupados
let colliders = [];    // círculos { x, z, r, y }
let surfaces = [];     // superficies caminables { x0, x1, z0, z1, y | ramp, holes }
let blockers = [];     // mallas que tapan la vista al seleccionar (losas)
let doors = [];        // puertas corredizas de la entrada
let flickers = [];
let spinners = [];

function clearWorld() {
  world.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  world.clear();
  for (const u of units) for (const c of u.css) cssScene.remove(c.obj);
  units = []; colliders = []; surfaces = []; blockers = []; doors = []; flickers = []; spinners = [];
}

/* =========================================================================
   Superficies caminables: así se puede subir por las escaleras eléctricas
   ========================================================================= */
const ESC1 = { x0: -12, x1: -10.2, zLow: 6, zHigh: -4.4, yLow: 0, yHigh: FH };          // piso 1 → 2
const ESC2 = { x0: 10.2, x1: 12, zLow: -6, zHigh: 4.4, yLow: FH, yHigh: 2 * FH };       // piso 2 → 3
const ALTAR_Z = -21;   // espalda del altar en el patio

function defineSurfaces() {
  const m = 0.4;  // margen frente a vidrios y barandas
  surfaces.push({ x0: -GX + m, x1: GX - m, z0: -GZ + m, z1: GZ - 0.5, y: 0, holes: [
    { x0: ESC1.x0 - 0.1, x1: ESC1.x1 + 0.1, z0: ESC1.zHigh - 3.2, z1: ESC1.zLow },
    { x0: -5.4, x1: 5.4, z0: ALTAR_Z - 0.6, z1: ALTAR_Z + 3.6 },
  ] });
  for (let f = 1; f < FLOORS; f++) {
    const y = f * FH, e = VX + m, ez = VZ + m;
    surfaces.push(
      { x0: -GX + m, x1: -e, z0: -GZ + m, z1: GZ - m, y },
      { x0: e, x1: GX - m, z0: -GZ + m, z1: GZ - m, y },
      { x0: -e, x1: e, z0: -GZ + m, z1: -ez, y },
      { x0: -e, x1: e, z0: ez, z1: GZ - m, y },
    );
  }
  // escaleras y descansos
  for (const E of [ESC1, ESC2]) {
    const zMin = Math.min(E.zLow, E.zHigh), zMax = Math.max(E.zLow, E.zHigh);
    surfaces.push({ x0: E.x0, x1: E.x1, z0: zMin, z1: zMax, ramp: E });
  }
  surfaces.push({ x0: ESC1.x0 - 0.4, x1: ESC1.x1, z0: ESC1.zHigh - 3, z1: ESC1.zHigh, y: FH });      // descanso arriba (piso 2)
  surfaces.push({ x0: ESC2.x0, x1: ESC2.x1 + 0.4, z0: ESC2.zLow - 3, z1: ESC2.zLow, y: FH });        // descanso abajo (piso 2)
  surfaces.push({ x0: ESC2.x0, x1: ESC2.x1 + 0.4, z0: ESC2.zHigh, z1: ESC2.zHigh + 3, y: 2 * FH }); // descanso arriba (piso 3)
}

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Altura del piso en (x, z) cerca de la altura actual; null si no se puede pisar ahí. */
function groundAt(x, z, cur) {
  let best = null, bd = 0.8;
  for (const s of surfaces) {
    if (!inRect(s, x, z)) continue;
    if (s.holes && s.holes.some((h) => inRect(h, x, z))) continue;
    let h = s.y;
    if (s.ramp) {
      const E = s.ramp, t = (z - E.zLow) / (E.zHigh - E.zLow);
      h = E.yLow + (E.yHigh - E.yLow) * Math.min(1, Math.max(0, t));
    }
    const d = Math.abs(h - cur);
    if (d < bd) { bd = d; best = h; }
  }
  if (best === null) return null;
  for (const c of colliders) {
    if (Math.abs(c.y - best) > 2) continue;
    if (Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return null;
  }
  return best;
}

/* =========================================================================
   Exterior: plaza, fuente con San José, árboles y ciudad
   ========================================================================= */
function buildExterior() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false }));
  world.add(sky);

  const ground = plane(400, 400, std(0xffffff, { map: paverTex, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, 60);
  const grassMat = std(0xffffff, { map: grassTex, roughness: 1 });
  for (const [x, z, w, d] of [[-40, 60, 34, 50], [44, 74, 26, 30], [-34, 112, 40, 20], [40, 118, 40, 20]]) {
    const t = grassTex.clone(); t.needsUpdate = true; t.repeat.set(w / 4, d / 4);
    const g = plane(w, d, std(0xffffff, { map: t, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.set(x, 0.01, z);
    box(w + 0.4, 0.35, 0.4, std(0xd9d2c6), x, 0.17, z - d / 2); box(w + 0.4, 0.35, 0.4, std(0xd9d2c6), x, 0.17, z + d / 2);
  }
  // árboles
  const r = rand(77);
  const treeSpots = [[-22, 42], [-30, 52], [-26, 70], [-46, 46], [-52, 72], [-34, 86], [26, 40], [34, 50], [52, 64], [36, 88], [58, 92], [-58, 98], [20, 100], [-16, 104]];
  for (const [x, z] of treeSpots) tree(x, z, 0.8 + r() * 0.5);
  // jardineras con flores frente a la entrada
  for (const x of [-9, 9]) {
    box(6, 0.6, 2.2, std(0xd9d2c6, { roughness: 0.6 }), x, 0.3, 36);
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.2, 0), std([0x3f7f4a, 0x4f8f3a, 0xd6453d, 0xf2c230, 0xc2366b][(r() * 5) | 0], { roughness: 0.8 }));
      f.position.set(x - 2.6 + r() * 5.2, 0.75 + r() * 0.3, 35.2 + r() * 1.6); world.add(f);
    }
  }
  // bancas exteriores
  for (const [x, z] of [[-14, 46], [-14, 56], [26, 62], [-4, 64]]) box(3, 0.45, 0.8, std(0x9b6b43, { roughness: 0.6 }), x, 0.45, z);

  // Fuente con la estatua de San José
  const fx = 15, fz = 54;
  const stone = std(0xd9d2c6, { roughness: 0.5 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.2, 0.8, 64, 1, true), stone);
  basin.position.set(fx, 0.4, fz); world.add(basin);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(7, 0.25, 10, 80), stone);
  lip.rotation.x = Math.PI / 2; lip.position.set(fx, 0.8, fz); world.add(lip);
  const water = new THREE.Mesh(new THREE.CircleGeometry(6.9, 64), new THREE.MeshStandardMaterial({ color: 0x5fb7c9, emissive: 0x1a5a68, emissiveIntensity: 0.5, roughness: 0.08, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2; water.position.set(fx, 0.6, fz); world.add(water);
  spinners.push({ water, t: 0 });
  box(3.6, 3.2, 3.6, std(0xbfb6a6, { roughness: 0.6 }), fx, 1.6, fz);
  box(4.0, 0.3, 4.0, stone, fx, 3.35, fz);
  box(3.2, 0.5, 0.06, std(0x8a7a5e, { metalness: 0.6, roughness: 0.4 }), fx, 2.2, fz + 1.83);
  figuraSanJose(fx, 3.5, fz, { scale: 2.6, mat: std(0x6f7a68, { roughness: 0.55, metalness: 0.35 }), facing: -0.35 });

  // Ciudad al fondo
  const winTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#c9cfd4'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 22) for (let x = 8; x < w; x += 20) { g.fillStyle = (x + y) % 3 ? '#8fa4b4' : '#a9bccb'; g.fillRect(x, y, 12, 14); }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const rr = rand(5);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 1.9, d = 150 + rr() * 90;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d * 0.9 + 20;
    if (z > 40 && Math.abs(x) < 70) continue;
    const h = 14 + rr() * 40, w = 12 + rr() * 16;
    const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(w / 10, h / 20);
    box(w, h, w * 0.8, std(0xffffff, { map: t, roughness: 0.7 }), x, h / 2, z);
  }
}

function tree(x, z, s = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 3.4 * s, 8), std(0x6f533a, { roughness: 0.9 }));
  trunk.position.set(x, 1.7 * s, z); world.add(trunk);
  const leaf = std(0x4c7f3c, { roughness: 0.9 });
  const r = rand(Math.abs(Math.round(x * 7 + z * 3)) + 1);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 + r() * 0.7) * s, 1), leaf);
    b.position.set(x + (r() - 0.5) * 1.8 * s, (3.6 + r() * 1.6) * s, z + (r() - 0.5) * 1.8 * s); world.add(b);
  }
}

/* =========================================================================
   El edificio
   ========================================================================= */
const CAV_X = 22.6, CAV_Z = -32.6;   // cavidad interior (incluye la profundidad de los locales)

function shellShape() {
  const s = new THREE.Shape();
  // coordenadas de planta: (x, y = -z)
  s.moveTo(GX, -31); s.lineTo(20, -31);
  s.absarc(20, -19, 12, -Math.PI / 2, 0, false);
  s.lineTo(32, 32); s.absarc(26, 32, 6, 0, Math.PI / 2, false);
  s.lineTo(-26, 38); s.absarc(-26, 32, 6, Math.PI / 2, Math.PI, false);
  s.lineTo(-32, -19); s.absarc(-20, -19, 12, Math.PI, Math.PI * 1.5, false);
  s.lineTo(-GX, -31); s.lineTo(-GX, -GZ);
  s.lineTo(-CAV_X, -GZ); s.lineTo(-CAV_X, -CAV_Z); s.lineTo(CAV_X, -CAV_Z); s.lineTo(CAV_X, -GZ); s.lineTo(GX, -GZ);
  s.closePath();
  return s;
}

function roundedRect(x0, x1, y0, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function buildShell(list) {
  const shellMat = std(0xffffff, { map: shellTex, roughness: 0.85 });
  const shell = new THREE.Mesh(new THREE.ExtrudeGeometry(shellShape(), { depth: 21, bevelEnabled: false, curveSegments: 28 }), shellMat);
  shell.rotation.x = -Math.PI / 2; world.add(shell);

  // Cornisa curva que corona el edificio y cruza por encima de la entrada
  const ring = roundedRect(-33.4, 33.4, -32.4, 39.4, 13);
  ring.holes.push(roundedRect(-31.6, 31.6, -30.6, 37.6, 11.5));
  const cornice = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 1.8, bevelEnabled: false, curveSegments: 28 }), std(0xc9b08c, { roughness: 0.7 }));
  cornice.rotation.x = -Math.PI / 2; cornice.position.y = 20.2; world.add(cornice);
  box(2 * GX, 1.2, 4.4, std(0xc9b08c, { roughness: 0.7 }), 0, 20.8, 29.2);

  // Techo con hueco para el tragaluz
  const roofMat = std(0xf1eee8, { roughness: 0.9 });
  const rt = 0.8, ry = ROOF + rt / 2;
  box(2 * CAV_X, rt, VZ + 0.01 - CAV_Z, roofMat, 0, ry, (CAV_Z - VZ) / 2);           // fondo
  box(2 * CAV_X, rt, GZ - VZ, roofMat, 0, ry, (GZ + VZ) / 2);                        // frente
  box(CAV_X - VX, rt, 2 * VZ, roofMat, -(CAV_X + VX) / 2, ry, 0);
  box(CAV_X - VX, rt, 2 * VZ, roofMat, (CAV_X + VX) / 2, ry, 0);
  box(2 * GX, 1, 31 - GZ, roofMat, 0, ROOF + 0.5, (31 + GZ) / 2);                   // marquesina de la entrada

  // Bóveda de vidrio sobre el patio
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(VX, VX, 2 * VZ, 40, 1, true, -Math.PI / 2, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xd3e8f5, side: THREE.DoubleSide, fog: false }));
  vault.rotation.x = -Math.PI / 2; vault.scale.set(1, 1, 0.38); vault.position.set(0, ROOF + rt, 0); world.add(vault);
  const ribMat = std(0xffffff, { roughness: 0.4 });
  for (let z = -VZ; z <= VZ + 0.01; z += 4) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(VX, 0.12, 6, 40, Math.PI), ribMat);
    rib.scale.set(1, 0.38, 1); rib.position.set(0, ROOF + rt, z); world.add(rib);
  }
  box(0.2, 0.2, 2 * VZ, ribMat, 0, ROOF + rt + VX * 0.38, 0);

  // Vidriera del frente con puertas corredizas
  const fz = GZ;
  const doorW = 6, doorH = 3.4, glassTop = 13;
  const gl = plane(GX - doorW / 2, glassTop, facadeGlass); gl.position.set(-(GX + doorW / 2) / 2, glassTop / 2, fz);
  const gr = plane(GX - doorW / 2, glassTop, facadeGlass); gr.position.set((GX + doorW / 2) / 2, glassTop / 2, fz);
  const gt = plane(doorW, glassTop - doorH, facadeGlass); gt.position.set(0, doorH + (glassTop - doorH) / 2, fz);
  for (let i = 0; i <= 12; i++) { const x = -GX + i * (2 * GX / 12); box(0.14, glassTop, 0.2, metalDark, x, glassTop / 2, fz); }
  for (const y of [doorH + 0.05, FH, 2 * FH, glassTop]) box(2 * GX, 0.16, 0.22, metalDark, 0, y, fz);
  for (const side of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(side * doorW / 4, doorH / 2, fz + 0.12); world.add(p);
    const pane = plane(doorW / 2 - 0.08, doorH - 0.1, facadeGlass, p); pane.position.z = 0;
    box(doorW / 2, 0.08, 0.08, metalDark, 0, doorH / 2 - 0.04, 0, p);
    box(doorW / 2, 0.08, 0.08, metalDark, 0, -doorH / 2 + 0.04, 0, p);
    box(0.08, doorH, 0.08, metalDark, -doorW / 4 + 0.04, 0, 0, p);
    box(0.08, doorH, 0.08, metalDark, doorW / 4 - 0.04, 0, 0, p);
    doors.push({ g: p, side, x0: side * doorW / 4 });
  }
  // Panel del nombre sobre la vidriera
  const signTex = canvasTex(2048, 360, (g, w, h) => {
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6b6b6e'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.font = '600 74px "Instrument Sans", sans-serif'; g.fillText('Centro Comercial', w / 2, 96);
    g.font = '800 170px "Bricolage Grotesque", sans-serif';
    g.fillText('SAN JOSÉ', w / 2 - 230, 240);
    g.font = '700 96px "Bricolage Grotesque", sans-serif'; g.fillText('(VIRTUAL)', w / 2 + 470, 252);
  });
  box(28, 4.6, 0.3, std(0x3a3a3c), 0, 15.6, fz + 0.1);
  const sign = plane(27.6, 4.4, new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25, roughness: 0.5 }));
  sign.position.set(0, 15.6, fz + 0.27);
  box(2 * GX, ROOF - glassTop - 0.1, 0.3, std(0xc9b08c, { roughness: 0.8 }), 0, (ROOF + glassTop) / 2, fz - 0.2);

  // Pendones verticales en el ala izquierda con los primeros comercios
  const banners = list.slice(0, 3);
  banners.forEach((s, i) => {
    const phi = 0.28 + i * 0.3;
    const x = -20 - 12.15 * Math.sin(phi), z = 19 + 12.15 * Math.cos(phi);
    const t = canvasTex(160, 900, (g, w, h) => {
      g.fillStyle = s.color || '#5b3fd1'; g.fillRect(0, 0, w, h);
      g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 74px "Bricolage Grotesque", sans-serif'; g.fillText((s.nombre || '').slice(0, 16), 0, 0); g.restore();
    });
    const b = plane(1.5, 8.4, new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3 }));
    b.position.set(x, 8, z); b.rotation.y = -phi;
  });
}

/* ---------- Pisos, barandas y escaleras eléctricas ---------- */
function buildFloors() {
  // Piso del patio y de la planta baja
  const gf = plane(2 * GX, 2 * GZ, std(0xffffff, { map: terrazzo(2 * GX, 2 * GZ), roughness: 0.3 }));
  gf.rotation.x = -Math.PI / 2; gf.position.set(0, 0.005, 0);
  // Diseño de piedra en el centro del patio
  const inlay = new THREE.Mesh(new THREE.RingGeometry(5, 5.6, 64), std(0x163a33, { roughness: 0.4 }));
  inlay.rotation.x = -Math.PI / 2; inlay.position.set(0, 0.01, 4); world.add(inlay);
  const inlay2 = new THREE.Mesh(new THREE.RingGeometry(6.2, 6.4, 64), std(0xc99a3a, { roughness: 0.4, metalness: 0.4 }));
  inlay2.rotation.x = -Math.PI / 2; inlay2.position.set(0, 0.01, 4); world.add(inlay2);

  const slabTop = std(0xffffff, { map: terrazzo(4, 4, '#ece8e1'), roughness: 0.35 });
  const fascia = std(0xf7f5f1, { roughness: 0.5, emissive: 0xf7f5f1, emissiveIntensity: 0.45 });
  const led = new THREE.MeshBasicMaterial({ color: 0xfff1d8 });
  const t = 0.5;
  for (let f = 1; f < FLOORS; f++) {
    const y = f * FH;
    const parts = [
      [-(GX + VX) / 2, 0, GX - VX, 2 * GZ], [(GX + VX) / 2, 0, GX - VX, 2 * GZ],
      [0, -(GZ + VZ) / 2, 2 * VX, GZ - VZ], [0, (GZ + VZ) / 2, 2 * VX, GZ - VZ],
    ];
    for (const [x, z, w, d] of parts) {
      const s = box(w, t, d, fascia, x, y - t / 2, z); blockers.push(s);
      const top = plane(w, d, slabTop.clone()); top.material.map = terrazzo(w, d, '#ece8e1');
      top.rotation.x = -Math.PI / 2; top.position.set(x, y + 0.004, z);
    }
    // Línea de luz bajo el borde del vacío
    box(2 * VX + 0.2, 0.05, 0.05, led, 0, y - t + 0.02, VZ + 0.03);
    box(2 * VX + 0.2, 0.05, 0.05, led, 0, y - t + 0.02, -VZ - 0.03);
    box(0.05, 0.05, 2 * VZ, led, VX + 0.03, y - t + 0.02, 0);
    box(0.05, 0.05, 2 * VZ, led, -VX - 0.03, y - t + 0.02, 0);
    // Barandas de vidrio con aberturas para las escaleras
    const openings = f === 1
      ? { left: [ESC1.zHigh - 3, ESC1.zHigh], right: [ESC2.zLow - 3, ESC2.zLow] }
      : { left: null, right: [ESC2.zHigh, ESC2.zHigh + 3] };
    railX(-VX, -VZ, VZ, y, openings.left);
    railX(VX, -VZ, VZ, y, openings.right);
    railZ(-VZ, -VX, VX, y); railZ(VZ, -VX, VX, y);
  }
  // Ceiling of ground and 2nd floors is the slab underside; techo del 3.º = techo general

  escalator(ESC1); escalator(ESC2);
  // Descansos de las escaleras
  landing(ESC1.x0 - 0.2, ESC1.x1, ESC1.zHigh - 3, ESC1.zHigh, FH);
  landing(ESC2.x0, ESC2.x1 + 0.2, ESC2.zLow - 3, ESC2.zLow, FH);
  landing(ESC2.x0, ESC2.x1 + 0.2, ESC2.zHigh, ESC2.zHigh + 3, 2 * FH);
}

function railSegment(x0, z0, x1, z1, y) {
  const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) return;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ang = Math.atan2(x1 - x0, z1 - z0);
  const g = plane(len, 1.05, railGlass); g.position.set(cx, y + 0.55, cz); g.rotation.y = ang + Math.PI / 2;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), std(0xbfc5c9, { metalness: 0.8, roughness: 0.25 }));
  top.rotation.set(Math.PI / 2, 0, 0); top.rotation.y = ang; top.position.set(cx, y + 1.1, cz);
  const holder = new THREE.Group(); holder.position.set(cx, y + 1.1, cz); holder.rotation.y = ang; world.add(holder);
  top.position.set(0, 0, 0); top.rotation.set(Math.PI / 2, 0, 0); holder.add(top);
}
function railX(x, z0, z1, y, gap) {
  if (gap) { railSegment(x, z0, x, gap[0], y); railSegment(x, gap[1], x, z1, y); }
  else railSegment(x, z0, x, z1, y);
}
function railZ(z, x0, x1, y) { railSegment(x0, z, x1, z, y); }

function landing(x0, x1, z0, z1, y) {
  const s = box(x1 - x0, 0.5, z1 - z0, std(0xf7f5f1), (x0 + x1) / 2, y - 0.25, (z0 + z1) / 2); blockers.push(s);
  const top = plane(x1 - x0, z1 - z0, std(0x9aa0a6, { metalness: 0.5, roughness: 0.4 }));
  top.rotation.x = -Math.PI / 2; top.position.set((x0 + x1) / 2, y + 0.005, (z0 + z1) / 2);
}

const stepTex = canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#3d4247'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5c636a'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 3);
  g.fillStyle = '#f2b134'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
});
stepTex.wrapS = stepTex.wrapT = THREE.RepeatWrapping;

function escalator(E) {
  const w = E.x1 - E.x0, cx = (E.x0 + E.x1) / 2;
  const dz = E.zHigh - E.zLow, dy = E.yHigh - E.yLow;
  const len = Math.hypot(dz, dy), ang = Math.atan2(dy, Math.abs(dz)) * Math.sign(-dz);
  const g = new THREE.Group();
  g.position.set(cx, (E.yLow + E.yHigh) / 2, (E.zLow + E.zHigh) / 2);
  g.rotation.x = ang; world.add(g);
  const t = stepTex.clone(); t.needsUpdate = true; t.repeat.set(1, len / 1.2);
  const steps = plane(w, len, std(0xffffff, { map: t, roughness: 0.5, metalness: 0.3 }), g);
  steps.rotation.x = -Math.PI / 2; steps.position.y = 0.02;
  box(w + 0.3, 0.9, len, std(0xf3f1ec, { roughness: 0.4 }), 0, -0.45, 0, g);   // cuerpo
  for (const sx of [-1, 1]) {
    const side = plane(len, 0.95, railGlass, g); side.rotation.y = Math.PI / 2; side.position.set(sx * (w / 2 + 0.1), 0.55, 0);
    box(0.09, 0.07, len, std(0x1b1d20, { roughness: 0.5 }), sx * (w / 2 + 0.1), 1.05, 0, g);
  }
  // reflejo para que se lea la dirección: tira de luz en la base
  box(0.04, 0.04, len, new THREE.MeshBasicMaterial({ color: 0x9ad7ff }), -(w / 2 + 0.16), -0.8, 0, g);
  box(0.04, 0.04, len, new THREE.MeshBasicMaterial({ color: 0x9ad7ff }), (w / 2 + 0.16), -0.8, 0, g);
}

/* ---------- Mobiliario del patio ---------- */
function palm(x, z) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.9, 24), std(0x2f3a36, { roughness: 0.5 }));
  pot.position.set(x, 0.45, z); world.add(pot);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 5, 8), std(0x7a6046, { roughness: 0.9 }));
  trunk.position.set(x, 3.3, z); world.add(trunk);
  const leaf = std(0x3f7f4a, { roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const fr = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4, 1), leaf);
    fr.scale.set(1, 1, 0.15);
    fr.position.set(x + Math.sin(a) * 1.1, 5.6, z + Math.cos(a) * 1.1);
    fr.rotation.set(Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15);
    world.add(fr);
  }
  colliders.push({ x, z, r: 1.3, y: 0 });
}

function buildCourtyard() {
  for (const [x, z] of [[-6, 14], [6, 14], [-6, -8], [6, -8]]) palm(x, z);
  for (const [x, z] of [[-3, 18], [3, 18], [-3, -12], [3, -12]]) benchAcross(x, z);
  planter(0, 4); planter(-8, 3); planter(8, 3);
  altar(ALTAR_Z);
}

const brickTex = canvasTex(512, 512, (g, w, h) => {
  // 1 textura = 1 m x 1 m: ladrillos de 24 x 7 cm con junta oscura
  g.fillStyle = '#3b3430'; g.fillRect(0, 0, w, h);
  const rows = 14, cols = 4, bh = h / rows, bw = w / cols, j = 5;
  const r = rand(21);
  const tones = ['#a4553a', '#b4643f', '#8f4630', '#9c5a40', '#b8704b', '#7f3e2c', '#a85f45'];
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * bw / 2;
    for (let x = -1; x <= cols; x++) {
      const bx = x * bw + off;
      g.fillStyle = tones[(r() * tones.length) | 0];
      g.fillRect(bx + j / 2, y * bh + j / 2, bw - j, bh - j);
      // textura del barro
      for (let n = 0; n < 40; n++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,220,190,0.10)' : 'rgba(40,15,5,0.12)';
        g.fillRect(bx + j / 2 + r() * (bw - j), y * bh + j / 2 + r() * (bh - j), 2, 2);
      }
    }
  }
});
brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;

function brickMat(wm, hm) {
  const t = brickTex.clone(); t.needsUpdate = true; t.repeat.set(wm, hm);
  return std(0xffffff, { map: t, roughness: 0.92 });
}


function planter(x, z) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.8, 24), std(0x5a6b64, { roughness: 0.5 }));
  pot.position.set(x, 0.4, z); world.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 8, 32), std(0xc99a3a, { metalness: 0.5, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.8, z); world.add(rim);
  const leaf = std(0x3f7f4a, { roughness: 0.8 });
  const r = rand(Math.abs(Math.round(x * 13 + z * 7)) + 11);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + r() * 0.3, 1), leaf);
    b.position.set(x + (r() - 0.5) * 0.9, 1.1 + r() * 0.9, z + (r() - 0.5) * 0.9); world.add(b);
  }
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8), std(0x6f533a));
  trunk.position.set(x, 1.4, z); world.add(trunk);
  colliders.push({ x, z, r: 1.15, y: 0 });
}

function bench(x, z) {
  const wood = std(0x9b6b43, { roughness: 0.55 });
  const metal = std(0x2b2f33, { metalness: 0.6, roughness: 0.4 });
  box(0.6, 0.08, 2.6, wood, x, 0.46, z);
  box(0.5, 0.42, 0.08, metal, x, 0.21, z - 1.1);
  box(0.5, 0.42, 0.08, metal, x, 0.21, z + 1.1);
  colliders.push({ x, z: z - 0.8, r: 0.7, y: 0 }, { x, z: z + 0.8, r: 0.7, y: 0 });
}

function benchAcross(x, z) {
  const wood = std(0x9b6b43, { roughness: 0.55 });
  const metal = std(0x2b2f33, { metalness: 0.6, roughness: 0.4 });
  box(2.6, 0.08, 0.6, wood, x, 0.46, z);
  box(2.6, 0.5, 0.06, wood, x, 0.8, z + 0.3);
  box(0.08, 0.42, 0.5, metal, x - 1.1, 0.21, z);
  box(0.08, 0.42, 0.5, metal, x + 1.1, 0.21, z);
  colliders.push({ x: x - 0.8, z, r: 0.7, y: 0 }, { x: x + 0.8, z, r: 0.7, y: 0 });
}


/* =========================================================================
   Altar artesanal a San José (al fondo del pasillo)
   ========================================================================= */

// Rueda pintada al estilo de las carretas artesanales
const carretaTex = () => canvasTex(512, 512, (g, w) => {
  const c = w / 2;
  const ring = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill(); };
  ring(256, '#2b1a10'); ring(240, '#c8361f'); ring(214, '#f2c230'); ring(204, '#c8361f');
  // pétalos
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    g.save(); g.translate(c, c); g.rotate(a);
    g.fillStyle = i % 2 ? '#1f5fa8' : '#2f8f4e';
    g.beginPath(); g.moveTo(0, 60); g.quadraticCurveTo(38, 130, 0, 196); g.quadraticCurveTo(-38, 130, 0, 60); g.fill();
    g.fillStyle = '#f6f1e4';
    g.beginPath(); g.moveTo(0, 92); g.quadraticCurveTo(14, 130, 0, 168); g.quadraticCurveTo(-14, 130, 0, 92); g.fill();
    g.restore();
  }
  // puntos y estrellas
  for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16 + Math.PI / 32;
    g.fillStyle = i % 2 ? '#f6f1e4' : '#f2c230';
    g.beginPath(); g.arc(c + Math.cos(a) * 226, c + Math.sin(a) * 226, 7, 0, 7); g.fill();
  }
  ring(62, '#f2c230'); ring(48, '#c8361f'); ring(22, '#2b1a10');
  g.strokeStyle = '#2b1a10'; g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    g.beginPath(); g.moveTo(c + Math.cos(a) * 62, c + Math.sin(a) * 62); g.lineTo(c + Math.cos(a) * 204, c + Math.sin(a) * 204); g.stroke();
  }
});

// Retablo de madera pintada
const retabloTex = () => canvasTex(512, 640, (g, w, h) => {
  g.fillStyle = '#8a5a34'; g.fillRect(0, 0, w, h);
  // vetas
  const r = rand(5);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = r() > 0.5 ? 'rgba(60,30,10,0.18)' : 'rgba(255,220,170,0.10)';
    g.lineWidth = 1 + r() * 2; const x = r() * w;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 8, h / 3, x - 8, h * 2 / 3, x + r() * 6, h); g.stroke();
  }
  // cenefa pintada en el borde
  const band = 34;
  g.fillStyle = '#c8361f'; g.fillRect(0, 0, band, h); g.fillRect(w - band, 0, band, h);
  for (let y = 10; y < h; y += 36) {
    for (const x of [band / 2, w - band / 2]) {
      g.fillStyle = '#f2c230'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
      g.fillStyle = '#1f5fa8'; g.beginPath(); g.arc(x, y + 18, 5, 0, 7); g.fill();
    }
  }
});

// Fondo del nicho: azul con estrellas pintadas a mano
const nichoTex = () => canvasTex(256, 384, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#173d6e'); gr.addColorStop(1, '#2a5a8f');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rand(9);
  for (let i = 0; i < 46; i++) {
    const x = r() * w, y = r() * h * 0.8, s = 3 + r() * 5;
    g.fillStyle = r() > 0.3 ? '#f2c230' : '#f6f1e4';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? s * 0.45 : s, a = k * Math.PI / 5 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
});

// Tela tejida a rayas
const tejidoTex = () => canvasTex(256, 512, (g, w, h) => {
  const colors = ['#c8361f', '#f2c230', '#1f5fa8', '#2f8f4e', '#f6f1e4', '#7a2f8f', '#e0702a'];
  let y = 0, i = 0;
  while (y < h) {
    const bh = 10 + ((i * 37) % 28);
    g.fillStyle = colors[i % colors.length]; g.fillRect(0, y, w, bh);
    if (bh > 24) {
      g.fillStyle = colors[(i + 3) % colors.length];
      for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x, y + bh / 2); g.lineTo(x + 10, y + 3); g.lineTo(x + 20, y + bh / 2); g.lineTo(x + 10, y + bh - 3); g.fill(); }
    }
    y += bh; i++;
  }
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
});

const placaTex = () => canvasTex(1024, 200, (g, w, h) => {
  g.fillStyle = '#5a3a20'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f2c230'; g.lineWidth = 6; g.strokeRect(12, 12, w - 24, h - 24);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f6f1e4'; g.font = '800 72px "Bricolage Grotesque", sans-serif';
  g.fillText('San José Obrero', w / 2, h * 0.42);
  g.fillStyle = '#f2c230'; g.font = '600 32px "Instrument Sans", sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '4px';
  g.fillText('PROTECTOR DE LOS EMPRENDEDORES', w / 2, h * 0.76);
});

function archShape(width, rectH) {
  const r = width / 2, s = new THREE.Shape();
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, rectH);
  s.absarc(0, rectH, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

function altar(zBack) {
  const z0 = zBack;
  // Muro de ladrillo propio del altar (en medio del patio)
  box(10, 7, 0.4, brickMat(10, 7), 0, 3.5, z0 - 0.18);
  box(10.3, 0.25, 0.6, std(0x23272b, { metalness: 0.7, roughness: 0.3 }), 0, 7.1, z0 - 0.18);

  // Gradas de barro cocido
  const clay = std(0xb5643c, { roughness: 0.85 });
  box(7.2, 0.2, 3.2, clay, 0, 0.1, z0 + 1.6);
  box(5.6, 0.2, 2.4, std(0xa65733, { roughness: 0.85 }), 0, 0.3, z0 + 1.2);
  box(4.4, 0.2, 1.8, clay, 0, 0.5, z0 + 0.9);

  // Camino tejido sobre las gradas
  const tej = std(0xffffff, { map: tejidoTex(), roughness: 0.95 });
  const run1 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.7), tej);
  run1.rotation.x = -Math.PI / 2; run1.position.set(0, 0.605, z0 + 0.95); world.add(run1);
  const run2 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.62), tej);
  run2.position.set(0, 0.3, z0 + 1.805); world.add(run2);

  // Retablo con arco
  const tex = retabloTex();
  tex.repeat.set(1 / 4.2, 1 / 5.2); tex.offset.set(0.5, 0);
  const retablo = new THREE.Mesh(
    new THREE.ExtrudeGeometry(archShape(4.2, 3.1), { depth: 0.25, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 32 }),
    std(0xffffff, { map: tex, roughness: 0.7 }));
  retablo.position.set(0, 0.6, z0 + 0.15); world.add(retablo);
  // Nicho
  const nt = nichoTex(); nt.repeat.set(1 / 2.4, 1 / 3.4); nt.offset.set(0.5, 0);
  const nicho = new THREE.Mesh(new THREE.ShapeGeometry(archShape(2.4, 2.2), 32), new THREE.MeshStandardMaterial({ map: nt, emissive: 0x1a3050, emissiveIntensity: 0.35, roughness: 0.8 }));
  nicho.position.set(0, 0.9, z0 + 0.45); world.add(nicho);
  // Marco dorado del nicho
  const goldMat = std(0xd2a03a, { metalness: 0.7, roughness: 0.3 });
  const marco = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 8, 40, Math.PI), goldMat);
  marco.position.set(0, 0.9 + 2.2, z0 + 0.47); world.add(marco);
  box(0.12, 2.2, 0.12, goldMat, -1.2, 0.9 + 1.1, z0 + 0.47);
  box(0.12, 2.2, 0.12, goldMat, 1.2, 0.9 + 1.1, z0 + 0.47);

  // Placa
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.66), new THREE.MeshStandardMaterial({ map: placaTex(), roughness: 0.6 }));
  placa.position.set(0, 6.25, z0 + 0.06); world.add(placa);

  // Figura tallada de San José
  figuraSanJose(0, 0.6, z0 + 1.05);

  // Ruedas de carreta pintadas a los lados
  for (const sx of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CircleGeometry(1.05, 48), std(0xffffff, { map: carretaTex(), roughness: 0.6 }));
    wheel.position.set(sx * 3.75, 2.4, z0 + 0.12); world.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.07, 10, 48), std(0x3a2414, { roughness: 0.6 }));
    rim.position.set(sx * 3.75, 2.4, z0 + 0.14); world.add(rim);
  }

  // Velas
  candles(-1.75, 0.6, z0 + 1.45, 5);
  candles(1.75, 0.6, z0 + 1.45, 5);
  candles(-2.5, 0.4, z0 + 2.15, 3, false);
  candles(2.5, 0.4, z0 + 2.15, 3, false);

  // Flores en macetas de barro
  flowerPot(-3.2, 0.2, z0 + 2.6); flowerPot(3.2, 0.2, z0 + 2.6);
  flowerPot(-2.1, 0.6, z0 + 0.5, 0.8); flowerPot(2.1, 0.6, z0 + 0.5, 0.8);

  // Luz cenital sobre la figura
  const spot = new THREE.SpotLight(0xffd7a0, 40, 14, 0.5, 0.6, 1.4);
  spot.position.set(0, 9, z0 + 6); spot.target.position.set(0, 2, z0 + 1); world.add(spot, spot.target);

}

function figuraSanJose(x, y, z, opts = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); world.add(g);
  g.scale.setScalar(opts.scale || 1); g.rotation.y = opts.facing || 0;
  const wood = (c) => opts.mat || std(c, { roughness: 0.75 });
  // túnica
  const tunica = new THREE.LatheGeometry([
    [0.5, 0], [0.48, 0.25], [0.42, 0.8], [0.36, 1.35], [0.33, 1.6], [0.26, 1.78], [0.14, 1.88], [0, 1.9],
  ].map(([r, h]) => new THREE.Vector2(r, h)), 32);
  g.add(new THREE.Mesh(tunica, wood(0x6b4a2e)));
  // manto (abierto por delante)
  const manto = new THREE.LatheGeometry([
    [0.55, 0.15], [0.5, 0.7], [0.44, 1.3], [0.4, 1.62], [0.3, 1.82], [0.16, 1.92],
  ].map(([r, h]) => new THREE.Vector2(r, h)), 32, Math.PI * 0.3, Math.PI * 1.4);
  const mm = wood(0xc9902f); mm.side = THREE.DoubleSide;
  g.add(new THREE.Mesh(manto, mm));
  // cinturón
  const cint = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 8, 32), wood(0x3a2414));
  cint.rotation.x = Math.PI / 2; cint.position.y = 1.15; g.add(cint);
  // cabeza, cabello y barba
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), wood(0xc99a6b));
  head.position.y = 2.06; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.168, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), wood(0x4a3424));
  hair.position.set(0, 2.07, -0.012); hair.rotation.x = -0.25; g.add(hair);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), wood(0x4a3424));
  beard.scale.set(1, 1.15, 0.8); beard.position.set(0, 1.97, 0.07); g.add(beard);
  // aureola
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 8, 48), std(0xf2c230, { metalness: 0.8, roughness: 0.25, emissive: 0x8a6010, emissiveIntensity: 0.5 }));
  halo.position.set(0, 2.12, -0.14); g.add(halo);
  // brazo y vara florida con lirios
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.55, 12), wood(0x6b4a2e));
  arm.position.set(0.3, 1.38, 0.18); arm.rotation.set(1.1, 0, 0.55); g.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), wood(0xc99a6b));
  hand.position.set(0.44, 1.3, 0.36); g.add(hand);
  const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 2.3, 8), wood(0x8a5a34));
  vara.position.set(0.44, 1.15, 0.36); g.add(vara);
  const lily = std(0xf8f5ec, { roughness: 0.5, emissive: 0x332f26, emissiveIntensity: 0.3 });
  const leaf = wood(0x3f7f4a);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26, yy = 2.2 + (i % 3) * 0.1;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6, 1, true), lily);
    f.material.side = THREE.DoubleSide;
    f.position.set(0.44 + Math.cos(a) * 0.08, yy, 0.36 + Math.sin(a) * 0.08);
    f.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6 + Math.PI); g.add(f);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), leaf);
    l.scale.set(0.6, 1.6, 0.6); l.position.set(0.44 + Math.cos(a + 0.6) * 0.06, yy - 0.12, 0.36 + Math.sin(a + 0.6) * 0.06); g.add(l);
  }
  // pedestal tallado
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 8), wood(0x5a3a20));
  ped.position.y = -0.0; g.add(ped);
  // caja de herramientas de carpintero a sus pies
  const tb = new THREE.Group(); tb.position.set(-0.72, 0.07, 0.25); tb.rotation.y = 0.35; g.add(tb);
  box(0.5, 0.22, 0.26, wood(0x9b6b43), 0, 0.11, 0, tb);
  box(0.04, 0.16, 0.04, wood(0x6b4a2e), -0.2, 0.3, 0, tb);
  box(0.04, 0.16, 0.04, wood(0x6b4a2e), 0.2, 0.3, 0, tb);
  box(0.44, 0.03, 0.03, wood(0x6b4a2e), 0, 0.38, 0, tb);
  box(0.03, 0.12, 0.34, std(0x9aa3a8, { metalness: 0.8, roughness: 0.3 }), 0.12, 0.26, 0.02, tb); // serrucho
}

function candles(x, y, z, n, light = true) {
  const wax = std(0xf3ead6, { roughness: 0.6 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb547 });
  const r = rand(Math.abs(Math.round(x * 100 + z * 10)) + 3);
  for (let i = 0; i < n; i++) {
    const h = 0.18 + r() * 0.35, rad = 0.045 + r() * 0.035;
    const cx = x + (r() - 0.5) * 0.5, cz = z + (r() - 0.5) * 0.3;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, h, 12), wax);
    c.position.set(cx, y + h / 2, cz); world.add(c);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 8), flameMat);
    fl.position.set(cx, y + h + 0.04, cz); world.add(fl);
    flickers.push({ flame: fl, base: r() * 10 });
  }
  if (light) {
    const l = new THREE.PointLight(0xffa64a, 3, 5, 1.8);
    l.position.set(x, y + 0.7, z + 0.2); world.add(l);
    flickers.push({ light: l, base: r() * 10, i0: 3 });
  }
}

function flowerPot(x, y, z, s = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * s, 0.22 * s, 0.45 * s, 16), std(0xb5643c, { roughness: 0.9 }));
  pot.position.set(x, y + 0.225 * s, z); world.add(pot);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.325 * s, 0.31 * s, 0.06 * s, 16), std(0xf6f1e4, { roughness: 0.8 }));
  band.position.set(x, y + 0.36 * s, z); world.add(band);
  const r = rand(Math.abs(Math.round(x * 31 + z * 17)) + 1);
  const leaf = std(0x3f7f4a, { roughness: 0.8 });
  const petals = [0xf2c230, 0xf8f5ec, 0xd6453d, 0x7a2f8f, 0xe0702a];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 * s, 0), leaf);
    l.position.set(x + (r() - 0.5) * 0.45 * s, y + (0.5 + r() * 0.3) * s, z + (r() - 0.5) * 0.45 * s); world.add(l);
  }
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), std(petals[(r() * petals.length) | 0], { roughness: 0.6 }));
    f.position.set(x + (r() - 0.5) * 0.5 * s, y + (0.62 + r() * 0.4) * s, z + (r() - 0.5) * 0.5 * s); world.add(f);
  }
}


/* =========================================================================
   Locales
   ========================================================================= */
const greyStone = std(0x8d8b86, { roughness: 0.8 });
const whiteStone = std(0xf1efea, { roughness: 0.55 });
const woodMat = std(0x8a6440, { roughness: 0.6 });
const pedestalMat = std(0xffffff, { roughness: 0.25 });
const darkPh = new THREE.MeshBasicMaterial({ color: 0x0b0d0e });
const whitePh = std(0xf7f5f1);

// Celosía de listones de madera detrás de la vitrina (deja ver el local)
const slatTex = canvasTex(256, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = '#9b7350'; g.fillRect(x + 4, 0, 14, h); g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 15, 0, 3, h); }
});
slatTex.wrapS = THREE.RepeatWrapping;

function slotTransform(a) {
  const y = (a.piso - 1) * FH;
  if (a.lado === 'fondo') {
    const w = 2 * GX / 3;
    return { w, y, pos: new THREE.Vector3(-GX + w * (a.k + 0.5), y, -GZ), rotY: 0 };
  }
  const w = 2 * GZ / 5, zc = -GZ + w * (a.k + 0.5);
  return a.lado === 'izquierda'
    ? { w, y, pos: new THREE.Vector3(-GX, y, zc), rotY: Math.PI / 2 }
    : { w, y, pos: new THREE.Vector3(GX, y, zc), rotY: -Math.PI / 2 };
}

function storeShell(T, local) {
  const g = new THREE.Group();
  g.position.copy(T.pos); g.rotation.y = T.rotY; world.add(g);
  const w = T.w;
  for (const sx of [-1, 1]) {
    box(0.5, 1.2, 0.5, greyStone, sx * (w / 2 - 0.25), 0.6, 0, g);
    box(0.5, 4.3, 0.5, whiteStone, sx * (w / 2 - 0.25), 3.35, 0, g);
  }
  box(w, 0.5, 0.4, whiteStone, 0, 5.75, 0, g);
  const num = plane(0.62, 0.23, new THREE.MeshBasicMaterial({ map: numberTex(local) }), g);
  num.position.set(-w / 2 + 0.25, 4.62, 0.26);
  return g;
}

function buildEmpty(a) {
  const T = slotTransform(a);
  const g = storeShell(T, String(a.piso * 100 + a.slot + 1));
  const iw = T.w - 1;
  const p = plane(iw, 5.5, new THREE.MeshStandardMaterial({ map: comingSoonTex, roughness: 0.8 }), g);
  p.position.set(0, 2.75, 0.02);
}

function buildStore(a) {
  const s = a.store;
  const T = slotTransform(a);
  const g = storeShell(T, a.local);
  const w = T.w, iw = w - 1;
  const color = new THREE.Color(s.color || '#22a07a');
  const css = [];

  // --- Interior ---
  const floor = plane(iw, SD, std(0xffffff, { map: woodFloorTex, roughness: 0.5 }), g);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.006, -SD / 2);
  const ct = ceilTex.clone(); ct.needsUpdate = true; ct.repeat.set(iw / 2.5, SD / 2.5);
  const ceil = plane(iw, SD, new THREE.MeshStandardMaterial({ map: ct, emissive: 0xffffff, emissiveMap: ct, emissiveIntensity: 0.55 }), g);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 5.0, -SD / 2);
  const wallTint = new THREE.Color(0xf6f2ea).lerp(color, 0.16);
  const wallMat = std(wallTint, { roughness: 0.8, emissive: wallTint, emissiveIntensity: 0.25 });
  const lw = plane(SD, 5, wallMat, g); lw.rotation.y = Math.PI / 2; lw.position.set(-iw / 2, 2.5, -SD / 2);
  const rw = plane(SD, 5, wallMat, g); rw.rotation.y = -Math.PI / 2; rw.position.set(iw / 2, 2.5, -SD / 2);
  const bw = plane(iw, 5, std(0xf3efe8, { roughness: 0.85, emissive: 0xf3efe8, emissiveIntensity: 0.2 }), g); bw.position.set(0, 2.5, -SD);
  // estantes laterales
  for (const sx of [-1, 1]) {
    box(0.45, 2.7, SD - 2, white, sx * (iw / 2 - 0.23), 1.35, -SD / 2 - 0.3, g);
    const sp = plane(SD - 2, 2.6, new THREE.MeshStandardMaterial({ map: shelfTex, emissive: 0xffffff, emissiveMap: shelfTex, emissiveIntensity: 0.2 }), g);
    sp.rotation.y = -sx * Math.PI / 2; sp.position.set(sx * (iw / 2 - 0.47), 1.35, -SD / 2 - 0.3);
  }

  // --- Video al fondo del local ---
  const vw = Math.min(iw - 1.2, 8.0), vh = vw * 9 / 16, vy = 0.3 + vh / 2;
  const vph = plane(vw, vh, darkPh, g); vph.position.set(0, vy, -SD + 0.01);
  const vHole = plane(vw, vh, holeMat, g); vHole.position.set(0, vy, -SD + 0.02);
  const vid = youtubeId(s.video);
  const screenEl = document.createElement('div');
  screenEl.className = 'mall-screen';
  screenEl.style.width = `${vw / PX}px`; screenEl.style.height = `${vh / PX}px`;
  setThumb(screenEl, vid, s);
  css.push(cssObj(screenEl, vHole, PX));

  // --- Fachada: marco, vidriera y puerta abierta ---
  const xw0 = -iw / 2, xw1 = -iw / 2 + iw * 0.6;
  box(iw, 0.2, 0.25, metalDark, 0, 4.1, 0, g);                         // dintel
  box(0.18, 4.0, 0.25, metalDark, xw1 + 0.09, 2.0, 0, g);               // parteluz entre vitrina y puerta
  box(xw1 - xw0, 0.3, 0.3, metalDark, (xw0 + xw1) / 2, 0.15, 0, g);     // antepecho
  const glass = plane(xw1 - xw0, 3.7, sheenMat, g); glass.position.set((xw0 + xw1) / 2, 2.15, 0.03);
  const slatT = slatTex.clone(); slatT.needsUpdate = true; slatT.repeat.set((xw1 - xw0) / 1.2, 1);
  const slats = plane(xw1 - xw0, 3.7, std(0xffffff, { map: slatT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }), g);
  slats.position.set((xw0 + xw1) / 2, 2.15, -1.9);
  // franja de luz del color de la tienda en el umbral
  box(iw - (xw1 - xw0) - 0.2, 0.03, 0.12, new THREE.MeshBasicMaterial({ color }), (xw1 + 0.18 + iw / 2) / 2, 0.02, 0.05, g);

  // --- Tres productos destacados en la vitrina ---
  const heights = [0.75, 1.05, 0.85];
  (s.productos || []).slice(0, 3).forEach((p, j) => {
    const x = xw0 + (xw1 - xw0) * (0.18 + j * 0.32), h = heights[j], z = -0.95;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, h, 32), pedestalMat);
    ped.position.set(x, h / 2, z); g.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 40), new THREE.MeshBasicMaterial({ color: 0xfff1d8 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, h + 0.005, z); g.add(ring);
    if (!p || (!p.imagen && !p.nombre)) return;
    const cw = 1.05, ch = 1.38;
    const ph = plane(cw, ch, whitePh, g); ph.position.set(x, h + 0.04 + ch / 2, z - 0.01);
    const hole = plane(cw, ch, holeMat, g); hole.position.set(x, h + 0.04 + ch / 2, z);
    const el = document.createElement('div');
    el.className = 'mall-product';
    el.style.width = `${cw / PXP}px`; el.style.height = `${ch / PXP}px`;
    el.style.setProperty('--c', s.color || '#22a07a');
    el.innerHTML = `<div class="ph"></div><div class="lbl"><b></b><span></span></div>`;
    el.querySelector('b').textContent = p.nombre || '';
    el.querySelector('span').textContent = p.precio || '';
    if (p.imagen) {
      const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer';
      im.onload = () => el.querySelector('.ph').appendChild(im);
      im.src = p.imagen;
    }
    css.push(cssObj(el, hole, PXP));
  });

  // --- Letrero de madera con el logo iluminado ---
  const fasciaPh = box(iw, 1.3, 0.1, woodMat, 0, 4.85, 0, g);
  const sHole = plane(iw, 1.3, holeMat, g); sHole.position.set(0, 4.85, 0.06);
  const signEl = document.createElement('div');
  signEl.className = 'mall-sign';
  signEl.style.width = `${iw / PX}px`; signEl.style.height = `${1.3 / PX}px`;
  signEl.style.setProperty('--c', s.color || '#22a07a');
  signEl.innerHTML = `
    <div class="logo"><span>${esc(initials(s.nombre))}</span></div>
    <div class="name">${esc(s.nombre || 'Tienda')}</div>
    <div class="wa">${WA_ICON}<span>${esc(s.whatsapp || '')}</span></div>`;
  if (s.logo) {
    const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer';
    im.onload = () => signEl.querySelector('.logo').prepend(im);
    im.src = s.logo;
  }
  css.push(cssObj(signEl, sHole, PX));

  // Selector invisible para el clic
  const picker = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 5.5, 1.2), new THREE.MeshBasicMaterial({ visible: false }));
  picker.position.set(0, 2.75, -0.4); g.add(picker);
  picker.userData.unit = units.length;
  fasciaPh.userData.unit = units.length;

  g.updateMatrixWorld(true);
  for (const c of css) placeCss(c.obj, c.hole);
  const center = new THREE.Vector3(); vHole.getWorldPosition(center);
  const front = g.localToWorld(new THREE.Vector3(0, 0, 0));
  const view = g.localToWorld(new THREE.Vector3(-0.6, 0, 4.4));
  units.push({
    store: s, a, group: g, picker, css, screenEl, id: vid, live: false, iframe: null, muted: true,
    center, front, view, floorY: T.y, cssOn: true,
  });
}

function cssObj(el, hole, scale) {
  const obj = new CSS3DObject(el);
  obj.scale.setScalar(scale);
  cssScene.add(obj);
  return { obj, hole, scale };
}
function placeCss(obj, mesh) {
  mesh.updateMatrixWorld(true);
  mesh.getWorldPosition(obj.position);
  mesh.getWorldQuaternion(obj.quaternion);
}
function setThumb(el, id, s) {
  el.innerHTML = id
    ? `<img src="${thumbUrl(id)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="novideo">${esc(s.nombre || '')}<small>Sin video</small></div>`;
}

/* Muestra el HTML 3D solo de los locales cercanos (rendimiento) */
function updateCssCulling() {
  const cam = camera.position;
  for (const u of units) {
    const on = u.center.distanceTo(cam) < CSS_DIST;
    if (on === u.cssOn) continue;
    u.cssOn = on;
    for (const c of u.css) { c.obj.visible = on; c.hole.visible = on; }
  }
}

/* =========================================================================
   Construcción completa
   ========================================================================= */
function buildWorld(list) {
  clearWorld();
  stores = list;
  world.add(new THREE.HemisphereLight(0xeaf4ff, 0xc9b99c, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.position.set(60, 110, 80); world.add(sun);
  const atriumLight = new THREE.PointLight(0xffe6c4, 60, 50, 1.4); atriumLight.position.set(0, 15, 0); world.add(atriumLight);
  const lowLight = new THREE.PointLight(0xffe6c4, 30, 34, 1.5); lowLight.position.set(0, 4.5, 10); world.add(lowLight);

  defineSurfaces();
  buildExterior();
  buildShell(list);
  buildFloors();
  buildCourtyard();

  const assigned = assignSlots(list).filter((a) => a.piso > 0);
  const taken = new Set(assigned.map((a) => `${a.piso}-${a.slot}`));
  assigned.forEach((a) => buildStore(a));
  for (let p = 1; p <= FLOORS; p++) {
    for (let sl = 0; sl < 13; sl++) {
      if (taken.has(`${p}-${sl}`)) continue;
      const info = sl < 10 ? { lado: sl % 2 === 0 ? 'izquierda' : 'derecha', k: Math.floor(sl / 2) } : { lado: 'fondo', k: sl - 10 };
      buildEmpty({ piso: p, slot: sl, ...info });
    }
  }
  renderDirectory();
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>';

/* =========================================================================
   Videos: solo los más cercanos se reproducen; el resto muestra la miniatura
   ========================================================================= */
let soundOn = false;
let soundUnit = -1;

function updateLive() {
  const cam = camera.position;
  const ranked = units
    .map((u, i) => ({ u, i, d: u.center.distanceTo(cam) + Math.abs(u.floorY - feet) * 2 }))
    .filter((x) => x.u.id && x.d < LIVE_DIST + (x.u.live ? 4 : 0))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_LIVE);
  const want = new Set(ranked.map((x) => x.i));
  units.forEach((u, i) => {
    if (want.has(i) && !u.live) {
      u.live = true;
      const f = document.createElement('iframe');
      f.src = embedUrl(u.id, { muted: true });
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.title = `Video de ${u.store.nombre}`;
      f.setAttribute('frameborder', '0');
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      u.screenEl.innerHTML = '';
      u.screenEl.appendChild(f);
      u.iframe = f; u.muted = true;
      f.addEventListener('load', () => {
        // el reproductor tarda un poco en aceptar órdenes
        try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch { /* */ }
        [700, 1800].forEach((ms) => setTimeout(() => { if (u.iframe === f) { u.muted = true; syncSound(); } }, ms));
      });
    } else if (!want.has(i) && u.live) {
      u.live = false; u.iframe = null;
      setThumb(u.screenEl, u.id, u.store);
    }
  });
  syncSound();
}

function ytCommand(u, func, args = []) {
  try { u.iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch { /* */ }
}

// Con sonido activado suena la tienda que miras (o la más cercana)
function syncSound() {
  let target = -1;
  if (soundOn) {
    if (focused >= 0 && units[focused]?.live) target = focused;
    else {
      let best = Infinity;
      units.forEach((u, i) => { if (u.live) { const d = u.center.distanceTo(camera.position); if (d < best) { best = d; target = i; } } });
    }
  }
  soundUnit = target;
  units.forEach((u, i) => {
    if (!u.live) return;
    if (i === target && u.muted) { ytCommand(u, 'unMute'); ytCommand(u, 'setVolume', [70]); ytCommand(u, 'playVideo'); u.muted = false; }
    else if (i !== target && !u.muted) { ytCommand(u, 'mute'); u.muted = true; }
  });
}

const btnSound = document.getElementById('btn-sound');
function setSound(on) {
  soundOn = on;
  btnSound.setAttribute('aria-pressed', String(on));
  btnSound.textContent = on ? 'Sonido: encendido' : 'Sonido: apagado';
  syncSound();
}
btnSound.addEventListener('click', () => setSound(!soundOn));


/* =========================================================================
   Movimiento y mirada
   ========================================================================= */
let state = 'outside';   // outside → entering → inside
let yaw = 0, pitch = 0, feet = 0;
const keys = new Set();
const vel = new THREE.Vector3();
let joy = { x: 0, y: 0 };
let autoWalk = null;
let bob = 0;
const floorOf = (y) => Math.max(0, Math.min(FLOORS - 1, Math.round(y / FH)));

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (state !== 'inside') { if (e.code === 'Enter' && state === 'outside') enterMall(); return; }
  keys.add(e.code);
  if (e.code === 'KeyE' && focused >= 0) openWhatsApp(units[focused].store);
  if (e.code === 'KeyM') setSound(!soundOn);
  if (e.code === 'KeyT') toggleDirectory(true);
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') goFloor(Number(e.code.slice(-1)) - 1);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const canvas = renderer.domElement;
const isLocked = () => document.pointerLockElement === canvas;
function lockPointer() {
  if (isTouch || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* */ }
}

document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', isLocked());
  if (!isLocked()) keys.clear();
});
document.addEventListener('mousemove', (e) => {
  if (!isLocked() || state !== 'inside') return;
  if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  autoWalk = null;
});

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (isLocked() || state !== 'inside') return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (state !== 'inside') return;
  if (!isLocked()) updateHoverFromPointer(e);
  if (!drag || drag.id !== e.pointerId) return;
  const k = e.pointerType === 'mouse' ? 0.004 : 0.006;
  yaw += (e.clientX - drag.x) * k;
  pitch += (e.clientY - drag.y) * k;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) autoWalk = null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
  const quick = performance.now() - drag.t < 450;
  drag = null;
  if (moved < 8 && quick) onTap(e);
});
canvas.addEventListener('click', () => {
  if (state === 'inside' && isLocked() && focused >= 0) openWebsite(units[focused].store);
});

function onTap(e) {
  const hit = pickAt(e.clientX, e.clientY);
  if (hit >= 0) {
    if (e.pointerType === 'mouse') { openWebsite(units[hit].store); return; }
    setFocus(hit); pinned = hit; return;
  }
  pinned = -1;
  if (e.pointerType === 'mouse') lockPointer();
}

// Joystick
const joyEl = document.getElementById('joystick');
const knob = joyEl.querySelector('.knob');
let joyId = null;
joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy = { x: 0, y: 0 }; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  joy = { x: dx, y: dy };
  knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  autoWalk = null;
}

const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function step(dt, rawDt) {
  const p = camera.position;
  if (autoWalk) {
    autoWalk.t = Math.min(1, autoWalk.t + rawDt / autoWalk.dur);
    const e = ease(autoWalk.t);
    p.x = autoWalk.from.x + (autoWalk.to.x - autoWalk.from.x) * e;
    p.z = autoWalk.from.z + (autoWalk.to.z - autoWalk.from.z) * e;
    feet = autoWalk.from.y + (autoWalk.to.y - autoWalk.from.y) * e;
    yaw = autoWalk.yaw0 + angleDiff(autoWalk.yaw0, autoWalk.yaw) * e;
    pitch = autoWalk.pitch0 + (autoWalk.pitch - autoWalk.pitch0) * e;
    if (autoWalk.t >= 1) autoWalk = null;
    p.y = feet + EYE;
    camera.rotation.set(pitch, yaw, 0);
    return;
  }
  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
  f -= joy.y; r += joy.x;
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = run ? 8 : 4.2;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const target = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
  if (target.lengthSq() > 1) target.normalize();
  target.multiplyScalar(speed);
  vel.lerp(target, 1 - Math.exp(-dt * 10));

  const nx = p.x + vel.x * dt, nz = p.z + vel.z * dt;
  let h = groundAt(nx, nz, feet);
  if (h !== null) { p.x = nx; p.z = nz; }
  else if ((h = groundAt(nx, p.z, feet)) !== null) { p.x = nx; vel.z = 0; }
  else if ((h = groundAt(p.x, nz, feet)) !== null) { p.z = nz; vel.x = 0; }
  else { vel.set(0, 0, 0); h = feet; }
  feet = h;
  const sp = Math.hypot(vel.x, vel.z);
  bob += dt * sp * 2.2;
  p.y = feet + EYE + Math.sin(bob) * 0.035 * Math.min(1, sp / 4);
  camera.rotation.set(pitch, yaw, 0);
  updateFloorChips();
}

const fadeEl = document.getElementById('fade');
function teleport(to, tYaw, tPitch = 0) {
  fadeEl.classList.add('on');
  setTimeout(() => {
    camera.position.set(to.x, to.y + EYE, to.z); feet = to.y; yaw = tYaw; pitch = tPitch; vel.set(0, 0, 0); autoWalk = null;
    camera.rotation.set(pitch, yaw, 0);
    updateLive(); updateCssCulling(); updateFloorChips();
    fadeEl.classList.remove('on');
  }, 380);
}

function walkTo(i) {
  const u = units[i]; if (!u) return;
  const to = new THREE.Vector3(u.view.x, u.floorY, u.view.z);
  const look = u.front.clone(); look.y = u.floorY + 2.6;
  const dir = look.clone().sub(new THREE.Vector3(to.x, to.y + EYE, to.z));
  const tYaw = Math.atan2(-dir.x, -dir.z);
  const tPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  if (floorOf(feet) !== floorOf(u.floorY)) { teleport(to, tYaw, tPitch); return; }
  const from = new THREE.Vector3(camera.position.x, feet, camera.position.z);
  const dist = from.distanceTo(to);
  autoWalk = { from, to, yaw0: yaw, yaw: tYaw, pitch0: pitch, pitch: tPitch, t: 0, dur: Math.min(4, 0.8 + dist / 12) };
  vel.set(0, 0, 0);
}

function goFloor(f) {
  if (state !== 'inside') return;
  if (f === 0) teleport(new THREE.Vector3(0, 0, 20), 0, 0);
  else teleport(new THREE.Vector3(0, f * FH, 24.4), Math.PI, -0.05);
}

const floorChips = [...document.querySelectorAll('[data-floor]')];
floorChips.forEach((b) => b.addEventListener('click', () => goFloor(Number(b.dataset.floor))));
let lastFloor = -1;
function updateFloorChips() {
  const f = floorOf(feet);
  if (f === lastFloor) return;
  lastFloor = f;
  floorChips.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === f)));
}

/* =========================================================================
   Selección de tienda
   ========================================================================= */
const raycaster = new THREE.Raycaster();
raycaster.far = 20;
let focused = -1;
let pinned = -1;
let hoverPointer = -1;

function hitUnit(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects([...units.map((u) => u.picker), ...blockers], false)[0];
  return hit && hit.object.userData.unit !== undefined ? { i: hit.object.userData.unit, d: hit.distance } : null;
}
function pickAt(x, y) {
  const h = hitUnit(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1));
  return h ? h.i : -1;
}
function updateHoverFromPointer(e) {
  if (e.pointerType !== 'mouse') return;
  hoverPointer = pickAt(e.clientX, e.clientY);
  canvas.style.cursor = hoverPointer >= 0 ? 'pointer' : 'grab';
}

const crosshair = document.getElementById('crosshair');
const card = document.getElementById('store-card');
const cardEls = {
  logo: document.getElementById('card-logo'), cat: document.getElementById('card-cat'),
  local: document.getElementById('card-local'), name: document.getElementById('card-name'),
  waNum: document.getElementById('card-wa-num'), web: document.getElementById('card-web'), wa: document.getElementById('card-wa'),
};

function setFocus(i) {
  if (i === focused) return;
  focused = i;
  crosshair.classList.toggle('on', i >= 0);
  if (i < 0) { card.hidden = true; document.body.classList.remove('has-card'); syncSound(); return; }
  const u = units[i], s = u.store;
  cardEls.logo.style.visibility = 'hidden';
  cardEls.logo.onload = () => { cardEls.logo.style.visibility = ''; };
  cardEls.logo.onerror = () => { cardEls.logo.style.visibility = 'hidden'; };
  if (s.logo) cardEls.logo.src = s.logo; else cardEls.logo.removeAttribute('src');
  cardEls.cat.textContent = s.categoria || 'Tienda';
  cardEls.local.textContent = `${u.a.local} · Piso ${u.a.piso}`;
  cardEls.name.textContent = s.nombre || 'Tienda';
  cardEls.waNum.textContent = s.whatsapp || 'sin número';
  cardEls.web.href = normalizeUrl(s.web) || '#';
  cardEls.wa.href = waLink(s.whatsapp);
  cardEls.wa.hidden = !s.whatsapp;
  card.hidden = false;
  document.body.classList.add('has-card');
  syncSound();
}

function updateFocus() {
  if (state !== 'inside') { setFocus(-1); return; }
  if (isLocked()) { const h = hitUnit(new THREE.Vector2(0, 0)); setFocus(h ? h.i : -1); }
  else if (pinned >= 0) setFocus(pinned);
  else if (hoverPointer >= 0) setFocus(hoverPointer);
  else { const h = hitUnit(new THREE.Vector2(0, 0)); setFocus(h && h.d < 11 ? h.i : -1); }
}

function openWebsite(s) {
  const url = normalizeUrl(s.web);
  if (!url) return;
  if (isLocked()) document.exitPointerLock();
  window.open(url, '_blank', 'noopener');
}
function openWhatsApp(s) {
  if (!s.whatsapp) return;
  if (isLocked()) document.exitPointerLock();
  window.open(waLink(s.whatsapp), '_blank', 'noopener');
}

/* =========================================================================
   Directorio con filtro por categoría
   ========================================================================= */
const dir = document.getElementById('directory');
const dirList = document.getElementById('dir-list');
const dirFilters = document.getElementById('dir-filters');
let dirFilter = 'Todas';
const catOf = (s) => (s.categoria || '').trim() || 'Otros';

function renderDirectory() {
  const counts = new Map();
  units.forEach((u) => { const c = catOf(u.store); counts.set(c, (counts.get(c) || 0) + 1); });
  const cats = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  if (dirFilter !== 'Todas' && !counts.has(dirFilter)) dirFilter = 'Todas';
  dirFilters.innerHTML = '';
  [['Todas', units.length], ...cats.map((c) => [c, counts.get(c)])].forEach(([c, n]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'filter';
    b.setAttribute('aria-pressed', String(c === dirFilter));
    b.innerHTML = '<span></span> <small></small>';
    b.querySelector('span').textContent = c;
    b.querySelector('small').textContent = n;
    b.addEventListener('click', () => { dirFilter = c; renderDirectory(); });
    dirFilters.appendChild(b);
  });
  dirList.innerHTML = '';
  let shown = 0;
  units.forEach((u, i) => {
    const s = u.store;
    if (dirFilter !== 'Todas' && catOf(s) !== dirFilter) return;
    shown++;
    const li = document.createElement('li');
    li.innerHTML = `<button type="button"><img alt="" referrerpolicy="no-referrer"><span><span class="n"></span><span class="c"></span></span><span class="l"></span></button>`;
    const img = li.querySelector('img');
    img.style.visibility = 'hidden';
    img.onload = () => { img.style.visibility = ''; };
    if (s.logo) img.src = s.logo;
    li.querySelector('.n').textContent = s.nombre || 'Tienda';
    li.querySelector('.c').textContent = `${catOf(s)} · Piso ${u.a.piso}`;
    li.querySelector('.l').textContent = `L-${u.a.local}`;
    li.querySelector('button').addEventListener('click', () => { toggleDirectory(false); pinned = -1; walkTo(i); });
    dirList.appendChild(li);
  });
  document.getElementById('dir-empty').hidden = shown > 0;
}
function toggleDirectory(show) {
  if (show && isLocked()) document.exitPointerLock();
  dir.hidden = !show;
}
document.getElementById('btn-dir').addEventListener('click', () => toggleDirectory(dir.hidden));
document.getElementById('dir-close').addEventListener('click', () => toggleDirectory(false));

/* =========================================================================
   Llegada: vista exterior y entrada con zoom
   ========================================================================= */
const intro = document.getElementById('intro');
const OUT_POS = new THREE.Vector3(-30, 6.5, 84);
const OUT_LOOK = new THREE.Vector3(-14, 10.5, 27);
let enterAnim = null;

function placeOutside(t) {
  const sway = Math.sin(t * 0.12);
  camera.position.set(OUT_POS.x + sway * 4, OUT_POS.y + Math.sin(t * 0.2) * 0.4, OUT_POS.z);
  camera.lookAt(OUT_LOOK);
}

function enterMall() {
  if (state !== 'outside') return;
  state = 'entering';
  intro.classList.add('leaving');
  setTimeout(() => { intro.hidden = true; }, 700);
  lockPointer();
  const start = camera.position.clone();
  enterAnim = {
    t: 0, dur: 5.2,
    curve: new THREE.CatmullRomCurve3([start, new THREE.Vector3(-7, 5, 66), new THREE.Vector3(-0.5, 2.3, 42), new THREE.Vector3(0, EYE, 31), new THREE.Vector3(0, EYE, 21)]),
    lookA: OUT_LOOK.clone(), lookB: new THREE.Vector3(0, EYE + 0.4, -10),
  };
}
document.getElementById('btn-enter').addEventListener('click', enterMall);

function stepEnter(rawDt) {
  const a = enterAnim;
  a.t = Math.min(1, a.t + rawDt / a.dur);
  const e = ease(a.t);
  camera.position.copy(a.curve.getPoint(e));
  const look = a.lookA.clone().lerp(a.lookB, Math.min(1, e * 1.25));
  camera.lookAt(look);
  camera.fov = 62 + Math.sin(e * Math.PI) * 6; camera.updateProjectionMatrix();
  if (a.t >= 1) {
    enterAnim = null; state = 'inside';
    feet = 0; yaw = 0; pitch = 0; camera.fov = 70; camera.updateProjectionMatrix();
    document.body.classList.remove('outside');
    updateFloorChips();
  }
}

function updateDoors() {
  const d = Math.hypot(camera.position.x, camera.position.z - GZ);
  const open = Math.max(0, Math.min(1, (16 - d) / 7));
  for (const dr of doors) dr.g.position.x = dr.x0 + dr.side * open * 2.9;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});

async function boot() {
  try { await Promise.all([document.fonts.load('800 40px "Bricolage Grotesque"'), document.fonts.load('600 20px "Instrument Sans"'), document.fonts.load('700 20px "Instrument Sans"')]); } catch { /* */ }
  const { list } = await loadStores();
  buildWorld(list);
  placeOutside(0);
  updateCssCulling();
  updateLive();
  document.body.classList.add('ready');
}

addEventListener('storage', async (e) => {
  if (e.key !== STORAGE_KEY) return;
  const { list } = await loadStores();
  focused = -1; pinned = -1; setFocus(-1);
  buildWorld(list);
  updateCssCulling(); updateLive();
});

// Acceso para pruebas desde la consola del navegador
window.__mall = {
  camera, walkTo, enterMall,
  setView: (x, y, z, yw = 0, p = 0) => { state = 'inside'; document.body.classList.remove('outside'); intro.hidden = true; camera.position.set(x, y + EYE, z); feet = y; yaw = yw; pitch = p; autoWalk = null; enterAnim = null; },
};

const clock = new THREE.Clock();
let liveTimer = 0;
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(0.05, raw), rdt = Math.min(raw, 0.25);
  const t = clock.elapsedTime;
  if (state === 'outside') placeOutside(t);
  else if (state === 'entering') stepEnter(rdt);
  else step(dt, rdt);
  updateDoors();
  liveTimer += rdt;
  if (liveTimer > 0.5) { liveTimer = 0; updateCssCulling(); updateLive(); }
  updateFocus();
  for (const f of flickers) {
    const n = Math.sin(t * 9 + f.base) * 0.5 + Math.sin(t * 23 + f.base * 2) * 0.3;
    if (f.light) f.light.intensity = f.i0 * (0.85 + n * 0.15);
    else f.flame.scale.set(1, 1 + n * 0.18, 1);
  }
  for (const sp of spinners) if (sp.water) sp.water.material.emissiveIntensity = 0.45 + Math.sin(t * 1.6) * 0.08;
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
  requestAnimationFrame(frame);
}

document.body.classList.add('outside');
boot().then(frame);
