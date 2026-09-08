/* Samler alle data/races*.js (web'ens globale RACES-array) til én delt data/races.json,
   som den native app konsumerer. Web og native deler dermed nøjagtig samme sandhed.
   Dedup ved merge: samme løb fra flere kilder (aggregatorer overlapper) fjernes, så
   hvert løb kun står ÉN gang. Beholder-regel: kommende > kilde-prioritet > eksakt dato
   > tidligst. FILER-rækkefølgen = prioritet (kuraterede først, aggregatorer sidst). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

// samme rækkefølge som index.html (races.js definerer const RACES, resten RACES.push)
const FILER = [
  "races", "races-st", "races2", "races-nordics",
  "races-aims", "races-wm", "races-rid", "races-kondis", "races-grr", "races-rsu", "races-duv", "races-parkrun",
  "races-findarace", "races-endu", "races-finishers", "races-community",
];

// byg kode med kilde-markører (RACES.length efter hver fil → prioritets-index pr. løb)
let kode = "globalThis.__marks = [];\n";
for (const f of FILER) {
  try {
    kode += readFileSync(new URL(`../data/${f}.js`, import.meta.url), "utf8") + "\n";
    kode += `__marks.push(RACES.length);\n`;
  } catch (_) { console.warn("springer over (mangler):", f); kode += `__marks.push(RACES.length);\n`; }
}
kode += "\nglobalThis.__RACES = RACES;";

const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(kode, ctx, { filename: "races-bundle.js" });

let races = ctx.__RACES;
const marks = ctx.__marks;   // kumulative længder pr. kilde
if (!Array.isArray(races) || races.length < 100) {
  console.error("FEJL: kun", races?.length, "løb - afbryder (forventer 1000+)");
  process.exit(1);
}

// kilde-prioritet pr. løb (0 = højest = kurateret)
{
  let src = 0;
  races.forEach((r, i) => { while (src < marks.length && i >= marks[src]) src++; r._src = src; });
}

// ---- dedup ----
const IDAG = new Date().toISOString().slice(0, 10);
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/20\d\d/g, "").replace(/[^a-z0-9]/g, "");
const celle = (la, lo) => Math.round(la * 5) / 5 + "," + Math.round(lo * 5) / 5;   // ~0,2° ~22 km
const kommende = r => {
  if (r.dt && r.dt.length === 10) return r.dt >= IDAG;
  if (r.m && r.m.length === 7) return r.m + "-31" >= IDAG;
  return true;                                   // udateret → behandl som kommende
};
const effDato = r => r.dt || (r.m ? r.m + "-15" : "9999-99-99");
// bedst-i-klyngen: kommende først, så kilde-prioritet, så eksakt dato, så tidligst
const bedre = (a, b) => {
  if (kommende(a) !== kommende(b)) return kommende(a) ? a : b;
  if (a._src !== b._src) return a._src < b._src ? a : b;
  const ad = !!(a.dt && a.dt.length === 10), bd = !!(b.dt && b.dt.length === 10);
  if (ad !== bd) return ad ? a : b;
  return effDato(a) <= effDato(b) ? a : b;
};

const fjernet = new Set();
function dedupPass(nøgle) {
  const grupper = new Map();
  races.forEach((r, i) => {
    if (fjernet.has(i)) return;
    const k = nøgle(r);
    if (!k) return;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(i);
  });
  for (const idxs of grupper.values()) {
    if (idxs.length < 2) continue;
    let beholdIdx = idxs[0];
    for (const i of idxs) if (bedre(races[i], races[beholdIdx]) === races[i]) beholdIdx = i;
    for (const i of idxs) if (i !== beholdIdx) fjernet.add(i);
  }
}
// Pass 1: samme norm-navn + geo-celle (fanger formaterings- og dato-varianter samme sted)
dedupPass(r => norm(r.n).length >= 4 ? norm(r.n) + "@" + celle(r.la, r.lo) : null);
// Pass 2: samme norm-navn + land + eksakt dato (fanger samme event m. afvigende koordinater)
dedupPass(r => (norm(r.n).length >= 4 && r.dt && r.cc) ? norm(r.n) + "|" + r.cc + "|" + r.dt : null);

const før = races.length;
races = races.filter((_, i) => !fjernet.has(i));
races.forEach((r, i) => { r.id = i; delete r._src; });
console.log(`dedup: ${før} → ${races.length} løb (${før - races.length} dubletter fjernet)`);

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
