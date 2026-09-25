// Manual de casa del Leapmotor B03X. Web estática sin compilación: ES modules y JSON.

/**
 * @typedef {{ t: string, html?: string, items?: Array<string|{title:string, html:string}>,
 *             head?: Array<string|{icon:string}>, rows?: Array<Array<string|{icon:string}>>,
 *             tone?: string|null, icons?: boolean, calendar?: Array<{date: string, end: string|null, kind: string, charge: boolean}> }} ContentNode
 * @typedef {{ id: string, title: string, marker: string, keywords?: string, content: ContentNode[] }} Section
 * @typedef {{ id: string, number: number, title: string, subtitle: string, icon: string,
 *             intro: ContentNode[], sections: Section[] }} Block
 * @typedef {{ label: string, icon: string, tone: string, section: string }} QuickLink
 * @typedef {{ date: string, end: string|null, kind: string, charge: boolean, text?: string, where?: string, place?: string|string[]|null, battery?: string, cost?: string }} CalendarEntry
 * @typedef {{ id: string, label: string, pattern: string, flags: string, home: string, sections: string[] }} GlossaryTerm
 * @typedef {{ title: string, subtitle: string, blocks: Block[], quick: QuickLink[],
 *             calendar: { section: string, hideFrom: string, entries: CalendarEntry[] }, glossary: GlossaryTerm[],
 *             places?: Record<string, {name: string, query: string}> }} Manual
 * @typedef {{ section: Section, block: Block, text: string, title: string }} SearchEntry
 */

const VERSION_INFO = /** @type {{version?: string, date?: string}} */ (/** @type {any} */ (window).APP_VERSION_INFO ?? {});
const APP_VERSION = String(/** @type {any} */ (window).APP_VERSION ?? VERSION_INFO.version ?? "dev");
const AUTHOR = "Toni Veintimilla";
const REPO_URL = "https://github.com/JAVeintimilla/manual_b03x_app";
const DATA_URL = "data/manual.json";
const ICON_PATH = "icons/testigos/";
const THEME_KEY = "b03x-theme";
const CHECK_KEY = "b03x-checks";
const SELF_TEST_KEY = "b03x-self-test";
const MAX_RESULTS = 30;

const contentElement = /** @type {HTMLElement} */ (document.getElementById("content"));
const crumbsElement = /** @type {HTMLElement} */ (document.getElementById("crumbs"));
const drawerElement = /** @type {any} */ (document.getElementById("drawer"));
const searchElement = /** @type {HTMLElement} */ (document.getElementById("search"));
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById("search-input"));
const searchResults = /** @type {HTMLOListElement} */ (document.getElementById("search-results"));
const toTopButton = /** @type {HTMLButtonElement} */ (document.getElementById("to-top"));
const themeButton = /** @type {HTMLButtonElement} */ (document.getElementById("theme-toggle"));

/** @type {Manual|null} */
let manual = null;
/** @type {Map<string, {section: Section, block: Block, index: number}>} */
const sectionsById = new Map();
/** @type {SearchEntry[]} */
let searchIndex = [];
let selectedResult = 0;
let pendingHighlight = "";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ---------------------------------------------------------------- utilidades

/** Quito acentos y paso a minúsculas para comparar sin importar cómo se escriba. */
const normalize = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Quito etiquetas HTML para indexar o mostrar texto plano. */
const toPlainText = (html) => {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.textContent ?? "";
};

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

/** Creo un elemento con clase y HTML interior en una sola llamada. */
function createElement(tag, className = "", html = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html) element.innerHTML = html;
  return element;
}

// ---------------------------------------------------------------- fechas y calendario

/** Devuelvo la fecha de hoy en formato ISO local. Admito ?fecha=AAAA-MM-DD para probar otros días. */
function getToday() {
  const forced = new URLSearchParams(location.search).get("fecha");
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return forced;
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const TODAY = getToday();

function isCalendarHidden() {
  return Boolean(manual?.calendar && TODAY >= manual.calendar.hideFrom);
}

/** @param {{date: string, end: string|null}} entry */
const coversToday = (entry) => entry.date <= TODAY && TODAY <= (entry.end ?? entry.date);

function todaysChargeEntry() {
  if (!manual?.calendar || isCalendarHidden()) return null;
  return manual.calendar.entries.find((entry) => entry.charge && coversToday(entry)) ?? null;
}

const isAppleDevice = () => /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;

/** Construyo la ruta hasta un punto de recarga; el origen es la ubicación actual que pone la app de mapas. */
function routeUrl(place, provider) {
  const destination = encodeURIComponent(place.query);
  if (provider === "apple") return `https://maps.apple.com/?daddr=${destination}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

// ---------------------------------------------------------------- añadir al calendario del teléfono

const EVENT_KINDS_TO_SKIP = new Set(["NADA"]);
const toCompactDate = (isoDate) => isoDate.replaceAll("-", "");

/** Devuelvo el día siguiente en ISO: los eventos de día completo terminan el día después. */
function nextIsoDay(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** @param {CalendarEntry} entry */
function eventTitle(entry) {
  const kind = entry.kind.charAt(0) + entry.kind.slice(1).toLowerCase();
  const hasPlace = entry.where && !["—", "Casa", "En ruta"].includes(entry.where);
  return `B03X: ${kind}${hasPlace ? ` en ${entry.where}` : ""}`;
}

/** @param {CalendarEntry} entry */
function eventDetails(entry) {
  const appUrl = `${location.origin}${location.pathname}#/${manual?.calendar.section ?? ""}`;
  return [entry.text, entry.battery && entry.battery !== "—" ? `Batería: ${entry.battery}` : "", entry.cost ? `Coste: ${entry.cost}` : "", `Manual: ${appUrl}`]
    .filter(Boolean).join("\n");
}

/** @param {CalendarEntry} entry */
function eventLocation(entry) {
  const keys = entry.place ? (Array.isArray(entry.place) ? entry.place : [entry.place]) : [];
  return keys.map((key) => manual?.places?.[key]?.query ?? "").filter(Boolean).join(" / ");
}

/** Enlace que abre Google Calendar con el evento de día completo ya relleno. @param {CalendarEntry} entry */
function googleCalendarUrl(entry) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(entry),
    dates: `${toCompactDate(entry.date)}/${toCompactDate(nextIsoDay(entry.end ?? entry.date))}`,
    details: eventDetails(entry),
    location: eventLocation(entry),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const escapeIcs = (text) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Genero un .ics con todos los eventos y dos recordatorios: la víspera y el mismo día a las 9:00. */
function buildIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = (manual?.calendar.entries ?? [])
    .filter((entry) => !EVENT_KINDS_TO_SKIP.has(entry.kind))
    .map((entry) => [
      "BEGIN:VEVENT",
      `UID:${entry.date}-${toCompactDate(entry.date)}-${entry.kind.replace(/\s/g, "")}@b03x-manual`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toCompactDate(entry.date)}`,
      `DTEND;VALUE=DATE:${toCompactDate(nextIsoDay(entry.end ?? entry.date))}`,
      `SUMMARY:${escapeIcs(eventTitle(entry))}`,
      `DESCRIPTION:${escapeIcs(eventDetails(entry))}`,
      eventLocation(entry) ? `LOCATION:${escapeIcs(eventLocation(entry))}` : "",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(eventTitle(entry))} (mañana)`, "TRIGGER:-PT15H", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcs(eventTitle(entry))} (hoy)`, "TRIGGER:PT9H", "END:VALARM",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Toni Veintimilla//Manual B03X//ES", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Cargas B03X", ...events, "END:VCALENDAR"].join("\r\n");
}

function downloadIcs() {
  const blob = new Blob([buildIcs()], { type: "text/calendar;charset=utf-8" });
  const link = createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cargas-b03x.ics";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

/** Busco en todo el calendario si hoy tiene fila propia o, si no, qué fila corresponde a esta semana. */
function calendarFocus() {
  const entries = manual?.calendar?.entries ?? [];
  const hasExact = entries.some(coversToday);
  const past = entries.filter((entry) => entry.date <= TODAY);
  const weekDate = past.length ? past[past.length - 1].date : null;
  return { hasExact, weekDate };
}

/** Formateo una fecha ISO como «jueves 8 de octubre». */
function formatLongDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

// ---------------------------------------------------------------- tema

const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Cada modo tiene su icono y su etiqueta; el ciclo es automático, claro, oscuro. */
const THEME_MODES = {
  auto: { icon: "ti-circle-half-2", label: "Tema automático (según el sistema)", next: "light" },
  light: { icon: "ti-sun", label: "Tema claro", next: "dark" },
  dark: { icon: "ti-moon", label: "Tema oscuro", next: "auto" },
};

/** @returns {"auto"|"light"|"dark"} */
function getThemeMode() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "auto";
}

/** Aplico el modo elegido; en automático sigo el tema del sistema. */
function applyTheme(mode) {
  const resolved = mode === "auto" ? (systemDarkQuery.matches ? "dark" : "light") : mode;
  const isDark = resolved === "dark";
  const { icon, label } = THEME_MODES[mode];
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("sl-theme-dark", isDark);
  themeButton.innerHTML = `<i class="ti ${icon}"></i>`;
  themeButton.title = `${label}. Toca para cambiar`;
  themeButton.setAttribute("aria-label", `${label}. Cambiar tema`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#12181F" : "#1D2733");
}

function initTheme() {
  applyTheme(getThemeMode());
  themeButton.addEventListener("click", () => {
    const next = THEME_MODES[getThemeMode()].next;
    if (next === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    withTransition(() => applyTheme(next));
  });
  // Si el sistema cambia de claro a oscuro (por ejemplo al anochecer) y estoy en automático, lo sigo al momento
  systemDarkQuery.addEventListener("change", () => {
    if (getThemeMode() === "auto") withTransition(() => applyTheme("auto"));
  });
}

// ---------------------------------------------------------------- transiciones

/** Envuelvo cualquier cambio visual en una View Transition si el navegador la soporta. */
function withTransition(update) {
  const canAnimate = "startViewTransition" in document && !prefersReducedMotion.matches;
  if (!canAnimate) {
    update();
    contentElement.classList.remove("is-entering");
    void contentElement.offsetWidth;
    contentElement.classList.add("is-entering");
    return;
  }
  document.startViewTransition(update);
}

// ---------------------------------------------------------------- referencias cruzadas

/** Convierto las menciones «bloque N» del texto en enlaces al bloque correspondiente. */
function linkCrossReferences(root) {
  if (!manual) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(/** @type {Text} */ (walker.currentNode));

  const pattern = /\b(bloques?)\s([1-6])\b/gi;
  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest("a")) continue;
    const text = textNode.nodeValue ?? "";
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const matchIndex = match.index ?? 0;
      fragment.append(text.slice(lastIndex, matchIndex));
      const link = createElement("a", "xref");
      link.href = `#/b${match[2]}`;
      link.textContent = match[0];
      fragment.append(link);
      lastIndex = matchIndex + match[0].length;
    }
    fragment.append(text.slice(lastIndex));
    textNode.replaceWith(fragment);
  }
}

// ---------------------------------------------------------------- glosario de referencias cruzadas

/** @type {Array<{term: GlossaryTerm, regex: RegExp}>} */
let glossaryMatchers = [];

function buildGlossary() {
  glossaryMatchers = (manual?.glossary ?? []).map((term) => ({ term, regex: new RegExp(term.pattern, term.flags) }));
}

/** Marco la primera aparición de cada término del glosario en el apartado para enlazarlo con los demás. */
function linkGlossaryTerms(root, sectionId) {
  if (!glossaryMatchers.length || !sectionId) return;
  const skipSelector = "a, button, h1, h3, h4, th, .term, mark";
  for (const { term, regex } of glossaryMatchers) {
    const others = term.sections.filter((id) => id !== sectionId && !isHiddenSection(id));
    if (!others.length) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = /** @type {Text} */ (walker.currentNode);
      if (textNode.parentElement?.closest(skipSelector)) continue;
      const text = textNode.nodeValue ?? "";
      const match = regex.exec(text);
      regex.lastIndex = 0;
      if (!match) continue;
      const button = createElement("button", "term");
      button.type = "button";
      button.dataset.term = term.id;
      button.textContent = match[0];
      const after = textNode.splitText(match.index);
      after.nodeValue = (after.nodeValue ?? "").slice(match[0].length);
      after.before(button);
      break;
    }
  }
}

const popoverElement = createElement("div", "term-popover");
popoverElement.setAttribute("role", "dialog");
popoverElement.hidden = true;
document.body.append(popoverElement);

/** @param {HTMLElement} anchor */
function openTermPopover(anchor) {
  const term = manual?.glossary.find((candidate) => candidate.id === anchor.dataset.term);
  if (!term) return;
  const currentId = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const linkFor = (sectionId) => {
    const entry = sectionsById.get(sectionId);
    if (!entry) return "";
    return `<a href="#/${sectionId}"><i class="ti ti-${entry.block.icon}"></i><span><strong>${entry.section.title}</strong>
      <small>${entry.block.number}. ${entry.block.title}</small></span></a>`;
  };
  const homeLink = term.home !== currentId ? linkFor(term.home) : "";
  const alsoLinks = term.sections.filter((id) => id !== currentId && id !== term.home && !isHiddenSection(id)).map(linkFor).join("");
  popoverElement.innerHTML = `
    <p class="term-popover__title">${term.label}</p>
    ${homeLink ? `<p class="term-popover__label">Dónde se explica</p>${homeLink}` : `<p class="term-popover__label">Se explica en este apartado</p>`}
    ${alsoLinks ? `<p class="term-popover__label">También aparece en</p>${alsoLinks}` : ""}`;
  popoverElement.hidden = false;
  const box = anchor.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.min(Math.max(12, box.left), window.innerWidth - width - 12);
  const below = box.bottom + 8;
  const fitsBelow = below + popoverElement.offsetHeight < window.innerHeight - 12;
  popoverElement.style.width = `${width}px`;
  popoverElement.style.left = `${left}px`;
  popoverElement.style.top = `${fitsBelow ? below : Math.max(12, box.top - popoverElement.offsetHeight - 8)}px`;
  popoverElement.classList.remove("is-open");
  void popoverElement.offsetWidth;
  popoverElement.classList.add("is-open");
}

function closeTermPopover() {
  popoverElement.hidden = true;
  popoverElement.classList.remove("is-open");
}

// ---------------------------------------------------------------- renderizado de contenido

/** @param {string|{icon:string}} cell */
function cellHtml(cell) {
  if (typeof cell === "string") return cell;
  return `<img src="${ICON_PATH}${cell.icon}.svg" alt="" loading="lazy" width="36" height="36">`;
}

/** @param {ContentNode} node */
function renderTable(node) {
  const wrap = createElement("div", "table-wrap");
  const table = createElement("table", [node.tone ? `table--${node.tone}` : "", node.icons ? "has-icons" : ""].join(" ").trim());
  const head = node.head ?? [];
  const labels = head.map((cell) => (typeof cell === "string" ? toPlainText(cell) : ""));
  const thead = createElement("thead");
  thead.innerHTML = `<tr>${head.map((cell) => `<th>${cellHtml(cell)}</th>`).join("")}</tr>`;
  const tbody = createElement("tbody");
  const calendar = node.calendar ?? null;
  const focus = calendarFocus();
  const exactIndex = calendar ? calendar.findIndex(coversToday) : -1;
  const weekIndex = calendar && !focus.hasExact ? calendar.findIndex((entry) => entry.date === focus.weekDate) : -1;
  for (const [rowIndex, row] of (node.rows ?? []).entries()) {
    const tr = createElement("tr");
    const entry = calendar?.[rowIndex];
    if (entry?.charge) tr.classList.add("is-charge");
    if (rowIndex === exactIndex) tr.classList.add("is-today");
    if (rowIndex === weekIndex) tr.classList.add("is-week");
    row.forEach((cell, index) => {
      const td = createElement("td", typeof cell === "string" ? "" : "icon-cell", cellHtml(cell));
      td.dataset.label = labels[index] ?? "";
      const fullEntry = entry && index === 1 && !EVENT_KINDS_TO_SKIP.has(entry.kind)
        ? manual?.calendar.entries.find((candidate) => candidate.date === entry.date && candidate.kind === entry.kind)
        : null;
      if (fullEntry) {
        td.insertAdjacentHTML("beforeend", `<a class="cal-add" href="${googleCalendarUrl(fullEntry)}" target="_blank" rel="noopener"
          title="Añadir a Google Calendar" aria-label="Añadir a Google Calendar"><i class="ti ti-calendar-plus"></i> Añadir al calendario</a>`);
      }
      if (index === 0 && rowIndex === exactIndex) td.insertAdjacentHTML("beforeend", ` <span class="today-badge">Hoy</span>`);
      if (index === 0 && rowIndex === weekIndex) td.insertAdjacentHTML("beforeend", ` <span class="today-badge today-badge--week">Esta semana</span>`);
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

/** @param {ContentNode} node @param {string} tone @param {string} icon */
function renderCallout(node, tone, icon) {
  return createElement("div", `callout callout--${tone}`, `<i class="ti ti-${icon}"></i><div>${node.html ?? ""}</div>`);
}

/** @param {ContentNode} node @param {string} sectionId */
function renderChecklist(node, sectionId) {
  const saved = JSON.parse(localStorage.getItem(CHECK_KEY) ?? "{}");
  const list = createElement("ul", "checklist");
  (node.items ?? []).forEach((item, index) => {
    if (typeof item === "string") return;
    const key = `${sectionId}-${index}`;
    const checkboxId = `check-${key}`;
    const row = createElement("li", saved[key] ? "is-done" : "");
    row.innerHTML = `<input type="checkbox" id="${checkboxId}" ${saved[key] ? "checked" : ""}>
      <label for="${checkboxId}">${item.title}</label><div>${item.html}</div>`;
    row.querySelector("input")?.addEventListener("change", (event) => {
      const isChecked = /** @type {HTMLInputElement} */ (event.target).checked;
      const state = JSON.parse(localStorage.getItem(CHECK_KEY) ?? "{}");
      state[key] = isChecked;
      localStorage.setItem(CHECK_KEY, JSON.stringify(state));
      row.classList.toggle("is-done", isChecked);
    });
    list.append(row);
  });
  return list;
}

/** Cada tipo de nodo tiene su propio renderizador: evito una cadena de ifs. */
const nodeRenderers = {
  p: (node) => createElement("p", "", node.html),
  small: (node) => createElement("p", "small", node.html),
  h3: (node) => createElement("h3", "", node.html),
  list: (node) => createElement("ul", "", (node.items ?? []).map((item) => `<li>${item}</li>`).join("")),
  steps: (node) => createElement("ol", "steps", (node.items ?? []).map((item) => `<li>${item}</li>`).join("")),
  note: (node) => renderCallout(node, "note", "info-circle"),
  warn: (node) => renderCallout(node, "warn", "alert-triangle"),
  tip: (node) => renderCallout(node, "tip", "bulb"),
  table: renderTable,
  figure: (node) => createElement("figure", "diagram", `<img src="${node.src}" alt="Esquema: ${node.alt ?? ""}" loading="lazy">`),
  columns: (node) =>
    createElement("div", "columns", (node.items ?? [])
      .map((item) => (typeof item === "string" ? "" : `<section><h4>${item.title}</h4><div>${item.html}</div></section>`))
      .join("")),
};

/** @param {ContentNode[]} nodes @param {string} sectionId */
function renderNodes(nodes, sectionId) {
  const container = createElement("div", "rich");
  for (const node of nodes) {
    if (node.t === "checklist") {
      container.append(renderChecklist(node, sectionId));
      continue;
    }
    const renderer = nodeRenderers[node.t];
    if (!renderer) continue;
    container.append(renderer(node));
  }
  linkCrossReferences(container);
  linkGlossaryTerms(container, sectionId);
  // Los enlaces externos (mapas, webs) se abren fuera de la app para no perder la página
  container.querySelectorAll('a[href^="http"]').forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  });
  return container;
}

/** El calendario de carga desaparece del menú, la portada y el buscador cuando termina. */
function isHiddenSection(sectionId) {
  return isCalendarHidden() && sectionId === manual?.calendar.section;
}

function renderCredits() {
  const date = VERSION_INFO.date ? `Actualizado el ${formatLongDate(VERSION_INFO.date).replace(/^\S+ /, "")} de ${VERSION_INFO.date.slice(0, 4)}` : "";
  return `
    <p class="credits__version">Versión ${APP_VERSION}${date ? `<br>${date}` : ""}</p>
    <p class="credits__author">Creado y desarrollado por <strong>${AUTHOR}</strong></p>
    <p class="credits__links"><a href="${REPO_URL}" target="_blank" rel="noopener"><i class="ti ti-brand-github"></i> Código en GitHub</a></p>`;
}

// ---------------------------------------------------------------- orden personal de las consultas rápidas

const QUICK_ORDER_KEY = "b03x-quick-order";

/** Aplico el orden guardado; lo nuevo que no estuviera guardado va al final y lo que ya no existe se ignora. */
function orderedQuickLinks() {
  const visible = (manual?.quick ?? []).filter((quick) => !isHiddenSection(quick.section));
  let savedOrder = [];
  try {
    savedOrder = JSON.parse(localStorage.getItem(QUICK_ORDER_KEY) ?? "[]");
  } catch (error) {
    savedOrder = [];
  }
  const position = (quick) => {
    const index = savedOrder.indexOf(quick.section);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return visible
    .map((quick, originalIndex) => ({ quick, originalIndex }))
    .sort((first, second) => position(first.quick) - position(second.quick) || first.originalIndex - second.originalIndex)
    .map(({ quick }) => quick);
}

/** @param {HTMLElement} grid */
function saveQuickOrder(grid) {
  const keys = Array.from(grid.querySelectorAll(".quick__item"), (item) => /** @type {HTMLElement} */ (item).dataset.key);
  localStorage.setItem(QUICK_ORDER_KEY, JSON.stringify(keys));
}

/** Muevo una tarjeta con animación FLIP: guardo posiciones, cambio el DOM y animo desde donde estaban. */
function moveQuickItem(item, direction) {
  const grid = item.parentElement;
  if (!grid) return;
  const sibling = direction < 0 ? item.previousElementSibling : item.nextElementSibling;
  if (!sibling) return;
  const cards = Array.from(grid.children);
  const before = new Map(cards.map((card) => [card, card.getBoundingClientRect()]));
  if (direction < 0) sibling.before(item);
  else sibling.after(item);
  if (!prefersReducedMotion.matches) {
    for (const card of cards) {
      const previous = before.get(card);
      const current = card.getBoundingClientRect();
      const deltaX = (previous?.left ?? 0) - current.left;
      const deltaY = (previous?.top ?? 0) - current.top;
      if (!deltaX && !deltaY) continue;
      card.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }],
        { duration: 320, easing: "cubic-bezier(.2, .8, .2, 1)" });
    }
  }
  saveQuickOrder(/** @type {HTMLElement} */ (grid));
  /** @type {HTMLElement|null} */ (item.querySelector(`[data-move="${direction}"]`))?.focus();
}

/** @param {HTMLElement} view */
function setupQuickOrdering(view) {
  const grid = /** @type {HTMLElement|null} */ (view.querySelector(".quick"));
  const editButton = /** @type {HTMLButtonElement|null} */ (view.querySelector("[data-quick-edit]"));
  const resetButton = /** @type {HTMLButtonElement|null} */ (view.querySelector("[data-quick-reset]"));
  const hint = /** @type {HTMLElement|null} */ (view.querySelector(".quick-hint"));
  if (!grid || !editButton || !resetButton || !hint) return;

  const SortableLibrary = /** @type {any} */ (window).Sortable;
  const sortable = SortableLibrary?.create(grid, {
    animation: 260,
    easing: "cubic-bezier(.2, .8, .2, 1)",
    disabled: true,
    // En táctil uso el modo propio de SortableJS con eventos touch: mantengo pulsado un instante y arrastro,
    // y así el navegador no confunde el gesto con un desplazamiento de la página y no cancela el arrastre
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    supportPointer: false,
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    ghostClass: "is-ghost",
    chosenClass: "is-chosen",
    dragClass: "is-dragging",
    filter: ".quick__move",
    preventOnFilter: false,
    onEnd: () => saveQuickOrder(grid),
  });

  const setEditing = (isEditing) => {
    grid.classList.toggle("is-editing", isEditing);
    sortable?.option("disabled", !isEditing);
    editButton.setAttribute("aria-pressed", String(isEditing));
    editButton.innerHTML = isEditing
      ? `<i class="ti ti-check"></i> <span>Listo</span>`
      : `<i class="ti ti-arrows-move"></i> <span>Organizar</span>`;
    resetButton.hidden = !isEditing;
    hint.hidden = !isEditing;
  };

  editButton.addEventListener("click", () => setEditing(!grid.classList.contains("is-editing")));
  resetButton.addEventListener("click", () => {
    localStorage.removeItem(QUICK_ORDER_KEY);
    withTransition(() => {
      const fresh = renderHome();
      if (!fresh) return;
      contentElement.replaceChildren(fresh.view);
    });
  });
  grid.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const moveButton = target.closest(".quick__move");
    if (moveButton) {
      event.preventDefault();
      moveQuickItem(moveButton.closest(".quick__item"), Number(/** @type {HTMLElement} */ (moveButton).dataset.move));
      return;
    }
    // Mientras organizo, las tarjetas no navegan
    if (grid.classList.contains("is-editing") && target.closest(".quick__link")) event.preventDefault();
  });
}

// ---------------------------------------------------------------- vistas

function renderHome() {
  if (!manual) return;
  const view = createElement("div", "home");
  const quickItems = orderedQuickLinks()
    .map((quick, index) => `
      <div class="quick__item tone-${quick.tone}" data-key="${quick.section}" style="--i:${index}">
        <span class="quick__grip" aria-hidden="true"><i class="ti ti-grip-vertical"></i></span>
        <a class="quick__link" href="#/${quick.section}">
          <span class="lamp"><i class="ti ti-${quick.icon}"></i></span><span class="quick__label">${quick.label}</span>
        </a>
        <span class="quick__moves">
          <button type="button" class="quick__move" data-move="-1" aria-label="Subir «${quick.label}»"><i class="ti ti-arrow-up"></i></button>
          <button type="button" class="quick__move" data-move="1" aria-label="Bajar «${quick.label}»"><i class="ti ti-arrow-down"></i></button>
        </span>
      </div>`)
    .join("");
  const blockItems = manual.blocks
    .map((block, index) => `
      <li><a class="card" href="#/${block.id}" style="--i:${index}">
        <span class="card__icon"><i class="ti ti-${block.icon}"></i></span>
        <span class="card__text">
          <span class="card__title"><span class="card__num">${block.number}</span>${block.title}</span>
          <span class="card__sub">${block.subtitle}</span>
        </span>
        <i class="ti ti-chevron-right card__go"></i>
      </a></li>`)
    .join("");

  const charge = todaysChargeEntry();
  // Una carga puede tener un sitio o varios alternativos: muestro una ruta por cada uno
  const placeKeys = charge?.place ? (Array.isArray(charge.place) ? charge.place : [charge.place]) : [];
  const places = placeKeys.map((key) => manual.places?.[key]).filter(Boolean);
  const routeButtons = places.map((place) => `
        <a class="route-btn" href="${routeUrl(place, isAppleDevice() ? "apple" : "google")}" target="_blank" rel="noopener">
          <i class="ti ti-route"></i>${places.length > 1 ? place.name : "Cómo llegar"}</a>`).join("");
  const chargeBanner = charge ? `
    <div class="charge-alert">
      <div class="charge-alert__main">
        <span class="charge-alert__icon"><i class="ti ti-battery-charging"></i></span>
        <span class="charge-alert__body">
          <strong>Hoy toca cargar</strong>
          <span>${charge.kind.charAt(0) + charge.kind.slice(1).toLowerCase()} en <b>${charge.where}</b>, ${charge.battery}</span>
          ${charge.text ? `<small>${charge.text}</small>` : ""}
        </span>
      </div>
      <div class="charge-alert__routes">
        ${routeButtons}
        <a class="route-btn route-btn--alt" href="#/${manual.calendar.section}"><i class="ti ti-calendar-event"></i>Calendario</a>
        ${manual.calendar.howto ? `<a class="route-btn route-btn--alt" href="#/${manual.calendar.howto}"><i class="ti ti-plug-connected"></i>Cómo cargar</a>` : ""}
      </div>
    </div>` : "";
  view.innerHTML = `
    <section class="home-hero">
      <div class="home-hero__top">
        <div><h1>Leapmotor B03X</h1>
        <p>Lo que necesitas del manual, en castellano y a dos toques.</p></div>
        ${chargeBanner}
      </div>
      <button class="home-search" data-open-search><i class="ti ti-search"></i>Qué te pasa o qué buscas</button>
    </section>
    <div class="quick-head">
      <h2>Consultas rápidas</h2>
      <span class="quick-head__actions">
        <button type="button" class="quick-reset" data-quick-reset hidden><i class="ti ti-refresh"></i> Orden original</button>
        <button type="button" class="quick-edit" data-quick-edit aria-pressed="false"><i class="ti ti-arrows-move"></i> <span>Organizar</span></button>
      </span>
    </div>
    <p class="quick-hint" hidden>Arrastra las tarjetas o usa las flechas para cambiarlas de sitio. El orden se guarda en este dispositivo.</p>
    <nav class="quick" aria-label="Consultas rápidas">${quickItems}</nav>
    <h2>El manual completo</h2>
    <ol class="blocks">${blockItems}</ol>
    <footer class="colophon">${renderCredits()}</footer>`;

  const alreadyTested = sessionStorage.getItem(SELF_TEST_KEY);
  if (!alreadyTested && !prefersReducedMotion.matches) {
    view.classList.add("is-self-test");
    sessionStorage.setItem(SELF_TEST_KEY, "1");
  }
  setupQuickOrdering(view);
  return { view, title: "Manual de casa", crumbs: [] };
}

/** @param {Block} block */
function renderBlock(block) {
  const view = createElement("div", "block-page");
  view.innerHTML = `
    <header class="block-head">
      <span class="block-head__icon"><i class="ti ti-${block.icon}"></i></span>
      <div><h1>${block.title}</h1><p>${block.subtitle}</p></div>
    </header>`;
  if (block.intro.length) view.append(renderNodes(block.intro, block.id));
  const list = createElement("ol", "blocks section-cards");
  list.innerHTML = block.sections
    .filter((section) => !isHiddenSection(section.id))
    .map((section) => `
      <li><a class="card card--section" href="#/${section.id}">
        <span class="card__icon card__icon--marker">${section.marker}</span>
        <span class="card__text"><span class="card__title">${section.title}</span></span>
        <i class="ti ti-chevron-right card__go"></i>
      </a></li>`)
    .join("");
  view.append(list);
  return { view, title: block.title, crumbs: [{ label: `${block.number}. ${block.title}`, href: "", className: "here" }] };
}

/** @param {Section} section @param {Block} block @param {number} index */
function renderSection(section, block, index) {
  const view = createElement("article", "section-page");
  const header = createElement("header", "section-head");
  header.innerHTML = `
    <a class="kicker" href="#/${block.id}"><i class="ti ti-${block.icon}"></i>${block.number}. ${block.title}</a>
    <h1>${section.marker}. ${section.title}</h1>`;
  view.append(header);
  if (manual && section.id === manual.calendar.section) view.append(renderCalendarTools());
  view.append(renderNodes(section.content, section.id));

  const previous = block.sections[index - 1];
  const next = block.sections[index + 1] ?? nextBlockFirstSection(block);
  const pager = createElement("nav", "pager");
  pager.setAttribute("aria-label", "Apartado anterior y siguiente");
  if (previous) {
    pager.innerHTML += `<a class="prev" href="#/${previous.id}"><small><i class="ti ti-chevron-left"></i>Anterior</small><strong>${previous.title}</strong></a>`;
  }
  if (next) {
    pager.innerHTML += `<a class="next" href="#/${next.id}"><small>Siguiente<i class="ti ti-chevron-right"></i></small><strong>${next.title}</strong></a>`;
  }
  view.append(pager);
  return {
    view,
    title: section.title,
    crumbs: [
      { label: `${block.number}. ${block.title}`, href: `#/${block.id}`, className: "crumb-block" },
      { label: section.title, href: "", className: "here" },
    ],
  };
}

function renderCalendarTools() {
  const tools = createElement("div", "cal-tools");
  tools.innerHTML = `
    <button type="button" class="cal-tools__all"><i class="ti ti-calendar-plus"></i> Añadir todas las fechas al calendario</button>
    <p>Descarga un archivo con todas las cargas y gestiones, con aviso la víspera y el mismo día a las 9:00. En iPhone se
    abre en Calendario; en Android lo abre el calendario de Samsung, Outlook u otros. Con Google Calendar en Android, usa el
    botón «Añadir al calendario» de cada fila.</p>`;
  tools.querySelector("button")?.addEventListener("click", downloadIcs);
  return tools;
}

/** @param {Block} block */
function nextBlockFirstSection(block) {
  const nextBlock = manual?.blocks[block.number];
  return nextBlock?.sections[0];
}

function renderNotFound() {
  const view = createElement("div", "not-found",
    `<h1>Esta página no existe</h1><p>Puede que el enlace sea antiguo. <a href="#/">Vuelve al inicio</a> o usa el buscador.</p>`);
  return { view, title: "No encontrado", crumbs: [] };
}

function renderCrumbs(crumbs) {
  const parts = [`<a class="crumb-home" href="#/" aria-label="Inicio" title="Inicio"><i class="ti ti-home"></i></a>`];
  for (const crumb of crumbs) {
    parts.push(`<i class="ti ti-chevron-right sep ${crumb.className === "here" ? "" : crumb.className}"></i>`);
    parts.push(crumb.href
      ? `<a class="${crumb.className}" href="${crumb.href}">${crumb.label}</a>`
      : `<span class="${crumb.className}">${crumb.label}</span>`);
  }
  crumbsElement.innerHTML = parts.join("");
}

// ---------------------------------------------------------------- árbol lateral

function buildTree(container) {
  if (!manual) return;
  container.innerHTML = `<a class="tree__home" href="#/" data-route=""><i class="ti ti-home"></i>Inicio</a>`;
  for (const block of manual.blocks) {
    const group = createElement("div", "tree__group");
    group.dataset.block = block.id;
    const childrenId = `${container.id}-${block.id}`;
    group.innerHTML = `
      <button class="tree__block" aria-expanded="false" aria-controls="${childrenId}">
        <span class="tree__num" title="Bloque ${block.number}"><i class="ti ti-${block.icon}"></i></span>
        <span class="tree__title">${block.title}</span>
        <i class="ti ti-chevron-right tree__chev"></i>
      </button>
      <div class="tree__children" id="${childrenId}"><ul>
        <li><a class="tree__link" href="#/${block.id}" data-route="${block.id}">Ver el bloque entero</a></li>
        ${block.sections.filter((section) => !isHiddenSection(section.id)).map((section) => `<li><a class="tree__link" href="#/${section.id}" data-route="${section.id}">${section.title}</a></li>`).join("")}
      </ul></div>`;
    group.querySelector(".tree__block")?.addEventListener("click", () => toggleGroup(group));
    container.append(group);
  }
}

function setGroupOpen(group, isOpen) {
  group.classList.toggle("is-open", isOpen);
  group.querySelector(".tree__block")?.setAttribute("aria-expanded", String(isOpen));
}

/** Funciono como acordeón: al abrir un bloque cierro el resto del mismo árbol. */
function toggleGroup(group, forceOpen) {
  const isOpen = forceOpen ?? !group.classList.contains("is-open");
  if (isOpen) {
    group.parentElement?.querySelectorAll(".tree__group.is-open").forEach((sibling) => {
      if (sibling !== group) setGroupOpen(sibling, false);
    });
  }
  setGroupOpen(group, isOpen);
}

/** Marco la ruta activa en los dos árboles y abro el bloque que la contiene. */
function syncTree(routeId, blockId) {
  for (const tree of document.querySelectorAll(".tree")) {
    tree.querySelectorAll("[data-route]").forEach((link) => {
      const isActive = /** @type {HTMLElement} */ (link).dataset.route === routeId;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    tree.querySelectorAll(".tree__group").forEach((group) => {
      const isCurrent = /** @type {HTMLElement} */ (group).dataset.block === blockId;
      group.classList.toggle("is-current", isCurrent);
      if (isCurrent) toggleGroup(group, true);
      if (!blockId) setGroupOpen(group, false);
    });
    const active = tree.querySelector(".is-active");
    if (active && tree.id === "tree-desktop") active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// ---------------------------------------------------------------- enrutado

function resolveRoute() {
  const routeId = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (!manual) return null;
  if (!routeId) return { ...renderHome(), routeId: "", blockId: "" };

  const block = manual.blocks.find((candidate) => candidate.id === routeId);
  if (block) return { ...renderBlock(block), routeId, blockId: block.id };

  const entry = sectionsById.get(routeId);
  if (entry && isHiddenSection(routeId)) {
    const view = createElement("div", "not-found",
      `<h1>El calendario de carga ya terminó</h1><p>Cubría de septiembre a enero. Las normas de carga siguen en <a href="#/${entry.block.id}">el bloque ${entry.block.number}</a>.</p>`);
    return { view, title: "Calendario terminado", crumbs: [], routeId, blockId: entry.block.id };
  }
  if (entry) return { ...renderSection(entry.section, entry.block, entry.index), routeId, blockId: entry.block.id };

  return { ...renderNotFound(), routeId, blockId: "" };
}

function navigate() {
  const route = resolveRoute();
  if (!route) return;
  withTransition(() => {
    contentElement.replaceChildren(route.view);
    renderCrumbs(route.crumbs);
    syncTree(route.routeId, route.blockId);
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  document.title = `${route.title} · B03X`;
  drawerElement?.hide?.();
  closeTermPopover();
  highlightPendingTerm();
  focusCalendarRow();
}

/** En el calendario me sitúo en la fila de hoy o, si no hay, en la de esta semana. */
function focusCalendarRow() {
  if (pendingHighlight) return;
  requestAnimationFrame(() => {
    const row = contentElement.querySelector("tr.is-today, tr.is-week");
    if (!row) return;
    setTimeout(() => {
      row.scrollIntoView({ block: "center", behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
      row.classList.add("is-flash");
    }, 250);
  });
}

/** Tras abrir un resultado de búsqueda, resalto la primera aparición del término en la página. */
function highlightPendingTerm() {
  if (!pendingHighlight) return;
  const term = normalize(pendingHighlight);
  pendingHighlight = "";
  requestAnimationFrame(() => {
    const candidates = contentElement.querySelectorAll(".rich p, .rich li, .rich td, .rich h3, .callout div");
    const target = Array.from(candidates).find((element) => normalize(element.textContent ?? "").includes(term));
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: prefersReducedMotion.matches ? "auto" : "smooth" });
    target.classList.add("is-flash");
  });
}

// ---------------------------------------------------------------- buscador

function buildSearchIndex() {
  if (!manual) return;
  searchIndex = manual.blocks.flatMap((block) =>
    block.sections.map((section) => {
      const contentText = section.content.map(nodeToText).join(" ");
      return { section, block, title: normalize(`${section.title} ${section.keywords ?? ""}`), text: normalize(contentText), raw: contentText };
    }));
}

/** @param {ContentNode} node */
function nodeToText(node) {
  const parts = [node.html ?? ""];
  for (const item of node.items ?? []) parts.push(typeof item === "string" ? item : `${item.title} ${item.html}`);
  for (const row of [node.head ?? [], ...(node.rows ?? [])]) {
    for (const cell of row) if (typeof cell === "string") parts.push(cell);
  }
  return toPlainText(parts.join(" "));
}

function searchManual(query) {
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 1);
  if (!terms.length) return [];
  return searchIndex
    .filter((entry) => !isHiddenSection(entry.section.id))
    .map((entry) => {
      const matchesAll = terms.every((term) => entry.title.includes(term) || entry.text.includes(term));
      if (!matchesAll) return null;
      const score = terms.reduce((total, term) =>
        total + (entry.title.includes(term) ? 10 : 0) + Math.min(entry.text.split(term).length - 1, 5), 0);
      return { entry, score };
    })
    .filter(Boolean)
    .sort((first, second) => second.score - first.score)
    .slice(0, MAX_RESULTS);
}

/** Recorto un fragmento alrededor del primer término encontrado y lo resalto. */
function buildSnippet(raw, terms) {
  const normalizedRaw = normalize(raw);
  const position = terms.map((term) => normalizedRaw.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (position === undefined) return "";
  const start = Math.max(0, position - 50);
  let snippet = escapeHtml(raw.slice(start, start + 150));
  for (const term of terms) {
    const pattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    snippet = snippet.replace(pattern, (match) => (normalize(match) === term ? `<mark>${match}</mark>` : match));
  }
  return `${start > 0 ? "…" : ""}${snippet}…`;
}

function renderResults() {
  const query = searchInput.value.trim();
  selectedResult = 0;
  if (!query) {
    searchResults.innerHTML = manual?.quick
      .filter((quick) => !isHiddenSection(quick.section))
      .map((quick, index) => `<li><a href="#/${quick.section}" style="--i:${index}"><i class="ti ti-${quick.icon} res-icon"></i><span><strong>${quick.label}</strong></span></a></li>`)
      .join("") ?? "";
    markSelected();
    return;
  }
  const results = searchManual(query);
  if (!results.length) {
    searchResults.innerHTML = `<li class="search__empty">No encuentro «${escapeHtml(query)}». Prueba con otra palabra: cargar, rueda, testigo, llave…</li>`;
    return;
  }
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 1);
  searchResults.innerHTML = results
    .map(({ entry }, index) => `
      <li><a href="#/${entry.section.id}" data-term="${escapeHtml(terms[0] ?? "")}" style="--i:${Math.min(index, 12)}">
        <i class="ti ti-${entry.block.icon} res-icon"></i>
        <span><strong>${entry.section.title}</strong>
          <span class="res-path">${entry.block.number}. ${entry.block.title}</span>
          <span class="res-snippet">${buildSnippet(entry.raw, terms)}</span></span>
      </a></li>`)
    .join("");
  markSelected();
}

function markSelected() {
  const links = searchResults.querySelectorAll("a");
  links.forEach((link, index) => link.classList.toggle("is-selected", index === selectedResult));
  links[selectedResult]?.scrollIntoView({ block: "nearest" });
}

function openSearch() {
  searchElement.hidden = false;
  searchElement.classList.remove("is-closing");
  searchInput.value = "";
  renderResults();
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearch() {
  if (searchElement.hidden) return;
  if (prefersReducedMotion.matches) {
    searchElement.hidden = true;
    return;
  }
  searchElement.classList.add("is-closing");
  setTimeout(() => { searchElement.hidden = true; }, 160);
}

function initSearch() {
  document.getElementById("search-open")?.addEventListener("click", openSearch);
  document.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("[data-open-search]")) openSearch();
    if (target.closest("[data-close]")) closeSearch();
    const termButton = target.closest(".term");
    if (termButton) {
      openTermPopover(/** @type {HTMLElement} */ (termButton));
      return;
    }
    if (!target.closest(".term-popover")) closeTermPopover();
    const resultLink = target.closest(".search__results a");
    if (!resultLink) return;
    pendingHighlight = /** @type {HTMLElement} */ (resultLink).dataset.term ?? "";
    closeSearch();
  });
  searchInput.addEventListener("input", renderResults);
  searchInput.addEventListener("keydown", (event) => {
    const links = searchResults.querySelectorAll("a");
    const keyActions = {
      ArrowDown: () => { selectedResult = Math.min(selectedResult + 1, links.length - 1); markSelected(); },
      ArrowUp: () => { selectedResult = Math.max(selectedResult - 1, 0); markSelected(); },
      Enter: () => { /** @type {HTMLElement|undefined} */ (links[selectedResult])?.click(); },
    };
    const action = keyActions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeSearch(); closeTermPopover(); }
    const isTyping = ["INPUT", "TEXTAREA"].includes(/** @type {HTMLElement} */ (event.target).tagName);
    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      openSearch();
    }
  });
}

// ---------------------------------------------------------------- arranque

function initChrome() {
  document.getElementById("menu-open")?.addEventListener("click", () => drawerElement?.show?.());
  toTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? "auto" : "smooth" }));
  window.addEventListener("scroll", () => {
    toTopButton.classList.toggle("is-visible", window.scrollY > 600);
    if (!popoverElement.hidden) closeTermPopover();
  }, { passive: true });
  window.addEventListener("hashchange", navigate);
}

async function loadManual() {
  contentElement.innerHTML = `<div class="loading"><i class="ti ti-steering-wheel"></i></div>`;
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return /** @type {Manual} */ (await response.json());
  } catch (error) {
    contentElement.innerHTML = `<div class="loading"><p>No se ha podido cargar el manual (${escapeHtml(String(error))}). Comprueba la conexión y recarga la página.</p></div>`;
    return null;
  }
}

async function start() {
  document.querySelectorAll("[data-credits]").forEach((element) => { element.innerHTML = renderCredits(); });
  initTheme();
  initChrome();
  initSearch();
  manual = await loadManual();
  if (!manual) return;
  for (const block of manual.blocks) {
    block.sections.forEach((section, index) => sectionsById.set(section.id, { section, block, index }));
  }
  buildTree(/** @type {HTMLElement} */ (document.getElementById("tree-desktop")));
  buildTree(/** @type {HTMLElement} */ (document.getElementById("tree-mobile")));
  buildSearchIndex();
  buildGlossary();
  navigate();
  // Desde el acceso directo «Buscar» del icono de la app abro el buscador al arrancar
  if (new URLSearchParams(location.search).has("buscar")) openSearch();
}

start();
