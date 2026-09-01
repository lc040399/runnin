/* Runnin konto: rigtig Supabase-auth + sky-synk af løbs-state.
   Modellen: appens localStorage forbliver visningslag og gæste-tilstand;
   dette lag logger ind/ud, henter skyens rækker ved login (union-merge, så
   gæstedata migreres op) og skubber ændringer pr. løb via skyPush(navn).
   Publishable-nøglen er offentlig by design - RLS beskytter alle rækker. */
"use strict";

const SB_URL = "https://qdqvyvidafslzvxgkvof.supabase.co";
const SB_NØGLE = "sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3";
const sb = window.supabase.createClient(SB_URL, SB_NØGLE);

/* fejl vises pænt og på dansk - aldrig rå API-tekst til brugeren */
const KONTO_FEJL = [
  [/invalid login credentials/i, "Forkert e-mail eller adgangskode."],
  [/email not confirmed/i, "Bekræft din e-mail først - tjek indbakken (og spam)."],
  [/already registered/i, "Der findes allerede en konto med den e-mail - log ind i stedet."],
  [/at least 6 characters/i, "Adgangskoden skal være mindst 6 tegn."],
  [/valid email|email.*invalid|invalid.*email/i, "Det ligner ikke en gyldig e-mail."],
  [/rate limit|too many/i, "For mange forsøg - vent et øjeblik og prøv igen."],
];
const pænFejl = e => (KONTO_FEJL.find(([re]) => re.test(e?.message || "")) || [null, "Det lykkedes ikke - prøv igen om lidt."])[1];

function visLoginFejl(tekst, roligt) {
  const el = document.getElementById("loginFejl");
  el.textContent = tekst || "";
  el.hidden = !tekst;
  el.classList.toggle("rolig", !!roligt);
  if (tekst) { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; } // genstart ryst
}

/* ---------- synk ---------- */
async function skyHent() {
  const { data, error } = await sb.from("user_races").select("race_n, gemt, tilmeldt, paamind, bib");
  if (error || !data) return;
  const bibs = JSON.parse(localStorage.getItem("runnin-bibs") || "{}");
  for (const r of data) {
    if (r.gemt) favs.add(r.race_n);
    if (r.tilmeldt) entries.add(r.race_n);
    if (r.paamind) alarms.add(r.race_n);
    if (r.bib) bibs[r.race_n] = r.bib;
  }
  localStorage.setItem("runnin-favs", JSON.stringify([...favs]));
  localStorage.setItem("runnin-entries", JSON.stringify([...entries]));
  localStorage.setItem("runnin-alarms", JSON.stringify([...alarms]));
  localStorage.setItem("runnin-bibs", JSON.stringify(bibs));
  // gæstedata, skyen ikke kender, migreres op
  const skyNavne = new Set(data.map(r => r.race_n));
  for (const n of new Set([...favs, ...entries, ...alarms, ...Object.keys(bibs)])) {
    if (!skyNavne.has(n)) skyPush(n);
  }
  updateFavCount();
  if (!panel.hidden && state.tab === "mine") renderFavs();
  if (!dashOverlay.hidden) renderDashboard();
}

async function skyPush(raceN) {
  try {
    const { data: s } = await sb.auth.getSession();
    const bruger = s.session?.user;
    if (!bruger) return; // gæst: kun lokalt
    const bibs = JSON.parse(localStorage.getItem("runnin-bibs") || "{}");
    const række = {
      user_id: bruger.id, race_n: raceN,
      gemt: favs.has(raceN), tilmeldt: entries.has(raceN),
      paamind: alarms.has(raceN), bib: bibs[raceN] || null,
    };
    if (!række.gemt && !række.tilmeldt && !række.paamind && !række.bib) {
      await sb.from("user_races").delete().eq("race_n", raceN);
    } else {
      await sb.from("user_races").upsert(række);
    }
  } catch (_) { /* offline er ok - næste login re-syncer */ }
}
window.skyPush = skyPush;

/* ---------- session ↔ appens brugermodel ---------- */
sb.auth.onAuthStateChange((event, session) => {
  if (!session?.user) return;
  const u = session.user;
  const eksisterende = getUser() || {};
  const navn = u.user_metadata?.navn || eksisterende.navn || u.email.split("@")[0];
  localStorage.setItem("runnin-user", JSON.stringify({ ...eksisterende, navn, email: u.email }));
  updateAuthUI();
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") skyHent();
});

window.kontoLogUd = async () => {
  try { await sb.auth.signOut(); } catch (_) {}
  // løbs-state ryddes lokalt, så næste bruger på maskinen ikke arver den - skyen husker alt
  ["runnin-user", "runnin-favs", "runnin-entries", "runnin-alarms", "runnin-bibs"].forEach(k => localStorage.removeItem(k));
  favs.clear(); entries.clear(); alarms.clear();
  updateAuthUI(); updateFavCount();
  if (!panel.hidden && state.tab === "mine") renderFavs();
};

/* ---------- login-formularen: to tilstande, ét submit ---------- */
let tilstand = "ind"; // "ind" = log ind, "op" = opret konto
window.loginTilstand = t => {
  tilstand = t;
  const op = t === "op";
  document.getElementById("loginTitle").textContent = op ? "Opret konto" : "Log ind";
  document.getElementById("navnWrap").hidden = !op;
  document.getElementById("loginCta").innerHTML = (op ? "Opret min konto" : "Log ind") + " <span>→</span>";
  document.getElementById("loginPw").autocomplete = op ? "new-password" : "current-password";
  document.getElementById("loginSkift").parentElement.firstChild.textContent = op ? "Har du allerede en konto? " : "Ny her? ";
  document.getElementById("loginSkift").textContent = op ? "Log ind" : "Opret en konto";
  visLoginFejl("");
  // blødt indhop af navnefeltet
  const modal = document.querySelector(".login-modal");
  modal.classList.remove("skifter"); void modal.offsetWidth; modal.classList.add("skifter");
};
document.getElementById("loginSkift").addEventListener("click", () => loginTilstand(tilstand === "ind" ? "op" : "ind"));

const kontoForm = document.getElementById("loginForm");
kontoForm.addEventListener("submit", async e => {
  e.preventDefault();
  visLoginFejl("");
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPw").value;
  if (!email || !pw) return visLoginFejl("Udfyld e-mail og adgangskode.");
  const knap = document.getElementById("loginCta");
  knap.disabled = true;
  if (tilstand === "op") {
    const navn = document.getElementById("loginName").value.trim();
    if (!navn) { knap.disabled = false; return visLoginFejl("Skriv dit navn, så vi kan hilse ordentligt."); }
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { navn } } });
    knap.disabled = false;
    if (error) return visLoginFejl(pænFejl(error));
    if (!data.session) return visLoginFejl("Kontoen er oprettet - bekræft din e-mail via linket i indbakken, og log så ind.", true);
  } else {
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    knap.disabled = false;
    if (error) return visLoginFejl(pænFejl(error));
  }
  closeLogin();
  if (state.tab === "mine") renderFavs();
});
