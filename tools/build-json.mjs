/* Samler alle data/races*.js (web'ens globale RACES-array) til én delt data/races.json,
   som den native app konsumerer. Web og native deler dermed nøjagtig samme sandhed. */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

// samme rækkefølge som index.html (races.js definerer const RACES, resten RACES.push)
const FILER = [
  "races", "races-st", "races2", "races-nordics",
  "races-aims", "races-wm", "races-rid", "races-kondis", "races-rsu",
];

let kode = "";
for (const f of FILER) {
  try {
    kode += readFileSync(new URL(`../data/${f}.js`, import.meta.url), "utf8") + "\n";
  } catch (_) { console.warn("springer over (mangler):", f); }
}
kode += "\nRACES.forEach((r, i) => (r.id = i));\nglobalThis.__RACES = RACES;";

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(kode, ctx, { filename: "races-bundle.js" });

const races = ctx.__RACES;
if (!Array.isArray(races) || races.length < 100) {
  console.error("FEJL: kun", races?.length, "løb - afbryder (forventer 1000+)");
  process.exit(1);
}
writeFileSync(new URL("../data/races.json", import.meta.url), JSON.stringify(races));
console.log("races.json skrevet:", races.length, "løb");

// GeoJSON-variant til native MapLibre (URL-baseret kilde klynger pålideligt)
const geojson = {
  type: "FeatureCollection",
  features: races.map(r => ({
    type: "Feature",
    properties: { id: r.id, t: r.t },
    geometry: { type: "Point", coordinates: [r.lo, r.la] },
  })),
};
writeFileSync(new URL("../data/races.geojson", import.meta.url), JSON.stringify(geojson));
console.log("races.geojson skrevet:", geojson.features.length, "features");
