// Henter norske løb fra Kondis' terminliste (terminlista.kondis.no - offentlig
// Firestore-kalender, web-API-nøglen er offentlig i deres bundle; robots uden regler).
// Geokodning: Kartverkets åbne stedsnavn-API. Vi gemmer KUN offentlige løbsfakta -
// aldrig kontakt-/brugerfelter fra deres dokumenter.
// Kør: node tools/build-kondis.mjs
import { readFileSync, writeFileSync } from "fs";

const NØGLE = "AIzaSyAbf9X_CcYKC-WSAkVijyKc5m3vDgR8slY"; // offentlig web-nøgle fra deres frontend
const BASE = `https://firestore.googleapis.com/v1/projects/kondisapp/databases/(default)/documents:runQuery?key=${NØGLE}`;
const sov = ms => new Promise(r => setTimeout(r, ms));

const norm = n => n.toLowerCase().replace(/\s*\d{4}\s*$/, "").replace(/[^a-zæøåäö0-9]/g, "");
const kendte = new Set();
for (const fil of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-rid.js"]) {
  for (const m of readFileSync(fil, "utf8").matchAll(/(?:"n"\s*:\s*|^\s*\[)"([^"]+)"/gm)) kendte.add(norm(m[1]));
}

const s = f => f?.stringValue ?? "";
const iDag = new Date().toISOString().slice(0, 10);

// 1) sider gennem mainEvents
const events = [];
let cursor = null;
while (true) {
  const q = {
    structuredQuery: {
      from: [{ collectionId: "mainEvents" }],
      where: { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: `${iDag}T00:00:00Z` } } },
      orderBy: [{ field: { fieldPath: "date" }, direction: "ASCENDING" }, { field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: 300,
    },
  };
  if (cursor) q.structuredQuery.startAt = { values: cursor, before: false };
  const rows = await (await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q) })).json();
  const docs = rows.filter(r => r.document);
  if (!docs.length) break;
  for (const { document: d } of docs) events.push(d);
  const sidste = docs[docs.length - 1].document;
  cursor = [{ timestampValue: sidste.fields.date.timestampValue }, { referenceValue: sidste.name }];
  console.log(`hentet ${events.length}...`);
  if (docs.length < 300) break;
  await sov(300);
}

// 2) klassificér + saml unikke (ugentlige motionsløb dedupes på navn - første dato vinder)
const stat = {};
const valgte = [];
const set = new Set();
for (const d of events) {
  const f = d.fields;
  const sport = s(f.sportType) || "?";
  stat[sport] = (stat[sport] || 0) + 1;
  if (!["running", "trail", "triathlon", "trailrunning", "ultra"].includes(sport)) continue;
  const land = s(f.address?.mapValue?.fields?.country) || "Norge";
  if (!/norge|norway/i.test(land)) continue;
  const navn = s(f.name).replace(/\s+/g, " ").trim();
  if (!navn) continue;
  const nøgle = norm(navn);
  if (set.has(nøgle) || kendte.has(nøgle)) continue;
  set.add(nøgle);

  const by = s(f.address?.mapValue?.fields?.town) || s(f.address?.mapValue?.fields?.area);
  const dato = (s(f.date) || f.date?.timestampValue || "").slice(0, 10);
  const dists = (f.distances?.arrayValue?.values || []).map(v => +s(v.mapValue?.fields?.length) || 0);
  const max = Math.max(0, ...dists);
  const overflader = (f.surfaces?.arrayValue?.values || []).map(v => v.stringValue || "");
  const n = navn.toLowerCase();
  let t, dist;
  if (sport === "triathlon") [t, dist] = ["tri", "Triatlon"];
  else if (/ultra|backyard/.test(n) || max >= 50000) [t, dist] = ["ultra", max >= 1000 ? `${Math.round(max / 1000)} km` : "Trail"];
  else if (overflader.some(o => /terrain|trail/.test(o))) [t, dist] = ["ultra", "Trail"];
  else if (max >= 41000) [t, dist] = ["marathon", "42,2 km"];
  else if (max >= 20000) [t, dist] = ["half", "21,1 km"];
  else [t, dist] = ["kort", max >= 1000 ? `${(max / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} km` : "Løb"];

  // link-prioritet: ægte tilmeldingslink > Kondis' egen event-side (aldrig klub-forsiden)
  const urls = (f.urls?.arrayValue?.values || []).map(v => s(v.mapValue?.fields?.url)).filter(u => /^https?:\/\//.test(u));
  const tilmeld = urls.find(u => /p[åa]meld|signup|sign-up|registr|deltager|checkout|events?\//i.test(u));
  const eventSide = `https://terminlista.kondis.no/l%C3%B8ping/event/${s(f.id)}`;
  valgte.push({ navn, by, dato, t, dist, url: tilmeld || eventSide });
}
console.log("sportTyper:", stat);
console.log("valgte (unikke, løb/trail/tri):", valgte.length);

// 3) geokod byer via Kartverket (cache pr. by)
const koordCache = new Map();
async function geokod(by) {
  if (!by) return null;
  if (koordCache.has(by)) return koordCache.get(by);
  await sov(120);
  try {
    const r = await (await fetch(`https://api.kartverket.no/stedsnavn/v1/navn?sok=${encodeURIComponent(by)}&treffPerSide=10&utkoordsys=4258`)).json();
    const navne = r.navn || [];
    const hit = navne.find(x => ["By", "Tettsted", "Tettbebyggelse", "Bygd", "Grend"].includes(x.navneobjekttype)) || navne[0];
    const p = hit?.representasjonspunkt;
    const res = p ? [+p.nord.toFixed(4), +p.øst.toFixed(4)] : null;
    koordCache.set(by, res);
    return res;
  } catch (_) { koordCache.set(by, null); return null; }
}

const alle = [];
const dropped = [];
for (const v of valgte) {
  const k = await geokod(v.by);
  if (!k) { dropped.push(`${v.navn} (${v.by || "ingen by"})`); continue; }
  alle.push([v.navn.slice(0, 80), v.by, k[0], k[1], v.t, v.dist, v.dato, v.url]);
}
console.log(`geokodet: ${alle.length}, droppet: ${dropped.length}`);
if (dropped.length) console.log("droppet:", dropped.slice(0, 12).join(" | "));

alle.sort((a, b) => a[6].localeCompare(b[6]));
const body = alle.map(r => JSON.stringify(r)).join(",\n");
writeFileSync("data/races-kondis.js",
  `// Autogenereret af tools/build-kondis.mjs - kilde: Kondis terminlista (Norge, ${alle.length} løb)\n` +
  `// Kompakt format: [navn, by, lat, lng, type, distance, dato, url]\n` +
  `for (const a of [\n${body},\n]) RACES.push({ n: a[0], c: a[1], cc: "NO", co: "EU", la: a[2], lo: a[3], t: a[4], d: a[5], m: a[6].slice(0, 7), dt: a[6], p: null, u: a[7] });\n` +
  `RACES.forEach((r, i) => (r.id = i));\n`);
console.log(`OK: ${alle.length} løb skrevet til data/races-kondis.js`);
