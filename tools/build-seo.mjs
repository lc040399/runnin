// Genererer statiske SEO-sider pr. løb (dist/lob/<slug>/index.html) + sitemap.xml + robots.txt.
// Google kan indeksere hvert løb; siderne sender brugere videre til appen (/#slug).
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const BASE = "https://runnin.org";
const dist = process.argv[2] || "dist";

const RACES = [];
global.RACES = RACES;
for (const f of ["data/races.js", "data/races-st.js", "data/races2.js", "data/races-nordics.js", "data/races-rid.js", "data/races-kondis.js", "data/races-aims.js", "data/races-wm.js"]) {
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
// intern link til den mest relevante guide pr. løb (SEO: 1.400+ interne links)
const NORDEN_CC = new Set(["DK", "NO", "SE", "FI", "IS", "FO", "GL"]);
function guideFor(r) {
  if (r.cc === "DK" && r.t === "marathon") return ["/guide/marathon-danmark/", "Marathon i Danmark"];
  if (r.cc === "DK" && r.t === "half") return ["/guide/halvmarathon-danmark/", "Halvmarathon i Danmark"];
  if (r.cc === "DK" && r.t === "ultra") return ["/guide/trail-og-ultra-danmark/", "Trail- og ultraløb i Danmark"];
  if (r.cc === "DK") return ["/guide/running-races-in-denmark/", "Running races in Denmark"];
  if (NORDEN_CC.has(r.cc) && r.t === "marathon") return ["/guide/marathon-norden/", "Marathon i Norden"];
  return ["/guide/", "Guides"];
}
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
<meta property="og:image" content="${BASE}/assets/og.png?v=3">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<link rel="icon" type="image/png" href="/assets/mark.png">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<script>location.replace("/#${sl}");</script>
</head>
<body>
<h1>${esc(r.n)}</h1>
<p>${esc(besk)}</p>
<p><a href="/#${sl}">Se ${esc(r.n)} på Runnin-kortet</a> · <a href="${esc(r.u)}" rel="nofollow">Officiel tilmelding</a> · <a href="${guideFor(r)[0]}">${guideFor(r)[1]}</a></p>
</body>
</html>
`);
}

/* ---------- data-drevne guides (SEO/GEO): tal og lister beregnes fra datasættet
   ved hvert byg - den ugentlige refresh holder dem sande, de rådner aldrig. ---------- */
const NORDEN = new Set(["DK", "NO", "SE", "FI", "IS", "FO", "GL"]);
const kommende = RACES.filter(r => (r.dt ? r.dt >= iDag : (r.m || "0") >= iDag.slice(0, 7)));
const guideDato = new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
// hero-fotos: Wikimedia Commons (CC), selv-hostet m. kreditering i footer (assets/guides/kredit.json)
const KREDIT = JSON.parse(readFileSync("assets/guides/kredit.json", "utf8"));

const GUIDES = [
  {
    sl: "marathon-danmark", lang: "da", hero: "marathon-dk",
    titel: "Marathon i Danmark: den komplette kalender",
    filter: r => r.cc === "DK" && r.t === "marathon",
    intro: n => `Der er lige nu ${n} kommende marathonløb i Danmark i kalenderen - fra de store bybegivenheder til små lokale løb. Listen er sorteret efter dato og opdateres automatisk hver uge fra arrangørernes offentlige kalendere.`,
    faq: n => [
      ["Hvor mange marathonløb er der i Danmark?", `Runnin kender i øjeblikket ${n} kommende marathonløb (42,2 km) i Danmark. Kalenderen opdateres ugentligt.`],
      ["Hvordan tilmelder jeg mig?", "Hvert løb på listen linker direkte til arrangørens officielle tilmeldingsside - Runnin sælger ikke billetter og tager ingen gebyrer."],
    ],
  },
  {
    sl: "halvmarathon-danmark", lang: "da", hero: "half-dk",
    titel: "Halvmarathon i Danmark: kommende løb",
    filter: r => r.cc === "DK" && r.t === "half",
    intro: n => `${n} kommende halvmarathonløb i Danmark, sorteret efter dato. 21,1 km er en af de mest populære konkurrencedistancer herhjemme, og der er løb næsten hver weekend året rundt. Listen opdateres automatisk hver uge.`,
    faq: n => [
      ["Hvor mange halvmarathonløb er der i Danmark?", `Kalenderen indeholder i øjeblikket ${n} kommende halvmarathonløb i Danmark.`],
      ["Hvad koster et halvmarathon typisk?", "Startgebyret fremgår af arrangørens tilmeldingsside, som hvert løb linker til. Prisen stiger ofte tættere på løbsdagen."],
    ],
  },
  {
    sl: "trail-og-ultra-danmark", lang: "da", hero: "trail",
    titel: "Trail- og ultraløb i Danmark",
    filter: r => r.cc === "DK" && r.t === "ultra",
    intro: n => `${n} kommende trail- og ultraløb i Danmark - fra kystspor og bakket skov til backyard-formater, hvor den sidste løber på benene vinder. Sorteret efter dato, opdateret ugentligt.`,
    faq: n => [
      ["Hvor mange trail- og ultraløb er der i Danmark?", `Runnin kender i øjeblikket ${n} kommende trail- og ultraløb i Danmark.`],
      ["Hvad er et backyard ultra?", "Et format hvor alle løber samme 6,7 km-sløjfe hver time, indtil kun én kan fortsætte. Flere danske løb på listen bruger formatet."],
    ],
  },
  {
    sl: "marathon-norden", lang: "da", hero: "norden",
    titel: "Marathon i Norden: Danmark, Norge, Sverige m.fl.",
    filter: r => NORDEN.has(r.cc) && r.t === "marathon",
    intro: n => `${n} kommende marathonløb i Norden - Danmark, Norge, Sverige, Finland, Island og Færøerne - samlet ét sted og sorteret efter dato. Fra storbyklassikerne til fjeld- og kystmarathon.`,
    faq: n => [
      ["Hvor mange marathonløb er der i Norden?", `Kalenderen indeholder i øjeblikket ${n} kommende marathonløb på tværs af de nordiske lande.`],
      ["Er tilmeldingslinkene officielle?", "Ja - hvert løb linker direkte til arrangørens egen tilmeldingsside. Runnin er gratis og sælger ikke noget."],
    ],
  },
  {
    sl: "marathons-in-the-nordics", lang: "en", hero: "norden",
    titel: "Marathons in the Nordics: the complete calendar",
    filter: r => NORDEN.has(r.cc) && r.t === "marathon",
    intro: n => `${n} upcoming marathons across Denmark, Norway, Sweden, Finland, Iceland and the Faroe Islands - in one list, sorted by date. From big-city classics to fell and coastal marathons. Updated automatically every week from the organisers' public calendars.`,
    faq: n => [
      ["How many marathons are there in the Nordics?", `Runnin currently lists ${n} upcoming marathons across the Nordic countries. The calendar refreshes weekly.`],
      ["How do I register?", "Every race links directly to the organiser's official registration page - Runnin is free and sells nothing."],
    ],
  },
  {
    sl: "running-races-in-denmark", lang: "en", hero: "marathon-dk",
    titel: "Running races in Denmark: upcoming events",
    filter: r => r.cc === "DK",
    intro: n => `${n} upcoming running races in Denmark - from 5Ks and half marathons to trail ultras - sorted by date and updated weekly. Denmark has races nearly every weekend, most of them small, friendly and open to visitors.`,
    faq: n => [
      ["How many running races are there in Denmark?", `Runnin currently lists ${n} upcoming races in Denmark across all distances.`],
      ["Can foreigners join Danish races?", "Yes - nearly all Danish races are open to everyone. Registration links on this list go straight to the organiser's official page."],
    ],
  },
];

const guideUrls = [];
for (const gd of GUIDES) {
  const liste = kommende.filter(gd.filter).sort((a, b) => (a.dt || a.m + "-28") < (b.dt || b.m + "-28") ? -1 : 1);
  if (!liste.length) continue; // udgiv aldrig en tom guide
  const url = `${BASE}/guide/${gd.sl}/`;
  guideUrls.push({ url, titel: gd.titel, lang: gd.lang, antal: liste.length });
  const da = gd.lang === "da";
  const rows = liste.map(r => {
    const rsl = slug(r.n);
    const side = seteSlugs.has(rsl) ? `/lob/${rsl}/` : `/#${rsl}`;
    return `<tr><td><a href="${side}">${esc(r.n)}</a></td><td>${esc(r.c)}</td><td>${datoTekst(r)}</td></tr>`;
  }).join("\n");
  const jsonld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: gd.titel, numberOfItems: liste.length,
      itemListElement: liste.slice(0, 50).map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.n, url: `${BASE}/lob/${slug(r.n)}/` })) },
    { "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: gd.faq(liste.length).map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  mkdirSync(`${dist}/guide/${gd.sl}`, { recursive: true });
  writeFileSync(`${dist}/guide/${gd.sl}/index.html`, `<!DOCTYPE html>
<html lang="${gd.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(gd.titel)} (${liste.length}) | Runnin</title>
<meta name="description" content="${esc(gd.intro(liste.length).slice(0, 155))}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(gd.titel)}">
<meta property="og:image" content="${BASE}/assets/guides/${gd.hero}.jpg">
<link rel="icon" type="image/png" href="/assets/mark.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
  :root{--paper:#F5F3EE;--ink:#38240D;--muted:#7E6A50;--faint:#AE9C80;--caramel:#C05800;--hairline:rgba(56,36,13,.1)}
  body{font-family:"Inter Tight",-apple-system,sans-serif;background:var(--paper);color:var(--ink);margin:0;padding:28px 18px 60px;line-height:1.55}
  main{max-width:760px;margin:0 auto}
  .brand{font-weight:800;letter-spacing:2.5px;font-size:14px;display:flex;align-items:center;gap:9px}
  .brand a{color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:9px}
  .brand img{width:22px;height:22px}
  h1{font-size:clamp(28px,5vw,36px);font-weight:800;letter-spacing:-.02em;margin:20px 0 6px}
  .meta{color:var(--muted);font-size:13.5px;margin-bottom:4px}
  .accent{width:56px;height:5px;border-radius:3px;background:var(--caramel);margin:14px 0 18px}
  .hero{width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:16px;border:1px solid var(--hairline);box-shadow:0 12px 32px rgba(56,36,13,.14);margin:4px 0 18px}
  p.intro{font-size:16.5px;max-width:64ch}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:14.5px;box-shadow:0 2px 10px rgba(56,36,13,.06)}
  th,td{text-align:left;padding:11px 13px;border-bottom:1px solid var(--hairline)}
  th{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);background:#FBFAF7}
  tbody tr{transition:background .12s}
  tbody tr:hover{background:#FBF7EF}
  td:last-child{color:var(--muted);white-space:nowrap}
  a{color:var(--caramel);text-decoration:none}
  a:hover{text-decoration:underline}
  .faq h2{font-size:20px;font-weight:800;margin-top:36px}
  .faq h3{font-size:16px;margin:18px 0 4px}
  .faq p{margin:0;color:#5b4a33;max-width:64ch}
  .cta{display:inline-block;margin-top:28px;background:var(--caramel);color:#fff;padding:13px 22px;border-radius:12px;text-decoration:none;font-weight:700;box-shadow:0 8px 20px rgba(192,88,0,.28);transition:transform .15s,box-shadow .15s}
  .cta:hover{transform:translateY(-1px);box-shadow:0 11px 24px rgba(192,88,0,.34);text-decoration:none}
  footer{margin-top:36px;color:var(--faint);font-size:12.5px;line-height:1.7}
  @media (prefers-reduced-motion: no-preference){
    .op{opacity:0;transform:translateY(14px);animation:op .6s cubic-bezier(.22,1,.36,1) forwards}
    .op1{animation-delay:.05s}.op2{animation-delay:.14s}.op3{animation-delay:.23s}.op4{animation-delay:.32s}.op5{animation-delay:.44s}
    @keyframes op{to{opacity:1;transform:none}}
  }
</style>
</head>
<body>
<main>
<div class="brand op op1"><a href="/"><img src="/assets/mark.png" alt="">R U N N I N</a></div>
<h1 class="op op2">${esc(gd.titel)}</h1>
<div class="meta op op2">${liste.length} ${da ? "løb" : "races"} · ${da ? "opdateret" : "updated"} ${guideDato}</div>
<div class="accent op op2"></div>
<img class="hero op op3" src="/assets/guides/${gd.hero}.jpg" alt="${esc(gd.titel)}" width="1200" height="600">
<p class="intro op op4">${esc(gd.intro(liste.length))}</p>
<table class="op op5">
<thead><tr><th>${da ? "Løb" : "Race"}</th><th>${da ? "By" : "City"}</th><th>${da ? "Dato" : "Date"}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<div class="faq">
<h2>${da ? "Ofte stillede spørgsmål" : "Frequently asked questions"}</h2>
${gd.faq(liste.length).map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n")}
</div>
<a class="cta" href="/">${da ? "Se alle løb på kortet →" : "See every race on the map →"}</a>
<footer>${da ? "Kilder: arrangørernes offentlige kalendere. Runnin er gratis og open source." : "Sources: the organisers' public calendars. Runnin is free and open source."} · <a href="https://runnin.org">runnin.org</a> · <a href="/guide/">${da ? "Alle guides" : "All guides"}</a><br>${da ? "Foto" : "Photo"}: <a href="${KREDIT[gd.hero].side}" rel="noopener">${esc(KREDIT[gd.hero].artist)}</a> (${KREDIT[gd.hero].lic}, Wikimedia Commons)</footer>
</main>
</body>
</html>
`);
}

// guide-indeks
if (guideUrls.length) {
  mkdirSync(`${dist}/guide`, { recursive: true });
  writeFileSync(`${dist}/guide/index.html`, `<!DOCTYPE html>
<html lang="da">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guides: løbskalendere og oversigter | Runnin</title>
<meta name="description" content="Data-drevne guides fra Runnin: marathon-, halvmarathon- og trailkalendere for Danmark og Norden. Opdateres automatisk hver uge.">
<link rel="canonical" href="${BASE}/guide/">
<link rel="icon" type="image/png" href="/assets/mark.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  body{font-family:"Inter Tight",-apple-system,sans-serif;background:#F5F3EE;color:#38240D;margin:0;padding:28px 18px 60px}
  main{max-width:640px;margin:0 auto}
  .brand{font-weight:800;letter-spacing:2.5px;font-size:14px;display:flex;align-items:center;gap:9px}
  .brand a{color:#38240D;text-decoration:none;display:flex;align-items:center;gap:9px}
  .brand img{width:22px;height:22px}
  h1{font-size:32px;font-weight:800;letter-spacing:-.02em;margin:20px 0 4px}
  .sub{color:#7E6A50;font-size:14px;margin-bottom:20px}
  .kort{display:block;background:#fff;border:1px solid rgba(56,36,13,.1);border-radius:14px;padding:15px 17px;margin:10px 0;color:#38240D;text-decoration:none;box-shadow:0 2px 10px rgba(56,36,13,.06);transition:transform .15s,box-shadow .15s}
  .kort:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(56,36,13,.12)}
  .kort b{display:block;font-size:16px}
  .kort span{color:#7E6A50;font-size:13px}
  @media (prefers-reduced-motion: no-preference){
    .op{opacity:0;transform:translateY(12px);animation:op .55s cubic-bezier(.22,1,.36,1) forwards}
    @keyframes op{to{opacity:1;transform:none}}
  }
</style>
</head>
<body><main>
<div class="brand op" style="animation-delay:.05s"><a href="/"><img src="/assets/mark.png" alt="">R U N N I N</a></div>
<h1 class="op" style="animation-delay:.12s">Guides</h1>
<div class="sub op" style="animation-delay:.12s">Data-drevne kalendere - opdateres automatisk hver uge.</div>
${guideUrls.map((g, i) => `<a class="kort op" style="animation-delay:${(0.2 + i * 0.07).toFixed(2)}s" href="${g.url}"><b>${esc(g.titel)}</b><span>${g.antal} ${g.lang === "da" ? "løb" : "races"} · ${g.lang.toUpperCase()}</span></a>`).join("\n")}
</main></body></html>
`);
}

writeFileSync(`${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, `${BASE}/guide/`, ...guideUrls.map(g => g.url), ...urls].map(u => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
writeFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`SEO: ${urls.length} løbssider + ${guideUrls.length} guides + sitemap + robots.txt`);
