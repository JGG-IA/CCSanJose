import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/css3d';
import {
  loadStores, youtubeId, embedUrl, thumbUrl, waLink, normalizeUrl, initials, STORAGE_KEY,
} from './data.js';

/* =========================================================================
   Medidas del edificio (metros)
   ========================================================================= */
const W = 12;          // ancho del pasillo
const H = 7;           // alto del techo
const SLOT = 10;       // largo de cada local
const EYE = 1.7;       // altura de los ojos
const PX = 0.005;      // metros por píxel en los elementos HTML 3D
const ENTRY = 16;      // largo del vestíbulo de entrada (z positivo)
const ATRIUM = 18;     // largo del atrio del fondo

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const MAX_LIVE = isTouch ? 3 : 6;   // videos reproduciéndose a la vez
const LIVE_DIST = 30;

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
renderer.toneMappingExposure = 1.05;
glLayer.appendChild(renderer.domElement);

const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
cssLayer.appendChild(cssRenderer.domElement);

const scene = new THREE.Scene();
const cssScene = new THREE.Scene();
const BG = new THREE.Color('#dfe7e4');
scene.background = BG;
scene.fog = new THREE.Fog(BG, 40, 140);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';
camera.position.set(0, EYE, ENTRY - 3);

// Material que "perfora" el WebGL para dejar ver el HTML de abajo
const holeMat = new THREE.MeshBasicMaterial({
  color: 0x000000, opacity: 0, transparent: false, blending: THREE.NoBlending,
  side: THREE.FrontSide, fog: false, toneMapped: false,
});

/* =========================================================================
   Texturas procedurales
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

// Terrazo con juntas cada 2 m (la textura cubre 4 m x 4 m)
const terrazzo = (len) => canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#e8e3da'; g.fillRect(0, 0, w, h);
  const r = rand(7);
  const chips = ['#b9b1a4', '#9c8f7d', '#d3c9b8', '#7e8f88', '#c7a98a', '#f5f2ec'];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = chips[(r() * chips.length) | 0];
    const s = r() * 5 + 1;
    g.globalAlpha = 0.35 + r() * 0.5;
    g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.6), r() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(90,80,66,0.35)'; g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke();
    g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke();
  }
}, [W / 4, len / 4]);

const runner = (len) => canvasTex(256, 1024, (g, w, h) => {
  g.fillStyle = '#2f4a43'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c99a3a'; g.fillRect(10, 0, 6, h); g.fillRect(w - 16, 0, 6, h);
  const r = rand(3);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}, [1, len / 8]);

function brandTexture(w, h, { title = 'SAN JOSÉ', sub = 'Centro Comercial Virtual', bg = '#163a33', fg = '#f3f1ea', accent = '#f2b134' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, h - h * 0.06, w, h * 0.06);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    g.font = `800 ${h * 0.46}px "Bricolage Grotesque", sans-serif`;
    if (g.letterSpacing !== undefined) g.letterSpacing = `${h * 0.03}px`;
    g.fillText(title, w / 2, h * 0.4);
    g.font = `500 ${h * 0.16}px "Bricolage Grotesque", sans-serif`;
    if (g.letterSpacing !== undefined) g.letterSpacing = `${h * 0.02}px`;
    g.fillStyle = accent;
    g.fillText(sub.toUpperCase(), w / 2, h * 0.76);
  });
}

/* =========================================================================
   Mundo
   ========================================================================= */
const world = new THREE.Group();
scene.add(world);
let stores = [];
let units = [];            // { store, group, picker, screenEl, screenObj, signObj, id, live, iframe }
let colliders = [];        // círculos { x, z, r }
let bounds = { zMin: 0, zMax: ENTRY - 1 };

function std(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts }); }

function box(w, h, d, mat, x, y, z, parent = world) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

function clearWorld() {
  world.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m !== holeMat) { m.map?.dispose(); m.dispose(); } });
    }
  });
  world.clear();
  for (const u of units) { cssScene.remove(u.screenObj); cssScene.remove(u.signObj); }
  units = []; colliders = []; spinners = []; flickers = [];
}

function buildWorld(list) {
  clearWorld();
  stores = list;
  const perSide = Math.max(1, Math.ceil(list.length / 2));
  const zEnd = -perSide * SLOT;              // donde termina el pasillo de locales
  const zBack = zEnd - ATRIUM;               // pared del fondo
  const len = ENTRY - zBack;
  const zMid = (ENTRY + zBack) / 2;
  bounds = { zMin: zBack + 4.2, zMax: ENTRY - 1 };

  // Luces
  world.add(new THREE.HemisphereLight(0xffffff, 0xcfc3b0, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.1);
  sun.position.set(4, 20, 6); world.add(sun);
  const nLights = Math.min(6, Math.ceil(len / 22));
  for (let i = 0; i < nLights; i++) {
    const p = new THREE.PointLight(0xffe2b8, 18, 26, 1.6);
    p.position.set(0, H - 1, ENTRY - (i + 0.5) * (len / nLights));
    world.add(p);
  }

  // Piso
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, len), std(0xffffff, { map: terrazzo(len), roughness: 0.32 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zMid); world.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len - 6), std(0xffffff, { map: runner(len), roughness: 0.9 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, zMid); world.add(rug);

  // Techo con tragaluz y vigas
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, len), std(0xf4f2ee, { roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zMid); world.add(ceil);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4.4, len - 2), new THREE.MeshBasicMaterial({ color: 0xeaf6ff, fog: false }));
  sky.rotation.x = Math.PI / 2; sky.position.set(0, H - 0.01, zMid); world.add(sky);
  const beamMat = std(0x8a6a4a, { roughness: 0.7 });
  for (let z = ENTRY - 1; z > zBack + 1; z -= 2.5) box(4.6, 0.18, 0.14, beamMat, 0, H - 0.1, z);
  box(0.2, 0.25, len, beamMat, -2.25, H - 0.12, zMid);
  box(0.2, 0.25, len, beamMat, 2.25, H - 0.12, zMid);

  // Paredes
  const wallMat = std(0xf2efe9, { roughness: 0.85 });
  box(0.4, H, len, wallMat, -W / 2 - 0.2, H / 2, zMid);
  box(0.4, H, len, wallMat, W / 2 + 0.2, H / 2, zMid);
  box(W + 0.8, H, 0.4, wallMat, 0, H / 2, zBack - 0.2);
  // zócalo de madera
  const baseMat = std(0x6f533a, { roughness: 0.55 });
  box(0.05, 0.25, len, baseMat, -W / 2 + 0.02, 0.125, zMid);
  box(0.05, 0.25, len, baseMat, W / 2 - 0.02, 0.125, zMid);

  // Entrada de vidrio (detrás del punto de inicio)
  const glassOut = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({
    map: canvasTex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#9fd3f0'); gr.addColorStop(0.62, '#e7f4fb'); gr.addColorStop(0.63, '#7fae7a'); gr.addColorStop(1, '#5d8c5a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }), fog: false,
  }));
  glassOut.rotation.y = Math.PI; glassOut.position.set(0, H / 2, ENTRY + 0.4); world.add(glassOut);
  const frameMat = std(0x2b2f33, { metalness: 0.6, roughness: 0.35 });
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 2) box(0.12, H, 0.12, frameMat, x, H / 2, ENTRY + 0.3);
  box(W, 0.12, 0.12, frameMat, 0, 3.2, ENTRY + 0.3);
  box(W, 0.3, 0.3, frameMat, 0, H - 0.15, ENTRY + 0.3);

  // Arco con el nombre del centro comercial
  const archTex = brandTexture(2048, 340);
  const archMat = new THREE.MeshStandardMaterial({ map: archTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: archTex, emissiveIntensity: 0.35 });
  box(W, 1.7, 0.4, std(0x163a33), 0, H - 0.85, 2);
  const archFront = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.7), archMat);
  archFront.position.set(0, H - 0.85, 2.21); world.add(archFront);
  const archBack = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.7), archMat);
  archBack.rotation.y = Math.PI; archBack.position.set(0, H - 0.85, 1.79); world.add(archBack);

  // Macetas de bienvenida en el vestíbulo
  planter(-4, 9); planter(4, 9);

  // Locales
  list.forEach((s, i) => buildUnit(s, i));

  // Columnas de ladrillo entre locales
  for (let k = 0; k <= perSide; k++) {
    const z = -k * SLOT;
    brickColumn(-1, z); brickColumn(1, z);
  }
  // Muebles en el centro del pasillo: maceteros y bancas alternados
  for (let k = 1; k < perSide; k++) {
    const z = -k * SLOT;
    if (k % 2) planter(0, z); else bench(0, z);
  }

  // Atrio: altar artesanal a San José
  altar(zBack);
  benchAcross(-2.6, zBack + 9.5); benchAcross(2.6, zBack + 9.5);
  planter(-4.6, zEnd - 2.5); planter(4.6, zEnd - 2.5);

  renderDirectory();
}

/* ---------- Columnas de ladrillo ---------- */
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

function brickColumn(side, z) {
  const cw = 1.2, cd = 1.0;
  const x = side * (W / 2 - cd / 2);
  const front = brickMat(cd, H), lateral = brickMat(cw, H);
  // caras: +x, -x, +y, -y, +z, -z
  const m = new THREE.Mesh(new THREE.BoxGeometry(cd, H - 0.5, cw),
    [lateral, lateral, std(0x2a2522), std(0x2a2522), front, front]);
  m.position.set(x, (H - 0.5) / 2 + 0.25, z); world.add(m);
  // base de concreto y remate metálico
  box(cd + 0.08, 0.25, cw + 0.08, std(0x6d6a66, { roughness: 0.7 }), x, 0.125, z);
  box(cd + 0.1, 0.25, cw + 0.1, std(0x23272b, { metalness: 0.7, roughness: 0.3 }), x, H - 0.125, z);
  // tira de luz cálida en la cara del pasillo
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 1.4, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  strip.position.set(x - side * (cd / 2 + 0.01), H / 2, z); world.add(strip);
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
  colliders.push({ x, z, r: 1.15 });
}

function bench(x, z) {
  const wood = std(0x9b6b43, { roughness: 0.55 });
  const metal = std(0x2b2f33, { metalness: 0.6, roughness: 0.4 });
  box(0.6, 0.08, 2.6, wood, x, 0.46, z);
  box(0.5, 0.42, 0.08, metal, x, 0.21, z - 1.1);
  box(0.5, 0.42, 0.08, metal, x, 0.21, z + 1.1);
  colliders.push({ x, z: z - 0.8, r: 0.7 }, { x, z: z + 0.8, r: 0.7 });
}

function benchAcross(x, z) {
  const wood = std(0x9b6b43, { roughness: 0.55 });
  const metal = std(0x2b2f33, { metalness: 0.6, roughness: 0.4 });
  box(2.6, 0.08, 0.6, wood, x, 0.46, z);
  box(2.6, 0.5, 0.06, wood, x, 0.8, z + 0.3);
  box(0.08, 0.42, 0.5, metal, x - 1.1, 0.21, z);
  box(0.08, 0.42, 0.5, metal, x + 1.1, 0.21, z);
  colliders.push({ x: x - 0.8, z, r: 0.7 }, { x: x + 0.8, z, r: 0.7 });
}

/* =========================================================================
   Altar artesanal a San José (al fondo del pasillo)
   ========================================================================= */
let flickers = [];   // { light, flame, base }

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
  flickers = [];
  // Pared de ladrillo del fondo
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), brickMat(W, H));
  wall.position.set(0, H / 2, z0 + 0.02); world.add(wall);

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
  spot.position.set(0, H - 0.3, z0 + 5); spot.target.position.set(0, 2, z0 + 1); world.add(spot, spot.target);

  bounds.zMin = z0 + 4.2;
}

function figuraSanJose(x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); world.add(g);
  const wood = (c) => std(c, { roughness: 0.75 });
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

/* ---------- Un local: toda la fachada es el video ---------- */
function buildUnit(s, i) {
  const side = i % 2 === 0 ? -1 : 1;
  const k = Math.floor(i / 2);
  const zc = -SLOT * (k + 0.5);
  const g = new THREE.Group();
  g.position.set(side * (W / 2), 0, zc);
  g.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;  // mirando hacia el pasillo
  world.add(g);

  const color = new THREE.Color(s.color || '#22a07a');
  const FW = SLOT - 1.2;                 // ancho libre entre columnas
  const vidW = FW - 0.2, vidH = vidW * 9 / 16, vidY = 0.35 + vidH / 2;
  const signW = vidW, signH = 0.95, signY = 0.35 + vidH + 0.12 + signH / 2;

  // Muro de fondo y friso
  const facade = box(FW, H - 0.6, 0.3, std(0x15181b, { roughness: 0.5 }), 0, (H - 0.6) / 2, 0.15, g);
  box(FW, 0.6, 0.32, std(0xe9e4dc, { roughness: 0.5 }), 0, H - 0.3, 0.16, g);

  // Hueco del video (toda la fachada) y del letrero
  const screenHole = new THREE.Mesh(new THREE.PlaneGeometry(vidW, vidH), holeMat);
  screenHole.position.set(0, vidY, 0.31); g.add(screenHole);
  const signHole = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), holeMat);
  signHole.position.set(0, signY, 0.31); g.add(signHole);

  // Marco metálico delgado y zócalo del color de la tienda
  const metal = std(0x23272b, { metalness: 0.75, roughness: 0.3 });
  const fz = 0.62;
  box(vidW + 0.16, 0.08, 0.1, metal, 0, 0.35 + vidH + 0.04, fz, g);
  box(vidW + 0.16, 0.35, 0.34, std(color, { roughness: 0.45 }), 0, 0.175, 0.47, g);
  box(0.08, vidH + 0.43, 0.1, metal, -vidW / 2 - 0.04, (vidH + 0.43) / 2, fz, g);
  box(0.08, vidH + 0.43, 0.1, metal, vidW / 2 + 0.04, (vidH + 0.43) / 2, fz, g);
  // luz del color de la tienda en el piso
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(vidW, 0.1), new THREE.MeshBasicMaterial({ color }));
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.01, 0.9); g.add(strip);


  // Selector invisible para el clic (toda la fachada)
  const picker = new THREE.Mesh(new THREE.BoxGeometry(FW, H - 0.6, 1.4), new THREE.MeshBasicMaterial({ visible: false }));
  picker.position.set(0, (H - 0.6) / 2, 0.7); g.add(picker);
  picker.userData.unit = i; facade.userData.unit = i;

  g.updateMatrixWorld(true);

  // ---- Video (HTML) ----
  const vid = youtubeId(s.video);
  const screenEl = document.createElement('div');
  screenEl.className = 'mall-screen';
  screenEl.style.width = `${vidW / PX}px`;
  screenEl.style.height = `${vidH / PX}px`;
  setThumb(screenEl, vid, s);
  const screenObj = new CSS3DObject(screenEl);
  placeCss(screenObj, screenHole);
  cssScene.add(screenObj);

  // ---- Letrero con logo, nombre y WhatsApp (HTML) ----
  const signEl = document.createElement('div');
  signEl.className = 'mall-sign';
  signEl.style.width = `${signW / PX}px`;
  signEl.style.height = `${signH / PX}px`;
  signEl.style.setProperty('--c', s.color || '#22a07a');
  signEl.innerHTML = `
    <div class="logo"><span>${esc(initials(s.nombre))}</span></div>
    <div class="txt">
      <div class="name">${esc(s.nombre || 'Tienda')}</div>
      <div class="meta">${esc(s.categoria || '')}${s.local ? ` · Local ${esc(s.local)}` : ''}</div>
    </div>
    <div class="wa">${WA_ICON}<span>${esc(s.whatsapp || '')}</span></div>`;
  if (s.logo) {
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => signEl.querySelector('.logo').prepend(img);
    img.src = s.logo;
  }
  const signObj = new CSS3DObject(signEl);
  placeCss(signObj, signHole);
  cssScene.add(signObj);

  const center = new THREE.Vector3();
  screenHole.getWorldPosition(center);
  units.push({ store: s, group: g, picker, screenEl, screenObj, signObj, id: vid, live: false, iframe: null, center, side, zc, muted: true });
}

let spinners = [];

function placeCss(obj, mesh) {
  mesh.updateMatrixWorld(true);
  mesh.getWorldPosition(obj.position);
  mesh.getWorldQuaternion(obj.quaternion);
  obj.scale.setScalar(PX);
}

function setThumb(el, id, s) {
  el.innerHTML = id
    ? `<img src="${thumbUrl(id)}" alt="" referrerpolicy="no-referrer">`
    : `<div class="novideo">${esc(s.nombre || '')}<small>Sin video</small></div>`;
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
    .map((u, i) => ({ u, i, d: u.center.distanceTo(cam) }))
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
let yaw = 0, pitch = 0;
const keys = new Set();
const vel = new THREE.Vector3();
let joy = { x: 0, y: 0 };
let autoWalk = null;   // { pos, yaw, pitch, t }
let bob = 0;

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  keys.add(e.code);
  if (e.code === 'KeyE' && focused >= 0) openWhatsApp(units[focused].store);
  if (e.code === 'KeyM') setSound(!soundOn);
  if (e.code === 'KeyT') toggleDirectory(true);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const canvas = renderer.domElement;
const isLocked = () => document.pointerLockElement === canvas;

document.addEventListener('pointerlockchange', () => {
  document.body.classList.toggle('locked', isLocked());
  if (!isLocked()) keys.clear();
});
document.addEventListener('mousemove', (e) => {
  if (!isLocked()) return;
  if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return; // saltos falsos al bloquear el mouse
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.2, Math.min(1.2, pitch));
  autoWalk = null;
});

// Arrastrar para mirar (táctil o mouse sin bloqueo)
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (isLocked()) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
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
  if (isLocked() && focused >= 0) openWebsite(units[focused].store);
});

function onTap(e) {
  const hit = pickAt(e.clientX, e.clientY);
  if (hit >= 0) {
    if (e.pointerType === 'mouse') { openWebsite(units[hit].store); return; }
    setFocus(hit);      // en táctil mostramos la tarjeta con los botones
    pinned = hit;
    return;
  }
  pinned = -1;
  if (e.pointerType === 'mouse' && !isTouch && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* */ }
  }
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

function step(dt, rawDt = dt) {
  if (autoWalk) {
    autoWalk.t = Math.min(1, autoWalk.t + rawDt / autoWalk.dur);
    const e = autoWalk.t < 0.5 ? 2 * autoWalk.t ** 2 : 1 - (-2 * autoWalk.t + 2) ** 2 / 2;
    camera.position.lerpVectors(autoWalk.from, autoWalk.pos, e);
    yaw = autoWalk.yaw0 + angleDiff(autoWalk.yaw0, autoWalk.yaw) * e;
    pitch = autoWalk.pitch0 + (autoWalk.pitch - autoWalk.pitch0) * e;
    if (autoWalk.t >= 1) autoWalk = null;
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
  const p = camera.position;
  p.x += vel.x * dt; p.z += vel.z * dt;

  // Límites del pasillo y obstáculos
  const m = W / 2 - 1.1;
  p.x = Math.max(-m, Math.min(m, p.x));
  p.z = Math.max(bounds.zMin, Math.min(bounds.zMax, p.z));
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), rr = c.r + 0.35;
    if (d < rr && d > 0.0001) { p.x = c.x + dx / d * rr; p.z = c.z + dz / d * rr; }
  }
  const sp = Math.hypot(vel.x, vel.z);
  bob += dt * sp * 2.2;
  p.y = EYE + Math.sin(bob) * 0.035 * Math.min(1, sp / 4);
  camera.rotation.set(pitch, yaw, 0);
}

const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

function walkTo(i) {
  const u = units[i]; if (!u) return;
  const pos = u.group.localToWorld(new THREE.Vector3(-0.4, EYE, 7.2));
  const look = u.group.localToWorld(new THREE.Vector3(-0.4, 3.2, 0));
  const dir = look.clone().sub(pos);
  const tYaw = Math.atan2(-dir.x, -dir.z);
  const tPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  const dist = camera.position.distanceTo(pos);
  autoWalk = { from: camera.position.clone(), pos, yaw0: yaw, yaw: tYaw, pitch0: pitch, pitch: tPitch, t: 0, dur: Math.min(4, 0.8 + dist / 12) };
  vel.set(0, 0, 0);
}

/* =========================================================================
   Selección de tienda
   ========================================================================= */
const raycaster = new THREE.Raycaster();
raycaster.far = 18;
let focused = -1;
let pinned = -1;
let hoverPointer = -1;

function pickers() { return units.map((u) => u.picker); }

function pickAt(x, y) {
  const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickers(), false)[0];
  return hit ? hit.object.userData.unit : -1;
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
  const s = units[i].store;
  cardEls.logo.style.visibility = 'hidden';
  cardEls.logo.onload = () => { cardEls.logo.style.visibility = ''; };
  cardEls.logo.onerror = () => { cardEls.logo.style.visibility = 'hidden'; };
  if (s.logo) cardEls.logo.src = s.logo; else cardEls.logo.removeAttribute('src');
  cardEls.cat.textContent = s.categoria || 'Tienda';
  cardEls.local.textContent = s.local || '—';
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
  if (isLocked()) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = raycaster.intersectObjects(pickers(), false)[0];
    setFocus(hit ? hit.object.userData.unit : -1);
  } else if (pinned >= 0) {
    setFocus(pinned);
  } else if (hoverPointer >= 0) {
    setFocus(hoverPointer);
  } else {
    // Sin mouse bloqueado: la tienda frente a ti, si estás cerca
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = raycaster.intersectObjects(pickers(), false)[0];
    setFocus(hit && hit.distance < 10 ? hit.object.userData.unit : -1);
  }
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
   Directorio
   ========================================================================= */
const dir = document.getElementById('directory');
const dirList = document.getElementById('dir-list');
let dirFilter = 'Todas';
const dirFilters = document.getElementById('dir-filters');
const catOf = (s) => (s.categoria || '').trim() || 'Otros';

function renderDirectory() {
  // Categorías con su cantidad de tiendas
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
    li.querySelector('.c').textContent = `${catOf(s)} · ${u.side < 0 ? 'izquierda' : 'derecha'}`;
    li.querySelector('.l').textContent = s.local ? `L-${s.local}` : '';
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
   Entrada, carga de datos y bucle
   ========================================================================= */
const intro = document.getElementById('intro');
document.getElementById('btn-enter').addEventListener('click', () => {
  intro.hidden = true;
  if (!isTouch && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* */ }
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});

const sourceNote = {
  panel: 'Mostrando las tiendas guardadas desde el panel de administración en este navegador.',
  publicado: '',
  ejemplo: '',
};

async function boot() {
  try { await Promise.all([document.fonts.load('800 40px "Bricolage Grotesque"'), document.fonts.load('600 20px "Instrument Sans"')]); } catch { /* */ }
  const { list, source } = await loadStores();
  document.getElementById('data-source').textContent = sourceNote[source] || '';
  buildWorld(list);
  updateLive();
}

// Si el panel guarda cambios en otra pestaña, el centro comercial se actualiza solo
addEventListener('storage', async (e) => {
  if (e.key !== STORAGE_KEY) return;
  const { list } = await loadStores();
  focused = -1; pinned = -1; setFocus(-1);
  buildWorld(list);
  units.forEach((u) => { u.live = false; });
  updateLive();
});

const clock = new THREE.Clock();
let liveTimer = 0;
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(0.05, raw);
  step(dt, Math.min(raw, 0.25));
  liveTimer += dt;
  if (liveTimer > 0.5) { liveTimer = 0; updateLive(); }
  updateFocus();
  const t = clock.elapsedTime;
  for (const o of spinners) o.rotation.y += dt * o.userData.spin;
  for (const f of flickers) {
    const n = Math.sin(t * 9 + f.base) * 0.5 + Math.sin(t * 23 + f.base * 2) * 0.3;
    if (f.light) f.light.intensity = f.i0 * (0.85 + n * 0.15);
    else f.flame.scale.set(1, 1 + n * 0.18, 1);
  }
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
  requestAnimationFrame(frame);
}

// Acceso para pruebas desde la consola del navegador
window.__mall = { camera, walkTo, setView: (x, z, y = 0, p = 0) => { camera.position.set(x, EYE, z); yaw = y; pitch = p; autoWalk = null; } };

boot().then(frame);
