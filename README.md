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

   Het script vraagt je token: tik in de app op **Kopieer token** (Instellingen, Obsidian op je Mac) en druk in Terminal op Enter. Het script controleert het token bij GitHub, wist daarna je klembord en bewaart het token in de sleutelhanger van je Mac, los van andere GitHub-logins. Het haalt je vault binnen in `~/Obsidian/Contentmachine` en installeert Obsidian Git zo dat die bij het openen en daarna elke 5 minuten synchroniseert.
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

Een nieuw item gaat naar een map via drie signalen:

1. **Trefwoordregels** in `_systeem/regels.md`, bijvoorbeeld `Automatisering: n8n, zapier, workflow`. Die werken vanaf dag één. Pas ze aan in de app of in Obsidian. Een woord dat met `@` begint is een maker: `Content Inspiratie: @kallaway` pakt alles van die maker. Een regel voor een map die nog niet bestaat, maakt die map aan.
2. **Een eigen model (naive Bayes)** van de woorden per map. Het leert alleen van plaatsingen die zeker zijn: wat jij zelf verplaatste (in de app of door te slepen in Obsidian) en wat een regel plaatste. Van zijn eigen gokken leert het niet, zodat één verkeerde gok geen gewoonte wordt.
3. **De maker**: zet je posts van dezelfde maker steeds in één map, dan gaat de volgende daar ook heen.

Dat een post op Instagram of LinkedIn staat, zegt niets over het onderwerp en telt dus niet mee. Twijfelt de app, dan blijft het item in **Inbox** staan. Open het en tik op een van de **voorgestelde mappen** onder het mapveld: één tik, en het model leert ervan. Een item dat je zelf plaatste, verplaatst de app nooit meer.

Tags zeggen waar een item over gaat: de eigen #hashtags van de post als die er zijn, anders de meest kenmerkende woorden, met namen voorop. De naam van de maker, het platform en vulwoorden ("actually", "introducing") worden geen tag.

### Tekst van posts

Van een post bewaart de app de post zelf, niet de pagina eromheen:

- **Instagram:** het bijschrift, via de insluitpagina (Jina Reader), anders uit de paginabeschrijving.
- **LinkedIn:** de tekst van de post en bij een video het transcript, zonder inlogmuur, menu's en reacties van anderen.
- **Threads:** de post zonder menu's en tellers. Deellinks (`threads.com/share/...`) werken ook.
- **TikTok:** het bijschrift en de maker, via tikwm.

De titel van een post is zijn eerste zin. Geeft de bron geen tekst, dan heet het item bijvoorbeeld "Reel van Jesse Rurka" in plaats van "instagram.com". Dezelfde post met een andere volgcode in de link, of via een ander adres (x.com en twitter.com), herkent de app als dubbel.

### Opschonen

Onder **Mappen** staat een kaart **Opschonen** zodra er iets te doen is. Er gebeurt niets tot je op **Schoon op** tikt; de kaart zegt vooraf wat er verandert:

- Posts die eerder zonder tekst zijn bewaard, krijgen hun tekst, een titel, een samenvatting en tags. Een notitie met een nieuwe titel krijgt ook een nieuwe bestandsnaam in Obsidian; links ernaar in `Concepten/` gaan mee. Je notities, markeringen en lessen blijven staan. De gratis leesdienst staat ongeveer twintig pagina's per minuut toe, dus bij veel items duurt dit een paar minuten.
- Dubbel bewaarde items gaan naar het archief, op één exemplaar na.
- Elk automatisch geplaatst item gaat naar de map waar het met de huidige regels hoort. Wat je zelf verplaatste en wat Haiku plaatste, blijft staan.
- Heb je `regels.md` nooit aangepast, dan krijgt het de huidige standaardregels: meer woorden per map en een map **Design & Vibe Coding**. Regels die je zelf wijzigde, blijven zoals ze zijn.
- Bundels en onderwerpen die uit platformwoorden bestonden ("Main content", "Photos"), verdwijnen.

Na afloop zie je wat er verplaatst is. **Zet alles terug** herstelt de mappen, de dubbelen en je oude regels. Geeft een bron ook na drie pogingen geen tekst, dan biedt de app dat item niet meer aan.

## Stapels: hetzelfde verhaal bij elkaar

Bewaar je vijf posts over dezelfde lancering, dan staan ze in de feed als één stapel: de beste bovenop, met eronder "3 meer over Claude Duet". Tik op die regel om de stapel open te klappen. **Kies alle** selecteert de hele stapel voor één prompt.

De app zet items bij elkaar als hun woorden dicht bij elkaar liggen, of als ze dezelfde naam delen die maar weinig items hebben (een product, een modelversie) en binnen drie weken van elkaar zijn bewaard. Dat gebeurt zonder AI. Wat niets bindt: het platform, de sitenaam achter een streepje, een rubrieknaam voor een dubbele punt, grote merknamen op zichzelf en een samenvatting die alleen een inlogmuur is. Een stapel heeft hoogstens zeven items. Met de chip **Stapels** boven de feed zet je het uit; bij zoeken zie je altijd losse kaarten.

Hetzelfde item twee keer bewaard (een andere volgcode in de link, of x.com en twitter.com) herkent de app bij het opslaan. Dubbelen van vroeger ruimt **Opschonen** op: het exemplaar waar je het meest mee deed blijft, de rest gaat naar het archief. Er wordt niets verwijderd.

Staan er in je Inbox vier of meer items met dezelfde hashtag en is daar nog geen map voor, dan stelt **Mappen** een nieuwe map voor. Tik je op **Maak de map en verplaats ze**, dan komt er ook een regel in `regels.md`, zodat nieuwe items over dat onderwerp daar vanzelf komen.

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

## Video downloaden

Video's van **X, TikTok, Instagram, Threads, LinkedIn en YouTube** bewaar je op je iPhone of Mac, zonder de rare downloadsites. Foto's ook: van X, TikTok, Instagram, Threads en LinkedIn. Een gewone webpagina kan ook: dan krijg je de afbeeldingen en video's die erop staan.

- **In de app:** op de Mac in de zijbalk (**Video en foto's**), op de iPhone via het plusje en **Video**. Bij elke post van die platforms staat ook een downloadknop.
- **Vanuit het deelmenu:** onder Instellingen download je een tweede opdracht, **Videodownloader**. Deel een post, en de downloader opent met de video klaar. Er staat geen token in en hij werkt ook zonder gekoppelde vault.

Je ziet de video eerst, dan download je hem met een voortgangsbalk; met **Stop** breek je een download af. Op de iPhone kies je daarna **Bewaar video** (Foto's) of **Bewaar in Bestanden**; op de Mac komt hij in Downloads. Lukt direct downloaden niet, dan opent de app de video zodat je hem zelf bewaart.

**Kies de kwaliteit.** Bij een video op X, TikTok of LinkedIn staan de beschikbare formaten onder het voorbeeld, met de grootte erbij. De beste staat voor; kies een kleinere als je opslag wilt sparen. Bij TikTok kan ook **alleen geluid** (mp3). Met **Bewaar omslag** haal je het voorbeeldplaatje van een video op, handig als voorbeeld voor je eigen thumbnail.

**Deel-links werken ook.** Links als `instagram.com/share/...`, `threads.com/share/...` en `lnkd.in/...` leiden naar de echte post; de app zoekt die eerst op. Geeft fxtwitter geen antwoord, dan probeert de app vxtwitter.

**Laatst gedownload.** Onder het invoerveld staan de laatste acht posts die je hebt gedownload. Een tik opent de post opnieuw. De lijst staat alleen op dit apparaat en je wist hem met een tik.

**YouTube in de kwaliteit die je wilt.** Bij een YouTube-link kies je zelf de kwaliteit, met de grootte erbij, zodat je een video ook heel klein binnenhaalt. **Alleen geluid** is het kleinst, handig voor een podcast of talk.

- Zonder eigen server haalt de app de video via openbare Piped- en Invidious-servers. Die geven meestal 360p met geluid en alleen geluid (soms ook een extra kleine versie). Ze worden vaak door YouTube geblokkeerd, dus dit lukt niet altijd.
- Met een eigen [Cobalt](https://github.com/imputnet/cobalt)-server krijg je elke kwaliteit: 144p, 240p, 360p, 480p, 720p, 1080p en alleen geluid (mp3). Cobalt is gratis software die je op een kleine server zet. Vul het adres (en een API-sleutel als je server die vraagt) in onder Instellingen, *Video's downloaden vanuit je deelmenu*. Ze blijven op je apparaat en gaan alleen naar die server.
- Op je Mac werkt **yt-dlp** altijd. Eenmalig `brew install yt-dlp ffmpeg`, daarna geeft de app per kwaliteit een kant-en-klare regel voor Terminal; het bestand komt in Downloads. Antwoordt geen server, dan kies je de kwaliteit voor die regel.

**Foto's, slideshows en carrousels.** Deel je een foto-post op X, een foto-slideshow op TikTok of een carrousel op Instagram, dan zie je alle slides in een stripje onder het voorbeeld, met een videotje erop als een slide een video is. **Download alles** haalt ze in een keer op; op de iPhone bewaar je ze dan samen in Foto's. Op de Mac komen meer dan twee bestanden als een zip in Downloads (tot 400 MB), met een knop om ze toch los op te slaan. Met **Kopieer foto** zet je een foto op je klembord, om hem meteen in een post te plakken. Foto's van X komen in de originele grootte. Instagram en TikTok geven hun foto's niet aan andere sites, dus die komen zo nodig via de gratis beeldproxy wsrv.nl. Krijgt Instagram de volledige postdata niet mee, dan zie je alleen de foto die de insluitpagina toont.

| Platform | Hoe | Betrouwbaar |
| --- | --- | --- |
| X | fxtwitter, met vxtwitter als reserve (gratis API's, elke kwaliteit) | ja |
| TikTok | tikwm (gratis API, zonder watermerk; HD, standaard of alleen geluid; slideshows als losse foto's) | meestal |
| Instagram | de openbare insluitpagina, via Jina Reader; foto's via de beeldproxy wsrv.nl | alleen openbare posts, niet altijd |
| Threads | de openbare postpagina (en anders de insluitpagina), via Jina Reader; foto's via wsrv.nl | alleen openbare posts, niet altijd |
| YouTube | openbare Piped- of Invidious-servers, of je eigen Cobalt-server; op de Mac yt-dlp | openbaar: wisselend, eigen server en yt-dlp: ja |
| LinkedIn | de openbare postpagina (en anders de insluitpagina), via Jina Reader; video in de aangeboden formaten, foto's in de grootste versie | alleen openbare posts, niet altijd |
| Webpagina | de pagina zelf, via Jina Reader; afbeeldingen via wsrv.nl | wisselend; logo's en iconen blijven weg |

Die diensten zien de link. Alleen voor eigen gebruik: wil je een video van een ander posten, vraag dan eerst toestemming.

## Snel en interactief

De app gebruikt de interactieve elementen uit de [NinA UI-bibliotheek](https://www.nina-ai.nl/ui), nagebouwd zonder framework:

| Element | Waar |
| --- | --- |
| Wegvegen | Veeg een kaart in de feed of een map **naar links** voor het archief, **naar rechts** voor een ster (nog een keer haalt de ster weg). Met **Ongedaan maken**. In het filter Archief zet naar links vegen een kaart terug. |
| Kaarten swipen | **Snel sorteren**: tik in de feed op "x ongelezen". Veeg naar rechts voor een ster, naar links voor het archief, of tik op Later. Op de Mac met de pijltjestoetsen. |
| Meldingenstapel | Elke melding, met **Ongedaan maken** waar dat kan (archiveren, sorteren, content-archief, markering weghalen). Tik op de stapel om oudere meldingen te zien. |
| Schuif om te bevestigen | Verwijderen, uit het content-archief halen en ontkoppelen. |
| Like-knop | Ster en duim omhoog veren en spatten. |
| Rolteller | De score en de tellers op de filters rollen naar hun nieuwe waarde. |
| Genereer-knop | **Maak prompt** gloeit terwijl de prompt wordt gemaakt. |
| Checklist | **Aan de slag** bovenaan Instellingen: wat al klaar is, vinkt zichzelf af. |
| Vloeibare schakelaar | De opties onder Instellingen; omzetten bewaart meteen. |
| Kantelkaart | De stapeltjes in het Content-archief kantelen mee met je muis. |

Bij "beweging verminderen" in je iPhone- of Mac-instellingen staan de animaties uit.

## Premium-functies, gratis

Apps als Raindrop, Instapaper, Matter en Readwise vragen 3 tot 13 dollar per maand voor dit soort functies. Hier zitten ze er gratis in.

### Transcript van een video

Bij een YouTube-video staat in het item de knop **Haal transcript op**. De app haalt de ondertitels op via dezelfde openbare Piped- en Invidious-servers als de downloader en zet ze als leesbare tekst in de notitie, onder een eigen kop `## Transcript`. Automatische ondertitels zeggen elke regel twee keer; die dubbelingen gaan eruit, net als `[Music]` en tijdcodes.

- Het transcript gaat mee in je prompts. **Leer ervan** krijgt het hele transcript (tot 40.000 tekens), een content-prompt een deel ervan. Is het langer, dan gaan het begin en het eind mee, want daar zitten de hook en de kern.
- Je vindt de video terug op wat erin gezegd wordt, want zoeken doorzoekt de hele notitie.
- Je leest het in het item, en het staat ook in Obsidian.
- **Plak transcript** werkt bij elke video (ook TikTok en Instagram): kopieer een transcript, een `.srt` of een `.vtt` en de app maakt er gewone tekst van.
- Geeft geen openbare server antwoord, dan staat er een regel voor **yt-dlp** op je Mac die de ondertitels als `.srt` in Downloads zet. Die plak je daarna.

De openbare servers zijn niet altijd bereikbaar; dan lukt ophalen niet en gebruik je plakken.

### Voorlezen

Boven de tekst van elk item staat **Lees voor**. De stem van je eigen iPhone of Mac leest het item voor, in het Nederlands of Engels naar gelang de tekst. Je pauzeert, gaat verder en kiest het tempo (0,85x tot 1,5x). Er gaat niets naar een server. Ga je weg uit het item, dan stopt de stem.

### Meer items tegelijk

Kies items in de feed met het vakje. In de balk onderaan staat naast **Maak prompt** een map-knop: daarmee verplaats je de hele selectie naar een map, geef je ze een tag, een ster, zet je ze bij **Om van te leren** of **Om te posten**, of archiveer je ze. Na elke actie kun je alles in een keer ongedaan maken.

### Sneltoetsen op de Mac

| Toets | Wat |
| --- | --- |
| `/` | Zoeken |
| `N` | Iets bewaren |
| `1` tot `5` | Feed, Vandaag, Mappen, Studio, Content-archief |
| `V` | Downloader |
| `S`, `E`, `L` | In een item: ster, archiveer, lees voor |
| `Esc` | Terug of sluiten |

Ze werken zolang je niet in een veld typt. De lijst staat ook onder Instellingen.

### Zoeken in de volledige tekst

Het zoekveld doorzoekt titels, tags, samenvattingen **en de hele tekst** van elk artikel en elke post, ook je notities en markeringen. Hoofdletters en accenten maken niet uit (`ideeen` vindt `ideeën`). Zet woorden tussen aanhalingstekens voor een exacte zin: `"multi agent"`. Vind je iets alleen in de tekst, dan zie je het stukje eromheen met het woord gemarkeerd.

De app leest elke notitie eenmalig van GitHub en bewaart de tekst op je apparaat (IndexedDB). Daarna is zoeken direct, ook met honderden items. Onder Instellingen, Status, zie je hoeveel notities doorzoekbaar zijn.

### Markeringen met notities

Selecteer tekst in een artikel en tik op **Markeer** of **Met notitie**. Markeringen:

- staan geel in de tekst en in een eigen blok bovenaan,
- gaan in elke prompt mee onder "Wat ik markeerde", zodat Claude je beste zinnen letterlijk kan gebruiken,
- staan in de notitie als `==gemarkeerd==`, dus ook geel in Obsidian:

```markdown
## Markeringen

- ==de grootste winst zit in offertes en planning==
  Mooie hook voor TikTok
```

Markeren telt als positief signaal voor de ranking. Op de kaart in de feed zie je hoeveel markeringen een item heeft.

### Vandaag: dagelijkse herhaling

Het tabblad **Vandaag** haalt elke dag 5 bewaarde items terug, met een van je markeringen. Items met markeringen en een hoge score komen eerst; gloednieuwe items wachten een paar dagen. Elke keer dat iets terugkomt, duurt het daarna twee keer zo lang (7, 14, 28 dagen). Per item: **Maak content**, **Lees** of **Niet meer tonen**. Met **Maak een nieuwsbrief van deze mix** gaan alle vijf in één prompt.

De mix staat in `_systeem/herhaling.json`, dus je iPhone en je Mac zien dezelfde vijf.

## Hoe de ranking leert

| Actie | Signaal |
| --- | --- |
| Prompt gekopieerd (content gemaakt) | sterk positief |
| Ster, duim omhoog | positief |
| Markeren | positief |
| Openen | licht positief |
| Archiveren zonder ster | licht negatief |
| Duim omlaag, verwijderen | negatief |
| Verplaatsen naar een andere map | correctie |

Elk signaal past de gewichten aan van de tags, map, bron, het type en de maker. Daarmee stijgen of zakken vergelijkbare items tot 25 punten. **Trending** laat oudere items langzaam zakken. Onder Instellingen zie je wat de machine heeft geleerd.

## Content maken: de prompt-generator

In de **Studio** kies je bronnen (het rondje op een kaart, of "Beste van deze week") en een vorm: LinkedIn post, post op X (één post), thread op X, Threads, Instagram (caption en reel), carrousel, TikTok script, YouTube (titels, script en beschrijving), nieuwsbrief of een vrije opdracht. Elke vorm heeft een taal: **X, Threads, Instagram en YouTube in het Engels, LinkedIn, carrousel en nieuwsbrief in het Nederlands**, ook als de bronnen in een andere taal zijn. Onder Instellingen, **Mijn kanalen**, zet je de taal per kanaal anders. De app bouwt een complete prompt met:

- je profiel (`_systeem/profiel.md`) en stijlgids (`_systeem/stijl.md`),
- de opdracht per vorm, waaronder de vaste opbouw van je nieuwsbrief,
- per bron de titel, link, samenvatting, **je eigen notities**, **je markeringen** en een fragment.

Tik op **Kopieer en open Claude** (of ChatGPT) en plak.

Heb je hier eerder content over gemaakt, dan staat dat in de prompt onder "Wat ik hier eerder over maakte", met de vraag om een nieuwe invalshoek.

### Het antwoord terug in de app

Elke prompt eindigt met een korte code, bijvoorbeeld `cm-k7f2q`, en de vraag die onderaan het antwoord te zetten. Daarmee vindt het antwoord zijn plek terug:

- **Plakken:** kopieer het antwoord in Claude of ChatGPT en ga terug naar de app. Er verschijnt een balk **Antwoord gekopieerd?** met de knop **Plak**. Dezelfde knop staat in de Studio en op het stuk zelf. Staat de prompt nog op je klembord, dan zegt de app dat.
- **Delen op je iPhone:** kies bij het antwoord **Deel** en dan de opdracht **Contentmachine**. Het antwoord komt in je Inbox en de app zet het bij het juiste stuk zodra je hem opent, niet in je feed.

Zonder code gaat het antwoord naar het stuk dat je open hebt, anders naar de laatste prompt die nog op een antwoord wacht. De code zelf zie je nergens terug.

## Publiceren en bijhouden

Een stuk content gaat door drie stappen: **wacht op resultaat**, **klaar om te posten** en **gepost**.

**Per kanaal klaar om te plakken.** Zodra het antwoord binnen is, toont het stuk de tekst zoals het kanaal hem wil, zonder Markdown, met een teller:

| Vorm | Wat je krijgt |
| --- | --- |
| LinkedIn post | de post met teller (3.000) en wat er in de feed staat voor "meer"; andere hooks, elk met **Gebruik als opening** |
| Post op X, Threads | de post met de telling van het kanaal (280 of 500; op X telt een link als 23), andere versies, en **Open X met deze tekst** |
| Thread op X | elke post apart met teller |
| Instagram | caption met teller (2.200), reel-script met spreektijd |
| TikTok, YouTube | het script met spreektijd en **Zet in Teleprompter**, de caption of beschrijving, titels |
| Carrousel | elke slide apart, plus de begeleidende post |


### Nooit hashtags

Je posts krijgen nooit hashtags. Elke prompt zegt dat expliciet, en dat gaat voor wat je stijlgids of een voorbeeld anders zegt. Glipt er toch een door, dan haalt de app hem eruit bij alles wat je kopieert, opent op een platform of naar de Teleprompter of Substack stuurt: een rij hashtags aan het eind van een regel verdwijnt, een hashtag midden in een zin houdt zijn woord (`#AI helpt` wordt `AI helpt`). `#1`, `C#` en links blijven zoals ze zijn. Dit geldt ook voor wat je eerder al plakte. De hashtags van posts die je bewaart blijven wel gewoon tags in je vault; die gebruikt de app om te ordenen.

### Zelf gepost, buiten de app

Schreef je een post zelf en zette je hem rechtstreeks op LinkedIn, X of een ander kanaal, dan zet je hem toch op gepost:

- **In een item:** open **Zelf gepost?** (onder de knoppen voor content). Kies het kanaal, plak eventueel de link naar je post (het kanaal kiest zich dan vanzelf) en de datum, en tik **Zet op gepost**. Stond er al een stuk uit dit item voor dat kanaal klaar, dan krijgt dat de datum en link; anders komt er een nieuw stuk in je Content-archief. Het item gaat naar **Gebruikt**. Ook op een tweede kanaal gepost? Doe het nog een keer met dat kanaal.
- **Meer items tegelijk:** kies ze in de feed, tik op de map-knop in de balk en kies onder **Zelf gepost, als één post** het kanaal. Dat wordt één stuk met al die items als bron.

Met een link naar een post op X of TikTok haalt de app de cijfers zelf op; voor andere kanalen vul je ze in bij het stuk in je Content-archief. Een link die al in je archief staat, komt er niet nog een keer in. Na elke actie kun je het ongedaan maken.

Een post die je zelf deelt vanuit LinkedIn, X, TikTok, Instagram of Threads herkent de app al als je eigen post (als je je handles invult onder **Mijn kanalen**) en zet hem op gepost.

### De nieuwsbrief-editor voor Substack

Een nieuwsbrief opent in een eigen editor (**Open in de editor** op het stuk):

- Links schrijf je in Markdown, rechts zie je de tekst zoals hij in Substack komt. Op de iPhone wissel je tussen **Schrijven** en **Voorbeeld**.
- De werkbalk zet een kop, tussenkop, vet, cursief, een link, citaat, lijst, genummerde lijst of scheidslijn.
- De onderwerpregels die de prompt opleverde, staan bovenaan als keuzes. Tik er een aan en hij wordt de titel. Titel en ondertitel hebben hun eigen veld en kopieerknop, net als in Substack.
- **Kopieer tekst voor Substack** zet de tekst met opmaak op je klembord. Plak hem in het tekstvak van een nieuwe post: koppen, vet, cursief, links, lijsten, citaten en scheidslijnen komen mee. De titel, de lijst met onderwerpregels en de terugcode gaan niet mee.
- **Open Substack** opent een nieuwe post als het adres van je Substack onder **Mijn kanalen** staat.
- Wat je typt, wordt vanzelf bewaard in de notitie in `Concepten/`. Je ziet het aantal woorden en de leestijd.

Op het stuk zelf staat dezelfde kopieerknop, voor als je niets wilt aanpassen.

**Bewerk tekst** past de tekst van de andere vormen aan, **Plak een nieuwe versie** vervangt hem. Onder **Maak er ook van** kies je een ander kanaal: de nieuwe prompt krijgt deze tekst mee als basis, zodat de kern gelijk blijft.

**Gepost en cijfers.** Markeer een stuk als gepost, met de link naar je post. Voor X en TikTok haalt de app de cijfers zelf op (fxtwitter en tikwm) en ververst ze af en toe. LinkedIn, Instagram, Threads, YouTube en Substack laten cijfers alleen aan jou zien: die neem je over. Na twee dagen, en nog eens na een week, vraagt **Vandaag** om de cijfers.

**Je eigen posts.** Vul onder **Mijn kanalen** je handle in. Deel je daarna een eigen post naar de app, dan komt die niet in je feed: het stuk waar hij van kwam gaat op gepost met die link. Een post die je niet in de app maakte, komt als gepost in je Content-archief, zodat je alles op één plek bijhoudt.

**Weekritme.** Zet per kanaal hoe vaak je per week wilt posten. **Vandaag** toont per kanaal hoe ver je bent, wat klaarstaat om te posten en wat nog op een antwoord wacht.

**Wat werkt.** Het Content-archief toont per kanaal wat je posts deden, je beste posts en de onderwerpen die het beter doen dan je gewone. Een post telt tegen het gewone van zijn eigen kanaal. Bronnen van een post die duidelijk beter scoort, stijgen in je feed.

Kanalen, taal en weekdoelen staan in `_systeem/kanalen.json`, dus je iPhone en je Mac zijn het eens. In Obsidian zie je bij elk stuk in `Concepten/` de eigenschappen `status`, `gepost`, `link` en de cijfers.

## Om te posten, om na te maken of om van te leren

Niet alles wat je bewaart is materiaal voor een post. Een video van Kallaway over storytelling bewaar je niet om erover te posten, maar om te leren hoe hij het doet. Daarom heeft elk item een doel:

- **Om te posten**: materiaal voor je eigen content, zoals nieuws, cases en meningen. Dit is de gewone feed.
- **Om na te maken**: een post of video die je in je eigen versie wilt maken. Het format spreekt je aan (de hook, de opbouw, hoe het in beeld staat), het onderwerp wordt het jouwe.
- **Om van te leren**: hoe een andere maker het doet. Bovenaan de feed schakel je tussen de drie (op de iPhone: Posten, Na maken, Leren); zoeken kijkt altijd in alle drie.

Op elk item kies je het met drie knoppen onder de titel. Direct na het delen vanuit je iPhone kies je het ook al, op het scherm **Bewaard**. Meerdere items tegelijk zet je om via de selectie (de map-knop in de balk onderaan). Nieuwe links over het maken van content (storytelling, copywriting, hooks, kijkduur en dergelijke) komen vanzelf bij **Om van te leren**. Zet je een paar items zelf om, dan leert de app daarvan, net als bij mappen. Eigen woorden geef je op met een regel `Leren: woord, woord` in `_systeem/regels.md`; die regel vervangt dan de standaardwoorden en wordt geen map.

Een item om van te leren heeft geen knoppen voor content, maar het paneel **Leer ervan**:

1. **Kopieer prompt en open Claude** (of ChatGPT). De prompt vraagt om de lessen als korte regels die je kunt toepassen, alleen uit wat de maker echt zegt, plus drie manieren om ze in je eigen content te gebruiken. Bij een video heeft Claude de tekst nodig: zet het transcript in **Mijn notities**, dan gaat het mee. Staat er geen transcript, dan vraagt Claude erom in plaats van te raden.
2. Plak het antwoord bij **Lessen**, of schrijf ze zelf. Ze komen in de notitie onder `## Lessen` en het aantal staat op de kaart.
3. **Pas toe in de Studio**: in de Studio kies je onder **Technieken toepassen** welke lessen meegaan. Je prompt krijgt dan een stuk "Technieken die ik wil toepassen", met de vraag ze te gebruiken zonder de technieken of makers te noemen.

Een item om na te maken heeft het paneel **Maak je eigen versie**, met drie stappen:

1. **Videoscript**. De knop **Maak videoscript** maakt een prompt die het format van de inspiratie overneemt en niet de inhoud: zelfde soort hook, opbouw en tempo, met jouw onderwerp en jouw invalshoek. Zet in **Mijn notities** waar jouw video over moet gaan; dat weegt zwaar. Bij een video helpt een transcript (zie Transcript van een video). Het antwoord begint met **Format**: wat er van de inspiratie is overgenomen. Dat staat in de app apart en gaat niet mee naar de Teleprompter. Daarna het script per blok, een caption en drie andere hooks. Kies je meer items om na te maken en open je de Studio, dan staat die al op **Videoscript**.
2. **Teleprompter**. Bij het script staat **Zet in Teleprompter**.
3. **Opnemen en posten**. Markeer hem als gepost op TikTok of Reels, dan volgt de app de cijfers.

Is het script gemaakt, dan is stap 1 afgevinkt en staat het script onder het paneel.

In Obsidian staat het doel als eigenschap `doel: leren` of `doel: maken`. Zonder die eigenschap is een item om te posten.

## Titels aanpassen

Tik op het potloodje naast de titel van een item. De bestandsnaam in Obsidian verandert mee, en de links ernaar in `Concepten/` ook. Ongedaan maken kan vanuit de melding.

## Content-archief

Zodra je een prompt kopieert (of opent in Claude of ChatGPT), worden de gekozen bronnen samen één stuk content:

- Ze verdwijnen uit je feed (filter **Actueel**). Onder **Mappen** staat de map **Content-archief**: elk stuk content is daar een stapeltje kaarten met de bronnen erin. Tik op een stapeltje om het open te klappen; je ziet de bronnen, opent ze, of maakt er iets anders van. Filter op soort (LinkedIn post, TikTok script...).
- In de feed vind je ze ook via het filter **Gebruikt**, met een groen label van wat je ervan maakte, en via zoeken.
- In `Concepten/` komt een notitie, bijvoorbeeld `2026-10-22 LinkedIn post - Claude en Duet.md`, met links naar de bronnen en de onderwerpen als tags. Elke bron krijgt de eigenschap `gebruikt_in` met een link terug. In Obsidian zie je de bundel dus van twee kanten.
- Plak je later het resultaat (in de Studio of op de notitie zelf), dan komt dat bovenaan de notitie.
- Je kunt de bronnen gewoon opnieuw gebruiken: **Maak iets anders met deze bronnen**, of selecteer ze los. Elk nieuw stuk komt er apart bij.
- Per ongeluk? **Ongedaan maken** zet de bronnen terug in je feed en haalt de notitie weg. Eén item terugzetten kan ook: **Zet terug in de feed**.

**Wat je maakt**, onderaan het Content-archief, laat zien hoeveel content je maakte, per soort en per onderwerp ("#Claude: LinkedIn post 3, TikTok script 1"), en welke onderwerpen je vaak bewaart maar nog nooit gebruikte. Tik op zo'n onderwerp om die items te zien.

Gebruiken telt als sterkste signaal voor de ranking: items over dezelfde onderwerpen, makers en bronnen stijgen. Het logboek staat in `_systeem/content.json`.

## Optioneel: Claude Haiku

Onder Instellingen, *Inhoud ophalen en AI*, kun je **Claude Haiku** aanzetten met je eigen Anthropic API-sleutel. Bij elk nieuw item maakt Haiku dan een betere titel, samenvatting, kernpunten, tags en een score. Zodra je eigen mappenmodel zeker is, wint het model van Haiku. De sleutel blijft op je apparaat en gaat alleen naar api.anthropic.com. De kosten zijn ongeveer 0,1 cent per item.

## Wat er in je vault komt

```
Contentmachine/
  Inbox/                    binnengekomen vanaf je iPhone, of nog niet zeker
  AI Agents/                mappen uit je regels of die jij aanmaakt
    2026-10-22 Titel.md
  Concepten/                je content-archief: per stuk content de bronnen en het resultaat
  _systeem/
    regels.md               trefwoorden per map (pas gerust aan)
    bundels.md              bundels van hashtags per map
    profiel.md              wie je bent, gaat mee in elke prompt
    stijl.md                hoe je schrijft, gaat mee in elke prompt
    index.json, leren.json  beheert de app zelf
    herhaling.json          de mix van Vandaag en wanneer elk item terugkomt
    content.json            welke content je maakte, van welke bronnen en onderwerpen, of het gepost is en wat het deed
    kanalen.json            je kanalen: handle, taal en weekdoel
```

Je notities onder **Mijn notities** en je **Markeringen** worden nooit overschreven. Verplaats, hernoem of bewerk gerust in Obsidian. Bij een conflict wint de versie die al op GitHub staat.

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
| `ui.js` | interactieve elementen: meldingen, schuiven, swipen, rollen, schakelaars |
| `lib/vault.js` | Markdown-vault, index, wijzigingen bundelen, conflicten |
| `lib/store.js` | GitHub REST API (Git Data API) of lokale opslag |
| `lib/pipeline.js` | van gedeelde link naar geordende notitie |
| `lib/capture.js` | link herkennen, gratis details en plaatjes ophalen |
| `lib/embeds.js` | de originele post of video per platform |
| `lib/classify.js` | regels, naive Bayes, maker, tags, samenvatting |
| `lib/clean.js` | de post uit een LinkedIn- of Threads-pagina halen |
| `lib/postdata.js` | de post uit een Instagram- of Threads-pagina lezen (ook voor de downloader) |
| `lib/similar.js` | gelijkenis tussen items (tf-idf) |
| `lib/words.js` | woorden van een tekst, zonder stop-, platform- en vulwoorden |
| `lib/bundles.js` | bundels op hashtags per map |
| `lib/shortcut.js` | de iPhone-opdracht als bestand |
| `lib/learn.js` | zelflerende ranking |
| `lib/search.js` | zoeken in de volledige tekst |
| `lib/textcache.js` | teksten op het apparaat bewaren (IndexedDB) |
| `lib/highlights.js` | markeringen met notities |
| `lib/review.js` | Vandaag: dagelijkse herhaling |
| `lib/content.js` | content-archief: onderwerpen, statistiek, eerder gemaakt |
| `lib/video.js` | video- en fotobestanden vinden achter posts op X, TikTok, Instagram, Threads, LinkedIn en YouTube, en op gewone webpagina's |
| `lib/zip.js` | meer bestanden als een zip, zonder compressie |
| `lib/transcript.js` | ondertitels van een YouTube-video ophalen en elk soort ondertitelbestand naar leesbare tekst |
| `lib/lessons.js` | lessen van items om van te leren |
| `lib/prompts.js` | prompt-generator |
| `lib/platforms.js` | tekst per kanaal: delen van een antwoord, tellers, open-links, de terugcode |
| `lib/stats.js` | cijfers van een post op X of TikTok ophalen |
| `lib/richtext.js` | Markdown naar opgemaakte tekst voor Substack, en de werkbalk van de editor |
| `lib/haiku.js` | optionele Claude Haiku-stap |
| `lib/frontmatter.js` | YAML-eigenschappen lezen en schrijven |

## Ook op deze site: Dagspel

[`dagspel/`](dagspel/) is je takenlijst als spel, op https://aiolaf.github.io/contentmachine/dagspel/. Zelfde vault, zelfde token. Zie [dagspel/README.md](dagspel/README.md).

## Ook op deze site: Teleprompter

[`teleprompter/`](teleprompter/) zet je tekst pal onder de camera van je iPhone of MacBook, zodat je tijdens het voorlezen in de lens kijkt. Open hem in de app via **Studio** (of in de zijbalk op de Mac), of rechtstreeks op https://aiolaf.github.io/contentmachine/teleprompter/. Zie [teleprompter/README.md](teleprompter/README.md).

## Ook op deze site: Notulist

[`notulist/`](notulist/) is je eigen notulist voor iPhone en Mac. Neem een gesprek of dictaat op, laat het uitschrijven met wie wat zei (ElevenLabs of OpenAI, met je eigen sleutel) en kopieer het transcript met één tik naar Claude of ChatGPT. Opnames en transcripten blijven op je eigen apparaat. Open hem op https://aiolaf.github.io/contentmachine/notulist/ en zet hem op je beginscherm. De Mac-app die meetings vanzelf opneemt en de Claude-koppeling staan in de repo Agent-town. Zie [notulist/README.md](notulist/README.md).
