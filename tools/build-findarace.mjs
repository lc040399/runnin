// build-findarace.mjs - henter findarace.com's UK-løbskatalog via deres offentlige
// sitemaps + JSON-LD (schema.org SportsEvent). Siderne har geo-koordinater OG
// pris/distance direkte i struktureret data - ingen geocoding. Rigtige UK-vejløb
// (5k/10k/half/marathon) som parkrun ikke dækker. Vi linker tilbage = sender dem trafik.
// Høflig: RunninBot-UA, begrænset samtidighed, resume-sikker cache i /tmp/far-cache.
// Kør: node tools/build-findarace.mjs  →  data/races-findarace.js
import fs from "node:fs";
import crypto from "node:crypto";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const IDAG = new Date().toISOString().slice(0, 10);
const CACHE = "/tmp/far-cache";
const SAMTIDIG = 5;
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

const SITEMAPS = [
  "https://findarace.com/sitemap-events-current.xml",
  "https://findarace.com/sitemap-events-future.xml",
];

// 1. saml event-URLs fra sitemaps
const urls = new Set();
for (const sm of SITEMAPS) {
  const xml = await (await fetch(sm, { headers: { "User-Agent": UA } })).text();
  for (const m of xml.matchAll(/<loc>(https:\/\/findarace\.com\/events\/[^<]+)<\/loc>/g)) urls.add(m[1]);
}
const liste = [...urls];
console.log(`findarace: ${liste.length} event-URLs fra sitemaps`);

// 2. hent hver side (cache-first), træk JSON-LD SportsEvent ud
function cachePath(u) { return `${CACHE}/${crypto.createHash("md5").update(u).digest("hex")}.json`; }

async function hentEvent(u) {
  const cp = cachePath(u);
  if (fs.existsSync(cp)) { try { return JSON.parse(fs.readFileSync(cp, "utf8")); } catch (_) {} }
  try {
    const html = await (await fetch(u, { headers: { "User-Agent": UA } })).text();
    const m = html.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
    if (!m) { fs.writeFileSync(cp, "null"); return null; }
    const j = JSON.parse(m[1]);
    const ev = (j["@graph"] || []).find(x => /Event/.test(x["@type"])) || (/(Event)/.test(j["@type"]) ? j : null);
    fs.writeFileSync(cp, JSON.stringify(ev || null));
    return ev;
  } catch (_) { return null; }
}

// simpel samtidigheds-pool m. lille forsinkelse (høflighed)
async function pool(items, n, fn) {
  const ud = []; let i = 0;
  async function arbejder() {
    while (i < items.length) { const idx = i++; ud[idx] = await fn(items[idx], idx); await sleep(120); }
  }
  await Promise.all(Array.from({ length: n }, arbejder));
  return ud;
}

let hentet = 0;
const events = await pool(liste, SAMTIDIG, async (u) => {
  const ev = await hentEvent(u);
  if (++hentet % 250 === 0) console.log(`  ${hentet}/${liste.length}`);
  return ev;
});

// 3. type + label fra navn + offers
function distanceSæt(ev) {
  const offers = [].concat(ev.offers || []);
  return [...new Set(offers.map(o => (o.name || "").trim()).filter(Boolean))];
}
function typ(navn, dists) {
  const s = (navn + " " + dists.join(" ")).toLowerCase();
  if (/ultra|50k|100k|50 ?mile|100 ?mile/.test(s)) return "ultra";
  if (/triathlon|duathlon|aquathlon|swimrun/.test(s)) return "tri";
  if (/(^|[^-\w])marathon/.test(s.replace(/half\s*marathon/g, "half"))) return "marathon";
  if (/half|21\.1|21k/.test(s)) return "half";
  return "kort";
}
function distLabel(dists, t) {
  if (dists.length) return dists.slice(0, 3).join(" · ");
  return ({ kort: "Løb", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra", tri: "Triatlon" })[t] || "Løb";
}
const cc = addr => /ireland/i.test(addr) && !/northern ireland/i.test(addr) ? "IE" : "GB";
const DØD = /closed|do not register|sold ?out|cancelled|canceled|postponed|waitlist|expired/i;

// 4. dedup mod eksisterende katalog
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

let ok = 0, ingenLd = 0, fortid = 0, ingenGeo = 0, død = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const ev of events) {
  if (!ev) { ingenLd++; continue; }
  const navn = (ev.name || "").trim();
  const dato = (ev.startDate || "").slice(0, 10);
  const geo = ev.location?.geo;
  if (!navn || DØD.test(navn)) { død++; continue; }
  if (!dato || dato < IDAG) { fortid++; continue; }
  if (!geo || geo.latitude == null || geo.longitude == null) { ingenGeo++; continue; }
  const nøgle = norm(navn) + "|" + dato;
  if (seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }
  const dists = distanceSæt(ev);
  const t = typ(navn, dists);
  const by = (ev.location?.name || "").split(",")[0].trim();
  const land = cc(ev.location?.address || "");
  ok++;
  out.push({
    n: navn, c: by, cc: land, co: "EU",
    la: +(+geo.latitude).toFixed(4), lo: +(+geo.longitude).toFixed(4),
    t, d: distLabel(dists, t), m: dato.slice(0, 7), dt: dato, p: null,  // pris i GBP - vises ikke som kr (ærligt)
    u: ev.url || null,
  });
}
console.log(`inkluderet: ${ok} | ingen JSON-LD: ${ingenLd} | lukket/soldout: ${død} | fortid: ${fortid} | ingen geo: ${ingenGeo} | dubletter: ${dubl}`);

const js = `// Autogenereret af tools/build-findarace.mjs - kilde: findarace.com (offentlig sitemap + JSON-LD)\n` +
  `// ${ok} kommende UK-løb (5k/10k/half/marathon), geo fra struktureret data. Link = findarace-eventside.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-findarace.js", js);
console.log(`FÆRDIG: data/races-findarace.js (${ok} løb, ${(js.length / 1024).toFixed(0)} KB)`);
