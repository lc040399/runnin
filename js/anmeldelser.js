/* Runnin anmeldelser: løbere bedømmer løb de har gennemført (1-5 stjerner + tekst).
   Vises på detaljen med gennemsnit + venners anmeldelser fremhævet. Læsning via
   SECURITY DEFINER-RPC race_anmeldelser (navne + venne-markering); skrivning via den
   authenticerede sb-klient (RLS: kun egen række). At anmelde markerer løbet gennemført. */
"use strict";
(() => {
  const el = () => document.getElementById("dReviews");
  const stjerner = (n, klasse = "") => {
    let s = "";
    for (let i = 1; i <= 5; i++) s += `<span class="stj ${klasse} ${i <= Math.round(n) ? "fyldt" : ""}">★</span>`;
    return s;
  };
  const relativ = iso => {
    const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (d <= 0) return "i dag";
    if (d === 1) return "i går";
    if (d < 30) return `${d} dage siden`;
    if (d < 365) return `${Math.floor(d / 30)} mdr. siden`;
    return `${Math.floor(d / 365)} år siden`;
  };
  const esc = s => (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

  async function render(race) {
    const box = el();
    if (!box || !window.sb) return;
    box.dataset.race = race.n;
    let rows = [];
    try {
      const { data } = await window.sb.rpc("race_anmeldelser", { p_race: race.n });
      rows = data || [];
    } catch (_) { }
    if (box.dataset.race !== race.n) return;   // brugeren skiftede løb imens

    const antal = rows.length;
    const snit = antal ? rows.reduce((s, r) => s + r.rating, 0) / antal : 0;
    const min = rows.find(r => r.er_mig);
    const { data: s } = await window.sb.auth.getSession().catch(() => ({ data: {} }));
    const loggetInd = !!s?.session?.user;

    // hoved
    let h = `<div class="rv-hoved"><span class="rv-titel">Anmeldelser</span>`;
    if (antal) h += `<span class="rv-snit">${stjerner(snit)} <b>${snit.toFixed(1)}</b> · ${antal}</span>`;
    h += `</div>`;

    // skriv/redigér (kun logget ind)
    if (loggetInd) {
      const r0 = min?.rating || 0, t0 = esc(min?.tekst || "");
      h += `<div class="rv-skriv" data-valgt="${r0}">
        <div class="rv-label">${min ? "Din anmeldelse" : "Har du løbet det? Anmeld det"}</div>
        <div class="rv-vaelg" id="rvVaelg">${[1, 2, 3, 4, 5].map(i => `<span class="stj vaelg ${i <= r0 ? "fyldt" : ""}" data-v="${i}">★</span>`).join("")}</div>
        <textarea class="rv-tekst" id="rvTekst" maxlength="2000" placeholder="Hvordan var ruten, stemningen, arrangementet? (valgfri)">${t0}</textarea>
        <button class="cta rv-send" id="rvSend">${min ? "Opdatér" : "Send anmeldelse"} <span>→</span></button>
        <p class="rv-fejl" id="rvFejl" hidden></p>
      </div>`;
    } else if (antal === 0) {
      h += `<div class="rv-tom">Ingen anmeldelser endnu. <button class="rv-login-link" id="rvLogin">Log ind</button> for at anmelde.</div>`;
    }

    // liste
    if (antal) {
      h += `<div class="rv-liste">` + rows.map(r => `
        <div class="rv-kort${r.er_ven ? " ven" : ""}">
          <div class="rv-top">
            <span class="rv-navn">${r.er_ven ? "🏃 " : ""}${esc(r.navn)}${r.er_mig ? " <em>(dig)</em>" : ""}</span>
            <span class="rv-dato">${relativ(r.created_at)}</span>
          </div>
          <div class="rv-str">${stjerner(r.rating, "lille")}</div>
          ${r.tekst ? `<div class="rv-txt">${esc(r.tekst)}</div>` : ""}
        </div>`).join("") + `</div>`;
    }

    box.innerHTML = h;
    bind(race);
  }

  function bind(race) {
    const box = el();
    const vaelg = box.querySelector("#rvVaelg");
    const skriv = box.querySelector(".rv-skriv");
    if (vaelg) {
      vaelg.querySelectorAll(".stj").forEach(st => {
        st.onclick = () => {
          const v = +st.dataset.v;
          skriv.dataset.valgt = v;
          vaelg.querySelectorAll(".stj").forEach((x, i) => x.classList.toggle("fyldt", i < v));
        };
      });
    }
    const send = box.querySelector("#rvSend");
    if (send) send.onclick = () => indsend(race);
    const login = box.querySelector("#rvLogin");
    if (login) login.onclick = () => document.getElementById("loginBtn")?.click();
  }

  async function indsend(race) {
    const box = el();
    const rating = +box.querySelector(".rv-skriv").dataset.valgt;
    const tekst = box.querySelector("#rvTekst").value.trim().slice(0, 2000);
    const fejl = box.querySelector("#rvFejl");
    if (!rating) { fejl.textContent = "Vælg en bedømmelse (1-5 stjerner)."; fejl.hidden = false; return; }
    const send = box.querySelector("#rvSend");
    send.disabled = true; fejl.hidden = true;
    try {
      const { data: s } = await window.sb.auth.getSession();
      const bruger = s.session?.user;
      if (!bruger) { document.getElementById("loginBtn")?.click(); return; }
      const { error } = await window.sb.from("race_reviews")
        .upsert({ user_id: bruger.id, race_n: race.n, rating, tekst: tekst || null });
      if (error) throw error;
      // at anmelde = gennemført → synk til user_races
      if (window.completed) { window.completed.add(race.n); window.saveCompleted?.(); window.skyPush?.(race.n); }
      await render(race);
    } catch (_) {
      fejl.textContent = "Kunne ikke gemme lige nu. Prøv igen om lidt.";
      fejl.hidden = false;
      send.disabled = false;
    }
  }

  window.renderAnmeldelser = render;
})();
