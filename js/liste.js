/* Runnin listevisning - Kommende løb som fuldskærms-univers.
   Dit land er udgangspunktet, og scope kan udvides (Danmark → Norden → Europa →
   Hele verden). Grupperet som løbere tænker: I dag, I morgen, Denne uge, så måneder.
   Respekterer det globale distance-filter; renderes i bidder (perf-lærdommen). */
"use strict";

window.listeOverlay = document.getElementById("listeOverlay");
let listeScope = localStorage.getItem("runnin-liste-scope") || "dk";
let listeBidToken = 0;

const LISTE_SCOPES = [["dk", "Danmark"], ["norden", "Norden"], ["EU", "Europa"], ["alle", "Hele verden"]];
const iListeScope = r =>
  listeScope === "dk" ? r.cc === "DK" :
  listeScope === "norden" ? NORDICS.includes(r.cc) :
  listeScope === "EU" ? r.co === "EU" : true;

window.åbnListe = function () {
  renderListe();
  listeOverlay.hidden = false;
};
window.lukListe = function () {
  if (listeOverlay.hidden) return;
  listeOverlay.hidden = true;
  listeBidToken++;
};

/* dag-gruppering: I dag / I morgen / Denne uge / derefter måneder */
function listeGruppe(r, iDag, iMorgen, ugeSlut) {
  if (!r.dt) return fullMonth(r.m);
  if (r.dt === iDag) return "I dag";
  if (r.dt === iMorgen) return "I morgen";
  if (r.dt <= ugeSlut) return "Denne uge";
  return fullMonth(r.m);
}

function listeRække(r) {
  const dagNr = r.dt ? +r.dt.slice(8, 10) : "";
  const md = r.dt ? MONTHS[+r.dt.slice(5, 7) - 1].slice(0, 3) : MONTHS[+r.m.split("-")[1] - 1].slice(0, 3);
  const live = typeof isLive === "function" && isLive(r);
  return `<div class="l-række" data-id="${r.id}">
    <div class="l-dato">${r.dt ? `<strong>${dagNr}</strong><span>${md}.</span>` : `<span class="l-md-kun">${md}.</span>`}</div>
    <span class="dot" style="background:${TYPE_COLOR[r.t]}"></span>
    <div class="l-main">
      <div class="l-navn">${r.n}${entries.has(r.n) ? ` <span class="r-entry">🎟 Tilmeldt</span>` : ""}</div>
      <div class="l-meta">${r.d} · ${r.c} ${flag(r.cc)}</div>
    </div>
    <div class="l-side">
      ${live ? `<span class="row-live"><i class="live-dot"></i>LIVE</span>`
             : r.p ? `<span class="l-pris">${priceLabel(r.p)}</span>` : ""}
      <span class="l-pil">→</span>
    </div>
  </div>`;
}

window.renderListe = function () {
  const token = ++listeBidToken;
  const løb = RACES
    .filter(r => erKommende(r) && iListeScope(r) && (!state.type || r.t === state.type))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const nu = new Date();
  const iDag = iDagISO();
  const iMorgen = new Date(nu.getTime() + 86400000).toISOString().slice(0, 10);
  const søndag = new Date(nu.getTime() + ((7 - ((nu.getDay() + 6) % 7)) - 1) * 86400000).toISOString().slice(0, 10);

  const scopeChips = LISTE_SCOPES.map(([k, label]) =>
    `<button class="tema-chip ${listeScope === k ? "on" : ""}" data-scope="${k}">${label}</button>`).join("");
  const scopeNavn = LISTE_SCOPES.find(([k]) => k === listeScope)[1];

  listeOverlay.innerHTML = `
    <div class="liste-indre">
      <div class="dash-head dash-in" style="--i:0">
        <div>
          <div class="foto-kicker">Kommende løb</div>
          <h2>Løb i ${scopeNavn}.</h2>
        </div>
        <button class="close" id="listeLuk" aria-label="Luk">✕</button>
      </div>
      <div class="liste-styr dash-in" style="--i:1">
        <div class="tema-valg liste-scope">${scopeChips}</div>
        <div class="liste-styr-højre">
          <span class="liste-antal">${løb.length.toLocaleString("da-DK")} løb</span>
          <button class="pill" id="listeKalender">📅 Kalender</button>
        </div>
      </div>
      <div class="liste-krop" id="listeKrop"></div>
    </div>`;

  document.getElementById("listeLuk").onclick = () => { lukListe(); setTab("kort"); };
  document.getElementById("listeKalender").onclick = () => openCalendar();
  listeOverlay.querySelectorAll(".liste-scope .tema-chip").forEach(c => c.onclick = () => {
    listeScope = c.dataset.scope;
    localStorage.setItem("runnin-liste-scope", listeScope);
    renderListe();
  });

  const krop = document.getElementById("listeKrop");
  if (!løb.length) {
    krop.innerHTML = `<div class="empty">Ingen kommende løb i ${scopeNavn}${state.type ? " med det valgte distance-filter" : ""}.<br><em>Prøv et bredere scope.</em></div>`;
    return;
  }

  // bidder: første skærmfuld straks, resten pr. frame - grupper får stagger-indhop
  let i = 0, aktuelGruppe = "", gruppeIndeks = 1;
  const byg = antal => {
    let html = "";
    const til = Math.min(i + antal, løb.length);
    for (; i < til; i++) {
      const r = løb[i];
      const g = listeGruppe(r, iDag, iMorgen, søndag);
      if (g !== aktuelGruppe) {
        aktuelGruppe = g;
        gruppeIndeks++;
        html += `<div class="l-gruppe dash-in" style="--i:${Math.min(gruppeIndeks, 8)}">${g}</div>`;
      }
      html += listeRække(r);
    }
    return html;
  };
  krop.innerHTML = byg(60);
  (function næste() {
    if (token !== listeBidToken || i >= løb.length) return;
    krop.insertAdjacentHTML("beforeend", byg(300));
    requestAnimationFrame(næste);
  })();
};

/* klik på række → detalje på kortet */
listeOverlay.addEventListener("click", e => {
  const række = e.target.closest(".l-række");
  if (!række) return;
  lukListe();
  setTab("kort");
  openDetail(RACES[+række.dataset.id], true);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !listeOverlay.hidden) { lukListe(); setTab("kort"); }
});
