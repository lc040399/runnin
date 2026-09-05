// Bygger data/races-st.js ud fra tools/st-raw.tsv (høstet fra sportstiming.dk/events).
// Geokoder danske bynavne via DAWA (api.dataforsyningen.dk - gratis, offentlig).
// VIGTIGT: Kør node tools/fix-coords.mjs bagefter - kyst-postnumres visueltcenter
// kan ligge i havet; fix-coords land-validerer og retter via stednavne2.
// Kør: node tools/build-st.mjs
import { readFileSync, writeFileSync } from "fs";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };

// Udenlandske byer på Sportstiming - håndholdte koordinater
const FOREIGN = {
  Stavanger: { la: 58.970, lo: 5.733, cc: "NO" },
  Grebbestad: { la: 58.683, lo: 11.254, cc: "SE" },
  "Sövde": { la: 55.580, lo: 13.668, cc: "SE" },
  Svanesund: { la: 58.139, lo: 11.834, cc: "SE" },
  Tidaholm: { la: 58.180, lo: 13.926, cc: "SE" },
  Hofors: { la: 60.549, lo: 16.284, cc: "SE" },
  Vicenza: { la: 45.546, lo: 11.548, cc: "IT" },
  "Ostseebad Binz": { la: 54.401, lo: 13.610, cc: "DE" },
  Nuuk: { la: 64.181, lo: -51.694, cc: "GL" },
};

const SKIP = /virtuel|virtual|samlet tilmelding|køb 4|challenge the year|julekalender|vip 20/i;

// Events uden by i listen, men med kendt lokation - href → bynavn til geokodning
const CITY_OVERRIDE = {
  "/event/19464": "Aarhus C",        // Aarhus Bay Triathlon
  "https://www.aarhusmotion.dk/event/298": "Odder", // Tunø Løbet (færge fra Hou)
  "https://www.aarhusmotion.dk/event/299": "Højbjerg", // Moesgaard Trail Run
  "https://www.aarhusmotion.dk/event/300": "Aarhus C", // Løb for Knæk Cancer
  "https://www.aarhusmotion.dk/event/302": "Aarhus C", // Christmas City Run
  "https://www.aarhusmotion.dk/event/307": "Aarhus C", // Aarhus City Half
  "/event/19304": "Nivå",            // Tour de Fredensborgs efterårsløb
  "/event/17468": "København S",     // Trails - Amager Fælled
  "/event/18088": "Gilleleje",       // GUUT Winter Edition
  "/event/18811": "Vodskov",         // Hammer Bakker Trail
  "/event/19303": "Korsør",          // Korsør Mini-Tri
  "/event/19000": "Blokhus",         // Blokhus Marathon
  "/event/19429": "Fredericia",      // Hannerupløbet
  "/event/17831": "Odense C",        // Fionia Long Distance Triathlon
};
const ACRO = new Set(["dgi", "dm", "hca", "ikea", "au", "pfa", "al", "vip", "liuf", "guut", "dirt", "3st", "ocr", "swe"]);

function titleCase(s) {
  return s.toLowerCase().replace(/[\p{L}\d']+/gu, w =>
    ACRO.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)
  ).replace(/'S\b/g, "'s");
}

function classify(name, icon) {
  const n = name.toLowerCase();
  if (icon === "Triatlon") return "tri";
  if (/ultra|backyard|frontyard|100 ?km|1000 ?km/.test(n)) return "ultra";
  if (icon === "Trailløb" || /trail/.test(n)) return "ultra";
  if (/halvmarat|halvmarath|half|1\/2 marathon/.test(n)) return "half";
  if (/maraton|marathon/.test(n)) return "marathon";
  return "kort";
}

// Kyst-postnumre hvor DAWAs visueltcenter ligger i havet
const COORD_OVERRIDE = {
  "Blåvand": { la: 55.558, lo: 8.083, cc: "DK" },
  "Hasle": { la: 55.181, lo: 14.706, cc: "DK" },
  "Rønne": { la: 55.098, lo: 14.701, cc: "DK" },
  "Læsø": { la: 57.269, lo: 11.006, cc: "DK" },
  "Marstal": { la: 54.856, lo: 10.516, cc: "DK" },
  "Fur": { la: 56.826, lo: 9.021, cc: "DK" },
  "Aakirkeby": { la: 55.070, lo: 14.919, cc: "DK" },
  "Allinge": { la: 55.273, lo: 14.800, cc: "DK" },
  "Søby Ærø": { la: 54.939, lo: 10.260, cc: "DK" },
};

// median af rigtige adresser i postnummeret = garanteret PÅ LAND.
// (postnumres visueltcenter ligger i havet for kyst-distrikter - Thisted lå 46 km ude
// i Skagerrak; bugklassen fanget 4/9-2026, deraf denne metode.)
const med = arr => { const s = [...arr].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
async function medianAdresse(postnr) {
  const r = await fetch(`https://api.dataforsyningen.dk/adgangsadresser?postnr=${postnr}&per_side=100&struktur=mini`);
  const a = await r.json();
  if (!Array.isArray(a) || !a.length) return null;
  return { la: +med(a.map(x => x.y)).toFixed(4), lo: +med(a.map(x => x.x)).toFixed(4), cc: "DK" };
}

// land-validering: afstand til nærmeste adresse; >4 km ≈ punktet er i havet → snap til adressen
function kmMellem(lo1, la1, lo2, la2) {
  const R = 6371, d = x => x * Math.PI / 180;
  const a = Math.sin(d(la2 - la1) / 2) ** 2 + Math.cos(d(la1)) * Math.cos(d(la2)) * Math.sin(d(lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
async function sikrLand(hit) {
  const r = await fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${hit.lo}&y=${hit.la}&srid=4326&struktur=mini`);
  if (!r.ok) return hit;
  const j = await r.json();
  if (!j || j.x == null) return hit;
  return kmMellem(hit.lo, hit.la, j.x, j.y) > 4 ? { la: +j.y.toFixed(4), lo: +j.x.toFixed(4), cc: "DK" } : hit;
}

const cityCache = new Map();
async function geocode(cityRaw) {
  let city = cityRaw.replace(/\(.*?\)/g, "").replace(/ Kommune$/i, "").trim();
  if (!city) return null;
  if (COORD_OVERRIDE[city]) return COORD_OVERRIDE[city];
  if (FOREIGN[city]) return FOREIGN[city];
  if (cityCache.has(city)) return cityCache.get(city);
  let hit = null;
  try {
    const r = await fetch("https://api.dataforsyningen.dk/postnumre?q=" + encodeURIComponent(city));
    const arr = await r.json();
    if (arr.length) {
      hit = await medianAdresse(arr[0].nr);        // adresse-median = på land
      if (!hit) { const [lo, la] = arr[0].visueltcenter; hit = await sikrLand({ la, lo, cc: "DK" }); }
    } else {
      // fallback: stednavne (visueltcenter KAN ligge i vand → land-validér)
      const r2 = await fetch("https://api.dataforsyningen.dk/stednavne2?q=" + encodeURIComponent(city) + "&hovedtype=Bebyggelse&per_side=1");
      const a2 = await r2.json();
      if (a2.length && a2[0].sted?.visueltcenter) {
        const [lo, la] = a2[0].sted.visueltcenter;
        hit = await sikrLand({ la, lo, cc: "DK" });
      }
    }
  } catch (e) { /* netværk - spring over */ }
  cityCache.set(city, hit);
  await new Promise(res => setTimeout(res, 120));
  return hit;
}

const lines = readFileSync("tools/st-raw.tsv", "utf8").trim().split("\n");
let year = 2026, prevMonth = 8;
const seen = new Set();
const out = [], dropped = [];

for (const line of lines) {
  const [dateCell, icon, rawName, href, small] = line.split("\t");
  const m = dateCell.match(/(\d+)\. (\w+)/);
  if (!m) { dropped.push([rawName, "dato"]); continue; }
  const day = +m[1], mon = MONTHS[m[2].slice(0, 3)];
  if (mon < prevMonth) year++;
  prevMonth = mon;

  if (seen.has(href)) continue;
  seen.add(href);
  if (SKIP.test(rawName)) { dropped.push([rawName, "filter"]); continue; }

  const city = (small.split("|")[1] || "").trim() || CITY_OVERRIDE[href] || "";
  if (!city) { dropped.push([rawName, "ingen by"]); continue; }

  const geo = await geocode(city);
  if (!geo) { dropped.push([rawName, "geokode: " + city]); continue; }

  let note = null, name = rawName;
  if (/UDSOLGT/i.test(name)) { note = "Udsolgt"; name = name.replace(/\s*UDSOLGT\s*/i, " ").trim(); }

  // let deterministisk jitter så samme-by-prikker ikke ligger oveni hinanden
  const h = [...href].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
  const jla = ((h % 100) - 50) / 4000, jlo = (((h >> 7) % 100) - 50) / 3000;

  out.push({
    n: titleCase(name),
    c: city.replace(/\(.*?\)/g, "").trim(),
    cc: geo.cc,
    co: "EU",
    la: +(geo.la + jla).toFixed(4),
    lo: +(geo.lo + jlo).toFixed(4),
    t: classify(rawName, icon),
    d: icon === "Triatlon" ? "Triatlon" : icon === "Trailløb" ? "Trail" : "Løb",
    m: `${year}-${String(mon).padStart(2, "0")}`,
    dt: `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    p: null,
    u: href.startsWith("http") ? href : "https://www.sportstiming.dk" + href,
    ...(note ? { note } : {}),
  });
}

// Grønland skal have co: NA (samme konvention som Polar Circle Marathon)
for (const r of out) if (r.cc === "GL") r.co = "NA";

const body = out.map(r => "  " + JSON.stringify(r)).join(",\n");
writeFileSync("data/races-st.js",
  `// Autogenereret af tools/build-st.mjs ${new Date().toISOString().slice(0, 10)} - kilde: sportstiming.dk/events (${out.length} events)\n// Priser kendes ikke herfra (p:null) - CTA linker til tilmeldingssiden.\nRACES.push(...[\n${body},\n]);\nRACES.forEach((r, i) => (r.id = i));\n`);

console.log(`OK: ${out.length} events skrevet, ${dropped.length} droppet`);
for (const [n, why] of dropped) console.log("  - " + why + ": " + n.slice(0, 60));
