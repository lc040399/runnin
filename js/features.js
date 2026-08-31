/* Runnin gratis-features: alarmer, Mit løbs-år, venner (demo), vejr.
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
// Løb afvikles om formiddagen - så vi viser temperaturen i løbsvinduet (kl. 8-11
// lokal tid, samme måned sidste år) i stedet for det brede nat-til-eftermiddag-spænd.
const weatherCache = new Map();
async function visVejr(r) {
  const el = document.getElementById("dWeather");
  el.textContent = "";
  const key = r.n;
  if (!weatherCache.has(key)) {
    try {
      const mm = r.m.split("-")[1];
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${r.la}&longitude=${r.lo}` +
        `&start_date=2025-${mm}-01&end_date=2025-${mm}-28&hourly=temperature_2m&daily=precipitation_sum&timezone=auto`;
      const d = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json();
      const formiddag = d.hourly.temperature_2m.filter((v, i) => {
        const h = +d.hourly.time[i].slice(11, 13);
        return h >= 8 && h <= 11 && v != null;
      });
      const middel = Math.round(formiddag.reduce((s, v) => s + v, 0) / formiddag.length);
      const dage = d.daily.precipitation_sum.filter(x => x != null);
      const regn = dage.filter(x => x >= 1).length;
      const ikon = regn >= 14 ? "🌧" : regn >= 7 ? "⛅️" : "☀️";
      weatherCache.set(key, `${ikon} Typisk løbevejr i ${MONTHS[+mm - 1]}: ~${middel}° om formiddagen · regn ${regn} af ${dage.length} dage <span class="w-src">(${r.c}, Open-Meteo ${mm}/2025)</span>`);
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


/* ================= MIT LØBS-ÅR (delbart billede) ================= */
// letvægts verdenskort (Natural Earth 110m land) - hentes først når kortet skal tegnes
let landGeo = null;
async function hentLand() {
  if (landGeo) return landGeo;
  try { landGeo = await (await fetch("data/land.json?v=53")).json(); } catch (_) { landGeo = { features: [] }; }
  return landGeo;
}

async function tegnYearCard(gemte) {
  const land = await hentLand();
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  g.fillStyle = "#F5F3EE"; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "#38240D";
  g.font = "800 40px Inter Tight, sans-serif"; g.textAlign = "left";
  g.fillText("R U N N I N", 70, 110);
  g.font = "700 88px Inter Tight, sans-serif";
  g.fillText("Mit løbs-år.", 70, 240);
  g.font = "500 34px Inter Tight, sans-serif"; g.fillStyle = "#7E6A50";
  const lande = new Set(gemte.map(r => r.cc)).size;
  const tilmeldt = gemte.filter(r => entries.has(r.n)).length;
  g.fillText(`${gemte.length} løb · ${lande} ${lande === 1 ? "land" : "lande"}${tilmeldt ? ` · ${tilmeldt} tilmeldt` : ""}`, 70, 300);

  // kortflade zoomet til DINE løb (ikke hele verden) - equirektangulær med margen
  const mx = 70, my = 360, mw = 940, mh = 520;
  g.fillStyle = "#DCE4E4"; // dæmpet hav
  g.beginPath(); g.roundRect(mx, my, mw, mh, 24); g.fill();
  let laMin = Math.min(...gemte.map(r => r.la)), laMax = Math.max(...gemte.map(r => r.la));
  let loMin = Math.min(...gemte.map(r => r.lo)), loMax = Math.max(...gemte.map(r => r.lo));
  const laPad = Math.max((laMax - laMin) * .3, 1), loPad = Math.max((loMax - loMin) * .3, 2);
  laMin -= laPad; laMax += laPad; loMin -= loPad; loMax += loPad;
  // minimum "hele landet": er alle løb i samme kendte land, udvides rammen til landet
  const LANDRAMMER = {
    DK: [54.4, 58.1, 7.5, 15.6], SE: [55.0, 69.2, 10.5, 24.5], NO: [57.7, 71.4, 4.3, 31.3],
    FI: [59.6, 70.2, 20.0, 31.9], IS: [63.2, 66.7, -24.6, -13.3], DE: [47.2, 55.2, 5.8, 15.2],
    GB: [49.9, 58.8, -8.2, 1.8], US: [24.5, 49.5, -125, -66.5], FR: [42.2, 51.2, -5, 8.4],
  };
  const ccSet = new Set(gemte.map(r => r.cc));
  const ramme = ccSet.size === 1 ? LANDRAMMER[[...ccSet][0]] : null;
  if (ramme) {
    laMin = Math.min(laMin, ramme[0]); laMax = Math.max(laMax, ramme[1]);
    loMin = Math.min(loMin, ramme[2]); loMax = Math.max(loMax, ramme[3]);
  }
  // og aldrig tættere på end lande-skala - grov kystdata skal ikke ses i mikroskop
  if (laMax - laMin < 5) { const e = (5 - (laMax - laMin)) / 2; laMin -= e; laMax += e; }
  if (loMax - loMin < 9) { const e = (9 - (loMax - loMin)) / 2; loMin -= e; loMax += e; }
  // hold kortets proportioner: udvid den snævre akse (1° lat ≈ 2° lng ved ~60°N)
  const målAspekt = (mw / mh) * 2;
  const span = (loMax - loMin) / (laMax - laMin);
  if (span < målAspekt) { const e = ((laMax - laMin) * målAspekt - (loMax - loMin)) / 2; loMin -= e; loMax += e; }
  else { const e = ((loMax - loMin) / målAspekt - (laMax - laMin)) / 2; laMin -= e; laMax += e; }
  const px = lo => mx + ((lo - loMin) / (loMax - loMin)) * mw;
  const py = la => my + ((laMax - la) / (laMax - laMin)) * mh;
  g.save();
  g.beginPath(); g.roundRect(mx, my, mw, mh, 24); g.clip();
  // landmasse: hav = kortfladen, land = svagt varmere tone m. blød kyststreg
  g.fillStyle = "#F1EDE3"; g.strokeStyle = "rgba(56,36,13,.16)"; g.lineWidth = 1.5;
  for (const f of land.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      // spring polygoner helt uden for udsnittet over
      g.beginPath();
      let indenfor = false;
      for (const ring of poly) {
        ring.forEach(([lo, la], i) => {
          if (lo >= loMin - 8 && lo <= loMax + 8 && la >= laMin - 8 && la <= laMax + 8) indenfor = true;
          const x = px(lo), y = py(la);
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        });
        g.closePath();
      }
      if (indenfor) { g.fill(); g.stroke(); }
    }
  }
  for (const r of gemte) {
    g.fillStyle = TYPE_COLOR[r.t];
    g.beginPath(); g.arc(px(r.lo), py(r.la), 12, 0, 7); g.fill();
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
  }
  g.restore();

  // løbsliste (kommende først)
  const sorteret = [...gemte].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  g.font = "600 34px Inter Tight, sans-serif"; g.textAlign = "left";
  sorteret.slice(0, 6).forEach((r, i) => {
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
  return c;
}

async function openYearCard() {
  const gemte = RACES.filter(r => favs.has(r.n));
  const modal = featOverlay.querySelector(".cal-modal");
  if (!gemte.length) {
    modal.innerHTML = `
      <div class="cal-head"><h2 style="margin:0 auto">Mit løbs-år</h2><button class="close" id="featClose" aria-label="Luk">✕</button></div>
      <div class="empty" style="margin-top:14px">Dit løbs-år starter med det første gemte løb.<br>Find ét på kortet og tryk på hjertet - så tegner vi kortet her.</div>
      <button class="cta" id="aarTilKort" style="margin-top:14px">Udforsk kortet <span>→</span></button>`;
    featOverlay.hidden = false;
    document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
    document.getElementById("aarTilKort").onclick = () => { featOverlay.hidden = true; setTab("kort"); };
    return;
  }
  const c = await tegnYearCard(gemte);
  const url = c.toDataURL("image/png");
  const kanDele = !!navigator.canShare;
  modal.innerHTML = `
    <div class="cal-head">
      <h2 style="margin:0 auto">Mit løbs-år</h2>
      <button class="close" id="featClose" aria-label="Luk">✕</button>
    </div>
    <img src="${url}" alt="Mit løbs-år" style="width:100%;border-radius:14px;border:1px solid var(--hairline);margin-top:10px">
    <div class="aar-knapper">
      ${kanDele ? `<button class="cta" id="aarDel">Del billedet <span>→</span></button>` : ""}
      <a class="${kanDele ? "save" : "cta"}" href="${url}" download="mit-loebs-aar.png">Download</a>
    </div>`;
  featOverlay.hidden = false;
  document.getElementById("featClose").onclick = () => (featOverlay.hidden = true);
  if (kanDele) document.getElementById("aarDel").onclick = () => c.toBlob(async blob => {
    const fil = new File([blob], "mit-loebs-aar.png", { type: "image/png" });
    try {
      if (navigator.canShare({ files: [fil] })) await navigator.share({ files: [fil], title: "Mit løbs-år" });
      else throw new Error("filer ikke understøttet");
    } catch (e) {
      if (e.name !== "AbortError") { const a = document.createElement("a"); a.href = url; a.download = "mit-loebs-aar.png"; a.click(); }
    }
  });
}
