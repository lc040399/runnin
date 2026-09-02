// Henter verdensløb fra AIMS' offentlige kalender (aims-worldrunning.org).
// robots.txt tillader /calendar.html og /races/* (kun /downloads,/events,/my-books er lukket).
// Vi tager KALENDERFAKTA (navn, dato, by, land) + arrangørens officielle site fra
// race-siden og linker derhen - samme link-ud-model som alle andre kilder.
// Geokodning: Open-Meteos frie geocoding-API. Kør: node tools/build-aims.mjs
import { readFileSync, writeFileSync } from "fs";

const UA = { headers: { "User-Agent": "RunninBot/1.0 (+https://github.com/lc040399/runnin - kalenderfakta m. link-out)" } };
const sov = ms => new Promise(r => setTimeout(r, ms));

const norm = n => n.toLowerCase().replace(/\s*\d{4}\s*$/, "").replace(/[^a-zæøåäö0-9]/g, "");
const kendte = new Set();
for (const fil of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-nordics.js", "data/races-rid.js", "data/races-kondis.js"]) {
  for (const m of readFileSync(fil, "utf8").matchAll(/(?:"?n"?\s*:\s*|^\s*\[)"([^"]+)"/gm)) kendte.add(norm(m[1]));
}

// IOC→ISO2 + kontinent (indlejret - restcountries-API'et er deprecated)
const IOC = {
  ALB:["AL","EU"],AND:["AD","EU"],ARG:["AR","SA"],ARM:["AM","AS"],AUS:["AU","OC"],AUT:["AT","EU"],AZE:["AZ","AS"],
  BAH:["BS","NA"],BAR:["BB","NA"],BEL:["BE","EU"],BER:["BM","NA"],BIH:["BA","EU"],BLR:["BY","EU"],BOL:["BO","SA"],
  BRA:["BR","SA"],BRN:["BH","AS"],BUL:["BG","EU"],CAM:["KH","AS"],CAN:["CA","NA"],CHI:["CL","SA"],CHN:["CN","AS"],
  COL:["CO","SA"],CRC:["CR","NA"],CRO:["HR","EU"],CYP:["CY","EU"],CZE:["CZ","EU"],DEN:["DK","EU"],DOM:["DO","NA"],
  ECU:["EC","SA"],EGY:["EG","AF"],ESA:["SV","NA"],ESP:["ES","EU"],EST:["EE","EU"],ETH:["ET","AF"],FIN:["FI","EU"],
  FRA:["FR","EU"],GBR:["GB","EU"],GEO:["GE","AS"],GER:["DE","EU"],GRE:["GR","EU"],GUA:["GT","NA"],HKG:["HK","AS"],
  HUN:["HU","EU"],INA:["ID","AS"],IND:["IN","AS"],IRL:["IE","EU"],IRI:["IR","AS"],ISL:["IS","EU"],ISR:["IL","AS"],
  ITA:["IT","EU"],JAM:["JM","NA"],JPN:["JP","AS"],KAZ:["KZ","AS"],KEN:["KE","AF"],KOR:["KR","AS"],KSA:["SA","AS"],
  KUW:["KW","AS"],LAT:["LV","EU"],LBA:["LY","AF"],LIE:["LI","EU"],LTU:["LT","EU"],LUX:["LU","EU"],MAR:["MA","AF"],
  MAS:["MY","AS"],MDA:["MD","EU"],MEX:["MX","NA"],MGL:["MN","AS"],MKD:["MK","EU"],MLT:["MT","EU"],MNE:["ME","EU"],
  MRI:["MU","AF"],MYA:["MM","AS"],NAM:["NA","AF"],NED:["NL","EU"],NEP:["NP","AS"],NGR:["NG","AF"],NOR:["NO","EU"],
  NZL:["NZ","OC"],OMA:["OM","AS"],PAK:["PK","AS"],PAN:["PA","NA"],PAR:["PY","SA"],PER:["PE","SA"],PHI:["PH","AS"],
  POL:["PL","EU"],POR:["PT","EU"],PRK:["KP","AS"],PUR:["PR","NA"],QAT:["QA","AS"],ROU:["RO","EU"],RSA:["ZA","AF"],
  RUS:["RU","EU"],SGP:["SG","AS"],SLO:["SI","EU"],SMR:["SM","EU"],SRB:["RS","EU"],SRI:["LK","AS"],SUI:["CH","EU"],
  SVK:["SK","EU"],SWE:["SE","EU"],TAN:["TZ","AF"],THA:["TH","AS"],TPE:["TW","AS"],TUN:["TN","AF"],TUR:["TR","AS"],
  UAE:["AE","AS"],UGA:["UG","AF"],UKR:["UA","EU"],URU:["UY","SA"],USA:["US","NA"],UZB:["UZ","AS"],VEN:["VE","SA"],
  VIE:["VN","AS"],ZIM:["ZW","AF"],
};
const iocMap = new Map(Object.entries(IOC).map(([k, [cc, co]]) => [k, { cc, co }]));
console.log("landekoder:", iocMap.size);

// 1) kalendersiden: månedsheadere + emner i dokumentrækkefølge
const kal = await (await fetch("https://aims-worldrunning.org/calendar.html", UA)).text();
const MDR_EN = { January: "01", February: "02", March: "03", April: "04", May: "05", June: "06", July: "07", August: "08", September: "09", October: "10", November: "11", December: "12" };
const tokens = [...kal.matchAll(/class="calendar-month-header"[^>]*>\s*([A-Za-z]+)\s+(\d{4})|<div class="calendar-item">([\s\S]*?)<!-- end of item -->/g)];
const emner = [];
let år = null, md = null;
for (const t of tokens) {
  if (t[1]) { md = MDR_EN[t[1]]; år = t[2]; continue; }
  const blok = t[3];
  if (!md) continue;
  const dag = blok.match(/calendar-date[^"]*">\s*(\d{1,2})?/)?.[1] || null;
  const tbc = /calendar-date-tbc/.test(blok);
  const navnM = blok.match(/href="https:\/\/www\.aims-worldrunning\.org\/races\/(\d+)\.html">([^<]+)</);
  const ioc = blok.match(/countries\/\d+\.html">([A-Z]{3})</)?.[1];
  if (!navnM || !ioc) continue;
  emner.push({ raceId: navnM[1], navn: navnM[2].trim().replace(/\s+/g, " "), ioc, m: `${år}-${md}`, dt: (!tbc && dag) ? `${år}-${md}-${String(dag).padStart(2, "0")}` : null });
}
console.log("kalender-emner:", emner.length);

// dedupe (samme løb optræder én gang pr. race-id; navne-dedupe mod eksisterende kilder)
const set = new Set();
const valgte = [];
const iDag = new Date().toISOString().slice(0, 10);
for (const e of emner) {
  const nøgle = norm(e.navn);
  if (set.has(nøgle) || kendte.has(nøgle)) continue;
  if (e.dt ? e.dt < iDag : e.m < iDag.slice(0, 7)) continue;
  if (!iocMap.has(e.ioc)) { continue; }
  set.add(nøgle);
  valgte.push(e);
}
console.log("nye unikke:", valgte.length);

function klassificer(navn) {
  const n = navn.toLowerCase();
  if (/ultra|100k|50k|100 ?mile|24h|24 hour/.test(n)) return ["ultra", "Ultra"];
  if (/half|halv|semi|21k|1\/2|½/.test(n)) return ["half", "21,1 km"];
  if (/marathon|maraton|maratón|42/.test(n)) return ["marathon", "42,2 km"];
  if (/10k|10 ?km/.test(n)) return ["kort", "10 km"];
  return ["kort", "Løb"];
}

// 2) race-sider: by + officielt website (høfligt tempo)
const geoCache = new Map();
async function geokod(by, cc) {
  const nøgle = by + "|" + cc;
  if (geoCache.has(nøgle)) return geoCache.get(nøgle);
  try {
    const d = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(by)}&count=5&language=en`)).json();
    const hit = (d.results || []).find(x => x.country_code === cc) || null;
    const res = hit ? [+hit.latitude.toFixed(4), +hit.longitude.toFixed(4)] : null;
    geoCache.set(nøgle, res);
    return res;
  } catch (_) { geoCache.set(nøgle, null); return null; }
}

const alle = [];
const dropped = [];
let n = 0;
for (const e of valgte) {
  n++;
  if (n % 50 === 0) console.log(`  ${n}/${valgte.length}...`);
  await sov(220);
  let side;
  try { side = await (await fetch(`https://www.aims-worldrunning.org/races/${e.raceId}.html`, UA)).text(); }
  catch (_) { dropped.push([e.navn, "side"]); continue; }
  // sted: hCalendar-location når det er en ægte adresse (ikke placeholder-teksten)
  const lokation = [...side.matchAll(/class="location[^"]*"[^>]*>([^<]{3,80})</g)]
    .map(x => x[1].trim()).find(x => x && !/consult race website/i.test(x));
  const by = lokation ? lokation.split(",")[0].trim() : null;
  // officielt website: link mærket med "website" i konteksten; ellers AIMS' egen race-side
  const site = side.match(/(?:race website|official website|website)[^"]{0,200}?href="(https?:\/\/(?!www\.aims|aims)[^"]+)"/i)?.[1]
    || `https://www.aims-worldrunning.org/races/${e.raceId}.html`;
  // præcis dato fra sidens dtstart, hvis kalenderen kun havde måned
  const dtSide = side.match(/<time datetime="(\d{4}-\d{2}-\d{2})" class="dtstart/)?.[1];
  const dt = e.dt || dtSide || null;
  const { cc, co } = iocMap.get(e.ioc);
  const koord = by ? await geokod(by, cc) : null;
  if (!koord) { dropped.push([e.navn, "geokode: " + (by || "ingen by")]); continue; }
  const [t, d] = klassificer(e.navn);
  alle.push([e.navn.slice(0, 80), by, cc, co, koord[0], koord[1], t, d, dt ? dt.slice(0, 7) : e.m, dt, site.slice(0, 160)]);
}
console.log(`færdig: ${alle.length} løb, droppet ${dropped.length}`);
const årsager = {};
for (const [, hvorfor] of dropped) årsager[hvorfor.split(":")[0]] = (årsager[hvorfor.split(":")[0]] || 0) + 1;
console.log("drop-årsager:", årsager);

alle.sort((a, b) => (a[9] || a[8] + "-99").localeCompare(b[9] || b[8] + "-99"));
const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-aims.js",
  `// Autogenereret af tools/build-aims.mjs - kilde: AIMS-kalenderen (${alle.length} løb, verden)\n` +
  `// Kompakt format: [navn, by, cc, co, lat, lng, type, distance, måned, dato|null, officiel-url]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1], cc: a[2], co: a[3], la: a[4], lo: a[5], t: a[6], d: a[7], m: a[8], dt: a[9] || undefined, p: null, u: a[10] });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: data/races-aims.js skrevet`);
