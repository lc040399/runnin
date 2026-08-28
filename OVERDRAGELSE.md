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

- **Login/konti**: gemmes kun i localStorage; adgangskoden valideres ikke mod noget
- **Alarmer**: gemmes lokalt, men der SENDES ingen beskeder (kræver backend + mail)
- **Fotos**: samme 9 Pexels-billeder for alle løb
- **Venner** og **Strava-form**: eksempeldata
- **Live-løbere**: simulerede (LIVE-status er ægte, felterne er ikke)

## Din drift-tjekliste

1. **Fork/klon** og opret dit eget Cloudflare Pages-projekt (gratis). `./tools/deploy.sh`
2. **Erstat logoet** - `assets/mark.png` er et købt design, der ikke følger med (se LICENSE)
3. **Genkør Sportstiming-høsten** jævnligt (`tools/build-st.mjs` + frisk TSV fra deres offentlige kalender) - respektér robots.txt og crawl skånsomt. Overvej at spørge Sportstiming om lov/samarbejde; de er flinke og dataene er deres
4. **Verificér de kuraterede løbs URLs/priser** (`data/races.js`, `data/races2.js`) - de er efter bedste evne, ikke efterprøvet
5. **OSRM demo-serveren** (router.project-osrm.org) tåler ikke produktionstrafik - selv-host eller cache ruter, hvis du får brugere
6. **Eget domæne** anbefales; ret `BASE` i `tools/build-seo.mjs` og canonicals følger med

## Roadmap, hvis du vil gøre den rigtig

Prioriteret efter effekt:

1. **Backend** (fx Supabase, gratis-tier): rigtige konti, favoritter på tværs af enheder
2. **Alarm-motoren**: cron, der overvåger tilmeldingsåbninger og sender mails - featuren lover det allerede
3. **Data-pipeline på cron** i stedet for manuel høst
4. **Telemetri** (Cloudflare Web Analytics er ét script-tag) - ellers ved du aldrig, om nogen bruger den
5. Rigtig Strava OAuth, rigtige løbsfotos (kræver aftaler), i18n/engelsk
6. **Nordiske datakilder**: Sverige = RaceID (raceid.com), Norge = EQ Timing/kondis.no - undersøg API/lov før høst, samme respekt som Sportstiming

## Arkitektur på 30 sekunder

Statisk site, ingen build: `index.html` + `css/style.css` + `js/*.js` (app, features, photos, live, dashboard, connect) + `data/*.js`. Kortet er MapLibre GL + OpenFreeMap-tiles (gratis, ingen nøgle). Al bruger-state i localStorage. `tools/` har deploy, dev-server, data-generator, SEO-generator og en iOS-wrapper (`ios/` er et rigtigt Xcode-projekt).

God fornøjelse - og godt løb.
