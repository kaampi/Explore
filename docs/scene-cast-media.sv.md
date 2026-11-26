# Beslut: personer, bild och ljud i en scen

Förslag 26 november 2026. Godkänt av Astra med tre svar (se "Beslut från Astra"), och förtydligat före kodstart. Gäller Storyboard, spelmotorn och spelvyn (Claude-spåret, Sonnet bygger) och det gemensamma formatet som guiden (Sol) sedan använder.

## Namnen

Två begrepp hålls isär, och bara de här namnen används i båda besluten:

- **`stance`:** personens inställning till spelaren: `friendly` (vänlig), `neutral` eller `hostile` (fientlig).
- **`relation`:** personens relationsvärden mot spelaren: `trust` (förtroende), `familiarity` (bekantskap) och `tension` (spänning). Se `outcome-values.sv.md`.

Ett fält som heter `attitude` finns inte längre i något beslut.

## Vad som ska gå

För varje scen, öppningen och senare scener på samma sätt, ska författaren kunna ange:

- **vilka personer som finns i scenen**, och för var och en:
  - position: var i scenen personen är
  - synlighet när scenen börjar: synlig eller dold, och vilket utfall av en handling som avslöjar en dold person
  - sinnesstämning: till exempel glad, ledsen, rädd eller lugn
  - inställning till spelaren: `stance`
- **scenens bild och ljud:**
  - en bakgrundsbild och ett bakgrundsljud, eller ingen bild eller inget ljud
  - ljud som spelas när spelaren gör något eller upptäcker något.

Allt gäller bara den scenen. Befintliga äventyr fungerar som i dag.

## Det som redan finns

| Behov | Finns i dag | Var |
| --- | --- | --- |
| Personer i en scen | ja, som lista | `CampaignScene.people` (`SceneCastSchema`) och personerna i scenens motor (`encounter.state.actors`) |
| Position | ja, namngivna positioner i scenen | motorns platser. Personen står på en plats-ID (`actor.position`). `SceneCast.position` är namnet som Sol eller författaren skriver. |
| Sinnesstämning per scen | ja, fritext | `SceneCast.mood`. Den når redan spelet via `moodsFor` i `adventureStart.ts`. |
| Inställning | neutral eller fientlig | motorn, via att personen är motståndare (`setAttitude` i `sceneParts.ts`) |
| Fientlig person som avvaktar | ja, som standard | strid börjar bara när spelaren anfaller eller när en följd har effekten `start-combat` |
| Relationsvärden | ja, men tappas när ett äventyr startar | `SceneCast.trust` med flera, se `outcome-values.sv.md` |
| Något som är dolt tills en upptäckt | ja, för föremål | `items[].requiresFlags` och `itemRevealed` i `itemVisibility.ts` |
| Bild och ljud | bara på platsen (och rum och värld som reserv) | `PlaceTemplate.imageDataUrl`, `audioDataUrl`, `sceneBackdrop`, `PlaceAudio` |
| Ljud vid en handling | nej | |
| Dold person | nej | |

Förslaget återanvänder allt i tabellen och lägger bara till det som saknas.

## Upptäckter: en gemensam mekanism

En dold person och ett ljud vid en upptäckt utlöses av **en fakta som blir satt**. Faktan sätts av en handling eller en följd, till exempel "Undersök taket", eller av något annat som sätter fakta, som en koppling eller en cut-scene.

I Storyboard väljer författaren **en handling och ett utfall**, inte en fakta: "Upptäcks när spelaren: [Undersök taket ▾] [lyckas ▾]". Storyboard ser till att det utfallet sätter en fakta (och lägger till en om den saknas). Den som vill kan välja en fakta direkt.

**Upptäckt och synlighet är olika saker:**
- **Synlig** betyder att personen finns för spelaren just nu.
- **Upptäckt** är händelsen när faktan sätts, och den sker **en gång**.
- Ett **misslyckat försök** sätter inte faktan. Då förblir personen dold och tyst, och ingen notis eller ljud spelas.

## Personerna

### Formatet

`SceneCastSchema` är formatet som både Storyboard och guiden skriver. Nya fält är valfria.

```ts
SceneCast = {
  characterId: string;
  position: string;          // finns: positionens namn, till exempel "Vid dörren", "I taket"
  positionId?: string;       // nytt: positionens stabila ID i motorn, se "Positionen"
  mood: string;              // finns: fritext, till exempel "ledsen"
  clothing, holding, trust, familiarity, tension;   // finns, oförändrade
  // trust, familiarity, tension: finns idag. Heter "relation" i beslutet om utfall (outcome-values.sv.md).

  stance?: "friendly" | "neutral" | "hostile";      // nytt: inställning till spelaren
  hidden?: { revealedBy: string };                  // nytt: dold tills den här faktan är satt
  onReveal?: "wait" | "attack";                     // nytt: vad en fientlig person gör när den upptäcks
};
```

**Positionen.** Sol kan skriva "I taket", och författaren kan döpa om den. Efter att positionen har skapats är det dess ID som gäller:
- När scenen sparas letar Storyboard upp positionen efter ID om `positionId` finns, annars efter namnet. Saknas båda skapas en ny position, och dess ID skrivs i `positionId`.
- Att döpa om positionen ändrar bara namnet. Personen står kvar på samma ID.
- Exempel: Spindeln står på positionen "I taket". Författaren döper den om till "Bland takbjälkarna". Efter sparande och återöppning står spindeln fortfarande där, och namnet visas som "Bland takbjälkarna".
- Motorn använder `actor.position`, som redan är ett ID. Storyboard håller namnet i takt med ID:t.

**`stance`:**
- `hostile` gör personen till motståndare i motorn, som `setAttitude` gör i dag.
- `friendly` och `neutral` är båda icke-fientliga i motorn.
- **Startvärdet för förtroende** gäller bara när en person läggs till eller när författaren sätter inställningen för första gången. En ny vänlig person får förtroende **60** som förslag, och en ny neutral person **20**. Storyboard föreslår värdet, men författaren kan ändra det. Att ändra `stance` senare ändrar **aldrig** förtroendet av sig självt. Om författaren vill ha det föreslagna värdet, väljer hen det uttryckligen.
- Saknas fältet, läses inställningen från motorn som i dag: fientlig om personen är motståndare, annars neutral.

**`hidden`:** personen är dold tills faktan i `revealedBy` är satt. Saknas fältet är personen synlig.

**`onReveal`** gäller bara en fientlig, dold person. `wait` (förval) betyder att den avvaktar efter upptäckten, och spelaren väljer vad hen gör. `attack` betyder att striden börjar **vid upptäckten, i samma handling**. Det finns ingen automatisk attack när scenen börjar. Det kan läggas till senare som `onArrival`.

### I motorn

Personen i scenens motor (`ActorSchema`) får två valfria fält, som speglar föremålens dolda läge:

```ts
requiresFlags?: string[];   // dold tills alla är satta, som items[].requiresFlags
onReveal?: "attack";
```

Storyboard håller dem i takt med `SceneCast`, på samma sätt som position och inställning i dag.

### Vad "dold" betyder i spelet

En dold person finns inte för spelaren förrän den upptäcks:

- Den syns inte i listan över personer i spelvyn och inte i "I scenen".
- Den nämns inte i scenbeskrivningen eller i det som skickas till berättande AI. Den genererade texten, personlistan och handlingsförslagen utelämnar den.
- Inga handlingar som gäller personen erbjuds, och den går inte att anfalla eller tala med.
- Den deltar inte i en strid som börjar av något annat skäl.

**När faktan sätts** (en gång):
- Personen visas, med en notis: "Du upptäcker: Jättespindeln."
- Ett ljud vid upptäckt spelas, om det finns och spelaren har ljudet på.
- Följdens text berättar vad som händer.
- Med `onReveal: "attack"` börjar striden i samma handling. Annars avvaktar personen.

**När spelaren kommer tillbaka** till scenen, eller spelet öppnas på nytt, efter att faktan redan är satt:
- Personen är **synlig**, utan notis, utan skrap och utan ny attack.
- Om personen var fientlig och avvaktade, avvaktar den fortfarande.
- Om striden redan pågick, fortsätter den som den gjorde, och startas inte om.

**Författarens egen text.** Det som författaren själv skriver i scenens ankomsttext eller i en beskrivning är författarens val, och spelet visar den. Storyboard **varnar** när en dold persons namn finns i en sådan text medan personen är dold vid scenens start, och ändrar inte texten:
- "Ankomsttexten nämner Jättespindeln, som är dold när scenen börjar. Ändra texten, eller låt personen synas från början."
- Författaren kan spara texten som den är efter att ha sett varningen, eller ändra den. Det är alltid författarens val.

### I Storyboard

I scenens inspektör finns avsnittet **Personer i scenen**. Varje person har en rad:

- position: en lista över scenens positioner, och "Ny position …"
- synlighet: "Synlig" eller "Dold tills: [Undersök taket ▾] [lyckas ▾]"
- sinnesstämning: fritext med förslag
- inställning: Vänlig, Neutral eller Fientlig. Vid första val föreslås förtroende 60 respektive 20.
- för en fientlig, dold person: "Vid upptäckt: [Avvaktar ▾ | Anfaller]"
- styrka, som i dag.

"Lägg till person" väljer ur biblioteket. Raden är densamma i öppningen och i senare scener.

## Bild och ljud

### Formatet

`CampaignSceneSchema` får ett valfritt fält:

```ts
media?: {
  image?: { use: "place" } | { use: "none" } | { use: "own"; imageDataUrl: string; thumbDataUrl: string };
  ambient?: { use: "place" } | { use: "none" } | { use: "own"; audioDataUrl: string };
  cues?: {
    id: string;
    label: string;           // "Spindelns skrap", för författaren
    audioDataUrl: string;
    playsWhen: string;       // faktan som utlöser ljudet
  }[];
};
```

- **Saknas `media`, eller `image` eller `ambient`,** används det som scenen ärver: platsens bild och ljud, och för ett namngivet rum utan egen bild, rummets reserv på platsen och världen, precis som i dag.
- **`use: "none"`** är det enda som stänger av ett ärvt val. Det betyder ingen bild eller inget ljud i den här scenen, även om platsen har det.
- **`use: "own"`** gäller bara den här scenen. Platsen ändras inte.
- **`ambient`** börjar när spelaren kommer in i scenen och loopar, som platsens ljud i dag.
- **`cues`** spelas en gång, när faktan i `playsWhen` blir satt medan spelaren är i scenen. Ett ljud som redan har spelats spelas inte igen när spelet öppnas på nytt. Därför sparas de spelade ljudens id i spelomgången.
- **Ljud i äventyret:** ljuden sparas i äventyret som data, som platsernas ljud i dag. Det gör att regnet och skrapet följer med när äventyret flyttas, och att de kan spelas offline. Ett gemensamt ljudbibliotek kan komma senare.

### I Storyboard

I scenens inspektör finns avsnittet **Bild och ljud**:

- **Bild:** "Platsens bild (Värdshuset)", "Egen bild" eller "Ingen bild". Det som scenen använder visas som miniatyr, med varifrån det kommer. Saknar platsen bild står det "Platsen har ingen bild".
- **Ljud när spelaren kommer in:** samma tre val, med en knapp för att förhandslyssna.
- **Ljud vid handling eller upptäckt:** en lista med rader: "[Spindelns skrap] när spelaren: [Undersök taket ▾] [lyckas ▾]", med förhandslyssning. "Lägg till ljud" lägger till en rad.

Förhandsvisningen spelar bara i Storyboard och följer spelvyns val för ljudnivå och tyst läge.

### I spelet

- Bilden och bakgrundsljudet väljs med `media` först, sedan platsen (och för ett rum, världen), som `sceneBackdrop` gör i dag.
- **Ett ljud vid upptäckt spelas ovanpå bakgrundsljudet**, även om bakgrundsljudet är regnet. Det tystar inte regnet. Det följer ljudnivån för bakgrundsljudet och tyst läge: är ljudet av, hörs inget skrap.

## Formatet för guiden

Det här är fälten som Sol kan skriva när guiden placerar personer och väljer bild och ljud. Storyboard kan sedan redigera allt.

| Fält | Värden | Saknas |
| --- | --- | --- |
| `SceneCast.characterId` | bibliotekskaraktärens id | krävs |
| `SceneCast.position` | positionens namn, fritext | personen står där spelaren börjar |
| `SceneCast.mood` | fritext | karaktärens vanliga humör |
| `SceneCast.stance` | `"friendly"`, `"neutral"`, `"hostile"` | neutral |
| `SceneCast.hidden.revealedBy` | en fakta i äventyret, satt av ett utfall | synlig |
| `SceneCast.onReveal` | `"wait"`, `"attack"` | `"wait"` |
| `CampaignScene.media.image` | `{ use: "place" }`, `{ use: "none" }`, `{ use: "own", … }` | platsens bild |
| `CampaignScene.media.ambient` | samma | platsens ljud |
| `CampaignScene.media.cues[]` | `{ id, label, audioDataUrl, playsWhen }` | inga |

Personerna hamnar i den scen där de placeras, öppningen eller en senare scen. Det ersätter dagens regel där alla guidens personer hamnar i öppningen (`buildGuideAdventure.ts`, rad 242–254). Guiden lägger en person i en scen bara när den är placerad där. Hur guiden frågar är Sols beslut.

## Befintliga äventyr

- Inga av de nya fälten krävs. Ett äventyr utan dem spelas exakt som i dag.
- **En befintlig fientlig person förblir fientlig.** När `stance` saknas är motorn källan: en motståndare är fientlig, och en annan är neutral. Storyboard skriver inte `stance` för befintliga personer förrän författaren ändrar dem.
- **Befintliga förtroendevärden ändras inte.** Ett förtroende som står som `20` är det värde författaren eller guiden har sparat, och det ändras inte av att en person får en `stance`.
- Bild och ljud kommer från platsen när `media` saknas.
- Formatregeln i `ownership.sv.md` gäller: kod som sparar om ett äventyr behåller fälten.

## Acceptansprov

**Personer:**
1. Värdshuset har Emma vid dörren: synlig, ledsen och vänlig. I taket finns en jättespindel: lugn, fientlig och dold tills "Undersök taket" lyckas.
2. När spelaren kommer in syns Emma. Varken personlistan, scenbeskrivningen, det som skickas till AI eller handlingsförslagen nämner spindeln.
3. Spelaren väljer "Undersök taket" och lyckas. Spindeln visas, med en notis, och skrapet hörs en gång.
4. Spelaren väljer "Undersök taket" och misslyckas. Spindeln förblir dold, och ingen notis eller ljud spelas.
5. Med "Vid upptäckt: Avvaktar" börjar ingen strid, och spelaren kan välja nästa handling. Med "Anfaller" börjar striden i samma handling som upptäckten.
6. Spelaren lämnar scenen efter upptäckten och kommer tillbaka: spindeln syns utan notis, utan skrap och utan ny attack.
7. Spelet öppnas på nytt efter upptäckten: samma som punkt 6.
8. Positionen "I taket" döps om till "Bland takbjälkarna". Efter sparande och återöppning står spindeln kvar där.
9. Författaren skriver "En jättespindel sitter i taket" i ankomsttexten medan spindeln är dold. Storyboard varnar och ändrar inte texten. Författaren kan spara texten efter att ha sett varningen.
10. Inget av det genererade underlaget (personlista, scenbeskrivning, AI, handlingsförslag) nämner spindeln, även när punkt 9 gäller. Det är författarens text som visar namnet, inte spelet.

**Bild och ljud:**
11. När spelaren kommer in syns värdshusets bild och regnet hörs.
12. Först när spelaren väljer "Undersök taket" och lyckas hörs spindelns skrap, en gång.
13. En scen med "Ingen bild" och "Inget ljud" visar ingen bild och spelar inget ljud, fast platsen har både och.
14. En egen bild på en scen ändrar inte platsens bild eller andra scener på samma plats.
15. Ett namngivet rum utan egen bild visar platsens bild, och världens bild om platsen saknar en. Ingen bild i rummet stänger av den ärvda bilden.
16. En plats som använder världens bild får världens bild i en scen som inte har någon egen.
17. Bakgrundsregnet hörs under hela scenen, även när skrapet spelas vid upptäckten. Med ljudet avstängt hörs inget skrap.

**Guiden:**
18. Sol skapar Emma i öppningen och spindeln först i scen två. Spara, öppna i Storyboard och spela båda scenerna. Emma står i öppningen, och spindeln finns inte i den scenen. I scen två är spindeln dold tills "Undersök taket" lyckas.

## Krav på tester

1. Ett äventyr utan de nya fälten spelas som i dag, och fälten finns kvar när guiden sparar om äventyret.
2. `stance` och motorns lag följs åt i båda riktningarna. En befintlig fientlig person förblir fientlig när `stance` saknas.
3. Förtroendets startvärde (60 för vänlig, 20 för neutral) gäller bara för en ny person eller första gången inställningen sätts, och ändras aldrig av att `stance` ändras senare.
4. En dold person finns inte i personlistan, scenbeskrivningen, AI-underlaget, handlingsförslagen eller striden förrän faktan är satt.
5. Ett misslyckat utfall sätter inte faktan, och personen förblir dold och tyst.
6. `onReveal: "attack"` startar striden i samma handling som upptäckten, och `wait` gör det inte.
7. Efter upptäckten: ingen ny notis, inget nytt skrap och ingen ny attack, även efter återinträde och efter att spelet öppnats på nytt.
8. `position` matchas med `positionId` när det finns, annars med namnet. En omdöpt position behåller sin person.
9. Upplysningen om en dold person som nämns i författarens egen ankomsttext, och texten ändras inte av Storyboard.
10. Bild och bakgrundsljud väljs i ordningen scen, rum, plats, värld, inget. `use: "none"` ger ingenting, och ingen bild i rummet stänger av den ärvda.
11. Ett ljud vid upptäckt spelas en gång när faktan sätts, ovanpå bakgrundsljudet, och inte igen efter att spelet har öppnats på nytt. Med ljudet avstängt hörs det inte.
12. Acceptansprov 1–18 som ett test som startar och spelar äventyret med motorn, och en provkörning i webbläsaren med skärmbilder.
13. Guideprovet (punkt 18) som ett eget test, med en guide-byggd äventyrsfil som sparas, öppnas i Storyboard och spelas.

## Byggordning

1. Motorn: dolda personer (`requiresFlags`, `onReveal`), var de filtreras bort, och positions-ID.
2. `SceneCast` med `stance`, `hidden`, `onReveal`, `positionId` och position som namn, och synken till motorn.
3. Storyboard: Personer i scenen, med varningen för författarens text.
4. `media`: valet av bild och bakgrundsljud i spelet, och ljud vid upptäckt.
5. Storyboard: Bild och ljud, med förhandsvisning.
6. Sol använder fälten i guiden, med guideprovet.

Stanna för provkörning i webbläsaren efter steg 3 och steg 5.

## Beslut från Astra

1. **Namnen.** `stance` för vänlig, neutral och fientlig. `relation` för förtroende, bekantskap och spänning. Samma namn används i båda besluten, och `attitude` tas bort.
2. **Ingen automatisk attack vid scenstart.** Det väntar. För spindeln räcker "Avvaktar" och "Anfaller" vid upptäckt.
3. **Ljud sparas i äventyret** i första versionen. Det gör att regnet och skrapet följer med när äventyret flyttas och kan spelas offline.
