// Henter kommende løb fra RunSignups åbne API (https://runsignup.com/API) og bygger data/races-rsu.js.
// Koordinater via GeoNames' gratis zip-database (download US.zip → /tmp/US.txt før kørsel).
// Kør: node tools/build-rsu.mjs [antalSider]  (1000 løb pr. side)
import { readFileSync, writeFileSync } from "fs";

const SIDER = +(process.argv[2] || 4);

// zip → [lat, lng]
const zipDb = new Map();
for (const linje of readFileSync("/tmp/US.txt", "utf8").split("\n")) {
  const f = linje.split("\t");
  if (f[1]) zipDb.set(f[1], [parseFloat(f[9]), parseFloat(f[10])]);
}
console.log("GeoNames zips:", zipDb.size);

function klassificer(navn) {
  const n = navn.toLowerCase();
  if (/ultra|backyard|100k|50k|50 ?mile|100 ?mile|trail/.test(n)) return ["ultra", "Ultra & trail"];
  if (/triathlon|duathlon|ironman/.test(n)) return ["tri", "Triatlon"];
  if (/marathon|26\.2/.test(n) && !/half|1\/2|½/.test(n)) return ["marathon", "42,2 km"];
  if (/half|1\/2|½|13\.1|21k/.test(n)) return ["half", "21,1 km"];
  if (/10k/.test(n)) return ["kort", "10 km"];
  if (/5k/.test(n)) return ["kort", "5 km"];
  return ["kort", "Løb"];
}

// API'et capper ved 1.000 resultater pr. forespørgsel → skær i måneds-vinduer
const vinduer = [];
const nu = new Date();
for (let i = 0; i < 9; i++) {
  const fra = new Date(nu.getFullYear(), nu.getMonth() + i, i === 0 ? nu.getDate() : 1);
  const til = new Date(nu.getFullYear(), nu.getMonth() + i + 1, 0);
  const f = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  vinduer.push([f(fra), f(til)]);
}

const alle = [];
const set = new Set();
const MAKS = 5000;
for (const [fra, til] of vinduer) {
  if (alle.length >= MAKS) break;
  const url = `https://runsignup.com/rest/races?format=json&results_per_page=1000&page=1&start_date=${fra}&end_date=${til}`;
  const data = await (await fetch(url)).json();
  const races = data.races || [];
  console.log(`${fra} → ${til}: ${races.length} løb`);
  if (!races.length) continue;
  for (const { race: r } of races) {
    if (r.is_draft_race === "T" || r.is_private_race === "T" || !r.next_date) continue;
    const adr = r.address || {};
    if ((adr.country_code || "US") !== "US") continue; // GeoNames-db'en her dækker USA
    const zip = (adr.zipcode || "").slice(0, 5);
    const koord = zipDb.get(zip);
    if (!koord || Number.isNaN(koord[0])) continue;
    const [mm, dd, yyyy] = r.next_date.split("/");
    if (!yyyy) continue;
    const dt = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const navn = r.name.replace(/\s+/g, " ").trim();
    if (set.has(navn)) continue;
    set.add(navn);
    const [t, d] = klassificer(navn);
    // deterministisk jitter så samme-zip-løb ikke stakker
    const h = [...navn].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
    alle.push([
      navn.slice(0, 80),
      adr.city || "USA",
      +(koord[0] + ((h % 100) - 50) / 5000).toFixed(4),
      +(koord[1] + (((h >>> 7) % 100) - 50) / 4000).toFixed(4),
      t, d, dt,
      r.url.replace("https://runsignup.com", ""),
    ]);
  }
}

alle.sort((a, b) => a[6].localeCompare(b[6]));
const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-rsu.js",
  `// Autogenereret af tools/build-rsu.mjs - kilde: RunSignups åbne API (${alle.length} løb, USA)\n` +
  `// Kompakt format: [navn, by, lat, lng, type, distance, dato, url-sti]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1], cc: "US", co: "NA", la: a[2], lo: a[3], t: a[4], d: a[5], m: a[6].slice(0, 7), dt: a[6], p: null, u: "https://runsignup.com" + a[7] });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: ${alle.length} løb skrevet til data/races-rsu.js`);
