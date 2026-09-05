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
  if (r.cc === "US" && r.t === "marathon") return ["/guide/marathons-in-the-usa/", "Marathons in the USA"];
  if (r.cc === "US" && r.t === "half") return ["/guide/half-marathons-in-the-usa/", "Half marathons in the USA"];
  if (r.cc === "US" && r.t === "ultra") return ["/guide/trail-and-ultra-in-the-usa/", "Trail & ultra in the USA"];
  if (r.cc === "GB" && r.t === "marathon") return ["/guide/marathons-in-the-uk/", "Marathons in the UK"];
  if (r.cc === "DE" && r.t === "marathon") return ["/guide/marathons-in-germany/", "Marathons in Germany"];
  if (r.cc === "FR") return ["/guide/running-races-in-france/", "Running races in France"];
  if (r.cc === "ES") return ["/guide/running-races-in-spain/", "Running races in Spain"];
  if (r.cc === "AU") return ["/guide/running-races-in-australia/", "Running races in Australia"];
  if (r.co === "EU" && r.t === "marathon") return ["/guide/marathons-in-europe/", "Marathons in Europe"];
  if (r.co === "AS" && r.t === "marathon") return ["/guide/marathons-in-asia/", "Marathons in Asia"];
  if (r.t === "marathon") return ["/guide/marathons-around-the-world/", "Marathons around the world"];
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
// Guides tæller på HELE datasættet inkl. USA (races-rsu) - /lob/-siderne genereres
// bevidst kun for de kuraterede kilder, så RSU-løb i tabellerne linker til /#slug (appen).
try {
  const rsuSrc = readFileSync("data/races-rsu.js", "utf8").replace("const RACES = [", "RACES.push(...[").replace(/^\];$/m, "]);");
  eval(rsuSrc);
} catch (e) { console.warn("races-rsu.js kunne ikke indlæses - guides tæller uden USA:", e.message); }
const NORDEN = new Set(["DK", "NO", "SE", "FI", "IS", "FO", "GL"]);
const kommende = RACES.filter(r => (r.dt ? r.dt >= iDag : (r.m || "0") >= iDag.slice(0, 7)));
const guideDato = new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
// hero-fotos: Wikimedia Commons (CC), selv-hostet m. kreditering i footer (assets/guides/kredit.json)
const KREDIT = JSON.parse(readFileSync("assets/guides/kredit.json", "utf8"));

const GUIDES = [
  {
    sl: "marathon-danmark", gruppe: "Danmark & Norden", lang: "da", hero: "marathon-dk",
    titel: "Marathon i Danmark: den komplette kalender",
    sektioner: [
      ["De store klassikere", "Copenhagen Marathon i maj er Danmarks største marathon med en flad byrute gennem alle Københavns brokvarterer og målstregen i hjertet af byen. HCA Marathon i Odense i efteråret er landets næststørste og kendt for en hurtig, flad rute i H.C. Andersens fodspor - mange danske personlige rekorder er sat her. Dertil kommer kystklassikere som Skagen Marathon, hvor ruten går helt ud mod Grenen."],
      ["Sæsonen i Danmark", "Den danske marathonsæson topper i maj og igen fra september til oktober, hvor vejret er koldt nok til hurtige tider. Sommermånederne byder typisk på mindre, lokale marathonløb - flere af dem i parker og skove med flere omgange på samme rute. Vinterens få løb er små og stemningsfulde med garvede gengangere."],
      ["Sådan vælger du dit marathon", "Går du efter en hurtig tid, så vælg de flade byruter i København eller Odense, hvor der er fart, publikum og officielle pacere. Vil du hellere have en oplevelse, så kig på kystløbene - de er mindre, billigere og nemmere at komme ind til, men vind og underlag kan koste minutter. Tjek altid arrangørens side for tidsgrænser og depoter, før du tilmelder dig."],
    ],
    filter: r => r.cc === "DK" && r.t === "marathon",
    intro: n => `Der er lige nu ${n} kommende marathonløb i Danmark i kalenderen - fra de store bybegivenheder til små lokale løb. Listen er sorteret efter dato og opdateres automatisk hver uge fra arrangørernes offentlige kalendere.`,
    faq: n => [
      ["Hvor mange marathonløb er der i Danmark?", `Runnin kender i øjeblikket ${n} kommende marathonløb (42,2 km) i Danmark. Kalenderen opdateres ugentligt.`],
      ["Hvordan tilmelder jeg mig?", "Hvert løb på listen linker direkte til arrangørens officielle tilmeldingsside - Runnin sælger ikke billetter og tager ingen gebyrer."],
    ],
  },
  {
    sl: "halvmarathon-danmark", gruppe: "Danmark & Norden", lang: "da", hero: "half-dk",
    titel: "Halvmarathon i Danmark: kommende løb",
    sektioner: [
      ["Danmarks halvmarathon-landskab", "Copenhagen Half Marathon i september er Danmarks største løb på distancen og blandt Europas hurtigste - en flad byrute med tæt publikum hele vejen. Rundt om i landet ligger der halvmarathonløb næsten hver weekend: byløb, skovløb og kystruter, mange arrangeret af lokale atletik- og motionsklubber til startgebyrer langt under storbyløbenes."],
      ["Sådan vælger du", "Distancen er den samme, men oplevelsen er vidt forskellig: byløbene giver fart, pacere og stemning; de små klubløb giver ro, natur og kortere kø ved startlinjen. Kig på højdeprofilen og underlaget, hvis tiden betyder noget - og på datoen i forhold til dit øvrige program, hvis halvmarathonen er generalprøve før et helt marathon."],
    ],
    filter: r => r.cc === "DK" && r.t === "half",
    intro: n => `${n} kommende halvmarathonløb i Danmark, sorteret efter dato. 21,1 km er en af de mest populære konkurrencedistancer herhjemme, og der er løb næsten hver weekend året rundt. Listen opdateres automatisk hver uge.`,
    faq: n => [
      ["Hvor mange halvmarathonløb er der i Danmark?", `Kalenderen indeholder i øjeblikket ${n} kommende halvmarathonløb i Danmark.`],
      ["Hvad koster et halvmarathon typisk?", "Startgebyret fremgår af arrangørens tilmeldingsside, som hvert løb linker til. Prisen stiger ofte tættere på løbsdagen."],
    ],
  },
  {
    sl: "trail-og-ultra-danmark", gruppe: "Danmark & Norden", lang: "da", hero: "trail",
    titel: "Trail- og ultraløb i Danmark",
    sektioner: [
      ["Trail i et fladt land", "Danmark har ingen bjerge, men masser af terræn: kystskrænter, klitplantager, morænebakker og skove med rødder og mudder nok til at gøre enhver kilometer ærlig. Løbene samler sig om naturperlerne - Møns Klint, Silkeborg-søhøjlandet, Mols Bjerge og den jyske vestkyst - og flere af dem har distancer fra 10 km helt op over 100 km på samme dag."],
      ["Backyard og de skæve formater", "Danmark har taget backyard-formatet til sig: alle løber samme 6,7 km-sløjfe hver time, og sidste løber på benene vinder. Det lyder fredeligt og bliver brutalt. Dertil kommer natløb med pandelampe og etapeløb over flere dage - formater, hvor oplevelsen fylder mere end sluttiden."],
      ["Udstyr og tidsgrænser", "Danske trail-løb kræver sjældent obligatorisk udstyr ud over væske, men læs altid arrangørens krav - især på ultradistancerne, hvor depotafstand og tidsgrænser afgør, om dagen bliver lang eller umulig. Trail-sko er et krav for komforten de fleste steder, men på tørre sommerruter kan landevejssko sagtens klare det."],
    ],
    filter: r => r.cc === "DK" && r.t === "ultra",
    intro: n => `${n} kommende trail- og ultraløb i Danmark - fra kystspor og bakket skov til backyard-formater, hvor den sidste løber på benene vinder. Sorteret efter dato, opdateret ugentligt.`,
    faq: n => [
      ["Hvor mange trail- og ultraløb er der i Danmark?", `Runnin kender i øjeblikket ${n} kommende trail- og ultraløb i Danmark.`],
      ["Hvad er et backyard ultra?", "Et format hvor alle løber samme 6,7 km-sløjfe hver time, indtil kun én kan fortsætte. Flere danske løb på listen bruger formatet."],
    ],
  },
  {
    sl: "marathon-norden", gruppe: "Danmark & Norden", lang: "da", hero: "norden",
    titel: "Marathon i Norden: Danmark, Norge, Sverige m.fl.",
    sektioner: [
      ["Fra storby til fjeld", "Norden byder på hele spektret: Stockholm Marathon og Oslo Maraton er klassiske storbyløb med publikum og pacere, mens løb som Midnight Sun Marathon i Tromsø byder på marathon ved midnatssol nord for polarcirklen. Island og Færøerne har små løb i landskaber, der føles som en anden planet - vulkansk klippe, fjorde og vejr, der skifter på minutter."],
      ["Planlægning på tværs af grænser", "De nordiske lande er tæt forbundet med fly og tog, og startgebyrerne er sjældent det dyre - det er overnatningen. Book tidligt til de store løb, hvor byens hoteller fyldes af løbere samme weekend. Og husk at tjekke startgebyret i lokal valuta: norske og islandske løb prissættes i NOK og ISK."],
    ],
    filter: r => NORDEN.has(r.cc) && r.t === "marathon",
    intro: n => `${n} kommende marathonløb i Norden - Danmark, Norge, Sverige, Finland, Island og Færøerne - samlet ét sted og sorteret efter dato. Fra storbyklassikerne til fjeld- og kystmarathon.`,
    faq: n => [
      ["Hvor mange marathonløb er der i Norden?", `Kalenderen indeholder i øjeblikket ${n} kommende marathonløb på tværs af de nordiske lande.`],
      ["Er tilmeldingslinkene officielle?", "Ja - hvert løb linker direkte til arrangørens egen tilmeldingsside. Runnin er gratis og sælger ikke noget."],
    ],
  },
  {
    sl: "marathons-in-the-nordics", gruppe: "Europe", lang: "en", hero: "norden",
    titel: "Marathons in the Nordics: the complete calendar",
    sektioner: [
      ["From big cities to the Arctic", "The Nordics cover the whole spectrum: Stockholm Marathon and Oslo Maraton are classic big-city races with crowds and pacers, while the Midnight Sun Marathon in Tromsø takes you above the Arctic Circle for a marathon in 24-hour daylight. Iceland and the Faroe Islands host small races in landscapes that feel like another planet - volcanic rock, fjords and weather that changes by the minute."],
      ["Planning across borders", "The Nordic countries are tightly connected by air and rail, and entry fees are rarely the expensive part - accommodation is. Book early for the big races, when the host city's hotels fill with runners on the same weekend. Note that Norwegian and Icelandic races are priced in NOK and ISK."],
    ],
    filter: r => NORDEN.has(r.cc) && r.t === "marathon",
    intro: n => `${n} upcoming marathons across Denmark, Norway, Sweden, Finland, Iceland and the Faroe Islands - in one list, sorted by date. From big-city classics to fell and coastal marathons. Updated automatically every week from the organisers' public calendars.`,
    faq: n => [
      ["How many marathons are there in the Nordics?", `Runnin currently lists ${n} upcoming marathons across the Nordic countries. The calendar refreshes weekly.`],
      ["How do I register?", "Every race links directly to the organiser's official registration page - Runnin is free and sells nothing."],
    ],
  },
  {
    sl: "running-races-in-denmark", gruppe: "Europe", lang: "en", hero: "marathon-dk",
    titel: "Running races in Denmark: upcoming events",
    sektioner: [
      ["Why race in Denmark", "Denmark is flat, compact and race-mad: nearly every weekend offers races within an hour of Copenhagen or Aarhus, and even the biggest events feel friendly and well organised. Copenhagen Half Marathon in September is among Europe's fastest half marathons, and Copenhagen Marathon in May is the country's biggest 42.2 km race."],
      ["Practical notes for visitors", "Registration is online and in English for most bigger races, payment by international card is standard, and bib pickup usually happens on race day or the day before. Public transport reaches most start lines - and in Copenhagen, a rental bike does too."],
    ],
    filter: r => r.cc === "DK",
    intro: n => `${n} upcoming running races in Denmark - from 5Ks and half marathons to trail ultras - sorted by date and updated weekly. Denmark has races nearly every weekend, most of them small, friendly and open to visitors.`,
    faq: n => [
      ["How many running races are there in Denmark?", `Runnin currently lists ${n} upcoming races in Denmark across all distances.`],
      ["Can foreigners join Danish races?", "Yes - nearly all Danish races are open to everyone. Registration links on this list go straight to the organiser's official page."],
    ],
  },
  {
    sl: "marathons-in-the-usa", gruppe: "North America", lang: "en", hero: "usa",
    titel: "Marathons in the USA: the complete calendar",
    filter: r => r.cc === "US" && r.t === "marathon",
    intro: n => `${n} upcoming marathons across the United States, sorted by date and updated weekly from public race calendars - from the World Marathon Majors to small-town races with a few hundred finishers.`,
    sektioner: [
      ["The Majors and the icons", "Boston, Chicago and New York anchor the American marathon year. Boston is the one you qualify for - its qualifying standards define ambition for marathoners worldwide - while Chicago's flat, fast loop and New York's five-borough tour fill by lottery. Beyond the Majors, races like the Marine Corps Marathon in Washington D.C. and Grandma's Marathon in Minnesota draw tens of thousands."],
      ["Seasons and geography", "The American marathon calendar peaks in October and November, with a second wave in spring. Summer marathons cluster in the mountain states and the Pacific Northwest, where altitude and cool mornings make 42.2 km survivable; winter racing moves south to Florida, Texas, Arizona and California."],
      ["Practical notes", "Most US races sell out or close registration weeks ahead, and prices rise in tiers - registering early can save 30-50%. Nearly every race publishes pace groups, and finisher medals, chip timing and closed roads are standard even at mid-size events."],
    ],
    faq: n => [
      ["How many marathons are there in the USA?", `Runnin currently lists ${n} upcoming marathons across the United States. The calendar refreshes weekly.`],
      ["How do I get into the World Marathon Majors?", "Boston requires a qualifying time from a certified marathon; Chicago and New York run lotteries alongside time qualification and charity entries. Registration links on this list go to the official organisers."],
    ],
  },
  {
    sl: "half-marathons-in-the-usa", gruppe: "North America", lang: "en", hero: "usa",
    titel: "Half marathons in the USA: upcoming races",
    filter: r => r.cc === "US" && r.t === "half",
    intro: n => `${n} upcoming half marathons across the United States - America's most popular race distance, with events nearly every weekend of the year. Sorted by date, updated weekly.`,
    sektioner: [
      ["The most popular distance", "The half marathon is the sweet spot of American road racing: long enough to demand training, short enough to race often. Big-city halves fill fast, while thousands of local races welcome runners of every pace with the same chip timing and closed-road treatment."],
      ["Choosing your race", "If you are chasing a time, look for flat courses in cool months - October through December and March through May dominate the fast lists. If you are running for the experience, the national park and coastal races trade a few minutes for scenery you will remember longer than the splits."],
    ],
    faq: n => [
      ["How many half marathons are there in the USA?", `Runnin currently lists ${n} upcoming half marathons across the United States.`],
      ["How do I register?", "Every race links directly to the organiser's official registration page - Runnin is free and sells nothing."],
    ],
  },
  {
    sl: "trail-and-ultra-in-the-usa", gruppe: "North America", lang: "en", hero: "trail",
    titel: "Trail and ultra running in the USA",
    filter: r => r.cc === "US" && r.t === "ultra",
    intro: n => `${n} upcoming trail and ultra races across the United States - from forest 50Ks to the mountain hundred-milers that defined the sport. Sorted by date, updated weekly.`,
    sektioner: [
      ["Where American ultrarunning lives", "The United States is the birthplace of the modern trail ultra: Western States 100, the oldest 100-mile trail race in the world, still fills its start list by lottery years deep. Around it has grown a calendar of hundreds of races - desert canyons in Utah and Arizona, Appalachian forest, Rocky Mountain altitude and Pacific Northwest rainforest."],
      ["Formats and entry", "Expect everything from timed backyard ultras to point-to-point hundred-milers with pacers and drop bags. The famous races fill by lottery or qualification, but the vast majority of American ultras are simply first-come, first-served - and far cheaper than their European equivalents."],
    ],
    faq: n => [
      ["How many trail and ultra races are there in the USA?", `Runnin currently lists ${n} upcoming trail and ultra races across the United States.`],
      ["Do I need qualifiers?", "Only for a handful of iconic races. Most American ultras are open entry - check each organiser's page for cutoffs and mandatory gear."],
    ],
  },
  {
    sl: "marathons-in-the-uk", gruppe: "Europe", lang: "en", hero: "uk",
    titel: "Marathons in the UK: upcoming races",
    filter: r => r.cc === "GB" && r.t === "marathon",
    intro: n => `${n} upcoming marathons across the United Kingdom, sorted by date and updated weekly - from the London Marathon to trail marathons in the national parks.`,
    sektioner: [
      ["London and beyond", "The London Marathon is the country's flagship and one of the World Marathon Majors - entry runs through a heavily oversubscribed ballot, good-for-age times and charity places. Beyond London, Manchester and Edinburgh offer fast spring courses, while Brighton brings seaside crowds to race weekend."],
      ["The British racing culture", "The UK squeezes remarkable variety into a small island: flat city marathons, hilly trail races in the Lake District and Snowdonia, and a deep club culture that keeps entry fees modest. Autumn and spring dominate the calendar - summer marathons are rare for good meteorological reasons."],
    ],
    faq: n => [
      ["How many marathons are there in the UK?", `Runnin currently lists ${n} upcoming marathons across the United Kingdom.`],
      ["How do I get into the London Marathon?", "Through the public ballot, a good-for-age qualifying time, or a charity place. The ballot opens shortly after each year's race - the link on this list goes to the official site."],
    ],
  },
  {
    sl: "marathons-in-germany", gruppe: "Europe", lang: "en", hero: "de",
    titel: "Marathons in Germany: upcoming races",
    filter: r => r.cc === "DE" && r.t === "marathon",
    intro: n => `${n} upcoming marathons across Germany, sorted by date and updated weekly - anchored by Berlin, the fastest marathon course on earth.`,
    sektioner: [
      ["Berlin: where records fall", "The Berlin Marathon has hosted more marathon world records than any other race - a pancake-flat course, cool late-September weather and flawless organisation make it the bucket-list race for anyone chasing a time. Entry runs through a lottery."],
      ["A dense, well-run calendar", "Beyond Berlin, Germany offers city marathons in Hamburg, Frankfurt, Munich and Cologne - all flat, well-organised and cheaper than the Majors - plus forest and vineyard races that show a quieter side of German running. Spring and autumn dominate; German efficiency at bib pickup is not a stereotype, it is a fact."],
    ],
    faq: n => [
      ["How many marathons are there in Germany?", `Runnin currently lists ${n} upcoming marathons across Germany.`],
      ["Is Berlin really the fastest course?", "Its flat profile and September conditions have produced multiple world records. Frankfurt and Hamburg are also known as fast courses."],
    ],
  },
  {
    sl: "marathons-in-europe", gruppe: "Europe", lang: "en", hero: "de",
    titel: "Marathons in Europe: the complete calendar",
    filter: r => r.co === "EU" && r.t === "marathon",
    intro: n => `${n} upcoming marathons across Europe in one list, sorted by date and updated weekly - from the Majors in Berlin and London to alpine trail marathons and Mediterranean winter races.`,
    sektioner: [
      ["A continent of contrasts", "Europe packs more marathon variety per kilometre than anywhere else: world-record courses in Berlin, historic streets in Rome and Athens, midnight sun in the Nordics and winter racing in Valencia, Sevilla and Malta while the north hibernates. High-speed rail makes race-cation logistics simple."],
      ["When to race where", "Spring (March-May) and autumn (September-November) carry the big city races. Chase warm-weather winter marathons in Spain and Portugal, and summer trail marathons in the Alps - where the distance is the same but the finishing times are not."],
    ],
    faq: n => [
      ["How many marathons are there in Europe?", `Runnin currently lists ${n} upcoming marathons across Europe. The calendar refreshes weekly.`],
      ["Which European marathons are World Marathon Majors?", "Berlin and London. Both fill via ballot/lottery systems alongside qualifying times and charity entries."],
    ],
  },
  {
    sl: "marathons-in-asia", gruppe: "Asia & Oceania", lang: "en", hero: "asien",
    titel: "Marathons in Asia: upcoming races",
    filter: r => r.co === "AS" && r.t === "marathon",
    intro: n => `${n} upcoming marathons across Asia, sorted by date and updated weekly - home of the Tokyo Marathon and the fastest-growing running scene in the world.`,
    sektioner: [
      ["Tokyo and the giants", "The Tokyo Marathon is Asia's World Marathon Major - meticulous organisation, enormous crowds and an entry lottery among the toughest anywhere. Around it, races in Osaka, Seoul, Singapore, Bangkok and Mumbai have grown into six-figure-applicant events of their own."],
      ["Racing in Asian conditions", "Climate shapes the calendar: Southeast Asian races start before dawn to beat the heat, Japanese and Korean marathons cluster in the cool months, and the Indian season runs through winter. Expect early alarm clocks - and some of the most enthusiastic spectator cultures in world running."],
    ],
    faq: n => [
      ["How many marathons are there in Asia?", `Runnin currently lists ${n} upcoming marathons across Asia. The calendar refreshes weekly.`],
      ["How do I enter the Tokyo Marathon?", "Through the public lottery, semi-elite qualifying times, or charity places. The link on this list goes to the official organiser."],
    ],
  },
  {
    sl: "marathons-around-the-world", gruppe: "World", lang: "en", hero: "verden",
    titel: "Marathons around the world: the global calendar",
    filter: r => r.t === "marathon",
    intro: n => `${n} upcoming marathons across the world in one list, sorted by date and updated weekly - the World Marathon Majors, national classics and races at the edge of the map.`,
    sektioner: [
      ["The Majors and the map", "The World Marathon Majors - Tokyo, Boston, London, Berlin, Chicago, New York and Sydney - are the sport's grand tour, each filling through lotteries and qualifying times. But the global calendar is far bigger: polar marathons, desert races, midnight sun starts above the Arctic Circle and city races on every continent."],
      ["Building a marathon year", "Serious marathoners typically race the distance two or three times a year. A common pattern: a spring race for a time, an autumn race for the experience - or the reverse. Wherever you point the map, registration on this list always goes straight to the official organiser."],
    ],
    faq: n => [
      ["How many marathons are there in the world?", `Runnin currently lists ${n} upcoming marathons worldwide. The real number is larger - the calendar grows weekly as sources refresh.`],
      ["What are the World Marathon Majors?", "Seven races - Tokyo, Boston, London, Berlin, Chicago, New York and Sydney - linked in a series for elites and age-groupers, with six-star (now seven-star) medals for completing them all."],
    ],
  },
  {
    sl: "running-races-in-france", lang: "en", hero: "fr", gruppe: "Europe",
    titel: "Running races in France: marathons, trails and more",
    filter: r => r.cc === "FR",
    intro: n => `${n} upcoming running races across France, sorted by date and updated weekly - from the Paris Marathon down the Champs-Élysées to the trail races of the Alps and Provence.`,
    sektioner: [
      ["Paris and the classics", "The Paris Marathon is one of the world's biggest, starting on the Champs-Élysées and passing the Louvre, Bastille and the Eiffel Tower - a sightseeing tour at race pace. France also hosts one of running's most storied races in the Ultra-Trail du Mont-Blanc, whose finish line in Chamonix is the sport's Wembley."],
      ["A nation of trail runners", "France arguably has the deepest trail-running culture in the world: alpine ultras, Provençal hill races and coastal paths in Brittany. Note that French races traditionally require a medical certificate or licence - check the organiser's page for current requirements before you register."],
    ],
    faq: n => [
      ["How many running races are there in France?", `Runnin currently lists ${n} upcoming races across France. The calendar refreshes weekly.`],
      ["Do I need a medical certificate to race in France?", "Historically yes for competitive events; rules have been evolving. Check the organiser's registration page - the links on this list go straight there."],
    ],
  },
  {
    sl: "running-races-in-spain", lang: "en", hero: "es", gruppe: "Europe",
    titel: "Running races in Spain: marathons, trails and more",
    filter: r => r.cc === "ES",
    intro: n => `${n} upcoming running races across Spain, sorted by date and updated weekly - home of Valencia, the fastest marathon city in southern Europe, and winter racing while the rest of the continent hibernates.`,
    sektioner: [
      ["Valencia and the fast courses", "Valencia has built itself into a temple of fast running: a flat course, December conditions and a finish over the water in the City of Arts and Sciences. Madrid, Barcelona and Sevilla fill out a calendar of big-city marathons with Mediterranean crowds."],
      ["Winter is the season", "Spain races when northern Europe cannot: the biggest events run October through March, making Spain the classic winter marathon destination. Summer racing moves to the cooler north coast and the mountains - or to dawn starts."],
    ],
    faq: n => [
      ["How many running races are there in Spain?", `Runnin currently lists ${n} upcoming races across Spain. The calendar refreshes weekly.`],
      ["When is the best time to race in Spain?", "October to March for the big city races - Valencia in December is the flagship. Summer races start early to beat the heat."],
    ],
  },
  {
    sl: "running-races-in-australia", lang: "en", hero: "au", gruppe: "Asia & Oceania",
    titel: "Running races in Australia: marathons, trails and more",
    filter: r => r.cc === "AU",
    intro: n => `${n} upcoming running races across Australia, sorted by date and updated weekly - anchored by the Sydney Marathon, the newest World Marathon Major.`,
    sektioner: [
      ["Sydney joins the Majors", "The Sydney Marathon became a World Marathon Major in 2025 - the first in the southern hemisphere - with a course over the Harbour Bridge and a finish by the Opera House. Melbourne, the Gold Coast and Perth carry the rest of the big-city calendar."],
      ["Racing upside down", "The Australian season is the northern hemisphere's mirror: the big races cluster in the southern winter, May through October, when temperatures are kind. For European and American runners, that makes Australia the perfect place to keep a marathon year alive through the northern summer."],
    ],
    faq: n => [
      ["How many running races are there in Australia?", `Runnin currently lists ${n} upcoming races across Australia. The calendar refreshes weekly.`],
      ["Is the Sydney Marathon really a Major?", "Yes - it was added to the World Marathon Majors in 2025 as the seventh race, the first outside the northern hemisphere."],
    ],
  },
];

const guideUrls = [];
for (const gd of GUIDES) {
  const liste = kommende.filter(gd.filter).sort((a, b) => (a.dt || a.m + "-28") < (b.dt || b.m + "-28") ? -1 : 1);
  if (!liste.length) continue; // udgiv aldrig en tom guide
  const url = `${BASE}/guide/${gd.sl}/`;
  guideUrls.push({ url, titel: gd.titel, lang: gd.lang, antal: liste.length, gruppe: gd.gruppe || "World" });
  const da = gd.lang === "da";
  const MAKS_RÆKKER = 120;
  const vis = liste.slice(0, MAKS_RÆKKER);
  const rows = vis.map(r => {
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
  section h2,h2{font-size:21px;font-weight:800;letter-spacing:-.01em;margin:30px 0 6px}
  section p{margin:0;max-width:66ch;color:#4a3a26}
  .nav-links{margin-left:auto;font-weight:600;font-size:13px;letter-spacing:0}
  .nav-links a{color:var(--muted)}
  .nav-links a:hover{color:var(--caramel);text-decoration:none}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:14.5px;box-shadow:0 2px 10px rgba(56,36,13,.06)}
  th,td{text-align:left;padding:11px 13px;border-bottom:1px solid var(--hairline)}
  th{font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);background:#FBFAF7}
  tbody tr{transition:background .12s}
  tbody tr:hover{background:#FBF7EF}
  td:last-child{color:var(--muted);white-space:nowrap}
  a{color:var(--caramel);text-decoration:none}
  a:hover{text-decoration:underline}
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
<div class="brand op op1"><a href="/"><img src="/assets/mark.png" alt="">R U N N I N</a><span class="nav-links"><a href="/guide/">${da ? "← Alle guides" : "← All guides"}</a> · <a href="/">${da ? "Kortet" : "The map"}</a></span></div>
<h1 class="op op2">${esc(gd.titel)}</h1>
<div class="meta op op2">${liste.length} ${da ? "løb" : "races"} · ${da ? "opdateret" : "updated"} ${guideDato}</div>
<div class="accent op op2"></div>
<img class="hero op op3" src="/assets/guides/${gd.hero}.jpg" alt="${esc(gd.titel)}" width="1200" height="600">
<p class="intro op op4">${esc(gd.intro(liste.length))}</p>
${(gd.sektioner || []).map(([h, p]) => `<section class="op op4"><h2>${esc(h)}</h2><p>${esc(p)}</p></section>`).join("\n")}
<h2 class="op op5">${da ? "Kalenderen" : "The calendar"}</h2>
<table class="op op5">
<thead><tr><th>${da ? "Løb" : "Race"}</th><th>${da ? "By" : "City"}</th><th>${da ? "Dato" : "Date"}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${liste.length > MAKS_RÆKKER ? `<p style="color:var(--muted);font-size:13.5px">+ ${liste.length - MAKS_RÆKKER} ${da ? "flere - se dem alle på" : "more - see them all on"} <a href="/">${da ? "kortet" : "the map"}</a>.</p>` : ""}
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
<div class="brand op" style="animation-delay:.05s"><a href="/"><img src="/assets/mark.png" alt="">R U N N I N</a><span style="margin-left:auto;font-weight:600;font-size:13px;letter-spacing:0"><a href="/" style="color:#7E6A50;text-decoration:none">← Til kortet</a></span></div>
<h1 class="op" style="animation-delay:.12s">Guides</h1>
<div class="sub op" style="animation-delay:.12s">Data-drevne kalendere - opdateres automatisk hver uge.</div>
${["Danmark & Norden", "Europe", "North America", "Asia & Oceania", "World"].map(gr => {
    const i = guideUrls.filter(g => g.gruppe === gr);
    if (!i.length) return "";
    return `<h2 style="font-size:17px;font-weight:800;margin:26px 0 4px;color:#38240D">${gr}</h2>` +
      i.map((g, ix) => `<a class="kort op" style="animation-delay:${(0.2 + ix * 0.06).toFixed(2)}s" href="${g.url}"><b>${esc(g.titel)}</b><span>${g.antal} ${g.lang === "da" ? "løb" : "races"} · ${g.lang.toUpperCase()}</span></a>`).join("\n");
  }).join("\n")}
</main></body></html>
`);
}

writeFileSync(`${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, `${BASE}/guide/`, ...guideUrls.map(g => g.url), ...urls].map(u => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
writeFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
console.log(`SEO: ${urls.length} løbssider + ${guideUrls.length} guides + sitemap + robots.txt`);
