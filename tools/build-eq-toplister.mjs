// Nordiske leaderboards fra EQ Timings offentlige resultat-API (Norges/Nordens
// store tidtager; robots forbyder kun /api/Startlist, resultater er åbne).
// MINIMERING (GDPR): kun top-3 pr. løb, kun fornavn + efternavns-initial, aldrig
// klub/alder; Anonym-flag respekteres; kildekreditering + link til fulde resultater.
// Skriver ind i data/toplister.json under boards[kat].nordisk. Kør efter build-toplister.
import { readFileSync, writeFileSync } from "fs";

const UA = { headers: { "User-Agent": "Mozilla/5.0 (RunninBot; kalender-/resultatfakta m. link-out)" } };
const sov = ms => new Promise(r => setTimeout(r, ms));

const DISTANCER = { marathon: 42.195, half: 21.0975, "10k": 10, "5k": 5 };
const sekTilTid = s => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
};
function kategori(navn) {
  const n = navn.toLowerCase();
  if (/ultra|100 ?km|50 ?km|backyard/.test(n)) return null; // ultra hører til DUV
  if (/marathon|maraton/.test(n) && !/half|halv|semi/.test(n)) return ["marathon", 2 * 3600 + 600, 6.5 * 3600];
  if (/half|halv|semi|21[.,]1? ?km|21k/.test(n)) return ["half", 62 * 60, 3.5 * 3600];
  if (/10 ?km|10k/.test(n)) return ["10k", 28 * 60 + 30, 105 * 60];
  if (/\b5 ?km\b|\b5k\b/.test(n)) return ["5k", 13 * 60 + 40, 60 * 60];
  return null;
}

// 1) events seneste 60 dage
const fra = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10) + " 00:00";
const til = new Date().toISOString().slice(0, 10) + " 23:59";
const ev = await (await fetch(`https://live.eqtiming.com/api/Events?query=&dateFrom=${encodeURIComponent(fra)}&dateTo=${encodeURIComponent(til)}&organizationId=0&take=1500&dateSort=true&desc=true&onlyValidated=false&onlyshowfororganizer=false&graded=false&racequality=false`, UA)).json();
const events = (Array.isArray(ev) ? ev : ev.Events || ev.Items || []).filter(e => kategori(e.Name || ""));
console.log("EQ-events m. relevant distance:", events.length);

const boards = { marathon: [], half: [], "10k": [], "5k": [] };
let n = 0;
for (const e of events.slice(0, 300)) {
  n++;
  if (n % 25 === 0) console.log(`  ${n}/${Math.min(events.length, 300)}...`);
  const k = kategori(e.Name);
  if (!k) continue;
  await sov(200);
  try {
    const detalje = await (await fetch(`https://live.eqtiming.com/api/Event/${e.Id}`, UA)).json();
    // navne-opslag pr. deltager-UID
    const cont = await (await fetch(`https://live.eqtiming.com/api/Contestants/${e.Id}`, UA)).json();
    const contItems = cont.Items || cont || {};
    // Etapper og StasjonsOppsett er dicts (id→objekt); race-id = højeste etappe-nøgle (målpassering)
    const etappeIder = Object.keys(detalje.Etapper || {}).map(Number).sort((a, b) => b - a);
    const stationIder = Object.keys(detalje.StasjonsOppsett || {}).map(Number);
    if (!etappeIder.length || !stationIder.length) continue;
    const raceId = etappeIder[0];
    const stationId = stationIder[0];
    const res = await (await fetch(`https://live.eqtiming.com/api/Result/Total/${e.Id}/${raceId}?justTimeData=true&count=8&startAt=1&station=${stationId}&query=&round=1&passes=false`, UA)).json();
    let taget = 0;
    for (const it of res.Items || []) {
      if (taget >= 3) break;
      const sek = (it.RangeringsTid || it.AkkumulertTid || 0) / 1000;
      if (!sek || sek < k[1] || sek > k[2]) continue;
      // find deltager via etappe-deltager-UID → contestant → Utover
      const c = Object.values(contItems).find(x =>
        Object.values(x.EtappeDeltaker || {}).some(ed => ed.UID === it.EtappeDeltakerUID));
      const p = c?.Utover;
      if (!p || c.Anonym || !p.Fornavn) continue;
      taget++;
      boards[k[0]].push({
        navn: `${p.Fornavn} ${(p.Etternavn || "").slice(0, 1)}.`.trim(),
        tid: sekTilTid(sek), sek,
        løb: e.Name.slice(0, 60),
        cc: (p.Land?.ISO2 || "NO").toUpperCase(),
        by: "",
        pace: sekTilTid(sek / DISTANCER[k[0]]),
        url: `https://live.eqtiming.com/${e.Id}`,
      });
    }
  } catch (_) { /* enkelte events fejler - ok */ }
}

for (const kat of Object.keys(boards)) {
  const set = new Set();
  boards[kat] = boards[kat].sort((a, b) => a.sek - b.sek)
    .filter(r => { const key = r.navn + r.tid; if (set.has(key)) return false; set.add(key); return true; })
    .slice(0, 25).map(({ sek, ...r }) => r);
  console.log(`nordisk ${kat}: ${boards[kat].length}, hurtigst ${boards[kat][0]?.tid || "-"}`);
}

// flet ind i den eksisterende toplister.json som separat region
const data = JSON.parse(readFileSync("data/toplister.json", "utf8"));
data.nordisk = boards;
data.nordiskKilde = "EQ Timing - offentlige resultater, seneste 60 dage (Norden)";
writeFileSync("data/toplister.json", JSON.stringify(data));
console.log("OK: nordiske leaderboards flettet ind i data/toplister.json");
