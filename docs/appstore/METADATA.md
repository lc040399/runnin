# App Store-indsendelse - Runnin

Alt du skal bruge for at udfylde App Store Connect. Copy-paste felterne nedenfor.

---

## App-info

| Felt | Værdi |
|---|---|
| **Navn** (max 30) | `Runnin: Find dit næste løb` |
| **Undertitel** (max 30) | `Hele verdens løb på ét kort` |
| **Bundle ID** | `dk.runnin.app` |
| **Version** | `1.0` |
| **Build** | `1` |
| **Primær kategori** | Sport |
| **Sekundær kategori** | Sundhed & fitness |
| **Aldersgrænse** | 4+ |
| **Copyright** | `2026 Runnin` |
| **Support-URL** | `https://runnin.org` |
| **Marketing-URL** | `https://runnin.org` |
| **Privatlivspolitik-URL** | `https://runnin.org/privatliv` |
| **Primærsprog** | Dansk |

---

## Kampagnetekst (Promotional text, max 170)

```
Find dit næste løb blandt tusindvis over hele verden - marathon, halvmarathon, trail og triatlon. Norden i dybden, live på løbsdagen. Altid gratis.
```

## Beskrivelse (Description, max 4000)

```
Runnin er hele verdens løb på ét kort.

Find dit næste marathon, halvmarathon, trailløb eller triatlon - zoom ind fra verdenskortet til din egen by, og se datoer, distancer, priser og et direkte link til den officielle tilmelding. Ingen mellemled, ingen gebyrer fra os.

• KORT OVER VERDEN
Tusindvis af løb, klynget pænt sammen så du hurtigt får overblik. Zoom ind og de enkelte løb dukker op, farvet efter distance.

• NORDEN I DYBDEN
Danmark, Norge, Sverige, Finland og resten af Norden er dækket tæt - fra det lokale byløb til de store klassikere.

• SØG OG FILTRÉR
Søg efter løb eller by, og filtrér på hvor, hvornår og hvilken distance. På både kort og liste.

• GEM DINE LØB
Gem de løb du vil løbe, og find dem samlet under Mine løb. Log ind, og de følger dig på tværs af dine enheder.

• LEADERBOARDS
Se de hurtigste tider - nordisk og verden over, på tværs af distancer. Ægte resultater fra løbene.

• LIVE PÅ LØBSDAGEN
Se hvilke løb der afholdes i dag, med officiel rute og resultater hvor de findes.

Runnin er gratis og bygget af løbere, for løbere. Tilmeldingen sker altid på arrangørens egen side - vi samler bare verden på ét kort, så du kan finde dit næste.
```

## Nøgleord (Keywords, max 100 tegn, komma-separeret)

```
løb,marathon,halvmarathon,triatlon,trail,motion,running,løbekalender,race,tilmelding,løbskort
```

---

## App-privatliv (App Privacy - udfyld i App Store Connect)

**Indsamler appen data?** Ja.

**Kontaktoplysninger → E-mailadresse**
- Indsamles: Ja
- Knyttet til brugerens identitet: Ja
- Brugt til sporing: Nej
- Formål: **App-funktionalitet** (konto/login)

**Brugerindhold → Andet brugerindhold** (gemte løb)
- Indsamles: Ja
- Knyttet til identitet: Ja
- Brugt til sporing: Nej
- Formål: **App-funktionalitet**

**Sporing:** Nej - appen sporer dig ikke og bruger ingen tredjeparts-annonce/analyse-SDK'er.
**Data brugt til at spore dig:** Ingen.

> Bemærk: profilbilledet gemmes kun lokalt på enheden (ikke i skyen). Konto + gemte løb ligger hos Supabase (EU).

---

## Eksport-compliance

`ITSAppUsesNonExemptEncryption = NO` er lagt ind i Info.plist (kun standard HTTPS),
så du slipper for eksport-compliance-spørgsmålet ved hver upload.

---

## Screenshots

Ligger i `docs/appstore/screenshots/` - **1320×2868 (6.9", iPhone 17 Pro Max)**, som er den påkrævede iPhone-størrelse:

1. `01-kort.png` - verdenskortet med klynger
2. `02-leaderboards.png` - leaderboards (nordisk)
3. `03-liste.png` - listevisning
4. `04-detalje.png` - løbs-detalje med Gem + tilmelding
5. `05-login.png` - login/opret-skærm

Upload mindst 3. App Store Connect skalerer dem selv til mindre iPhones.
(Vil du have marketing-tekst på screenshots, kan jeg lave det - men rå screenshots er også fint.)

---

## Trin til upload (dine, kræver Apple-login)

1. **App Store Connect** → My Apps → **+** → New App (Platform iOS, Bundle ID `dk.runnin.app`, sprog Dansk).
2. Udfyld felterne ovenfor + upload screenshots.
3. I **Xcode**: vælg dit Team under Signing, sæt scheme til "Any iOS Device", **Product → Archive**.
4. I Organizer: **Distribute App → App Store Connect → Upload**.
5. Tilbage i App Store Connect: vælg build'et, udfyld App Privacy, **Submit for Review**.

Sig til når du er ved trin 3 - så hjælper jeg med signering/arkivering.
