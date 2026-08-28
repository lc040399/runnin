/* Runnin Dashboard - ét samlet overblik: næste løb m. nedtælling, stats, løbekalender,
   Strava-form, kommende løb og genveje. Staggered entrance-animationer. */
"use strict";

const dashOverlay = document.getElementById("dashOverlay");
let dashMonth = null; // YYYY-MM for mini-kalenderen

function hilsenOrd() {
  const t = new Date().getHours();
  return t < 5 ? "Godnat" : t < 10 ? "Godmorgen" : t < 12 ? "Formiddag" : t < 18 ? "Goddag" : "Godaften";
}

function openDashboard() {
  const user = getUser();
  if (!user) return openLogin();
  dashMonth = dashMonth || todayISO().slice(0, 7);
  renderDashboard();
  dashOverlay.hidden = false;
}
const closeDashboard = () => (dashOverlay.hidden = true);

function dashShiftMonth(d) {
  let [y, m] = dashMonth.split("-").map(Number);
  m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  dashMonth = `${y}-${String(m).padStart(2, "0")}`;
  renderDashboard();
}

function renderDashboard() {
  const user = getUser();
  const gemte = RACES.filter(r => favs.has(r.id)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const kommende = gemte.filter(r => r.dt && new Date(r.dt) >= new Date());
  const next = kommende.find(r => entries.has(r.n)) || kommende[0] || null;
  const dage = next ? Math.ceil((new Date(next.dt) - new Date()) / 86400000) : null;
  const f = typeof stravaForm === "function" ? stravaForm() : null;

  /* mini-kalender for dashMonth: prikker = gemte/tilmeldte løb */
  const [y, m] = dashMonth.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const fdow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const byDay = {};
  for (const r of gemte) if (r.dt && r.m === dashMonth) (byDay[+r.dt.slice(8, 10)] ??= []).push(r);
  let celler = ["ma", "ti", "on", "to", "fr", "lø", "sø"].map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < fdow; i++) celler += `<div class="cal-cell empty"></div>`;
  const idag = todayISO();
  for (let d = 1; d <= dim; d++) {
    const rs = byDay[d] || [];
    const erIdag = dashMonth + "-" + String(d).padStart(2, "0") === idag;
    celler += `<div class="cal-cell${rs.length ? " has" : ""}${erIdag ? " idag" : ""}" data-day="${d}">
      <span class="cal-daynum">${d}</span>
      <span class="cal-dots">${rs.slice(0, 3).map(r => `<i style="background:${TYPE_COLOR[r.t]}"></i>`).join("")}</span>
    </div>`;
  }

  const kommendeRows = (kommende.length ? kommende : gemte).slice(0, 5).map(rowHtml).join("")
    || `<div class="empty">Ingen gemte løb endnu - find dem på kortet.</div>`;

  dashOverlay.innerHTML = `
    <div class="dash-head dash-in" style="--i:0">
      <div>
        <div class="foto-kicker">Dashboard</div>
        <h2>${hilsenOrd()}, ${user.navn.split(" ")[0]}.</h2>
      </div>
      <button class="close" id="dashClose" aria-label="Luk">✕</button>
    </div>

    <div class="dash-grid">
      <div class="dash-card dash-hero dash-in" style="--i:1" ${next ? `data-n="${next.n.replace(/"/g, "&quot;")}"` : ""}>
        ${next ? `
          <div class="foto-kicker">${entries.has(next.n) ? "🎟 Dit næste tilmeldte løb" : "Dit næste løb"}</div>
          <div class="dash-tal"><span id="dashDage">0</span><small>dage</small></div>
          <div class="dash-næste">${next.n}</div>
          <div class="dash-sub">${dateLabel(next)} · ${next.c} ${flag(next.cc)}</div>
          <button class="cta" id="dashSeKort" style="margin-top:14px">Se på kortet <span>→</span></button>`
        : `
          <div class="foto-kicker">Dit næste løb</div>
          <div class="dash-næste" style="margin-top:14px">Intet planlagt endnu</div>
          <div class="dash-sub">Gem et løb fra kortet, så tæller vi ned her.</div>`}
      </div>

      <div class="dash-card dash-in" style="--i:2">
        <div class="foto-kicker">Overblik</div>
        <div class="dash-stats">
          <button data-act="mine"><strong>${gemte.length}</strong><span>gemte løb</span></button>
          <button data-act="mine"><strong>${[...entries].length}</strong><span>tilmeldt</span></button>
          <button data-act="alarmer"><strong>${alarms.size}</strong><span>alarmer</span></button>
          <button data-act="mine"><strong>${new Set(gemte.map(r => r.cc)).size}</strong><span>lande</span></button>
        </div>
      </div>

      <div class="dash-card dash-in" style="--i:3">
        <div class="dash-cal-head">
          <span class="foto-kicker">Løbekalender</span>
          <span class="dash-cal-nav">
            <button class="icon-btn" id="dashPrev">‹</button>
            <strong>${fullMonth(dashMonth)}</strong>
            <button class="icon-btn" id="dashNext">›</button>
          </span>
        </div>
        <div class="cal-grid dash-cal">${celler}</div>
      </div>

      <div class="dash-card dash-in" style="--i:4">
        <div class="foto-kicker">${f ? `Din form <span class="strava-tag">Strava · demo</span>` : "Din form"}</div>
        ${f ? `
          <div class="dash-form">
            <div><strong>${f.snit}</strong><span>km/uge</span></div>
            <div><strong>${f.pb["10K"]}</strong><span>10K-PB</span></div>
            <div><strong>~${f.halfEst}</strong><span>half-form</span></div>
            <div><strong>~${f.maraEst}</strong><span>marathon-form</span></div>
          </div>`
        : `<div class="dash-sub" style="margin-top:10px">Forbind Strava og få formen ind i planlægningen.</div>
           <button class="cta strava-btn" id="dashStrava" style="margin-top:12px">Forbind med Strava</button>`}
      </div>

      <div class="dash-card dash-bred dash-in" style="--i:5">
        <div class="foto-kicker">Kommende løb</div>
        <div class="dash-liste">${kommendeRows}</div>
      </div>

      <div class="dash-card dash-bred dash-in" style="--i:6">
        <div class="foto-kicker">Genveje</div>
        <div class="dash-genveje">
          <button data-act="aar">🗺 Mit løbs-år</button>
          <button data-act="ics">📅 Kalender-feed</button>
          <button data-act="strava">${f ? "🟠 Strava" : "🟠 Forbind Strava"}</button>
          <button data-act="rediger">👤 Redigér profil</button>
        </div>
      </div>
    </div>`;

  document.getElementById("dashClose").onclick = closeDashboard;
  document.getElementById("dashPrev").onclick = () => dashShiftMonth(-1);
  document.getElementById("dashNext").onclick = () => dashShiftMonth(1);
  document.getElementById("dashStrava") && (document.getElementById("dashStrava").onclick = () => { closeDashboard(); openStrava(); });
  document.getElementById("dashSeKort") && (document.getElementById("dashSeKort").onclick = () => {
    const r = RACES.find(x => x.n === dashOverlay.querySelector(".dash-hero").dataset.n);
    if (r) { closeDashboard(); openDetail(r, true); }
  });

  // tæl nedtællingen op (0 → dage)
  if (dage !== null) {
    const el = document.getElementById("dashDage");
    const t0 = performance.now(), dur = 900;
    (function opTæl(ts) {
      const p = Math.min((ts - t0) / dur, 1);
      el.textContent = Math.round(dage * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      if (p < 1) requestAnimationFrame(opTæl);
    })(t0);
  }

  dashOverlay.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    closeDashboard();
    if (act === "mine") { setTab("mine"); panel.hidden = false; renderFavs(); }
    if (act === "alarmer") visAlarmer();
    if (act === "aar") openYearCard();
    if (act === "ics") openKalenderFeed();
    if (act === "strava") openStrava();
    if (act === "rediger") openLogin();
  });
  dashOverlay.querySelectorAll(".dash-liste .row").forEach(row => row.onclick = () => {
    closeDashboard();
    openDetail(RACES[+row.dataset.id], true);
  });
  dashOverlay.querySelectorAll(".dash-cal .cal-cell.has").forEach(cell => cell.onclick = () => {
    const d = dashMonth + "-" + String(cell.dataset.day).padStart(2, "0");
    const r = RACES.find(x => favs.has(x.id) && x.dt === d);
    if (r) { closeDashboard(); openDetail(r, true); }
  });
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !dashOverlay.hidden) closeDashboard(); });
