# Leapmotor B03X · App del manual (PWA)

**App:** https://javeintimilla.github.io/manual_b03x_app/

Versión instalable del manual: se añade a la pantalla de inicio del móvil como una app más y **funciona sin conexión** (por ejemplo, en el garaje). La web normal sigue en https://javeintimilla.github.io/manual_b03x/.

## Instalar en Android (Chrome)

1. Abre el enlace de la app en **Chrome** y espera a que cargue.
2. Pulsa **Instalar** en el aviso que aparece abajo, o el botón **Instalar la app** del menú, o bien ⋮ → **Instalar aplicación**.
3. Confirma. El icono «B03X» aparece en la pantalla de inicio.
4. Manteniendo pulsado el icono tienes accesos directos: Testigos, Emergencias, Calendario y Buscar.

## Instalar en iPhone (Safari)

1. Abre el enlace en **Safari**.
2. Pulsa **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio**, deja el nombre «B03X» y pulsa **Añadir**.
4. Ábrela siempre desde ese icono.

## Sin conexión

La primera vez que se abre con internet, la app guarda todo en el móvil (unos 700 KB, PDF incluido). A partir de ahí funciona sin cobertura. Si no hay red, arriba aparece «Sin conexión».

## Actualizar

1. Subir los ficheros modificados (y `sw.js`, que lleva la lista de ficheros guardados).
2. Editar `version.js` y subir el número de versión y la fecha.
3. Al abrir la app con conexión aparece «Hay una versión nueva del manual» → **Actualizar**.

## Estructura

- `index.html`, `css/`, `js/`, `data/`, `icons/testigos/`, `docs/`: los mismos que la web.
- `manifest.webmanifest`: nombre, iconos, colores y accesos directos de la app.
- `sw.js`: service worker que guarda la app en el móvil.
- `version.js`: única fuente de la versión.
- `js/pwa.js`, `css/pwa.css`: menú lateral, avisos, instalación e indicador sin conexión.
- `vendor/`: fuentes e iconos alojados aquí, sin depender de servicios externos.
- `icons/app/`: iconos de la app.

## Configuración de GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`.

---

Creado y desarrollado por Toni Veintimilla. Resumen propio del manual oficial en inglés; no reproduce textos ni ilustraciones de Leapmotor.
