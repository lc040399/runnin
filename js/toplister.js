/* Runnin Toplister - hurtigste tider fra offentlige resultater (RunSignup, USA).
   Statisk aggregat (data/toplister.json) bygget af tools/build-toplister.mjs -
   nul driftsomkostning, ærligt opdaterings-stempel. Danmark/verden følger med
   partnerdata (Sportstiming/DUV). "Find dig selv"-søgning fremhæver rækker. */
"use strict";

window.topOverlay = document.getElementById("topOverlay");
let topData = null;
let topKat = "marathon";
let topRegion = "verden"; // "verden" (RunSignup) | "nordisk" (EQ Timing)

const TOP_KATEGORIER = [["marathon", "Marathon"], ["half", "Halvmarathon"], ["10k", "10 km"], ["5k", "5 km"]];

window.åbnToplister = async function () {
  topOverlay.hidden = false;
  if (!topData) {
    topOverlay.innerHTML = `<div class="liste-indre"><div class="feed-tom" style="padding:60px 0;text-align:center">Henter leaderboards…</div></div>`;
    try { topData = await (await fetch("data/toplister.json?v=4")).json(); }
    catch (_) { topOverlay.innerHTML = `<div class="liste-indre"><div class="empty">Leaderboards kunne ikke hentes - prøv igen om lidt.</div></div>`; return; }
  }
  renderToplister();
};
window.lukToplister = function () { topOverlay.hidden = true; };

function renderToplister(søg) {
  const kilder = topRegion === "nordisk" ? (topData.nordisk || {}) : topData.boards;
  const rækker = kilder[topKat] || [];
  const kildeTekst = topRegion === "nordisk" ? (topData.nordiskKilde || "EQ Timing") : topData.kilde;
  const q = (søg || "").trim().toLowerCase();
  const match = r => q && r.navn.toLowerCase().includes(q);
  const podium = rækker.slice(0, 3);
  const rest = rækker.slice(3);

  topOverlay.innerHTML = `
    <div class="liste-indre liste-smal">
      <div class="dash-head dash-in" style="--i:0">
        <div>
          <div class="foto-kicker">Leaderboards</div>
          <h2>Hurtigste tider.</h2>
        </div>
        <button class="close" id="topLuk" aria-label="Luk">✕</button>
      </div>
      <div class="top-regioner dash-in" style="--i:1">
        <button class="tema-chip ${topRegion === "verden" ? "on" : ""}" data-region="verden">🌍 Verden</button>
        <button class="tema-chip ${topRegion === "nordisk" ? "on" : ""}" data-region="nordisk">🇳🇴 Norden</button>
      </div>
      <div class="liste-styr dash-in" style="--i:2">
        <div class="tema-valg">
          ${TOP_KATEGORIER.map(([k, label]) => `<button class="tema-chip ${topKat === k ? "on" : ""}" data-kat="${k}">${label}</button>`).join("")}
        </div>
        <input class="login-field top-søg" id="topSøg" placeholder="🔎 Find dig selv…" value="${(søg || "").replace(/"/g, "&quot;")}">
      </div>
      ${podium.length ? `
      <div class="podium dash-in" style="--i:2">
        ${podium.map((r, i) => `
        <div class="podium-kort podium-${i + 1} ${match(r) ? "top-match" : ""}">
          <div class="podium-medalje">${["🥇", "🥈", "🥉"][i]}</div>
          <div class="podium-tid">${r.tid}</div>
          <div class="podium-pace">${r.pace ? r.pace + " /km" : ""}</div>
          <div class="podium-navn">${r.cc ? flag(r.cc) + " " : ""}${r.navn}</div>
          ${r.by ? `<div class="podium-by">${r.by}</div>` : ""}
          <div class="podium-løb">${r.løb}</div>
        </div>`).join("")}
      </div>` : `<div class="empty">${topRegion === "nordisk" ? "Få nordiske resultater i denne kategori lige nu - de fyldes op gennem sæsonen." : "Ingen resultater i denne kategori endnu."}</div>`}
      <div class="top-liste dash-in" style="--i:3">
        ${rest.map((r, i) => `
        <div class="top-række ${match(r) ? "top-match" : ""}">
          <span class="top-plac">${i + 4}</span>
          <span class="top-flag">${r.cc ? flag(r.cc) : ""}</span>
          <div class="top-main">
            <div class="top-linje1"><strong>${r.navn}</strong>${r.by ? `<span class="top-by">${r.by}</span>` : ""}</div>
            <span class="top-løb">${r.løb}</span>
          </div>
          <div class="top-højre">
            <b class="top-tid">${r.tid}</b>
            ${r.pace ? `<span class="top-pace">${r.pace} /km</span>` : ""}
          </div>
        </div>`).join("")}
      </div>
      <p class="foto-note dash-in" style="--i:5">
        Offentlige resultater · ${kildeTekst} · opdateret ${topData.opdateret}.<br>
        ${topRegion === "nordisk"
          ? "Ægte tider fra EQ Timing (mest Norge). Danmark følger med Sportstiming-partnerskab; listerne vokser gennem sæsonen."
          : "🌍 Verden dækker løb tidsregistreret via RunSignup. Skift til Norden for nordiske tider."}
      </p>
    </div>`;

  document.getElementById("topLuk").onclick = () => { lukToplister(); setTab("kort"); };
  topOverlay.querySelectorAll("[data-region]").forEach(c => c.onclick = () => { topRegion = c.dataset.region; renderToplister(document.getElementById("topSøg")?.value); });
  topOverlay.querySelectorAll("[data-kat]").forEach(c => c.onclick = () => { topKat = c.dataset.kat; renderToplister(document.getElementById("topSøg").value); });
  const søgFelt = document.getElementById("topSøg");
  søgFelt.addEventListener("input", () => {
    const ql = søgFelt.value.trim().toLowerCase();
    let fund = 0;
    topOverlay.querySelectorAll(".podium-kort, .top-række").forEach(el => {
      const navn = (el.querySelector(".podium-navn") || el.querySelector(".top-main strong"))?.textContent.toLowerCase() || "";
      const match = !!ql && navn.includes(ql);
      if (match) fund++;
      el.classList.toggle("top-match", match);
      el.classList.toggle("top-dæmpet", !!ql && !match); // resten træder i baggrunden
    });
    let note = document.getElementById("topSøgNote");
    if (ql && !fund) {
      if (!note) {
        note = document.createElement("p");
        note.id = "topSøgNote";
        note.className = "foto-note";
        søgFelt.closest(".liste-styr").insertAdjacentElement("afterend", note);
      }
      note.textContent = "Ingen match i top 25 - måske ved dit næste løb.";
    } else note?.remove();
  });
  if (søg) { søgFelt.focus(); søgFelt.setSelectionRange(søg.length, søg.length); }
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !topOverlay.hidden) { lukToplister(); setTab("kort"); }
});
