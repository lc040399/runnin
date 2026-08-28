/* Runnin LIVE - løb der er i gang lige nu.
   Ægte del: hvilke løb der er LIVE (dt == i dag, fra Sportstiming-datoer).
   Simuleret del (ærligt mærket): løber-prikker på ruten, leaderboard og mål-feed. */
"use strict";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isLive = r => r.dt === todayISO();

const LIVE_NAVNE = [
  "Mette N.", "Jonas K.", "Sofie H.", "Rasmus P.", "Camilla J.", "Frederik L.", "Ida S.", "Mikkel T.",
  "Emma R.", "Oliver B.", "Freja M.", "Victor A.", "Clara D.", "Emil W.", "Laura V.", "Noah C.",
  "Anna G.", "William F.", "Alma E.", "Oscar J.", "Karen O.", "Mads H.", "Signe B.", "Tobias N.",
  "Line P.", "Kasper S.", "Maja L.", "Anders M.", "Julie T.", "Simon R.", "Nanna K.", "Lucas D.",
  "Cecilie A.", "Magnus V.", "Thea W.", "Elias G.", "Astrid F.", "Villads E.", "Agnes C.", "Malthe B.",
];

/* ---------- rute: rigtige veje via OSRM (snapper til vejnettet - aldrig gennem vand) ---------- */
function syntheticRoute(lo, la) {
  const pts = [];
  const N = 160, baseR = 0.009;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wobble = 1 + 0.22 * Math.sin(a * 3 + 1.3);
    pts.push([lo + Math.cos(a) * baseR * wobble * 1.6, la + Math.sin(a) * baseR * wobble]);
  }
  return { coords: pts, km: 5 };
}

async function osrmTrip(lo, la, R) {
  const wps = [0, 1, 2, 3, 4].map(i => {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    return `${(lo + Math.cos(a) * R * 1.6).toFixed(5)},${(la + Math.sin(a) * R).toFixed(5)}`;
  }).join(";");
  const url = `https://router.project-osrm.org/trip/v1/driving/${wps}?roundtrip=true&source=first&geometries=geojson&overview=full`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const data = await res.json();
  if (data.code !== "Ok" || !data.trips?.length) throw new Error("OSRM: " + data.code);
  return { coords: data.trips[0].geometry.coordinates, km: +(data.trips[0].distance / 1000).toFixed(1) };
}

// Rundtur på rigtige veje, længde-matchet til løbets officielle distance (empirisk: km ≈ R × 1089)
async function fetchRoute(lo, la, targetKm) {
  let R = Math.min(0.03, Math.max(0.0015, targetKm / 1089));
  let rute = await osrmTrip(lo, la, R);
  if (Math.abs(rute.km - targetKm) / targetKm > 0.3) {
    R = Math.min(0.05, Math.max(0.0012, R * targetKm / Math.max(rute.km, 0.5)));
    try { rute = await osrmTrip(lo, la, R); } catch (_) {}
  }
  return rute;
}

// Løbets distance ud fra datafeltet ("42,2 km", "100 mi", "10 km") - ukendt → 8 km
function parseKm(r) {
  const mi = r.d.match(/([\d.,]+)\s*mi/i);
  if (mi) return parseFloat(mi[1].replace(",", ".")) * 1.609;
  const km = r.d.match(/([\d.,]+)\s*km/i);
  if (km) return parseFloat(km[1].replace(",", "."));
  return 8;
}

// Resample til jævnt fordelte punkter, så løberne bevæger sig med konstant fart
function resample(coords, n = 240) {
  const dists = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos(coords[i][1] * Math.PI / 180);
    const dy = coords[i][1] - coords[i - 1][1];
    dists.push(dists[i - 1] + Math.hypot(dx, dy));
  }
  const total = dists[dists.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    while (j < dists.length - 2 && dists[j + 1] < target) j++;
    const seg = dists[j + 1] - dists[j] || 1e-12;
    const f = (target - dists[j]) / seg;
    out.push([
      coords[j][0] + (coords[j + 1][0] - coords[j][0]) * f,
      coords[j][1] + (coords[j + 1][1] - coords[j][1]) * f,
    ]);
  }
  return out;
}
const alongRoute = (route, t) => {
  const f = t * (route.length - 1), i = Math.floor(f), frac = f - i;
  const [x1, y1] = route[i], [x2, y2] = route[Math.min(i + 1, route.length - 1)];
  return [x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac];
};

/* ---------- simulations-tilstand ---------- */
const sim = { race: null, route: null, runners: [], feed: [], raf: null, lastTick: 0, simMin: 38, distKm: 10 };

function seedRunners(race) {
  const h0 = [...race.n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 5);
  sim.runners = LIVE_NAVNE.map((navn, i) => {
    const h = (h0 * (i + 13) * 2654435761) >>> 0;
    return {
      navn, bib: 100 + ((h >>> 4) % 880),
      fart: 0.82 + ((h % 1000) / 1000) * 0.36,   // relativ fart
      prog: 0.03 + ((h >>> 10) % 1000) / 1000 * 0.955, // feltet spredt over hele ruten - de forreste er tæt på mål
      done: false, tid: null,
    };
  });
  sim.feed = [];
}

/* ---------- kort-lag ---------- */
function ensureLiveLayers() {
  if (map.getSource("live-route")) return;
  map.addSource("live-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("live-runners", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "live-route-line", type: "line", source: "live-route",
    paint: { "line-color": "#C05800", "line-width": 3.5, "line-opacity": .8 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "live-runner-dots", type: "circle", source: "live-runners",
    paint: {
      "circle-color": ["case", ["get", "leader"], "#C05800", "#10B981"],
      "circle-radius": ["case", ["get", "leader"], 8, 6],
      "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
    },
  });
}
function clearLiveLayers() {
  for (const id of ["live-runner-dots", "live-route-line"]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["live-runners", "live-route"]) if (map.getSource(id)) map.removeSource(id);
}

/* ---------- ÆGTE resultater via RunSignup (server-side proxy - de stripper CORS-svar) ---------- */
async function hentÆgteResultater(race) {
  if (!race.rsid) return null;
  try {
    const d = await (await fetch(`/api/resultater?rsid=${race.rsid}`, { signal: AbortSignal.timeout(8000) })).json();
    return d.results?.length ? d.results : null;
  } catch (_) { return null; }
}

/* ---------- selve simulationen ---------- */
const fmtTid = min => {
  const s = Math.round(min * 60), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
};

function tick(ts) {
  if (!sim.race) return;
  const dt = sim.lastTick ? Math.min((ts - sim.lastTick) / 1000, .1) : 0;
  sim.lastTick = ts;
  const speedPerSec = 1 / (sim.simMin * 60); // naturligt tempo: reel løbefart, ingen time-lapse
  let changed = false;

  for (const r of sim.runners) {
    if (r.done) continue;
    r.prog += speedPerSec * r.fart * dt;
    if (r.prog >= 1) {
      r.prog = 1; r.done = true; changed = true;
      r.tid = fmtTid(sim.simMin / r.fart);
      const plac = sim.runners.filter(x => x.done).length;
      sim.feed.unshift({ navn: r.navn, bib: r.bib, tid: r.tid, plac, fart: r.fart });
    }
  }

  const feats = sim.runners.filter(r => !r.done).map((r, idx) => ({
    type: "Feature",
    properties: { leader: r === lederen() },
    geometry: { type: "Point", coordinates: alongRoute(sim.route, r.prog) },
  }));
  map.getSource("live-runners")?.setData({ type: "FeatureCollection", features: feats });

  if (!sim.ægte && (changed || Math.floor(ts / 400) !== Math.floor((ts - dt * 1000) / 400))) updateLivePanel();
  sim.raf = requestAnimationFrame(tick);
}
const lederen = () => sim.runners.filter(r => !r.done).sort((a, b) => b.prog - a.prog)[0];

/* ---------- panel: bygges ÉN gang, rækker glider til nye placeringer (FLIP) ---------- */
const livePanel = document.getElementById("livePanel");
const ROW_H = 54;
let rowEls = new Map(), feedCount = 0;

function buildLivePanel() {
  rowEls = new Map(); feedCount = 0;
  livePanel.innerHTML = `
    <div class="live-head">
      <span class="live-badge"><i></i>LIVE</span>
      <h2>${sim.race.n}</h2>
      <button class="close" id="liveClose" aria-label="Luk">✕</button>
    </div>
    <div class="live-stats">
      <div><strong id="stRuten">${sim.runners.length}</strong><span>på ruten</span></div>
      <div><strong id="stMaal">0</strong><span>i mål</span></div>
      <div><strong>${sim.distKm} km</strong><span>rute</span></div>
    </div>
    <div class="live-sec">Førende lige nu</div>
    <div class="lb-list" id="lbList"></div>
    <div class="live-sec">Målstregen</div>
    <div class="live-feed" id="liveFeed"><div class="feed-tom">Ingen i mål endnu - følg med her.</div></div>
    <p class="foto-note">Demo: LIVE-status er ægte (løbet afholdes i dag), og løberne bevæger sig i naturligt løbetempo på rigtige veje, matchet til løbets distance - men den officielle rute og felterne kræver arrangørens data.</p>`;
  document.getElementById("liveClose").onclick = closeLive;
}

function updateLivePanel() {
  const list = document.getElementById("lbList");
  if (!list) return;
  const active = sim.runners.filter(r => !r.done).sort((a, b) => b.prog - a.prog);
  const top = active.slice(0, 5);
  document.getElementById("stRuten").textContent = active.length;
  document.getElementById("stMaal").textContent = sim.runners.length - active.length;

  top.forEach((r, i) => {
    let el = rowEls.get(r.bib);
    if (!el) {
      el = document.createElement("div");
      el.className = "live-row";
      el.style.transform = `translateY(${(i + 1.6) * ROW_H}px)`;
      el.style.opacity = "0";
      el.innerHTML = `<span class="live-pos"></span>
        <div class="live-main">
          <div class="live-navn">${r.navn} <span class="live-bib">#${r.bib}</span></div>
          <div class="live-bar"><i></i></div>
        </div>
        <span class="live-km"></span>`;
      list.appendChild(el);
      rowEls.set(r.bib, el);
      void el.offsetWidth; // force layout så entrance-transition spiller
    }
    el.querySelector(".live-pos").textContent = i + 1;
    el.querySelector(".live-bar i").style.width = (r.prog * 100).toFixed(1) + "%";
    el.querySelector(".live-km").textContent = (r.prog * sim.distKm).toFixed(1) + " km";
    el.style.transform = `translateY(${i * ROW_H}px)`;
    el.style.opacity = "1";
  });

  // ude af top 5 (eller i mål): glid ud af syne
  const topBibs = new Set(top.map(r => r.bib));
  for (const [bib, el] of rowEls) {
    if (!topBibs.has(bib)) { el.style.transform = `translateY(${5.4 * ROW_H}px)`; el.style.opacity = "0"; }
  }

  // mål-feed: kun NYE indslag prependes, eksisterende DOM røres ikke
  if (sim.feed.length !== feedCount) {
    const feedEl = document.getElementById("liveFeed");
    if (feedCount === 0 && sim.feed.length) feedEl.innerHTML = "";
    for (let i = sim.feed.length - feedCount - 1; i >= 0; i--) {
      const f = sim.feed[i];
      const d = document.createElement("div");
      d.className = "feed-item";
      d.innerHTML = `<span>🏁</span><div><strong>${f.navn}</strong> <span class="live-bib">#${f.bib}</span> kom i mål</div><span class="feed-tid">${f.tid}</span><span class="feed-caret">▾</span>`;
      d.addEventListener("click", () => toggleFeedDetail(d, f));
      feedEl.prepend(d);
      while (feedEl.children.length > 12) feedEl.lastChild.remove();
    }
    feedCount = sim.feed.length;
  }
}

/* ---------- finisher-detaljer: tempo, placering, splits + link til fotos ---------- */
const fmtPace = minPerKm => {
  const m = Math.floor(minPerKm), s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

function toggleFeedDetail(itemEl, f) {
  const open = itemEl.nextElementSibling?.classList.contains("feed-detail");
  document.querySelectorAll(".feed-detail").forEach(el => el.remove());
  document.querySelectorAll(".feed-item.open").forEach(el => el.classList.remove("open"));
  if (open) return;

  const totalMin = sim.simMin / f.fart;
  const pace = totalMin / sim.distKm;
  const h = [...String(f.bib)].reduce((a, c) => (a * 37 + c.charCodeAt(0)) >>> 0, 3);
  const kmSplits = Math.min(Math.ceil(sim.distKm), 8);
  const splits = Array.from({ length: kmSplits }, (_, k) => {
    const wobble = 1 + (((h >>> (k * 3)) % 100) - 50) / 100 * 0.07; // ±3,5 % pr. km
    return `<span class="split"><em>${k + 1} km</em>${fmtPace(pace * wobble)}</span>`;
  }).join("");

  const det = document.createElement("div");
  det.className = "feed-detail";
  det.innerHTML = `
    <div class="fd-stats">
      <div><strong>${f.plac}.</strong><span>plads</span></div>
      <div><strong>${f.tid}</strong><span>sluttid</span></div>
      <div><strong>${fmtPace(pace)}</strong><span>min/km</span></div>
    </div>
    <div class="fd-splits">${splits}</div>
    <button class="fd-fotos">📷 Se billeder af #${f.bib}</button>`;
  det.querySelector(".fd-fotos").addEventListener("click", e => {
    e.stopPropagation();
    openFotos(sim.race, String(f.bib));
  });
  itemEl.classList.add("open");
  itemEl.after(det);
}

/* ---------- åbn/luk ---------- */
async function openLive(race) {
  closeLive();
  sim.race = race;
  sim.lastTick = 0;
  detail.hidden = true; closePanel(); setTab("kort");
  livePanel.hidden = false;
  livePanel.innerHTML = `<div class="live-head"><span class="live-badge"><i></i>LIVE</span><h2>${race.n}</h2></div><div class="feed-tom" style="padding:16px 0">Henter ruten…</div>`;

  let route;
  try { route = await fetchRoute(race.lo, race.la, parseKm(race)); }
  catch (_) { route = syntheticRoute(race.lo, race.la); }
  if (sim.race !== race) return; // lukket imens
  sim.route = resample(route.coords);
  sim.distKm = route.km;
  sim.simMin = +(sim.distKm * 4.6).toFixed(1); // midterfelt ~4:36 min/km → vinder ~3:55, bagtrop ~5:35
  seedRunners(race);
  ensureLiveLayers();
  map.getSource("live-route").setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sim.route } });

  // zoom så hele ruten er i billedet, med plads til panelet i højre side
  const lons = sim.route.map(p => p[0]), lats = sim.route.map(p => p[1]);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: { top: 90, bottom: 60, left: 60, right: innerWidth > 720 ? 440 : 60 }, duration: 1600, essential: true });

  buildLivePanel();
  updateLivePanel();
  sim.raf = requestAnimationFrame(tick);

  // RunSignup-løb: hent ÆGTE resultater i baggrunden og afløs simulationen i panelet
  sim.ægte = null;
  hentÆgteResultater(race).then(res => {
    if (sim.race !== race || !res?.length) return;
    sim.ægte = res;
    visÆgteResultater(res);
  });
}

function visÆgteResultater(res) {
  const top = res.slice(0, 5);
  const senest = res.slice(-8).reverse();
  livePanel.innerHTML = `
    <div class="live-head">
      <span class="live-badge"><i></i>LIVE</span>
      <h2>${sim.race.n}</h2>
      <button class="close" id="liveClose" aria-label="Luk">✕</button>
    </div>
    <div class="live-stats">
      <div><strong>${res.length}</strong><span>i mål</span></div>
      <div><strong>${top[0]?.tid || "-"}</strong><span>vindertid</span></div>
      <div><strong>${sim.distKm} km</strong><span>rute</span></div>
    </div>
    <div class="live-sec">Resultater · <span style="color:#059669">ægte data</span></div>
    ${top.map(r => `
      <div class="live-row" style="position:static;height:auto;padding:8px 0">
        <span class="live-pos">${r.plac}</span>
        <div class="live-main"><div class="live-navn">${r.navn} <span class="live-bib">#${r.bib}</span></div></div>
        <span class="feed-tid">${r.tid}</span>
      </div>`).join("")}
    <div class="live-sec">Senest i mål</div>
    <div class="live-feed">
      ${senest.map(r => `<div class="feed-item"><span>🏁</span><div><strong>${r.navn}</strong> <span class="live-bib">#${r.bib}</span></div><span class="feed-tid">${r.tid}</span></div>`).join("")}
    </div>
    <p class="foto-note">Resultaterne er ÆGTE - hentet live fra RunSignups åbne API. Prikkerne på ruten er fortsat illustration (tider, ikke GPS).</p>`;
  document.getElementById("liveClose").onclick = closeLive;
}
function closeLive() {
  if (sim.raf) cancelAnimationFrame(sim.raf);
  sim.raf = null; sim.race = null;
  livePanel.hidden = true;
  clearLiveLayers();
}

/* ---------- puls på live-prikker + live-pill ---------- */
function initLiveUI() {
  const liveRaces = RACES.filter(isLive);
  const pill = document.getElementById("livePill");
  if (!liveRaces.length) { pill.hidden = true; return; }

  pill.hidden = false;
  pill.innerHTML = `<i class="live-dot"></i> <strong>${liveRaces.length} løb</strong>&nbsp;i gang lige nu <span class="live-cta">Følg live →</span>`;
  let cycle = 0;
  pill.onclick = () => { openLive(liveRaces[cycle % liveRaces.length]); cycle++; };

  // live-løb klynger som resten af kortet - grønne klynger på lavt zoom, pulserende prikker tæt på
  map.addSource("live-halo", {
    type: "geojson", cluster: true, clusterMaxZoom: 8, clusterRadius: 44,
    data: { type: "FeatureCollection", features: liveRaces.map(r => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: [r.lo, r.la] } })) },
  });
  map.addLayer({
    id: "live-cluster", type: "circle", source: "live-halo", filter: ["has", "point_count"],
    paint: {
      "circle-color": "#10B981",
      "circle-radius": ["step", ["get", "point_count"], 12, 8, 16, 25, 20],
      "circle-stroke-width": 5, "circle-stroke-color": "rgba(16,185,129,.25)",
    },
  });
  map.addLayer({
    id: "live-cluster-count", type: "symbol", source: "live-halo", filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Noto Sans Regular"], "text-size": 11 },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "live-halo-pulse", type: "circle", source: "live-halo", filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": "#10B981", "circle-opacity": .35, "circle-radius": 10 },
  });
  map.addLayer({
    id: "live-halo-core", type: "circle", source: "live-halo", filter: ["!", ["has", "point_count"]],
    paint: { "circle-color": "#10B981", "circle-radius": 5, "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" },
  });
  map.on("click", "live-cluster", e => {
    const f = e.features[0];
    map.getSource("live-halo").getClusterExpansionZoom(f.properties.cluster_id).then(z =>
      map.easeTo({ center: f.geometry.coordinates, zoom: z + .4, duration: 600 }));
  });
  map.on("mouseenter", "live-cluster", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "live-cluster", () => (map.getCanvas().style.cursor = ""));
  map.on("click", "live-halo-core", e => {
    const r = RACES[e.features[0].properties.id];
    openDetail(r, true);
  });
  const hc = document.getElementById("hoverCard");
  map.on("mousemove", "live-halo-core", e => {
    const r = RACES[e.features[0].properties.id];
    map.getCanvas().style.cursor = "pointer";
    hc.innerHTML = `<div class="hc-name">${r.n}</div>
      <div class="hc-meta">${r.d} · ${r.c}<br><span style="color:#059669;font-weight:700">● LIVE lige nu</span></div>
      <div class="hc-hint">Klik og følg løbet →</div>`;
    hc.hidden = false;
  });
  map.on("mouseleave", "live-halo-core", () => { map.getCanvas().style.cursor = ""; hc.hidden = true; });

  // roligt åndedræt: sinus-kurve så glowet fader både ind og ud - intet hårdt loop-hop
  let t0 = performance.now();
  (function pulse(ts) {
    const p = ((ts - t0) % 2600) / 2600;
    try {
      map.setPaintProperty("live-halo-pulse", "circle-radius", 7 + p * 10);
      map.setPaintProperty("live-halo-pulse", "circle-opacity", .28 * Math.sin(p * Math.PI));
    } catch (_) { return; }
    requestAnimationFrame(pulse);
  })(t0);
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !livePanel.hidden) closeLive(); });
