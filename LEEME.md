# SAN JOSÉ · Centro Comercial Virtual

Sitio web estático (sin servidor ni base de datos).

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El centro comercial en 3D. Abre con la vista del edificio desde la plaza (fuente con la estatua de San José); al pulsar **Ingresar** la cámara avanza, se abren las puertas y entras. Adentro: 3 pisos alrededor de un patio central con tragaluz y escaleras eléctricas. |
| `admin.html` | Panel de comercios. No tiene botón en el centro comercial: se entra escribiendo la dirección `/admin.html`. |
| `data/tiendas.json` | La lista de comercios que ven todos los visitantes. |

## Cada local

- Letrero de madera con el **logo** y el **nombre iluminados**, y el **WhatsApp**.
- **Vitrina** de vidrio con **3 productos destacados** (foto, nombre y precio) sobre pedestales.
- Puerta abierta y, al fondo del local, el **video de YouTube** en bucle, sin controles ni sonido (el visitante puede activar el sonido).
- Clic en el local → abre el **sitio web**.

## Panel de comercios

Por cada comercio: nombre, categoría (filtra el directorio), **piso**, color, logo, WhatsApp, sitio web, video y los **3 productos**. Todo por enlaces.
Cada piso tiene 13 locales. Al entrar, el **101** es el primero a la izquierda; la numeración sigue por la izquierda hacia el fondo (101–105), cruza el fondo (106–108) y vuelve por la derecha hacia la entrada (109–113). En los pisos 2 y 3 es igual (201…, 301…). El número se asigna solo según el piso y el orden de la lista; si un piso se llena, el comercio pasa al siguiente y el panel lo avisa.

## Probarlo en tu computadora

YouTube no reproduce videos si abres el archivo con doble clic; hay que servirlo:

```bash
cd sanjose-mall
python3 -m http.server 8000
```

Centro comercial: http://localhost:8000 · Panel: http://localhost:8000/admin.html

## Controles

- **Computadora:** W A S D o flechas para caminar, Shift para correr, mouse para mirar, teclas **1 2 3** para cambiar de piso. Clic en una tienda = sitio web, **E** = WhatsApp, **M** = sonido, **T** = directorio, Esc = soltar el mouse.
- **Celular (vertical u horizontal):** joystick abajo a la izquierda, desliza el dedo para mirar, toca una tienda para ver sus botones de sitio web y WhatsApp. En celular se reproducen menos videos a la vez para que vaya fluido.
- Se puede subir caminando por las escaleras eléctricas, o usar los botones **Piso 1 · 2 · 3**.
- **Directorio:** filtra por categoría y te lleva a la tienda.

## Publicar cambios para todos

1. Edita en `admin.html` (se guarda solo en tu navegador y se ve al instante en el centro comercial de ese navegador).
2. Pulsa **Descargar tiendas.json**.
3. Reemplaza `data/tiendas.json` en tu hosting (GitHub Pages, Netlify, Vercel, Cloudflare Pages o un hosting común).

## Notas

- Logos, productos y videos de ejemplo son genéricos (picsum.photos y cortos públicos de YouTube). Cámbialos desde el panel.
- El video se amplía un poco para que no se vean el título ni los controles de YouTube: deja margen en los bordes al grabar.
- Solo se reproducen a la vez los 6 videos más cercanos (3 en celular), y los letreros lejanos se ocultan, para que el recorrido sea fluido.
- Algunos videos de YouTube tienen la inserción desactivada por su dueño; esos no se ven.
- El panel no tiene contraseña: quien lo abra solo cambia **su propio navegador**, no el sitio publicado. Para usuarios con contraseña y cambios en vivo para todos, el siguiente paso es conectar una base de datos (Firebase o Supabase).
- Three.js r160 está incluido en `vendor/`.
