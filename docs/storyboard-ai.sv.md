# Designbeslut: AI-hjälp i Storyboard

Beslutat 24 november 2026. Gäller hjälpen att bygga vidare på ett äventyr som redan finns: Fördjupa scenen, Fortsätt härifrån och Utveckla texten. Bygger på `ownership.sv.md`.

Underlag: skisserna *Storyboard · Fördjupa scenen* och *Storyboard · Fortsätt härifrån* på canvasen *Explore spelvy – skiss*, version 31.

## Varför

Många författare har ingen färdig plan. De börjar i guiden, provspelar och känner sedan att något behöver mer: ett delsteg, en förgrening eller en längre fortsättning. Då ska de få samma slags hjälp direkt i Storyboard, utan att börja om i guiden.

## Grundregler

1. **AI hjälper författaren, inte spelaren.** Allt som läggs till blir vanliga scener, handlingar, följder, föremål och texter. Motorn spelar dem utan AI. Det färdiga spelet kräver ingen modell, om inte författaren aktivt väljer att göra ett AI-spel. Det valet beslutas separat.
2. **AI föreslår, författaren väljer.** Ingenting sparas förrän författaren väljer "Lägg till". Varje förslag kan väljas, ändras eller avvisas för sig.
3. **Motorn kontrollerar, inte AI:n.** Om något går att nå, om en väg går förbi ett lås och om en text lovar något som saknas, avgörs av rena funktioner i motorn.
4. **Det fungerar utan AI.** Utan modell erbjuds färdiga mönster i stället för förslag från en modell, på samma sätt som guidens lokala uppslag.
5. **En lokal modell får små uppgifter.** Underlaget är scenen och dess grannar, sammanfattade av koden. Svaret har ett fast format, och högst tre förslag åt gången.

## De tre valen

| Val | Utgår från | Lägger till | Syns på ritytan |
| --- | --- | --- | --- |
| **Fördjupa scenen** | en markerad scen | handlingar, upptäckter, samtal, föremål och fakta i scenen | scenen öppnas, förslagen streckade och numrerade inne i den |
| **Fortsätt härifrån** | en markerad scen eller koppling | nya scener och kopplingar, eventuellt till scener som redan finns | streckade scener och kopplingar med bokstäver A–C |
| **Utveckla texten** | en text: ankomst, handling, följd eller replik | en ny version av samma text | före och efter i panelen, ingenting på ritytan |

**Ingångar:**
- När en scen är markerad visar Storyboards verktygsrad "Scenens namn: ✦ Fördjupa · ✦ Fortsätt härifrån · ⋯".
- Samma val finns i högerklicksmenyn på en scen och på en koppling.
- En text har ✦ på raden.
- Ett provspel har "Här vill jag mer", som öppnar Fördjupa eller Fortsätt vid den scen spelaren står i.

**Utveckla texten** har snabbvalen Mer utförlig, Kortare, Annan ton och Mer stämning, och en ruta för egna önskemål. "Mer utförlig" på en replik får bli ett kort utbyte: personen svarar, och spelaren får två val att svara med. Det gäller när skrivna samtal finns.

## Vem bygger vad

| Del | Spår |
| --- | --- |
| Panelen för alla tre val: önskemål, snabbval, förslagskort, Ändra/Avvisa, före och efter | ChatGPT |
| AI-anropen: underlaget, svarsformatet, fel och avbrott, mönster utan AI | ChatGPT |
| Att spara godkända förslag, med kontrollen av samtidiga ändringar | ChatGPT |
| Ingångarna: verktygsraden, menyerna, ✦ på texter, "Här vill jag mer" i provspel | Claude (Sonnet bygger) |
| Att rita förslagen streckade, framhäva en väg och placera nya scener | Claude |
| Ändringsformatet `AuthoringPatch` och `applyPatch` | Claude, granskas av båda |
| Motorns kontroller | Claude |

## Gränssnittet

Tre filer, med typerna samlade i den första:

- `src/library/authoringPatch.ts`: ändringsformatet och `applyPatch`. Ägs av Claude-spåret.
- `src/game/authoringChecks.ts`: kontrollerna. Ägs av Claude-spåret.
- `src/ui/studio/assist/`: panelen. Ägs av ChatGPT-spåret.

### Ändringsformatet

Ett förslag beskrivs som en ändring som bara lägger till eller ersätter text. Det tar aldrig bort något.

```ts
type TempId = `new:${string}`;            // en scen eller ett föremål som inte finns än
type SceneRef = string | TempId;

type AuthoringOp =
  | { op: "addScene"; tempId: TempId; name: string; placeId?: string; arrival: string }
  | { op: "addLink"; from: SceneRef; to: SceneRef; label: string; requires?: Requirement[] }
  | { op: "addAction"; sceneId: SceneRef; label: string; outcome: string;
      requires?: Requirement[]; gives?: { itemTempId?: TempId; itemId?: string; fact?: string }[] }
  | { op: "addItem"; tempId: TempId; name: string; description: string; inSceneId: SceneRef }
  | { op: "setText"; target: TextRef; text: string };

type TextRef =
  | { sceneId: string; field: "arrival" }
  | { sceneId: string; actionId: string; field: "label" | "outcome" };

type AuthoringPatch = { ops: AuthoringOp[] };

applyPatch(campaign, library, patch): { campaign, library, newSceneIds: string[] }
```

`Requirement` är en liten hjälptyp i `authoringPatch.ts`, till exempel en fakta eller ett föremål. `applyPatch` översätter den till fälten som redan finns i `EncounterSchema.ts`, som `requiresFlags` och barriärer. Formatet ska kunna uttrycka allt i skisserna och inget mer. Om något saknas i äventyrsformatet för att spara en ändring, gäller formatregeln i `ownership.sv.md`: ett förslag först, granskning, sedan bygge.

`TextRef` utökas med repliker när skrivna samtal finns.

### Storyboard öppnar panelen

```ts
openAssist({
  campaignId: string,
  intent: "deepen" | "continue" | "rewrite",
  target: { sceneId: string } | { linkId: string } | { text: TextRef },
  fromPlaytest?: { sceneId: string; carried: string[]; facts: string[]; turns: number },
});
```

### Panelen visar förslag på ritytan

Medan panelen är öppen skickar den en förhandsvisning varje gång förslagen eller valen ändras:

```ts
previewAssist(preview: {
  proposals: { key: string; selected: boolean; patch: AuthoringPatch }[];
  hoverKey?: string;
} | null);
```

- Storyboard kör `applyPatch` på en kopia i minnet och ritar skillnaden streckad. Valda förslag ritas i accentfärgen, de som inte är valda tonas ner, och `hoverKey` framhävs.
- `null` tar bort förhandsvisningen.
- Storyboard sparar aldrig något från förhandsvisningen.

**Förhandsvisningens livslopp:**

1. **Varje ny förhandsvisning ersätter den förra helt.** Storyboard slår inte ihop dem.
2. **När författaren avvisar alla förslag eller stänger panelen** skickar panelen `previewAssist(null)`, och de streckade markeringarna försvinner. Stängs panelen på något annat sätt tar Storyboard bort markeringarna vid `onAssistClose`.
3. **När författaren godkänner** sparar panelen. Storyboard gör ingenting förrän `onAssistClose` kommer med `changed: true`. Då läser Storyboard in det sparade äventyret, visar resultatet och tar bort förhandsvisningen i samma uppdatering, så att det inte blinkar.
4. **Om sparandet misslyckas** står förhandsvisningen kvar, och panelen visar felet och låter författaren försöka igen. Ingenting halvsparat visas som sparat.

### Panelen stängs

```ts
onAssistClose({
  changed: boolean,
  newSceneIds: string[],
  focus?: { sceneId: string } | { linkId: string },
});
```

Exakt ett anrop per `openAssist`. Panelen sparar med `applyPatch` och kontrollen av samtidiga ändringar innan den anropar `onAssistClose`. Storyboard läser då in äventyret igen och placerar `newSceneIds`.

### Placering

Den rena funktionen `placeNewScenes(cards, anchorSceneId, newIds)` finns i `storyboardArrange.ts`. Den används både för förhandsvisningen och efter sparandet, så att scenerna hamnar på samma ställe. Den lägger nya scener på rutnätet, på den sida av ankarscenen där det finns plats, och flyttar inga befintliga scener.

### Motorns kontroller

Rena funktioner som panelen anropar på varje förslag:

```ts
checkPatch(campaign, library, patch): Finding[]
// "unreachable"    något kräver det som bara finns bakom sig själv eller inte finns
// "bypassesLock"   en ny väg når en scen som annars kräver något
// "deadEnd"        en ny scen saknar väg ut och är inte ett slut
// "unusedFact"     en fakta sätts men används ingenstans (en upplysning, inget fel)

checkMentions(campaign, library, sceneId, text, mentions: string[]): Finding[]
// "missingThing"   texten nämner något som inte finns i scenen
```

`mentions` kommer från modellens svar: svarsformatet ska innehålla en lista över personer, föremål och platser som texten nämner. Kontrollen jämför listan med scenen och biblioteket. Utan modell lämnas listan tom.

Varje `Finding` har en mening skriven för författaren och, när det går, ett förslag på åtgärd. Exempel från skissen: "Den här vägen går förbi låset ’Kräver sigill’." Åtgärderna är "Luckan kräver också sigillet", "Genväg med avsikt" och "Kräver kartan".

## Krav på tester

`applyPatch` och kontrollerna:
1. Varje typ av ändring läggs till rätt, och fält som funktionen inte känner till följer med oförändrade.
2. `applyPatch` tar aldrig bort något.
3. `bypassesLock`, `unreachable` och `deadEnd` med exemplet från skissen: Vakttornet, Gillesalen och Kryptan.
4. `checkMentions` hittar en nyckel som nämns men inte finns, och klarar sig med en tom lista.
5. `placeNewScenes` ger samma lägen för samma indata, på rutnätet, utan att överlappa befintliga scener.

Gränssnittet:
6. Storyboard med en falsk panel: förhandsvisningen ritas, valda och omarkerade förslag syns olika, en ny förhandsvisning ersätter den förra, `null` tar bort allt, och inget sparas. Efter `onAssistClose` med `changed: true` visas det sparade och ingen streckad markering finns kvar.
7. Panelen med en falsk Storyboard: exakt ett `onAssistClose` för varje öppning, även när modellen inte svarar och när författaren stänger mitt i.
8. Ett äventyr som byggts vidare med Fördjupa och Fortsätt kan spelas utan nätanrop.

**Provkörning i webbläsaren**, med en simulerad modell och med en riktig lokal modell, med skärmbilder:
- Fördjupa och Fortsätt på samma scen, som i skisserna.
- En väg som går förbi ett lås, där författaren väljer en åtgärd.
- Utveckla texten på en följd.

## Byggordning

1. **Claude-spåret:** `authoringPatch.ts`, `authoringChecks.ts` och `placeNewScenes`, med testerna 1–5. Sedan granskning av Astra.
2. **Parallellt:** Claude-spåret bygger ingångarna och förhandsvisningen mot en falsk panel (test 6). ChatGPT-spåret bygger panelen mot en falsk Storyboard (test 7).
3. Fördjupa scenen, hela vägen.
4. Fortsätt härifrån.
5. Utveckla texten.
6. "Här vill jag mer" i provspel.

Stanna för provkörning i webbläsaren efter steg 3 och steg 5.

## Öppna frågor

- Får Fördjupa lägga till ett sidorum, eller blir det alltid Fortsätt?
- Ska gränsen vara högst tre vägar och högst två nya scener per väg?
- Ska ett förslag som kräver ett slag (som Arresten i skissen) bara erbjudas när äventyret har ett regelverk?
- Ska varje tillägg märkas, så att författaren senare kan ta bort allt från ett och samma "Lägg till"? Det kräver ett nytt fält och därmed ett formatförslag.

## Senare, inte i det här beslutet

- **"Vad saknas?"**: motorn listar lösa trådar i hela äventyret, med "Hjälp mig" på varje rad.
- **"Spelbart utan AI?"** och valet mellan ett spel utan AI och ett AI-spel.
- **Skrivna samtal**, med repliker och val.
