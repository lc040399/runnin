// Land-validerer danske løbs-koordinater: DAWA reverse-geokodning finder nærmeste
// adresse - ligger den >1 km væk, er punktet i havet (kyst-postnumres visueltcenter).
// Re-geokoder via stednavne2 og vælger kandidaten NÆRMEST det gamle punkt - havpunktet
// ligger i samme egn som byen, så det disambiguerer navnebrødre (Højbjerg, Borre m.fl.).
// Kør: node tools/fix-coords.mjs
import { readFileSync, writeFileSync } from "fs";

const FILER = ["data/races-st.js"];
const sov = ms => new Promise(r => setTimeout(r, ms));

const hav = (la1, lo1, la2, lo2) => { // meter
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

async function afstandTilLand(la, lo) {
  const r = await fetch(`https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lo}&y=${la}&struktur=mini`);
  if (!r.ok) return null;
  const a = await r.json();
  if (!a?.x) return null;
  return hav(la, lo, a.y, a.x);
}

// "Aalborg SV"/"Aarhus C" er postdistrikter, ikke bebyggelser - strip retningssuffikset
const renBy = by => by.replace(/\s+(C|V|Ø|N|S|SV|SØ|NV|NØ)$/u, "");

async function geokodBy(by, nærLa, nærLo) {
  const r = await fetch(`https://api.dataforsyningen.dk/stednavne2?q=${encodeURIComponent(renBy(by))}&hovedtype=Bebyggelse&per_side=20`);
  const kandidater = (await r.json()) || [];
  let bedst = null, bedstD = Infinity;
  for (const k of kandidater) {
    const vc = k.sted?.visueltcenter;
    if (!vc) continue;
    const d = hav(nærLa, nærLo, vc[1], vc[0]);
    if (d < bedstD) { bedstD = d; bedst = [vc[1], vc[0]]; }
  }
  // byen skal ligge i samme egn som havpunktet - ellers er det et navnebror-match
  return bedstD < 60000 ? bedst : null;
}

for (const fil of FILER) {
  let src = readFileSync(fil, "utf8");
  const linjer = src.split("\n");
  let rettet = 0, tjekket = 0;
  for (let i = 0; i < linjer.length; i++) {
    const m = linjer[i].match(/^\s*(\{.*\}),?\s*$/);
    if (!m) continue;
    let r; try { r = JSON.parse(m[1]); } catch (_) { continue; }
    if (r.cc !== "DK" || !r.la) continue;
    tjekket++;
    await sov(60);
    const d = await afstandTilLand(r.la, r.lo);
    if (d === null || d < 1000) continue;
    const ny = await geokodBy(r.c, r.la, r.lo);
    if (!ny) { console.log(`  !! ${r.n} (${r.c}): ${Math.round(d)} m fra land, ingen by i egnen`); continue; }
    const d2 = await afstandTilLand(ny[0], ny[1]);
    if (d2 === null || d2 > 1000) { console.log(`  !! ${r.n} (${r.c}): by-center også vådt (${Math.round(d2)} m)`); continue; }
    console.log(`  fix ${r.n} (${r.c}): ${r.la},${r.lo} (${(d / 1000).toFixed(1)} km fra land) → ${ny[0].toFixed(4)},${ny[1].toFixed(4)}`);
    r.la = +ny[0].toFixed(4); r.lo = +ny[1].toFixed(4);
    linjer[i] = linjer[i].replace(m[1], JSON.stringify(r));
    rettet++;
  }
  if (rettet) writeFileSync(fil, linjer.join("\n"));
  console.log(`${fil}: ${tjekket} DK-løb tjekket, ${rettet} rettet`);
}
