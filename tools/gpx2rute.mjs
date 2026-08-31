// Konverterer en officiel rute (GPX-fil ELLER Overpass-relation-JSON) til Runnins
// ruteformat: data/ruter/<slug>.json = { navn, kilde, punkter: [[lng,lat],...] }.
// Kør: node tools/gpx2rute.mjs <input.gpx|overpass.json> "<Løbets navn>" "<kilde-tekst>"
// Ruter må KUN tilføjes fra legitime kilder: arrangørens egen GPX eller OSM-relationer
// (permanente afmærkede stier, ODbL) - aldrig sporet fra andres kortprodukter.
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const [, , input, navn, kilde] = process.argv;
if (!input || !navn || !kilde) {
  console.error('Brug: node tools/gpx2rute.mjs <fil> "<Løbets navn>" "<kilde>"');
  process.exit(1);
}

const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const råt = readFileSync(input, "utf8");

let punkter = [];
if (råt.trimStart().startsWith("{")) {
  // Overpass-JSON: sy relationens veje sammen til én linje (stykker kan vende forkert)
  const d = JSON.parse(råt);
  const rel = d.elements.find(e => e.type === "relation");
  const stykker = rel.members.filter(m => m.type === "way" && m.geometry)
    .map(m => m.geometry.map(p => [p.lon, p.lat]));
  // grådig syning m. hul-tolerance: relationer har småhuller, så vi hægter altid
  // det NÆRMESTE ledige stykke på (vendt om nødvendigt), så længe hullet er < ~400 m
  const brugt = new Set([0]);
  let linje = [...stykker[0]];
  const afst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const MAKS_HUL = 0.02;
  while (brugt.size < stykker.length) {
    let bedst = null;
    for (let i = 0; i < stykker.length; i++) {
      if (brugt.has(i)) continue;
      const s = stykker[i], ende = linje[linje.length - 1], start = linje[0];
      const kandidater = [
        { d: afst(ende, s[0]), i, mode: "endeFrem" },
        { d: afst(ende, s[s.length - 1]), i, mode: "endeBag" },
        { d: afst(start, s[s.length - 1]), i, mode: "startFrem" },
        { d: afst(start, s[0]), i, mode: "startBag" },
      ];
      for (const k of kandidater) if (!bedst || k.d < bedst.d) bedst = k;
    }
    if (!bedst || bedst.d > MAKS_HUL) break;
    const s = stykker[bedst.i];
    if (bedst.mode === "endeFrem") linje.push(...s);
    else if (bedst.mode === "endeBag") linje.push(...[...s].reverse());
    else if (bedst.mode === "startFrem") linje.unshift(...s);
    else linje.unshift(...[...s].reverse());
    brugt.add(bedst.i);
  }
  console.log(`syet: ${brugt.size}/${stykker.length} stykker, ${linje.length} punkter`);
  punkter = linje;
} else {
  // GPX: trkpt lat/lon i dokumentrækkefølge
  for (const m of råt.matchAll(/<(?:trkpt|rtept)[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g)) {
    punkter.push([+m[2], +m[1]]);
  }
  // attributrækkefølgen kan være omvendt
  if (!punkter.length) for (const m of råt.matchAll(/<(?:trkpt|rtept)[^>]*lon="([-\d.]+)"[^>]*lat="([-\d.]+)"/g)) {
    punkter.push([+m[1], +m[2]]);
  }
  console.log(`GPX: ${punkter.length} punkter`);
}
if (punkter.length < 10) { console.error("for få punkter - tjek input"); process.exit(1); }

// Douglas-Peucker (lukket-ring-sikker er unødig her: ruter er åbne linjer)
function dp(pts, tol) {
  const behold = new Array(pts.length).fill(false);
  behold[0] = behold[pts.length - 1] = true;
  const stak = [[0, pts.length - 1]];
  while (stak.length) {
    const [i0, i1] = stak.pop();
    if (i1 <= i0 + 1) continue;
    const [x0, y0] = pts[i0], [x1, y1] = pts[i1];
    const dx = x1 - x0, dy = y1 - y0;
    const nrm = Math.hypot(dx, dy) || 1e-12;
    let maxD = -1, maxI = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs(dy * (pts[i][0] - x0) - dx * (pts[i][1] - y0)) / nrm;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > tol) { behold[maxI] = true; stak.push([i0, maxI], [maxI, i1]); }
  }
  return pts.filter((_, i) => behold[i]);
}
const forenklet = dp(punkter, 0.00025).map(([lo, la]) => [+lo.toFixed(5), +la.toFixed(5)]);

// rute-længde til visning
const R = 6371, rad = x => x * Math.PI / 180;
let km = 0;
for (let i = 1; i < forenklet.length; i++) {
  const [lo1, la1] = forenklet[i - 1], [lo2, la2] = forenklet[i];
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  km += 2 * R * Math.asin(Math.sqrt(a));
}

mkdirSync("data/ruter", { recursive: true });
const fil = `data/ruter/${slug(navn)}.json`;
writeFileSync(fil, JSON.stringify({ navn, kilde, km: +km.toFixed(1), punkter: forenklet }));
console.log(`OK: ${fil} - ${forenklet.length} punkter, ${km.toFixed(1)} km`);
