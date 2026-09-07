// build-duv.mjs - henter DUV's åbne ultra-kalender (statistik.d-u-v.org) og
// geokoder by+land offline mod GeoNames cities5000 (by-koordinater = altid på
// land, ingen hav-scar). Rigtige daterede ultraløb, globalt.
// Kræver /tmp/cities5000.txt + /tmp/countryInfo.txt (GeoNames).
// Kør: node tools/build-duv.mjs  →  data/races-duv.js
import fs from "node:fs";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const IDAG = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// 1. ISO3 → ISO2 + ISO2 → kontinent (til region-filteret)
const iso = {}, kont = {};
for (const line of fs.readFileSync("/tmp/countryInfo.txt", "utf8").split("\n")) {
  if (line.startsWith("#") || !line.trim()) continue;
  const c = line.split("\t");
  if (c[0] && c[1]) iso[c[1]] = c[0];
  if (c[0] && c[8]) kont[c[0]] = c[8];   // ISO2 → EU/NA/SA/AS/AF/OC/AN
}
// DUV bruger IOC-koder, ikke ISO3 - map dem der afviger til ISO2
Object.assign(iso, {
  GER: "DE", TPE: "TW", MAS: "MY", PHI: "PH", NED: "NL", SUI: "CH", GRE: "GR", RSA: "ZA",
  DEN: "DK", POR: "PT", SLO: "SI", NEP: "NP", CHI: "CL", CRO: "HR", URU: "UY", VIE: "VN",
  LAT: "LV", INA: "ID", BUL: "BG", CAM: "KH", NCA: "NI", ESA: "SV", KSA: "SA", MYA: "MM",
  BER: "BM", MAD: "MG", CRC: "CR", TAN: "TZ", IVB: "VG", ARU: "AW", BRU: "BN", MGL: "MN",
});

// 2. by-indeks fra GeoNames (normaliseret navn|ISO2 → største by m. det navn).
// Indekserer også alternative navne (kol 4) - ved kollision vinder størst by.
const byIdx = new Map();
for (const line of fs.readFileSync("/tmp/cities500.txt", "utf8").split("\n")) {
  const c = line.split("\t");
  if (c.length < 15) continue;
  const [, name, ascii, alt, lat, lon, , , cc] = c;
  const pop = +c[14] || 0;
  const navne = new Set([ascii, name, ...(alt ? alt.split(",") : [])]);
  const val = { la: +(+lat).toFixed(4), lo: +(+lon).toFixed(4), pop };
  for (const nm of navne) {
    const key = norm(nm) + "|" + cc;
    if (key.length < 3) continue;
    const ex = byIdx.get(key);
    if (!ex || pop > ex.pop) byIdx.set(key, val);
  }
}
console.log(`GeoNames: ${byIdx.size} by-nøgler`);

// 3. hent DUV-kalender (kommende: resten af i år + næste år)
async function hentÅr(år) {
  const alle = [];
  for (let p = 1; p <= 15; p++) {
    const url = `https://statistik.d-u-v.org/json/mcalendar.php?year=${år}&dist=all&country=all&page=${p}`;
    const d = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    alle.push(...(d.Races || []));
    if (!d.Pagination || d.Pagination.CurrPage >= d.Pagination.MaxPage) break;
    await sleep(300);
  }
  return alle;
}

// pæn distance-label
function distLabel(r) {
  if (r.Length) { const km = parseFloat(r.Length); if (km) return `${km % 1 ? km.toFixed(1) : km} km`; }
  if (r.Duration) {
    const m = r.Duration.match(/^(\d+)\s*([hd])/i);
    if (m) return m[2].toLowerCase() === "h" ? `${m[1]} timer` : `${m[1]} døgn`;
    return r.Duration;
  }
  return "Ultra";
}

const år1 = +IDAG.slice(0, 4), år2 = år1 + 1;
const raw = [...await hentÅr(år1), ...await hentÅr(år2)];
console.log(`DUV: ${raw.length} events hentet (${år1}+${år2})`);

// dedup mod eksisterende katalog (undgå ultraløb der allerede er inde via andre kilder)
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

// 4. filtrér + geokod
let geo = 0, mangler = 0, fortid = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const r of raw) {
  const dato = r.Startdate;
  if (!dato || dato < IDAG) { fortid++; continue; }              // kun kommende
  const cc = iso[r.Country];
  if (!cc || !r.City) { mangler++; continue; }
  const byNavn = r.City.split(",")[0].trim();   // DUV skriver US-byer "By, ST" - geokod kun by-navnet
  const by = byIdx.get(norm(byNavn) + "|" + cc);
  if (!by) { mangler++; continue; }                              // ingen ren geokodning → spring over (ærligt)
  const navn = (r.EventName || "").trim();
  const nøgle = norm(navn) + "|" + dato;
  if (!navn || seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }   // allerede i kataloget
  geo++;
  out.push({
    n: navn, c: r.City.split(",")[0].trim(), cc, co: kont[cc] || null, la: by.la, lo: by.lo,
    t: "ultra", d: distLabel(r), m: dato.slice(0, 7), dt: dato, p: null,
    u: `https://statistik.d-u-v.org/eventdetail.php?event=${r.EventID}`,
  });
}
console.log(`geokodet: ${geo} | manglede geo/land: ${mangler} | fortid: ${fortid} | dubletter: ${dubl}`);

const js = `// Autogenereret af tools/build-duv.mjs - kilde: DUV ultra-kalender (åben, statistik.d-u-v.org)\n` +
  `// ${geo} kommende ultraløb, geokodet mod GeoNames cities500. Link = DUV-eventside.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-duv.js", js);
console.log(`FÆRDIG: data/races-duv.js (${geo} ultraløb, ${(js.length / 1024).toFixed(0)} KB)`);
