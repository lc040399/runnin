/* Runnin Dashboard - ét samlet overblik: næste løb m. nedtælling, stats, løbekalender,
   Strava-form, kommende løb og genveje. Staggered entrance-animationer. */
"use strict";

const dashOverlay = document.getElementById("dashOverlay");
let dashMonth = null; // YYYY-MM for mini-kalenderen

function hilsenOrd() {
  const t = new Date().getHours();
  return t < 5 ? "Godnat" : t < 10 ? "Godmorgen" : t < 12 ? "Formiddag" : t < 18 ? "Goddag" : "Godaften";
}

function openDashboard(fokus) {
  const user = getUser();
  if (!user) return openLogin();
  dashMonth = dashMonth || todayISO().slice(0, 7);
  renderDashboard();
  dashOverlay.hidden = false;
  if (fokus === "indstillinger") setTimeout(() =>
    document.getElementById("dashSettings")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
}
const closeDashboard = () => (dashOverlay.hidden = true);

let calAnimToken = 0;
function dashShiftMonth(d) {
  let [y, m] = dashMonth.split("-").map(Number);
  m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  dashMonth = `${y}-${String(m).padStart(2, "0")}`;
  // to-faset: gammel måned glider ud, ny glider ind fra modsat side - kun kalenderkortet røres
  const grid = dashOverlay.querySelector(".dash-cal");
  const titel = dashOverlay.querySelector(".dash-cal-nav strong");
  if (!grid) return;
  const dir = d > 0 ? "l" : "r";
  const token = ++calAnimToken;
  grid.classList.remove("slide-l", "slide-r", "out-l", "out-r");
  void grid.offsetWidth;
  grid.classList.add("out-" + dir);
  titel.classList.add("titel-skift");
  setTimeout(() => {
    if (token !== calAnimToken) return; // nyere klik har overtaget
    titel.textContent = fullMonth(dashMonth);
    titel.classList.remove("titel-skift");
    grid.innerHTML = dashCalCells();
    grid.classList.remove("out-" + dir);
    void grid.offsetWidth;
    grid.classList.add("slide-" + dir);
    bindCalCells();
  }, 150);
}

function dashCalCells() {
  const gemte = RACES.filter(r => favs.has(r.n));
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
  // pad altid til 6 rækker (42 celler), så kortet aldrig hopper i højden
  for (let i = fdow + dim; i < 42; i++) celler += `<div class="cal-cell empty"></div>`;
  return celler;
}

function bindCalCells() {
  dashOverlay.querySelectorAll(".dash-cal .cal-cell.has").forEach(cell => cell.onclick = () => {
    const d = dashMonth + "-" + String(cell.dataset.day).padStart(2, "0");
    const r = RACES.find(x => favs.has(x.n) && x.dt === d);
    if (r) { closeDashboard(); openDetail(r, true); }
  });
}

function renderDashboard() {
  const user = getUser();
  const gemte = RACES.filter(r => favs.has(r.n)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const kommende = gemte.filter(r => r.dt && r.dt >= todayISO()); // I DAG tæller med
  const next = kommende.find(r => entries.has(r.n)) || kommende[0] || null;
  const dage = next ? Math.max(0, Math.ceil((new Date(next.dt) - new Date()) / 86400000)) : null;
  const f = typeof stravaForm === "function" ? stravaForm() : null;

  /* mini-kalender for dashMonth: prikker = gemte/tilmeldte løb */
  const celler = dashCalCells();

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
          <div class="dash-tal">${dage === 0 ? `<span class="dash-idag">I DAG</span>` : `<span id="dashDage">0</span><small>dage</small>`}</div>
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
          <button data-act="mine"><strong>${RACES.filter(r => entries.has(r.n) && r.dt && r.dt.slice(0, 4) === todayISO().slice(0, 4) && r.dt <= todayISO()).length}</strong><span>gennemført i år</span></button>
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
        <div class="foto-kicker">${f ? `Din form <span class="strava-tag">Strava · ${f.ægte ? "live" : "demo"}</span>` : "Din form"}</div>
        ${f ? `
          <div class="dash-form">
            <div><strong>${f.snit}</strong><span>km/uge</span></div>
            <div><strong>${f.pb ? f.pb["10K"] : "-"}</strong><span>${f.ægte ? "10K-form" : "10K-PB"}</span></div>
            <div><strong>${f.halfEst ? "~" + f.halfEst : "-"}</strong><span>half-form</span></div>
            <div><strong>${f.maraEst ? "~" + f.maraEst : "-"}</strong><span>marathon-form</span></div>
          </div>`
        : `<div class="dash-sub" style="margin-top:10px">Forbind Strava og få formen ind i planlægningen.</div>
           <button class="cta strava-btn" id="dashStrava" style="margin-top:12px">Forbind med Strava</button>`}
      </div>

      <div class="dash-card dash-in" style="--i:5">
        <div class="foto-kicker">Årets mål</div>
        ${(() => {
          const år = todayISO().slice(0, 4);
          const mål = Math.max(1, +localStorage.getItem("runnin-maal") || 4);
          const gjort = RACES.filter(r => entries.has(r.n) && r.dt && r.dt.slice(0, 4) === år && r.dt <= todayISO()).length;
          const p = Math.min(gjort / mål, 1);
          const R = 34, OMKR = 2 * Math.PI * R;
          return `
          <div class="mål-flade">
            <svg class="mål-ring" viewBox="0 0 84 84" width="84" height="84">
              <circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--flade)" stroke-width="9"/>
              <circle cx="42" cy="42" r="${R}" fill="none" stroke="${p >= 1 ? "#10B981" : "var(--coral)"}" stroke-width="9"
                stroke-linecap="round" stroke-dasharray="${OMKR}" stroke-dashoffset="${OMKR * (1 - p)}"
                transform="rotate(-90 42 42)" class="mål-bue"/>
              <text x="42" y="47" text-anchor="middle" class="mål-tal">${gjort}/${mål}</text>
            </svg>
            <div class="mål-tekst">
              <strong>${p >= 1 ? `Målet er nået! 🎉` : `${mål - gjort} løb fra målet`}</strong>
              <span>gennemførte løb i ${år}</span>
              <div class="mål-justering">
                <span>Justér mål (${mål} løb):</span>
                <button id="målNed" aria-label="Lavere mål">−</button>
                <button id="målOp" aria-label="Højere mål">+</button>
              </div>
            </div>
          </div>`;
        })()}
      </div>

      <div class="dash-card dash-bred dash-in" style="--i:6">
        <div class="foto-kicker">Kommende løb</div>
        <div class="dash-liste">${kommendeRows}</div>
      </div>

      <div class="dash-card dash-bred dash-in" style="--i:7">
        <div class="foto-kicker">Genveje</div>
        <div class="dash-genveje">
          <button data-act="aar">🗺 Mit løbs-år</button>
          <button data-act="alarmer">🔔 Påmindelser</button>
          <button data-act="ics">📅 Kalender-feed</button>
          <button data-act="strava">${f ? "🟠 Strava" : "🟠 Forbind Strava"}</button>
        </div>
      </div>

      <div class="dash-card dash-bred dash-in" style="--i:8" id="dashSettings">
        <div class="foto-kicker">Profil & indstillinger</div>
        <div class="dash-settings">
          <div class="avatar-rad">
            <button class="avatar-upload" id="dashAvatarBtn" type="button" title="Skift profilbillede">
              <span id="dashAvatar">${avatarHtml(user)}</span>
              <span class="avatar-kamera">📷</span>
            </button>
            <div class="avatar-hjælp">Klik for at skifte profilbillede.<br><small>Gemmes kun på denne enhed.</small></div>
          </div>
          <div class="dash-profil-felter">
            <div>
              <label class="login-label" for="setNavn">Navn</label>
              <input class="login-field" id="setNavn" value="${user.navn.replace(/"/g, "&quot;")}" autocomplete="name">
            </div>
            <div>
              <label class="login-label" for="setEmail">E-mail</label>
              <input class="login-field" id="setEmail" type="email" value="${(user.email || "").replace(/"/g, "&quot;")}" autocomplete="email">
            </div>
            <button class="cta" id="setGem" type="button">Gem</button>
          </div>
          <div class="dash-settings-rk">
            <div>
              <span class="login-label">Tema</span>
              <div class="tema-valg">
                <button class="tema-chip" type="button" data-tema="lys">☀️ Lys</button>
                <button class="tema-chip" type="button" data-tema="mørk">🌙 Mørk</button>
              </div>
            </div>
            <div>
              <span class="login-label">Sprog</span>
              <div class="tema-valg">
                <button class="tema-chip sprog-chip ${SPROG === "da" ? "on" : ""}" type="button" data-sprog="da">Dansk</button>
                <button class="tema-chip sprog-chip ${SPROG === "en" ? "on" : ""}" type="button" data-sprog="en">English</button>
              </div>
            </div>
            <div>
              <span class="login-label">Dine data</span>
              <div class="dash-genveje">
                <button id="setExport" type="button">⬇️ Download mine data</button>
                <button id="setSlet" type="button" class="data-slet">🗑 Slet alt</button>
                <button id="setLogud" type="button">Log ud</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById("dashClose").onclick = closeDashboard;
  const målJustér = d => {
    const nu = Math.max(1, Math.min(52, (+localStorage.getItem("runnin-maal") || 4) + d));
    localStorage.setItem("runnin-maal", nu);
    renderDashboard();
  };
  document.getElementById("målNed") && (document.getElementById("målNed").onclick = () => målJustér(-1));
  document.getElementById("målOp") && (document.getElementById("målOp").onclick = () => målJustér(1));

  /* profil & indstillinger */
  const tema = localStorage.getItem("runnin-tema") || "lys";
  dashOverlay.querySelectorAll(".tema-chip").forEach(c => {
    c.classList.toggle("on", c.dataset.tema === tema);
    c.onclick = () => setTema(c.dataset.tema);
  });
  dashOverlay.querySelectorAll(".sprog-chip").forEach(c => c.onclick = () => { if (c.dataset.sprog !== SPROG) sætSprog(c.dataset.sprog); });
  document.getElementById("dashAvatarBtn").onclick = () => document.getElementById("fotoInput").click();
  document.getElementById("setGem").onclick = () => {
    const navn = document.getElementById("setNavn").value.trim();
    if (!navn) return;
    const email = document.getElementById("setEmail").value.trim();
    const u = getUser() || {};
    u.navn = navn;
    if (email) u.email = email; else delete u.email;
    localStorage.setItem("runnin-user", JSON.stringify(u));
    updateAuthUI();
    const knap = document.getElementById("setGem");
    knap.textContent = "Gemt ✓";
    setTimeout(() => { knap.textContent = "Gem"; }, 1400);
  };
  document.getElementById("setExport").onclick = eksportData;
  document.getElementById("setSlet").onclick = sletAlleData;
  document.getElementById("setLogud").onclick = () => { closeDashboard(); logUd(); };
  document.getElementById("dashPrev").onclick = () => dashShiftMonth(-1);
  document.getElementById("dashNext").onclick = () => dashShiftMonth(1);
  document.getElementById("dashStrava") && (document.getElementById("dashStrava").onclick = () => { closeDashboard(); openStrava(); });
  document.getElementById("dashSeKort") && (document.getElementById("dashSeKort").onclick = () => {
    const r = RACES.find(x => x.n === dashOverlay.querySelector(".dash-hero").dataset.n);
    if (r) { closeDashboard(); openDetail(r, true); }
  });

  // tæl nedtællingen op (0 → dage)
  if (dage !== null && dage > 0) {
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
  });
  dashOverlay.querySelectorAll(".dash-liste .row").forEach(row => row.onclick = () => {
    closeDashboard();
    openDetail(RACES[+row.dataset.id], true);
  });
  bindCalCells();
}

document.addEventListener("keydown", e => { if (e.key === "Escape" && !dashOverlay.hidden) closeDashboard(); });
