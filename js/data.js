// Datos compartidos entre el centro comercial (index.html) y el panel (admin.html).
// Orden de carga: 1) lo guardado desde el panel en este navegador,
// 2) data/tiendas.json (lo que publica el sitio), 3) la lista de ejemplo de abajo.

export const STORAGE_KEY = 'sanjose-mall:tiendas:v1';

const logo = (seed) => `https://picsum.photos/seed/${seed}/400/400`;

export const CATEGORIAS = [
  'Alimentos y bebidas', 'Moda', 'Tecnología', 'Hogar y jardín', 'Servicios', 'Turismo',
  'Salud y belleza', 'Artesanía', 'Arte y diseño', 'Mascotas', 'Educación', 'Deportes',
];

export const DEMO_STORES = [
  { id: 'cafe-aroma', nombre: 'Café Aroma', categoria: 'Alimentos y bebidas', local: '101', color: '#7a4b2a',
    logo: logo('cafe-aroma'), whatsapp: '+506 8800 1101', web: 'https://es.wikipedia.org/wiki/Caf%C3%A9',
    video: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  { id: 'tico-tours', nombre: 'Tico Tours', categoria: 'Turismo', local: '102', color: '#1f7a5a',
    logo: logo('tico-tours'), whatsapp: '+506 8800 1102', web: 'https://es.wikipedia.org/wiki/Costa_Rica',
    video: 'https://www.youtube.com/watch?v=LXb3EKWsInQ' },
  { id: 'pixel-studio', nombre: 'Pixel Studio', categoria: 'Tecnología', local: '103', color: '#5b3fd1',
    logo: logo('pixel-studio'), whatsapp: '+506 8800 1103', web: 'https://es.wikipedia.org/wiki/Animaci%C3%B3n',
    video: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
  { id: 'moda-luna', nombre: 'Moda Luna', categoria: 'Moda', local: '104', color: '#c2366b',
    logo: logo('moda-luna'), whatsapp: '+506 8800 1104', web: 'https://es.wikipedia.org/wiki/Moda',
    video: 'https://www.youtube.com/watch?v=eRsGyueVLvQ' },
  { id: 'verde-vivero', nombre: 'Verde Vivero', categoria: 'Hogar y jardín', local: '105', color: '#3f8f2f',
    logo: logo('verde-vivero'), whatsapp: '+506 8800 1105', web: 'https://es.wikipedia.org/wiki/Jardiner%C3%ADa',
    video: 'https://www.youtube.com/watch?v=WhWc3b3KhnY' },
  { id: 'tecno-centro', nombre: 'TecnoCentro', categoria: 'Tecnología', local: '106', color: '#1d5fa8',
    logo: logo('tecno-centro'), whatsapp: '+506 8800 1106', web: 'https://es.wikipedia.org/wiki/Tecnolog%C3%ADa',
    video: 'https://www.youtube.com/watch?v=R6MlUcmOul8' },
  { id: 'lavanderia-cosmos', nombre: 'Lavandería Cosmos', categoria: 'Servicios', local: '107', color: '#0e8a9a',
    logo: logo('lavanderia-cosmos'), whatsapp: '+506 8800 1107', web: 'https://es.wikipedia.org/wiki/Lavander%C3%ADa',
    video: 'https://www.youtube.com/watch?v=Y-rmzh0PI3c' },
  { id: 'agencia-327', nombre: 'Agencia 327', categoria: 'Servicios', local: '108', color: '#333a46',
    logo: logo('agencia-327'), whatsapp: '+506 8800 1108', web: 'https://es.wikipedia.org/wiki/Seguridad',
    video: 'https://www.youtube.com/watch?v=mN0zPOpADL4' },
  { id: 'dulce-bosque', nombre: 'Dulce Bosque', categoria: 'Alimentos y bebidas', local: '109', color: '#d4732a',
    logo: logo('dulce-bosque'), whatsapp: '+506 8800 1109', web: 'https://es.wikipedia.org/wiki/Reposter%C3%ADa',
    video: 'https://www.youtube.com/watch?v=_cMxraX_5RE' },
  { id: 'cafe-express', nombre: 'Coffee Run', categoria: 'Alimentos y bebidas', local: '110', color: '#a33a2c',
    logo: logo('coffee-run'), whatsapp: '+506 8800 1110', web: 'https://es.wikipedia.org/wiki/Espresso',
    video: 'https://www.youtube.com/watch?v=PVGeM40dABA' },
];

/** Extrae el ID de cualquier formato de enlace de YouTube (watch, youtu.be, shorts, embed, live) o un ID suelto. */
export function youtubeId(input) {
  if (!input) return '';
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12);
    const v = u.searchParams.get('v');
    if (v) return v.slice(0, 11);
    const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
    if (m) return m[2];
  } catch { /* no es URL */ }
  const m = s.match(/([\w-]{11})/);
  return m ? m[1] : '';
}

export function embedUrl(id, { muted = true } = {}) {
  const p = new URLSearchParams({
    autoplay: '1', mute: muted ? '1' : '0', loop: '1', playlist: id, controls: '0',
    modestbranding: '1', playsinline: '1', rel: '0', enablejsapi: '1', iv_load_policy: '3',
    disablekb: '1', fs: '0', cc_load_policy: '0',
  });
  return `https://www.youtube.com/embed/${id}?${p}`;
}

export const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Solo dígitos, para armar el enlace wa.me */
export const waDigits = (n) => String(n || '').replace(/\D/g, '');
export const waLink = (n) => `https://wa.me/${waDigits(n)}`;

export function normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch { return null; }
}

export function saveLocal(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; }
  catch { return false; }
}

export function clearLocal() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento */ }
}

export async function readPublished() {
  try {
    const r = await fetch('data/tiendas.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const list = await r.json();
    return Array.isArray(list) ? list : null;
  } catch { return null; }
}

/** Devuelve { list, source } */
export async function loadStores() {
  const local = readLocal();
  if (local) return { list: local, source: 'panel' };
  const pub = await readPublished();
  if (pub) return { list: pub, source: 'publicado' };
  return { list: structuredClone(DEMO_STORES), source: 'ejemplo' };
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
