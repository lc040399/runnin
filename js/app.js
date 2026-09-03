/* Runnin - kortet er produktet. */
"use strict";

const TYPE_COLOR = { kort: "#2563EB", half: "#16A34A", marathon: "#C05800", ultra: "#7C3AED", tri: "#38240D" };
const TYPE_LABEL = { kort: "Kort (5-15 km)", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra & trail", tri: "Triathlon" };
const MONTHS = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
const NORDICS = ["DK","SE","NO","FI","IS","GL","FO"];
const REGIONS = [
  { key: null, label: "Hvor som helst" },
  { key: "dk", label: "Danmark" },
  { key: "norden", label: "Norden" },
  { key: "EU", label: "Europa" },
  { key: "NA", label: "Nordamerika" },
  { key: "SA", label: "Sydamerika" },
  { key: "AS", label: "Asien" },
  { key: "AF", label: "Afrika" },
  { key: "OC", label: "Oceanien" },
];

const state = { type: null, month: null, region: null, tab: "kort" };
// favoritter gemmes på løbets NAVN - id er et indeks, der forskydes ved hver dataopdatering.
// Gamle numeriske favoritter migreres efter bedste evne.
const favs = new Set(
  JSON.parse(localStorage.getItem("runnin-favs") || "[]")
    .map(v => (typeof v === "number" ? RACES[v]?.n : v))
    .filter(Boolean)
);
// Tilmeldinger markeres manuelt (købet sker på arrangørens side) - nøgle = løbets navn
const entries = new Set(JSON.parse(localStorage.getItem("runnin-entries") || "[]"));
const saveEntries = () => localStorage.setItem("runnin-entries", JSON.stringify([...entries]));
RACES.forEach((r, i) => (r.id = i));

/* ---------- helpers ---------- */
const flag = cc => cc === "AQ" ? "🇦🇶" : [...cc].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
const monthLabel = m => { const [y, mm] = m.split("-"); return MONTHS[+mm - 1].slice(0, 3) + ". " + y; };
// Eksakt dato (fra Sportstiming) når vi har den, ellers måned
const dateLabel = r => r.dt
  ? `${+r.dt.slice(8, 10)}. ${MONTHS[+r.dt.slice(5, 7) - 1].slice(0, 3)}. ${r.dt.slice(0, 4)}`
  : monthLabel(r.m);
// Priser lagres i EUR; dansk UI viser kr (fast kurs, pæn afrunding - det er "fra"-estimater).
const EUR_DKK = 7.46;
const priceLabel = p => {
  const kr = p * EUR_DKK;
  const rounded = kr < 1000 ? Math.round(kr / 10) * 10 : kr < 10000 ? Math.round(kr / 100) * 100 : Math.round(kr / 1000) * 1000;
  return "fra " + rounded.toLocaleString("da-DK") + " kr";
};
const inRegion = r =>
  !state.region ? true :
  state.region === "dk" ? r.cc === "DK" :
  state.region === "norden" ? NORDICS.includes(r.cc) :
  r.co === state.region;

const iDagISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// afholdte løb arkiveres: væk fra kortet og Kommende løb (men bliver i Mine løb/statistik).
// Løb der er i gang i DAG skal selvfølgelig stadig vises.
const erKommende = r => r.dt ? r.dt >= iDagISO() : r.m >= iDagISO().slice(0, 7);

function filtered() {
  return RACES.filter(r =>
    erKommende(r) &&
    (!state.type || r.t === state.type) &&
    (state.month === null || +r.m.split("-")[1] === state.month) &&
    inRegion(r)
  );
}

function toGeojson(list) {
  // live-løb tegnes i deres eget grønne lag (live.js) - hold dem ude af klyngerne
  if (typeof isLive === "function") list = list.filter(r => !isLive(r));
  return {
    type: "FeatureCollection",
    features: list.map(r => ({
      type: "Feature", id: r.id,
      properties: { id: r.id, t: r.t, e: entries.has(r.n) ? 1 : 0 },
      geometry: { type: "Point", coordinates: [r.lo, r.la] },
    })),
  };
}

/* ---------- kort ---------- */
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [13, 59.5], // Norden først - verden er ét zoom-ud væk
  zoom: 4.1,
  minZoom: 1.2,
  renderWorldCopies: false, // én verden - ingen gentagne kontinenter/prikker
  attributionControl: { compact: true },
  fadeDuration: 0, // INGEN cross-fade: fliser byttes øjeblikkeligt uden grå gennemblink ved zoom
  refreshExpiredTiles: false, // fliserne har 10-års cache - genhent dem aldrig unødigt
  maxTileCacheSize: 512, // hold flere fliser i hukommelsen, så zoom-ud-tilbage ikke genhenter
  dragRotate: false, // rent 2D - ingen utilsigtet rotation, der føles klunky
  pitchWithRotate: false,
  touchPitch: false,
});
map.touchZoomRotate.disableRotation(); // to-finger-drej på trackpad skal ikke vride kortet
// blødere hjul/trackpad-zoom: lavere rate = mere kontinuerlig, mindre stepvis
map.scrollZoom.setWheelZoomRate(1 / 380);
map.scrollZoom.setZoomRate(1 / 120);
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

// minZoom så verden altid mindst fylder skærmbredden (ellers klemmer maxBounds kameraet skævt)
function clampMinZoom() {
  const w = map.getContainer().clientWidth;
  map.setMinZoom(Math.max(1.1, Math.log2(w / 512) + 0.05));
}
map.on("load", clampMinZoom);
window.addEventListener("resize", clampMinZoom);

// blødt pan-cap: i stedet for at rette centrum HVER frame (kæmper mod zoom/pan-
// animationen = klunky), lader vi gesten køre frit og glider blødt tilbage på plads
// FØRST når den er sluppet. Fuld-verdens maxBounds er ustabilt i MapLibre, derfor manuelt.
function klampCentrum() {
  const c = map.getCenter();
  const lat = Math.min(74, Math.max(-52, c.lat));
  const lng = Math.min(178, Math.max(-178, c.lng));
  if (lat !== c.lat || lng !== c.lng) {
    map.easeTo({ center: [lng, lat], duration: 300, easing: t => t * (2 - t) });
  }
}
map.on("moveend", klampCentrum);
map.on("zoomend", klampCentrum);

// Atlas-palet oven på Positron - lys: varmt papir/blødt vand, mørk: chokolade-nat.
const erMørk = () => document.documentElement.dataset.tema === "mørk";
const origPaint = new Map(); // originale label-/vejfarver, så lys tilstand kan gendannes
function warmify() {
  const patch = erMørk() ? {
    background: ["background-color", "#211609"],
    water: ["fill-color", "#182229"],
    waterway: ["line-color", "#182229"],
    park: ["fill-color", "#26301C"],
    landcover_wood: ["fill-color", "#222B19"],
    landuse_residential: ["fill-color", "#2A1D0E"],
    landcover_ice_shelf: ["fill-color", "#2B2F2B"],
    landcover_glacier: ["fill-color", "#2B2F2B"],
  } : {
    background: ["background-color", "#F3EFE6"],
    water: ["fill-color", "#B7CFD8"],
    waterway: ["line-color", "#B7CFD8"],
    park: ["fill-color", "#D8E3C6"],
    landcover_wood: ["fill-color", "#D3E0C3"],
    landuse_residential: ["fill-color", "#ECE8DC"],
    landcover_ice_shelf: ["fill-color", "#F2F5F2"],
    landcover_glacier: ["fill-color", "#F2F5F2"],
  };
  for (const [id, [prop, val]] of Object.entries(patch)) {
    try { map.setPaintProperty(id, prop, val); } catch (_) {}
  }
  // labels + veje: hvid tekst/mørk halo i mørk tilstand, originaler gemmes og gendannes i lys
  for (const layer of map.getStyle().layers) {
    try {
      if (layer.type === "symbol" && !layer.id.startsWith("cluster")) {
        if (!origPaint.has(layer.id)) {
          origPaint.set(layer.id, {
            tekst: map.getPaintProperty(layer.id, "text-color"),
            halo: map.getPaintProperty(layer.id, "text-halo-color"),
          });
        }
        const o = origPaint.get(layer.id);
        map.setPaintProperty(layer.id, "text-color", erMørk() ? "#FFFFFF" : o.tekst);
        map.setPaintProperty(layer.id, "text-halo-color", erMørk() ? "#191108" : o.halo);
      }
      if (layer.type === "line" && /highway|road|bridge|tunnel|rail|transit/.test(layer.id) && !layer.id.startsWith("live")) {
        if (!origPaint.has(layer.id)) origPaint.set(layer.id, { linje: map.getPaintProperty(layer.id, "line-color") });
        const o = origPaint.get(layer.id);
        map.setPaintProperty(layer.id, "line-color", erMørk() ? "#332A1C" : o.linje);
      }
    } catch (_) {}
  }
  // klynger + tekst skal også følge temaet (kun hvis lagene findes endnu)
  if (map.getLayer("clusters")) {
    map.setPaintProperty("clusters", "circle-color", erMørk() ? "#F2EADC" : "#38240D");
    map.setPaintProperty("clusters", "circle-stroke-color", erMørk() ? "rgba(242,234,220,.2)" : "rgba(56,36,13,.15)");
    map.setPaintProperty("cluster-count", "text-color", erMørk() ? "#241809" : "#ffffff");
  }
}

let temaTimer = null;
function setTema(t) {
  document.documentElement.classList.add("tema-glid");
  clearTimeout(temaTimer);
  temaTimer = setTimeout(() => document.documentElement.classList.remove("tema-glid"), 450);
  if (t === "mørk") document.documentElement.dataset.tema = "mørk";
  else delete document.documentElement.dataset.tema;
  localStorage.setItem("runnin-tema", t);
  document.querySelectorAll(".tema-chip").forEach(c => c.classList.toggle("on", c.dataset.tema === t));
  if (map.isStyleLoaded()) warmify();
}
document.querySelectorAll(".tema-chip").forEach(c => c.addEventListener("click", () => setTema(c.dataset.tema)));

map.on("load", () => {
  // attribution er licenskrav (OSM/OpenMapTiles) - men den må gerne starte kollapset til ⓘ
  const attrib = document.querySelector(".maplibregl-ctrl-attrib");
  if (attrib) { attrib.classList.remove("maplibregl-compact-show"); attrib.removeAttribute("open"); }
  warmify();

  map.addSource("races", { type: "geojson", data: toGeojson(filtered()), cluster: true, clusterMaxZoom: 11, clusterRadius: 60 });

  map.addLayer({
    id: "clusters", type: "circle", source: "races", filter: ["has", "point_count"],
    paint: {
      "circle-color": "#111827",
      "circle-radius": ["step", ["get", "point_count"], 12, 15, 15, 60, 18, 250, 22],
      "circle-stroke-width": 3,
      "circle-stroke-color": "rgba(17,24,39,.15)",
      "circle-opacity": 1, "circle-stroke-opacity": 1,
      "circle-opacity-transition": { duration: 220 }, "circle-stroke-opacity-transition": { duration: 220 },
    },
  });
  map.addLayer({
    id: "cluster-count", type: "symbol", source: "races", filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Regular"], "text-size": 11 },
    paint: { "text-color": "#ffffff", "text-opacity": 1, "text-opacity-transition": { duration: 220 } },
  });
  map.addLayer({
    id: "race-dots", type: "circle", source: "races", filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["match", ["get", "t"], "kort", TYPE_COLOR.kort, "half", TYPE_COLOR.half, "marathon", TYPE_COLOR.marathon, "ultra", TYPE_COLOR.ultra, TYPE_COLOR.tri],
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 9, 6],
      "circle-stroke-width": ["case", ["==", ["get", "e"], 1], 3, ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.5]],
      "circle-stroke-color": ["case", ["==", ["get", "e"], 1], "#C05800", "#ffffff"],
      "circle-radius-transition": { duration: 150 },
      "circle-opacity": 1, "circle-stroke-opacity": 1,
      "circle-opacity-transition": { duration: 220 }, "circle-stroke-opacity-transition": { duration: 220 },
    },
  });

  wireMapEvents();
  warmify(); // klynge-lagene findes først nu - giv dem temaets farver
  updateCounter();
  if (typeof initLiveUI === "function") initLiveUI();
});

/* preloader: væk når kortet reelt står klar - OBS: "idle" kan ikke bruges,
   live-pulsens paint-animation holder kortet permanent u-idle. */
function fjernPreloader() {
  const pre = document.getElementById("preloader");
  if (!pre || pre.classList.contains("væk")) return;
  document.body.classList.add("klar");
  pre.classList.add("væk");
  setTimeout(() => pre.remove(), 700);
}
map.once("load", () => setTimeout(fjernPreloader, 350));
setTimeout(fjernPreloader, 7000);

// service worker: ægte PWA (offline-cache af egne filer, installérbar på Android)
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* ---------- hover + klik ---------- */
const hoverCard = document.getElementById("hoverCard");
let hoverId = null;

// hover-tooltip skal aldrig leve mens en fuldskærms-modal/detalje dækker kortet
function overlayÅben() {
  return (detail && !detail.hidden) ||
    !!document.querySelector(".foto-overlay:not([hidden]), .cal-overlay:not([hidden]), .login-overlay:not([hidden])");
}

function wireMapEvents() {
  map.on("mousemove", "race-dots", e => {
    if (overlayÅben()) { hoverCard.hidden = true; return; }
    const f = e.features[0];
    if (hoverId !== null) map.setFeatureState({ source: "races", id: hoverId }, { hover: false });
    hoverId = f.id;
    map.setFeatureState({ source: "races", id: hoverId }, { hover: true });
    map.getCanvas().style.cursor = "pointer";

    const r = RACES[f.properties.id];
    hoverCard.innerHTML =
      `<div class="hc-name">${r.n}</div>
       <div class="hc-meta">${r.d} · ${r.c} ${flag(r.cc)}<br>${dateLabel(r)}${r.p ? " · " + priceLabel(r.p) : ""}</div>
       <div class="hc-hint">Klik for detaljer →</div>`;
    hoverCard.hidden = false;
    positionHover(e.point);
  });
  map.on("mousemove", e => { if (!hoverCard.hidden) positionHover(e.point); });
  map.on("mouseleave", "race-dots", () => {
    if (hoverId !== null) map.setFeatureState({ source: "races", id: hoverId }, { hover: false });
    hoverId = null;
    hoverCard.hidden = true;
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "race-dots", e => openDetail(RACES[e.features[0].properties.id], true));
  map.on("click", "clusters", e => {
    const f = e.features[0];
    map.getSource("races").getClusterExpansionZoom(f.properties.cluster_id).then(z =>
      map.easeTo({ center: f.geometry.coordinates, zoom: z + .4, duration: 600 })
    );
  });
  // hover på klynge: forsmag på løbene indeni, før man zoomer
  let hoverClusterId = null;
  map.on("mousemove", "clusters", async e => {
    if (overlayÅben()) { hoverCard.hidden = true; return; }
    const f = e.features[0];
    map.getCanvas().style.cursor = "pointer";
    const id = f.properties.cluster_id;
    if (hoverClusterId === id && !hoverCard.hidden) { positionHover(e.point); return; }
    hoverClusterId = id;
    const leaves = await map.getSource("races").getClusterLeaves(id, 7, 0);
    if (hoverClusterId !== id) return; // musen er videre
    const races = leaves.map(l => RACES[l.properties.id]).filter(Boolean)
      .sort((a, b) => (a.dt || a.m + "-99").localeCompare(b.dt || b.m + "-99"));
    const rest = f.properties.point_count - races.length;
    hoverCard.innerHTML =
      `<div class="hc-name">${f.properties.point_count} løb her</div>
       <div class="hc-liste">${races.map(r =>
         `<div><i style="background:${TYPE_COLOR[r.t]}"></i><span class="hc-l-navn">${r.n}</span><span class="hc-l-dato">${dateLabel(r)}</span></div>`).join("")}</div>
       ${rest > 0 ? `<div class="hc-meta">+ ${rest} flere</div>` : ""}
       <div class="hc-hint">Klik for at zoome ind →</div>`;
    hoverCard.hidden = false;
    positionHover(e.point);
  });
  map.on("mouseleave", "clusters", () => {
    hoverClusterId = null;
    hoverCard.hidden = true;
    map.getCanvas().style.cursor = "";
  });
}

function positionHover(pt) {
  const pad = 14, w = hoverCard.offsetWidth, h = hoverCard.offsetHeight;
  let x = pt.x + pad, y = pt.y - h - pad;
  if (x + w > innerWidth - 12) x = pt.x - w - pad;
  if (y < 70) y = pt.y + pad;
  hoverCard.style.left = x + "px";
  hoverCard.style.top = y + "px";
}

/* ---------- detaljepanel ---------- */
const detail = document.getElementById("detail");
let currentRace = null;

function openDetail(r, fly) {
  currentRace = r;
  closePanel();
  document.getElementById("dType").textContent = TYPE_LABEL[r.t];
  document.getElementById("dType").style.color = TYPE_COLOR[r.t];
  document.getElementById("dName").textContent = r.n;
  const løbsdag = typeof erLøbsdag === "function" && erLøbsdag(r);
  const dagStatus = løbsdag ? `<span class="d-idag">Afholdes i dag</span>`
    : r.dt && r.dt < iDagISO() ? `Afholdt ${dateLabel(r)}` : `Næste udgave: ${dateLabel(r)}`;
  document.getElementById("dMeta").innerHTML =
    `${r.d} · ${r.c} ${flag(r.cc)}<br>` +
    dagStatus +
    (r.p ? `<br>Startgebyr: ${priceLabel(r.p)}` : `<br>Pris: se tilmeldingssiden`) +
    (r.u.includes("sportstiming.dk") ? `<br><span class="d-kilde">Kalenderdata: Sportstiming</span>`
      : r.u.includes("runsignup.com") ? `<br><span class="d-kilde">Kalenderdata: RunSignup</span>`
      : r.u.includes("kondis.no") ? `<br><span class="d-kilde">Kalenderdata: Kondis</span>`
      : r.u.includes("raceid.com") ? `<br><span class="d-kilde">Kalenderdata: RaceID</span>`
      : r.u.includes("aims-worldrunning") ? `<br><span class="d-kilde">Kalenderdata: AIMS</span>`
      : r.u.includes("worldsmarathons") ? `<br><span class="d-kilde">Kalenderdata: WorldsMarathons</span>` : "");
  const note = document.getElementById("dNote");
  note.hidden = !r.note;
  if (r.note) note.textContent = "⚑ Adgang: " + r.note;
  const cta = document.getElementById("dCta");
  cta.href = r.u;
  // Kondis-event-sider er informations-sider med videre-links - lov ikke direkte tilmelding dér
  cta.innerHTML = r.u.includes("terminlista.kondis.no")
    ? `Se løbet hos Kondis <span>→</span>`
    : r.u.includes("aims-worldrunning")
    ? `Se løbet hos AIMS <span>→</span>`
    : r.u.includes("worldsmarathons")
    ? `Se løbet hos WorldsMarathons <span>→</span>`
    : `Tilmeld på officiel side <span>→</span>`;
  document.getElementById("dLive").hidden = !(typeof isLive === "function" && isLive(r));
  updateSaveBtn();
  if (typeof featuresOnDetail === "function") featuresOnDetail(r);
  visDetailRute(r);
  history.replaceState(null, "", "#" + slug(r.n));
  hoverCard.hidden = true; // ingen hover-tooltip bag/oven på detalje-modalen
  detail.hidden = false;
  if (fly) map.flyTo({ center: [r.lo, r.la], zoom: Math.max(map.getZoom(), 5.5), duration: 1100, essential: true });
}

function updateSaveBtn() {
  const btn = document.getElementById("dSave");
  const saved = currentRace && favs.has(currentRace.n);
  btn.querySelector("i").textContent = saved ? "✓" : "♡";
  btn.querySelector("span").textContent = saved ? "Gemt" : "Gem";
  btn.classList.toggle("on", saved);
  const eBtn = document.getElementById("dEntry");
  const entered = currentRace && entries.has(currentRace.n);
  eBtn.textContent = entered ? "🎟 Du er tilmeldt" : "🎟 Markér som tilmeldt";
  eBtn.classList.toggle("entered", entered);
}

// personlige handlinger kræver konto - ellers spøgelses-tilstand kun på én enhed
function kræverLogin(besked) {
  if (getUser()) return false;
  openLogin();
  if (window.loginTilstand) loginTilstand("ind");
  const fejl = document.getElementById("loginFejl");
  if (fejl) { fejl.textContent = besked; fejl.hidden = false; fejl.classList.add("rolig"); }
  return true;
}

document.getElementById("dSave").addEventListener("click", () => {
  if (!currentRace) return;
  if (kræverLogin("Log ind for at gemme løb - så følger de dig på tværs af enheder.")) return;
  favs.has(currentRace.n) ? favs.delete(currentRace.n) : favs.add(currentRace.n);
  localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
  window.skyPush?.(currentRace.n);
  updateSaveBtn();
  updateFavCount();
});
document.getElementById("dEntry").addEventListener("click", () => {
  if (!currentRace) return;
  if (kræverLogin("Log ind for at markere dig tilmeldt - så gemmer vi det til dig.")) return;
  if (entries.has(currentRace.n)) entries.delete(currentRace.n);
  else {
    entries.add(currentRace.n);
    favs.add(currentRace.n); // tilmeldt ⇒ også i Mine løb
    localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
    window.skyPush?.(currentRace.n);
  }
  saveEntries();
  updateSaveBtn();
  updateFavCount();
  applyFilters(); // opdater caramel-ring på kortet
});
// Efter man har klikket ud til tilmeldingen: nudge "Markér som tilmeldt", når man kommer tilbage
document.getElementById("dCta").addEventListener("click", () => {
  if (!currentRace) return;
  // anonym tælling af tilmeldings-klik (kun løbsnavn + platform, ingen bruger-/enheds-id)
  try {
    fetch("https://qdqvyvidafslzvxgkvof.supabase.co/rest/v1/reg_klik", {
      method: "POST", keepalive: true,
      headers: { apikey: "sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3",
        Authorization: "Bearer sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3",
        "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ race_n: currentRace.n, platform: "web" }),
    });
  } catch (_) {}
  if (entries.has(currentRace.n)) return;
  const eBtn = document.getElementById("dEntry");
  setTimeout(() => {
    eBtn.classList.add("nudge");
    eBtn.addEventListener("animationend", () => eBtn.classList.remove("nudge"), { once: true });
  }, 600);
});
document.getElementById("detailClose").addEventListener("click", () => {
  detail.hidden = true;
  history.replaceState(null, "", location.pathname + location.search);
});
document.getElementById("dLive").addEventListener("click", () => currentRace && openLive(currentRace));

/* ---------- filtre ---------- */
const menus = {
  region: REGIONS.map(r => ({ v: r.key, label: r.label })),
  month: [{ v: null, label: "Når som helst" }, ...MONTHS.map((m, i) => ({ v: i + 1, label: m[0].toUpperCase() + m.slice(1) }))],
  type: [{ v: null, label: "Alle distancer" }, ...Object.keys(TYPE_LABEL).map(t => ({ v: t, label: TYPE_LABEL[t] }))],
};

document.querySelectorAll(".pill-wrap").forEach(wrap => {
  const pill = wrap.querySelector(".pill");
  const menu = wrap.querySelector(".menu");
  const key = pill.dataset.menu;

  menu.innerHTML = menus[key].map((o, i) => `<button data-i="${i}">${o.label}</button>`).join("");
  pill.addEventListener("click", e => {
    e.stopPropagation();
    document.querySelectorAll(".menu.open").forEach(m => m !== menu && m.classList.remove("open"));
    // mobil: swipe-rækken clipper absolut-positionerede menuer - åbn fixed under pillen i stedet
    if (innerWidth <= 720) {
      const r = pill.getBoundingClientRect();
      Object.assign(menu.style, { position: "fixed", left: "16px", right: "16px", top: r.bottom + 8 + "px", minWidth: "0" });
    } else {
      menu.removeAttribute("style");
    }
    menu.classList.toggle("open");
  });
  menu.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const opt = menus[key][+btn.dataset.i];
    state[key] = opt.v;
    pill.innerHTML = `${opt.label} <span class="caret">▾</span>`;
    pill.classList.toggle("on", opt.v !== null);
    menu.querySelectorAll("button").forEach(b => b.classList.toggle("sel", b === btn));
    menu.classList.remove("open");
    applyFilters();
  });
});
document.addEventListener("click", () => document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open")));

/* legend = klikbart filter: klik på en type filtrerer kortet, klik igen nulstiller */
document.querySelectorAll("#legend button").forEach(b => b.addEventListener("click", () => {
  const t = b.dataset.t;
  const typeMenu = document.querySelector('.menu[data-for="type"]');
  const i = state.type === t ? 0 : menus.type.findIndex(o => o.v === t); // 0 = Alle distancer
  typeMenu.querySelector(`button[data-i="${i}"]`).click();
}));

function opdaterLegend() {
  document.querySelectorAll("#legend button").forEach(b => {
    b.classList.toggle("on", state.type === b.dataset.t);
    b.classList.toggle("dæmpet", !!state.type && state.type !== b.dataset.t);
  });
}

const RACE_LAG = [
  ["race-dots", "circle-opacity"], ["race-dots", "circle-stroke-opacity"],
  ["clusters", "circle-opacity"], ["clusters", "circle-stroke-opacity"],
  ["cluster-count", "text-opacity"],
];
const settLagOpacity = v => { for (const [lag, prop] of RACE_LAG) if (map.getLayer(lag)) map.setPaintProperty(lag, prop, v); };
let fadeTimer = null;
function applyFilters() {
  opdaterLegend();
  const list = filtered();
  updateCounter(list);
  opdaterAktiveFiltre();
  if (typeof opdaterFilterBadge === "function") opdaterFilterBadge();
  if (window.listeOverlay && !window.listeOverlay.hidden) window.renderListe();
  if (typeof updateRadarBtn === "function") updateRadarBtn();
  const src = map.getSource("races");
  if (!src) return;
  // crossfade: gamle prikker fader ud, ny data lægges ind, nye fader blødt ind
  settLagOpacity(0);
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => { src.setData(toGeojson(list)); settLagOpacity(1); }, 200);
}

/* aktive-filtre-chips: viser hvad du lige satte + ét klik til at fjerne */
function ryddType() { const m = document.querySelector('.menu[data-for="type"]'); m?.querySelector('button[data-i="0"]')?.click(); }
function ryddMenu(key) {
  state[key] = null;
  const wrap = [...document.querySelectorAll(".pill-wrap")].find(w => w.querySelector(".pill")?.dataset.menu === key);
  if (wrap) {
    const pill = wrap.querySelector(".pill");
    pill.innerHTML = `${menus[key][0].label} <span class="caret">▾</span>`;
    pill.classList.remove("on");
    wrap.querySelectorAll(".menu button").forEach((b, i) => b.classList.toggle("sel", i === 0));
  }
  applyFilters();
}
function opdaterAktiveFiltre() {
  const bar = document.getElementById("aktiveFiltre");
  if (!bar) return;
  const chips = [];
  if (state.type) chips.push([`${TYPE_LABEL[state.type]}`, "type"]);
  if (state.region) chips.push([REGIONS.find(r => r.key === state.region)?.label || state.region, "region"]);
  if (state.month !== null) chips.push([MONTHS[state.month - 1][0].toUpperCase() + MONTHS[state.month - 1].slice(1), "month"]);
  bar.innerHTML = chips.map(([label, key]) =>
    `<button class="filter-chip" data-key="${key}">${label} <span>✕</span></button>`).join("")
    + (chips.length > 1 ? `<button class="filter-chip filter-ryd-alle" data-key="alle">Ryd alle</button>` : "");
  bar.hidden = !chips.length;
  bar.querySelectorAll(".filter-chip").forEach(c => c.onclick = () => {
    const k = c.dataset.key;
    if (k === "alle") { state.type && ryddType(); state.region && ryddMenu("region"); state.month !== null && ryddMenu("month"); }
    else if (k === "type") ryddType();
    else ryddMenu(k);
  });
}

let counterVist = 0;
// ærligt friskheds-signal: "· opdateret 2. sep" (fra data/meta.js, stemplet ved genimport)
function opdateretLabel() {
  const iso = window.RUNNIN_META?.opdateret;
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "";
  return ` <span class="counter-opd">· opdateret ${d.toLocaleDateString("da-DK", { day: "numeric", month: "short" }).replace(".", "")}</span>`;
}
function updateCounter(list) {
  const n = (list || filtered()).length;
  const el = document.getElementById("counter");
  const opd = opdateretLabel();
  // tæl op/ned til det nye tal - store spring (USA-fletningen) føles levende, små er øjeblikkelige
  const fra = counterVist, dur = Math.abs(n - fra) > 400 ? 900 : 0;
  counterVist = n;
  if (!dur) { el.innerHTML = `<strong>${n.toLocaleString("da-DK")} løb</strong> på kortet${opd}`; return; }
  const t0 = performance.now();
  (function tik(ts) {
    const p = Math.min((ts - t0) / dur, 1);
    const v = Math.round(fra + (n - fra) * (1 - Math.pow(1 - p, 3)));
    el.innerHTML = `<strong>${v.toLocaleString("da-DK")} løb</strong> på kortet${opd}`;
    if (p < 1) requestAnimationFrame(tik);
  })(t0);
}

/* ---------- tabs + paneler ---------- */
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");

document.querySelectorAll(".tab").forEach(tab =>
  tab.addEventListener("click", () => {
    document.getElementById("profileMenu").hidden = true;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.tab = tab.dataset.tab;
    detail.hidden = true;
    lukTabMenu();
    window.lukListe?.();
    window.lukToplister?.();
    if (state.tab === "kort") closePanel();
    else if (state.tab === "liste") { closePanel(); window.åbnListe?.(); }
    else if (state.tab === "top") { closePanel(); window.åbnToplister?.(); }
    else { panel.hidden = false; state.tab === "lob" ? renderList() : renderFavs(); }
  })
);
document.getElementById("panelClose").addEventListener("click", () => {
  closePanel();
  setTab("kort");
});

function setTab(name) {
  state.tab = name;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
}
function closePanel() { panel.hidden = true; }

function rowHtml(r) {
  return `<div class="row" data-id="${r.id}">
    <span class="dot" style="background:${TYPE_COLOR[r.t]}"></span>
    <div class="r-main">
      <div class="r-name">${r.n}${entries.has(r.n) ? ` <span class="r-entry">🎟 Tilmeldt</span>` : ""}</div>
      <div class="r-meta">${r.d} · ${r.c} ${flag(r.cc)}</div>
    </div>
    <div class="r-side">
      ${typeof isLive === "function" && isLive(r)
        ? `<span class="row-live"><i class="live-dot"></i>I DAG</span>`
        : r.dt && r.dt < iDagISO()
          ? `<div class="r-when r-afholdt">✓ Afholdt<br>${dateLabel(r)}</div>`
          : `<div class="r-price">${r.p ? priceLabel(r.p) : ""}</div><div class="r-when">${dateLabel(r)}</div>`}
    </div>
  </div>`;
}

const calToggle = document.getElementById("calToggle");
calToggle.addEventListener("click", () => openCalendar());

const fullMonth = m => { const [y, mm] = m.split("-"); return MONTHS[+mm - 1][0].toUpperCase() + MONTHS[+mm - 1].slice(1) + " " + y; };
const sortKey = r => r.dt || r.m + "-99";

let renderToken = 0;
function renderList() {
  panelTitle.textContent = "Kommende løb";
  calToggle.hidden = false;
  const list = filtered().slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  if (!list.length) {
    renderToken++;
    panelBody.innerHTML = `<div class="empty">Ingen løb matcher filtrene.<br><em>Prøv at åbne op for hvor eller hvornår.</em></div>`;
    return;
  }
  // ~6.000 rækker på én gang blokerer klikket i flere hundrede ms - render i bidder:
  // første skærmfuld med det samme, resten i baggrunden (afbrydes hvis man skifter tab)
  const token = ++renderToken;
  const BID = 250;
  let i = 0, current = "";
  const byg = antal => {
    let html = "";
    const til = Math.min(i + antal, list.length);
    for (; i < til; i++) {
      const r = list[i];
      if (r.m !== current) { current = r.m; html += `<div class="month-head">${fullMonth(r.m)}</div>`; }
      html += rowHtml(r);
    }
    return html;
  };
  panelBody.innerHTML = byg(80);
  (function næste() {
    if (token !== renderToken || i >= list.length) return;
    panelBody.insertAdjacentHTML("beforeend", byg(BID));
    requestAnimationFrame(næste);
  })();
}

/* ---------- kalender-modal ---------- */
const cal = { month: "2026-08", type: null, day: null };
const CAL_MIN = "2026-08", CAL_MAX = "2027-09";
const calOverlay = document.getElementById("calOverlay");

function calRaces() {
  return RACES.filter(r =>
    r.m === cal.month &&
    (!cal.type || r.t === cal.type) &&
    inRegion(r)
  );
}

function openCalendar() {
  cal.type = state.type;
  cal.day = null;
  // start i første måned med løb ud fra nuværende filter, ellers nu
  const list = filtered().slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  cal.month = state.month
    ? (list.find(r => +r.m.split("-")[1] === state.month)?.m || cal.month)
    : (list[0]?.m || "2026-08");
  calOverlay.hidden = false;
  renderCalendar();
}
function closeCalendar() { calOverlay.hidden = true; }

function shiftMonth(delta) {
  let [y, m] = cal.month.split("-").map(Number);
  m += delta;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  const key = `${y}-${String(m).padStart(2, "0")}`;
  if (key < CAL_MIN || key > CAL_MAX) return;
  cal.month = key;
  cal.day = null;
  renderCalendar();
}

function renderCalendar() {
  const [y, m] = cal.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // mandag = 0
  const races = calRaces();
  const byDay = {};
  const noDate = [];
  for (const r of races) (r.dt ? (byDay[+r.dt.slice(8, 10)] ??= []).push(r) : noDate.push(r));

  let cells = `<div class="cal-dow">ma</div><div class="cal-dow">ti</div><div class="cal-dow">on</div><div class="cal-dow">to</div><div class="cal-dow">fr</div><div class="cal-dow">lø</div><div class="cal-dow">sø</div>`;
  for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayRaces = byDay[d] || [];
    const dots = dayRaces.slice(0, 4).map(r => `<i style="background:${TYPE_COLOR[r.t]}"></i>`).join("");
    cells += `<div class="cal-cell${dayRaces.length ? " has" : ""}${cal.day === d ? " sel" : ""}" data-day="${d}">
      <span class="cal-daynum">${d}</span><span class="cal-dots">${dots}</span>${dayRaces.length > 4 ? `<span class="cal-more">+${dayRaces.length - 4}</span>` : ""}
    </div>`;
  }

  const chips = [{ v: null, l: "Alle" }, ...Object.keys(TYPE_LABEL).map(t => ({ v: t, l: TYPE_LABEL[t] }))]
    .map(c => `<button class="cal-chip${cal.type === c.v ? " on" : ""}" data-type="${c.v ?? ""}">${c.l}</button>`).join("");

  const shown = cal.day ? (byDay[cal.day] || []) : races.filter(r => r.dt).sort((a, b) => a.dt.localeCompare(b.dt));
  const listHtml =
    (shown.length ? shown.map(rowHtml).join("") : `<div class="empty">Ingen løb${cal.day ? " den dag" : " i denne måned"} med de filtre.</div>`) +
    (!cal.day && noDate.length ? `<div class="month-head">Dato ikke fastlagt endnu</div>` + noDate.map(rowHtml).join("") : "");

  calOverlay.querySelector(".cal-modal").innerHTML = `
    <div class="cal-head">
      <div class="cal-nav">
        <button class="icon-btn" id="calPrev" aria-label="Forrige måned">‹</button>
        <h2>${fullMonth(cal.month)}</h2>
        <button class="icon-btn" id="calNext" aria-label="Næste måned">›</button>
      </div>
      <button class="close" id="calClose" aria-label="Luk">✕</button>
    </div>
    <div class="cal-chips">${chips}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-list">${listHtml}</div>`;

  document.getElementById("calPrev").onclick = () => shiftMonth(-1);
  document.getElementById("calNext").onclick = () => shiftMonth(1);
  document.getElementById("calClose").onclick = closeCalendar;
  calOverlay.querySelectorAll(".cal-chip").forEach(b => b.onclick = () => { cal.type = b.dataset.type || null; cal.day = null; renderCalendar(); });
  calOverlay.querySelectorAll(".cal-cell.has").forEach(c => c.onclick = () => { cal.day = cal.day === +c.dataset.day ? null : +c.dataset.day; renderCalendar(); });

  // hover-teaser på dag-celler: forsmag på dagens løb (samme mønster som klynger/faner)
  let calHoverEl = null;
  const lukCalHover = () => { calHoverEl?.remove(); calHoverEl = null; };
  calOverlay.querySelectorAll(".cal-cell.has").forEach(c => {
    c.addEventListener("mouseenter", () => {
      if (innerWidth <= 720) return;
      lukCalHover();
      const dagens = (byDay[+c.dataset.day] || []);
      if (!dagens.length) return;
      const rect = c.getBoundingClientRect();
      calHoverEl = document.createElement("div");
      calHoverEl.className = "live-menu cal-hover";
      calHoverEl.style.top = Math.min(rect.bottom + 8, innerHeight - 300) + "px";
      calHoverEl.style.left = Math.min(Math.max(12, rect.left - 30), innerWidth - 312) + "px";
      calHoverEl.innerHTML = `
        <div class="tm-sek">${+c.dataset.day}. ${MONTHS[m - 1]} · ${dagens.length} løb</div>
        ${dagens.slice(0, 7).map(r => `<button class="tm-række" data-id="${r.id}">
          <i style="background:${TYPE_COLOR[r.t]}"></i>
          <span class="lm-navn">${r.n}</span>
          <span class="lm-sted">${r.c} ${flag(r.cc)}</span>
        </button>`).join("")}
        ${dagens.length > 7 ? `<div class="tm-tom">+ ${dagens.length - 7} flere - klik på dagen</div>` : ""}`;
      document.body.appendChild(calHoverEl);
      calHoverEl.addEventListener("mouseleave", e => { if (!c.contains(e.relatedTarget)) lukCalHover(); });
      calHoverEl.querySelectorAll(".tm-række").forEach(b => b.onclick = () => {
        lukCalHover();
        calOverlay.hidden = true;
        window.lukListe?.();
        setTab("kort");
        openDetail(RACES[+b.dataset.id], true);
      });
    });
    c.addEventListener("mouseleave", () => {
      setTimeout(() => { if (calHoverEl && !calHoverEl.matches(":hover") && !c.matches(":hover")) lukCalHover(); }, 120);
    });
    c.addEventListener("click", lukCalHover);
  });
  calOverlay.querySelectorAll(".cal-list .row").forEach(row => row.onclick = () => {
    closeCalendar(); closePanel(); setTab("kort");
    openDetail(RACES[+row.dataset.id], true);
  });
}

calOverlay.addEventListener("click", e => { if (e.target === calOverlay) closeCalendar(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !calOverlay.hidden) closeCalendar(); });

function renderFavs() {
  renderToken++; // afbryd evt. igangværende bidder fra Kommende løb - ellers appender de herind
  panelTitle.textContent = "Mine løb";
  calToggle.hidden = true;
  const list = RACES.filter(r => favs.has(r.n))
    .sort((a, b) => (erKommende(a) === erKommende(b))
      ? sortKey(a).localeCompare(sortKey(b))
      : (erKommende(a) ? -1 : 1)); // afholdte nederst
  const user = getUser();
  let hilsen = "";
  if (user) {
    const kommende = list.filter(r => r.dt && r.dt >= iDagISO()); // strengsammenligning: I DAG tæller med
    const next = kommende.find(r => entries.has(r.n)) || kommende[0]; // tilmeldte løb først
    const dage = next ? Math.max(0, Math.ceil((new Date(next.dt) - new Date()) / 86400000)) : null;
    hilsen = `<div class="mine-hilsen"><strong>Hej ${user.navn.split(" ")[0]}</strong>
      <span>${list.length} løb gemt${next ? ` · <span class="countdown">${dage === 0 ? "I DAG" : dage + " dage"}</span> ${dage === 0 ? "-" : "til"} ${next.n}${entries.has(next.n) ? " 🎟" : ""}` : ""}</span></div>`;
  }
  panelBody.innerHTML = hilsen + (list.length
    ? list.map(rowHtml).join("")
    : `<div class="empty">Ingen gemte løb endnu.<br><em>Klik på et løb på kortet og tryk "Gem i Mine løb".</em></div>`);
}

panelBody.addEventListener("click", e => {
  const row = e.target.closest(".row");
  if (!row) return;
  closePanel();
  setTab("kort");
  openDetail(RACES[+row.dataset.id], true);
});

function updateFavCount() {
  const el = document.getElementById("favCount");
  el.hidden = favs.size === 0;
  el.textContent = favs.size;
}
updateFavCount();

/* ---------- søgning ---------- */
const searchInput = document.getElementById("search");
const searchMenu = document.getElementById("searchMenu");
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

searchInput.addEventListener("input", () => {
  const q = norm(searchInput.value.trim());
  if (q.length < 2) { searchMenu.hidden = true; return; }
  const hits = RACES.filter(r => norm(r.n).includes(q) || norm(r.c).includes(q))
    .sort((a, b) => (erKommende(a) === erKommende(b))
      ? sortKey(a).localeCompare(sortKey(b))     // nærmeste dato øverst
      : (erKommende(a) ? -1 : 1))                // afholdte nederst
    .slice(0, 8);
  if (!hits.length) { searchMenu.innerHTML = `<div class="search-tom">Ingen løb matcher "${searchInput.value.trim()}"</div>`; searchMenu.hidden = false; return; }
  searchMenu.innerHTML = hits.map(r => `
    <button data-id="${r.id}">
      <span class="dot" style="background:${TYPE_COLOR[r.t]}"></span>
      <span class="s-navn">${r.n}</span>
      <span class="s-meta">${r.c} · ${r.dt && r.dt < iDagISO() ? "Afholdt " : ""}${dateLabel(r)}</span>
    </button>`).join("");
  searchMenu.hidden = false;
  searchMenu.querySelectorAll("button").forEach(b => b.onclick = () => {
    searchMenu.hidden = true;
    searchInput.value = "";
    openDetail(RACES[+b.dataset.id], true);
  });
});
searchInput.addEventListener("keydown", e => { if (e.key === "Escape") { searchMenu.hidden = true; searchInput.blur(); } });
document.addEventListener("click", e => { if (!searchMenu.hidden && !e.target.closest(".search-wrap")) searchMenu.hidden = true; });

/* ---------- nær mig ---------- */
document.getElementById("nearBtn").addEventListener("click", () => {
  navigator.geolocation?.getCurrentPosition(
    pos => map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 7.5, duration: 1400 }),
    () => map.flyTo({ center: [11.5, 56.0], zoom: 6.2, duration: 1400 }) // afvist → Danmark
  );
});

/* ---------- officiel rute på detaljen (når vi har den i data/ruter/) ---------- */
const ruteCache = new Map(); // slug → rute-objekt eller null
async function visDetailRute(r) {
  fjernDetailRute();
  const sl = slug(r.n);
  if (!ruteCache.has(sl)) {
    try {
      const res = await fetch(`data/ruter/${sl}.json`, { signal: AbortSignal.timeout(4000) });
      ruteCache.set(sl, res.ok ? await res.json() : null);
    } catch (_) { ruteCache.set(sl, null); }
  }
  const rute = ruteCache.get(sl);
  if (!rute || currentRace !== r || detail.hidden) return;
  // rute-fakta i detaljen: distance, højdemeter, depoter - det man forbereder sig på
  document.getElementById("dMeta").insertAdjacentHTML("beforeend",
    `<br><span class="d-rute">⛰ Officiel rute: ${String(rute.km).replace(".", ",")} km` +
    `${rute.stigning ? ` · +${rute.stigning.toLocaleString("da-DK")} m` : ""}` +
    `${rute.stationer?.length ? ` · ${rute.stationer.length} depoter` : ""}</span>`);
  map.addSource("detail-rute", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rute.punkter } } });
  map.addLayer({
    id: "detail-rute-linje", type: "line", source: "detail-rute",
    paint: { "line-color": "#C05800", "line-width": 3.5, "line-opacity": .85 },
    layout: { "line-cap": "round", "line-join": "round" },
  }, map.getLayer("clusters") ? "clusters" : undefined);
  window.visRuteStationer?.(rute);
  // vis hele ruten, med plads til detaljepanelet
  const lons = rute.punkter.map(p => p[0]), lats = rute.punkter.map(p => p[1]);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: { top: 110, bottom: 60, left: 60, right: innerWidth > 720 ? 400 : 60 }, duration: 1200, essential: true });
}
function fjernDetailRute() {
  if (map.getLayer("detail-rute-linje")) map.removeLayer("detail-rute-linje");
  if (map.getSource("detail-rute")) map.removeSource("detail-rute");
  window.fjernRuteStationer?.();
}
new MutationObserver(() => { if (detail.hidden) fjernDetailRute(); })
  .observe(detail, { attributes: true, attributeFilter: ["hidden"] });

/* ---------- tab-hovers: forsmag under Kort / Kommende løb / Mine løb ---------- */
let tabMenuEl = null;
function lukTabMenu() { if (tabMenuEl) { tabMenuEl.remove(); tabMenuEl = null; } }

const LANDE_ZOOM = {
  dk: { center: [10.7, 56.2], zoom: 6.2, label: "Danmark" },
  norden: { center: [16, 62.5], zoom: 3.9, label: "Norden" },
  EU: { center: [10, 51], zoom: 3.6, label: "Europa" },
  alle: { center: [13, 59.5], zoom: 1.6, label: "Hele verden" },
};
const listeScopeNu = () => localStorage.getItem("runnin-liste-scope") || "dk";
const iScopeHurtig = (r, scope) =>
  scope === "dk" ? r.cc === "DK" : scope === "norden" ? NORDICS.includes(r.cc) : scope === "EU" ? r.co === "EU" : true;

function miniRække(r) {
  return `<button class="tm-række" data-id="${r.id}">
    <i style="background:${TYPE_COLOR[r.t]}"></i>
    <span class="lm-navn">${r.n}</span>
    <span class="lm-sted">${dateLabel(r)}</span>
  </button>`;
}

function tabMenuIndhold(navn) {
  const scope = listeScopeNu();
  if (navn === "kort") {
    const antal = RACES.filter(erKommende).length;
    const live = typeof isLive === "function" ? RACES.filter(isLive).length : 0;
    return `<div class="tm-stats">
        <div><strong>${antal.toLocaleString("da-DK")}</strong><span>kommende løb</span></div>
        <div><strong>${live}</strong><span>live lige nu</span></div>
      </div>
      <div class="tm-sek">Flyv til</div>
      ${Object.entries(LANDE_ZOOM).map(([k, z]) => `<button class="tm-række" data-zoom="${k}"><i style="background:var(--coral)"></i><span class="lm-navn">${z.label}</span><span class="lm-sted">→</span></button>`).join("")}`;
  }
  if (navn === "lob") {
    const næste = RACES.filter(r => erKommende(r) && iScopeHurtig(r, scope))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b))).slice(0, 6);
    return `${næste.map(miniRække).join("")}
      <button class="tm-cta" data-handling="liste">Åbn hele listen →</button>`;
  }
  if (navn === "top") {
    const d = window.topDataCache;
    if (!d) return `<div class="tm-sek">Leaderboards</div><div class="tm-tom">Henter hurtigste tider…</div>`;
    const board = d.boards.marathon?.length ? d.boards.marathon : (d.boards.half || []);
    const label = d.boards.marathon?.length ? "Marathon" : "Halvmarathon";
    return `<div class="tm-sek">Hurtigste ${label.toLowerCase()}</div>
      ${board.slice(0, 3).map((r, i) => `<div class="tm-række" style="cursor:default">
        <span style="width:18px;text-align:center">${["🥇","🥈","🥉"][i]}</span>
        <span class="lm-navn">${r.cc ? flag(r.cc) + " " : ""}${r.navn}</span>
        <span class="lm-sted">${r.tid}</span>
      </div>`).join("")}
      <button class="tm-cta" data-handling="top">Åbn leaderboards →</button>`;
  }
  if (navn === "mine") {
    const user = getUser();
    if (!user) return `<div class="tm-tom">Log ind for at gemme løb og følge dem her.</div>
      <button class="tm-cta" data-handling="login">Log ind →</button>`;
    const gemte = RACES.filter(r => favs.has(r.n) && erKommende(r))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const next = gemte.find(r => entries.has(r.n)) || gemte[0];
    const dage = next?.dt ? Math.max(0, Math.ceil((new Date(next.dt) - new Date()) / 86400000)) : null;
    return `${next ? `<div class="tm-næste"><span class="countdown">${dage === 0 ? "I DAG" : dage + " dage"}</span> ${dage === 0 ? "-" : "til"} ${next.n}</div>` : ""}
      ${gemte.slice(0, 5).map(miniRække).join("") || `<div class="tm-tom">Ingen gemte løb endnu - find dem på kortet.</div>`}
      <button class="tm-cta" data-handling="dash">Åbn dashboard →</button>`;
  }
  return "";
}

function bindTabMenu(tabEl) {
  tabMenuEl.querySelectorAll(".tm-række[data-id]").forEach(b => b.onclick = () => { lukTabMenu(); openDetail(RACES[+b.dataset.id], true); });
  tabMenuEl.querySelectorAll(".tm-række[data-zoom]").forEach(b => b.onclick = () => {
    const z = LANDE_ZOOM[b.dataset.zoom];
    lukTabMenu();
    map.flyTo({ center: z.center, zoom: z.zoom, duration: 1400, essential: true });
  });
  const cta = tabMenuEl.querySelector(".tm-cta");
  if (cta) cta.onclick = () => {
    const h = cta.dataset.handling;
    lukTabMenu();
    if (h === "liste") document.querySelector('.tab[data-tab="liste"]').click();
    if (h === "top") document.querySelector('.tab[data-tab="top"]').click();
    if (h === "login") openLogin();
    if (h === "dash") openDashboard();
  };
}

function åbnTabMenu(tabEl) {
  const navn = tabEl.dataset.tab;
  if (navn === "liste") return; // ren toggle - ingen teaser
  // allerede åben for samme fane? så lad den stå (undgår flicker ved musejitter)
  if (tabMenuEl && tabMenuEl.dataset.tab === navn) return;
  lukTabMenu();
  const html = tabMenuIndhold(navn);
  if (!html) return;
  const rect = tabEl.getBoundingClientRect();
  tabMenuEl = document.createElement("div");
  tabMenuEl.className = "live-menu tab-menu";
  tabMenuEl.dataset.tab = navn;
  tabMenuEl.style.top = rect.bottom + 8 + "px";
  tabMenuEl.style.left = Math.min(Math.max(12, rect.left - 20), innerWidth - 312) + "px";
  tabMenuEl.innerHTML = html;
  document.body.appendChild(tabMenuEl);
  tabMenuEl.addEventListener("mouseleave", e => { if (!tabEl.contains(e.relatedTarget)) lukTabMenu(); });
  bindTabMenu(tabEl);
  // Leaderboards: hent data dovent og genudfyld når klar
  if (navn === "top" && !window.topDataCache && window.hentTopData) {
    window.hentTopData().then(() => {
      if (tabMenuEl && tabMenuEl.dataset.tab === "top") { tabMenuEl.innerHTML = tabMenuIndhold("top"); bindTabMenu(tabEl); }
    });
  }
}

let tabMenuTimer = null;
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("mouseenter", () => { clearTimeout(tabMenuTimer); if (innerWidth > 720) åbnTabMenu(tab); });
  tab.addEventListener("mouseleave", () => {
    clearTimeout(tabMenuTimer);
    tabMenuTimer = setTimeout(() => { if (tabMenuEl && !tabMenuEl.matches(":hover") && !tab.matches(":hover")) lukTabMenu(); }, 180);
  });
});
document.addEventListener("click", e => { if (tabMenuEl && !tabMenuEl.contains(e.target) && !e.target.closest(".tab")) lukTabMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") lukTabMenu(); });

/* ---------- deep links (#løbets-navn) ---------- */
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const r = RACES.find(x => slug(x.n) === h);
  if (r && r !== currentRace) setTimeout(() => openDetail(r, true), 300);
}
map.on("load", openFromHash);
window.addEventListener("hashchange", openFromHash);

/* ---------- uret går: live-status genberegnes løbende, og ved datoskift
   arkiveres gårsdagens løb uden reload (siden kan stå åben natten over) ---------- */
let sidsteDato = iDagISO();
setInterval(() => {
  if (typeof initLiveUI === "function" && map.isStyleLoaded()) initLiveUI();
  if (iDagISO() !== sidsteDato) {
    sidsteDato = iDagISO();
    const src = map.getSource("races");
    if (src) src.setData(toGeojson(filtered()));
    updateCounter();
    if (!panel.hidden) setTab(state.tab);
    if (window.listeOverlay && !window.listeOverlay.hidden) window.renderListe();
  }
}, 5 * 60 * 1000);

/* ---------- USA-kataloget hentes dovent (¾ af datamængden) ----------
   Norden-først: kortet står med det samme, RunSignup-løbene flettes ind
   når kortet har haft sit første rolige øjeblik. */
map.once("load", () => setTimeout(() => {
  const s = document.createElement("script");
  s.src = "data/races-rsu.js?v=81";
  s.onload = () => {
    // filen pusher sine løb og gen-id'er hele RACES selv
    const src = map.getSource("races");
    if (src) src.setData(toGeojson(filtered()));
    updateCounter();
    if (typeof initLiveUI === "function") initLiveUI();
    if (!panel.hidden) setTab(state.tab); // genopfrisk åben liste
    if (window.listeOverlay && !window.listeOverlay.hidden) window.renderListe();
    if (!currentRace) openFromHash();     // deep-link til et USA-løb kan nu løses
  };
  document.head.appendChild(s);
}, 1200));

/* ---------- demo-login ---------- */
const loginOverlay = document.getElementById("loginOverlay");
const getUser = () => { try { return JSON.parse(localStorage.getItem("runnin-user")); } catch (_) { return null; } };

const initialer = navn => navn.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const avatarHtml = user => user.foto ? `<img src="${user.foto}" alt="">` : initialer(user.navn);

function updateAuthUI() {
  const user = getUser();
  document.getElementById("loginBtn").hidden = !!user;
  const chip = document.getElementById("userChip");
  chip.hidden = !user;
  if (user) {
    document.getElementById("userAvatar").innerHTML = avatarHtml(user);
    document.getElementById("userName").textContent = user.navn;
  }
}

function openLogin() {
  document.getElementById("loginName").value = "";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPw").value = "";
  window.loginTilstand?.("ind");
  loginOverlay.hidden = false;
  // genstart entrance-animationen
  const modal = loginOverlay.querySelector(".login-modal");
  modal.style.animation = "none"; void modal.offsetWidth; modal.style.animation = "";
  setTimeout(() => document.getElementById("loginEmail").focus(), 250);
}
const closeLogin = () => (loginOverlay.hidden = true);

document.getElementById("loginBtn").addEventListener("click", openLogin);

/* logoet er vejen hjem: luk alt, nulstil filtre + søgning, flyv til udgangspunktet */
document.getElementById("brandHjem").addEventListener("click", () => {
  closePanel(); detail.hidden = true; profileMenu.hidden = true;
  featOverlay.hidden = true; dashOverlay.hidden = true;
  window.lukListe?.();
  window.lukToplister?.();
  setTab("kort");
  state.type = state.month = state.region = null;
  document.querySelectorAll(".pill-wrap").forEach(wrap => {
    const pill = wrap.querySelector(".pill");
    pill.innerHTML = `${menus[pill.dataset.menu][0].label} <span class="caret">▾</span>`;
    pill.classList.remove("on");
    wrap.querySelectorAll(".menu button").forEach((b, i) => b.classList.toggle("sel", i === 0));
  });
  searchInput.value = "";
  searchMenu.hidden = true;
  applyFilters();
  history.replaceState(null, "", location.pathname);
  map.flyTo({ center: [13, 59.5], zoom: 4.1, duration: 1200, essential: true });
});

/* ---------- profil-dropdown ---------- */
const profileMenu = document.getElementById("profileMenu");

function toggleProfileMenu() {
  if (!profileMenu.hidden) { profileMenu.hidden = true; return; }
  const user = getUser();
  if (!user) return openLogin();
  // profilmenu og paneler udelukker hinanden - luk hvad der ellers er åbent
  detail.hidden = true;
  closePanel();
  setTab("kort");
  const gemte = RACES.filter(r => favs.has(r.n)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const next = gemte.find(r => r.dt && r.dt >= iDagISO());
  const dage = next ? Math.max(0, Math.ceil((new Date(next.dt) - new Date()) / 86400000)) : null;

  profileMenu.innerHTML = `
    <div class="pm-head">
      <span class="user-avatar">${avatarHtml(user)}</span>
      <div>
        <div class="pm-navn">${user.navn}</div>
        <div class="pm-sub">${user.email || "Runnin-profil"}</div>
      </div>
    </div>
    ${next ? `<div class="pm-next"><span class="countdown">${dage === 0 ? "I DAG" : dage + " dage"}</span> ${dage === 0 ? "-" : "til"} ${next.n}</div>` : ""}
    <div class="pm-items">
      <button data-act="dash" class="pm-dash"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>Dashboard</button>
      <button data-act="rediger"><svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.4"/><line x1="4" y1="15" x2="20" y2="15"/><circle cx="15" cy="15" r="2.4"/></svg>Indstillinger</button>
      <button data-act="logud" class="pm-logud"><svg viewBox="0 0 24 24"><path d="M14 7V5.5A1.5 1.5 0 0 0 12.5 4h-6A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h6a1.5 1.5 0 0 0 1.5-1.5V17"/><line x1="9.5" y1="12" x2="20" y2="12"/><path d="M17 9l3 3-3 3"/></svg>Log ud</button>
    </div>`;
  profileMenu.hidden = false;

  profileMenu.querySelectorAll("button").forEach(b => b.onclick = () => {
    profileMenu.hidden = true;
    const act = b.dataset.act;
    if (act === "dash") openDashboard();
    if (act === "mine") { setTab("mine"); panel.hidden = false; renderFavs(); }
    if (act === "rediger") openDashboard("indstillinger");
    if (act === "logud") logUd();
  });
}

document.getElementById("userChip").addEventListener("click", e => { e.stopPropagation(); toggleProfileMenu(); });
document.addEventListener("click", e => { if (!profileMenu.hidden && !profileMenu.contains(e.target)) profileMenu.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") profileMenu.hidden = true; });
document.getElementById("loginClose").addEventListener("click", closeLogin);
loginOverlay.addEventListener("click", e => { if (e.target === loginOverlay) closeLogin(); });
// login/oprettelse håndteres af js/konto.js (rigtig Supabase-auth)
function logUd() {
  if (window.kontoLogUd) return kontoLogUd();
  localStorage.removeItem("runnin-user");
  updateAuthUI();
  if (state.tab === "mine") renderFavs();
}
updateAuthUI();

/* ---------- indstillinger: profilbillede + data ---------- */
document.getElementById("fotoInput").addEventListener("change", e => {
  const fil = e.target.files?.[0];
  if (!fil) return;
  const img = new Image();
  img.onload = () => {
    // kvadratisk center-crop, 128 px, gemt lokalt som jpeg
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const s = Math.min(img.width, img.height);
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
    const user = getUser();
    if (!user) return;
    user.foto = c.toDataURL("image/jpeg", 0.82);
    localStorage.setItem("runnin-user", JSON.stringify(user));
    const dashAv = document.getElementById("dashAvatar");
    if (dashAv) dashAv.innerHTML = avatarHtml(user);
    updateAuthUI();
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(fil);
  e.target.value = "";
});

const RUNNIN_KEYS = ["runnin-user", "runnin-favs", "runnin-entries", "runnin-alarms", "runnin-bibs", "runnin-strava", "runnin-radars", "runnin-tema"];
function eksportData() {
  // runnin-tema gemmes som rå streng, resten som JSON - tag begge dele med
  const læs = k => { const v = localStorage.getItem(k); try { return JSON.parse(v ?? "null"); } catch (_) { return v; } };
  const data = Object.fromEntries(RUNNIN_KEYS.map(k => [k, læs(k)]));
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = "runnin-data.json"; a.click();
  URL.revokeObjectURL(url);
}
async function sletAlleData() {
  const bruger = typeof getUser === "function" && getUser();
  const besked = bruger
    ? "Slet din Runnin-konto og ALLE data permanent? Konto, gemte løb - alt fjernes hos os og kan ikke gendannes."
    : "Slet alle dine Runnin-data i denne browser? Gemte løb, alarmer, profil - alt fjernes.";
  if (!confirm(besked)) return;
  if (bruger && typeof sletKonto === "function") {
    const ok = await sletKonto();
    if (!ok) { alert("Kunne ikke slette kontoen lige nu. Prøv igen om lidt."); return; }
  }
  RUNNIN_KEYS.forEach(k => localStorage.removeItem(k));
  location.reload();
}
