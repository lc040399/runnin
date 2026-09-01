# Overdragelse - til dig, der vil drive Runnin videre

Runnin blev bygget på én dag (28. august 2026) som et passionsprojekt og gives videre gratis.
Her er den ærlige tilstand, så du ved præcis, hvad du overtager.

## Hvad der er ÆGTE

- 494 løb med koordinater, datoer (dag-præcise for de danske) og tilmeldingslinks
- LIVE-status ("løbet afholdes i dag") kommer fra rigtige datoer
- Vejr pr. løb er ægte data (Open-Meteo, samme måned sidste år)
- Live-ruterne ligger på rigtige veje (OSRM) og længde-matches løbets distance
- SEO-sider, sitemap, PWA, dark mode, kalender-feed - alt virker som vist

## Hvad der er DEMO (tydeligt mærket i UI'et)

- **Login/konti**: RIGTIGE (Supabase-auth, egen gratis org) - favoritter/tilmeldinger synkes på tværs af enheder via public.user_races (RLS). Gæster kører stadig rent lokalt. OBS: e-mail-bekræftelse kræver egen SMTP (Resend + domæne); indtil da bør "Confirm email" være slået fra i Supabase-dashboardet. Gratis-projektet holdes vågent af .github/workflows/keepalive.yml
- **Alarmer**: gemmes lokalt, men der SENDES ingen beskeder (kræver backend + mail)
- **Fotos**: samme 9 Pexels-billeder for alle løb
- **Tilmeldt-tal på løb**: ÆGTE (antal Runnin-brugere tilmeldt, via public.antal_tilmeldte-aggregat - aldrig navne). Venne-graf (hvem af DINE venner) findes ikke endnu
- **Strava**: rigtig OAuth-kobling ER bygget (functions/api/strava-token.js + strava.js), men kræver at DU opretter en API-app på strava.com/settings/api og lægger nøglerne ind: `npx wrangler pages secret put STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` (projekt: dit Pages-projekt). Uden nøgler falder UI'et pænt tilbage til demo-mode. OBS: nye Strava-apps må kun hente ejerens egne data, indtil appen er godkendt af Strava (deres review-formular)
- **Live-løbere**: simulerede (LIVE-status er ægte, felterne er ikke)

## Din drift-tjekliste

1. **Fork/klon** og opret dit eget Cloudflare Pages-projekt (gratis). `./tools/deploy.sh`
2. **Erstat logoet** - `assets/mark.png` er et købt design, der ikke følger med (se LICENSE)
3. **Genkør Sportstiming-høsten** jævnligt (`tools/build-st.mjs` + frisk TSV fra deres offentlige kalender, efterfulgt af `tools/fix-coords.mjs` som land-validerer koordinaterne) - respektér robots.txt og crawl skånsomt. Overvej at spørge Sportstiming om lov/samarbejde; de er flinke og dataene er deres
4. **Verificér de kuraterede løbs URLs/priser** (`data/races.js`, `data/races2.js`) - de er efter bedste evne, ikke efterprøvet
5. **OSRM demo-serveren** (router.project-osrm.org) tåler ikke produktionstrafik - selv-host eller cache ruter, hvis du får brugere
6. **Eget domæne** anbefales; ret `BASE` i `tools/build-seo.mjs` og canonicals følger med

## Officielle ruter

`data/ruter/<slug>.json` viser en ÆGTE rute (fuldt optrukket) på detalje- og live-visning;
alle andre løb får en stiplet OSRM-illustration, tydeligt mærket. Tilføj en rute med
`node tools/gpx2rute.mjs <gpx-eller-overpass-fil> "<Løbets navn>" "<kilde>"`.
Kun legitime kilder: arrangørens egen GPX eller OSM-relationer for permanente stier (ODbL).
Seed: Laugavegur Ultra (OSM-relation, ét kort stræk interpoleret over datahul).

## Roadmap, hvis du vil gøre den rigtig

Prioriteret efter effekt:

1. **Backend** (fx Supabase, gratis-tier): rigtige konti, favoritter på tværs af enheder
2. **Alarm-motoren**: cron, der overvåger tilmeldingsåbninger og sender mails - featuren lover det allerede
3. **Data-pipeline på cron** i stedet for manuel høst
4. **Telemetri** (Cloudflare Web Analytics er ét script-tag) - ellers ved du aldrig, om nogen bruger den
5. Rigtige løbsfotos (kræver aftaler), i18n/engelsk - Strava OAuth er allerede bygget, se demo-afsnittet
6. **Nordiske datakilder**: Sverige = RaceID (raceid.com), Norge = EQ Timing/kondis.no - undersøg API/lov før høst, samme respekt som Sportstiming

## Arkitektur på 30 sekunder

Statisk site, ingen build: `index.html` + `css/style.css` + `js/*.js` (app, features, photos, live, dashboard, connect) + `data/*.js`. Kortet er MapLibre GL + OpenFreeMap-tiles (gratis, ingen nøgle). Al bruger-state i localStorage. `tools/` har deploy, dev-server, data-generator, SEO-generator og en iOS-wrapper (`ios/` er et rigtigt Xcode-projekt).

God fornøjelse - og godt løb.
