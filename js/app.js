/* Runnin - kortet er produktet. */
"use strict";

const TYPE_COLOR = { kort: "#2563EB", half: "#16A34A", marathon: "#FF5A5F", ultra: "#7C3AED", tri: "#111827" };
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
const favs = new Set(JSON.parse(localStorage.getItem("runnin-favs") || "[]"));
RACES.forEach((r, i) => (r.id = i));

/* ---------- helpers ---------- */
const flag = cc => cc === "AQ" ? "🇦🇶" : [...cc].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("");
const monthLabel = m => { const [y, mm] = m.split("-"); return MONTHS[+mm - 1].slice(0, 3) + ". " + y; };
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

function filtered() {
  return RACES.filter(r =>
    (!state.type || r.t === state.type) &&
    (state.month === null || +r.m.split("-")[1] === state.month) &&
    inRegion(r)
  );
}

function toGeojson(list) {
  return {
    type: "FeatureCollection",
    features: list.map(r => ({
      type: "Feature", id: r.id,
      properties: { id: r.id, t: r.t },
      geometry: { type: "Point", coordinates: [r.lo, r.la] },
    })),
  };
}

/* ---------- kort ---------- */
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [10, 32],
  zoom: 1.7,
  minZoom: 1.2,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

// Varm atlas-palet oven på Positron - blødt vand, sart grøn natur, papir-land.
function warmify() {
  const patch = {
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
}

map.on("load", () => {
  warmify();

  map.addSource("races", { type: "geojson", data: toGeojson(filtered()), cluster: true, clusterMaxZoom: 8, clusterRadius: 42 });

  map.addLayer({
    id: "clusters", type: "circle", source: "races", filter: ["has", "point_count"],
    paint: {
      "circle-color": "#111827",
      "circle-radius": ["step", ["get", "point_count"], 13, 8, 17, 25, 22],
      "circle-stroke-width": 5,
      "circle-stroke-color": "rgba(17,24,39,.15)",
    },
  });
  map.addLayer({
    id: "cluster-count", type: "symbol", source: "races", filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Regular"], "text-size": 11 },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "race-dots", type: "circle", source: "races", filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["match", ["get", "t"], "kort", TYPE_COLOR.kort, "half", TYPE_COLOR.half, "marathon", TYPE_COLOR.marathon, "ultra", TYPE_COLOR.ultra, TYPE_COLOR.tri],
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 9, 6],
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.5],
      "circle-stroke-color": "#ffffff",
      "circle-radius-transition": { duration: 150 },
    },
  });

  wireMapEvents();
  updateCounter();
});

/* ---------- hover + klik ---------- */
const hoverCard = document.getElementById("hoverCard");
let hoverId = null;

function wireMapEvents() {
  map.on("mousemove", "race-dots", e => {
    const f = e.features[0];
    if (hoverId !== null) map.setFeatureState({ source: "races", id: hoverId }, { hover: false });
    hoverId = f.id;
    map.setFeatureState({ source: "races", id: hoverId }, { hover: true });
    map.getCanvas().style.cursor = "pointer";

    const r = RACES[f.properties.id];
    hoverCard.innerHTML =
      `<div class="hc-name">${r.n}</div>
       <div class="hc-meta">${r.d} · ${r.c} ${flag(r.cc)}<br>${monthLabel(r.m)} · ${priceLabel(r.p)}</div>
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
  map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
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
  document.getElementById("dMeta").innerHTML =
    `${r.d} · ${r.c} ${flag(r.cc)}<br>Næste udgave: ${monthLabel(r.m)}<br>Startgebyr: ${priceLabel(r.p)}`;
  const note = document.getElementById("dNote");
  note.hidden = !r.note;
  if (r.note) note.textContent = "⚑ Adgang: " + r.note;
  document.getElementById("dCta").href = r.u;
  updateSaveBtn();
  detail.hidden = false;
  if (fly) map.flyTo({ center: [r.lo, r.la], zoom: Math.max(map.getZoom(), 5.5), duration: 1100, essential: true });
}

function updateSaveBtn() {
  const btn = document.getElementById("dSave");
  const saved = currentRace && favs.has(currentRace.id);
  btn.textContent = saved ? "✓ Gemt i Mine løb" : "♡ Gem i Mine løb";
  btn.classList.toggle("saved", saved);
}

document.getElementById("dSave").addEventListener("click", () => {
  if (!currentRace) return;
  favs.has(currentRace.id) ? favs.delete(currentRace.id) : favs.add(currentRace.id);
  localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
  updateSaveBtn();
  updateFavCount();
});
document.getElementById("detailClose").addEventListener("click", () => (detail.hidden = true));

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

function applyFilters() {
  const list = filtered();
  const src = map.getSource("races");
  if (src) src.setData(toGeojson(list));
  updateCounter(list);
  if (state.tab === "lob") renderList();
}

function updateCounter(list) {
  const n = (list || filtered()).length;
  document.getElementById("counter").innerHTML = `<strong>${n} løb</strong> på kortet`;
}

/* ---------- tabs + paneler ---------- */
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");

document.querySelectorAll(".tab").forEach(tab =>
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    state.tab = tab.dataset.tab;
    detail.hidden = true;
    if (state.tab === "kort") closePanel();
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
      <div class="r-name">${r.n}</div>
      <div class="r-meta">${r.d} · ${r.c} ${flag(r.cc)}</div>
    </div>
    <div class="r-side">
      <div class="r-price">${priceLabel(r.p)}</div>
      <div class="r-when">${monthLabel(r.m)}</div>
    </div>
  </div>`;
}

function renderList() {
  panelTitle.textContent = "Løb";
  const list = filtered().slice().sort((a, b) => a.m.localeCompare(b.m));
  panelBody.innerHTML = list.length
    ? list.map(rowHtml).join("")
    : `<div class="empty">Ingen løb matcher filtrene.<br><em>Prøv at åbne op for hvor eller hvornår.</em></div>`;
}

function renderFavs() {
  panelTitle.textContent = "Mine løb";
  const list = RACES.filter(r => favs.has(r.id)).sort((a, b) => a.m.localeCompare(b.m));
  panelBody.innerHTML = list.length
    ? list.map(rowHtml).join("")
    : `<div class="empty">Ingen gemte løb endnu.<br><em>Klik på et løb på kortet og tryk "Gem i Mine løb".</em></div>`;
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
