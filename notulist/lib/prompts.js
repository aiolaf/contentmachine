// Ready-made instructions that go in front of the transcript when you copy it.
export const PROMPTS = [
  {
    id: 'samenvatting',
    label: 'Samenvatting',
    text: 'Vat dit gesprek samen in het Nederlands. Begin met de kern in drie zinnen. Geef daarna de belangrijkste punten, de besluiten en de actiepunten (wie doet wat, voor wanneer). Verzin niets wat niet in het transcript staat.',
  },
  {
    id: 'actiepunten',
    label: 'Actiepunten',
    text: 'Haal alle actiepunten uit dit gesprek. Maak een tabel met: actie, eigenaar, deadline (als die genoemd is) en het tijdstip in het transcript waar het besproken werd. Noem daarna open vragen die nog beantwoord moeten worden.',
  },
  {
    id: 'mail',
    label: 'Follow-up mail',
    text: 'Schrijf een korte, vriendelijke follow-upmail aan de andere deelnemers van dit gesprek. Bedank ze, zet de afspraken en volgende stappen op een rij en sluit af met de eerstvolgende actie. Schrijf in de taal van het gesprek, zonder overdreven formaliteit.',
  },
  {
    id: 'notulen',
    label: 'Notulen',
    text: 'Maak nette notulen van dit gesprek: aanwezigen, per onderwerp een korte weergave van wat er besproken is, besluiten en actiepunten met eigenaar. Neutraal en zakelijk, in het Nederlands.',
  },
  {
    id: 'content',
    label: 'Content-ideeën',
    text: 'Zoek in dit gesprek de inzichten, uitspraken en voorbeelden die sterk zijn voor een LinkedIn-post of een korte video. Geef vijf ideeën met een pakkende openingszin en het fragment uit het transcript waar het op gebaseerd is. Noem geen namen van klanten.',
  },
];
