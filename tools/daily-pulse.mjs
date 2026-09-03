/* Daglig Runnin-puls til Telegram: downloads (App Store Connect) + anonyme
   tilmeldings-klik + nye brugere (Supabase). Køres af .github/workflows/pulse.yml. */
import { createSign, sign as cryptoSign } from "node:crypto";
import { gunzipSync } from "node:zlib";

const SB = "https://qdqvyvidafslzvxgkvof.supabase.co";
const SB_ANON = "sb_publishable_UfiDozoliZR44TAJ9SX-ng_1f3q_Mk3";
const {
  TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID: TG_CHAT,
  ASC_KEY_ID, ASC_ISSUER, ASC_VENDOR, ASC_KEY_P8,
} = process.env;

// dansk gårsdag (rapporter er en dag forsinket)
const igår = new Date(Date.now() - 24 * 3600 * 1000);
const dag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(igår);

function b64u(buf) { return Buffer.from(buf).toString("base64url"); }

// ---- Supabase: nye brugere + klik ----
async function hentPuls() {
  const r = await fetch(`${SB}/rest/v1/rpc/runnin_pulse`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ dag }),
  });
  return r.ok ? r.json() : null;
}

// ---- App Store Connect: downloads (valgfrit - kun hvis nøgler er sat) ----
function ascJwt() {
  const header = b64u(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({ iss: ASC_ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const signingInput = `${header}.${payload}`;
  const sig = cryptoSign("sha256", Buffer.from(signingInput), { key: ASC_KEY_P8, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${b64u(sig)}`;
}

async function hentDownloads() {
  if (!ASC_KEY_ID || !ASC_ISSUER || !ASC_VENDOR || !ASC_KEY_P8) return null;
  try {
    const url = `https://api.appstoreconnect.apple.com/v1/salesReports?` +
      `filter[frequency]=DAILY&filter[reportType]=SALES&filter[reportSubType]=SUMMARY&` +
      `filter[vendorNumber]=${ASC_VENDOR}&filter[reportDate]=${dag}&filter[version]=1_1`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ascJwt()}`, Accept: "application/a-gzip" } });
    if (!r.ok) return null; // 404 = ingen salg den dag
    const tsv = gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8");
    const linjer = tsv.trim().split("\n");
    const kol = linjer[0].split("\t");
    const iUnits = kol.indexOf("Units");
    const iType = kol.indexOf("Product Type Identifier");
    let downloads = 0;
    // førstegangs-downloads: type-koder der starter med "1" eller "F"
    for (const l of linjer.slice(1)) {
      const c = l.split("\t");
      const t = (c[iType] || "").trim();
      if (/^(1|F)/.test(t)) downloads += parseInt(c[iUnits] || "0", 10) || 0;
    }
    return downloads;
  } catch (_) { return null; }
}

// ---- Telegram ----
async function send(tekst) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text: tekst, disable_web_page_preview: true }),
  });
}

// ---- kør ----
const puls = await hentPuls();
const downloads = await hentDownloads();
const d = downloads == null ? "–" : downloads;
const dato = new Date(dag + "T00:00:00").toLocaleDateString("da-DK", { day: "numeric", month: "long" });

const linjer = [
  `🏃 Runnin · ${dato}`,
  ``,
  `📥 ${d} downloads`,
  `🔗 ${puls?.klik ?? "–"} tilmeldings-klik`,
  `👤 ${puls?.nye_brugere ?? "–"} nye brugere`,
  ``,
  `I alt: ${puls?.brugere_total ?? "–"} brugere · ${puls?.klik_total ?? "–"} klik`,
];
if (downloads == null && (!ASC_KEY_ID || !ASC_VENDOR))
  linjer.push(``, `(downloads afventer App Store-nøgle + vendor-nr.)`);

await send(linjer.join("\n"));
console.log("puls sendt:", dag, "| klik:", puls?.klik, "| nye:", puls?.nye_brugere, "| downloads:", d);
