/* Runnin LIVE - løb der er i gang lige nu.
   ALT her er ægte: hvilke løb der er LIVE (dt == i dag), arrangørens officielle
   rute NÅR vi har den (data/ruter/), og resultater fra RunSignups åbne API.
   Ingen simulerede løbere, ingen illustrative ruter - vis kun hvad vi kan bevise. */
"use strict";

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Vi kender ingen starttider, så "i gang" = løbsdag OG dagtimer (7-17) på løbsstedet.
// Lokal klokketime estimeres fra længdegraden (15° ≈ 1 time) - så er US-løb live i
// vores aften, og et dansk morgenløb står ikke som i gang ved midnat.
const stedTime = r => {
  const d = new Date();
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 + r.lo / 15) % 24) + 24) % 24;
};
const erLøbsdag = r => r.dt === todayISO();
const isLive = r => erLøbsdag(r) && stedTime(r) >= 7 && stedTime(r) < 17;

/* ---------- depoter/stationer på officielle ruter ---------- */
window.visRuteStationer = function (rute) {
  fjernRuteStationer();
  if (!rute?.stationer?.length) return;
  map.addSource("rute-stationer", {
    type: "geojson",
    data: { type: "FeatureCollection", features: rute.stationer.map(st => ({
      type: "Feature", properties: { navn: st.navn, km: st.km }, geometry: { type: "Point", coordinates: [st.lo, st.la] },
    })) },
  });
  map.addLayer({
    id: "rute-station-prik", type: "circle", source: "rute-stationer",
    minzoom: 8, // depoter er nærkamps-info - ikke synlige fra verdensrummet
    paint: { "circle-color": "#ffffff", "circle-radius": 5.5, "circle-stroke-width": 2.5, "circle-stroke-color": "#C05800" },
  });
  map.addLayer({
    id: "rute-station-navn", type: "symbol", source: "rute-stationer",
    minzoom: 9, // navne + km først når man er helt tæt på
    layout: {
      "text-field": ["format", ["get", "navn"], {}, "\n", {}, ["concat", ["to-string", ["get", "km"]], " km"], { "font-scale": 0.85 }],
      "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: { "text-color": "#38240D", "text-halo-color": "#F5F3EE", "text-halo-width": 1.6 },
  });
};
window.fjernRuteStationer = function () {
  for (const id of ["rute-station-navn", "rute-station-prik"]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource("rute-stationer")) map.removeSource("rute-stationer");
};

/* højdeprofil som lille SVG-områdekurve med depot-mærker */
window.byggProfilSvg = function (rute) {
  if (!rute?.højde?.length) return "";
  const H = rute.højde, W = 100, HØJ = 34;
  const min = Math.min(...H), max = Math.max(...H), spænd = Math.max(max - min, 1);
  const x = i => (i / (H.length - 1)) * W;
  const y = h => HØJ - 3 - ((h - min) / spænd) * (HØJ - 8);
  const linje = H.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h).toFixed(1)}`).join("");
  const km = rute.km || 1;
  const mærker = (rute.stationer || []).map(st => {
    const i = Math.round((st.km / km) * (H.length - 1));
    return `<circle cx="${x(Math.min(i, H.length - 1)).toFixed(1)}" cy="${y(H[Math.min(i, H.length - 1)]).toFixed(1)}" r="1.7" class="profil-station"/>`;
  }).join("");
  return `<svg class="profil" viewBox="0 0 ${W} ${HØJ}" preserveAspectRatio="none">
    <path d="${linje} L${W},${HØJ} L0,${HØJ} Z" class="profil-flade"/>
    <path d="${linje}" class="profil-linje"/>${mærker}</svg>`;
};

/* ---------- live-tilstand (kun ægte data) ---------- */
const live = { race: null, officiel: null };

/* ---------- kort-lag: kun den officielle rute (aldrig en opdigtet) ---------- */
function ensureRouteLayer() {
  if (map.getSource("live-route")) return;
  map.addSource("live-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "live-route-line", type: "line", source: "live-route",
    paint: { "line-color": "#C05800", "line-width": 3.5, "line-opacity": .85 },
    layout: { "line-cap": "round", "line-join": "round" },
  });
}
function clearLiveLayers() {
  fjernRuteStationer();
  if (map.getLayer("live-route-line")) map.removeLayer("live-route-line");
  if (map.getSource("live-route")) map.removeSource("live-route");
}

/* ---------- ÆGTE resultater via RunSignup (server-side proxy - de stripper CORS-svar) ---------- */
async function hentÆgteResultater(race) {
  if (!race.rsid) return null;
  try {
    const d = await (await fetch(`/api/resultater?rsid=${race.rsid}`, { signal: AbortSignal.timeout(8000) })).json();
    return d.results?.length ? d.results : null;
  } catch (_) { return null; }
}

/* ---------- åbn/luk ---------- */
async function openLive(race) {
  closeLive();
  live.race = race;
  live.officiel = null;
  detail.hidden = true; closePanel(); setTab("kort");
  livePanel.hidden = false;
  livePanel.innerHTML = `<div class="live-head"><span class="live-badge"><i></i>LIVE</span><h2>${race.n}</h2></div><div class="feed-tom" style="padding:16px 0">Åbner løbet…</div>`;

  // officiel rute? kun hvis vi faktisk har den liggende
  try {
    const r = await fetch(`data/ruter/${slug(race.n)}.json`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) live.officiel = await r.json();
  } catch (_) {}
  if (live.race !== race) return; // lukket imens

  ensureRouteLayer();
  if (live.officiel?.punkter?.length) {
    const punkter = live.officiel.punkter;
    map.getSource("live-route").setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: punkter } });
    visRuteStationer(live.officiel);
    const lons = punkter.map(p => p[0]), lats = punkter.map(p => p[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: { top: 90, bottom: 60, left: 60, right: innerWidth > 720 ? 440 : 60 }, duration: 1600, essential: true });
  } else {
    // ingen ægte rute → tegn ingenting, flyv bare til stedet
    map.getSource("live-route").setData({ type: "FeatureCollection", features: [] });
    fjernRuteStationer();
    map.flyTo({ center: [race.lo, race.la], zoom: Math.max(map.getZoom(), 11), duration: 1400, essential: true });
  }

  buildLivePanel(race);

  // RunSignup-løb: hent ÆGTE resultater i baggrunden
  hentÆgteResultater(race).then(res => {
    if (live.race !== race) return;
    visÆgteResultater(res);
  });
}

function buildLivePanel(race) {
  const o = live.officiel;
  livePanel.innerHTML = `
    <div class="live-head">
      <span class="live-badge"><i></i>LIVE</span>
      <h2>${race.n}</h2>
      <button class="close" id="liveClose" aria-label="Luk">✕</button>
    </div>
    <div class="live-stats">
      <div><strong>${race.d}</strong><span>distance</span></div>
      <div><strong>${race.c} ${flag(race.cc)}</strong><span>sted</span></div>
      ${o?.km ? `<div><strong>${o.km} km</strong><span>officiel rute</span></div>` : ""}
    </div>
    ${o?.højde?.length ? `
      <div class="live-sec">Højdeprofil <span class="w-src">+${(o.stigning || 0).toLocaleString("da-DK")} m stigning</span></div>
      ${byggProfilSvg(o)}
      ${o.stationer?.length ? `<div class="depot-liste">${o.stationer.map(st =>
        `<span class="depot"><i></i>${st.navn} <b>${st.km} km</b></span>`).join("")}</div>` : ""}` : ""}
    <div class="live-sec">Resultater</div>
    <div id="liveResultater"><div class="feed-tom">${race.rsid ? "Henter resultater…" : "Live-resultater vises her, når arrangøren offentliggør dem."}</div></div>
    <a class="cta" href="${race.u}" target="_blank" rel="noopener">Se løbet hos arrangøren <span>→</span></a>
    <p class="foto-note">LIVE-status er ægte: løbet afholdes i dag. ${o
      ? `Ruten er arrangørens officielle. Kilde: ${o.kilde || "officiel"}.`
      : `Vi har ikke arrangørens officielle rutekort for dette løb - find det hos arrangøren.`}</p>`;
  document.getElementById("liveClose").onclick = closeLive;
}

function visÆgteResultater(res) {
  const box = document.getElementById("liveResultater");
  if (!box) return;
  if (!res?.length) {
    box.innerHTML = `<div class="feed-tom">Ingen resultater endnu - de dukker op her, når de første er i mål.</div>`;
    return;
  }
  const top = res.slice(0, 5);
  const senest = res.slice(-8).reverse();
  box.innerHTML = `
    <div class="live-under">Top 5 · <span style="color:#059669">ægte data fra RunSignup</span></div>
    ${top.map(r => `
      <div class="live-row" style="position:static;height:auto;padding:8px 0">
        <span class="live-pos">${r.plac}</span>
        <div class="live-main"><div class="live-navn">${r.navn} <span class="live-bib">#${r.bib}</span></div></div>
        <span class="feed-tid">${r.tid}</span>
      </div>`).join("")}
    <div class="live-under" style="margin-top:12px">Senest i mål</div>
    <div class="live-feed">
      ${senest.map(r => `<div class="feed-item"><span>🏁</span><div><strong>${r.navn}</strong> <span class="live-bib">#${r.bib}</span></div><span class="feed-tid">${r.tid}</span></div>`).join("")}
    </div>`;
}

function closeLive() {
  live.race = null; live.officiel = null;
  livePanel.hidden = true;
  clearLiveLayers();
}
const livePanel = document.getElementById("livePanel");

/* ---------- live-menu: dropdown med de aktive løb ---------- */
let liveMenuEl = null;
function lukLiveMenu() { if (liveMenuEl) { liveMenuEl.remove(); liveMenuEl = null; } }

function åbnLiveMenu(pill) {
  lukLiveMenu();
  const liveRaces = RACES.filter(isLive).sort((a, b) => a.n.localeCompare(b.n, "da"));
  if (!liveRaces.length) return;
  const rect = pill.getBoundingClientRect();
  liveMenuEl = document.createElement("div");
  liveMenuEl.className = "live-menu";
  liveMenuEl.style.top = rect.bottom + 8 + "px";
  liveMenuEl.style.left = Math.max(12, rect.left) + "px";
  liveMenuEl.innerHTML = liveRaces.map(r => `
    <button data-n="${r.n.replace(/"/g, "&quot;")}">
      <i class="live-dot"></i>
      <span class="lm-navn">${r.n}</span>
      <span class="lm-sted">${r.c} ${flag(r.cc)}</span>
    </button>`).join("");
  document.body.appendChild(liveMenuEl);
  liveMenuEl.querySelectorAll("button").forEach(b => b.onclick = () => {
    const r = RACES.find(x => x.n === b.dataset.n);
    lukLiveMenu();
    if (r) openLive(r);
  });
  // luk når musen forlader både pill og menu (desktop-hover)
  liveMenuEl.addEventListener("mouseleave", e => {
    if (!pill.contains(e.relatedTarget)) lukLiveMenu();
  });
}
document.addEventListener("click", e => {
  if (liveMenuEl && !liveMenuEl.contains(e.target) && !e.target.closest("#livePill")) lukLiveMenu();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") lukLiveMenu(); });

/* ---------- puls på live-prikker + live-pill ---------- */
function initLiveUI() {
  const liveRaces = RACES.filter(isLive);
  const pill = document.getElementById("livePill");
  if (liveRaces.length) {
    pill.hidden = false;
    pill.innerHTML = `<i class="live-dot"></i> <strong>${liveRaces.length} løb</strong>&nbsp;i gang lige nu <span class="live-cta">Følg live →</span>`;
    pill.onclick = () => (liveMenuEl ? lukLiveMenu() : åbnLiveMenu(pill));
    pill.onmouseenter = () => åbnLiveMenu(pill);
    pill.onmouseleave = e => {
      // kun luk hvis musen ikke er på vej ned i menuen
      setTimeout(() => { if (liveMenuEl && !liveMenuEl.matches(":hover") && !pill.matches(":hover")) lukLiveMenu(); }, 120);
    };
  } else { pill.hidden = true; lukLiveMenu(); }

  // idempotent: ved genkald (fx når USA-kataloget lander) opdateres kildedata blot
  const eksisterende = map.getSource("live-halo");
  if (eksisterende) {
    eksisterende.setData({ type: "FeatureCollection", features: liveRaces.map(r => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: [r.lo, r.la] } })) });
    return;
  }
  if (!liveRaces.length) return; // ingen lag før der er noget at vise

  // live-løb klynger som resten af kortet - grønne klynger på lavt zoom, pulserende prikker tæt på
  map.addSource("live-halo", {
    type: "geojson", cluster: true, clusterMaxZoom: 11, clusterRadius: 60,
    data: { type: "FeatureCollection", features: liveRaces.map(r => ({ type: "Feature", properties: { id: r.id }, geometry: { type: "Point", coordinates: [r.lo, r.la] } })) },
  });
  map.addLayer({
    id: "live-cluster", type: "circle", source: "live-halo", filter: ["has", "point_count"],
    paint: {
      "circle-color": "#10B981",
      "circle-radius": ["step", ["get", "point_count"], 12, 15, 15, 60, 18, 250, 22],
      "circle-stroke-width": 3, "circle-stroke-color": "rgba(16,185,129,.25)",
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
  // hover på grøn live-klynge: samme forsmag som de brune klynger
  let hoverLiveKlynge = null;
  map.on("mousemove", "live-cluster", async e => {
    if (typeof overlayÅben === "function" && overlayÅben()) { hoverCard.hidden = true; return; }
    const f = e.features[0];
    map.getCanvas().style.cursor = "pointer";
    const id = f.properties.cluster_id;
    if (hoverLiveKlynge === id && !hoverCard.hidden) { positionHover(e.point); return; }
    hoverLiveKlynge = id;
    const leaves = await map.getSource("live-halo").getClusterLeaves(id, 7, 0);
    if (hoverLiveKlynge !== id) return; // musen er videre
    const races = leaves.map(l => RACES[l.properties.id]).filter(Boolean);
    const rest = f.properties.point_count - races.length;
    hoverCard.innerHTML =
      `<div class="hc-name"><i class="live-dot"></i> ${f.properties.point_count} løb i gang</div>
       <div class="hc-liste">${races.map(r =>
         `<div><i style="background:#10B981"></i><span class="hc-l-navn">${r.n}</span><span class="hc-l-dato">${r.c} ${flag(r.cc)}</span></div>`).join("")}</div>
       ${rest > 0 ? `<div class="hc-meta">+ ${rest} flere</div>` : ""}
       <div class="hc-hint">Klik for at zoome ind →</div>`;
    hoverCard.hidden = false;
    positionHover(e.point);
  });
  map.on("mouseleave", "live-cluster", () => {
    hoverLiveKlynge = null;
    hoverCard.hidden = true;
    map.getCanvas().style.cursor = "";
  });
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
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; // statiske prikker er nok
  let t0 = performance.now();
  (function pulse(ts) {
    const p = ((ts - t0) % 2600) / 2600;
    try {
      map.setPaintProperty("live-halo-pulse", "circle-radius", 7 + p * 10);
      map.setPaintProperty("live-halo-pulse", "circle-opacity", Math.max(0, .28 * Math.sin(p * Math.PI)));
    } catch (_) { return; }
    requestAnimationFrame(pulse);
  })(t0);
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !livePanel.hidden) closeLive(); });
