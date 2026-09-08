// build-parkrun.mjs - henter parkruns åbne globale event-feed (images.parkrun.com/events.json)
// og mapper til Runnin-skemaet. parkruns er GRATIS ugentlige 5k'ere med EKSAKTE koordinater
// i feedet (ingen geocoding nødvendig). Enormt UK-tungt = fylder vores største dækningshul.
// Kun serie 1 (standard 5k), ikke junior-2k (serie 2). Udaterede (ugentligt tilbagevendende).
// Kør: node tools/build-parkrun.mjs  →  data/races-parkrun.js
import fs from "node:fs";

const UA = "Mozilla/5.0 (compatible; RunninBot/1.0; +https://runnin.org)";
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// parkrun-landeid → ISO2 + kontinent (EU/NA/SA/AS/AF/OC) + domæne (til event-link)
const LAND = {
  3:  { cc: "AU", co: "OC", url: "www.parkrun.com.au" },
  4:  { cc: "AT", co: "EU", url: "www.parkrun.co.at" },
  14: { cc: "CA", co: "NA", url: "www.parkrun.ca" },
  23: { cc: "DK", co: "EU", url: "www.parkrun.dk" },
  30: { cc: "FI", co: "EU", url: "www.parkrun.fi" },
  32: { cc: "DE", co: "EU", url: "www.parkrun.com.de" },
  42: { cc: "IE", co: "EU", url: "www.parkrun.ie" },
  44: { cc: "IT", co: "EU", url: "www.parkrun.it" },
  46: { cc: "JP", co: "AS", url: "www.parkrun.jp" },
  54: { cc: "LT", co: "EU", url: "www.parkrun.lt" },
  57: { cc: "MY", co: "AS", url: "www.parkrun.my" },
  64: { cc: "NL", co: "EU", url: "www.parkrun.co.nl" },
  65: { cc: "NZ", co: "OC", url: "www.parkrun.co.nz" },
  67: { cc: "NO", co: "EU", url: "www.parkrun.no" },
  74: { cc: "PL", co: "EU", url: "www.parkrun.pl" },
  82: { cc: "SG", co: "AS", url: "www.parkrun.sg" },
  85: { cc: "ZA", co: "AF", url: "www.parkrun.co.za" },
  88: { cc: "SE", co: "EU", url: "www.parkrun.se" },
  97: { cc: "GB", co: "EU", url: "www.parkrun.org.uk" },
  98: { cc: "US", co: "NA", url: "www.parkrun.us" },
};

// by-label fra EventLocation ("Bushy Park, Teddington" → "Teddington"); ellers kort-navn
function byNavn(p) {
  const loc = (p.EventLocation || "").trim();
  if (loc.includes(",")) return loc.split(",").pop().trim();
  return loc || (p.EventShortName || "").trim();
}

const data = await (await fetch("https://images.parkrun.com/events.json", { headers: { "User-Agent": UA } })).json();
const feats = data.events?.features || [];
console.log(`parkrun: ${feats.length} events i feed`);

// dedup mod eksisterende katalog
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

let ok = 0, ukendtLand = 0, junior = 0, ingenKoord = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const f of feats) {
  const p = f.properties || {};
  if (p.seriesid !== 1) { junior++; continue; }                 // kun standard 5k
  const land = LAND[p.countrycode];
  if (!land) { ukendtLand++; continue; }
  const co = f.geometry?.coordinates;
  if (!co || co.length < 2 || (!co[0] && !co[1])) { ingenKoord++; continue; }
  const navn = (p.EventLongName || "").trim();
  if (!navn || seen.has(p.eventname)) continue;
  seen.add(p.eventname);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }
  ok++;
  out.push({
    n: navn, c: byNavn(p), cc: land.cc, co: land.co,
    la: +(+co[1]).toFixed(4), lo: +(+co[0]).toFixed(4),
    t: "kort", d: "5 km", m: null, dt: null, p: null,
    u: `https://${land.url}/${p.eventname}/`,
  });
}
console.log(`inkluderet: ${ok} | junior-2k: ${junior} | ukendt land: ${ukendtLand} | uden koord: ${ingenKoord} | dubletter: ${dubl}`);

const js = `// Autogenereret af tools/build-parkrun.mjs - kilde: parkrun (åben, images.parkrun.com/events.json)\n` +
  `// ${ok} gratis ugentlige 5k-parkruns, eksakte koordinater fra feedet. Link = event-side.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-parkrun.js", js);
console.log(`FÆRDIG: data/races-parkrun.js (${ok} parkruns, ${(js.length / 1024).toFixed(0)} KB)`);
