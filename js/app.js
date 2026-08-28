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
const favs = new Set(JSON.parse(localStorage.getItem("runnin-favs") || "[]"));
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

function filtered() {
  return RACES.filter(r =>
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
  center: [10, 32],
  zoom: 1.7,
  minZoom: 1.2,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

// Varm atlas-palet oven på Positron - blødt vand, sart grøn natur, papir-land.
function warmify() {
  // Kortet holdes neutralt varmt (IKKE cream) - truffle-paletten lever i UI-laget
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
      "circle-stroke-width": ["case", ["==", ["get", "e"], 1], 3, ["case", ["boolean", ["feature-state", "hover"], false], 3, 1.5]],
      "circle-stroke-color": ["case", ["==", ["get", "e"], 1], "#C05800", "#ffffff"],
      "circle-radius-transition": { duration: 150 },
    },
  });

  wireMapEvents();
  updateCounter();
  if (typeof initLiveUI === "function") initLiveUI();
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
    `${r.d} · ${r.c} ${flag(r.cc)}<br>Næste udgave: ${dateLabel(r)}` +
    (r.p ? `<br>Startgebyr: ${priceLabel(r.p)}` : `<br>Pris: se tilmeldingssiden`);
  const note = document.getElementById("dNote");
  note.hidden = !r.note;
  if (r.note) note.textContent = "⚑ Adgang: " + r.note;
  document.getElementById("dCta").href = r.u;
  document.getElementById("dLive").hidden = !(typeof isLive === "function" && isLive(r));
  updateSaveBtn();
  detail.hidden = false;
  if (fly) map.flyTo({ center: [r.lo, r.la], zoom: Math.max(map.getZoom(), 5.5), duration: 1100, essential: true });
}

function updateSaveBtn() {
  const btn = document.getElementById("dSave");
  const saved = currentRace && favs.has(currentRace.id);
  btn.textContent = saved ? "✓ Gemt i Mine løb" : "♡ Gem i Mine løb";
  btn.classList.toggle("saved", saved);
  const eBtn = document.getElementById("dEntry");
  const entered = currentRace && entries.has(currentRace.n);
  eBtn.textContent = entered ? "🎟 Du er tilmeldt" : "🎟 Markér som tilmeldt";
  eBtn.classList.toggle("entered", entered);
}

document.getElementById("dSave").addEventListener("click", () => {
  if (!currentRace) return;
  favs.has(currentRace.id) ? favs.delete(currentRace.id) : favs.add(currentRace.id);
  localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
  updateSaveBtn();
  updateFavCount();
});
document.getElementById("dEntry").addEventListener("click", () => {
  if (!currentRace) return;
  if (entries.has(currentRace.n)) entries.delete(currentRace.n);
  else {
    entries.add(currentRace.n);
    favs.add(currentRace.id); // tilmeldt ⇒ også i Mine løb
    localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
  }
  saveEntries();
  updateSaveBtn();
  updateFavCount();
  applyFilters(); // opdater caramel-ring på kortet
});
// Efter man har klikket ud til tilmeldingen: nudge "Markér som tilmeldt", når man kommer tilbage
document.getElementById("dCta").addEventListener("click", () => {
  if (!currentRace || entries.has(currentRace.n)) return;
  const eBtn = document.getElementById("dEntry");
  setTimeout(() => {
    eBtn.classList.add("nudge");
    eBtn.addEventListener("animationend", () => eBtn.classList.remove("nudge"), { once: true });
  }, 600);
});
document.getElementById("detailClose").addEventListener("click", () => (detail.hidden = true));
document.getElementById("dPhotos").addEventListener("click", () => currentRace && openFotos(currentRace));
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
      <div class="r-name">${r.n}${entries.has(r.n) ? ` <span class="r-entry">🎟 Tilmeldt</span>` : ""}</div>
      <div class="r-meta">${r.d} · ${r.c} ${flag(r.cc)}</div>
    </div>
    <div class="r-side">
      ${typeof isLive === "function" && isLive(r)
        ? `<span class="row-live"><i class="live-dot"></i>LIVE</span>`
        : `<div class="r-price">${r.p ? priceLabel(r.p) : ""}</div><div class="r-when">${dateLabel(r)}</div>`}
    </div>
  </div>`;
}

const calToggle = document.getElementById("calToggle");
calToggle.addEventListener("click", () => openCalendar());

const fullMonth = m => { const [y, mm] = m.split("-"); return MONTHS[+mm - 1][0].toUpperCase() + MONTHS[+mm - 1].slice(1) + " " + y; };
const sortKey = r => r.dt || r.m + "-99";

function renderList() {
  panelTitle.textContent = "Kommende løb";
  calToggle.hidden = false;
  const list = filtered().slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  if (!list.length) {
    panelBody.innerHTML = `<div class="empty">Ingen løb matcher filtrene.<br><em>Prøv at åbne op for hvor eller hvornår.</em></div>`;
    return;
  }
  // Grupperet pr. måned med sticky headere (standard)
  let html = "", current = "";
  for (const r of list) {
    if (r.m !== current) { current = r.m; html += `<div class="month-head">${fullMonth(r.m)}</div>`; }
    html += rowHtml(r);
  }
  panelBody.innerHTML = html;
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
  calOverlay.querySelectorAll(".cal-list .row").forEach(row => row.onclick = () => {
    closeCalendar(); closePanel(); setTab("kort");
    openDetail(RACES[+row.dataset.id], true);
  });
}

calOverlay.addEventListener("click", e => { if (e.target === calOverlay) closeCalendar(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !calOverlay.hidden) closeCalendar(); });

function renderFavs() {
  panelTitle.textContent = "Mine løb";
  calToggle.hidden = true;
  const list = RACES.filter(r => favs.has(r.id)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const user = getUser();
  let hilsen = "";
  if (user) {
    const kommende = list.filter(r => r.dt && new Date(r.dt) >= new Date());
    const next = kommende.find(r => entries.has(r.n)) || kommende[0]; // tilmeldte løb først
    const dage = next ? Math.ceil((new Date(next.dt) - new Date()) / 86400000) : null;
    hilsen = `<div class="mine-hilsen"><strong>Hej ${user.navn.split(" ")[0]}</strong>
      <span>${list.length} løb gemt${next ? ` · <span class="countdown">${dage} dage</span> til ${next.n}${entries.has(next.n) ? " 🎟" : ""}` : ""}</span></div>`;
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

/* ---------- demo-login ---------- */
const loginOverlay = document.getElementById("loginOverlay");
const getUser = () => { try { return JSON.parse(localStorage.getItem("runnin-user")); } catch (_) { return null; } };

function updateAuthUI() {
  const user = getUser();
  document.getElementById("loginBtn").hidden = !!user;
  const chip = document.getElementById("userChip");
  chip.hidden = !user;
  if (user) {
    document.getElementById("userAvatar").textContent = user.navn.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    document.getElementById("userName").textContent = user.navn;
  }
}

function openLogin() {
  const user = getUser();
  document.getElementById("loginTitle").textContent = user ? "Din profil" : "Log ind";
  document.getElementById("loginName").value = user ? user.navn : "Lasse Christensen";
  document.getElementById("loginEmail").value = user?.email || "";
  document.getElementById("logoutBtn").hidden = !user;
  // adgangskode kun ved login, ikke ved profil-redigering; gemmes ALDRIG (demo)
  document.getElementById("pwWrap").hidden = !!user;
  document.getElementById("loginPw").required = !user;
  document.getElementById("loginPw").value = "";
  loginOverlay.hidden = false;
  // genstart entrance-animationen
  const modal = loginOverlay.querySelector(".login-modal");
  modal.style.animation = "none"; void modal.offsetWidth; modal.style.animation = "";
  setTimeout(() => document.getElementById("loginName").focus(), 250);
}
const closeLogin = () => (loginOverlay.hidden = true);

document.getElementById("loginBtn").addEventListener("click", openLogin);

/* ---------- profil-dropdown ---------- */
const profileMenu = document.getElementById("profileMenu");

function toggleProfileMenu() {
  if (!profileMenu.hidden) { profileMenu.hidden = true; return; }
  const user = getUser();
  if (!user) return openLogin();
  const gemte = RACES.filter(r => favs.has(r.id)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const next = gemte.find(r => r.dt && new Date(r.dt) >= new Date());
  const dage = next ? Math.ceil((new Date(next.dt) - new Date()) / 86400000) : null;

  profileMenu.innerHTML = `
    <div class="pm-head">
      <span class="user-avatar">${user.navn.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}</span>
      <div>
        <div class="pm-navn">${user.navn}</div>
        <div class="pm-sub">${user.email || "Runnin-profil"}</div>
      </div>
    </div>
    ${next ? `<div class="pm-next"><span class="countdown">${dage} dage</span> til ${next.n}</div>` : ""}
    <div class="pm-items">
      <button data-act="mine">♡ Mine løb <span class="pm-tal">${gemte.length}</span></button>
      <button data-act="rediger">Redigér profil</button>
      <button data-act="logud" class="pm-logud">Log ud</button>
    </div>`;
  profileMenu.hidden = false;

  profileMenu.querySelectorAll("button").forEach(b => b.onclick = () => {
    profileMenu.hidden = true;
    const act = b.dataset.act;
    if (act === "mine") { setTab("mine"); panel.hidden = false; renderFavs(); }
    if (act === "rediger") openLogin();
    if (act === "logud") { localStorage.removeItem("runnin-user"); updateAuthUI(); if (state.tab === "mine") renderFavs(); }
  });
}

document.getElementById("userChip").addEventListener("click", e => { e.stopPropagation(); toggleProfileMenu(); });
document.addEventListener("click", e => { if (!profileMenu.hidden && !profileMenu.contains(e.target)) profileMenu.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") profileMenu.hidden = true; });
document.getElementById("loginClose").addEventListener("click", closeLogin);
loginOverlay.addEventListener("click", e => { if (e.target === loginOverlay) closeLogin(); });
document.getElementById("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const navn = document.getElementById("loginName").value.trim();
  if (!navn) return;
  const email = document.getElementById("loginEmail").value.trim();
  localStorage.setItem("runnin-user", JSON.stringify({ navn, ...(email ? { email } : {}) }));
  closeLogin();
  updateAuthUI();
  if (state.tab === "mine") renderFavs();
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("runnin-user");
  closeLogin();
  updateAuthUI();
  if (state.tab === "mine") renderFavs();
});
updateAuthUI();
