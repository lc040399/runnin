/* Runnin i18n - dansk er kildesproget, engelsk oversættes ved rendering.
   Strategi: eksakt ordbog + mønsterregler på tekstnoder (MutationObserver fanger
   alt dynamisk indhold), så resten af koden ikke skal kende til sprog.
   Mangler en streng i ordbogen, vises den på dansk - ærligt fallback. */
"use strict";

const SPROG = (() => {
  const gemt = localStorage.getItem("runnin-sprog");
  if (gemt === "da" || gemt === "en") return gemt;
  return (navigator.language || "da").toLowerCase().startsWith("da") ? "da" : "en";
})();

function sætSprog(l) {
  localStorage.setItem("runnin-sprog", l);
  location.reload(); // brutal men konsistent - alt renderes forfra på det nye sprog
}

(() => {
  if (SPROG !== "en") return;

  const EN = new Map(Object.entries({
    // nav + hero
    "Kort": "Map", "Ryd alle": "Clear all", "Hurtigste tider.": "Fastest times.", "Halvmarathon i toplister": "Half marathon", "🔎 Find dig selv…": "🔎 Find yourself…", "Henter leaderboards…": "Loading leaderboards…", "Leaderboards kunne ikke hentes - prøv igen om lidt.": "Leaderboards could not be loaded - try again shortly.", "Ingen match i top 25 - måske ved dit næste løb.": "No match in the top 25 - maybe at your next race.", "Ingen resultater i denne kategori endnu.": "No results in this category yet.", "🔎 Søg løb eller by…": "🔎 Search race or city…", "Kommende løb": "Upcoming races", "Mine løb": "My races", "Log ind": "Log in",
    "Find dit næste løb.": "Find your next race.", "Hele verden. Hele året.": "The whole world. All year.",
    "Hvor som helst": "Anywhere", "Når som helst": "Anytime", "Alle distancer": "All distances", "📍 Nær mig": "📍 Near me",
    "Danmark": "Denmark", "Norden": "The Nordics", "Europa": "Europe", "Nordamerika": "North America",
    "Sydamerika": "South America", "Asien": "Asia", "Afrika": "Africa", "Oceanien": "Oceania",
    "Kort (5-15 km)": "Short (5-15 km)", "Løb": "Run", "Triatlon": "Triathlon", "Hele verden": "The whole world", "I dag": "Today", "I morgen": "Tomorrow", "Denne uge": "This week", "📅 Kalender": "📅 Calendar", "Live lige nu": "Live right now", "Udvalgte klassikere": "Selected classics", "kommende løb": "upcoming races", "live lige nu": "live right now", "Flyv til": "Fly to", "Åbn hele listen →": "Open the full list →", "Åbn dashboard →": "Open dashboard →", "Log ind for at gemme løb og følge dem her.": "Log in to save races and follow them here.", "Log ind →": "Log in →", "Liste": "List", "Halvmarathon": "Half marathon", "Half": "Half",
    "Marathon": "Marathon", "Ultra & trail": "Ultra & trail", "Triathlon": "Triathlon",
    "på kortet": "on the map", "på ruten": "on course", "i mål": "finished", "illustrativ rute": "illustrative route", "officiel rute": "official route", "Førende lige nu": "Leading right now", "Højdeprofil": "Elevation profile", "Målstregen": "The finish line", "Ingen i mål endnu - følg med her.": "No finishers yet - follow along here.", "i gang lige nu": "live right now", "Følg live →": "Follow live →",
    // detalje
    "Tilmeld på officiel side": "Register on official site", "Se løbet hos Kondis": "View race at Kondis", "Se løbet hos AIMS": "View race at AIMS", "Kalenderdata: AIMS": "Calendar data: AIMS", "Se løbet hos WorldsMarathons": "View race at WorldsMarathons", "Kalenderdata: WorldsMarathons": "Calendar data: WorldsMarathons",
    "🎟 Markér som tilmeldt": "🎟 Mark as registered", "🎟 Du er tilmeldt": "🎟 You're registered",
    "Gem": "Save", "Gemt": "Saved", "Påmind": "Remind", "Påmindelse til": "Reminder on", "Fotos": "Photos",
    "I dag - løbet er i gang": "Today - race in progress", "I dag - starter senere": "Today - starts later",
    "Afholdt i dag": "Held today", "Pris: se tilmeldingssiden": "Price: see registration page",
    "Kalenderdata: Sportstiming": "Calendar data: Sportstiming", "Kalenderdata: RunSignup": "Calendar data: RunSignup",
    "Kalenderdata: Kondis": "Calendar data: Kondis", "Kalenderdata: RaceID": "Calendar data: RaceID",
    "Klik for detaljer →": "Click for details →", "Klik for at zoome ind →": "Click to zoom in →",
    "🎟 Tilmeldt": "🎟 Registered", "✓ Afholdt": "✓ Held", "LIVE": "LIVE",
    // login
    "Runnin-profil": "Runnin profile", "Navn": "Name", "Adgangskode": "Password", "Vis adgangskode": "Show password", "Tjek din indbakke": "Check your inbox", "Vi har sendt et bekræftelses-link til": "We've sent a confirmation link to", "Til log ind": "To log in", "Ikke modtaget? Kig i spam - eller prøv igen om lidt.": "Nothing received? Check spam - or try again shortly.", "Skjul adgangskode": "Hide password", "E-mail": "Email",
    "Fortsæt": "Continue", "Privatliv": "Privacy", "Opret konto": "Create account", "Log ind for at få påmindelser om tilmelding.": "Log in to get registration reminders.", "Log ind for at markere dig tilmeldt - så gemmer vi det til dig.": "Log in to mark yourself registered - we'll save it for you.", "Log ind for at gemme løb - så følger de dig på tværs af enheder.": "Log in to save races - they follow you across devices.", "Opret min konto": "Create my account", "Ny her? ": "New here? ", "Opret en konto": "Create an account", "Har du allerede en konto? ": "Already have an account? ", "Skriv dit navn, så vi kan hilse ordentligt.": "Enter your name so we can greet you properly.",
    "Forkert e-mail eller adgangskode.": "Wrong email or password.",
    "Udfyld e-mail og adgangskode.": "Enter email and password.",
    "Bekræft din e-mail først - tjek indbakken (og spam).": "Confirm your email first - check your inbox (and spam).",
    "Kontoen er oprettet - bekræft din e-mail via linket i indbakken, og log så ind.": "Account created - confirm your email via the link in your inbox, then log in.",
    "Det lykkedes ikke - prøv igen om lidt.": "That didn't work - try again shortly.",
    "Konto og gemte løb opbevares sikkert hos Supabase (EU) og følger dig på tværs af enheder. Profilbilledet bliver kun på din enhed.": "Your account and saved races are stored securely with Supabase (EU) and follow you across devices. Your profile photo stays on this device.",
    "Demo: gemmes kun lokalt i din browser - ingen konto oprettes.": "Demo: stored only locally in your browser - no account is created.",
    // dashboard
    "Godmorgen": "Good morning", "Formiddag": "Good day", "Goddag": "Good afternoon", "Godaften": "Good evening", "Godnat": "Good night",
    "Dashboard": "Dashboard", "Dit næste løb": "Your next race", "🎟 Dit næste tilmeldte løb": "🎟 Your next registered race",
    "dage": "days", "I DAG": "TODAY", "Se på kortet": "View on map", "Intet planlagt endnu": "Nothing planned yet",
    "Gem et løb fra kortet, så tæller vi ned her.": "Save a race from the map and we'll count down here.",
    "Overblik": "Overview", "gemte løb": "saved races", "tilmeldt": "registered", "gennemført i år": "completed this year", "lande": "countries",
    "Løbekalender": "Race calendar", "Din form": "Your form", "km/uge": "km/week",
    "10K-PB": "10K PB", "10K-form": "10K form", "half-form": "half form", "marathon-form": "marathon form",
    "Årets mål": "Yearly goal", "Målet er nået! 🎉": "Goal reached! 🎉",
    "Kommende løb i dashboardet": "Upcoming races",
    "Genveje": "Shortcuts", "🗺 Mit løbs-år": "🗺 My race year", "🔔 Påmindelser": "🔔 Reminders",
    "📅 Kalender-feed": "📅 Calendar feed", "🟠 Strava": "🟠 Strava", "🟠 Forbind Strava": "🟠 Connect Strava",
    "Profil & indstillinger": "Profile & settings", "Klik for at skifte profilbillede.": "Click to change profile photo.",
    "Gemmes kun på denne enhed.": "Stored on this device only.", "Tema": "Theme", "☀️ Lys": "☀️ Light", "🌙 Mørk": "🌙 Dark",
    "Sprog": "Language", "Dine data": "Your data", "⬇️ Download mine data": "⬇️ Download my data",
    "🗑 Slet alt": "🗑 Delete all", "Log ud": "Log out", "Gemt ✓": "Saved ✓",
    "Indstillinger": "Settings",
    "Ingen gemte løb endnu - find dem på kortet.": "No saved races yet - find them on the map.",
    // lister/paneler
    "Ingen løb matcher filtrene.": "No races match the filters.",
    "Prøv at åbne op for hvor eller hvornår.": "Try widening where or when.",
    "Afholdt": "Held", "af": "of",
    // modaler
    "Mit løbs-år": "My race year", "Mit løbs-år.": "My race year.", "Del billedet": "Share image", "Download": "Download",
    "Download billedet": "Download image", "Udforsk kortet": "Explore the map",
    "Påmindelser": "Reminders", "📅 Kalender-feed i modal": "📅 Calendar feed",
    "Forbind med Strava": "Connect with Strava", "Prøv med eksempeldata": "Try with sample data",
    "Afbryd Strava": "Disconnect Strava", "Opdatér fra Strava": "Refresh from Strava",
    "Måltider på dine løb": "Target times for your races",
    "Hent kalenderfil": "Download calendar file",
    "Apple Kalender": "Apple Calendar", "Google Kalender": "Google Calendar", "Outlook": "Outlook",
    "Åbn løbet": "Open race", "Læg også påmindelse i kalenderen": "Also add reminder to calendar",
    // ugedage (mini-kalender)
    "ma": "mo", "ti": "tu", "on": "we", "to": "th", "fr": "fr", "lø": "sa", "sø": "su",
  }));

  // måneder (fulde + korte) - bruges i regler så datoer med tal bevares
  const MDR = { januar: "January", februar: "February", marts: "March", april: "April", maj: "May", juni: "June", juli: "July", august: "August", september: "September", oktober: "October", november: "November", december: "December" };
  const MDR_KORT = { jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", maj: "May", jun: "Jun", jul: "Jul", aug: "Aug", sep: "Sep", okt: "Oct", nov: "Nov", dec: "Dec" };

  function oversætDato(t) {
    let m = t.match(/^(\d{1,2})\. ([a-zæøå]{3})\.? ?(\d{4})$/);
    if (m && MDR_KORT[m[2]]) return `${MDR_KORT[m[2]]} ${m[1]}, ${m[3]}`;
    m = t.match(/^([a-zæøå]{3})\.? ?(\d{4})$/);
    if (m && MDR_KORT[m[1]]) return `${MDR_KORT[m[1]]} ${m[2]}`;
    return t;
  }

  const REGLER = [
    [/^([\d.,]+) løb$/, "$1 races"],
    [/^· ([\d.,]+) løb$/, "· $1 races"],
    [/^Løb i (.+)\.$/, (m, sted) => `Races in ${({"Danmark":"Denmark","Norden":"the Nordics","Europa":"Europe","Hele verden":"the whole world"})[sted] || sted}.`],
    [/^Ingen løb matcher "(.+)"$/, 'No races match "$1"'],
    [/^([\d.]+) løb her$/, "$1 races here"],
    [/^([\d.]+) løb i gang$/, "$1 races live"],
    [/^(\d+) Runnin-løbere? er tilmeldt$/, (m) => m.replace("Runnin-løbere er tilmeldt", "Runnin runners are registered").replace("Runnin-løber er tilmeldt", "Runnin runner is registered")],
    [/^\+ (\d+) flere$/, "+ $1 more"],
    [/^fra ([\d.,]+) kr$/, "from $1 kr"],
    [/^Startgebyr: fra ([\d.,]+) kr$/, "Entry fee: from $1 kr"],
    [/^Næste udgave: (.+)$/, (m, resten) => `Next edition: ${oversætDato(resten)}`],
    [/^Afholdt (.+)$/, (m, resten) => `Held ${oversætDato(resten)}`],
    [/^(Godmorgen|Formiddag|Goddag|Godaften|Godnat), (.+)$/, (m, h, navn) => `${EN.get(h) || h}, ${navn}`],
    [/^(\d+) løb fra målet$/, "$1 races to go"],
    [/^gennemførte løb i (\d{4})$/, "completed races in $1"],
    [/^Justér mål \((\d+) løb\):$/, "Adjust goal ($1 races):"],
    [/^(\d+) løb gemt(.*)$/, "$1 races saved$2"],
    [/^(\d+) dage$/, "$1 days"],
    [/^til (.+)$/, "to $1"],
    // datoer: "3. okt. 2026" → "Oct 3, 2026" og månedsoverskrifter "Oktober 2026"
    [/^(\d{1,2})\. ([a-zæøå]{3})\.? ?(\d{4})$/, (m, d, md, år) => MDR_KORT[md] ? `${MDR_KORT[md]} ${d}, ${år}` : m],
    [/^(Januar|Februar|Marts|April|Maj|Juni|Juli|August|September|Oktober|November|December) (\d{4})$/i, (m, md, år) => `${MDR[md.toLowerCase()]} ${år}`],
    [/^([a-zæøå]{3})\.? ?(\d{4})$/, (m, md, år) => MDR_KORT[md] ? `${MDR_KORT[md]} ${år}` : m],
    [/^Typisk løbevejr i (\w+): ~(-?\d+)° om formiddagen · regn (\d+) af (\d+) dage$/,
      (m, md, t, a, b) => `Typical race weather in ${MDR[md] || md}: ~${t}° in the morning · rain ${a} of ${b} days`],
    [/^(\d+) af (\d+)$/, "$1 of $2"],
    [/^\+([\d.,]+) m stigning$/, "+$1 m gain"],
    [/^⛰ Officiel rute: ([\d,\.]+) km( · \+[\d.,]+ m)?( · (\d+) depoter)?$/, (m, km, stig, dep, depN) => `⛰ Official route: ${km} km${stig || ""}${depN ? ` · ${depN} aid stations` : ""}`],
    [/^Offentlige resultater · (.+) · opdateret (.+)\.$/, "Public results · $1 · updated $2."],
  ];

  function oversæt(tekst, dybde) {
    const t = tekst.trim();
    if (!t) return null;
    const hit = EN.get(t);
    if (hit) return tekst.replace(t, hit);
    for (const [re, ud] of REGLER) {
      if (re.test(t)) return tekst.replace(t, typeof ud === "string" ? t.replace(re, ud) : t.replace(re, ud));
    }
    // kombinerede linjer ("1. sep. 2026 · Løb · Namsos"): oversæt delene hver for sig
    if (!dybde && t.includes(" · ")) {
      const dele = t.split(" · ");
      let ændret = false;
      const ud = dele.map(d => {
        const o = oversæt(d, 1);
        if (o !== null) ændret = true;
        return o !== null ? o : d;
      });
      if (ændret) return tekst.replace(t, ud.join(" · "));
    }
    return null;
  }

  const ATTRS = ["placeholder", "aria-label", "title"];
  function behandl(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const ny = oversæt(node.nodeValue);
      if (ny !== null && ny !== node.nodeValue) node.nodeValue = ny;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.closest && node.closest("script, style")) return;
    for (const a of ATTRS) {
      const v = node.getAttribute?.(a);
      if (v) { const ny = oversæt(v); if (ny) node.setAttribute(a, ny); }
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let n; const tekster = [];
    while ((n = walker.nextNode())) tekster.push(n);
    for (const tn of tekster) {
      const ny = oversæt(tn.nodeValue);
      if (ny !== null && ny !== tn.nodeValue) tn.nodeValue = ny;
    }
    node.querySelectorAll?.("[placeholder],[aria-label],[title]").forEach(el => {
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const ny = oversæt(v); if (ny) el.setAttribute(a, ny); } }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = "en";
    document.title = "Runnin - Find your next race";
    document.querySelector('meta[name="description"]')?.setAttribute("content",
      "The world's races on one map. Find your next marathon, half, trail or triathlon - and register on the official site.");
    behandl(document.body);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === "characterData") { const ny = oversæt(m.target.nodeValue); if (ny !== null && ny !== m.target.nodeValue) m.target.nodeValue = ny; }
        else for (const node of m.addedNodes) behandl(node);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // søge-placeholder m.fl. sat af JS efter load
    setTimeout(() => behandl(document.body), 800);
  });
})();
