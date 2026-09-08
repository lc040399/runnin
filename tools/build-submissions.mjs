// build-submissions.mjs - fletter crowdsourcede, GODKENDTE løb-indsendelser ind i
// kataloget. Kalder RPC'en godkendte_loeb() (SECURITY DEFINER, kun godkendte+geokodede,
// ingen PII) med den offentlige anon-nøgle - ingen service-key i repoet.
// Moderering: sæt status='approved' + la/lo/cc på rækken i race_submissions (superadmin).
// Kør: node tools/build-submissions.mjs  →  data/races-community.js
import fs from "node:fs";

const BASE = "https://qdqvyvidafslzvxgkvof.supabase.co";
const KEY = "sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3";
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// ISO2 → kontinent (region-filter). Kendte lande; ukendt → null (stadig på kort).
const KONT = {
  DK:"EU",SE:"EU",NO:"EU",FI:"EU",IS:"EU",GB:"EU",IE:"EU",DE:"EU",FR:"EU",ES:"EU",PT:"EU",
  IT:"EU",NL:"EU",BE:"EU",AT:"EU",CH:"EU",PL:"EU",CZ:"EU",HU:"EU",GR:"EU",HR:"EU",SI:"EU",
  RO:"EU",BG:"EU",EE:"EU",LV:"EU",LT:"EU",LU:"EU",MT:"EU",CY:"EU",SK:"EU",
  US:"NA",CA:"NA",MX:"NA",CR:"NA",PA:"NA",
  BR:"SA",AR:"SA",CL:"SA",CO:"SA",PE:"SA",UY:"SA",EC:"SA",
  AU:"OC",NZ:"OC",
  JP:"AS",CN:"AS",KR:"AS",IN:"AS",SG:"AS",TH:"AS",MY:"AS",ID:"AS",PH:"AS",VN:"AS",AE:"AS",IL:"AS",TR:"AS",HK:"AS",TW:"AS",
  ZA:"AF",KE:"AF",ET:"AF",MA:"AF",EG:"AF",TZ:"AF",NA:"AF",
};

const rows = await (await fetch(`${BASE}/rest/v1/rpc/godkendte_loeb`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: "{}",
})).json();
const godkendte = Array.isArray(rows) ? rows : [];
console.log(`godkendte indsendelser: ${godkendte.length}`);

// dedup mod eksisterende katalog
const findes = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync("data/races.json", "utf8")))
    findes.add(norm((r.n || "").replace(/20\d\d/g, "")));
} catch (_) {}

const TYPER = { kort: "Løb", half: "Halvmarathon", marathon: "Marathon", ultra: "Ultra", tri: "Triatlon" };
let ok = 0, dubl = 0;
const seen = new Set();
const out = [];
for (const r of godkendte) {
  const navn = (r.name || "").trim();
  if (!navn || r.la == null || r.lo == null) continue;
  const nøgle = norm(navn) + "|" + (r.race_date || "");
  if (seen.has(nøgle)) continue;
  seen.add(nøgle);
  if (findes.has(norm(navn.replace(/20\d\d/g, "")))) { dubl++; continue; }
  const t = TYPER[r.race_type] ? r.race_type : "kort";
  const dt = r.race_date && /^\d{4}-\d{2}-\d{2}$/.test(r.race_date) ? r.race_date : null;
  ok++;
  out.push({
    n: navn, c: (r.city || "").trim(), cc: r.cc || null, co: r.cc ? (KONT[r.cc] || null) : null,
    la: +(+r.la).toFixed(4), lo: +(+r.lo).toFixed(4),
    t, d: (r.distance || "").trim() || TYPER[t], m: dt ? dt.slice(0, 7) : null, dt, p: null,
    u: (r.url || "").trim() || null,
  });
}
console.log(`inkluderet: ${ok} | dubletter: ${dubl}`);

const js = `// Autogenereret af tools/build-submissions.mjs - kilde: crowdsourcede godkendte indsendelser\n` +
  `// ${ok} community-løb. Moderering i race_submissions (Supabase). Link = arrangørens side.\n` +
  `RACES.push(...${JSON.stringify(out)});\nRACES.forEach((r, i) => (r.id = i));\n`;
fs.writeFileSync("data/races-community.js", js);
console.log(`FÆRDIG: data/races-community.js (${ok} løb)`);
