// Words of a text, without the ones that say nothing: the base for folders,
// tags and finding items about the same thing.

export const STOP = new Set(`
de het een en van in op te dat die is zijn voor met als aan er maar om ook dan door bij nog naar uit
wat wel niet geen dit deze heb hebt heeft had was waren wordt worden werd kan kun kunnen moet moeten
zal zou zullen mijn jouw jij je hij zij ze we wij ons onze hun haar hem mij me u uw over tot meer
veel heel zo nu al alle alles iets niets hoe waar wie waarom want omdat dus toch even weer zelf
the and for are but not you your all any can had her was one our out has have this that with from
they will would there their what about which when make like time just know take into year good some
them see other than then now look only come its over think also back after use two how work first
well way even new want because these give day most into its it's i'm don't via http https www com
nieuwe nieuw eerste tweede grote groot kleine klein goed goede beter beste echt steeds alleen gaan gaat ging
maken maakt gemaakt doen doet laat laten komt komen staat staan zien ziet weet weten wil willen bouw lees
jaar week dag tijd mensen manier waarbij welke elke iedere iemand onder tussen sinds zonder binnen hier daar
best more using get gets got why who made makes still really very much many most first last next
`.split(/\s+/).filter(Boolean));

export function tokenize(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [])
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

// Words that describe the platform or the page around a post, never its topic.
export const PAGE_WORDS = new Set(`
instagram reel reels photo photos video videos threads thread linkedin tiktok youtube twitter facebook post posts
main-content cdninstagram fbcdn scontent licdn twimg profile picture image images view views like likes comment comments
share shared follow followers following repost reposts sign join login log more learn read watch link bio
`.split(/\s+/).filter(Boolean));

// Hype and filler: common in posts, useless as a topic.
export const FILLER = new Set(`
actually insane crazy wild breaking introducing introduce announcing announce today tomorrow yesterday now just
built build builds building made making make works working work created create creates creating gave shot live launch launching launched launches release released
releasing big small huge little full simple easy fast quick free best better good great amazing awesome cool
literally really very much many more most less every everyone everything anyone someone something nothing
people thing things way ways time times day days week weeks month months year years here there this that
want wants need needs get gets got use uses used using try tries tried look looks see sees saw know knows
going coming comes came take takes took give gives gave say says said tell tells told think thinks thought
one two three four five six seven eight nine ten first second third last next another other others same
also still even ever never always already yet soon again back down over under into onto about around
nieuw nieuwe nieuwste vandaag morgen gisteren nu net echt heel veel meer minder elke iedereen alles iets niets
mensen ding dingen manier tijd keer dag dagen week weken maand maanden jaar jaren hier daar deze dit dat
wil willen moet moeten kan kunnen gaat gaan komt komen maakt maken gemaakt doet doen werkt werken gebruik
gebruiken eerste tweede derde laatste volgende andere zelfde ook nog steeds altijd nooit al weer terug
`.split(/\s+/).filter(Boolean));
