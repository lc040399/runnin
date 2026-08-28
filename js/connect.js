/* Runnin Connect: Strava (demo-mode) + kalender-feed (.ics).
   Strava-demoen viser eksempeldata, ærligt mærket - rigtig kobling kræver registreret app + token-backend.
   Matematikken er ægte: marathon-estimat via Riegel-formlen på demo-10K'eren. */
"use strict";

/* ================= STRAVA DEMO ================= */
const STRAVA_ORANGE = "#FC4C02";
const stravaData = () => { try { return JSON.parse(localStorage.getItem("runnin-strava")); } catch (_) { return null; } };

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
  return { snit, pb: s.pb, maraEst: sekTilTid(riegel(tidTilSek(s.pb["10K"]), 10, 42.195)), halfEst: sekTilTid(riegel(tidTilSek(s.pb["10K"]), 10, 21.0975)) };
}

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

function openStrava() {
  const s = stravaData();
  const modal = featOverlay.querySelector(".cal-modal");
  if (!s) {
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Forbind med Strava</h2><button class="close" id="featClose">✕</button></div>
      <p class="strava-intro">Din form ind i Runnin - så bliver kalenderen personlig:</p>
      <ul class="strava-punkter">
        <li>🏅 PB-væg med dine bedste tider</li>
        <li>📊 Ugentlige kilometer og formkurve</li>
        <li>🎯 Realistiske måltider på løbene du har gemt</li>
        <li>🗓 Formen tænkes ind i sæsonplanlæggeren</li>
      </ul>
      <button class="cta strava-btn" id="stravaConnect">Forbind med Strava</button>
      <p class="foto-note">Demo-mode: forbinder med eksempeldata, gemt kun i din browser. Rigtig Strava-kobling kræver godkendt app - intet sendes nogen steder hen.</p>`;
    document.getElementById("stravaConnect").onclick = () => {
      localStorage.setItem("runnin-strava", JSON.stringify(DEMO_ATLET));
      openStrava();
    };
  } else {
    const f = stravaForm();
    // søjlehøjder skaleret på spændet, så formkurven faktisk kan ses
    const maxKm = Math.max(...s.ugeKm), minKm = Math.min(...s.ugeKm);
    const højde = km => maxKm === minKm ? 100 : Math.round(30 + 70 * (km - minKm) / (maxKm - minKm));
    const graf = s.ugeKm.map((km, i) => `
      <div class="uge-søjle" style="--h:${højde(km)}%">
        <span class="uge-km">${km}</span><i></i><span class="uge-lbl">${["-3", "-2", "-1", "nu"][i]}</span>
      </div>`).join("");
    // måltider på dine kommende gemte løb - kun hvor et estimat er ærligt (kendt distance)
    const medMål = RACES.filter(r => favs.has(r.id) && r.dt && r.dt >= todayISO())
      .sort((a, b) => a.dt.localeCompare(b.dt))
      .map(r => ({ r, tid: stravaMåltid(r, s) }))
      .filter(x => x.tid).slice(0, 4);
    const mål = medMål.map(({ r, tid }) =>
      `<div class="mål-række"><i style="background:${TYPE_COLOR[r.t]}"></i>
        <div><strong>${r.n}</strong><span>${dateLabel(r)} · ${r.d}</span></div>
        <b>~${tid}</b></div>`).join("");
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Din form <span class="strava-tag">Strava · demo</span></h2><button class="close" id="featClose">✕</button></div>
      <div class="pb-væg">
        ${Object.entries(s.pb).map(([d, t]) => `<div class="pb-kort"><span>${d}</span><strong>${t}</strong></div>`).join("")}
      </div>
      <div class="uge-graf">${graf}</div>
      <div class="form-linje">🏃 <strong>${f.snit} km/uge</strong> i snit de seneste 4 uger</div>
      <div class="form-linje">📈 10K-formen svarer til <strong>~${f.halfEst}</strong> på half og <strong>~${f.maraEst}</strong> på marathon <span class="w-src">(Riegel-estimat)</span></div>
      ${medMål.length ? `<div class="foto-kicker" style="margin-top:18px">Måltider på dine løb</div><div class="mål-liste">${mål}</div>` : ""}
      <button class="save" id="stravaDisconnect" style="margin-top:16px">Afbryd Strava</button>`;
    document.getElementById("stravaDisconnect").onclick = () => { localStorage.removeItem("runnin-strava"); featOverlay.hidden = true; };
  }
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
}

/* hook: kaldes fra openPlanner - personlig form-linje øverst */
function stravaPlannerLine(target) {
  const f = stravaForm();
  if (!f) return "";
  const est = target.t === "half" ? f.halfEst : f.maraEst;
  const dist = target.t === "half" ? "half" : "marathon";
  return `<div class="form-linje planner-form">📈 Din form (Strava-demo): ${f.snit} km/uge · estimeret ${dist}: <strong>~${est}</strong></div>`;
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
  const gemte = RACES.filter(r => favs.has(r.id) && r.dt);
  const tilmeldte = gemte.filter(r => entries.has(r.n));
  const liste = valg === "tilmeldte" ? tilmeldte : gemte;
  const udenDato = RACES.filter(r => favs.has(r.id) && !r.dt).length;
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
