// Henter nordiske løb fra RaceID (raceid.com - robots.txt tillader alt; vi linker
// tilbage til deres tilmelding, samme link-ud-model som resten af Runnin).
// Endpoint: POST /api/v1/web/search-route (deres eget kort-API, alle løb i ét kald).
// Kør: node tools/build-rid.mjs
import { readFileSync, writeFileSync } from "fs";

const SPORTS = { 3: "løb", 63: "trail", 74: "backyard", 6: "tri" };
// RaceID dækker hele verden - landenavne (engelske + native varianter) → ISO2
const LAND = {
  "Sweden": "SE", "Sverige": "SE", "Norway": "NO", "Norge": "NO", "Denmark": "DK", "Danmark": "DK",
  "Finland": "FI", "Suomi": "FI", "Iceland": "IS", "Island": "IS", "Åland Islands": "FI", "Åland": "FI",
  "Faroe Islands": "FO", "Greenland": "GL", "Grønland": "GL",
  "United Kingdom": "GB", "Jersey": "GB", "Guernsey": "GB", "Ireland": "IE",
  "Germany": "DE", "France": "FR", "Spain": "ES", "España": "ES", "Italy": "IT", "Italia": "IT",
  "Netherlands": "NL", "Belgium": "BE", "Luxembourg": "LU", "Switzerland": "CH", "Schweiz": "CH",
  "Austria": "AT", "Portugal": "PT", "Greece": "GR", "Ελλάδα": "GR", "Croatia": "HR", "Slovenia": "SI",
  "Slovakia": "SK", "Czechia": "CZ", "Romania": "RO", "Bulgaria": "BG", "Cyprus": "CY", "Montenegro": "ME",
  "North Macedonia": "MK", "Україна": "UA", "Ukraine": "UA",
  "United States": "US", "United States of America": "US", "Canada": "CA", "Mexico": "MX",
  "Puerto Rico": "PR", "Bermuda": "BM", "Jamaica": "JM", "Cuba": "CU", "Honduras": "HN", "Guadeloupe": "GP",
  "Brazil": "BR", "Chile": "CL", "Colombia": "CO", "Peru": "PE", "Argentina": "AR",
  "Australia": "AU", "New Zealand": "NZ",
  "Nepal": "NP", "Pakistan": "PK", "India": "IN", "Taiwan": "TW", "Thailand": "TH", "Philippines": "PH",
  "Indonesia": "ID", "Mongolia": "MN", "Lebanon": "LB", "Qatar": "QA", "United Arab Emirates": "AE",
  "Morocco": "MA", "Algeria": "DZ", "South Africa": "ZA",
};
// ISO2 → kontinent (til region-filter + guides)
const KONT = {
  SE: "EU", NO: "EU", DK: "EU", FI: "EU", IS: "EU", FO: "EU", GL: "NA", GB: "EU", IE: "EU", DE: "EU",
  FR: "EU", ES: "EU", IT: "EU", NL: "EU", BE: "EU", LU: "EU", CH: "EU", AT: "EU", PT: "EU", GR: "EU",
  HR: "EU", SI: "EU", SK: "EU", CZ: "EU", RO: "EU", BG: "EU", CY: "EU", ME: "EU", MK: "EU", UA: "EU",
  US: "NA", CA: "NA", MX: "NA", PR: "NA", BM: "NA", JM: "NA", CU: "NA", HN: "NA", GP: "NA",
  BR: "SA", CL: "SA", CO: "SA", PE: "SA", AR: "SA", AU: "OC", NZ: "OC",
  NP: "AS", PK: "AS", IN: "AS", TW: "AS", TH: "AS", PH: "AS", ID: "AS", MN: "AS", LB: "AS", QA: "AS", AE: "AS",
  MA: "AF", DZ: "AF", ZA: "AF",
};
const BYNAVN = { SE: "Sverige", NO: "Norge", DK: "Danmark", FI: "Finland", IS: "Island", GB: "United Kingdom", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy" };

// dedupe mod alt vi allerede har (undgå at samme løb kommer ind fra flere kilder)
const norm = n => n.toLowerCase().replace(/\s*\d{4}\s*$/, "").replace(/[^a-zæøåäö0-9]/g, "");
const kendte = new Set();
for (const fil of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-wm.js", "data/races-aims.js", "data/races-kondis.js"]) {
  try { for (const m of readFileSync(fil, "utf8").matchAll(/"?n"?\s*:\s*"([^"]+)"/g)) kendte.add(norm(m[1])); } catch (_) {}
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
    const by = (e.location.city || BYNAVN[cc] || "").slice(0, 60);
    const url = e.registration_url || `https://raceid.com/en/races/${e.id}/about`;   // officiel tilmelding hvis kendt
    alle.push([navn.slice(0, 80), by, cc, KONT[cc] || "EU", +la.toFixed(4), +lo.toFixed(4), t, d, e.race_date, url]);
  }
  await new Promise(res => setTimeout(res, 400));
}

alle.sort((a, b) => a[8].localeCompare(b[8]));
const prLand = {};
for (const a of alle) prLand[a[2]] = (prLand[a[2]] || 0) + 1;
console.log("pr. land:", JSON.stringify(prLand));

const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-rid.js",
  `// Autogenereret af tools/build-rid.mjs - kilde: RaceID (raceid.com), hele verden (${alle.length} løb)\n` +
  `// Kompakt format: [navn, by, cc, co, lat, lng, type, distance, dato, url]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1] || a[2], cc: a[2], co: a[3], la: a[4], lo: a[5], t: a[6], d: a[7], m: a[8].slice(0, 7), dt: a[8], p: null, u: a[9] });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: ${alle.length} løb skrevet til data/races-rid.js`);
