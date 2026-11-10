import {
  loadStores, saveLocal, CATEGORIAS, assignSlots, normalizeStore, clearLocal, readPublished, DEMO_STORES,
  youtubeId, embedUrl, waDigits, normalizeUrl, initials,
} from './data.js';

const $ = (id) => document.getElementById(id);
const listEl = $('store-list');
const form = $('form');
const fields = ['nombre', 'categoria', 'piso', 'color', 'logo', 'whatsapp', 'web', 'video'];

let stores = [];
let current = 0;
let videoTimer = 0;
let lastVideoId = null;

/* ---------- Guardado ---------- */
function persist(msg = 'Guardado en este navegador') {
  const ok = saveLocal(stores);
  $('save-state').textContent = ok ? `✓ ${msg}` : 'No se pudo guardar: el navegador bloquea el almacenamiento';
}

function newId(name) {
  const base = String(name || 'tienda').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tienda';
  let id = base, n = 2;
  while (stores.some((s) => s.id === id)) id = `${base}-${n++}`;
  return id;
}

/* ---------- Lista ---------- */
function renderCategories() {
  const all = new Set([...CATEGORIAS, ...stores.map((s) => (s.categoria || '').trim()).filter(Boolean)]);
  $('cat-list').innerHTML = [...all].sort((a, b) => a.localeCompare(b, 'es'))
    .map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function renderList() {
  renderCategories();
  const places = assignSlots(stores);
  $('count').textContent = `(${stores.length})`;
  listEl.innerHTML = '';
  stores.forEach((s, i) => {
    const li = document.createElement('li');
    li.setAttribute('aria-current', String(i === current));
    li.tabIndex = 0;
    const problems = issues(s);
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <span class="thumb" style="background:${s.color || '#22a07a'}">${esc(initials(s.nombre))}</span>
      <span class="info"><b></b><span></span></span>
      <span class="move">
        <button type="button" data-dir="-1" aria-label="Subir">▲</button>
        <button type="button" data-dir="1" aria-label="Bajar">▼</button>
      </span>`;
    li.querySelector('b').textContent = s.nombre || 'Sin nombre';
    const sub = li.querySelector('.info span');
    if (problems.length) { sub.textContent = `Falta: ${problems.join(', ')}`; sub.classList.add('warn'); }
    else sub.textContent = `${s.categoria || 'Sin categoría'} · Piso ${places[i].piso} · Local ${places[i].local}`;
    if (s.logo) {
      const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onload = () => li.querySelector('.thumb').appendChild(img);
      img.src = s.logo;
    }
    const [up, down] = li.querySelectorAll('.move button');
    up.disabled = i === 0; down.disabled = i === stores.length - 1;
    li.querySelectorAll('.move button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); move(i, Number(b.dataset.dir));
    }));
    li.addEventListener('click', () => select(i));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    listEl.appendChild(li);
  });
  const empty = stores.length === 0;
  $('empty').hidden = !empty;
  form.hidden = empty;
  document.querySelector('.sign-preview').hidden = empty;
}

function issues(s) {
  const out = [];
  if (!s.nombre) out.push('nombre');
  if (!s.categoria) out.push('categoría');
  if (!youtubeId(s.video)) out.push('video');
  if (!s.web) out.push('sitio web');
  if (waDigits(s.whatsapp).length < 8) out.push('WhatsApp');
  return out;
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= stores.length) return;
  [stores[i], stores[j]] = [stores[j], stores[i]];
  if (current === i) current = j; else if (current === j) current = i;
  persist('Orden actualizado'); renderList();
}

/* ---------- Ficha ---------- */
function select(i) {
  current = Math.max(0, Math.min(i, stores.length - 1));
  hideDelete();
  fillForm();
  renderList();
}

function fillForm() {
  const s = stores[current];
  if (!s) return;
  for (const f of fields) $(`f-${f}`).value = s[f] ?? (f === 'color' ? '#22a07a' : f === 'piso' ? '1' : '');
  for (let j = 0; j < 3; j++) for (const k of ['imagen', 'nombre', 'precio']) $(`p${j}-${k}`).value = s.productos?.[j]?.[k] || '';
  lastVideoId = null;
  refreshPreviews(true);
}

form.addEventListener('input', (e) => {
  const s = stores[current];
  if (!s) return;
  if (e.target.dataset.prod !== undefined) {
    const j = Number(e.target.dataset.prod);
    s.productos = s.productos || [{}, {}, {}];
    s.productos[j] = { ...(s.productos[j] || {}), [e.target.dataset.key]: e.target.value.trim() };
  } else if (e.target.name) {
    s[e.target.name] = e.target.name === 'piso' ? Number(e.target.value) : e.target.value.trim();
  } else return;
  persist();
  refreshPreviews(e.target.name === 'video');
  renderListRow();
});
form.addEventListener('submit', (e) => e.preventDefault());

// Normaliza enlaces al salir del campo
['web', 'logo'].forEach((f) => $(`f-${f}`).addEventListener('change', (e) => {
  const v = normalizeUrl(e.target.value);
  e.target.value = v; stores[current][f] = v; persist(); refreshPreviews(false);
}));

function renderListRow() {
  // Re-render liviano sin perder el foco del formulario
  const keep = document.activeElement;
  renderList();
  keep?.focus?.();
}

function refreshPreviews(videoChanged) {
  const s = stores[current];
  if (!s) return;
  const color = s.color || '#22a07a';

  // Logo
  const lp = $('logo-prev');
  lp.style.background = color;
  lp.innerHTML = `<span>${esc(initials(s.nombre))}</span>`;
  if (s.logo) {
    const img = new Image(); img.alt = 'Logo'; img.referrerPolicy = 'no-referrer';
    img.onload = () => lp.appendChild(img);
    img.src = s.logo;
  }

  // WhatsApp
  const d = waDigits(s.whatsapp);
  setMsg('m-whatsapp', !s.whatsapp ? ['', ''] : d.length < 8
    ? ['bad', 'Número muy corto. Incluye el código de país, por ejemplo +506.']
    : ['good', `Enlace: wa.me/${d}`]);

  // Web
  setMsg('m-web', !s.web ? ['', 'Al hacer clic en la tienda se abrirá este sitio.'] : /^https?:\/\/[^\s.]+\.[^\s]+/i.test(normalizeUrl(s.web))
    ? ['good', 'Se abrirá en una pestaña nueva.'] : ['bad', 'Revisa el enlace: debe parecerse a https://mitienda.com']);

  // Video
  const id = youtubeId(s.video);
  setMsg('m-video', !s.video ? ['', 'Pega el enlace del video tal como lo copias de YouTube.'] : id
    ? ['good', `Video reconocido (${id}).`] : ['bad', 'No reconozco ese enlace de YouTube.']);
  if (videoChanged || id !== lastVideoId) {
    clearTimeout(videoTimer);
    videoTimer = setTimeout(() => {
      lastVideoId = id;
      const vp = $('video-prev');
      vp.innerHTML = id
        ? `<iframe src="${embedUrl(id)}" title="Vista previa del video" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
        : 'Aquí verás el video cuando pegues un enlace válido.';
    }, 500);
  }

  // Letrero
  const sign = $('sign-prev');
  sign.style.setProperty('--c', color);
  const sl = sign.querySelector('.s-logo');
  sl.innerHTML = `<span>${esc(initials(s.nombre))}</span>`;
  if (s.logo) {
    const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.onload = () => sl.appendChild(img);
    img.src = s.logo;
  }
  sign.querySelector('.s-name').textContent = s.nombre || 'Nombre del comercio';
  const place = assignSlots(stores)[current];
  sign.querySelector('.s-meta').textContent = [s.categoria, place.local && `Piso ${place.piso} · Local ${place.local}`].filter(Boolean).join(' · ');
  sign.querySelector('.s-wa').textContent = s.whatsapp || '';
  refreshPlace();
}

function refreshPlace() {
  const s = stores[current]; if (!s) return;
  const a = assignSlots(stores)[current];
  setMsg('m-piso', a.lleno ? ['bad', 'Los 3 pisos están llenos (39 locales).']
    : a.movido ? ['bad', `El piso ${s.piso} está lleno: quedó en el piso ${a.piso}, local ${a.local}.`]
    : ['good', `Local ${a.local}, ${a.lado === 'fondo' ? 'al fondo' : a.lado === 'izquierda' ? 'lado izquierdo' : 'lado derecho'}.`]);
  for (let j = 0; j < 3; j++) {
    const box = $(`pp-${j}`), src = s.productos?.[j]?.imagen;
    box.innerHTML = `<span>${j + 1}</span>`;
    if (src) { const im = new Image(); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onload = () => box.appendChild(im); im.src = src; }
  }
}

function setMsg(id, [cls, text]) {
  const el = $(id); el.className = `msg ${cls}`; el.textContent = text;
}

/* ---------- Crear / eliminar ---------- */
$('btn-new').addEventListener('click', () => {
  const palette = ['#22a07a', '#1d5fa8', '#c2366b', '#d4732a', '#5b3fd1', '#3f8f2f', '#0e8a9a', '#a33a2c'];
  const s = {
    id: newId('nuevo-comercio'), nombre: 'Nuevo comercio', categoria: '', piso: 1,
    color: palette[stores.length % palette.length], logo: '', whatsapp: '', web: '', video: '',
    productos: [{ imagen: '', nombre: '', precio: '' }, { imagen: '', nombre: '', precio: '' }, { imagen: '', nombre: '', precio: '' }],
  };
  stores.push(s);
  persist('Comercio creado');
  select(stores.length - 1);
  $('f-nombre').focus(); $('f-nombre').select();
});

function hideDelete() { $('del-confirm').hidden = true; $('btn-del').hidden = false; }
$('btn-del').addEventListener('click', () => { $('btn-del').hidden = true; $('del-confirm').hidden = false; $('btn-del-no').focus(); });
$('btn-del-no').addEventListener('click', hideDelete);
$('btn-del-yes').addEventListener('click', () => {
  const name = stores[current]?.nombre || 'Comercio';
  stores.splice(current, 1);
  persist(`“${name}” eliminado`);
  hideDelete();
  select(Math.min(current, stores.length - 1));
});

/* ---------- Exportar / importar ---------- */
const toolMsg = (t, bad) => { const el = $('tool-msg'); el.textContent = t; el.style.color = bad ? 'var(--danger)' : 'var(--ok)'; };

$('btn-export').addEventListener('click', () => {
  const clean = stores.map((s) => ({ ...s, web: normalizeUrl(s.web), logo: normalizeUrl(s.logo) }));
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'tiendas.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toolMsg('Descargado. Súbelo a tu sitio en data/tiendas.json.');
});

$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const list = JSON.parse(await file.text());
    if (!Array.isArray(list)) throw new Error();
    stores = list.map((s) => normalizeStore({ ...s, id: s.id || newId(s.nombre) }));
    persist('Archivo importado'); select(0);
    toolMsg(`Importados ${stores.length} comercios.`);
  } catch { toolMsg('Ese archivo no es una lista de comercios válida (tiendas.json).', true); }
});

$('btn-published').addEventListener('click', async () => {
  const pub = await readPublished();
  if (!pub) { toolMsg('No encontré data/tiendas.json en el sitio.', true); return; }
  stores = pub.map(normalizeStore); clearLocal(); persist('Cargado lo publicado'); select(0);
  toolMsg(`Cargados ${pub.length} comercios desde data/tiendas.json.`);
});

$('btn-demo').addEventListener('click', () => {
  stores = structuredClone(DEMO_STORES).map(normalizeStore); persist('Ejemplos restaurados'); select(0);
  toolMsg(`Se restauraron los ${stores.length} comercios de ejemplo.`);
});

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Inicio ---------- */
(async () => {
  const { list, source } = await loadStores();
  stores = list;
  $('save-state').textContent = { panel: 'Editando lo guardado en este navegador', publicado: 'Editando lo publicado', ejemplo: 'Editando los ejemplos' }[source];
  renderList();
  if (stores.length) select(0);
})();
