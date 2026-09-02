// Bygger data/toplister.json fra RunSignups åbne resultat-API (de opfordrer selv
// til offentlige leaderboard-apps på API'et). Seneste ~30 dages offentlige
// resultatsæt aggregeres til toplister pr. distance: hurtigste tider + største løb.
// Kun offentliggjorte resultater, kun fornavn + efternavns-initial - aldrig mere.
// Kør: node tools/build-toplister.mjs
import { writeFileSync } from "fs";

const UA = { headers: { "User-Agent": "curl/8.6.0", "Accept": "application/json" } };
const sov = ms => new Promise(r => setTimeout(r, ms));

// 1) hent seneste 30 dages opdaterede resultatsæt
const siden = Math.floor(Date.now() / 1000) - 60 * 86400;
const sæt = [];
for (let side = 1; side <= 30; side++) {
  const url = `https://runsignup.com/rest/v2/results/updated-result-sets.json?modified_since_timestamp=${siden}&page=${side}&num_per_page=100`;
  const d = await (await fetch(url, UA)).json();
  const batch = d.result_sets || [];
  sæt.push(...batch);
  if (batch.length < 100) break;
  await sov(150);
}
console.log("resultatsæt fundet:", sæt.length);

// 2) klassificér på sæt-/løbsnavn; virtuelle løb og stafetter frasorteres
const DISTANCER = { marathon: 42.195, half: 21.0975, "10k": 10, "5k": 5 };
// [kategori, ja-mønster, nej-mønster, tidsgulv, tidsloft] - lofter holder støj (ultra/stafet/gå) ude
const KATEGORIER = [
  ["marathon", /marathon|26\.2/i, /half|1\/2|½|relay|ultra/i, 2 * 3600 + 600, 6.5 * 3600],
  ["half", /half|1\/2|½|13\.1/i, /relay|ultra/i, 62 * 60, 3.5 * 3600],
  ["10k", /10k|10 km/i, /relay|ultra/i, 28 * 60 + 30, 105 * 60],
  ["5k", /5k|5 km/i, /relay|10k|ultra/i, 13 * 60 + 40, 60 * 60],
];
const iÅr = new Date().getFullYear();
function kategori(s) {
  const navn = `${s.individual_result_set_name} ${s.race_name}`;
  if (/virtual|virtuel/i.test(navn)) return null;
  // gamle løb dukker op når deres resultatsæt REDIGERES - årstal i navnet afslører dem
  const årINavn = navn.match(/\b(20\d\d)\b/);
  if (årINavn && +årINavn[1] < iÅr) return null;
  for (const [kat, ja, nej, gulv, loft] of KATEGORIER) {
    if (ja.test(s.individual_result_set_name) && !nej.test(navn)) return { kat, gulv, loft };
  }
  // fallback på race-navnet KUN når det matcher præcis én kategori - multi-distance-løb
  // ("5k, 10K, HALF MARATHON & Fun Run") kan ellers hælde 10K-tider i half-listen
  const kandidater = KATEGORIER.filter(([, ja]) => ja.test(s.race_name));
  if (kandidater.length === 1 && /overall|results/i.test(s.individual_result_set_name)) {
    const [kat, , nej, gulv, loft] = kandidater[0];
    if (!nej.test(navn)) return { kat, gulv, loft };
  }
  return null;
}

const tidTilSek = t => {
  if (!t || !/^\d+:\d{2}(:\d{2})?(\.\d+)?$/.test(t)) return null;
  const dele = t.split(":").map(parseFloat);
  return dele.length === 3 ? dele[0] * 3600 + dele[1] * 60 + dele[2] : dele[0] * 60 + dele[1];
};
const sekTilTid = s => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
};

// 3) hent topresultater pr. relevant sæt (høfligt, cap på arbejdet)
const alleRelevante = sæt.map(s => ({ s, k: kategori(s) })).filter(x => x.k);
// marathon-sæt er sjældne og må aldrig crowdes ud - kvoter pr. kategori (nyeste først)
const KVOTER = { marathon: 400, half: 250, "10k": 200, "5k": 150 };
const prKat = {};
for (const x of alleRelevante.reverse()) (prKat[x.k.kat] ??= []).push(x);
const relevante = Object.entries(KVOTER).flatMap(([kat, kvote]) => (prKat[kat] || []).slice(0, kvote));
console.log('relevante sæt:', alleRelevante.length, '→ behandles:', relevante.length,
  Object.fromEntries(Object.keys(KVOTER).map(k => [k, (prKat[k] || []).length])));
const CAP = 1000;
const boards = { marathon: [], half: [], "10k": [], "5k": [] };
const største = new Map(); // race_id → {løb, iMål}
let behandlet = 0;
for (const { s, k } of relevante.slice(0, CAP)) {
  behandlet++;
  if (behandlet % 50 === 0) console.log(`  ${behandlet}/${Math.min(relevante.length, CAP)}...`);
  await sov(180);
  try {
    const url = `https://runsignup.com/rest/race/${s.race_id}/results/get-results?format=json&event_id=${s.event_id}&individual_result_set_id=${s.individual_result_set_id}&results_per_page=5`;
    const d = await (await fetch(url, UA)).json();
    const rs = d.individual_results_sets?.[0];
    if (!rs?.results?.length) continue;
    if (rs.results_count || rs.total_results) {
      const antal = rs.results_count || rs.total_results;
      const eks = største.get(s.race_id);
      if (!eks || antal > eks.iMål) største.set(s.race_id, { løb: s.race_name.slice(0, 60), iMål: antal });
    }
    for (const r of rs.results.slice(0, 3)) {
      const sek = tidTilSek(r.chip_time || r.clock_time);
      if (!sek || sek < k.gulv || sek > k.loft) continue; // urealistiske tider = datastøj
      if (!r.first_name) continue;
      boards[k.kat].push({
        navn: `${r.first_name} ${(r.last_name || "").slice(0, 1)}.`.trim(),
        tid: sekTilTid(sek), sek,
        løb: s.race_name.slice(0, 60),
        cc: (r.country_code || "US").toUpperCase().slice(0, 2),
        by: [r.city, r.state].filter(Boolean).join(", ").slice(0, 34),
        pace: sekTilTid(sek / DISTANCER[k.kat]),
      });
    }
  } catch (_) { /* enkelte sæt fejler - ok */ }
}

for (const kat of Object.keys(boards)) {
  const set = new Set();
  const prLøb = {};
  boards[kat] = boards[kat].sort((a, b) => a.sek - b.sek)
    .filter(r => { const k = r.navn + r.tid; if (set.has(k)) return false; set.add(k); return true; })
    .filter(r => (prLøb[r.løb] = (prLøb[r.løb] || 0) + 1) <= 3) // maks 3 pr. løb - variation over dominans
    .slice(0, 25).map(({ sek, ...r }) => r);
  console.log(`${kat}: ${boards[kat].length} rækker, hurtigst ${boards[kat][0]?.tid || "-"}`);
}
const størsteListe = [...største.values()].sort((a, b) => b.iMål - a.iMål).slice(0, 15);
console.log("største løb:", størsteListe.length, "- top:", størsteListe[0]);

writeFileSync("data/toplister.json", JSON.stringify({
  opdateret: new Date().toISOString().slice(0, 10),
  kilde: "RunSignup - offentlige resultater, seneste 60 dage (USA)",
  boards, største: størsteListe,
}));
console.log("OK: data/toplister.json");
