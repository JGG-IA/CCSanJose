# SAN JOSÉ · Centro Comercial Virtual

Sitio web estático (sin servidor ni base de datos) con dos partes:

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El centro comercial en 3D. Caminas por el pasillo; **toda la fachada de cada local es su video de YouTube**, en bucle y sin controles, con el letrero de logo, nombre y WhatsApp encima. Entre locales hay columnas de ladrillo y al fondo un altar artesanal a San José Obrero. Clic en la tienda → abre su sitio web. |
| `admin.html` | Panel para administrar los comercios (no tiene botón en el centro comercial; se entra escribiendo `/admin.html`): nombre, **categoría** (para filtrar en el directorio), n.º de local, color, **logo, WhatsApp, sitio web y video** (todo por enlaces). |
| `data/tiendas.json` | La lista de comercios que ven todos los visitantes. |

## Probarlo en tu computadora

YouTube no reproduce videos si abres el archivo con doble clic (`file://`); hay que servirlo:

```bash
cd sanjose-mall
python3 -m http.server 8000
```

Luego abre http://localhost:8000 (centro comercial) y http://localhost:8000/admin.html (panel).

## Controles

- **Computadora:** W A S D o flechas para caminar, Shift para correr, mouse para mirar. Clic en una tienda = sitio web, **E** = WhatsApp, **M** = sonido del video, **T** = directorio, Esc = soltar el mouse.
- **Celular:** joystick abajo a la izquierda, arrastra para mirar, toca una tienda para ver los botones de sitio web y WhatsApp.
- **Directorio:** filtra por categoría y te lleva caminando hasta la tienda que elijas.

## Cómo publicar cambios para todos

1. En `admin.html` edita los comercios (se guardan solos en tu navegador y se ven al instante en el centro comercial abierto en ese mismo navegador).
2. Pulsa **Descargar tiendas.json**.
3. Reemplaza `data/tiendas.json` en tu hosting con ese archivo.

Sirve en cualquier hosting estático: GitHub Pages, Netlify, Vercel, Cloudflare Pages o un hosting común.

## Notas

- Los logos de ejemplo son fotos genéricas de picsum.photos y los videos son cortos libres de Blender / videos públicos de YouTube. Cámbialos desde el panel.
- El video se amplía un poco dentro de la fachada para que no se vean el título, el logo ni los controles de YouTube: deja un pequeño margen en los bordes al grabar.
- Solo se reproducen a la vez los 6 videos más cercanos (3 en celular) para que el recorrido vaya fluido; los demás muestran la miniatura.
- Algunos videos de YouTube tienen la inserción desactivada por su dueño; esos no se verán en la vitrina.
- El panel no tiene contraseña: cualquiera que lo abra solo cambia **su propio navegador**, no el sitio publicado. Para un panel con usuarios y cambios en vivo para todos, el siguiente paso es conectar una base de datos (por ejemplo Firebase o Supabase).
- Three.js r160 está incluido en `vendor/`, no depende de CDN.
