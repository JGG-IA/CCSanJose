// Datos compartidos entre el centro comercial (index.html) y el panel (admin.html).
// Orden de carga: 1) lo guardado desde el panel en este navegador,
// 2) data/tiendas.json (lo que publica el sitio), 3) la lista de ejemplo de abajo.

export const STORAGE_KEY = 'sanjose-mall:tiendas:v3';

const img = (seed, w = 400, h = 400) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const prods = (id, items) => items.map(([nombre, precio], i) => ({ imagen: img(`${id}-p${i + 1}`, 500, 500), nombre, precio }));

export const CATEGORIAS = [
  'Alimentos y bebidas', 'Moda', 'Tecnología', 'Hogar y jardín', 'Servicios', 'Turismo',
  'Salud y belleza', 'Artesanía', 'Arte y diseño', 'Mascotas', 'Educación', 'Deportes', 'Libros', 'Música',
];

/* ---------- Distribución del edificio ----------
   3 pisos alrededor del patio central. Cada piso tiene 13 locales:
   5 a la izquierda, 5 a la derecha (se van alternando) y 3 al fondo. */
export const PISOS = 3;
export const LOCALES_POR_PISO = 13;

export function slotInfo(slot) {
  // Recorrido al entrar: 101 es el primero a la izquierda junto a la entrada,
  // sigue por la izquierda hacia el fondo, cruza el fondo y vuelve por la derecha.
  if (slot < 5) return { lado: 'izquierda', k: 4 - slot };
  if (slot < 8) return { lado: 'fondo', k: slot - 5 };
  return { lado: 'derecha', k: slot - 8 };
}

/** Ubica cada tienda en un piso y un local. Respeta el piso pedido; si está lleno, usa el siguiente con espacio. */
export function assignSlots(list) {
  const used = Array.from({ length: PISOS }, () => 0);
  return list.map((store) => {
    let want = Math.min(PISOS, Math.max(1, parseInt(store.piso, 10) || 1)) - 1;
    let piso = want;
    for (let t = 0; t < PISOS && used[piso] >= LOCALES_POR_PISO; t++) piso = (piso + 1) % PISOS;
    if (used[piso] >= LOCALES_POR_PISO) return { store, piso: -1, slot: -1, local: '', lleno: true };
    const slot = used[piso]++;
    return { store, piso: piso + 1, slot, local: String((piso + 1) * 100 + slot + 1), movido: piso !== want, ...slotInfo(slot) };
  });
}

export const DEMO_STORES = [
  { id: 'libreria-madre-de-dios', nombre: 'Librería Madre de Dios', categoria: 'Libros', piso: 1, color: '#2f5c8f',
    logo: '', whatsapp: '', web: 'https://jgg-ia.github.io/LibreriaMadreDeDios/', video: '',
    productos: [] },
  { id: 'tucancion', nombre: 'tuCANCION', categoria: 'Música', piso: 1, color: '#c2366b',
    logo: '', whatsapp: '', web: 'https://jgg-ia.github.io/tuCANCION/', video: '',
    productos: [] },
  { id: 'cafe-aroma', nombre: 'Café Aroma', categoria: 'Alimentos y bebidas', piso: 1, color: '#7a4b2a',
    logo: img('cafe-aroma'), whatsapp: '+506 8800 1101', web: 'https://es.wikipedia.org/wiki/Caf%C3%A9',
    video: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    productos: prods('cafe-aroma', [['Café de altura 340 g', '₡4.500'], ['Taza artesanal', '₡6.000'], ['Chorreador de madera', '₡12.900']]) },
  { id: 'tico-tours', nombre: 'Tico Tours', categoria: 'Turismo', piso: 1, color: '#1f7a5a',
    logo: img('tico-tours'), whatsapp: '+506 8800 1102', web: 'https://es.wikipedia.org/wiki/Costa_Rica',
    video: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    productos: prods('tico-tours', [['Tour volcán Arenal', '₡45.000'], ['Canopy en Monteverde', '₡38.000'], ['Día de playa', '₡29.000']]) },
  { id: 'moda-luna', nombre: 'Moda Luna', categoria: 'Moda', piso: 1, color: '#c2366b',
    logo: img('moda-luna'), whatsapp: '+506 8800 1104', web: 'https://es.wikipedia.org/wiki/Moda',
    video: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
    productos: prods('moda-luna', [['Vestido de lino', '₡24.900'], ['Bolso tejido', '₡18.500'], ['Sandalias de cuero', '₡21.000']]) },
  { id: 'dulce-bosque', nombre: 'Dulce Bosque', categoria: 'Alimentos y bebidas', piso: 1, color: '#d4732a',
    logo: img('dulce-bosque'), whatsapp: '+506 8800 1109', web: 'https://es.wikipedia.org/wiki/Reposter%C3%ADa',
    video: 'https://www.youtube.com/watch?v=_cMxraX_5RE',
    productos: prods('dulce-bosque', [['Pastel de tres leches', '₡9.800'], ['Galletas de avena', '₡3.200'], ['Caja de alfajores', '₡5.500']]) },
  { id: 'pixel-studio', nombre: 'Pixel Studio', categoria: 'Tecnología', piso: 2, color: '#5b3fd1',
    logo: img('pixel-studio'), whatsapp: '+506 8800 1103', web: 'https://es.wikipedia.org/wiki/Animaci%C3%B3n',
    video: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    productos: prods('pixel-studio', [['Logo animado', '₡60.000'], ['Video para redes', '₡85.000'], ['Ilustración digital', '₡40.000']]) },
  { id: 'verde-vivero', nombre: 'Verde Vivero', categoria: 'Hogar y jardín', piso: 2, color: '#3f8f2f',
    logo: img('verde-vivero'), whatsapp: '+506 8800 1105', web: 'https://es.wikipedia.org/wiki/Jardiner%C3%ADa',
    video: 'https://www.youtube.com/watch?v=WhWc3b3KhnY',
    productos: prods('verde-vivero', [['Orquídea en maceta', '₡14.000'], ['Kit de suculentas', '₡8.500'], ['Abono orgánico 5 kg', '₡4.200']]) },
  { id: 'tecno-centro', nombre: 'TecnoCentro', categoria: 'Tecnología', piso: 2, color: '#1d5fa8',
    logo: img('tecno-centro'), whatsapp: '+506 8800 1106', web: 'https://es.wikipedia.org/wiki/Tecnolog%C3%ADa',
    video: 'https://www.youtube.com/watch?v=R6MlUcmOul8',
    productos: prods('tecno-centro', [['Audífonos inalámbricos', '₡32.000'], ['Reloj inteligente', '₡54.900'], ['Cargador rápido', '₡9.900']]) },
  { id: 'lavanderia-cosmos', nombre: 'Lavandería Cosmos', categoria: 'Servicios', piso: 3, color: '#0e8a9a',
    logo: img('lavanderia-cosmos'), whatsapp: '+506 8800 1107', web: 'https://es.wikipedia.org/wiki/Lavander%C3%ADa',
    video: 'https://www.youtube.com/watch?v=Y-rmzh0PI3c',
    productos: prods('lavanderia-cosmos', [['Lavado y secado', '₡3.500'], ['Planchado por pieza', '₡800'], ['Edredón king', '₡7.000']]) },
  { id: 'agencia-327', nombre: 'Agencia 327', categoria: 'Servicios', piso: 3, color: '#333a46',
    logo: img('agencia-327'), whatsapp: '+506 8800 1108', web: 'https://es.wikipedia.org/wiki/Seguridad',
    video: 'https://www.youtube.com/watch?v=mN0zPOpADL4',
    productos: prods('agencia-327', [['Cámara de seguridad', '₡39.000'], ['Alarma para casa', '₡65.000'], ['Instalación', '₡25.000']]) },
  { id: 'coffee-run', nombre: 'Coffee Run', categoria: 'Alimentos y bebidas', piso: 3, color: '#a33a2c',
    logo: img('coffee-run'), whatsapp: '+506 8800 1110', web: 'https://es.wikipedia.org/wiki/Espresso',
    video: 'https://www.youtube.com/watch?v=PVGeM40dABA',
    productos: prods('coffee-run', [['Espresso doble', '₡1.800'], ['Capuchino', '₡2.400'], ['Termo de acero', '₡11.500']]) },
  { id: 'artesanias-sarchi', nombre: 'Artesanías Sarchí', categoria: 'Artesanía', piso: 1, color: '#c8361f',
    logo: img('artesanias-sarchi'), whatsapp: '+506 8800 1111', web: 'https://es.wikipedia.org/wiki/Sarch%C3%AD',
    video: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    productos: prods('artesanias-sarchi', [['Carreta en miniatura', '₡15.000'], ['Plato pintado a mano', '₡9.500'], ['Llavero de madera', '₡2.500']]) },
  { id: 'bella-piel', nombre: 'Bella Piel', categoria: 'Salud y belleza', piso: 1, color: '#b0547a',
    logo: img('bella-piel'), whatsapp: '+506 8800 1112', web: 'https://es.wikipedia.org/wiki/Cosm%C3%A9tica',
    video: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
    productos: prods('bella-piel', [['Crema hidratante', '₡8.900'], ['Jabón artesanal', '₡2.800'], ['Aceite de coco', '₡6.200']]) },
  { id: 'patitas', nombre: 'Patitas', categoria: 'Mascotas', piso: 1, color: '#e0702a',
    logo: img('patitas'), whatsapp: '+506 8800 1113', web: 'https://es.wikipedia.org/wiki/Mascota',
    video: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    productos: prods('patitas', [['Cama para perro', '₡19.900'], ['Juguete de cuerda', '₡3.500'], ['Collar bordado', '₡6.800']]) },
  { id: 'libreria-pura-vida', nombre: 'Librería Pura Vida', categoria: 'Educación', piso: 2, color: '#2f6f8f',
    logo: img('libreria-pura-vida'), whatsapp: '+506 8800 1114', web: 'https://es.wikipedia.org/wiki/Librer%C3%ADa',
    video: 'https://www.youtube.com/watch?v=WhWc3b3KhnY',
    productos: prods('libreria-pura-vida', [['Cuaderno artesanal', '₡4.200'], ['Novela ilustrada', '₡12.500'], ['Set de acuarelas', '₡9.900']]) },
  { id: 'gym-volcan', nombre: 'Volcán Fit', categoria: 'Deportes', piso: 2, color: '#d6453d',
    logo: img('volcan-fit'), whatsapp: '+506 8800 1115', web: 'https://es.wikipedia.org/wiki/Deporte',
    video: 'https://www.youtube.com/watch?v=Y-rmzh0PI3c',
    productos: prods('volcan-fit', [['Mancuernas 5 kg', '₡18.000'], ['Tapete de yoga', '₡11.900'], ['Botella térmica', '₡7.500']]) },
  { id: 'taller-del-arte', nombre: 'Taller del Arte', categoria: 'Arte y diseño', piso: 3, color: '#7a2f8f',
    logo: img('taller-del-arte'), whatsapp: '+506 8800 1116', web: 'https://es.wikipedia.org/wiki/Arte',
    video: 'https://www.youtube.com/watch?v=_cMxraX_5RE',
    productos: prods('taller-del-arte', [['Cuadro al óleo', '₡75.000'], ['Clase de cerámica', '₡20.000'], ['Lámina enmarcada', '₡16.000']]) },
  { id: 'casa-hogar', nombre: 'Casa & Hogar', categoria: 'Hogar y jardín', piso: 3, color: '#6b7f5e',
    logo: img('casa-hogar'), whatsapp: '+506 8800 1117', web: 'https://es.wikipedia.org/wiki/Decoraci%C3%B3n',
    video: 'https://www.youtube.com/watch?v=R6MlUcmOul8',
    productos: prods('casa-hogar', [['Cojín bordado', '₡8.500'], ['Lámpara de bambú', '₡24.000'], ['Juego de vasos', '₡12.000']]) },
  { id: 'sabores-ticos', nombre: 'Sabores Ticos', categoria: 'Alimentos y bebidas', piso: 3, color: '#b5643c',
    logo: img('sabores-ticos'), whatsapp: '+506 8800 1118', web: 'https://es.wikipedia.org/wiki/Gastronom%C3%ADa_de_Costa_Rica',
    video: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    productos: prods('sabores-ticos', [['Gallo pinto para llevar', '₡3.500'], ['Salsa Lizano casera', '₡2.900'], ['Tamal de cerdo', '₡2.200']]) },
];

/** Completa campos que falten (datos viejos o importados). */
export function normalizeStore(s) {
  const productos = Array.from({ length: 3 }, (_, i) => ({ imagen: '', nombre: '', precio: '', ...((s.productos || [])[i] || {}) }));
  return { categoria: '', piso: 1, color: '#22a07a', logo: '', whatsapp: '', web: '', video: '', ...s, productos };
}

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
  if (local) return { list: local.map(normalizeStore), source: 'panel' };
  const pub = await readPublished();
  if (pub) return { list: pub.map(normalizeStore), source: 'publicado' };
  return { list: structuredClone(DEMO_STORES).map(normalizeStore), source: 'ejemplo' };
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
