/* Klynge-motor: egen supercluster + flydende merge/split-animation.
   MapLibres indbyggede clustering re-beregner klyngerne pr. heltalszoom uden
   overgang - to store cirkler "popper" til én. Her ejer vi klyngerne selv:
   ved zoom UD glider børnene ind i forældre-cirklen, ved zoom IND spalter
   forælderen flydende ud i sine børn. Selve indekset (supercluster) er det
   samme som MapLibre bruger internt - kun præsentationen er vores. */
"use strict";

const KS_RADIUS = 60, KS_MAXZOOM = 11;     // matcher det gamle clusterRadius/clusterMaxZoom
const KS_ANIM_MS = 260;
const KS_ANIM_LOFT = 1400;                 // flere features end dette = hårdt skift (perf-vagt)

let ksIndex = null;   // supercluster-indekset
let ksKort = null;    // maplibre-map
let ksZoom = 0;       // heltalszoom for det viste sæt
let ksVises = [];     // features som de står i kilden lige nu
let ksRAF = null;

const ksNøgle = f => f.properties.cluster ? "c" + f.properties.cluster_id : "p" + f.properties.id;
const ksEase = t => 1 - Math.pow(1 - t, 3);

function klyngeInit(map) {
  ksKort = map;
  map.on("zoom", ksVedZoom);
  map.on("moveend", () => { if (!ksRAF) ksRender(); }); // pan: fyld kanterne (padded bbox gør det næsten usynligt)
}

function klyngeSetData(features) {
  ksIndex = new Supercluster({ radius: KS_RADIUS, maxZoom: KS_MAXZOOM });
  ksIndex.load(features);
  ksRender();
}

// sync-erstatninger for kildens gamle async-API (bruges af klik/hover)
function klyngeExpansionZoom(id) { try { return ksIndex.getClusterExpansionZoom(id); } catch (_) { return ksZoom + 1; } }
function klyngeLeaves(id, n) { try { return ksIndex.getLeaves(id, n, 0); } catch (_) { return []; } }

/* bbox med en halv viewport luft hele vejen rundt, så pan-popping sker udenfor
   skærmen. På kloden (lavt zoom) er bounds upålidelige - tag hele verden. */
function ksBbox() {
  const z = ksKort.getZoom();
  if (z < 4) return [-180, -85, 180, 85];
  const b = ksKort.getBounds();
  const dx = (b.getEast() - b.getWest()) / 2, dy = (b.getNorth() - b.getSouth()) / 2;
  return [Math.max(-180, b.getWest() - dx), Math.max(-85, b.getSouth() - dy),
          Math.min(180, b.getEast() + dx), Math.min(85, b.getNorth() + dy)];
}

function ksAfbryd() { if (ksRAF) { cancelAnimationFrame(ksRAF); ksRAF = null; } }

function ksSætKilde(features) {
  const src = ksKort.getSource("races");
  if (src) src.setData({ type: "FeatureCollection", features });
}

function ksRender() {
  if (!ksIndex || !ksKort.getSource("races")) return;
  ksAfbryd();
  ksZoom = Math.floor(ksKort.getZoom());
  ksVises = ksIndex.getClusters(ksBbox(), ksZoom);
  ksSætKilde(ksVises);
}

function ksVedZoom() {
  if (!ksIndex || !ksKort.getSource("races")) return;
  const z = Math.floor(ksKort.getZoom());
  if (z === ksZoom) return;
  const gammel = ksZoom;
  // store spring (flyTo/intro), reduceret bevægelse eller for mange features: hårdt skift
  if (Math.abs(z - gammel) !== 1 || (typeof roligt !== "undefined" && roligt)) { ksRender(); return; }
  ksZoom = z;
  const nye = ksIndex.getClusters(ksBbox(), z);
  if (ksVises.length + nye.length > KS_ANIM_LOFT) { ksVises = nye; ksSætKilde(nye); return; }

  if (z < gammel) {
    // ZOOM UD: hvert gammelt feature glider hen i sin nye forælder, så skiftes til det nye sæt
    const mål = new Map();
    for (const p of nye) {
      if (!p.properties.cluster) continue;
      for (const barn of ksBørn(p.properties.cluster_id)) mål.set(ksNøgle(barn), p.geometry.coordinates);
    }
    ksTween(ksVises.map(f => ({ f, fra: f.geometry.coordinates, til: mål.get(ksNøgle(f)) || f.geometry.coordinates })), nye);
  } else {
    // ZOOM IND: nye features fødes i deres gamle forælders centrum og glider ud på plads
    const start = new Map();
    for (const g of ksVises) {
      if (!g.properties.cluster) continue;
      for (const barn of ksBørn(g.properties.cluster_id)) start.set(ksNøgle(barn), g.geometry.coordinates);
    }
    ksTween(nye.map(f => ({ f, fra: start.get(ksNøgle(f)) || f.geometry.coordinates, til: f.geometry.coordinates })), nye);
  }
}

function ksBørn(id) { try { return ksIndex.getChildren(id); } catch (_) { return []; } }

/* kør overgangen: interpolér koordinater pr. frame, land på slutSæt */
function ksTween(baner, slutSæt) {
  ksAfbryd();
  const src = ksKort.getSource("races");
  if (!src) return;
  const bevæger = baner.some(b => b.fra[0] !== b.til[0] || b.fra[1] !== b.til[1]);
  if (!bevæger) { ksVises = slutSæt; ksSætKilde(slutSæt); return; }
  const t0 = performance.now();
  const tik = ts => {
    const p = Math.min((ts - t0) / KS_ANIM_MS, 1), e = ksEase(p);
    ksVises = baner.map(({ f, fra, til }) => (fra === til) ? f : ({
      ...f,
      geometry: { type: "Point", coordinates: [fra[0] + (til[0] - fra[0]) * e, fra[1] + (til[1] - fra[1]) * e] },
    }));
    src.setData({ type: "FeatureCollection", features: ksVises });
    if (p < 1) ksRAF = requestAnimationFrame(tik);
    else { ksRAF = null; ksVises = slutSæt; ksSætKilde(slutSæt); }
  };
  ksRAF = requestAnimationFrame(tik);
}
