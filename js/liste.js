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
  const live = typeof isLive === "function" && isLive(r);
  return `<div class="l-række" data-id="${r.id}">
    <span class="dot" style="background:${TYPE_COLOR[r.t]}"></span>
    <div class="l-main">
      <div class="l-navn">${r.n}</div>
      <div class="l-meta">${dateLabel(r)} · ${r.d} · ${r.c} ${flag(r.cc)}</div>
    </div>
    <div class="l-side">
      ${entries.has(r.n) ? `<span class="r-entry">🎟</span>` : ""}
      ${live ? `<span class="row-live"><i class="live-dot"></i>LIVE</span>`
             : r.p ? `<span class="l-pris">${priceLabel(r.p)}</span>` : ""}
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

  // type-vælger m. tællere (uafhængig af det aktive type-filter, så man kan skifte frit)
  const iScopeAlle = RACES.filter(r => erKommende(r) && iListeScope(r));
  const typeKort = Object.keys(TYPE_LABEL).map(t => {
    const antal = iScopeAlle.filter(r => r.t === t).length;
    return `<button class="l-type ${state.type === t ? "on" : ""}" data-type="${t}">
      <i style="background:${TYPE_COLOR[t]}"></i><strong>${antal.toLocaleString("da-DK")}</strong><span>${TYPE_LABEL[t]}</span>
    </button>`;
  }).join("");

  // LIVE lige nu + udvalgte klassikere (kuraterede løb m. pris) i scope
  const liveNu = typeof isLive === "function" ? iScopeAlle.filter(isLive).slice(0, 12) : [];
  const klassikere = iScopeAlle.filter(r => r.p).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).slice(0, 10);

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
      <div class="l-typer dash-in" style="--i:2">${typeKort}</div>
      ${liveNu.length ? `
      <div class="l-sek dash-in" style="--i:3"><i class="live-dot"></i> Live lige nu</div>
      <div class="l-hscroll dash-in" style="--i:3">
        ${liveNu.map(r => `<button class="l-minikort l-live" data-live="${r.id}">
          <span class="row-live"><i class="live-dot"></i>LIVE</span>
          <strong>${r.n}</strong><span>${r.c} ${flag(r.cc)}</span>
        </button>`).join("")}
      </div>` : ""}
      ${klassikere.length ? `
      <div class="l-sek dash-in" style="--i:4">Udvalgte klassikere</div>
      <div class="l-hscroll dash-in" style="--i:4">
        ${klassikere.map(r => `<button class="l-minikort" data-id="${r.id}">
          <i class="dot" style="background:${TYPE_COLOR[r.t]}"></i>
          <strong>${r.n}</strong><span>${dateLabel(r)} · ${priceLabel(r.p)}</span>
        </button>`).join("")}
      </div>` : ""}
      <div class="liste-krop" id="listeKrop"></div>
    </div>`;

  // type-kort filtrerer globalt (samme mekanik som legenden - pill/menu følger med)
  listeOverlay.querySelectorAll(".l-type").forEach(b => b.onclick = () => {
    const t = b.dataset.type;
    const typeMenu = document.querySelector('.menu[data-for="type"]');
    const idx = state.type === t ? 0 : menus.type.findIndex(o => o.v === t);
    typeMenu.querySelector(`button[data-i="${idx}"]`).click(); // applyFilters gen-renderer listen
  });
  listeOverlay.querySelectorAll(".l-minikort[data-id]").forEach(b => b.onclick = () => {
    lukListe(); setTab("kort"); openDetail(RACES[+b.dataset.id], true);
  });
  listeOverlay.querySelectorAll(".l-minikort[data-live]").forEach(b => b.onclick = () => {
    lukListe(); setTab("kort"); openLive(RACES[+b.dataset.live]);
  });

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

  // gruppe-tællere beregnes først, så headerne kan vise "September 2026 · 431 løb"
  const gruppeAntal = {};
  for (const r of løb) {
    const g = listeGruppe(r, iDag, iMorgen, søndag);
    gruppeAntal[g] = (gruppeAntal[g] || 0) + 1;
  }
  // grid pr. gruppe: header i fuld bredde, rækker i responsivt grid - stadig i bidder
  let i = 0, aktuelGruppe = "", gruppeIndeks = 4, aktueltGrid = null;
  const byg = antal => {
    const til = Math.min(i + antal, løb.length);
    for (; i < til; i++) {
      const r = løb[i];
      const g = listeGruppe(r, iDag, iMorgen, søndag);
      if (g !== aktuelGruppe) {
        aktuelGruppe = g;
        gruppeIndeks++;
        krop.insertAdjacentHTML("beforeend",
          `<div class="l-gruppe dash-in" style="--i:${Math.min(gruppeIndeks, 9)}">${g} <span class="l-gruppe-antal">· ${gruppeAntal[g].toLocaleString("da-DK")} løb</span></div><div class="l-grid"></div>`);
        aktueltGrid = krop.lastElementChild;
      }
      aktueltGrid.insertAdjacentHTML("beforeend", listeRække(r));
    }
  };
  byg(80);
  (function næste() {
    if (token !== listeBidToken || i >= løb.length) return;
    byg(400);
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
