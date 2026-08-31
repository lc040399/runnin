/* Runnin Fotos - demo af fotograf-oplevelsen: startnummer → dine billeder, lagt ud langs ruten.
   Demodata (Pexels, fri licens) - samme galleri for alle løb, til en rigtig fotograf-integration kobles på. */
"use strict";

const FOTOS = [
  { id: 2402777, km: 0.2,  sted: "Startområdet",     tid: "09:02" },
  { id: 2526878, km: 4,    sted: "KM 4",             tid: "09:24" },
  { id: 1571939, km: 9,    sted: "KM 9",             tid: "09:51" },
  { id: 618612,  km: 14,   sted: "KM 14",            tid: "10:19" },
  { id: 2803158, km: 21.1, sted: "Halvvejs · KM 21", tid: "10:58" },
  { id: 1564470, km: 27,   sted: "KM 27",            tid: "11:31" },
  { id: 2168292, km: 33,   sted: "KM 33",            tid: "12:04" },
  { id: 3601094, km: 38,   sted: "KM 38",            tid: "12:32" },
  { id: 1954524, km: 42.2, sted: "Målstregen",       tid: "12:55" },
];
const MAX_KM = 42.2;
const pexels = (id, w) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

const fotoOverlay = document.getElementById("fotoOverlay");
let fotoRace = null, fotoBib = null, lbIndex = null;

function bibSubset(bib) {
  if (!bib) return FOTOS;
  const h = [...String(bib)].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 7);
  return FOTOS.filter((_, i) => (h >> i) % 4 !== 0); // deterministisk "match" pr. startnummer
}

// Startnummer er pr. LØB - husk det sidst brugte for hvert løb (nøgle = løbets navn)
const bibHusk = () => { try { return JSON.parse(localStorage.getItem("runnin-bibs")) || {}; } catch (_) { return {}; } };
const huskBib = (race, bib) => {
  const m = bibHusk();
  if (bib) m[race.n] = bib; else delete m[race.n];
  localStorage.setItem("runnin-bibs", JSON.stringify(m));
  window.skyPush?.(race.n);
};

function openFotos(race, bib) {
  fotoRace = race; fotoBib = bib ?? bibHusk()[race.n] ?? null; lbIndex = null;
  fotoOverlay.hidden = false;
  renderFotos();
}
function closeFotos() { fotoOverlay.hidden = true; lbIndex = null; }

function renderFotos() {
  const list = bibSubset(fotoBib);
  const grid = list.map((f, i) => `
    <figure class="foto-card" style="animation-delay:${i * 55}ms" data-i="${i}">
      <img src="${pexels(f.id, 800)}" alt="${f.sted}" loading="lazy">
      <figcaption><strong>${f.sted}</strong><span>${f.tid}</span></figcaption>
    </figure>`).join("");

  const strip = list.map((f, i) =>
    `<button class="route-dot" style="left:${(f.km / MAX_KM * 100).toFixed(1)}%" data-i="${i}" title="${f.sted} · ${f.tid}"></button>`
  ).join("");

  fotoOverlay.innerHTML = `
    <div class="foto-head">
      <div>
        <div class="foto-kicker">Billeder fra løbet · Demovisning</div>
        <h2>${fotoRace ? fotoRace.n : ""}</h2>
      </div>
      <button class="close" id="fotoClose" aria-label="Luk">✕</button>
    </div>

    <form class="bib-row" id="bibForm">
      <input class="bib-input" id="bibInput" inputmode="numeric" placeholder="Dit startnummer" value="${fotoBib ?? ""}">
      <button class="bib-btn" type="submit">Find mine billeder</button>
      <span class="bib-status">${fotoBib ? `${list.length} billeder af <strong>#${fotoBib}</strong>` : `${list.length} billeder fra ruten`}</span>
    </form>

    <div class="route-strip">
      <span class="route-label">Start</span>
      <div class="route-line">${strip}</div>
      <span class="route-label">Mål</span>
    </div>

    <div class="foto-grid">${grid}</div>
    <p class="foto-note">Demo: galleriet er det samme for alle løb, indtil en rigtig fotograf-integration er koblet på. Fotos: Pexels.</p>

    <div class="lightbox" id="lightbox" hidden>
      <button class="lb-nav lb-prev" aria-label="Forrige">‹</button>
      <figure><img id="lbImg" src="" alt=""><figcaption id="lbCap"></figcaption></figure>
      <button class="lb-nav lb-next" aria-label="Næste">›</button>
      <div class="lb-actions">
        <a id="lbDownload" class="lb-btn" download target="_blank" rel="noopener">Download i fuld opløsning</a>
        <button class="lb-btn ghost" id="lbClose">Luk</button>
      </div>
    </div>`;

  document.getElementById("fotoClose").onclick = closeFotos;
  document.getElementById("bibForm").onsubmit = e => {
    e.preventDefault();
    const v = document.getElementById("bibInput").value.trim();
    fotoBib = v || null;
    huskBib(fotoRace, fotoBib);
    renderFotos();
  };
  fotoOverlay.querySelectorAll(".foto-card, .route-dot").forEach(el =>
    el.addEventListener("click", () => openLightbox(+el.dataset.i)));
}

function openLightbox(i) {
  lbIndex = i;
  const list = bibSubset(fotoBib);
  const f = list[i];
  const lb = document.getElementById("lightbox");
  lb.hidden = false;
  document.getElementById("lbImg").src = pexels(f.id, 2000);
  document.getElementById("lbCap").textContent = `${f.sted} · ${f.tid}` + (fotoBib ? ` · #${fotoBib}` : "");
  document.getElementById("lbDownload").href = pexels(f.id, 2400);
  lb.querySelector(".lb-prev").onclick = e => { e.stopPropagation(); openLightbox((i - 1 + list.length) % list.length); };
  lb.querySelector(".lb-next").onclick = e => { e.stopPropagation(); openLightbox((i + 1) % list.length); };
  document.getElementById("lbClose").onclick = () => { lb.hidden = true; lbIndex = null; };
  lb.onclick = e => { if (e.target === lb) { lb.hidden = true; lbIndex = null; } };
}

document.addEventListener("keydown", e => {
  if (fotoOverlay.hidden) return;
  const lb = document.getElementById("lightbox");
  if (e.key === "Escape") { if (lb && !lb.hidden) { lb.hidden = true; lbIndex = null; } else closeFotos(); }
  if (lb && !lb.hidden && lbIndex !== null) {
    if (e.key === "ArrowLeft") lb.querySelector(".lb-prev").click();
    if (e.key === "ArrowRight") lb.querySelector(".lb-next").click();
  }
});
