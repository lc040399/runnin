# Runnin 🏃

**Find dit næste løb. Hele verden. Hele året.**

Runnin er hele verdens løb på ét interaktivt kort - 5.900+ løb - fra Marathon Majors og UTMB til hvert eneste danske motionsløb og tusindvis af amerikanske via RunSignups åbne API, med direkte links til den officielle tilmelding. Bygget som statisk site (plus én serverless funktion til ægte live-resultater): hurtig, gratis at drifte, og hele brugerens data bor i deres egen browser.

**Live:** https://runnin.pages.dev

## Features

- 🇺🇸 **Tusindvis af US-løb** - RunSignups åbne API (tools/build-rsu.mjs, GeoNames zip-geokodning)
- 🗺 **Kortet er produktet** - MapLibre GL med klynger, filtre (hvor/hvornår/distance), søgning og deep links pr. løb
- 🇩🇰 **Danmark i dybden** - 239 løb høstet fra Sportstimings offentlige kalender med eksakte datoer
- 🟢 **LIVE** - løb, der afholdes i dag, pulserer på kortet; følg dem med simuleret felt i naturligt tempo på rigtige veje (OSRM)
- 📷 **Fotos** - find dine billeder med startnummer, lagt ud langs ruten (demo-galleri)
- 🎟 **Tilmeldt-flow** - markér løb som tilmeldt, nedtælling, kalender-feed (.ics)
- 🔔 **Alarmer, sæsonplanlægger, Mit løbs-år** (delbart billede), Strava-form (demo), vejr pr. løb (ægte data fra Open-Meteo)
- 🌙 **Dark mode**, PWA med service worker, iOS-wrapper-app, statiske SEO-sider for de kuraterede løb + sitemap

## Kør lokalt

```bash
python3 tools/serve.py 4173   # no-cache dev-server
# → http://localhost:4173
```

Ingen build-step, ingen dependencies. Ren HTML/CSS/JS.

## Deploy

```bash
./tools/deploy.sh   # bygger dist/ (inkl. SEO-sider) og deployer til Cloudflare Pages
```

Kræver `wrangler` logget ind på din egen Cloudflare-konto og et Pages-projekt (gratis-tier rækker fint).

## Data

- `data/races.js` + `data/races2.js` - kuraterede verdensløb (priser er "fra"-estimater, URLs efter bedste evne - verificér før du stoler blindt på dem)
- `data/races-st.js` - autogenereret fra Sportstimings offentlige eventkalender via `tools/build-st.mjs` (DAWA-geokodning). **Respektér deres robots.txt** (API og tilmeldings-flow må ikke crawles) og genkør høsten skånsomt
- Datoerne rådner: genkør høsten jævnligt, ellers viser "Kommende løb" fortiden

## Se OVERDRAGELSE.md

Hvis du overtager driften: [OVERDRAGELSE.md](OVERDRAGELSE.md) har hele listen - hvad der er ægte, hvad der er demo, hvad der mangler, og hvilke licenser du skal respektere.

## Licens

MIT for al kode og struktur - **med undtagelser**: R-logoet (`assets/mark.png`, `assets/apple-touch.png`) er et købt design og følger IKKE med licensen; erstat det med dit eget mærke. Kortdata © OpenStreetMap-bidragydere/OpenMapTiles (attributionen i appen SKAL blive). Se [LICENSE](LICENSE).
