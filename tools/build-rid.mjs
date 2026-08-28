// Henter nordiske løb fra RaceID (raceid.com - robots.txt tillader alt; vi linker
// tilbage til deres tilmelding, samme link-ud-model som resten af Runnin).
// Endpoint: POST /api/v1/web/search-route (deres eget kort-API, alle løb i ét kald).
// Kør: node tools/build-rid.mjs
import { readFileSync, writeFileSync } from "fs";

const SPORTS = { 3: "løb", 63: "trail", 74: "backyard", 6: "tri" };
const LAND = {
  "Sweden": "SE", "Sverige": "SE", "Norway": "NO", "Norge": "NO", "Denmark": "DK", "Danmark": "DK",
  "Finland": "FI", "Suomi": "FI", "Iceland": "IS", "Island": "IS", "Åland Islands": "FI", "Åland": "FI",
  "Faroe Islands": "FO", "Greenland": "GL", "Grønland": "GL",
};

// dedupe mod alt vi allerede har (ST har fx nogle SE/NO-løb)
const norm = n => n.toLowerCase().replace(/\s*\d{4}\s*$/, "").replace(/[^a-zæøåäö0-9]/g, "");
const kendte = new Set();
for (const fil of ["data/races.js", "data/races-st.js", "data/races2.js"]) {
  for (const m of readFileSync(fil, "utf8").matchAll(/"?n"?\s*:\s*"([^"]+)"/g)) kendte.add(norm(m[1]));
}

function klassificer(sportId, distancer, navn) {
  if (sportId === 6) return ["tri", "Triatlon"];
  if (sportId === 63 || sportId === 74) return ["ultra", "Trail"];
  const n = navn.toLowerCase();
  if (/ultra|backyard/.test(n)) return ["ultra", "Trail"];
  const max = Math.max(0, ...distancer.map(d => d.race_length || 0));
  if (max >= 50000) return ["ultra", `${Math.round(max / 1000)} km`];
  if (max >= 41000) return ["marathon", "42,2 km"];
  if (max >= 20000) return ["half", "21,1 km"];
  if (max >= 1000) return ["kort", `${(max / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} km`];
  return ["kort", "Løb"];
}

const iDag = new Date().toISOString().slice(0, 10);
const alle = [];
const set = new Set();
for (const [sportId, _] of Object.entries(SPORTS)) {
  const r = await fetch("https://api.raceid.com/api/v1/web/search-route?limit=10000", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Runnin race calendar; kontakt: github.com/lc040399/runnin)" },
    body: JSON.stringify({ sports: [+sportId], page: 1 }),
  });
  const data = (await r.json()).data || [];
  console.log(`sport ${sportId}: ${data.length} løb fra API`);
  for (const e of data) {
    const cc = LAND[e.location?.country];
    const la = e.location?.coordinates?.lat, lo = e.location?.coordinates?.lng;
    if (!cc || la == null || lo == null) continue;
    if (!e.race_date || e.race_date < iDag) continue;
    const navn = e.name.replace(/\s+/g, " ").trim();
    const nøgle = norm(navn);
    if (set.has(nøgle) || kendte.has(nøgle)) continue;
    set.add(nøgle);
    const [t, d] = klassificer(+sportId, e.distances || [], navn);
    alle.push([navn.slice(0, 80), e.location.city || "", cc, +la.toFixed(4), +lo.toFixed(4), t, d, e.race_date, e.id]);
  }
  await new Promise(res => setTimeout(res, 400));
}

alle.sort((a, b) => a[7].localeCompare(b[7]));
const prLand = {};
for (const a of alle) prLand[a[2]] = (prLand[a[2]] || 0) + 1;
console.log("pr. land:", prLand);

const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-rid.js",
  `// Autogenereret af tools/build-rid.mjs - kilde: RaceID (raceid.com), Norden (${alle.length} løb)\n` +
  `// Kompakt format: [navn, by, cc, lat, lng, type, distance, dato, raceid-id]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1] || { SE: "Sverige", NO: "Norge", DK: "Danmark", FI: "Finland", IS: "Island" }[a[2]], cc: a[2], co: "EU", la: a[3], lo: a[4], t: a[5], d: a[6], m: a[7].slice(0, 7), dt: a[7], p: null, u: "https://raceid.com/en/races/" + a[8] + "/about" });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: ${alle.length} løb skrevet til data/races-rid.js`);
