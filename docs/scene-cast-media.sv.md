# Förslag: personer, bild och ljud i en scen

Förslag 26 november 2026, för avstämning med Astra innan något byggs. Gäller Storyboard, spelmotorn och spelvyn (Claude-spåret, Sonnet bygger) och det gemensamma formatet som guiden (Sol) sedan använder.

## Vad som ska gå

För varje scen, öppningen och senare scener på samma sätt, ska författaren kunna ange:

- **vilka personer som finns i scenen**, och för var och en:
  - position: var i scenen personen är
  - synlighet när scenen börjar: synlig eller dold, och vad som avslöjar en dold person
  - sinnesstämning: till exempel glad, ledsen, rädd eller lugn
  - inställning till spelaren: vänlig, neutral eller fientlig. En fientlig person kan avvakta.
- **scenens bild och ljud:**
  - en bakgrundsbild och ett bakgrundsljud, eller ingen bild eller inget ljud
  - ljud som spelas först när spelaren gör något eller upptäcker något.

Allt gäller bara den scenen. Befintliga äventyr fungerar som i dag.

## Det som redan finns

| Behov | Finns i dag | Var |
| --- | --- | --- |
| Personer i en scen | ja, som lista | `CampaignScene.people` (`SceneCastSchema`) och personerna i scenens motor (`encounter.state.actors`) |
| Position | ja, namngivna positioner i scenen | motorns platser i scenen, `setPersonPosition` i `sceneParts.ts`. `SceneCast.position` är en äldre fritext. |
| Sinnesstämning per scen | ja, fritext | `SceneCast.mood`. Den når redan spelet via `moodsFor` i `adventureStart.ts`. |
| Inställning | neutral eller fientlig | lag i motorn, `setAttitude` i `sceneParts.ts` |
| Fientlig person som avvaktar | ja, som standard | strid börjar bara när spelaren anfaller eller när en följd har effekten `start-combat` |
| Förtroende, bekantskap, spänning | ja, men tappas när ett äventyr startar | `SceneCast.trust` med flera, se `outcome-values.sv.md` |
| Något som är dolt tills en upptäckt | ja, för föremål | `items[].requiresFlags` och `itemRevealed` i `itemVisibility.ts` |
| Bild och ljud | bara på platsen (och rum och värld som reserv) | `PlaceTemplate.imageDataUrl`, `audioDataUrl`, `sceneBackdrop`, `PlaceAudio` |
| Ljud vid en handling | nej | |
| Dold person | nej | |

Förslaget återanvänder allt i tabellen och lägger bara till det som saknas.

## Upptäckter: en gemensam mekanism

En dold person och ett ljud vid en upptäckt utlöses på samma sätt: **av en fakta som blir satt**. Faktan sätts av en vanlig handling, till exempel "Undersök taket", eller av något annat som sätter fakta, som en koppling eller en cut-scene.

I Storyboard väljer författaren **en handling**, inte en fakta: "Upptäcks när spelaren: [Undersök taket ▾]". Storyboard ser till att handlingen sätter en fakta (och lägger till en om den saknas). Den som vill kan välja en fakta direkt.

## Personerna

### Formatet

`SceneCastSchema` är formatet som både Storyboard och guiden skriver. Nya fält är valfria.

```ts
SceneCast = {
  characterId: string;
  position: string;          // finns: positionens namn i scenen, till exempel "Vid dörren", "I taket"
  mood: string;              // finns: fritext, till exempel "ledsen"
  clothing, holding, trust, familiarity, tension;   // finns, oförändrade

  stance?: "friendly" | "neutral" | "hostile";      // nytt: inställning till spelaren
  hidden?: { revealedBy: string };                  // nytt: dold tills den här faktan är satt
  onReveal?: "wait" | "attack";                     // nytt: vad en fientlig person gör när den upptäcks
};
```

- **`position`** är positionens namn. När scenen sparas matchar Storyboard namnet mot scenens positioner i motorn, och skapar en ny position om namnet inte finns. Guiden kan alltså skriva "I taket" utan att känna till motorns positioner.
- **`mood`** är fritext på författarens språk. Storyboard erbjuder vanliga val som förslag: glad, ledsen, rädd, lugn, arg, nervös, trött.
- **`stance`:**
  - `hostile` gör personen till motståndare i motorn, som `setAttitude` gör i dag.
  - `friendly` och `neutral` är båda icke-fientliga i motorn. Skillnaden är förtroendet: `friendly` ger förtroende 60 som startvärde, och `neutral` 20, om författaren inte har ändrat förtroendet själv.
  - Saknas fältet läses inställningen från motorn som i dag: fientlig om personen är motståndare, annars neutral.
- **`hidden`:** personen är dold tills faktan i `revealedBy` är satt. Saknas fältet är personen synlig.
- **`onReveal`** gäller bara en fientlig, dold person. `wait` (förval) betyder att den fortsätter avvakta efter upptäckten. `attack` betyder att striden börjar när den upptäcks.

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
- Den nämns inte i scenbeskrivningen eller i det som skickas till berättande AI.
- Inga handlingar som gäller personen erbjuds, och den går inte att anfalla eller tala med.
- Den deltar inte i en strid som börjar av något annat skäl.

**När faktan sätts:**
- Personen visas, med en notis: "Du upptäcker: Jättespindeln."
- Följdens text berättar vad som händer.
- Med `onReveal: "attack"` börjar striden direkt efter följden. Annars avvaktar personen, och spelaren kan välja vad hen gör.

**Upplysning i Storyboard:** om scenens ankomsttext eller en beskrivning som inte kräver faktan nämner den dolda personens namn, visas: "Ankomsttexten nämner Jättespindeln, som är dold när scenen börjar." Kontrollen fungerar som `checkMentions`.

### I Storyboard

I scenens inspektör finns avsnittet **Personer i scenen**. Varje person har en rad:

- position: en lista över scenens positioner, och "Ny position …"
- synlighet: "Synlig" eller "Dold tills: [Undersök taket ▾]"
- sinnesstämning: fritext med förslag
- inställning: Vänlig, Neutral eller Fientlig
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

- **Saknas `media`, eller `image` eller `ambient`,** används platsens bild och ljud, precis som i dag.
- **`use: "none"`** betyder ingen bild eller inget ljud i den här scenen, även om platsen har det.
- **`use: "own"`** gäller bara den här scenen. Platsen ändras inte.
- **`ambient`** börjar när spelaren kommer in i scenen och loopar, som platsens ljud i dag.
- **`cues`** spelas en gång, när faktan i `playsWhen` blir satt medan spelaren är i scenen. Ett ljud som redan har spelats spelas inte igen när spelet öppnas på nytt. Därför sparas de spelade ljudens id i spelomgången.

### I Storyboard

I scenens inspektör finns avsnittet **Bild och ljud**:

- **Bild:** "Platsens bild (Värdshuset)", "Egen bild" eller "Ingen bild". Det som scenen använder visas som miniatyr, med varifrån det kommer. Saknar platsen bild står det "Platsen har ingen bild".
- **Ljud när spelaren kommer in:** samma tre val, med en knapp för att förhandslyssna.
- **Ljud vid handling eller upptäckt:** en lista med rader: "[Spindelns skrap] när spelaren: [Undersök taket ▾]", med förhandslyssning. "Lägg till ljud" lägger till en rad.

Förhandsvisningen spelar bara i Storyboard och följer spelvyns val för ljudnivå och tyst läge.

### I spelet

- Bilden och bakgrundsljudet väljs med `media` först, sedan platsen, som `sceneBackdrop` gör i dag.
- Ett ljud vid upptäckt spelas på samma ljudnivå som bakgrundsljudet, ovanpå det, och följer tyst läge.

## Formatet för guiden

Det här är fälten som Sol kan skriva när guiden placerar personer och väljer bild och ljud. Storyboard kan sedan redigera allt.

| Fält | Värden | Saknas |
| --- | --- | --- |
| `SceneCast.characterId` | bibliotekskaraktärens id | krävs |
| `SceneCast.position` | positionens namn, fritext | personen står där spelaren börjar |
| `SceneCast.mood` | fritext | karaktärens vanliga humör |
| `SceneCast.stance` | `"friendly"`, `"neutral"`, `"hostile"` | neutral |
| `SceneCast.hidden.revealedBy` | en fakta i äventyret | synlig |
| `SceneCast.onReveal` | `"wait"`, `"attack"` | `"wait"` |
| `CampaignScene.media.image` | `{ use: "place" }`, `{ use: "none" }`, `{ use: "own", … }` | platsens bild |
| `CampaignScene.media.ambient` | samma | platsens ljud |
| `CampaignScene.media.cues[]` | `{ id, label, audioDataUrl, playsWhen }` | inga |

Personerna hamnar i den scen där de placeras, öppningen eller en senare scen. Det ersätter dagens regel där alla guidens personer hamnar i öppningen (`buildGuideAdventure.ts`). Hur guiden frågar är Sols beslut.

## Befintliga äventyr

- Inga av de nya fälten krävs. Ett äventyr utan dem spelas exakt som i dag.
- Inställningen läses från motorn när `stance` saknas.
- Bild och ljud kommer från platsen när `media` saknas.
- Formatregeln i `ownership.sv.md` gäller: kod som sparar om ett äventyr behåller fälten.

## Acceptansprov

**Personer:**
1. Värdshuset har Emma vid dörren: synlig, ledsen och vänlig. I taket finns en jättespindel: lugn, fientlig och dold tills "Undersök taket".
2. När spelaren kommer in syns Emma. Varken personlistan, scenbeskrivningen, det som skickas till AI eller handlingsförslagen nämner spindeln.
3. Spelaren väljer "Undersök taket". Spindeln visas, med en notis.
4. Med "Vid upptäckt: Avvaktar" börjar ingen strid, och spelaren kan välja nästa handling. Med "Anfaller" börjar striden direkt.

**Bild och ljud:**
5. När spelaren kommer in syns värdshusets bild och regnet hörs.
6. Först när spelaren väljer "Undersök taket" hörs spindelns skrap, en gång.
7. En scen med "Ingen bild" och "Inget ljud" visar ingen bild och spelar inget ljud, fast platsen har både och.
8. En egen bild på en scen ändrar inte platsens bild eller andra scener på samma plats.

## Krav på tester

1. Ett äventyr utan de nya fälten spelas som i dag, och fälten finns kvar när guiden sparar om äventyret.
2. `stance` och motorns lag följs åt i båda riktningarna. Förtroendets startvärde följer `stance` bara när förtroendet inte är ändrat.
3. En dold person finns inte i personlistan, scenbeskrivningen, AI-underlaget, handlingsförslagen eller striden förrän faktan är satt.
4. `onReveal: "attack"` startar striden vid upptäckten, och `wait` gör det inte.
5. `position` som namn matchar en befintlig position eller skapar en ny.
6. Upplysningen om en dold person som nämns i ankomsttexten.
7. Bild och bakgrundsljud väljs i ordningen scen, plats, inget. `use: "none"` ger ingenting.
8. Ett ljud vid upptäckt spelas en gång när faktan sätts, och inte igen efter att spelet har öppnats på nytt.
9. Acceptansproven 1–8 som ett test som startar och spelar äventyret med motorn, och en provkörning i webbläsaren med skärmbilder.

## Byggordning

1. Astra stämmer av formatet.
2. Motorn: dolda personer (`requiresFlags`, `onReveal`), och var de filtreras bort.
3. `SceneCast` med `stance`, `hidden`, `onReveal` och position som namn, och synken till motorn.
4. Storyboard: Personer i scenen.
5. `media`: valet av bild och bakgrundsljud i spelet, och ljud vid upptäckt.
6. Storyboard: Bild och ljud, med förhandsvisning.
7. Sol använder fälten i guiden.

Stanna för provkörning i webbläsaren efter steg 4 och steg 6.

## Frågor till Astra

1. **Krock med `outcome-values.sv.md`:** där heter personens relationsvärden `attitude` (förtroende, bekantskap, spänning). Här heter inställningen `stance`. Föreslag: byt namnet i `outcome-values.sv.md` till `relation`, så att ingen blandar ihop dem. Inget av det är byggt än.
2. **Ska en fientlig person kunna anfalla direkt när scenen börjar,** utan upptäckt? Det är inte begärt nu och lätt att lägga till senare som `onArrival: "attack"`.
3. **Ljudfiler i äventyret:** ljuden sparas som data i äventyret, som platsernas ljud i dag. Det kan göra äventyret stort. Ett gemensamt ljudbibliotek kan komma senare. Räcker det för nu?
