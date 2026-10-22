# NinA Contentmachine

Bewaar interessante artikelen, posts op X, Instagram, LinkedIn, TikTok en YouTube met de Deel-knop op je iPhone. De app zet ze in de juiste map, rankt ze op wat jij belangrijk vindt en maakt van je bronnen een kant-en-klare prompt voor Claude of ChatGPT. Alles staat als Markdown in je Obsidian-vault.

**Volledig gratis.** Geen server en geen abonnement. De app ordent zonder AI. Wil je slimmere samenvattingen, dan kun je optioneel Claude Haiku aanzetten met je eigen sleutel (ongeveer 0,1 cent per item).

```
iPhone Deel-knop ──► Opdracht ──► GitHub API ──► vault-repo/Contentmachine/Inbox/20261022-091500.md
                                                      │
          webapp (GitHub Pages, op je beginscherm) ◄──┘  bij openen: details ophalen,
                                                         map kiezen, tags, samenvatting
                                                      │
                      AI Agents/2026-10-22 Titel.md ◄─┘ ──► Obsidian Git ──► Obsidian op je Mac
                                    ▲                                            │
          sterren, duimen, verplaatsen, notities ◄─────────────────────────────┘
          = signalen voor de zelflerende ranking en het mappenmodel
```

## Wat het kost

| Onderdeel | Prijs |
| --- | --- |
| GitHub-repo voor je vault (privé) | gratis |
| GitHub Pages voor de webapp | gratis |
| Opdrachten-app op iPhone | gratis |
| Obsidian + plugin Obsidian Git | gratis |
| Details en plaatjes ophalen (fxtwitter, noembed, microlink, Jina Reader) | gratis, zonder account |
| Claude Haiku (optioneel, standaard uit) | ongeveer 0,1 cent per item |

## Installeren (ongeveer 10 minuten)

### 1. Een privé repo voor je vault

Maak op GitHub een nieuwe **private** repo, bijvoorbeeld `contentmachine-vault`. Vink **Add a README file** aan, zodat de repo niet leeg is.

### 2. Een token waarmee de app en je iPhone mogen schrijven

GitHub, Settings, Developer settings, **Fine-grained tokens**, Generate new token:

- Repository access: **Only select repositories**, kies `contentmachine-vault`.
- Permissions, Repository permissions: **Contents: Read and write**. Verder niets.
- Kies een vervaldatum, bijvoorbeeld een jaar. Daarna maak je een nieuw token en plak je dat in de app en de Opdracht.

### 3. De webapp online zetten (GitHub Pages)

De app staat in de publieke repo [aiolaf/contentmachine](https://github.com/aiolaf/contentmachine). Hij bestaat alleen uit statische bestanden en bevat geen geheimen. Zet Pages een keer aan:

**Settings, Pages, Build and deployment: Deploy from a branch, `main`, `/ (root)`, Save.**

Na een minuut staat de app op **https://aiolaf.github.io/contentmachine/**.

### 4. Op je iPhone

1. Open het adres in **Safari**, tik op Deel, **Zet op beginscherm**.
2. Open de app vanaf je beginscherm en vul in: GitHub-gebruiker, repo (`contentmachine-vault`), branch (`main`), map (`Contentmachine`) en het token. Tik op **Verbind**.

De app op je beginscherm heeft een eigen opslag, los van Safari. Verbind dus in de app zelf.

### 5. De Deel-knop: een Opdracht

In de app onder **Instellingen** staan dezelfde stappen, met jouw exacte URL. Kort:

1. **Opdrachten**, **+**, naam **Contentmachine**. Via het info-icoon: **Toon in deelmenu** aan, invoer **URL's** en **Tekst**.
2. **Tekst** met inhoud **Opdrachtinvoer**.
3. **Codeer met Base64**, **Regeleinden: Geen**.
4. **Formatteer datum**: huidige datum, notatie `yyyyMMdd-HHmmss`.
5. **Haal inhoud van URL op**:
   - URL: `https://api.github.com/repos/<account>/contentmachine-vault/contents/Contentmachine/Inbox/` + geformatteerde datum + `.md`
   - Methode **PUT**
   - Headers: `Authorization` = `Bearer <token>` en `Accept` = `application/vnd.github+json`
   - Hoofdtekst JSON: `message` = `Gedeeld vanaf iPhone`, `content` = de Base64-tekst, `branch` = `main`
6. **Toon melding**: `Bewaard in Contentmachine`.

Delen gaat zo rechtstreeks naar GitHub, in een seconde, ook als de app dicht is. Open je de app, dan worden nieuwe links geordend.

### 6. Obsidian op je Mac

GitHub is het tussenstation: de app schrijft je items in `contentmachine-vault`, en Obsidian op je Mac houdt daar een kopie van bij via de plugin **Obsidian Git**. Eenmalig instellen:

1. Installeer [Obsidian](https://obsidian.md/download) als je dat nog niet hebt.
2. Open **Terminal**, plak deze regel en druk op Enter:

   ```bash
   bash <(curl -fsSL https://raw.githubusercontent.com/aiolaf/contentmachine/main/obsidian-setup.sh)
   ```

   Het script vraagt je token (hetzelfde als in de app) en bewaart dat in de sleutelhanger van je Mac. Het haalt je vault binnen in `~/Obsidian/Contentmachine` en installeert Obsidian Git zo dat die bij het openen en daarna elke 5 minuten synchroniseert.
3. In Obsidian: **Open folder as vault**, kies `~/Obsidian/Contentmachine` en daarna **Trust author and enable plugins**.

Meteen ophalen in plaats van wachten: Cmd+P en typ "Git: Pull".

**Liever in je bestaande vault (bijvoorbeeld Ninaboard)?** Dat kan als die vault al in een GitHub-repo staat. Vul dan in de app die repo in en zet de map op bijvoorbeeld `30_Resources/Studio/Contentmachine`. Staat je vault in iCloud of Obsidian Sync, gebruik dan de aparte vault hierboven. Een git-repo in een iCloud-map geeft synchronisatieproblemen.

### 7. Op je MacBook

Open hetzelfde adres in Safari en kies Archief, **Voeg toe aan Dock**. Verbind ook daar een keer. Onder Instellingen staat een bladwijzerknop die elke pagina met één klik bewaart.

## Plaatjes en de originele post

- **Feed:** elke kaart krijgt een thumbnail: de foto of video-still van een post op X, de thumbnail van een YouTube-video, of het voorbeeldplaatje dat een nieuwssite of social post zelf opgeeft. Een post zonder media toont de profielfoto van de maker. Zonder plaatje krijg je een gekleurde letter van de bron.
- **Detail:** een grote afbeelding bovenaan. Bij X, YouTube, TikTok, Instagram en LinkedIn tik je op **Bekijk de post** of **Speel video af**: dan laadt de originele post in de app. Pas na die tik maakt de app contact met dat platform.
- **Obsidian:** het plaatje staat als eigenschap `afbeelding` in de notitie en als afbeelding bovenaan de sectie Bron.
- Oudere items krijgen hun plaatje vanzelf, tien per keer dat je de app opent.

Plaatjes worden niet in je repo opgeslagen, alleen de link. Instagram- en TikTok-links verlopen na een tijd; dan toont de app de letter en blijft **Bekijk de post** werken.

## Ordenen zonder AI

Een nieuw item gaat naar een map via twee signalen:

1. **Trefwoordregels** in `_systeem/regels.md`, bijvoorbeeld `Automatisering: n8n, zapier, workflow`. Die werken vanaf dag één. Pas ze aan in de app of in Obsidian.
2. **Een eigen model (naive Bayes)** dat leert van hoe jij sorteert. Elke keer dat je een item naar een map verplaatst, in de app of door het in Obsidian te slepen, leert het daarvan. Na drie of meer items per map weegt het model zwaarder dan de regels.

Twijfelt de app, dan blijft het item in **Inbox** staan tot jij het verplaatst. Zo leert het model weer bij. Tags komen uit de woorden die het meest kenmerkend zijn voor het item, de samenvatting uit de eerste zinnen.

## Bundels: ordenen op hashtags

Binnen een map groepeert de app items op hashtags. Niet elke hashtag krijgt een eigen overzicht:

- Een hashtag wordt pas een **bundel** als hij bij minstens 3 items in die map staat (de `drempel`, aan te passen).
- Hashtags die vaak samen voorkomen, worden één bundel. #claude, #anthropic en #claude-code worden zo samen "Claude".
- Een nieuwe hashtag die vooral samen met een bestaande bundel voorkomt, schuift daar vanzelf bij.
- Heeft een post eigen #hashtags, dan worden dat de tags en verdwijnen ze uit de titel. Zonder hashtags kiest de app de meest kenmerkende woorden.

In een map zie je de bundels als filter, plus **Overig** voor items zonder bundel. Kies een bundel en tik op **Prompt van deze bundel** voor een prompt met de beste items van dat onderwerp. Op de Mac staan de bundels ook in de zijbalk onder de map.

Met **Bewerk bundels** hernoem je een bundel, pas je de hashtags aan, voeg je er een toe of haal je er een weg. Een weggehaalde bundel komt niet terug: de hashtags gaan naar *Genegeerd*. Alles staat in `_systeem/bundels.md`:

```markdown
drempel: 3

## AI Nieuws

- Claude: #claude #anthropic #claude-code
- OpenAI: #openai #gpt

Genegeerd: #nieuws
```

In Obsidian klik je op een #hashtag in dat bestand om alle items met die hashtag te zien.

## Hoe de ranking leert

| Actie | Signaal |
| --- | --- |
| Gebruikt in een bewaard concept | sterk positief |
| Ster, duim omhoog | positief |
| Openen | licht positief |
| Archiveren zonder ster | licht negatief |
| Duim omlaag, verwijderen | negatief |
| Verplaatsen naar een andere map | correctie |

Elk signaal past de gewichten aan van de tags, map, bron, het type en de maker. Daarmee stijgen of zakken vergelijkbare items tot 25 punten. **Trending** laat oudere items langzaam zakken. Onder Instellingen zie je wat de machine heeft geleerd.

## Content maken: de prompt-generator

In de **Studio** kies je bronnen (het rondje op een kaart, of "Beste van deze week") en een vorm: LinkedIn post, carrousel, TikTok script, nieuwsbrief of een vrije opdracht. De app bouwt een complete prompt met:

- je profiel (`_systeem/profiel.md`) en stijlgids (`_systeem/stijl.md`),
- de opdracht per vorm, waaronder de vaste opbouw van je nieuwsbrief,
- per bron de titel, link, samenvatting, **je eigen notities** en een fragment.

Tik op **Kopieer en open Claude** (of ChatGPT) en plak. Wil je het resultaat bewaren? Plak het terug in de app. Het komt dan in `Concepten/` met links naar de bronnen, en de bronnen tellen als gebruikt.

## Optioneel: Claude Haiku

Onder Instellingen, *Inhoud ophalen en AI*, kun je **Claude Haiku** aanzetten met je eigen Anthropic API-sleutel. Bij elk nieuw item maakt Haiku dan een betere titel, samenvatting, kernpunten, tags en een score. Zodra je eigen mappenmodel zeker is, wint het model van Haiku. De sleutel blijft op je apparaat en gaat alleen naar api.anthropic.com. De kosten zijn ongeveer 0,1 cent per item.

## Wat er in je vault komt

```
Contentmachine/
  Inbox/                    binnengekomen vanaf je iPhone, of nog niet zeker
  AI Agents/                mappen uit je regels of die jij aanmaakt
    2026-10-22 Titel.md
  Concepten/                content die je via een prompt liet maken en bewaarde
  _systeem/
    regels.md               trefwoorden per map (pas gerust aan)
    bundels.md              bundels van hashtags per map
    profiel.md              wie je bent, gaat mee in elke prompt
    stijl.md                hoe je schrijft, gaat mee in elke prompt
    index.json, leren.json  beheert de app zelf
```

Je notities onder **Mijn notities** worden nooit overschreven. Verplaats, hernoem of bewerk gerust in Obsidian. Bij een conflict wint de versie die al op GitHub staat.

## Privacy en beperkingen

- Het GitHub-token en een eventuele Anthropic-sleutel staan alleen in de browser van je apparaat en gaan alleen naar api.github.com en api.anthropic.com.
- Voor details van een link vraagt de app gratis publieke diensten: **fxtwitter** voor X, **noembed** voor YouTube en TikTok, **microlink** voor voorbeeldplaatjes (50 per dag) en **Jina Reader** voor de volledige tekst van artikelen. Die diensten zien de link. Microlink en Jina Reader kun je uitzetten.
- Plaatjes laden rechtstreeks van de site of het platform, zonder referrer.
- Instagram en LinkedIn tonen zonder server weinig. Dan gebruikt de app de tekst die je deelmenu meestuurt. Tip: kopieer de caption en deel die mee, of zet je eigen gedachte in Mijn notities.
- Opslaan vanaf de iPhone werkt altijd. Ordenen gebeurt pas als je de app opent.

## Ontwikkelen

Geen build en geen dependencies.

```bash
npm test                    # frontmatter, ordenen, ranking, prompt, vault, sync-conflicten, GitHub-API
python3 -m http.server 8080 # open http://localhost:8080 en kies "Alleen dit apparaat"
```

| Bestand | Rol |
| --- | --- |
| `app.js` | de interface |
| `lib/vault.js` | Markdown-vault, index, wijzigingen bundelen, conflicten |
| `lib/store.js` | GitHub REST API (Git Data API) of lokale opslag |
| `lib/pipeline.js` | van gedeelde link naar geordende notitie |
| `lib/capture.js` | link herkennen, gratis details en plaatjes ophalen |
| `lib/embeds.js` | de originele post of video per platform |
| `lib/classify.js` | regels, naive Bayes, tags, samenvatting |
| `lib/bundles.js` | bundels op hashtags per map |
| `lib/shortcut.js` | de iPhone-opdracht als bestand |
| `lib/learn.js` | zelflerende ranking |
| `lib/prompts.js` | prompt-generator |
| `lib/haiku.js` | optionele Claude Haiku-stap |
| `lib/frontmatter.js` | YAML-eigenschappen lezen en schrijven |
