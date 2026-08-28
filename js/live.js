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

/* ---------- rute-generator: blød lukket sløjfe omkring løbets by ---------- */
function makeRoute(lo, la) {
  const pts = [];
  const N = 160, baseR = 0.016; // ~1,5-2 km radius
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const wobble = 1 + 0.28 * Math.sin(a * 3 + 1.3) + 0.14 * Math.sin(a * 7 + 0.5);
    pts.push([lo + Math.cos(a) * baseR * wobble * 1.6, la + Math.sin(a) * baseR * wobble]);
  }
  return pts;
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
      navn, bib: 100 + ((h >> 4) % 880),
      fart: 0.82 + ((h % 1000) / 1000) * 0.36,   // relativ fart
      prog: 0.04 + ((h >> 10) % 1000) / 1000 * 0.55, // feltet er spredt ud ved start af visning
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
    paint: { "line-color": "#FF5A5F", "line-width": 3.5, "line-opacity": .8 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
  map.addLayer({
    id: "live-runner-dots", type: "circle", source: "live-runners",
    paint: {
      "circle-color": ["case", ["get", "leader"], "#FF5A5F", "#10B981"],
      "circle-radius": ["case", ["get", "leader"], 6.5, 4.5],
      "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff",
    },
  });
}
function clearLiveLayers() {
  for (const id of ["live-runner-dots", "live-route-line"]) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ["live-runners", "live-route"]) if (map.getSource(id)) map.removeSource(id);
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
  const speedPerSec = 1 / (sim.simMin * 60 / 24); // tidsforkortet ×24
  let changed = false;

  for (const r of sim.runners) {
    if (r.done) continue;
    r.prog += speedPerSec * r.fart * dt;
    if (r.prog >= 1) {
      r.prog = 1; r.done = true; changed = true;
      r.tid = fmtTid(sim.simMin / r.fart);
      sim.feed.unshift({ navn: r.navn, bib: r.bib, tid: r.tid });
    }
  }

  const feats = sim.runners.filter(r => !r.done).map((r, idx) => ({
    type: "Feature",
    properties: { leader: r === lederen() },
    geometry: { type: "Point", coordinates: alongRoute(sim.route, r.prog) },
  }));
  map.getSource("live-runners")?.setData({ type: "FeatureCollection", features: feats });

  if (changed || Math.floor(ts / 900) !== Math.floor((ts - dt * 1000) / 900)) renderLivePanel();
  sim.raf = requestAnimationFrame(tick);
}
const lederen = () => sim.runners.filter(r => !r.done).sort((a, b) => b.prog - a.prog)[0];

/* ---------- panel ---------- */
const livePanel = document.getElementById("livePanel");

function renderLivePanel() {
  const top = sim.runners.filter(r => !r.done).sort((a, b) => b.prog - a.prog).slice(0, 5);
  const iMål = sim.runners.filter(r => r.done).length;

  livePanel.innerHTML = `
    <div class="live-head">
      <span class="live-badge"><i></i>LIVE</span>
      <h2>${sim.race.n}</h2>
      <button class="close" id="liveClose" aria-label="Luk">✕</button>
    </div>
    <div class="live-stats">
      <div><strong>${sim.runners.length - iMål}</strong><span>på ruten</span></div>
      <div><strong>${iMål}</strong><span>i mål</span></div>
      <div><strong>${sim.distKm} km</strong><span>rute</span></div>
    </div>
    <div class="live-sec">Førende lige nu</div>
    ${top.map((r, i) => `
      <div class="live-row">
        <span class="live-pos">${i + 1}</span>
        <div class="live-main">
          <div class="live-navn">${r.navn} <span class="live-bib">#${r.bib}</span></div>
          <div class="live-bar"><i style="width:${(r.prog * 100).toFixed(1)}%"></i></div>
        </div>
        <span class="live-km">${(r.prog * sim.distKm).toFixed(1)} km</span>
      </div>`).join("")}
    <div class="live-sec">Målstregen</div>
    <div class="live-feed">
      ${sim.feed.slice(0, 8).map(f => `<div class="feed-item"><span>🏁</span><div><strong>${f.navn}</strong> <span class="live-bib">#${f.bib}</span> kom i mål</div><span class="feed-tid">${f.tid}</span></div>`).join("") || `<div class="feed-tom">Ingen i mål endnu - følg med her.</div>`}
    </div>
    <p class="foto-note">Demo: LIVE-status er ægte (løbet afholdes i dag iflg. Sportstiming), men løberne er en simulation, ×24 hastighed.</p>`;
  document.getElementById("liveClose").onclick = closeLive;
}

/* ---------- åbn/luk ---------- */
function openLive(race) {
  closeLive();
  sim.race = race;
  sim.route = makeRoute(race.lo, race.la);
  sim.lastTick = 0;
  seedRunners(race);
  ensureLiveLayers();
  map.getSource("live-route").setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sim.route } });
  detail.hidden = true; closePanel(); setTab("kort");
  map.flyTo({ center: [race.lo, race.la], zoom: 12.3, duration: 1600, essential: true });
  livePanel.hidden = false;
  renderLivePanel();
  sim.raf = requestAnimationFrame(tick);
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

  // pulserende grøn halo på live-løb på kortet
  map.addSource("live-halo", {
    type: "geojson",
    data: { type: "FeatureCollection", features: liveRaces.map(r => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: [r.lo, r.la] } })) },
  });
  map.addLayer({
    id: "live-halo-pulse", type: "circle", source: "live-halo",
    paint: { "circle-color": "#10B981", "circle-opacity": .35, "circle-radius": 10 },
  }, "clusters");
  map.addLayer({
    id: "live-halo-core", type: "circle", source: "live-halo",
    paint: { "circle-color": "#10B981", "circle-radius": 5, "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" },
  });
  map.on("click", "live-halo-core", e => {
    const r = RACES[e.features[0].properties.id];
    openDetail(r, true);
  });
  map.on("mouseenter", "live-halo-core", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "live-halo-core", () => (map.getCanvas().style.cursor = ""));

  let t0 = performance.now();
  (function pulse(ts) {
    const p = ((ts - t0) % 1800) / 1800;
    try {
      map.setPaintProperty("live-halo-pulse", "circle-radius", 6 + p * 16);
      map.setPaintProperty("live-halo-pulse", "circle-opacity", .4 * (1 - p));
    } catch (_) { return; }
    requestAnimationFrame(pulse);
  })(t0);
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !livePanel.hidden) closeLive(); });
