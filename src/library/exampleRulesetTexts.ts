import type { RulesetTemplate } from "./LibrarySchema";

export type ExampleLanguage = "en" | "sv" | "nb";

/** Name, then what a high and what a low value means, for one value of a rule-set. */
type ValueText = [name: string, high: string, low: string];
type SetText = { name: string; values: ValueText[] };

/**
 * The rule-sets that come with the app, in Swedish and Norwegian. The values come in the same
 * order as in the English set, and ids stay as they are, so a saved game or a weapon card never
 * notices which language the names are shown in.
 */
export const EXAMPLE_RULESET_TEXTS: Record<
  Exclude<ExampleLanguage, "en">,
  Record<string, SetText>
> = {
  sv: {
    "example-ruleset-fantasy": {
      name: "Klassisk fantasy",
      values: [
        [
          "Styrka",
          "Vinner fysiska dueller, bryter eller tvingar upp saker, skrämmer genom sin blotta närvaro och tröttnar sent i en strid.",
          "Förlorar fysiska dueller, orkar knappt bära eller tvinga något, blir snabbt andfådd och undviks i en rak strid.",
        ],
        [
          "Smidighet",
          "Rör sig snabbt och precist, väjer eller fångar saker på reflex och är bra på balans och finmotorik.",
          "Klumpig, långsam i reaktionen, tappar saker och förlorar lätt fotfästet.",
        ],
        [
          "Intelligens",
          "Ser detaljer som andra missar, löser gåtor och läser situationer snabbt och uttrycker sig exakt.",
          "Missar uppenbara ledtrådar, har svårt med planer i flera steg och tar saker som de ser ut.",
        ],
        [
          "Visdom",
          "Läser människors verkliga avsikter, ger råd som visar sig vara rätt och håller huvudet kallt under press.",
          "Missbedömer människor och lägen, får panik eller stelnar under press och ger råd som slår tillbaka.",
        ],
        [
          "Karisma",
          "Vinner människor, håller ett rum och får en begäran att kännas rimlig.",
          "Pratar förbi folk, är lätt att avfärda och har svårt att samla någon.",
        ],
        [
          "Närstrid",
          "Slår hårt och ofta med blad, yxa eller bara händerna och står stadigt i ett slagsmål.",
          "Svingar vilt, blir lätt avväpnad och gör bäst i att hålla sig undan en strid.",
        ],
        [
          "Avstånd",
          "Träffar det de siktar på med båge, slunga eller kastkniv, även på avstånd.",
          "Missar oftare än de träffar och träffar lika gärna en vän.",
        ],
      ],
    },
    "example-ruleset-closeness": {
      name: "Förtroende",
      values: [
        ["Trygghet", "{{char}} kan förbli öppen mot spelaren.", "{{char}} håller avstånd."],
        [
          "Misstänksamhet",
          "{{char}} håller spelaren under uppsikt och håller inne med saker.",
          "{{char}} svarar fritt på frågor.",
        ],
        [
          "Värme",
          "{{char}} är bekväm med en hand på axeln eller en kram från spelaren.",
          "{{char}} håller fysiskt avstånd.",
        ],
      ],
    },
    "example-ruleset-scifi": {
      name: "Sci-fi",
      values: [
        [
          "Teknik",
          "Reparerar, hackar och böjer maskiner efter sin vilja.",
          "Är vilsen bland maskiner och förstör det de rör vid.",
        ],
        [
          "Pilotering",
          "Flyger vad som helst med stadig hand, i en docka eller mitt i en eldstrid.",
          "Bör inte få spakarna.",
        ],
        [
          "Vetenskap",
          "Förstår hur saker fungerar och ser det som inte stämmer.",
          "Tar instrumentens utslag på god tro.",
        ],
        [
          "Sinnesnärvaro",
          "Håller sig lugn när larmen går och beslut kostar liv.",
          "Stelnar eller brister när trycket stiger.",
        ],
        [
          "Närstrid",
          "Slåss bra på nära håll, med vapen eller bara händerna.",
          "Slåss dåligt på nära håll och bör undvika det.",
        ],
        [
          "Avstånd",
          "Träffar det de siktar på med pistol eller gevär, även över ett däck.",
          "Missar oftare än de träffar och är en fara för besättningen.",
        ],
      ],
    },
    "example-ruleset-noir": {
      name: "Noir",
      values: [
        [
          "Iakttagelse",
          "Ser detaljen som avslöjar en lögnare: en fläck, ett fel ord, ett tänt fönster.",
          "Går förbi ledtråden och tror på den första historien de hör.",
        ],
        [
          "Övertalning",
          "Får folk att berätta mer än de tänkt.",
          "Blir avfärdad, ljugen för och visad på dörren.",
        ],
        [
          "Kontakter",
          "Känner någon på varje bar, polisstation och bakkontor.",
          "Är främling överallt och har ingen att ringa.",
        ],
        [
          "Nerver",
          "Behåller en neutral min med ett vapen i rummet och ett hot i luften.",
          "Svettas, staplar sina ord och avslöjar sig själv.",
        ],
        [
          "Närstrid",
          "Slåss bra på nära håll, med vapen eller bara händerna.",
          "Slåss dåligt på nära håll och bör undvika det.",
        ],
        [
          "Avstånd",
          "Träffar det de siktar på, även på avstånd.",
          "Missar oftare än de träffar på avstånd.",
        ],
      ],
    },
    "example-ruleset-horror": {
      name: "Skräck",
      values: [
        [
          "Mod",
          "Går vidare när något rör sig i mörkret.",
          "Flyr, stelnar eller skriker vid första tecknet.",
        ],
        [
          "Iakttagelse",
          "Hör steget i trappan och ser vad som är fel i rummet.",
          "Märker det för sent.",
        ],
        [
          "Smidighet",
          "Smiter undan, klättrar, gömmer sig och kommer ut i tid.",
          "Är långsam, högljudd och lätt att ta.",
        ],
        [
          "Styrka",
          "Tvingar upp en dörr, släpar en kropp, håller fast.",
          "Övermannas av nästan vad som helst.",
        ],
        [
          "Förnuft",
          "Håller fast vid vad som är verkligt, även efter det de sett.",
          "Ser saker som inte finns och kan inte lita på sitt eget förstånd.",
        ],
        [
          "Närstrid",
          "Slår tillbaka när de är trängda, med vad som finns till hands.",
          "Att slåss hjälper minst av allt; att fly är bättre.",
        ],
      ],
    },
    "example-ruleset-cozy": {
      name: "Mysig",
      values: [
        [
          "Omtanke",
          "Märker vem som behöver en hjälpande hand, ett ord eller en kopp te.",
          "Menar väl men missar vad andra behöver.",
        ],
        [
          "Nyfikenhet",
          "Ställer frågan som öppnar en berättelse och hittar det som var gömt.",
          "Låter saker vara, och det gömda förblir gömt.",
        ],
        [
          "Händighet",
          "Bakar, lagar och gör saker som blir bra.",
          "Bränner brödet och tappar koppen, med gott humör.",
        ],
        [
          "Lugn",
          "Stillar ett rum och tar udden av ett gräl.",
          "Fjantar, har bråttom och rör upp saker.",
        ],
        [
          "Humor",
          "Får folk att skratta, även en grå dag.",
          "Skämtet faller platt, på ett vänligt sätt.",
        ],
      ],
    },
    "example-ruleset-romance": {
      name: "Romantik",
      values: [
        [
          "Charm",
          "Får folk att känna sig sedda och vilja ha mer av deras sällskap.",
          "Är besvärlig och förbisedd på festen.",
        ],
        [
          "Empati",
          "Läser det som menas bakom det som sägs.",
          "Missar antydan och säger fel sak vid fel tillfälle.",
        ],
        [
          "Humor",
          "Bryter isen och gör en stilla stund lätt.",
          "Skämtet faller platt, och tystnaden efteråt är lång.",
        ],
        [
          "Mod",
          "Säger vad de känner och tar första steget.",
          "Väntar, antyder och låter ögonblicket passera.",
        ],
        [
          "Ärlighet",
          "Är rak om vad de vill och vad de har gjort.",
          "Gömmer sig bakom halvsanningar, och det syns.",
        ],
      ],
    },
    "example-ruleset-reality": {
      name: "Verkligheten",
      values: [
        [
          "Styrka",
          "Lyfter, trycker och håller det andra inte klarar.",
          "Har svårt med allt tungt.",
        ],
        ["Smidighet", "Snabb, stadig och bra med händerna.", "Långsam, klumpig och tappar saker."],
        [
          "Intelligens",
          "Listar ut saker och lär sig fort.",
          "Behöver få saker förklarade två gånger.",
        ],
        ["Karisma", "Får gehör och blir trodd.", "Blir överröstad och ignorerad."],
        ["Uthållighet", "Fortsätter när andra ger upp.", "Tröttnar snabbt och ger upp tidigt."],
        [
          "Närstrid",
          "Slåss bra på nära håll, med vapen eller bara händerna.",
          "Slåss dåligt på nära håll och bör undvika det.",
        ],
      ],
    },
  },
  nb: {
    "example-ruleset-fantasy": {
      name: "Klassisk fantasy",
      values: [
        [
          "Styrke",
          "Vinner fysiske dueller, bryter eller tvinger opp ting, skremmer med sin blotte tilstedeværelse og blir sent sliten i en kamp.",
          "Taper fysiske dueller, orker knapt å bære eller tvinge noe, blir fort andpusten og unngås i en rett kamp.",
        ],
        [
          "Smidighet",
          "Beveger seg raskt og presist, unngår eller fanger ting på refleks og er flink til balanse og finmotorikk.",
          "Klønete, treg i reaksjonen, mister ting og mister lett fotfestet.",
        ],
        [
          "Intelligens",
          "Ser detaljer andre overser, løser gåter og leser situasjoner raskt og uttrykker seg presist.",
          "Overser åpenbare spor, har problemer med planer i flere trinn og tar ting for pålydende.",
        ],
        [
          "Visdom",
          "Leser menneskers sanne hensikter, gir råd som viser seg å stemme og holder hodet kaldt under press.",
          "Feilvurderer mennesker og situasjoner, får panikk eller stivner under press og gir råd som slår tilbake.",
        ],
        [
          "Karisma",
          "Vinner folk, holder et rom og får en forespørsel til å virke rimelig.",
          "Snakker forbi folk, er lett å avfeie og har vansker med å samle noen.",
        ],
        [
          "Nærkamp",
          "Slår hardt og ofte med blad, øks eller bare hendene og står støtt i et slagsmål.",
          "Svinger vilt, blir lett avvæpnet og gjør best i å holde seg unna en kamp.",
        ],
        [
          "Avstand",
          "Treffer det de sikter på med bue, slynge eller kastekniv, selv på avstand.",
          "Bommer oftere enn de treffer og treffer like gjerne en venn.",
        ],
      ],
    },
    "example-ruleset-closeness": {
      name: "Tillit",
      values: [
        ["Trygghet", "{{char}} kan være åpen mot spilleren.", "{{char}} holder avstand."],
        [
          "Mistenksomhet",
          "{{char}} følger nøye med på spilleren og holder ting tilbake.",
          "{{char}} svarer fritt på spørsmål.",
        ],
        [
          "Varme",
          "{{char}} er komfortabel med en hånd på skulderen eller en klem fra spilleren.",
          "{{char}} holder fysisk avstand.",
        ],
      ],
    },
    "example-ruleset-scifi": {
      name: "Sci-fi",
      values: [
        [
          "Teknikk",
          "Reparerer, hacker og bøyer maskiner etter sin vilje.",
          "Er hjelpeløs blant maskiner og ødelegger det de tar i.",
        ],
        [
          "Pilotering",
          "Flyr hva som helst med stø hånd, i en dokk eller midt i en ildkamp.",
          "Bør ikke få spakene.",
        ],
        [
          "Vitenskap",
          "Forstår hvordan ting fungerer og ser det som ikke stemmer.",
          "Tar instrumentenes utslag for god fisk.",
        ],
        [
          "Fatning",
          "Holder seg rolig når alarmene går og valg koster liv.",
          "Stivner eller brister når presset øker.",
        ],
        [
          "Nærkamp",
          "Slåss godt på kloss hold, med våpen eller bare hendene.",
          "Slåss dårlig på kloss hold og bør unngå det.",
        ],
        [
          "Avstand",
          "Treffer det de sikter på med pistol eller gevær, selv over et dekk.",
          "Bommer oftere enn de treffer og er en fare for mannskapet.",
        ],
      ],
    },
    "example-ruleset-noir": {
      name: "Noir",
      values: [
        [
          "Observasjon",
          "Ser detaljen som avslører en løgner: en flekk, et feil ord, et opplyst vindu.",
          "Går forbi sporet og tror på den første historien de hører.",
        ],
        [
          "Overtalelse",
          "Får folk til å fortelle mer enn de hadde tenkt.",
          "Blir avfeid, løyet for og vist døren.",
        ],
        [
          "Kontakter",
          "Kjenner noen i hver bar, politistasjon og bakrom.",
          "Er fremmed overalt og har ingen å ringe.",
        ],
        [
          "Nerver",
          "Beholder et rolig ansikt med et våpen i rommet og en trussel i lufta.",
          "Svetter, staver og røper seg selv.",
        ],
        [
          "Nærkamp",
          "Slåss godt på kloss hold, med våpen eller bare hendene.",
          "Slåss dårlig på kloss hold og bør unngå det.",
        ],
        [
          "Avstand",
          "Treffer det de sikter på, selv på avstand.",
          "Bommer oftere enn de treffer på avstand.",
        ],
      ],
    },
    "example-ruleset-horror": {
      name: "Skrekk",
      values: [
        [
          "Mot",
          "Går videre når noe rører seg i mørket.",
          "Flykter, stivner eller skriker ved første tegn.",
        ],
        [
          "Observasjon",
          "Hører steget i trappen og ser hva som er galt i rommet.",
          "Merker det for sent.",
        ],
        [
          "Smidighet",
          "Smetter unna, klatrer, gjemmer seg og kommer seg ut i tide.",
          "Er treg, høylytt og lett å ta.",
        ],
        [
          "Styrke",
          "Tvinger opp en dør, drar en kropp, holder fast.",
          "Overmannes av nesten hva som helst.",
        ],
        [
          "Fornuft",
          "Holder fast ved det som er virkelig, selv etter det de har sett.",
          "Ser ting som ikke finnes og kan ikke stole på sin egen fornuft.",
        ],
        [
          "Nærkamp",
          "Slår tilbake når de er trengt opp i et hjørne, med det som er for hånden.",
          "Å slåss hjelper minst av alt; å flykte er bedre.",
        ],
      ],
    },
    "example-ruleset-cozy": {
      name: "Koselig",
      values: [
        [
          "Omtanke",
          "Merker hvem som trenger en hjelpende hånd, et ord eller en kopp te.",
          "Mener det godt, men overser hva andre trenger.",
        ],
        [
          "Nysgjerrighet",
          "Stiller spørsmålet som åpner en historie og finner det som var skjult.",
          "La ting være, og det skjulte forblir skjult.",
        ],
        [
          "Håndlag",
          "Baker, reparerer og lager ting som blir bra.",
          "Brenner brødet og mister koppen, med godt humør.",
        ],
        [
          "Ro",
          "Roer et rom og tar brodden av en krangel.",
          "Surrer, har det travelt og rører opp i ting.",
        ],
        [
          "Humor",
          "Får folk til å le, selv på en grå dag.",
          "Spøken faller flat, på en vennlig måte.",
        ],
      ],
    },
    "example-ruleset-romance": {
      name: "Romantikk",
      values: [
        [
          "Sjarm",
          "Får folk til å føle seg sett og ønske mer av selskapet deres.",
          "Er keitete og oversett i selskapet.",
        ],
        [
          "Empati",
          "Leser det som menes bak det som sies.",
          "Overser hintet og sier feil ting til feil tid.",
        ],
        [
          "Humor",
          "Bryter isen og gjør en stille stund lett.",
          "Spøken faller flat, og stillheten etterpå er lang.",
        ],
        [
          "Mot",
          "Sier hva de føler og tar det første steget.",
          "Venter, antyder og lar øyeblikket gå forbi.",
        ],
        [
          "Ærlighet",
          "Er rett fram om hva de vil og hva de har gjort.",
          "Gjemmer seg bak halvsannheter, og det synes.",
        ],
      ],
    },
    "example-ruleset-reality": {
      name: "Virkeligheten",
      values: [
        ["Styrke", "Løfter, skyver og holder det andre ikke klarer.", "Har vansker med alt tungt."],
        ["Smidighet", "Rask, stø og flink med hendene.", "Treg, klønete og mister ting."],
        ["Intelligens", "Finner ut av ting og lærer fort.", "Må få ting forklart to ganger."],
        ["Karisma", "Får gehør og blir trodd.", "Blir overdøvet og ignorert."],
        ["Utholdenhet", "Fortsetter når andre gir opp.", "Blir fort sliten og gir opp tidlig."],
        [
          "Nærkamp",
          "Slåss godt på kloss hold, med våpen eller bare hendene.",
          "Slåss dårlig på kloss hold og bør unngå det.",
        ],
      ],
    },
  },
};

/** The same rule-set with its name and the names and meanings of its values in the language. */
export function localizeRuleset(set: RulesetTemplate, language: ExampleLanguage): RulesetTemplate {
  if (language === "en") return set;
  const text = EXAMPLE_RULESET_TEXTS[language][set.id];
  if (!text) return set;
  return {
    ...set,
    name: text.name,
    attributes: set.attributes.map((attribute, index) => {
      const value = text.values[index];
      if (!value) return attribute;
      const [name, highMeaning, lowMeaning] = value;
      return { ...attribute, name, highMeaning, lowMeaning };
    }),
  };
}
