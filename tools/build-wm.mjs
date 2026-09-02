// Globale løb fra WorldsMarathons (worldsmarathons.com - robots tillader alt,
// leverer sitemap). Vi tager KALENDERFAKTA fra hver races schema.org Event-JSON-LD
// (navn, dato, by, land) og linker til deres race-side - samme link-ud-model som
// AIMS/Kondis. FOKUS: løb UDEN for USA/Norden (de dækker vi allerede) for at fylde
// verdenshullerne. Geokodning: Open-Meteo. Kør: node tools/build-wm.mjs [maks]
import { readFileSync, writeFileSync } from "fs";

const UA = { headers: { "User-Agent": "Mozilla/5.0 (RunninBot; kalenderfakta m. link-out)" } };
const sov = ms => new Promise(r => setTimeout(r, ms));
const MAKS = +(process.argv[2] || 1200);

const norm = n => n.toLowerCase().replace(/\s*\d{4}\s*$/, "").replace(/[^a-zæøåäö0-9]/g, "");
const kendte = new Set();
for (const fil of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-nordics.js", "data/races-rid.js", "data/races-kondis.js", "data/races-aims.js"]) {
  try { for (const m of readFileSync(fil, "utf8").matchAll(/(?:"?n"?\s*:\s*|^\s*\[)"([^"]+)"/gm)) kendte.add(norm(m[1])); } catch (_) {}
}

const KONTINENT = { // ISO2 → vores co-kode; USA/Norden springes over (dækket)
  // Europa
  GB:"EU",IE:"EU",FR:"EU",DE:"EU",ES:"EU",PT:"EU",IT:"EU",NL:"EU",BE:"EU",AT:"EU",CH:"EU",PL:"EU",CZ:"EU",HU:"EU",GR:"EU",HR:"EU",RO:"EU",BG:"EU",SI:"EU",SK:"EU",EE:"EU",LV:"EU",LT:"EU",LU:"EU",MT:"EU",CY:"EU",UA:"EU",RS:"EU",BA:"EU",AL:"EU",MK:"EU",ME:"EU",MD:"EU",AD:"EU",MC:"EU",SM:"EU",
  // Asien
  JP:"AS",CN:"AS",KR:"AS",IN:"AS",TH:"AS",VN:"AS",MY:"AS",SG:"AS",ID:"AS",PH:"AS",HK:"AS",TW:"AS",AE:"AS",QA:"AS",SA:"AS",KW:"AS",OM:"AS",BH:"AS",IL:"AS",JO:"AS",LB:"AS",NP:"AS",LK:"AS",KH:"AS",MM:"AS",KZ:"AS",UZ:"AS",GE:"AS",AM:"AS",AZ:"AS",MN:"AS",PK:"AS",BD:"AS",TR:"AS",
  // Afrika
  ZA:"AF",KE:"AF",ET:"AF",MA:"AF",TN:"AF",EG:"AF",TZ:"AF",UG:"AF",RW:"AF",NG:"AF",GH:"AF",NA:"AF",BW:"AF",ZW:"AF",ZM:"AF",SN:"AF",CI:"AF",MU:"AF",MG:"AF",
  // Oceanien
  AU:"OC",NZ:"OC",FJ:"OC",
  // Amerika (ikke US)
  CA:"NA",MX:"NA",GT:"NA",CR:"NA",PA:"NA",DO:"NA",JM:"NA",CU:"NA",BS:"NA",
  BR:"SA",AR:"SA",CL:"SA",CO:"SA",PE:"SA",UY:"SA",EC:"SA",BO:"SA",PY:"SA",VE:"SA",
};

function klassificer(navn) {
  const n = navn.toLowerCase();
  if (/ultra|100 ?km|50 ?km|100 ?mile|backyard|trail/.test(n)) return ["ultra", "Ultra & trail"];
  if (/triathlon|ironman/.test(n)) return ["tri", "Triatlon"];
  if (/half|semi|21k|13\.1/.test(n)) return ["half", "21,1 km"];
  if (/marathon|maraton|42/.test(n)) return ["marathon", "42,2 km"];
  if (/10 ?k/.test(n)) return ["kort", "10 km"];
  if (/5 ?k/.test(n)) return ["kort", "5 km"];
  return ["marathon", "42,2 km"]; // WM er marathon-centreret
}

// 1) alle race-URLs fra sitemap
const smXml = await (await fetch("https://worldsmarathons.com/marathons-sitemap-en.xml", UA)).text();
const urls = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
console.log("race-URLs i sitemap:", urls.length);

const iDag = new Date().toISOString().slice(0, 10);
const geoCache = new Map();
async function geokod(by, cc) {
  const nøgle = by + "|" + cc;
  if (geoCache.has(nøgle)) return geoCache.get(nøgle);
  await sov(120);
  try {
    const d = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(by)}&count=8&language=en`)).json();
    const hit = (d.results || []).find(x => x.country_code === cc) || null;
    const res = hit ? [+hit.latitude.toFixed(4), +hit.longitude.toFixed(4)] : null;
    geoCache.set(nøgle, res); return res;
  } catch (_) { geoCache.set(nøgle, null); return null; }
}

const alle = [];
const set = new Set();
const dropped = { us_norden: 0, dato: 0, dubl: 0, geo: 0, ld: 0 };
let n = 0, behandlet = 0;
for (const url of urls) {
  if (alle.length >= MAKS || behandlet >= 3000) break;
  behandlet++;
  if (behandlet % 100 === 0) console.log(`  ${behandlet} tjekket, ${alle.length} fundet...`);
  await sov(90);
  let html;
  try { html = await (await fetch(url, UA)).text(); } catch (_) { continue; }
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)]
    .map(m => { try { return JSON.parse(m[1]); } catch (_) { return null; } })
    .find(x => x && x["@type"] === "Event");
  if (!ld) { dropped.ld++; continue; }
  const cc = ld.location?.address?.addressCountry;
  const co = KONTINENT[cc];
  if (!co) { dropped.us_norden++; continue; } // US/Norden/ukendt land = spring over
  const dt = (ld.startDate || "").slice(0, 10);
  if (!dt || dt < iDag) { dropped.dato++; continue; }
  const navn = (ld.name || "").replace(/\s+/g, " ").trim();
  const nøgle = norm(navn);
  if (!navn || set.has(nøgle) || kendte.has(nøgle)) { dropped.dubl++; continue; }
  const by = ld.location?.address?.addressLocality;
  if (!by) { dropped.geo++; continue; }
  const koord = await geokod(by, cc);
  if (!koord) { dropped.geo++; continue; }
  set.add(nøgle);
  const [t, d] = klassificer(navn);
  alle.push([navn.slice(0, 80), by.slice(0, 34), cc, co, koord[0], koord[1], t, d, dt.slice(0, 7), dt, url]);
}
console.log(`fundet: ${alle.length} - droppet:`, dropped);
const prCo = {}; for (const a of alle) prCo[a[3]] = (prCo[a[3]] || 0) + 1;
console.log("pr. kontinent:", prCo);

alle.sort((a, b) => a[9].localeCompare(b[9]));
const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-wm.js",
  `// Autogenereret af tools/build-wm.mjs - kilde: WorldsMarathons (${alle.length} løb, verden uden for USA/Norden)\n` +
  `// Kompakt format: [navn, by, cc, co, lat, lng, type, distance, måned, dato, url]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1], cc: a[2], co: a[3], la: a[4], lo: a[5], t: a[6], d: a[7], m: a[8], dt: a[9], p: null, u: a[10] });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: data/races-wm.js`);
