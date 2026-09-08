// build-finishers.mjs - henter finishers.com (fransk løbs-finder, Next.js). Hver event
// har fuld data i __NEXT_DATA__; vi bruger det lette _next/data/<buildId>/...json-endpoint.
// cityCoordinates + nextEdition-dato + breadcrumb-by + land direkte. Multi-land (FR-tungt).
// Resume-sikker cache /tmp/fin-cache, høflig rate-limiting. Buildid hentes friskt + fornys ved 404.
// Kør: node tools/build-finishers.mjs  →  data/races-finishers.js
import fs from "node:fs";
import crypto from "node:crypto";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const IDAG = new Date().toISOString().slice(0, 10);
const CACHE = "/tmp/fin-cache";
const SAMTIDIG = 5;
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

async function hentBuildId() {
  const h = await (await fetch("https://www.finishers.com/", { headers: { "User-Agent": UA } })).text();
  return JSON.parse(h.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/)[1]).buildId;
}
let BUILD = await hentBuildId();
console.log(`finishers buildId: ${BUILD}`);

// 1. alle event-slugs fra sitemap
const sm = await (await fetch("https://www.finishers.com/sitemap/events.xml", { headers: { "User-Agent": UA } })).text();
const slugs = [...sm.matchAll(/\/course\/([^<\/]+)</g)].map(m => m[1]);
console.log(`finishers: ${slugs.length} events i sitemap`);

// 2. hent hver events _next/data (cache-first)
function cp(slug) { return `${CACHE}/${crypto.createHash("md5").update(slug).digest("hex")}.json`; }
async function hentEvent(slug) {
  const p = cp(slug);
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {} }
  for (let forsøg = 0; forsøg < 2; forsøg++) {
    try {
      const url = `https://www.finishers.com/_next/data/${BUILD}/fr/course/${encodeURIComponent(slug)}.json`;
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.status === 404 && forsøg === 0) { BUILD = await hentBuildId(); continue; }  // buildId fornyet
      if (!r.ok) { fs.writeFileSync(p, "null"); return null; }
      const d = await r.json();
      const pp = d.pageProps || {};
      const ev = pp.event; const ne = pp.nextEdition;
      const slank = ev ? {
        name: ev.name, coords: ev.cityCoordinates,
        cc: ev.countryName?.code, co: ev.countryName?.geonameData?.continent,
        by: (ev.breadcrumb || []).find(b => b.type === "city")?.label || null,
        start: ne?.dateRange?.start || null,
        disc: pp.disciplines || [], races: (pp.races || []).map(x => x.name),
        slug,
      } : null;
      fs.writeFileSync(p, JSON.stringify(slank));
      return slank;
    } catch (_) { if (forsøg === 1) return null; await sleep(400); }
  }
  return null;
}

async function pool(items, n, fn) {
  const ud = new Array(items.length); let i = 0, gjort = 0;
  async function arbejder() {
    while (i < items.length) {
      const idx = i++; ud[idx] = await fn(items[idx]);
      if (++gjort % 500 === 0) console.log(`  ${gjort}/${items.length}`);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: n }, arbejder));
  return ud;
}

const events = await pool(slugs, SAMTIDIG, hentEvent);

// 3. type fra disciplin + distancer
const LØBEDISC = new Set(["running", "road", "trail", "triathlon", "duathlon", "walking"]);
function typ(disc, races) {
  const d = disc.map(x => x.toLowerCase());
  if (d.includes("triathlon") || d.includes("duathlon")) return "tri";
  const s = races.join(" ").toLowerCase().replace(/semi.?marathon|half.?marathon/g, "half");
  if (/ultra|\b(5\d|[6-9]\d|1\d\d)\s?km|100\s?km|trail/.test(s) || d.includes("trail")) {
    if (/marathon/.test(s) && !/half/.test(s) && !d.includes("trail")) return "marathon";
    return d.includes("trail") ? "ultra" : (/ultra|100\s?km/.test(s) ? "ultra" : "kort");
  }
  if (/half/.test(s)) return "half";
  if (/marathon/.test(s)) return "marathon";
  return "kort";
}
function distLabel(races, t) {
  const dist = races.filter(r => /\d+\s?km|marathon|semi|half|ultra|mile/i.test(r)).slice(0, 3);
  if (dist.length) return [...new Set(dist)].join(" · ");
  return ({ kort: "Løb", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra & trail", tri: "Triatlon" })[t];
}

// 4. dedup mod eksisterende katalog
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

let ok = 0, ingen = 0, fortid = 0, ingenGeo = 0, ikkeLøb = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const e of events) {
  if (!e || !e.name) { ingen++; continue; }
  if (!e.start || e.start < IDAG) { fortid++; continue; }
  if (!e.coords || e.coords.lat == null || e.coords.lng == null) { ingenGeo++; continue; }
  if (!e.disc.some(d => LØBEDISC.has((d || "").toLowerCase()))) { ikkeLøb++; continue; }  // frasortér cykel/svøm
  const nøgle = norm(e.name) + "|" + e.start;
  if (seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(e.name.replace(/20\d\d/g, "")))) { dubl++; continue; }
  const t = typ(e.disc, e.races);
  ok++;
  out.push({
    n: e.name, c: e.by || "", cc: e.cc || null, co: e.co || null,
    la: +(+e.coords.lat).toFixed(4), lo: +(+e.coords.lng).toFixed(4),
    t, d: distLabel(e.races, t), m: e.start.slice(0, 7), dt: e.start, p: null,
    u: `https://www.finishers.com/course/${e.slug}`,
  });
}
console.log(`inkluderet: ${ok} | tom: ${ingen} | fortid: ${fortid} | ingen geo: ${ingenGeo} | ikke-løb: ${ikkeLøb} | dubletter: ${dubl}`);
const lande = {}; for (const r of out) lande[r.cc] = (lande[r.cc] || 0) + 1;
console.log("pr. land (top):", Object.entries(lande).sort((a, b) => b[1] - a[1]).slice(0, 6));

const js = `// Autogenereret af tools/build-finishers.mjs - kilde: finishers.com (offentlig sitemap + Next.js data)\n` +
  `// ${ok} kommende løb (FR-tungt, multi-land), coords+dato fra struktureret data. Link = finishers-eventside.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-finishers.js", js);
console.log(`FÆRDIG: data/races-finishers.js (${ok} løb, ${(js.length / 1024).toFixed(0)} KB)`);
