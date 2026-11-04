# Notulist

Je eigen notulist voor iPhone en Mac. Neem een gesprek of dictaat op, laat het uitschrijven met wie-wat-zei, en kopieer het transcript met één tik naar Claude, ChatGPT of een ander taalmodel. Op je Mac start de opname vanzelf zodra je in een meeting zit. Claude kan via een eigen MCP-koppeling al je gesprekken doorzoeken.

Alles blijft op je eigen apparaten. Er is geen Notulist-server en geen account.

```
 iPhone (webapp op beginscherm)          Mac (Notulist in de menubalk)
 ┌───────────────────────────┐           ┌──────────────────────────────────────┐
 │ ● dictafoon                │           │ Zoom/Teams/Meet gebruikt de mic       │
 │ agenda via Apps Script     │           │   → opname start vanzelf              │
 │ opnames in IndexedDB       │           │ mic + geluid van de Mac (anderen)     │
 └─────────────┬─────────────┘           │ agenda uit macOS Agenda               │
               │ audio, jouw sleutel      └──────────────┬───────────────────────┘
               ▼                                         │ audio, jouw sleutel
        ElevenLabs Scribe of OpenAI  ◄───────────────────┘
               │ transcript met sprekers
               ▼
  wie-is-wie · kopieer voor AI · deel      →   Markdown in iCloud Drive/Notulist
                                                  │            │            │
                                              Obsidian   Bestanden-app   Claude (MCP)
```

## Wat het doet

| | |
| --- | --- |
| **Dictafoon** | Grote rode knop, timer, niveaumeter, pauze, markeringen (★) en notities tijdens de opname. Het scherm blijft aan. Elke 4 seconden wordt de opname bewaard: crasht de app of komt er een telefoontje tussen, dan ben je niets kwijt en ga je verder met **Ga verder**. |
| **Mac: vanzelf bij elke meeting** | De Mac-app ziet wanneer Zoom, Teams, Meet (in Chrome, Safari, Arc, Edge), FaceTime, Slack, Webex, Discord of WhatsApp je microfoon gebruikt en start de opname. Hij neemt je stem en het geluid van de Mac (de anderen) op. Klaar met bellen: opname stopt, wordt uitgeschreven en staat als Markdown in je map. Een zwevend label laat altijd zien dat er wordt opgenomen, met een Stop-knop. |
| **Agenda** | Een opname krijgt de titel en deelnemers van de afspraak die nu loopt. Op de Mac uit de app Agenda (alle accounts, niets instellen), op iPhone via een klein Google Apps Script dat alleen jij kunt aanroepen. Afspraken van het komende uur staan op het startscherm met een opnameknop. |
| **Wie is wie** | Het transcript komt terug met Spreker 1, 2, 3. Tik op een spreker, luister een fragment en kies een naam: jezelf, een genodigde uit de agenda of iemand van eerder. Geef je twee sprekers dezelfde naam, dan worden ze samengevoegd. Tik op een naam bij een uitspraak om alleen die uitspraak aan iemand anders te geven. |
| **Kopieer voor AI** | Eén tik: titel, datum, deelnemers, je notities en het transcript (`[12:30] Jan: …`) op je klembord, met knoppen naar Claude en ChatGPT. **Met opdracht** zet er een instructie voor: samenvatting, actiepunten, follow-up mail, notulen of content-ideeën. Op de Mac ook via de menubalk: *Kopieer laatste transcript voor AI*. |
| **Delen** | Als Markdown-bestand via het deelmenu (AirDrop, WhatsApp, Mail, *Bewaar in Bestanden*), als tekst, of als link die alleen lezen is. Die link bevat het transcript zelf achter het `#`-teken; dat deel stuurt een browser nooit naar een server. De ontvanger kan het met één tik in zijn eigen Notulist bewaren. |
| **Zoeken en personen** | Zoek in titels, namen en alle transcripten. Onder **Personen** zie je met wie je hoe vaak sprak; tik voor al hun gesprekken. |
| **Claude (MCP)** | Claude Desktop en Claude Code lezen je Notulist-map: "Wat heb ik vorige week met Jan afgesproken?", "Zoek alles over de offerte voor Acme", of de prompt *Bereid een gesprek voor* met iemand. Zie notulist-mcp in de repo Agent-town. |

## Installeren

### 1. Een transcriptie-sleutel (2 minuten)

Aanbevolen: **ElevenLabs Scribe**. Beste herkenning van Nederlands, herkent sprekers en kan uren audio aan.

1. Maak een account op [elevenlabs.io](https://elevenlabs.io) en ga naar **Settings > API Keys**.
2. **Create API key**. Zet bij de rechten alleen **Speech to Text** aan. Zet eventueel een maandlimiet op het tegoed.
3. Kopieer de sleutel (`sk_…`). Die plak je zo in de app.

Liever OpenAI? Maak een sleutel op [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Notulist gebruikt dan `gpt-4o-transcribe-diarize`. Let op: OpenAI neemt maximaal 25 MB per opname, ongeveer een uur. Voor lange meetings is ElevenLabs beter.

### 2. iPhone

1. Open **https://aiolaf.github.io/contentmachine/notulist/** in Safari.
2. Deel, **Zet op beginscherm**. Open Notulist voortaan vanaf je beginscherm (die versie heeft eigen opslag, los van Safari).
3. **Instellingen**: plak je sleutel, vul je naam in, kies de taal.
4. Tik op de rode knop en sta de microfoon toe.

Tip: laat de app open tijdens een opname. iOS stopt de microfoon van webapps als je het scherm vergrendelt of naar een andere app gaat. Gebeurt dat toch, dan is alles tot dat moment bewaard en tik je op **Ga verder**.

### 3. Mac

**Met de Command Line Tools** (`xcode-select --install`), vanuit de repo Agent-town:

```bash
cd notulist-mac && ./build.sh --install
```

**Zonder bouwen**: download *Notulist-voor-Mac* bij de laatste groene run onder **Actions > Notulist** in de repo [aiolaf/Agent-town](https://github.com/aiolaf/Agent-town), pak `Notulist.zip` uit, sleep **Notulist.app** naar Apps en open hem de eerste keer met rechtermuisknop, **Open** (hij is niet bij Apple aangemeld).

Notulist verschijnt in je menubalk (golfje) en opent een venster met dezelfde app als op je iPhone. Plak ook hier je sleutel bij **Instellingen**. macOS vraagt drie keer om toestemming:

| Toestemming | Waarvoor |
| --- | --- |
| Microfoon | jouw stem |
| Schermopname en systeemaudio | het geluid van de Mac, dus de andere deelnemers. Notulist neemt geen beeld op. Weiger je, dan neemt hij alleen je microfoon op. |
| Agenda's | titel en deelnemers van je afspraken |

Notulist start voortaan bij het inloggen. In de menubalk zet je automatisch opnemen, Mac-geluid en starten bij inloggen aan of uit.

**De Notulist-map.** Elk transcript komt als Markdown-bestand in `iCloud Drive/Notulist` (of `Documenten/Notulist` als iCloud Drive uit staat). Kies een andere map bij Instellingen, bijvoorbeeld een map in je Obsidian-vault. Transcripten die je op je iPhone met **Deel > Bewaar in Bestanden** in deze map zet, verschijnen vanzelf ook in de Mac-app.

### 4. Agenda op je iPhone (optioneel, 3 minuten)

De Mac-app leest je agenda zelf. Op iPhone gaat het via Google Apps Script, omdat een webapp niet bij de agenda van je telefoon mag:

1. Notulist, **Instellingen > Agenda koppelen > Kopieer het script**. Er zit een geheime sleutel in die alleen jouw app kent.
2. Open [script.google.com](https://script.google.com/home/projects/create), vervang alles door het script en bewaar.
3. **Implementeren > Nieuwe implementatie**, type **Web-app**. Uitvoeren als: **Ikzelf**. Toegang: **Iedereen**. Geef toegang tot je agenda.
4. Plak de web-app-URL in Notulist en tik **Verbind**.

"Iedereen" klinkt ruim, maar het script geeft alleen iets terug met jouw geheime sleutel, en alleen titel, tijden en deelnemers van de komende 7 dagen.

### 5. Claude-koppeling

Zie notulist-mcp/README.md in de repo Agent-town. Kort: dubbelklik **Notulist.mcpb** (bij de Mac-download, of `cd notulist-mcp && ./build.sh`) en Claude Desktop installeert hem. Voor Claude Code:

```bash
claude mcp add notulist -e NOTULIST_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Notulist" -- node /pad/naar/notulist-mcp/server.js
```

## Veiligheid en privacy

- **Lokaal.** Opnames, transcripten, namen en je sleutel staan in de opslag van de app op je eigen apparaat (IndexedDB). De app vraagt de browser om die opslag te beschermen tegen opruimen.
- **Geen tussenpersoon.** Bij uitschrijven gaat de audio rechtstreeks van je apparaat naar ElevenLabs of OpenAI, met jouw sleutel. Notulist heeft geen eigen server.
- **Strakke Content Security Policy.** De webapp mag alleen praten met ElevenLabs, OpenAI en (als je hem koppelt) Google Apps Script. Ook als er ooit iets misgaat in de code, kan een transcript nergens anders heen.
- **Mac-app.** Alleen de Notulist-pagina mag de Mac-functies gebruiken, en alleen voor `.md`-bestanden direct in je Notulist-map. Andere links openen in je browser. Een opname is altijd zichtbaar (rood icoon en zwevend label) en stopt met één klik. Korte "meetings" onder de 45 seconden worden weggegooid.
- **Claude-koppeling.** Alleen lezen, alleen je Notulist-map, geen internet.
- **Audio bewaren.** Kies bij Instellingen: altijd, 30 dagen of direct na uitschrijven weggooien. Per opname kun je ook alleen de audio wissen.
- **Toestemming.** Meld aan het begin van een gesprek dat je opneemt. Notulist herinnert je eraan bij elke opname.
- **Back-up.** Instellingen, **Back-up maken** bewaart al je transcripten en namen (zonder audio en zonder sleutel) als JSON.

## Kosten

De app is gratis. Je betaalt alleen de transcriptie bij ElevenLabs of OpenAI, met je eigen sleutel: enkele tientallen centen per uur gesprek (check de actuele prijs bij de dienst). Opnemen, sprekers benoemen, kopiëren en zoeken kost niets.

## Goed om te weten

- **Uitschrijven duurt** meestal een tot twee minuten per uur gesprek. Je kunt de app ondertussen gewoon gebruiken. Zonder internet wacht de opname en start het uitschrijven vanzelf zodra je online bent.
- **Sprekerherkenning** is goed, niet perfect. Twee mensen met vergelijkbare stemmen kunnen één spreker worden, en één persoon kan soms twee sprekers worden. Samenvoegen en per uitspraak corrigeren lost dat op.
- **Op de Mac zonder Mac-app** (Safari, **Archief > Voeg toe aan Dock**) werkt alles behalve automatisch opnemen, het geluid van de Mac en de map.
- **Na een update van de Mac-app** (zelf gebouwd) vraagt macOS de toestemmingen soms opnieuw, omdat de app niet bij Apple is aangemeld.

## Online zetten

De webapp bestaat alleen uit statische bestanden zonder geheimen. Kopieer de map `notulist/` naar de repo [aiolaf/contentmachine](https://github.com/aiolaf/contentmachine), dan staat hij op https://aiolaf.github.io/contentmachine/notulist/. De Mac-app laadt dat adres.

## Bestanden

```
index.html, styles.css, app.js   de app (geen build, geen dependencies)
lib/db.js           opslag in IndexedDB
lib/recorder.js     opnemen met MediaRecorder, stukjes van 4 s bewaren, herstel na crash
lib/transcribe.js   ElevenLabs Scribe en OpenAI, met uploadvoortgang en duidelijke foutmeldingen
lib/segments.js     woorden naar uitspraken per spreker, samenvoegen
lib/format.js       tekst voor AI, Markdown schrijven en teruglezen
lib/calendar.js     Apps Script (iPhone) en agenda-hulpjes
lib/share.js        deellink zonder server, deelmenu, downloaden
lib/native.js       brug naar de Mac-app
lib/prompts.js      opdrachten voor Kopieer met opdracht
sw.js               werkt offline en opent direct
```

Tests: `node --test test/notulist.test.js` in `contentmachine/`.
