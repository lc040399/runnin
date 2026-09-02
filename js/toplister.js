/* Runnin Toplister - hurtigste tider fra offentlige resultater (RunSignup, USA).
   Statisk aggregat (data/toplister.json) bygget af tools/build-toplister.mjs -
   nul driftsomkostning, ærligt opdaterings-stempel. Danmark/verden følger med
   partnerdata (Sportstiming/DUV). "Find dig selv"-søgning fremhæver rækker. */
"use strict";

window.topOverlay = document.getElementById("topOverlay");
let topData = null;
let topKat = "marathon";

const TOP_KATEGORIER = [["marathon", "Marathon"], ["half", "Halvmarathon"], ["10k", "10 km"], ["5k", "5 km"]];

window.åbnToplister = async function () {
  topOverlay.hidden = false;
  if (!topData) {
    topOverlay.innerHTML = `<div class="liste-indre"><div class="feed-tom" style="padding:60px 0;text-align:center">Henter toplister…</div></div>`;
    try { topData = await (await fetch("data/toplister.json?v=2")).json(); }
    catch (_) { topOverlay.innerHTML = `<div class="liste-indre"><div class="empty">Toplisterne kunne ikke hentes - prøv igen om lidt.</div></div>`; return; }
  }
  renderToplister();
};
window.lukToplister = function () { topOverlay.hidden = true; };

function renderToplister(søg) {
  const rækker = topData.boards[topKat] || [];
  const q = (søg || "").trim().toLowerCase();
  const match = r => q && r.navn.toLowerCase().includes(q);
  const podium = rækker.slice(0, 3);
  const rest = rækker.slice(3);

  topOverlay.innerHTML = `
    <div class="liste-indre liste-smal">
      <div class="dash-head dash-in" style="--i:0">
        <div>
          <div class="foto-kicker">Toplister</div>
          <h2>Hurtigste tider.</h2>
        </div>
        <button class="close" id="topLuk" aria-label="Luk">✕</button>
      </div>
      <div class="liste-styr dash-in" style="--i:1">
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
          <div class="podium-navn">${r.navn}</div>
          <div class="podium-løb">${r.løb}</div>
        </div>`).join("")}
      </div>` : `<div class="empty">Ingen resultater i denne kategori endnu.</div>`}
      <div class="top-liste dash-in" style="--i:3">
        ${rest.map((r, i) => `
        <div class="top-række ${match(r) ? "top-match" : ""}">
          <span class="top-plac">${i + 4}</span>
          <div class="top-main"><strong>${r.navn}</strong><span>${r.løb}</span></div>
          <b class="top-tid">${r.tid}</b>
        </div>`).join("")}
      </div>
      <p class="foto-note dash-in" style="--i:4">
        Offentlige resultater · ${topData.kilde} · opdateret ${topData.opdateret}.<br>
        🇩🇰 Danmark og 🌍 resten af verden kommer med partnerdata - tiderne her er ægte, men dækker kun løb tidsregistreret via RunSignup.
      </p>
    </div>`;

  document.getElementById("topLuk").onclick = () => { lukToplister(); setTab("kort"); };
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
