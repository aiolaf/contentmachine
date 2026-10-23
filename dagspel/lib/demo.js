// Sample proposals for the demo, so the game can be tried before anything is
// connected. Names and companies are made up.
export function demoVoorstel(dag) {
  const morgen = (() => {
    const [y, m, d] = dag.split('-').map(Number);
    const x = new Date(y, m - 1, d + 1, 12);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  })();
  return {
    datum: dag,
    gemaakt: new Date().toISOString(),
    samenvatting: 'Vier meetings, ruim twee uur vrij. Twee beloftes uit gesprekken van gisteren en een deal die stilstaat.',
    vrijeMinuten: 150,
    agenda: [
      { van: '09:00', tot: '09:30', titel: 'Stand-up team' },
      { van: '10:30', tot: '11:30', titel: 'Kennismaking Logistiek Noord' },
      { van: '13:00', tot: '14:00', titel: 'Workshop-intake Gemeente Rivierstad' },
      { van: '16:00', tot: '16:30', titel: 'Check-in partner Bakkerij Van Dam' },
    ],
    taken: [
      { id: `demo-${dag}-1`, titel: 'Stuur Quick Scan-voorstel naar Logistiek Noord', bron: 'meeting', wie: 'Mark de Boer', context: 'Beloofd in de kennismaking: "ik stuur je vrijdag het voorstel".', minuten: 30, prio: 1, deadline: dag },
      { id: `demo-${dag}-2`, titel: 'Beantwoord Sanne over de lezing van 14 november', bron: 'mail', wie: 'Sanne Visser', context: 'Ze vraagt of de lezing ook in het Engels kan en wat de reistijd is.', minuten: 10, prio: 1 },
      { id: `demo-${dag}-3`, titel: 'Bereid workshop-intake Gemeente Rivierstad voor', bron: 'agenda', context: 'Om 13:00. Eerste gesprek, drie deelnemers van Dienstverlening.', minuten: 20, prio: 2, deadline: dag,
        subtaken: ['Lees de intake-mail terug', 'Zet drie vragen klaar', 'Check wie er aanschuiven'] },
      { id: `demo-${dag}-4`, titel: 'Plan volgende stap met Studio Lente', bron: 'pipedrive', context: 'Deal staat 12 dagen in "Voorstel verstuurd" zonder activiteit.', minuten: 10, prio: 2 },
      { id: `demo-${dag}-5`, titel: 'Deel de n8n-flow met het team van Van Dam', bron: 'meeting', wie: 'Ilse van Dam', context: 'Uit de check-in van gisteren: zij wil de flow zelf kunnen aanpassen.', minuten: 15, prio: 2, deadline: morgen },
      { id: `demo-${dag}-6`, titel: 'Keur factuur partnership oktober goed', bron: 'mail', context: 'Boekhouding wacht op akkoord voor verzending.', minuten: 5, prio: 2 },
      { id: `demo-${dag}-7`, titel: 'Schrijf LinkedIn-post over agents in de logistiek', bron: 'overig', context: 'Idee uit de meeting met Logistiek Noord, sterk voorbeeld voor je feed.', minuten: 45, prio: 3 },
      { id: `demo-${dag}-8`, titel: 'Bel Tom terug over de vacature AI-engineer', bron: 'mail', wie: 'Tom Jansen', context: 'Gemist gesprek, hij vroeg om een belmoment deze week.', minuten: 15, prio: 3 },
      { id: `demo-${dag}-9`, titel: 'Werk Pipedrive bij na kennismaking Logistiek Noord', bron: 'pipedrive', context: 'Nieuwe deal aanmaken en de Quick Scan als volgende stap zetten.', minuten: 5, prio: 2 },
    ],
  };
}
