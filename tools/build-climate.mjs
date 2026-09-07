// build-climate.mjs — forudberegner klima-normaler pr. 0,5°-celle, så løbs-
// detaljen kan vise en 12-måneders vejr-graf ØJEBLIKKELIGT (ingen API-kald pr.
// visning). Data = Open-Meteo arkiv (gratis, ingen nøgle), 3 seneste hele år.
// Batch: mange lokationer pr. kald → ~36 kald i alt (venligt mod rate-limits).
// Kør: node tools/build-climate.mjs   →   data/climate.json
import fs from "node:fs";

const RACES = JSON.parse(fs.readFileSync("data/races.json", "utf8"));
const UD = "data/climate.json";
const START = "2022-01-01", SLUT = "2024-12-31";
const BATCH = 50;              // lokationer pr. kald
const PAUSE = 10000;           // ms mellem batches
const round05 = x => Math.round(x * 2) / 2;
const celleKey = (la, lo) => `${round05(la).toFixed(1)},${round05(lo).toFixed(1)}`;

// unikke celler (celle-center som repr. koordinat)
const celler = new Map();
for (const r of RACES) {
  const k = celleKey(r.la, r.lo);
  if (!celler.has(k)) celler.set(k, { la: round05(r.la), lo: round05(r.lo) });
}
console.log(`${RACES.length} løb → ${celler.size} unikke klima-celler`);

// eksisterende output → genoptag
let ud = {};
if (fs.existsSync(UD)) { try { ud = JSON.parse(fs.readFileSync(UD, "utf8")).celler || {}; } catch (_) {} }

const sov = ms => new Promise(r => setTimeout(r, ms));

// aggregér ét lokations-svar til 12 måneders normaler
function aggreger(dl) {
  const tid = dl.time, temp = dl.temperature_2m_mean, regn = dl.precipitation_sum;
  const sumT = Array(12).fill(0), antT = Array(12).fill(0), dage = Array(12).fill(0), vaade = Array(12).fill(0);
  for (let i = 0; i < tid.length; i++) {
    const m = +tid[i].slice(5, 7) - 1;
    if (temp[i] != null) { sumT[m] += temp[i]; antT[m]++; }
    if (regn[i] != null) { dage[m]++; if (regn[i] >= 1) vaade[m]++; }
  }
  return {
    t: sumT.map((s, m) => antT[m] ? Math.round(s / antT[m]) : null),
    r: vaade.map((v, m) => dage[m] ? Math.round((v / dage[m]) * 100) : null),
  };
}

async function hentBatch(batch) {
  const las = batch.map(c => c.la).join(",");
  const los = batch.map(c => c.lo).join(",");
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${las}&longitude=${los}` +
    `&start_date=${START}&end_date=${SLUT}&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (res.status === 429) throw new Error("429");
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  return Array.isArray(d) ? d : [d];   // ét lokation → objekt, ellers array
}

// manglende celler i batches
const mangler = [...celler.entries()].filter(([k]) => !ud[k]).map(([k, v]) => ({ k, ...v }));
console.log(`${Object.keys(ud).length} allerede hentet, ${mangler.length} mangler`);

let gjort = Object.keys(ud).length, fejl = 0;
for (let i = 0; i < mangler.length; i += BATCH) {
  const batch = mangler.slice(i, i + BATCH);
  let forsoeg = 0, ok = false, andreFejl = 0;
  // 429 = rate-limit: vent 10 min og prøv IGEN i det uendelige (dags-grænsen
  // nulstiller UTC-midnat), så kørslen selv-fuldfører i nat. Andre fejl: maks 4.
  while (!ok) {
    try {
      const svar = await hentBatch(batch);
      svar.forEach((lok, j) => { if (lok?.daily) { ud[batch[j].k] = aggreger(lok.daily); gjort++; } });
      ok = true;
    } catch (e) {
      forsoeg++;
      if (e.message === "429") {
        console.log(`  batch @${i}: rate-limit, venter 600s (forsøg ${forsoeg}) [${new Date().toISOString().slice(11,16)}Z]`);
        await sov(600000);
      } else {
        andreFejl++;
        if (andreFejl >= 4) { console.log(`  batch @${i}: opgiver (${e.message})`); break; }
        await sov(5000 * andreFejl);
      }
    }
  }
  if (!ok) fejl += batch.length;
  fs.writeFileSync(UD, JSON.stringify({ opdateret: SLUT, gitter: 0.5, celler: ud }));
  if (i % 250 === 0 || ok) console.log(`  ${gjort}/${celler.size} celler gemt`);
  await sov(PAUSE);
}
fs.writeFileSync(UD, JSON.stringify({ opdateret: SLUT, gitter: 0.5, celler: ud }));
console.log(`FÆRDIG: ${gjort} celler, ${fejl} fejlede → ${UD}`);
