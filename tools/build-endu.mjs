// build-endu.mjs - henter endu.net (stor italiensk sport-event-platform) via offentlig
// sitemap + JSON-LD SportsEvent. Rene data, men kun by+land (ingen geo) → geokodes offline
// mod GeoNames cities500. endu er multi-sport → filtrerer løb/trail/tri IND, cykel/svøm UD.
// Kræver /tmp/cities500.txt + /tmp/countryInfo.txt. Resume-cache /tmp/endu-cache.
// Kør: node tools/build-endu.mjs  →  data/races-endu.js
import fs from "node:fs";
import crypto from "node:crypto";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const IDAG = new Date().toISOString().slice(0, 10);
const CACHE = "/tmp/endu-cache";
const SAMTIDIG = 5;
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

// ISO3 → ISO2 + ISO2 → kontinent fra GeoNames + by-indeks (global, keyed norm(navn)|cc)
const iso = {}, kont = {};
for (const line of fs.readFileSync("/tmp/countryInfo.txt", "utf8").split("\n")) {
  if (line.startsWith("#") || !line.trim()) continue;
  const c = line.split("\t");
  if (c[0] && c[1]) iso[c[1]] = c[0];
  if (c[0] && c[8]) kont[c[0]] = c[8];
}
const byIdx = new Map();
for (const line of fs.readFileSync("/tmp/cities500.txt", "utf8").split("\n")) {
  const c = line.split("\t");
  if (c.length < 15) continue;
  const [, name, ascii, alt, lat, lon, , , cc] = c;
  const pop = +c[14] || 0;
  const val = { la: +(+lat).toFixed(4), lo: +(+lon).toFixed(4), pop };
  for (const nm of new Set([ascii, name, ...(alt ? alt.split(",") : [])])) {
    const key = norm(nm) + "|" + cc;
    if (key.length < 3) continue;
    const ex = byIdx.get(key);
    if (!ex || pop > ex.pop) byIdx.set(key, val);
  }
}
console.log(`GeoNames: ${byIdx.size} by-nøgler`);

// 1. event-URLs (kanoniske /events/<slug>, dedup)
const sm = await (await fetch("https://www.endu.net/sitemap-events.xml", { headers: { "User-Agent": UA } })).text();
const urls = [...new Set([...sm.matchAll(/<loc>(https:\/\/www\.endu\.net\/events\/[^<]+)<\/loc>/g)].map(m => m[1]))];
console.log(`endu: ${urls.length} event-URLs`);

// 2. hent + træk JSON-LD (cache-first)
function cp(u) { return `${CACHE}/${crypto.createHash("md5").update(u).digest("hex")}.json`; }
async function hent(u) {
  const p = cp(u);
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {} }
  try {
    const html = await (await fetch(u, { headers: { "User-Agent": UA } })).text();
    const m = html.match(/application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
    let ev = null;
    if (m) { const j = JSON.parse(m[1]); if (/Event/.test(j["@type"] || "")) ev = j; }
    fs.writeFileSync(p, JSON.stringify(ev));
    return ev;
  } catch (_) { return null; }
}
async function pool(items, n, fn) {
  const ud = new Array(items.length); let i = 0, g = 0;
  async function w() { while (i < items.length) { const idx = i++; ud[idx] = await fn(items[idx]); if (++g % 300 === 0) console.log(`  ${g}/${items.length}`); await sleep(120); } }
  await Promise.all(Array.from({ length: n }, w)); return ud;
}
const events = await pool(urls, SAMTIDIG, hent);

// 3. sport-filter (løb/trail/tri IND, cykel/svøm/ski UD) + type
const ERLØB = /maratona|marathon|mezza|half|corsa|podistic|trail|running|\brun\b|marcia|cross|miglia|ultra|vertical|skyrace|staffetta|triathlon|duathlon|aquathlon|stralugano|straleaning/i;
const IKKELØB = /granfondo|gran fondo|ciclo|ciclismo|\bmtb\b|\bbike\b|\bbici|nuoto|\bswim|nuot|\bsci\b|\bski\b|skating|pattinagg|canoa|kayak|rowing|\bvela\b|equestr|cavall/i;
function typ(navn) {
  const s = navn.toLowerCase();
  if (/triathlon|duathlon|aquathlon/.test(s)) return "tri";
  if (/ultra|100 ?km|trail|vertical|skyrace|\bsky\b/.test(s)) return "ultra";
  if (/mezza|half/.test(s)) return "half";
  if (/maratona|marathon/.test(s)) return "marathon";
  return "kort";
}
const TYPER = { kort: "Løb", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra & trail", tri: "Triatlon" };

// 4. dedup mod katalog
const findes = new Set();
try { for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8"))) findes.add(norm((r.n || "").replace(/20\d\d/g, ""))); } catch (_) {}

let ok = 0, ingenLd = 0, fortid = 0, ikkeLøb = 0, ingenGeo = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const ev of events) {
  if (!ev) { ingenLd++; continue; }
  const navn = (ev.name || "").trim();
  const dato = (ev.startDate || "").slice(0, 10);
  if (!navn) { ingenLd++; continue; }
  if (!ERLØB.test(navn) || IKKELØB.test(navn)) { ikkeLøb++; continue; }   // ikke et løb → ud
  if (!dato || dato < IDAG) { fortid++; continue; }
  const a = ev.location?.address || {};
  const cc = iso[a.addressCountry] || (a.addressCountry?.length === 2 ? a.addressCountry : null);
  const by = a.addressLocality;
  if (!cc || !by) { ingenGeo++; continue; }
  const geo = byIdx.get(norm(by) + "|" + cc);
  if (!geo) { ingenGeo++; continue; }
  const nøgle = norm(navn) + "|" + dato;
  if (seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }
  const t = typ(navn);
  ok++;
  out.push({
    n: navn, c: by, cc, co: kont[cc] || null, la: geo.la, lo: geo.lo,
    t, d: TYPER[t], m: dato.slice(0, 7), dt: dato, p: null,
    u: ev.url || null,
  });
}
console.log(`inkluderet: ${ok} | ingen JSON-LD: ${ingenLd} | ikke-løb: ${ikkeLøb} | fortid: ${fortid} | ingen geo: ${ingenGeo} | dubletter: ${dubl}`);
const lande = {}; for (const r of out) lande[r.cc] = (lande[r.cc] || 0) + 1;
console.log("pr. land:", Object.entries(lande).sort((a, b) => b[1] - a[1]).slice(0, 6));

const js = `// Autogenereret af tools/build-endu.mjs - kilde: endu.net (offentlig sitemap + JSON-LD)\n` +
  `// ${ok} kommende løb (IT-tungt), by geokodet mod GeoNames. Multi-sport filtreret til løb/trail/tri. Link = endu-eventside.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-endu.js", js);
console.log(`FÆRDIG: data/races-endu.js (${ok} løb, ${(js.length / 1024).toFixed(0)} KB)`);
