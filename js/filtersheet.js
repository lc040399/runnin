/* Mobil: de tre filter-dropdowns + Nær mig kollapset til ét bund-ark.
   Chips i arket PROXYER klik til de eksisterende (skjulte) .menu-knapper,
   så al state-, pille- og applyFilters-logik i app.js kører uændret. */
(function () {
  const trigger  = document.getElementById("filtreBtn");
  const sTrigger = document.getElementById("searchFilterBtn"); // filter-knap i søgebaren (mobil)
  const sPrik    = document.getElementById("searchFilterPrik");
  const overlay  = document.getElementById("filterOverlay");
  const sheet    = document.getElementById("filterSheet");
  const tal      = document.getElementById("filtreTal");
  if (!overlay || !sheet) return;

  const GRUPPER = [
    { key: "region", label: "Hvor" },
    { key: "month",  label: "Når" },
    { key: "type",   label: "Distance" },
  ];
  const NØGLER = GRUPPER.map(g => g.key);
  const antal = () => NØGLER.filter(k => state[k] != null).length;

  // badge på trigger-pillen - kaldes også fra applyFilters (via legend/aktive-filtre)
  window.opdaterFilterBadge = function () {
    const n = antal();
    if (tal) { tal.textContent = n; tal.hidden = n === 0; }
    if (trigger) trigger.classList.toggle("on", n > 0);
    if (sTrigger) sTrigger.classList.toggle("on", n > 0);
    if (sPrik) sPrik.hidden = n === 0;
  };

  function klikMenu(key, i) {
    const b = document.querySelector(`.menu[data-for="${key}"] button[data-i="${i}"]`);
    if (b) b.click(); // sætter state + synker desktop-pille + kalder applyFilters
  }

  function render() {
    const valgtIdx = g => { const i = menus[g].findIndex(o => o.v === state[g]); return i < 0 ? 0 : i; };
    // hvert blok får .dash-in + stigende --i, så indholdet stagger'er ned ved åbning
    let i = 1;
    const grupper = GRUPPER.map(g => {
      const valgt = valgtIdx(g.key);
      const chips = menus[g.key].map((o, k) =>
        `<button class="fs-chip${k === valgt ? " on" : ""}" data-key="${g.key}" data-i="${k}">${o.label}</button>`
      ).join("");
      return `<div class="fs-gruppe dash-in" style="--i:${i++}"><div class="fs-label">${g.label}</div><div class="fs-chips">${chips}</div></div>`;
    }).join("");
    const n = typeof filtered === "function" ? filtered().length : 0;
    sheet.innerHTML =
      `<div class="fs-head dash-in" style="--i:0"><h2>Filtre</h2><button class="close fs-luk" aria-label="Luk">✕</button></div>
       ${grupper}
       <button class="fs-near dash-in" style="--i:${i++}">📍 Nær mig</button>
       <div class="fs-actions dash-in" style="--i:${i}">
         <button class="fs-ryd"${antal() ? "" : " disabled"}>Nulstil</button>
         <button class="fs-vis">Vis ${n} løb</button>
       </div>`;
  }

  // let opdatering ved chip-tryk: marker valgte + tælling, UDEN at gen-rendere (bevarer stagger/scroll)
  function opdaterArkTilstand() {
    GRUPPER.forEach(g => {
      const valgt = menus[g.key].findIndex(o => o.v === state[g.key]);
      const v = valgt < 0 ? 0 : valgt;
      sheet.querySelectorAll(`.fs-chip[data-key="${g.key}"]`).forEach(b => b.classList.toggle("on", +b.dataset.i === v));
    });
    const vis = sheet.querySelector(".fs-vis");
    if (vis && typeof filtered === "function") vis.textContent = `Vis ${filtered().length} løb`;
    const ryd = sheet.querySelector(".fs-ryd");
    if (ryd) ryd.disabled = antal() === 0;
  }

  const åbn = () => { render(); overlay.hidden = false; };
  const luk = () => { overlay.hidden = true; };

  if (trigger) trigger.addEventListener("click", åbn);
  if (sTrigger) sTrigger.addEventListener("click", åbn);
  overlay.addEventListener("click", e => { if (e.target === overlay) luk(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) luk(); });

  sheet.addEventListener("click", e => {
    const chip = e.target.closest(".fs-chip");
    if (chip) { klikMenu(chip.dataset.key, +chip.dataset.i); opdaterArkTilstand(); return; }
    if (e.target.closest(".fs-luk")) return luk();
    if (e.target.closest(".fs-near")) { document.getElementById("nearBtn").click(); return luk(); }
    if (e.target.closest(".fs-ryd")) {
      NØGLER.forEach(k => { if (state[k] != null) klikMenu(k, 0); });
      opdaterArkTilstand();
      return;
    }
    if (e.target.closest(".fs-vis")) return luk();
  });

  window.opdaterFilterBadge();
})();
