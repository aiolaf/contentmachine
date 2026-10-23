# NinA Dagspel

Je taken als een spel. Geen lijst met honderd regels, maar een stapel kaarten.

- **Ochtendcheck**: Claude heeft je kaarten klaargezet uit je meetings (Wispr Flow), agenda, mail en Pipedrive. Veeg rechts voor wel, links voor niet, omhoog voor later. Een balk laat zien hoeveel van je vrije tijd je al hebt gevuld.
- **Jouw dag**: daarna kleine aanpassingen. Tik op een taak voor tijd, prioriteit of tekst, of zet hem bovenaan.
- **Overdag**: vink af in de lijst. Elke taak geeft punten. Hang subtaken aan een taak (tik op de taak) en vink die apart af.
- **Archief**: afgevinkte taken blijven tot het eind van de dag op je lijst en staan daarna in het archief, per dag met je punten.
- **Avondcheck**: veeg wat over is weg. Rechts is gedaan, links is morgen, omhoog laat je los. Daarna je score, je reeks en je level.

```
06:45  Claude-routine ──► leest Wispr Flow, agenda, Gmail, Pipedrive (alleen lezen)
                     └──► schrijft contentmachine-vault/Taken/voorstellen/2026-10-23.json

07:30  Dagspel op je iPhone ──► ochtendcheck: wel / niet / later
                            └──► schrijft Taken/staat.json  (Claude leest die morgen terug
                                                             en leert wat je wegswipet)
19:00  avondcheck: gedaan / morgen / los ──► punten, reeks, level
```

Alles staat in je eigen privé repo `contentmachine-vault`, in de map `Taken`. Dus ook in Obsidian.

## Installeren

Je gebruikt dezelfde privé repo en hetzelfde token als de Contentmachine. Heb je die nog niet, volg dan stap 1 en 2 van [de Contentmachine](../README.md#installeren-ongeveer-10-minuten).

1. Open **https://aiolaf.github.io/contentmachine/dagspel/** in **Safari** op je iPhone, tik op Deel en kies **Zet op beginscherm**.
2. Open Dagspel vanaf je beginscherm. Kies **Koppel je vault**. Gebruiker (`aiolaf`), repo (`contentmachine-vault`), branch (`main`) en map (`Taken`) staan al ingevuld: plak alleen je token en tik op **Verbind**.

De app op je beginscherm heeft een eigen opslag, los van Safari. Verbind dus in de app zelf. Eerst rondkijken kan met **Probeer de demo**.

Op je Mac werkt hetzelfde adres; in Safari kies je Archief, **Voeg toe aan Dock**. In de swipe-stapel werken de pijltjestoetsen, en Cmd+Z zet de vorige kaart terug.

## De Claude-routine

Elke ochtend om 06:45 start een Claude-routine (Routines op claude.ai/code) met de connectors Gmail, Google Calendar, Wispr Flow en Pipedrive. De volledige instructie staat in [ROUTINE.md](ROUTINE.md). Kort:

- Hij leest alleen. Hij stuurt geen mail en wijzigt niets in Pipedrive of je agenda.
- Hij maakt 5 tot 15 kaarten: toezeggingen uit meetings, mails waar iemand op je wacht, Pipedrive-activiteiten en stilstaande deals, en voorbereiding van belangrijke afspraken.
- Hij berekent je vrije tijd tussen 08:30 en 17:30.
- Hij leest `Taken/staat.json`: wat je wegswipete komt niet terug, en soorten kaarten die je steeds wegswipet stelt hij minder voor.

**Eigen regels** zet je in `Taken/voorkeuren.md` in je vault, bijvoorbeeld:

```markdown
- Mails van mijn boekhouder altijd prio 1.
- Geen kaarten voor LinkedIn-notificaties.
- Klant Van Dam is mijn grootste partner: kaarten voor hen altijd hoog.
- Op vrijdag maximaal 6 kaarten.
```

Pas je ROUTINE.md aan, werk dan ook de prompt van de routine bij (of vraag Claude om dat te doen).

## Punten

| Wat | Punten |
| --- | --- |
| Taak gedaan | 10 |
| Bonus bij prioriteit hoog / normaal | +10 / +5 |
| Taak die al twee dagen doorschoof en toch af kwam | +5 |
| Subtaak af | 2 |
| Ochtendcheck, avondcheck | 5 per stuk |
| Alles gedaan (niets naar morgen of losgelaten) | 20 |

Elke 200 punten een level: Opstarter, Doener, Afvinker, Doorpakker, Machine, Topspeler, Legende. Je **reeks** telt de dagen achter elkaar met een avondcheck; een weekenddag zonder check breekt hem niet.

## Bestanden in je vault

```
Taken/
  voorstellen/2026-10-23.json   door Claude, één per dag
  staat.json                    door de app: je keuzes, status, punten
  voorkeuren.md                 door jou, optioneel: regels voor Claude
```

`voorstellen/<datum>.json`:

```json
{
  "datum": "2026-10-23",
  "samenvatting": "Vier meetings, ruim twee uur vrij.",
  "vrijeMinuten": 150,
  "agenda": [{ "van": "09:00", "tot": "09:30", "titel": "Stand-up team" }],
  "taken": [
    { "id": "meet-8f2c1a-1", "titel": "Stuur Quick Scan-voorstel naar Logistiek Noord", "bron": "meeting",
      "context": "Beloofd in de kennismaking.", "wie": "Mark de Boer (Logistiek Noord)",
      "link": "https://mail.google.com/...", "minuten": 30, "prio": 1, "deadline": "2026-10-23" }
  ]
}
```

`bron` is `mail`, `agenda`, `meeting`, `pipedrive`, `monday` of `overig`. Optioneel geeft Claude `subtaken` mee: een lijst korte stappen. Het `id` blijft gelijk voor dezelfde zaak, zodat een kaart die je wegswipete niet terugkomt.

In `staat.json` heeft elke taak een `status`: `vandaag`, `gedaan`, `later`, `weg` of `open` (doorgeschoven). Een taak kan `sub` hebben: subtaken met `titel`, `klaar` en `op` (de dag van afvinken). Taken die langer dan 30 dagen gedaan of weg zijn, gaan naar `archief` met alleen hun id, datum en punten, en bij afgevinkte taken ook titel en bron, zodat ze in het archief zichtbaar blijven.

Gebruik je de app op iPhone en Mac tegelijk, dan voegt hij de twee versies samen: per taak wint de laatste wijziging.

## Ontwikkelen

Geen build en geen dependencies.

```bash
npm test     # de spelregels, de sync en de GitHub-koppeling
npm start    # http://localhost:8080
```

| Bestand | Wat |
| --- | --- |
| `lib/core.js` | spelregels: stapels, keuzes, punten, reeks, level, samenvoegen |
| `lib/sync.js` | lokale kopie, schrijven naar GitHub, conflicten oplossen |
| `lib/store.js` | GitHub contents API en een lokale opslag voor de demo |
| `lib/demo.js` | voorbeeldkaarten voor de demo |
| `app.js`, `ui.js` | schermen, swipe-stapel, toasts, confetti |
| `ROUTINE.md` | de instructie voor de Claude-routine |
