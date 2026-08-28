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

function openStrava() {
  const s = stravaData();
  const modal = featOverlay.querySelector(".cal-modal");
  if (!s) {
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Forbind med Strava</h2><button class="close" id="featClose">✕</button></div>
      <p class="strava-intro">Din form ind i Runnin: PB-væg på profilen, personlig sæsonplanlægger og automatiske resultater efter løbsdagen. Runnin viser kun dine data til dig.</p>
      <button class="cta strava-btn" id="stravaConnect">Forbind med Strava</button>
      <p class="foto-note">Demo-mode: forbinder med eksempeldata. Rigtig Strava-kobling kræver godkendt app - intet sendes nogen steder hen.</p>`;
    document.getElementById("stravaConnect").onclick = () => {
      localStorage.setItem("runnin-strava", JSON.stringify(DEMO_ATLET));
      openStrava();
    };
  } else {
    const f = stravaForm();
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Din form <span class="strava-tag">Strava · demo</span></h2><button class="close" id="featClose">✕</button></div>
      <div class="pb-væg">
        ${Object.entries(s.pb).map(([d, t]) => `<div class="pb-kort"><span>${d}</span><strong>${t}</strong></div>`).join("")}
      </div>
      <div class="form-linje">🏃 <strong>${f.snit} km/uge</strong> i snit de seneste 4 uger</div>
      <div class="form-linje">📈 10K-formen svarer til <strong>~${f.halfEst}</strong> på half og <strong>~${f.maraEst}</strong> på marathon <span class="w-src">(Riegel-estimat)</span></div>
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

function openKalenderFeed() {
  const gemte = RACES.filter(r => favs.has(r.id));
  const medDato = gemte.filter(r => r.dt);
  const modal = featOverlay.querySelector(".cal-modal");
  const ics = medDato.length ? byggIcs(medDato) : null;
  const url = ics ? URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" })) : null;
  modal.innerHTML = `
    <div class="cal-head"><h2 style="margin:0 auto">📅 Kalender-feed</h2><button class="close" id="featClose">✕</button></div>
    <p class="strava-intro">Få dine gemte løb ind i Google/Apple/Outlook-kalenderen som heldagsbegivenheder med tilmeldingslink.</p>
    ${medDato.length
      ? `<a class="cta" href="${url}" download="runnin-mine-loeb.ics">Hent kalenderfil (${medDato.length} løb) <span>→</span></a>`
      : `<div class="empty">Ingen gemte løb med fastlagt dato endnu.</div>`}
    ${gemte.length > medDato.length ? `<p class="foto-note">${gemte.length - medDato.length} gemt${gemte.length - medDato.length === 1 ? " løb" : "e løb"} har kun måned endnu og er udeladt (ingen gætte-datoer).</p>` : ""}`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
}
