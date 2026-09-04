# Runnin - arkitektur & review-guide

Kontekst-doc til kode-review. `README.md` er marketing/overblik; `OVERDRAGELSE.md`
er drift; **denne fil er kortet over koden og hvor de reelle risici ligger.**

Runnin er et gratis verdenskort over løb (~6.400 kommende) med link-ud til den
officielle tilmelding. Ingen egen checkout, ingen betaling. Tre dele deler ét
datalag.

---

## 1. Systemoverblik

```
data/*.js (9 kilder) ──build-json.mjs──> data/races.json + races.geojson
                                              │
                    ┌─────────────────────────┼───────────────────────┐
                    ▼                          ▼                       ▼
             Statisk web                 Native iOS-app           Supabase
          (runnin.org, CF Pages)     (SwiftUI + MapLibre)      (auth + data)
```

- **Web**: ren HTML/CSS/JS, ingen build-step for selve appen. MapLibre GL + OpenFreeMap-tiles. Deployes til Cloudflare Pages (`tools/deploy.sh`).
- **Native iOS**: rigtig SwiftUI-app (IKKE webwrapper) i `ios/Runnin/`. Genereres med xcodegen fra `ios/project.yml`.
- **Backend**: Supabase (egen gratis org) - kun GoTrue-auth + PostgREST. Ingen server-kode ejet af os udover Cloudflare Pages Functions (`functions/api/`, live-resultater + Strava-proxy).

Web og native **deler samme `data/races.json`** så de aldrig drifter fra hinanden.

---

## 2. Datalag (`data/` + `tools/`)

Kilder (hver sin `data/races-*.js` + `tools/build-*.mjs`):

| Kilde | Land | Bygger | Note |
|-------|------|--------|------|
| RunSignup åbne API | US (~5.200) | `build-rsu.mjs` | GeoNames zip-geokodning; **kræver /tmp/US.txt → refreshes MANUELT (ikke i CI)** |
| Sportstiming-kalender | DK (~238) | `build-st.mjs` | DAWA-geokodning. Se koordinat-fælde nedenfor |
| Kondis | NO (~420) | `build-kondis.mjs` | Kartverket-geokodning (by-center) |
| RaceID | SE (~120) | `build-rid.mjs` | |
| AIMS + kuraterede + Nordics | globalt | `build-aims/wm.mjs`, `races.js` | |

`tools/build-json.mjs` merger alle 9 til `races.json` (id tildeles her) + `races.geojson`.
`tools/build-meta.mjs` stempler "opdateret <dato>".

**Friskhed:** `.github/workflows/refresh.yml` (ugentlig) genkører kilder med krympe-vagt
(<50% = afbryd) → build-meta → commit → wrangler-deploy. **US er udeladt af cron** (geokodning
kræver /tmp/US.txt) - det er den vigtigste friskheds-gæld.

### Data-integritetsregler (vigtige at kende ved review)
- **Koordinat-fælde**: DAWA/postnr `visueltcenter` for kyst-postdistrikter lander i havet.
  Fix: geokod til median af rigtige adresser (`postnr → adgangsadresser`). DK auditeret = 0 i vand.
  NO/SE auditeret via bigdatacloud reverse (tom `countryCode` = hav) = 0 i vand. **Ikke-nordiske IKKE auditeret.**
- **`Race.erKommende`** (native) / `erKommende` (web): skjuler afholdte løb. `dt`/`m` i fortiden → skjul; udateret → vis.
- **Stablede koordinater**: 444 løb (norske serier) ligger på præcis samme by-center-koordinat.
  Rendering grupperer dem til én prik m. tal-badge; tap → liste. Rod-årsag (manglende venue-koordinat) er data, ikke kode.

---

## 3. Native iOS (`ios/Runnin/`)

SwiftUI, ingen tredjeparts-SDK'er udover MapLibre (SPM). Filer:

| Fil | Ansvar |
|-----|--------|
| `RunninApp.swift` / `ContentView.swift` | app-shell, faner, header, søge-resultatliste, stak-sheet, konto-sletning |
| `MapView.swift` | MapLibre-kort, **Swift-side grid-klyngning**, warmify-toning, tap-håndtering |
| `RaceStore.swift` | delt løbsliste + filtre; `all`/`dataVersion` @Published |
| `RemoteData.swift` | **"OTA for data"**: cache→bundle load + baggrunds-refresh fra runnin.org |
| `Auth.swift` | GoTrue REST (login/opret/slet); token i UserDefaults |
| `Saved.swift` | Mine løb: lokal + synk til `user_races` |
| `Lang.swift` | i18n: `Lang.shared` + global `T(da,en)`; standard fra `Locale`, manuel skifter |
| `Race.swift` | model + afledte labels (localiseret), `erKommende`, `distLabel` |
| `LeaderboardsView / ListeView / FilterSheet / SearchBar / KompaktListe / BottomNav / CountingNumber` | UI |

**Hvorfor Swift-side klyngning:** MapLibre-distributionens indbyggede klyngning renderede
ikke i denne build. Grid pr. zoom; klynge placeres ved nærmeste løb til centroid (så den
ikke lander i havet). **Kritisk lærdom:** et `MLNSymbolStyleLayer` UDEN gyldig glyf-font
(`textFontNames = ["Noto Sans Regular"]`) fejler TAVST og bryder hele map-renderingen.

**Remote-data ("OTA"):** kun DATA opdateres uden App Review (løb, koordinater, leaderboards).
Kode-ændringer kræver nyt build (Apple forbyder download af kode). `RemoteData.refresh`
har krympe-vagt (`minBytes` + `count>500`) og falder aldrig tilbage til tomt.

---

## 4. Backend (Supabase, projekt `qdqvyvidafslzvxgkvof`)

- **Auth**: GoTrue, e-mail+password. Ingen SDK - ren REST fra klienten.
- **Tabeller** (`public`, RLS slået til):
  - `user_races` - brugerens gemte løb. 4 policies, alle `auth.uid() = user_id`. Fuld per-bruger-isolation.
  - `reg_klik` - anonym tilmeldings-klik-tælling. **Kun INSERT for anon** (ingen SELECT-policy → kan ikke læses fra klient). Intet bruger-/enheds-id gemmes.
- **RPC'er** (SECURITY DEFINER): `delete_own_account` (sletter kun kalderens konto, Apple 5.1.1v + GDPR), `runnin_pulse` (aggregat til Telegram-puls, ingen PII).
- **Puls**: `.github/workflows/pulse.yml` dagligt → `tools/daily-pulse.mjs` (downloads + klik + nye brugere til Telegram). Rammer DB dagligt → fungerer også som **keepalive** mod gratis-tier-pause.

### Sikkerhedsmodel (læs dette først ved review)
Den **publishable/anon-nøgle er offentlig med vilje** (ligger i klient-koden på web + native).
Det er by design - **RLS er den eneste beskyttelse**. Der er INGEN service_role-nøgle i klienten
eller repoet. Så review-fokus: er RLS-policies vandtætte? (De er auditeret som korrekte, men det
er dét sted en fejl ville gøre mest skade.)

---

## 5. Kendte begrænsninger / hvor en reviewer bør kigge

1. **`reg_klik` har ingen rate-limit** (`WITH CHECK true`) - anonym klik-tæller kan spammes/inflateres. Bevidst afvejning; ikke et data-læk, men en integritets-risiko.
2. **US-data refreshes manuelt** (77% af løbene) - rådner over tid uden manuel genkørsel.
3. **Ikke-nordiske hav-placeringer ikke auditeret** - kun DK/NO/SE er verificeret land.
4. **Ingen crash-/fejl-telemetri på native** - vi er blinde for crashes på rigtige enheder.
5. **Stablede by-center-koordinater** - rendering håndterer det, men data mangler venue-præcision.
6. **Ingen automatiske tests** på native (manuelt verificeret via simulator-screenshots).
7. **Web-lag** (`js/*.js`) har egen ældre i18n (regex på tekstnoder) - separat fra native `Lang`.

## 6. Byg / deploy / verificér

```bash
# web
python3 tools/serve.py 4173          # dev
./tools/deploy.sh                    # → Cloudflare Pages

# data
node tools/build-json.mjs            # regenerér races.json + geojson

# native (kræver Apple-udviklerkonto + signering)
cd ios && xcodegen generate
xcodebuild -project Runnin.xcodeproj -scheme Runnin -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/sim build
# UI-verifikation: launch med -runnin-sprog en|da og SIMCTL_CHILD_SCREEN / SIMCTL_CHILD_SEARCH (kun DEBUG)
```
