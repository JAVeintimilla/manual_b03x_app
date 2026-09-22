// Service worker del manual: guarda toda la app en el móvil para que funcione sin conexión
importScripts("version.js");

const VERSION = self.APP_VERSION_INFO.version;
const CACHE_PREFIX = "b03x-app-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const PRECACHE = [
  "./",
  "./css/pwa.css",
  "./css/styles.css",
  "./data/manual.json",
  "./docs/B03X_guia_completa_castellano.pdf",
  "./icons/app/apple-touch-icon.png",
  "./icons/app/icon-192.png",
  "./icons/app/icon-512.png",
  "./icons/app/icon-maskable-512.png",
  "./icons/testigos/abs-amber.svg",
  "./icons/testigos/acc-green.svg",
  "./icons/testigos/aeb-amber.svg",
  "./icons/testigos/aeboff-amber.svg",
  "./icons/testigos/airbag-red.svg",
  "./icons/testigos/autohigh-blue.svg",
  "./icons/testigos/avh-amber.svg",
  "./icons/testigos/avh-green.svg",
  "./icons/testigos/battery_discharge-green.svg",
  "./icons/testigos/battery_fault-red.svg",
  "./icons/testigos/battery_low-amber.svg",
  "./icons/testigos/battery_temp-red.svg",
  "./icons/testigos/brake-amber.svg",
  "./icons/testigos/brake-red.svg",
  "./icons/testigos/dms_fault-amber.svg",
  "./icons/testigos/door-red.svg",
  "./icons/testigos/epb-amber.svg",
  "./icons/testigos/epb-red.svg",
  "./icons/testigos/eps-red.svg",
  "./icons/testigos/esp-amber.svg",
  "./icons/testigos/espoff-amber.svg",
  "./icons/testigos/fatigue-amber.svg",
  "./icons/testigos/hdc-amber.svg",
  "./icons/testigos/hdc-green.svg",
  "./icons/testigos/highbeam-blue.svg",
  "./icons/testigos/insulation-red.svg",
  "./icons/testigos/lane-amber.svg",
  "./icons/testigos/lcc-green.svg",
  "./icons/testigos/lightfault-amber.svg",
  "./icons/testigos/lowbeam-green.svg",
  "./icons/testigos/mil-amber.svg",
  "./icons/testigos/motor_fault-red.svg",
  "./icons/testigos/motor_temp-red.svg",
  "./icons/testigos/plug-green.svg",
  "./icons/testigos/ready-green.svg",
  "./icons/testigos/rearfog-amber.svg",
  "./icons/testigos/seatbelt-red.svg",
  "./icons/testigos/speedlimit-red.svg",
  "./icons/testigos/tpms-amber.svg",
  "./icons/testigos/trunk-red.svg",
  "./icons/testigos/turn-green.svg",
  "./icons/testigos/turtle-amber.svg",
  "./icons/testigos/vehicle_stop-red.svg",
  "./index.html",
  "./js/app.js",
  "./js/pwa.js",
  "./manifest.webmanifest",
  "./vendor/fonts.css",
  "./vendor/fonts/barlow-latin-400-normal.woff2",
  "./vendor/fonts/barlow-latin-500-normal.woff2",
  "./vendor/fonts/barlow-latin-600-normal.woff2",
  "./vendor/fonts/barlow-semi-condensed-latin-500-normal.woff2",
  "./vendor/fonts/barlow-semi-condensed-latin-600-normal.woff2",
  "./vendor/fonts/barlow-semi-condensed-latin-700-normal.woff2",
  "./vendor/fonts/tabler-icons-subset.woff2",
  "./vendor/icons.css",
  "./vendor/sortable.min.js",
  "./version.js"
];

// Al instalar, descargo todo de la red (sin pasar por la caché HTTP) para estrenar versión limpia
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))),
  );
});

// Al activar, borro las versiones anteriores y tomo el control de las pestañas abiertas
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Sirvo primero desde el móvil; si algo no está guardado, lo pido a la red
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then((cached) => cached ?? fetch(request)));
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fetch(request)),
  );
});

// La página me pide activar la versión nueva cuando el usuario pulsa «Actualizar»
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
