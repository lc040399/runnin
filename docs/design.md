# Runnin - design & beslutninger (2026-08-28)

## Hvad
Verdenskort over løb (running/tri) med link-ud til officiel tilmeldingsside. Ingen egen checkout, ingen backend.

## Beslutninger (fra brainstorm med Lasse)
- **Formål:** showcase/portfolio - designet er produktet, trafik sekundært
- **Data-scope:** ikoniske verdensløb + Norden i dybden (168 kuraterede løb i `data/races.js`)
- **Design:** A "Editorial travel-tech" - varm hvid #F5F3EE, navy #111827, coral #FF5A5F, Fraunces + Instrument Sans, næsten-monokromt kort hvor løbene er farven
- **Sprog:** dansk UI ("Find dit næste løb. Hele verden. Hele året.")
- **Mine løb:** localStorage-favoritter, ingen login (opgraderbar til auth senere)
- **Hosting:** localhost indtil videre; runnin.dk var ledigt 28/8-2026 (runnin.com/app taget)

## Arkitektur
Statisk site, ingen build-step:
- `index.html` - nav (Kort/Løb/Mine løb), hero + filter-pills, detaljepanel, liste-panel, legend/tæller
- `css/style.css` - design-system i CSS-variabler
- `js/app.js` - MapLibre GL (OpenFreeMap Positron, farve-patchet varm), clustering, hover-card, filtre (region/måned/type), localStorage-favoritter
- `data/races.js` - kurateret database; felter dokumenteret i filens header. Priser er "fra"-estimater; URLs er best-effort officielle sider (ikke alle verificeret)

## Kør
```
cd ~/runnin && python3 -m http.server 4173
# → http://localhost:4173
```

## Kendte begrænsninger / næste skridt
- Dato-granularitet er måned (bevidst - eksakte 2027-datoer er ikke offentliggjort for de fleste løb)
- URLs + priser bør verificeres før offentlig deploy
- Deploy = Cloudflare Pages + runnin.dk, når Lasse vil dele den
