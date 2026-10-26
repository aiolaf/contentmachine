# Teleprompter

Een teleprompter die je tekst pal onder je camera zet, op je iPhone en op je MacBook. Je leest steeds de bovenste regel, en die staat zo dicht bij de lens dat het lijkt alsof je in de camera kijkt.

Geen build, geen server, geen account. Alleen statische bestanden.

## Zo werkt het

- **Smalle kolom direct onder de camera.** Op de Mac bovenin het midden, onder de notch. Op een iPhone met Dynamic Island (14 Pro en nieuwer) staat de tekst onder de cameralens zelf: die zit rechts in het eiland, dus de kolom schuift 44 punten naar rechts. Draai je de iPhone, dan schuift de tekst naar de kant waar de camera zit.
- **Per regel (standaard).** De regel die je leest staat helemaal bovenin, direct onder de camera, en blijft daar staan. Is hij voorgelezen in het tempo dat je hebt ingesteld, dan schuift de volgende regel omhoog. De regels daarna staan gedimd klaar. Je ogen blijven zo op één plek bij de lens. **Doorlopend** scrollt de tekst zoals een klassieke teleprompter.
- **Tempo in woorden per minuut.** Grotere letters of een smallere kolom veranderen het leestempo niet. Onder je tekst zie je hoe lang de opname ongeveer duurt.
- **Opnemen in de app.** Camera en microfoon, met de tekst over je eigen beeld. Na afloop bewaar je de video in Foto's (iPhone) of als bestand (Mac).
- **Zwevend venster (Chrome en Edge op de Mac).** Een venster dat boven Zoom, Loom, QuickTime, OBS of Riverside blijft. Sleep het één keer pal onder je camera en neem op met je eigen app.
- `[regie]` tussen haken staat in paars in beeld, `**dikgedrukt**` in geel.

## Bediening

| Actie | Hoe |
| --- | --- |
| Pauze en verder | tik op het scherm, of spatie |
| Tekst verschuiven | slepen, of scrollen met je trackpad |
| Tempo | pijl omhoog en omlaag, of de plus en min onderin |
| Regel terug of verder | pijl links en rechts, Page Up en Page Down (werkt met een presentatieklikker) |
| Tekst groter of kleiner | `+` en `-` |
| Opname starten of stoppen | rode knop, of Enter |
| Terug naar je tekst | Esc of het kruisje |

Grootte, breedte, aantal regels en afstand tot de camera pas je ook live aan via het schuifjes-icoon, terwijl de tekst al onder je camera staat.

## Openen

- In de Contentmachine: **Studio**, knop **Teleprompter**. Op de Mac staat hij ook in de zijbalk. Linksboven in de teleprompter staat een link terug.
- Rechtstreeks: https://aiolaf.github.io/contentmachine/teleprompter/

De camera werkt alleen via https, dus niet als je `index.html` als bestand opent. Elders hosten kan ook: sleep deze map naar [app.netlify.com/drop](https://app.netlify.com/drop).

## Op je iPhone

Open je hem vanuit de Contentmachine op je beginscherm, dan blijft hij in dat app-venster en begint de tekst net onder de statusbalk. Het dichtst bij de camera kom je met een eigen icoon: open het adres in Safari, tik op Deel en kies **Zet op beginscherm**. Dan mag de pagina onder de statusbalk door en staat de bovenste regel 2 punten onder het Dynamic Island.

Nog dichterbij: zet **Tekstgrootte** wat lager (24 tot 26) en **Breedte** op 55 tot 65 procent. Met **Afstand tot camera** en **Verschuiven** stel je de laatste punten bij.

## Op je MacBook

- **Opnemen in de app:** druk op Start. De pagina gaat schermvullend, zodat de tekst direct onder de camera staat.
- **Opnemen met Zoom, Loom of QuickTime:** open de pagina in Chrome of Edge, kies **Zwevend venster** en sleep het onder je camera.

## Bestanden

```
index.html            pagina: editor, prompter en opname-scherm
styles.css            opmaak
app.js                positie bij de camera, scrollen, bediening, opnemen, zwevend venster
manifest.webmanifest  voor Zet op beginscherm
icon.svg, *.png       app-iconen
```
