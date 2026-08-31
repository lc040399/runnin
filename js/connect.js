/* Runnin Connect: Strava (rigtig OAuth ELLER demo-mode) + kalender-feed (.ics).
   Rigtig kobling: OAuth-redirect → /api/strava-token bytter code til tokens
   (client_secret bor kun i Pages-env) → aktiviteter hentes via /api/strava-proxy.
   Tokens gemmes KUN i din egen browser (localStorage) - Runnin har ingen database.
   Stravas vilkår: dine data vises kun til dig. Demo-mode består som fallback. */
"use strict";

/* ================= STRAVA ================= */
const STRAVA_ORANGE = "#FC4C02";
const stravaData = () => { try { return JSON.parse(localStorage.getItem("runnin-strava")); } catch (_) { return null; } };
const stravaAuth = () => { try { return JSON.parse(localStorage.getItem("runnin-strava-auth")); } catch (_) { return null; } };

const DEMO_ATLET = {
  ugeKm: [38, 44, 40, 46],            // seneste 4 uger
  pb: { "5K": "19:42", "10K": "41:05", "Half": "1:31:28", "Marathon": "3:22:54" },
};

const tidTilSek = t => t.split(":").reduce((a, v) => a * 60 + +v, 0);
const sekTilTid = s => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(ss).padStart(2, "0");
};
// Riegel: t2 = t1 × (d2/d1)^1.06
const riegel = (t1sek, d1, d2) => t1sek * Math.pow(d2 / d1, 1.06);

function stravaForm() {
  const s = stravaData();
  if (!s) return null;
  const snit = Math.round(s.ugeKm.reduce((a, v) => a + v, 0) / s.ugeKm.length);
  if (!s.pb) return { snit, pb: null, maraEst: null, halfEst: null, ægte: s.kilde === "strava" };
  return {
    snit, pb: s.pb, ægte: s.kilde === "strava",
    maraEst: sekTilTid(riegel(tidTilSek(s.pb["10K"]), 10, 42.195)),
    halfEst: sekTilTid(riegel(tidTilSek(s.pb["10K"]), 10, 21.0975)),
  };
}

/* ---------- rigtig Strava: konfiguration, OAuth og datahentning ---------- */
let stravaCfgCache = null;
async function stravaCfg() {
  if (stravaCfgCache) return stravaCfgCache;
  try { stravaCfgCache = await (await fetch("/api/strava-token")).json(); }
  catch (_) { stravaCfgCache = { configured: false }; }
  return stravaCfgCache;
}

function startStravaLogin(clientId) {
  const redirect = location.origin + "/";
  location.href = "https://www.strava.com/oauth/authorize" +
    `?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&approval_prompt=auto&scope=activity:read_all&state=runnin-strava`;
}

async function gyldigStravaToken() {
  let a = stravaAuth();
  if (!a?.access_token) return null;
  if ((a.expires_at || 0) * 1000 < Date.now() + 60000) {
    const r = await fetch("/api/strava-token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: a.refresh_token }),
    });
    const d = await r.json();
    if (!d.access_token) { localStorage.removeItem("runnin-strava-auth"); return null; }
    a = { ...a, ...d };
    localStorage.setItem("runnin-strava-auth", JSON.stringify(a));
  }
  return a;
}

// henter seneste 90 dages løb og koger dem ned til ugeKm + formtider
async function opdaterStravaData() {
  const a = await gyldigStravaToken();
  if (!a) throw new Error("ingen adgang");
  const efter = Math.floor(Date.now() / 1000) - 90 * 86400;
  const løb = [];
  for (let side = 1; side <= 3; side++) {
    const r = await fetch(`/api/strava?path=athlete/activities&after=${efter}&per_page=200&page=${side}`,
      { headers: { Authorization: `Bearer ${a.access_token}` } });
    if (!r.ok) throw new Error("aktiviteter " + r.status);
    const batch = await r.json();
    løb.push(...batch.filter(x => /Run/i.test(x.sport_type || x.type || "") && x.distance > 500 && x.moving_time > 0));
    if (batch.length < 200) break;
  }
  // 4 rullende 7-dages vinduer, nyeste sidst
  const nu = Date.now();
  const ugeKm = [3, 2, 1, 0].map(i => {
    const til = nu - i * 7 * 86400000, fra = til - 7 * 86400000;
    return Math.round(løb.filter(x => { const t = Date.parse(x.start_date); return t >= fra && t < til; })
      .reduce((s, x) => s + x.distance, 0) / 1000);
  });
  // formtid: bedste 10K-ækvivalent (Riegel) over løb ≥ 4,5 km
  let bedst10 = null;
  for (const x of løb) {
    if (x.distance < 4500) continue;
    const est = x.moving_time * Math.pow(10000 / x.distance, 1.06);
    if (!bedst10 || est < bedst10) bedst10 = est;
  }
  const pb = bedst10 ? {
    "5K": sekTilTid(riegel(bedst10, 10, 5)), "10K": sekTilTid(bedst10),
    "Half": sekTilTid(riegel(bedst10, 10, 21.0975)), "Marathon": sekTilTid(riegel(bedst10, 10, 42.195)),
  } : null;
  localStorage.setItem("runnin-strava", JSON.stringify({
    ugeKm, pb, kilde: "strava", fornavn: a.athlete?.fornavn || "",
    antalLøb: løb.length, hentet: new Date().toISOString(),
  }));
}

// OAuth-retur: Strava sender os tilbage med ?code=...&state=runnin-strava
(async function stravaOAuthRetur() {
  const p = new URLSearchParams(location.search);
  if (p.get("state") !== "runnin-strava") return;
  const code = p.get("code");
  history.replaceState(null, "", location.pathname + location.hash); // rens URL med det samme
  if (!code) return; // brugeren afviste - helt fint
  try {
    const r = await fetch("/api/strava-token", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (!d.access_token) throw new Error("token");
    localStorage.setItem("runnin-strava-auth", JSON.stringify(d));
    await opdaterStravaData();
  } catch (_) {
    localStorage.removeItem("runnin-strava-auth");
  }
  openStrava(); // viser enten formen eller en rolig fejl-tilstand
})();

// måltid for et konkret løb ud fra 10K-PB (Riegel); null hvor estimat ikke giver mening
function stravaMåltid(r, s) {
  const t10 = tidTilSek(s.pb["10K"]);
  if (r.t === "marathon") return sekTilTid(riegel(t10, 10, 42.195));
  if (r.t === "half") return sekTilTid(riegel(t10, 10, 21.0975));
  if (r.t === "kort") {
    const km = parseFloat(String(r.d).replace(",", "."));
    if (km && km >= 3 && km <= 15) return sekTilTid(riegel(t10, 10, km));
  }
  return null; // ultra/trail/tri: for mange ubekendte til et ærligt estimat
}

async function openStrava() {
  const s = stravaData();
  const modal = featOverlay.querySelector(".cal-modal");
  if (!s) {
    const cfg = await stravaCfg();
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Forbind med Strava</h2><button class="close" id="featClose">✕</button></div>
      <p class="strava-intro">Din form ind i Runnin - så bliver kalenderen personlig:</p>
      <ul class="strava-punkter">
        <li>🏅 Formtider beregnet af dine seneste 90 dages løb</li>
        <li>📊 Ugentlige kilometer og formkurve</li>
        <li>🎯 Realistiske måltider på løbene du har gemt</li>
      </ul>
      ${cfg.configured
        ? `<button class="cta strava-btn" id="stravaConnect">Forbind med Strava</button>
           <button class="save" id="stravaDemo" style="margin-top:10px">Prøv med eksempeldata</button>
           <p class="foto-note">Du sendes til Strava og godkender selv. Dine data gemmes kun i din browser og vises kun til dig - Runnin har ingen database.</p>`
        : `<button class="cta strava-btn" id="stravaDemo">Prøv med eksempeldata</button>
           <p class="foto-note">Rigtig Strava-kobling er bygget og klar, men site-ejeren mangler at lægge app-nøgler ind (se OVERDRAGELSE.md). Demoen gemmes kun i din browser.</p>`}`;
    const demo = document.getElementById("stravaDemo");
    if (demo) demo.onclick = () => {
      localStorage.setItem("runnin-strava", JSON.stringify(DEMO_ATLET));
      openStrava();
    };
    const ægte = document.getElementById("stravaConnect");
    if (ægte && cfg.configured) ægte.onclick = () => startStravaLogin(cfg.clientId);
  } else {
    const f = stravaForm();
    const ægte = s.kilde === "strava";
    // søjlehøjder skaleret på spændet, så formkurven faktisk kan ses
    const maxKm = Math.max(...s.ugeKm), minKm = Math.min(...s.ugeKm);
    const højde = km => maxKm === minKm ? 100 : Math.round(30 + 70 * (km - minKm) / (maxKm - minKm));
    const graf = s.ugeKm.map((km, i) => `
      <div class="uge-søjle" style="--h:${højde(km)}%">
        <span class="uge-km">${km}</span><i></i><span class="uge-lbl">${["-3", "-2", "-1", "nu"][i]}</span>
      </div>`).join("");
    // måltider på dine kommende gemte løb - kun hvor et estimat er ærligt (kendt distance)
    const medMål = s.pb ? RACES.filter(r => favs.has(r.n) && r.dt && r.dt >= todayISO())
      .sort((a, b) => a.dt.localeCompare(b.dt))
      .map(r => ({ r, tid: stravaMåltid(r, s) }))
      .filter(x => x.tid).slice(0, 4) : [];
    const mål = medMål.map(({ r, tid }) =>
      `<div class="mål-række"><i style="background:${TYPE_COLOR[r.t]}"></i>
        <div><strong>${r.n}</strong><span>${dateLabel(r)} · ${r.d}</span></div>
        <b>~${tid}</b></div>`).join("");
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Din form <span class="strava-tag">Strava · ${ægte ? "live" : "demo"}</span></h2><button class="close" id="featClose">✕</button></div>
      ${ægte ? `<p class="strava-intro" style="margin-top:4px">${s.fornavn ? `Hej ${s.fornavn} - f` : "F"}ormtider beregnet af dine ${s.antalLøb || 0} løb de seneste 90 dage.</p>` : ""}
      ${s.pb ? `<div class="pb-væg">
        ${Object.entries(s.pb).map(([d, t]) => `<div class="pb-kort"><span>${d}</span><strong>${ægte ? "~" : ""}${t}</strong></div>`).join("")}
      </div>` : `<div class="empty" style="margin-top:12px">Ingen løb over 4,5 km de seneste 90 dage - formtiderne kommer, når der ligger længere ture på Strava.</div>`}
      <div class="uge-graf">${graf}</div>
      <div class="form-linje">🏃 <strong>${f.snit} km/uge</strong> i snit de seneste 4 uger</div>
      ${s.pb ? `<div class="form-linje">📈 10K-formen svarer til <strong>~${f.halfEst}</strong> på half og <strong>~${f.maraEst}</strong> på marathon <span class="w-src">(Riegel-estimat)</span></div>` : ""}
      ${medMål.length ? `<div class="foto-kicker" style="margin-top:18px">Måltider på dine løb</div><div class="mål-liste">${mål}</div>` : ""}
      <div class="aar-knapper">
        ${ægte ? `<button class="cta" id="stravaRefresh">Opdatér fra Strava</button>` : ""}
        <button class="save" id="stravaDisconnect">Afbryd Strava</button>
      </div>
      ${ægte ? `<p class="foto-note">Data ligger kun i din browser. Vil du fjerne Runnins adgang helt: Strava → Indstillinger → Mine apps.</p>` : ""}`;
    document.getElementById("stravaDisconnect").onclick = () => {
      localStorage.removeItem("runnin-strava");
      localStorage.removeItem("runnin-strava-auth");
      featOverlay.hidden = true;
    };
    const refresh = document.getElementById("stravaRefresh");
    if (refresh) refresh.onclick = async () => {
      refresh.textContent = "Henter…"; refresh.disabled = true;
      try { await opdaterStravaData(); openStrava(); }
      catch (_) { refresh.textContent = "Kunne ikke hente - prøv igen"; refresh.disabled = false; }
    };
  }
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
}

/* ================= KALENDER-FEED (.ics) ================= */
const icsEscape = s => s.replace(/([,;])/g, "\\$1");
const icsDate = d => d.toISOString().slice(0, 10).replace(/-/g, "");

function byggIcs(liste) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events = liste.map(r => {
    const start = new Date(r.dt);
    const slut = new Date(start.getTime() + 86400000);
    return [
      "BEGIN:VEVENT",
      `UID:${r.n.replace(/\W/g, "-").toLowerCase()}@runnin`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(slut)}`,
      `SUMMARY:${icsEscape("🏃 " + r.n)}`,
      `LOCATION:${icsEscape(r.c + ", " + r.cc)}`,
      `DESCRIPTION:${icsEscape((entries.has(r.n) ? "Du er tilmeldt. " : "") + "Tilmelding: " + r.u + " - fundet på Runnin")}`,
      `URL:${r.u}`,
      "END:VEVENT",
    ].join("\r\n");
  }).join("\r\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Runnin//Mine loeb//DA\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Mine løb - Runnin\r\n${events}\r\nEND:VCALENDAR\r\n`;
}

function openKalenderFeed(valg) {
  valg = valg || "alle";
  const gemte = RACES.filter(r => favs.has(r.n) && r.dt);
  const tilmeldte = gemte.filter(r => entries.has(r.n));
  const liste = valg === "tilmeldte" ? tilmeldte : gemte;
  const udenDato = RACES.filter(r => favs.has(r.n) && !r.dt).length;
  const modal = featOverlay.querySelector(".cal-modal");
  const ics = liste.length ? byggIcs(liste) : null;
  const url = ics ? URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" })) : null;
  modal.innerHTML = `
    <div class="cal-head"><h2 style="margin:0 auto">📅 Kalender-feed</h2><button class="close" id="featClose">✕</button></div>
    <p class="strava-intro">Få dine løb ind i kalenderen som heldagsbegivenheder med tilmeldingslink.</p>
    <div class="tema-valg feed-valg">
      <button class="tema-chip ${valg === "alle" ? "on" : ""}" data-valg="alle">Alle gemte (${gemte.length})</button>
      <button class="tema-chip ${valg === "tilmeldte" ? "on" : ""}" data-valg="tilmeldte">Kun tilmeldte (${tilmeldte.length})</button>
    </div>
    ${liste.length
      ? `<a class="cta" href="${url}" download="runnin-mine-loeb.ics" style="margin-top:14px">Hent kalenderfil (${liste.length} løb) <span>→</span></a>
         <div class="feed-hjælp">
           <div><strong>Apple Kalender</strong>Åbn filen - den lægger sig direkte ind.</div>
           <div><strong>Google Kalender</strong>Indstillinger → Importér og eksportér → vælg filen.</div>
           <div><strong>Outlook</strong>Filer → Åbn og eksportér → Importér iCalendar.</div>
         </div>`
      : `<div class="empty" style="margin-top:14px">${valg === "tilmeldte" ? "Ingen tilmeldte løb med dato endnu - markér et løb som tilmeldt, når du har købt billet." : "Ingen gemte løb med fastlagt dato endnu."}</div>`}
    ${udenDato ? `<p class="foto-note">${udenDato} gemt${udenDato === 1 ? " løb" : "e løb"} har kun måned endnu og er udeladt (ingen gætte-datoer).</p>` : ""}`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
  modal.querySelectorAll(".feed-valg .tema-chip").forEach(c => c.onclick = () => openKalenderFeed(c.dataset.valg));
}
