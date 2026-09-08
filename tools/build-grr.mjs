// build-grr.mjs - henter germanroadraces.de (WordPress + The Events Calendar REST API,
// /wp-json/tribe/events/v1/events). Rene JSON-events, men venues har kun by-navn (ingen
// koordinater) -> geokodes offline mod GeoNames cities500 (DE), som build-duv. Kuraterede
// tyske vejløb = fodfæste i DE. Mønsteret genbruges til andre Events-Calendar-kalendere.
// Kræver /tmp/cities500.txt (GeoNames). Kør: node tools/build-grr.mjs -> data/races-grr.js
import fs from "node:fs";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const IDAG = new Date().toISOString().slice(0, 10);
const API = "https://germanroadraces.de/wp-json/tribe/events/v1/events";
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. DE-by-indeks fra GeoNames (norm(navn) -> største by m. det navn i Tyskland)
const byIdx = new Map();
for (const line of fs.readFileSync("/tmp/cities500.txt", "utf8").split("\n")) {
  const c = line.split("\t");
  if (c.length < 15 || c[8] !== "DE") continue;
  const [, name, ascii, alt, lat, lon] = c;
  const pop = +c[14] || 0;
  const val = { la: +(+lat).toFixed(4), lo: +(+lon).toFixed(4), pop };
  for (const nm of new Set([ascii, name, ...(alt ? alt.split(",") : [])])) {
    const key = norm(nm);
    if (key.length < 2) continue;
    const ex = byIdx.get(key);
    if (!ex || pop > ex.pop) byIdx.set(key, val);
  }
}
console.log(`GeoNames DE: ${byIdx.size} by-nøgler`);

// 2. hent alle sider fra Events Calendar-API'et (kun kommende)
async function hentAlle() {
  const alle = [];
  for (let p = 1; p <= 60; p++) {
    const url = `${API}?per_page=50&page=${p}&start_date=${IDAG}`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) break;
    const d = await r.json();
    alle.push(...(d.events || []));
    if (!d.total_pages || p >= d.total_pages) break;
    await sleep(250);
  }
  return alle;
}

// 3. type + distance-label fra kategorier
function typ(cats) {
  const s = cats.map(c => c.toLowerCase()).join(" ")
    .replace(/halbmarathon/g, "halb").replace(/staffelmarathon/g, "staffel");
  if (/ultra|100 ?km|50 ?km|24[ -]?stunden|24h|6[ -]?stunden/.test(s)) return "ultra";
  if (/triathlon|duathlon|swimrun/.test(s)) return "tri";
  if (/halb|half/.test(s)) return "half";
  if (/marathon/.test(s)) return "marathon";
  return "kort";
}
function distLabel(cats, t) {
  const d = cats.filter(c => /\d+\s*km|marathon|halbmarathon|ultra|meile/i.test(c));
  if (d.length) return [...new Set(d)].slice(0, 3).join(" · ");
  return ({ kort: "Løb", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra", tri: "Triatlon" })[t];
}
const strip = s => (s || "").replace(/<[^>]+>/g, "").trim();
const IKKELØB = /stammtisch|mitglieder|sitzung|versammlung|treffen/i;

const raw = await hentAlle();
console.log(`GRR: ${raw.length} kommende events hentet`);

// 4. dedup mod eksisterende katalog
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

let ok = 0, ingenBy = 0, ingenGeo = 0, ikkeløb = 0, fortid = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const e of raw) {
  const navn = strip(e.title);
  const dato = (e.start_date || "").slice(0, 10);
  const cats = (e.categories || []).map(c => c.name);
  if (!navn || IKKELØB.test(navn) || cats.some(c => IKKELØB.test(c))) { ikkeløb++; continue; }
  if (!dato || dato < IDAG) { fortid++; continue; }
  const by = e.venue?.city;
  if (!by) { ingenBy++; continue; }
  const geo = byIdx.get(norm(by));
  if (!geo) { ingenGeo++; continue; }                          // ingen ren geokodning -> spring over (ærligt)
  const nøgle = norm(navn) + "|" + dato;
  if (seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }
  const t = typ(cats);
  ok++;
  out.push({
    n: navn, c: by, cc: "DE", co: "EU", la: geo.la, lo: geo.lo,
    t, d: distLabel(cats, t), m: dato.slice(0, 7), dt: dato, p: null,   // cost i EUR - vises ikke som kr
    u: strip(e.website) || e.url || null,
  });
}
console.log(`inkluderet: ${ok} | ikke-løb: ${ikkeløb} | uden by: ${ingenBy} | ingen geo: ${ingenGeo} | fortid: ${fortid} | dubletter: ${dubl}`);

const js = `// Autogenereret af tools/build-grr.mjs - kilde: germanroadraces.de (WP Events Calendar REST API)\n` +
  `// ${ok} kommende tyske vejløb, by geokodet mod GeoNames cities500. Link = arrangør/event-side.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-grr.js", js);
console.log(`FÆRDIG: data/races-grr.js (${ok} løb, ${(js.length / 1024).toFixed(0)} KB)`);
