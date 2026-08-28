/* Runnin gratis-features: alarmer, sæsonplanlægger, Mit løbs-år, venner (demo), vejr.
   Vejr = ÆGTE data (Open-Meteo arkiv, samme måned sidste år). Venner = demo, mærket. */
"use strict";

/* ================= ALARMER ================= */
const alarms = new Set(JSON.parse(localStorage.getItem("runnin-alarms") || "[]"));
const saveAlarms = () => localStorage.setItem("runnin-alarms", JSON.stringify([...alarms]));

function updateAlarmBtn(r) {
  const btn = document.getElementById("dAlarm");
  const on = alarms.has(r.n);
  btn.querySelector("span").textContent = on ? "Alarm til" : "Alarm";
  btn.classList.toggle("on", on);
}
document.getElementById("dAlarm").addEventListener("click", () => {
  if (!currentRace) return;
  alarms.has(currentRace.n) ? alarms.delete(currentRace.n) : alarms.add(currentRace.n);
  saveAlarms();
  updateAlarmBtn(currentRace);
});

/* ================= VEJR (Open-Meteo, ægte data) ================= */
const weatherCache = new Map();
async function visVejr(r) {
  const el = document.getElementById("dWeather");
  el.textContent = "";
  const key = r.n;
  if (!weatherCache.has(key)) {
    try {
      const mm = r.m.split("-")[1];
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${r.la}&longitude=${r.lo}` +
        `&start_date=2025-${mm}-01&end_date=2025-${mm}-28&daily=temperature_2m_max,temperature_2m_min&timezone=UTC`;
      const d = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
      const avg = a => Math.round(a.reduce((s, v) => s + v, 0) / a.length);
      weatherCache.set(key, `☀️ Typisk vejr i ${MONTHS[+mm - 1]}: ${avg(d.daily.temperature_2m_min)}-${avg(d.daily.temperature_2m_max)}° <span class="w-src">(${r.c} ${mm}/2025, Open-Meteo)</span>`);
    } catch (_) { weatherCache.set(key, null); }
  }
  if (currentRace === r && weatherCache.get(key)) el.innerHTML = weatherCache.get(key);
}

/* ================= VENNER (demo) ================= */
const VENNER = ["Jonas K.", "Sofie H.", "Mikkel T.", "Camilla J.", "Frederik L.", "Ida S."];
function visVenner(r) {
  const el = document.getElementById("dFriends");
  const h = [...r.n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
  if (h % 10 < 4) {
    const antal = 1 + (h % 3);
    const navne = Array.from({ length: antal }, (_, i) => VENNER[(h >>> (i * 4)) % VENNER.length]);
    el.innerHTML = `👟 ${[...new Set(navne)].join(" og ")} er tilmeldt <span class="w-src">(demo)</span>`;
  } else el.textContent = "";
}

/* hook: kaldes fra openDetail */
function featuresOnDetail(r) {
  updateAlarmBtn(r);
  document.getElementById("dPlan").hidden = !(r.t === "marathon" || r.t === "half" || r.t === "ultra");
  visVenner(r);
  visVejr(r);
}

/* ================= LISTE-MODAL (alarmer m.m.) ================= */
const featOverlay = document.getElementById("featOverlay");
function listModal(titel, rows, tomTekst) {
  featOverlay.querySelector(".cal-modal").innerHTML = `
    <div class="cal-head">
      <h2 style="margin:0 auto">${titel}</h2>
      <button class="close" id="featClose" aria-label="Luk">✕</button>
    </div>
    <div class="feat-list">${rows || `<div class="empty">${tomTekst}</div>`}</div>`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
}
featOverlay.addEventListener("click", e => { if (e.target === featOverlay) featOverlay.hidden = true; });

function visAlarmer() {
  const rows = [...alarms].map(n => `
    <div class="feat-row" data-n="${n.replace(/"/g, "&quot;")}">
      <span>🔔</span><div>${n}</div><button class="feat-x">Fjern</button>
    </div>`).join("");
  listModal("Alarmer", rows, "Ingen alarmer endnu.<br><em>Sæt en fra et løbs detaljer.</em>");
  featOverlay.querySelectorAll(".feat-row").forEach(row => {
    row.querySelector(".feat-x").onclick = () => { alarms.delete(row.dataset.n); saveAlarms(); visAlarmer(); };
    row.querySelector("div").onclick = () => {
      const r = RACES.find(x => x.n === row.dataset.n);
      if (r) { featOverlay.hidden = true; openDetail(r, true); }
    };
  });
}


/* ================= SÆSONPLANLÆGGER ================= */
function midDate(r) { return new Date(r.dt || r.m + "-15"); }

function openPlanner(target) {
  const targetDate = midDate(target);
  const nu = new Date();
  const sammeEgn = r => r.cc === target.cc || (NORDICS.includes(r.cc) && NORDICS.includes(target.cc));
  const kandidater = RACES.filter(r =>
    r !== target && sammeEgn(r) && midDate(r) > nu && midDate(r) < new Date(targetDate - 12 * 86400000)
  );
  const ugerFør = r => Math.round((targetDate - midDate(r)) / (7 * 86400000));
  const find = (typer, minU, maxU) =>
    kandidater.filter(r => typer.includes(r.t) && ugerFør(r) >= minU && ugerFør(r) <= maxU)
      .sort((a, b) => Math.abs(ugerFør(a) - (minU + maxU) / 2) - Math.abs(ugerFør(b) - (minU + maxU) / 2))[0];

  const slots = target.t === "half"
    ? [["Formtest", ["kort"], 8, 14], ["Generalprøve", ["kort"], 3, 6]]
    : [["Grundform", ["kort"], 10, 16], ["Formtest", ["half"], 5, 9], ["Generalprøve", ["kort", "half"], 2, 4]];

  const rows = slots.map(([navn, typer, a, b]) => {
    const r = find(typer, a, b);
    return `<div class="plan-slot">
      <div class="plan-når">${navn}<span>${a}-${b} uger før</span></div>
      ${r ? `<div class="feat-row" data-n="${r.n.replace(/"/g, "&quot;")}">
          <span class="dot" style="background:${TYPE_COLOR[r.t]}"></span>
          <div><strong>${r.n}</strong><br><small>${dateLabel(r)} · ${r.c}</small></div>
          <button class="feat-x plan-gem">♡ Gem</button>
        </div>`
      : `<div class="plan-tom">Intet oplagt løb i vinduet - tjek kortet selv</div>`}
    </div>`;
  }).join("");

  featOverlay.querySelector(".cal-modal").innerHTML = `
    <div class="cal-head">
      <h2 style="margin:0 auto">Sæsonen mod ${target.n}</h2>
      <button class="close" id="featClose" aria-label="Luk">✕</button>
    </div>
    <p class="foto-note" style="margin-top:4px">Opbygningsløb i samme egn, timet baglæns fra ${dateLabel(target)}.</p>
    ${typeof stravaPlannerLine === "function" ? stravaPlannerLine(target) : ""}
    <div class="feat-list">${rows}</div>`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
  featOverlay.querySelectorAll(".plan-gem").forEach(btn => btn.onclick = () => {
    const r = RACES.find(x => x.n === btn.closest(".feat-row").dataset.n);
    if (r) { favs.add(r.id); localStorage.setItem("runnin-favs", JSON.stringify([...favs])); updateFavCount(); btn.textContent = "✓ Gemt"; }
  });
  featOverlay.querySelectorAll(".feat-row > div").forEach(d => d.onclick = () => {
    const r = RACES.find(x => x.n === d.closest(".feat-row").dataset.n);
    if (r) { featOverlay.hidden = true; openDetail(r, true); }
  });
}
document.getElementById("dPlan").addEventListener("click", () => currentRace && openPlanner(currentRace));

/* ================= MIT LØBS-ÅR (delbart billede) ================= */
function openYearCard() {
  const gemte = RACES.filter(r => favs.has(r.id));
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  // baggrund
  g.fillStyle = "#F5F3EE"; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "#38240D";
  g.font = "800 40px Inter Tight, sans-serif"; g.textAlign = "left";
  g.fillText("R U N N I N", 70, 110);
  g.font = "700 88px Inter Tight, sans-serif";
  g.fillText("Mit løbs-år.", 70, 240);
  g.font = "500 34px Inter Tight, sans-serif"; g.fillStyle = "#7E6A50";
  const lande = new Set(gemte.map(r => r.cc)).size;
  g.fillText(`${gemte.length} løb · ${lande} ${lande === 1 ? "land" : "lande"} · ${new Date().getFullYear()}`, 70, 300);
  // verdenskort-flade (equirektangulær projektion)
  const mx = 70, my = 360, mw = 940, mh = 520;
  g.fillStyle = "#ECE8DF";
  g.beginPath(); g.roundRect(mx, my, mw, mh, 24); g.fill();
  const px = lo => mx + ((lo + 180) / 360) * mw;
  const py = la => my + ((90 - la) / 180) * mh * 1.35 - mh * .12; // let nord-vægtet
  g.fillStyle = "rgba(56,36,13,.12)";
  for (const r of RACES) { g.beginPath(); g.arc(px(r.lo), Math.min(my + mh - 8, Math.max(my + 8, py(r.la))), 3.5, 0, 7); g.fill(); }
  for (const r of gemte) {
    g.fillStyle = TYPE_COLOR[r.t];
    g.beginPath(); g.arc(px(r.lo), Math.min(my + mh - 10, Math.max(my + 10, py(r.la))), 11, 0, 7); g.fill();
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
  }
  // løbsliste
  g.font = "600 34px Inter Tight, sans-serif"; g.textAlign = "left";
  gemte.slice(0, 6).forEach((r, i) => {
    const y = 960 + i * 58;
    g.fillStyle = TYPE_COLOR[r.t];
    g.beginPath(); g.arc(86, y - 11, 9, 0, 7); g.fill();
    g.fillStyle = "#38240D";
    g.fillText(r.n.slice(0, 38) + (entries.has(r.n) ? "  🎟" : ""), 115, y);
    g.fillStyle = "#AE9C80"; g.font = "500 28px Inter Tight, sans-serif";
    g.textAlign = "right"; g.fillText(dateLabel(r), 1010, y);
    g.textAlign = "left"; g.font = "600 34px Inter Tight, sans-serif";
  });
  if (gemte.length > 6) { g.fillStyle = "#AE9C80"; g.font = "500 30px Inter Tight, sans-serif"; g.fillText(`+ ${gemte.length - 6} flere`, 115, 960 + 6 * 58); }
  g.fillStyle = "#C05800"; g.font = "700 30px Inter Tight, sans-serif";
  g.fillText("Find dit næste løb på Runnin", 70, 1290);

  const url = c.toDataURL("image/png");
  featOverlay.querySelector(".cal-modal").innerHTML = `
    <div class="cal-head">
      <h2 style="margin:0 auto">Mit løbs-år</h2>
      <button class="close" id="featClose" aria-label="Luk">✕</button>
    </div>
    <img src="${url}" alt="Mit løbs-år" style="width:100%;border-radius:14px;border:1px solid var(--hairline);margin-top:10px">
    <a class="cta" style="margin-top:14px" href="${url}" download="mit-loebs-aar.png">Download billedet <span>→</span></a>`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
}
