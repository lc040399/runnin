/* Klynge-motor: egen supercluster + flydende merge/split-animation.
   MapLibres indbyggede clustering re-beregner klyngerne pr. heltalszoom uden
   overgang - to store cirkler "popper" til én. Her ejer vi klyngerne selv:
   ved zoom UD glider børnene ind i forældre-cirklen, ved zoom IND spalter
   forælderen flydende ud i sine børn. Selve indekset (supercluster) er det
   samme som MapLibre bruger internt - kun præsentationen er vores.
   Fabrik, så både løbs-laget (brune) og live-laget (grønne) kører samme fysik. */
"use strict";

const KS_RADIUS = 60, KS_MAXZOOM = 11;     // matcher det gamle clusterRadius/clusterMaxZoom
const KS_ANIM_MS = 260;
const KS_ANIM_LOFT = 1400;                 // flere features end dette = hårdt skift (perf-vagt)

const ksNøgle = f => f.properties.cluster ? "c" + f.properties.cluster_id : "p" + f.properties.id;
const ksEase = t => 1 - Math.pow(1 - t, 3);

function opretKlyngeMotor(map, sourceId) {
  let index = null;
  let zInt = 0;         // heltalszoom for det viste sæt
  let vises = [];       // features som de står i kilden lige nu
  let raf = null;

  const src = () => map.getSource(sourceId);
  const afbryd = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };
  const sætKilde = features => { const s = src(); if (s) s.setData({ type: "FeatureCollection", features }); };
  const børn = id => { try { return index.getChildren(id); } catch (_) { return []; } };

  /* bbox med en halv viewport luft hele vejen rundt, så pan-popping sker udenfor
     skærmen. På kloden (lavt zoom) er bounds upålidelige - tag hele verden. */
  function bbox() {
    if (map.getZoom() < 4) return [-180, -85, 180, 85];
    const b = map.getBounds();
    const dx = (b.getEast() - b.getWest()) / 2, dy = (b.getNorth() - b.getSouth()) / 2;
    return [Math.max(-180, b.getWest() - dx), Math.max(-85, b.getSouth() - dy),
            Math.min(180, b.getEast() + dx), Math.min(85, b.getNorth() + dy)];
  }

  function render() {
    if (!index || !src()) return;
    afbryd();
    zInt = Math.floor(map.getZoom());
    vises = index.getClusters(bbox(), zInt);
    sætKilde(vises);
  }

  function vedZoom() {
    if (!index || !src()) return;
    const z = Math.floor(map.getZoom());
    if (z === zInt) return;
    const gammel = zInt;
    // store spring (flyTo/intro) eller reduceret bevægelse: hårdt skift
    if (Math.abs(z - gammel) !== 1 || (typeof roligt !== "undefined" && roligt)) { render(); return; }
    zInt = z;
    const nye = index.getClusters(bbox(), z);
    if (vises.length + nye.length > KS_ANIM_LOFT) { afbryd(); vises = nye; sætKilde(nye); return; }

    if (z < gammel) {
      // ZOOM UD: hvert gammelt feature glider hen i sin nye forælder, så skiftes til det nye sæt
      const mål = new Map();
      for (const p of nye) {
        if (!p.properties.cluster) continue;
        for (const barn of børn(p.properties.cluster_id)) mål.set(ksNøgle(barn), p.geometry.coordinates);
      }
      tween(vises.map(f => ({ f, fra: f.geometry.coordinates, til: mål.get(ksNøgle(f)) || f.geometry.coordinates })), nye);
    } else {
      // ZOOM IND: nye features fødes i deres gamle forælders centrum og glider ud på plads
      const start = new Map();
      for (const g of vises) {
        if (!g.properties.cluster) continue;
        for (const barn of børn(g.properties.cluster_id)) start.set(ksNøgle(barn), g.geometry.coordinates);
      }
      tween(nye.map(f => ({ f, fra: start.get(ksNøgle(f)) || f.geometry.coordinates, til: f.geometry.coordinates })), nye);
    }
  }

  /* kør overgangen: interpolér koordinater pr. frame, land på slutSæt */
  function tween(baner, slutSæt) {
    afbryd();
    const s = src();
    if (!s) return;
    const bevæger = baner.some(b => b.fra[0] !== b.til[0] || b.fra[1] !== b.til[1]);
    if (!bevæger) { vises = slutSæt; sætKilde(slutSæt); return; }
    const t0 = performance.now();
    const tik = ts => {
      const p = Math.min((ts - t0) / KS_ANIM_MS, 1), e = ksEase(p);
      vises = baner.map(({ f, fra, til }) => (fra === til) ? f : ({
        ...f,
        geometry: { type: "Point", coordinates: [fra[0] + (til[0] - fra[0]) * e, fra[1] + (til[1] - fra[1]) * e] },
      }));
      s.setData({ type: "FeatureCollection", features: vises });
      if (p < 1) raf = requestAnimationFrame(tik);
      else { raf = null; vises = slutSæt; sætKilde(slutSæt); }
    };
    raf = requestAnimationFrame(tik);
  }

  map.on("zoom", vedZoom);
  map.on("moveend", () => { if (!raf) render(); }); // pan: fyld kanterne (padded bbox gør det næsten usynligt)

  return {
    setData(features) {
      index = new Supercluster({ radius: KS_RADIUS, maxZoom: KS_MAXZOOM });
      index.load(features);
      render();
    },
    expansionZoom(id) { try { return index.getClusterExpansionZoom(id); } catch (_) { return zInt + 1; } },
    leaves(id, n) { try { return index.getLeaves(id, n, 0); } catch (_) { return []; } },
  };
}

/* løbs-lagets motor: samme API som før, så app.js er urørt */
let ksRaceMotor = null;
function klyngeInit(map) { ksRaceMotor = opretKlyngeMotor(map, "races"); }
function klyngeSetData(features) { ksRaceMotor.setData(features); }
function klyngeExpansionZoom(id) { return ksRaceMotor.expansionZoom(id); }
function klyngeLeaves(id, n) { return ksRaceMotor.leaves(id, n); }
