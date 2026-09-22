// Capa de la app instalable: menú lateral propio, service worker, actualizaciones, instalación y aviso sin conexión.
// La cargo antes que app.js y no depende de ninguna librería externa.

const INSTALL_DISMISSED_KEY = "b03x-install-dismissed";

const drawer = /** @type {HTMLElement & {show?: () => void, hide?: () => void}} */ (document.getElementById("drawer"));
const toastElement = /** @type {HTMLElement} */ (document.getElementById("toast"));
const installSheet = /** @type {HTMLElement} */ (document.getElementById("install-sheet"));
const offlineBadge = /** @type {HTMLElement} */ (document.getElementById("offline-badge"));

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone === true;
/** Considero móvil o tablet cualquier Android, iPhone o iPad; en PC no ofrezco instalar. */
const isMobileDevice = () =>
  /** @type {any} */ (navigator).userAgentData?.mobile === true ||
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// ---------------------------------------------------------------- menú lateral en móvil

function openDrawer() {
  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  if (drawer.hidden) return;
  drawer.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => { drawer.hidden = true; }, 280);
}

// Expongo la misma interfaz que usaba el cajón de Shoelace para que app.js no cambie
drawer.show = openDrawer;
drawer.hide = closeDrawer;
drawer.addEventListener("click", (event) => {
  if (/** @type {HTMLElement} */ (event.target).closest("[data-drawer-close]")) closeDrawer();
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });

// ---------------------------------------------------------------- avisos

/** Muestro un aviso inferior con un botón de acción opcional. */
function showToast(message, actionLabel, onAction) {
  toastElement.innerHTML = `<span>${message}</span>${actionLabel ? `<button type="button">${actionLabel}</button>` : ""}
    <button type="button" class="toast__close" aria-label="Cerrar el aviso"><i class="ti ti-x"></i></button>`;
  toastElement.hidden = false;
  requestAnimationFrame(() => toastElement.classList.add("is-open"));
  const [actionButton] = toastElement.querySelectorAll("button:not(.toast__close)");
  actionButton?.addEventListener("click", () => { hideToast(); onAction?.(); });
  toastElement.querySelector(".toast__close")?.addEventListener("click", hideToast);
}

function hideToast() {
  toastElement.classList.remove("is-open");
  setTimeout(() => { toastElement.hidden = true; }, 300);
}

// ---------------------------------------------------------------- service worker y actualizaciones

function watchForUpdates(registration) {
  const offerUpdate = (worker) => showToast("Hay una versión nueva del manual.", "Actualizar", () => worker.postMessage({ type: "SKIP_WAITING" }));
  if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) offerUpdate(installing);
    });
  });
  // Cada vez que vuelvo a la app compruebo si hay versión nueva publicada
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) registration.update();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
      watchForUpdates(registration);
    } catch (error) {
      console.warn("No he podido registrar el service worker", error);
    }
  });
  let isReloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloading) return;
    isReloading = true;
    location.reload();
  });
}

// ---------------------------------------------------------------- instalación

/** @type {any} */
let deferredPrompt = null;

function refreshInstallButtons() {
  const canInstall = isMobileDevice() && !isStandalone() && (deferredPrompt || isIos());
  document.querySelectorAll("[data-install]").forEach((button) => { /** @type {HTMLElement} */ (button).hidden = !canInstall; });
}

function openInstallSheet() {
  installSheet.hidden = false;
  requestAnimationFrame(() => installSheet.classList.add("is-open"));
}

function closeInstallSheet() {
  installSheet.classList.remove("is-open");
  setTimeout(() => { installSheet.hidden = true; }, 280);
}

async function startInstall() {
  closeDrawer();
  if (!deferredPrompt) {
    openInstallSheet();
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  refreshInstallButtons();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  refreshInstallButtons();
  if (isMobileDevice() && !localStorage.getItem(INSTALL_DISMISSED_KEY)) {
    showToast("Instala el manual en el móvil para usarlo sin conexión.", "Instalar", startInstall);
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  }
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  refreshInstallButtons();
  showToast("Manual instalado. Ya lo tienes en la pantalla de inicio.");
});

document.addEventListener("click", (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  if (target.closest("[data-install]")) startInstall();
  if (target.closest("[data-sheet-close]")) closeInstallSheet();
});

if (isIos() && !isStandalone() && !localStorage.getItem(INSTALL_DISMISSED_KEY)) {
  setTimeout(() => {
    showToast("Puedes instalar el manual en el iPhone para usarlo sin conexión.", "Cómo", openInstallSheet);
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  }, 2500);
}
refreshInstallButtons();

// ---------------------------------------------------------------- sin conexión

function refreshOnlineState() {
  offlineBadge.hidden = navigator.onLine;
}
window.addEventListener("online", refreshOnlineState);
window.addEventListener("offline", refreshOnlineState);
refreshOnlineState();
