// Beriger en officiel rutefil med depoter/stationer og højdeprofil.
// Stationer angives som JSON-fil [[navn, lat, lng], ...] og projiceres til
// nærmeste rutepunkt (km-mærke beregnes). Højder hentes fra Open-Meteos frie
// elevation-API for hvert rutepunkt.
// Kør: node tools/berig-rute.mjs data/ruter/<slug>.json stationer.json
import { readFileSync, writeFileSync } from "fs";

const [, , ruteFil, stationsFil] = process.argv;
if (!ruteFil) { console.error("Brug: node tools/berig-rute.mjs <rutefil> [stationsfil]"); process.exit(1); }

const rute = JSON.parse(readFileSync(ruteFil, "utf8"));
const R = 6371, rad = x => x * Math.PI / 180;
const kmMellem = (a, b) => {
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// kumulative km pr. rutepunkt
const kumKm = [0];
for (let i = 1; i < rute.punkter.length; i++) kumKm.push(kumKm[i - 1] + kmMellem(rute.punkter[i - 1], rute.punkter[i]));

// stationer: projicér til nærmeste rutepunkt
if (stationsFil) {
  const stationer = JSON.parse(readFileSync(stationsFil, "utf8"));
  rute.stationer = stationer.map(([navn, la, lo]) => {
    let bedst = 0, bedstD = Infinity;
    rute.punkter.forEach((p, i) => {
      const d = kmMellem(p, [lo, la]);
      if (d < bedstD) { bedstD = d; bedst = i; }
    });
    return { navn, la, lo, km: +kumKm[bedst].toFixed(1) };
  }).sort((a, b) => a.km - b.km);
  console.log("stationer:", rute.stationer.map(s => `${s.navn} (${s.km} km)`).join(", "));
}

// højdeprofil: Open-Meteo elevation, 100 punkter pr. kald
const højder = [];
for (let i = 0; i < rute.punkter.length; i += 100) {
  const bid = rute.punkter.slice(i, i + 100);
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${bid.map(p => p[1]).join(",")}&longitude=${bid.map(p => p[0]).join(",")}`;
  const d = await (await fetch(url)).json();
  højder.push(...d.elevation.map(h => Math.round(h)));
  await new Promise(r => setTimeout(r, 300));
}
rute.højde = højder;
const stigning = højder.reduce((s, h, i) => i && h > højder[i - 1] ? s + (h - højder[i - 1]) : s, 0);
rute.stigning = stigning;

writeFileSync(ruteFil, JSON.stringify(rute));
console.log(`OK: ${ruteFil} - ${højder.length} højdepunkter, +${stigning} m samlet stigning`);
