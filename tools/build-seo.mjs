// Genererer statiske SEO-sider pr. løb (dist/lob/<slug>/index.html) + sitemap.xml + robots.txt.
// Google kan indeksere hvert løb; siderne sender brugere videre til appen (/#slug).
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const BASE = "https://runnin.pages.dev";
const dist = process.argv[2] || "dist";

const RACES = [];
global.RACES = RACES;
for (const f of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-nordics.js", "data/races-rid.js", "data/races-kondis.js"]) {
  // races.js definerer const RACES - omskriv til push på vores globale
  const src = readFileSync(f, "utf8").replace("const RACES = [", "RACES.push(...[").replace(/^\];$/m, "]);");
  eval(src);
}
// dedupe på slug (fx samme løb fra to kilder) - første forekomst (kurateret) vinder

const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const MDR = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
const datoTekst = r => r.dt
  ? `${+r.dt.slice(8, 10)}. ${MDR[+r.dt.slice(5, 7) - 1]} ${r.dt.slice(0, 4)}`
  : `${MDR[+r.m.split("-")[1] - 1]} ${r.m.split("-")[0]}`;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const iDag = new Date().toISOString().slice(0, 10);
const urls = [];
const seteSlugs = new Set();
for (const r of RACES) {
  if (r.dt ? r.dt < iDag : r.m < iDag.slice(0, 7)) continue; // afholdte løb får ingen sider
  const sl = slug(r.n);
  if (!sl || seteSlugs.has(sl)) continue;
  seteSlugs.add(sl);
  const url = `${BASE}/lob/${sl}/`;
  urls.push(url);
  const titel = `${r.n} - dato, distance og tilmelding | Runnin`;
  const besk = `${r.n}: ${r.d} i ${r.c}. Næste udgave: ${datoTekst(r)}. Se løbet på verdenskortet og find tilmeldingen på Runnin.`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: r.n,
    sport: "Running",
    ...(r.dt ? { startDate: r.dt } : {}),
    location: { "@type": "Place", name: r.c, address: { "@type": "PostalAddress", addressCountry: r.cc } },
    url,
  };
  mkdirSync(`${dist}/lob/${sl}`, { recursive: true });
  writeFileSync(`${dist}/lob/${sl}/index.html`, `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<meta name="description" content="${esc(besk)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(r.n)}">
<meta property="og:description" content="${esc(besk)}">
<meta property="og:image" content="${BASE}/assets/og.png?v=2">
<meta property="og:type" content="website">
<link rel="icon" type="image/png" href="/assets/mark.png">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<script>location.replace("/#${sl}");</script>
</head>
<body>
<h1>${esc(r.n)}</h1>
<p>${esc(besk)}</p>
<p><a href="/#${sl}">Se ${esc(r.n)} på Runnin-kortet</a> · <a href="${esc(r.u)}" rel="nofollow">Officiel tilmelding</a></p>
</body>
</html>
`);
}

writeFileSync(`${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, ...urls].map(u => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
writeFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`SEO: ${urls.length} løbssider + sitemap + robots.txt`);
