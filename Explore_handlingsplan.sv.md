# Handlingsplan: knyt ihop Explore

Arbetsorder för en kodagent. Utgår från granskningen av commit `8957437` (8 november 2026). Planen beskriver arbete som ska göras, inte funktioner som finns.

## Läget i korthet

Explore har två spelspår som aldrig möts:

- **AI-spåret** – `SessionEngine`, `StateEngine`, `ContextEngine`, `ChatPanel`. Används av Free play, "With rules"-chatten och äldre kampanjscener. AI berättar fritt; regler avgör nästan ingenting.
- **Motorspåret** – `src/game/` (`EncounterEngine`, `AdventureEngine`), `EncounterPanel`. Används av Storyboard-äventyr och depån. Motorn avgör allt; AI är avstängd. En fri replik ger "This scene has no prepared reply for that topic yet".

Dessutom finns ett äldre tredje spår: `src/checks/gate*.ts` med `GateScenePanel`.

Målet är ett spår: **motorn avgör, AI tolkar spelarens avsikt och berättar utfallet.** Free play och regelstyrt äventyr ska vara två inställningar av samma tur, inte två system.

## Regler som gäller alla uppgifter

1. **Motorn äger sanningen.** AI-text får aldrig ändra flaggor, lås, föremål, hälsa, positioner eller slag. AI får bara (a) föreslå en handling ur `encounterCommands(game)` och (b) formulera text om redan avgjorda händelser.
2. **Inga omkast.** Slag, kostnader och följder sparas en gång. Regenerate får bara ändra formuleringen.
3. **Gamla sparningar ska öppnas.** Varje schemaändring i `StateSchema`, `EncounterSchema`, `AdventureSchema` eller `LibrarySchema` är additiv med standardvärde, eller får en migrering med test.
4. **Varje uppgift avslutas med** `npm run typecheck` och `npm test` utan fel. Nya beteenden får tester i samma stil som grannfilerna i `tests/`.
5. **En uppgift per commit eller liten commit-serie.** Blanda inte omformatering med logikändringar.
6. **Skriv ny kod luftigt:** en sats per rad, namngivna hjälpfunktioner. Följ inte den täta stilen i t.ex. `WorldMapStudio.tsx`.
7. **Avgränsning:** bygg inte strid för flera spelarstyrda figurer, nya regelsystem eller AI-genererade uppdrag om uppgiften inte säger det.
8. **Stanna och fråga** om en uppgift märkt *Design först* saknar ett bifogat designbeslut, eller om en uppgift kräver att en regel ovan bryts.

## Fas 1 – Beslut och städning

**1.1 Uppdatera `project_spec.md`.** Avsnitten "Attributes … Checks, object rolls, and combat are not wired" och "Designed, not built" stämmer inte längre. Beskriv de två spåren och målbilden ovan. Ingen kodändring.

**1.2 Begreppslista.** Lägg `docs/terminology.md` med ett ord per sak och använd det i gränssnittet:

| I dag | Ska heta |
| --- | --- |
| Campaign, Campaign Builder, Adventures, "Save campaign", "Save adventure" | Adventure, Adventure Builder, "Save adventure" |
| One-off scene | Quick scene |
| Storybook, Sandbox, Core (i synlig text) | kaampi Write, kaampi Explore, kaampi Codex |

Byt bara synliga strängar. Interna identifierare (`campaignId`, `sandbox`, `SANDBOX_CORE_TOKEN`) lämnas orörda. Uppdatera berörda DOM-tester.

**1.3 Formatterare och lint.** Inför Prettier och ESLint med TypeScript-regler. Kör formatteringen som en egen commit utan logikändringar och verifiera att testerna är oförändrat gröna. Lägg kontrollen i `.github/workflows/verify.yml`.

**1.4 Ta bort den hårdkodade strängkontrollen.** `PlayWorkspace.tsx` avgör bakgrund med `session.ruleset?.name === 'Gate test · d100'`. Ersätt med ett explicit fält på sessionen.

**1.5 Flytta gatehouse till gemensamma motorn** – *Design först.* `src/scenarios/gateWorld.ts` översätter redan världen. Målet är att `GateScenePanel` och `src/checks/gateEncounter.ts`, `gateCombat.ts`, `gateGeometry.ts`, `gateIntent.ts` kan tas bort, och att äldre gatehouse-sparningar migreras eller öppnas skrivskyddat.

Klart när: en spelyta för motorscener (`EncounterPanel`), inga synliga gamla produktnamn, lint i CI.

## Fas 2 – AI in i motorscener

Viktigaste fasen. Ny kod läggs i en egen modul, förslagsvis `src/session/encounterNarration.ts`, så att `src/game/` förblir fri från LLM-beroenden.

**2.1 Kontrakt** – *Design först.* Beslutet ska ange: promptens innehåll för en motorscen, vad som räknas som betrodd respektive obetrodd text, hur AI-text lagras i `history` utan att bli fakta, och vad som händer när modellen saknas eller svarar fel.

**2.2 Fritt tal.** I `EncounterEngine.ts` ger en `say` utan träff i `spokenInteraction` i dag bara ett eko. Nytt flöde:

1. Motorn prövar förberedda samtal som i dag. Träff ger det författade svaret, oförändrat.
2. Ingen träff: motorn sparar spelarens replik. Därefter begärs ett svar i karaktär från `LLMAdapter`, med scenens fakta, personens kort och redan gjorda upptäckter som underlag.
3. Svaret lagras som text med talare. Det sätter inga flaggor och öppnar inga vägar.
4. Prompten ska förbjuda att personen avslöjar innehållet i författade handlingar vars villkor inte är uppfyllda.

Utan ansluten modell behålls dagens besked.

**2.3 Fri handling.** `proposeEncounterText` i `src/game/intention.ts` tolkar i dag bara exakta etiketter. Lägg till ett AI-steg som får listan från `encounterCommands(game)` och returnerar ett index eller "oklart". Resultatet går genom samma `Review action → Attempt` som i dag. AI får aldrig returnera en handling som inte finns i listan; validera mot listan i kod.

**2.4 Berättat utfall.** `describeEvents` i `src/game/narration.ts` ger korrekt men torr text. Lägg ett valfritt steg som låter AI formulera samma händelser. Den torra texten sparas alltid som underlag och visas om AI-steget misslyckas. Slag och siffror visas från motorns data, aldrig från AI-texten.

**2.5 Tester.** Använd `MockProvider`. Täck minst: AI-svar kan inte sätta flagga; AI-förslag utanför katalogen avvisas; AI-fel ger reservtext utan nytt slag; omladdning ger samma historik.

Klart när: exempeläventyret "The missing messenger" går att spela med fria frågor till Edda, upptäckter kräver fortfarande de författade handlingarna, och allt fungerar utan modell som i dag.

## Fas 3 – Äventyrsbyggaren

**3.1 Laga återvändsgränden.** I en ny kampanj är platslistan i Storyboard tom och "Open Map Studio" avstängd. Lägg "Create a place" direkt i scenpanelen (`PlayableStoryboard.tsx`) som skapar plats och vid behov en värld.

**3.2 Ett byggsätt.** Fliken Scenes i `CampaignStudio.tsx` byter innehåll beroende på om någon scen har `encounter`. Gör Storyboard till det enda sättet att bygga scener. Äldre AI-scener visas under en tydlig rubrik "Earlier scene format" och kan fortfarande startas.

**3.3 Guidat flöde.** Ordna stegen som World → You → Cast → Scenes → Connections → Test, med samma färdigmarkering som dagens tre steg.

**3.4 Bredare skrivyta.** Detaljpanelen är cirka 330 px. Öppna handlingens texter i en bred redigeringsyta eller gör panelen ställbar.

**3.5 Nåbarhetskontroll.** Utöka `storyboardIssues` i `storyboardReadiness.ts`: scener som inte kan nås från startscenen, villkor som ingen handling kan uppfylla, mål som inte kan nås.

**3.6 Motorns delar i editorn** – *Design först för datamodellen, därefter en del per commit.* Editorn når i dag inte `places`, `connections`, `barriers`, `weapons`, `hostilities`, `itemLocations`, `take-item` eller motståndares värden. Bygg i denna ordning, var och en som en färdig mall:

1. Föremål på plats som kan plockas upp.
2. Låst dörr med nyckel.
3. Flera positioner i en scen med förbindelser.
4. Motståndare med vapen och hälsa.

**3.7 Spelbara äventyr på startsidan.** Kortet "Adventure" i `PlayStartPaths.tsx` ska visa sparade äventyr att spela, med en länk till byggaren.

**3.8 Rensa hjälptexter.** Ta bort internjargong i synlig text ("Pass 1 honors this", "Emma sees this").

Klart när: gatehouse-scenariot kan byggas från tom kampanj helt i editorn och spelas.

## Fas 4 – Regelbryggan

**4.1 Rule-set till motorn** – *Design först.* `startPlayableCampaign` hårdkodar `ruleset:{name:'Adventure · d100',attributes:[]}` och `makePlayableScene` hårdkodar hälsa 20/12 och färdigheterna Observation och Persuasion. Kampanjens valda rule-set ska ge färdighetslistan, spelarens och rollfigurernas värden och hälsa. `RulesAdapter` i `src/game/rules.ts` är anslutningspunkten.

**4.2 Objektens egenskaper.** `weight`, `difficulty` och `checkAttribute` på objektkort sparas men används inte. Koppla dem till handlingar och dörrar i motorn.

**4.3 Anatomi i prompten.** `ContextEngine.ts` nämner anatomi bara i en generell rad. Lägg en kort sammanfattning per närvarande figur med kroppsplan (till exempel "Arachnid: åtta ben, två palper") i tillståndsblocket. Håll den under cirka 30 ord per figur och testa mot budgeten.

**4.4 Factions i prompten.** En rad per närvarande figur med fraktionstillhörighet, samma budgetkrav.

Klart när: ett äventyr med eget rule-set visar rätt färdigheter i editorn och i spel, och en icke-humanoid figur beskrivs rätt av modellen.

## Fas 5 – Free play i världen

Hela fasen är *Design först*. Underlag finns i `docs/TODO.md` ("Persistent place state and revisits") och `docs/game-time-and-journeys-ideas.md`.

- **5.1** En kartplats blir en motorscen automatiskt, med positioner från `interior.ts` och `settlement.ts`.
- **5.2** Bestående platstillstånd per genomspelning.
- **5.3** Restid och etapper mellan scener.

## Fas 6 – Codex-loopen

**6.1** `CoreManuscripts.tsx` kan bara kopiera karaktärer. Lägg import av `locations`, `objects` och `groups` till platser, objekt och factions, med samma granskningssteg som karaktärer har i `coreCharacterUpdates.ts`.

**6.2** "Create world from manuscript": välj flera poster och importera i ett svep.

**6.3** `events` blir scenutkast i Storyboard – *Design först.*

## Fas 7 – Löpande

- Flytta synliga strängar till `LanguageProvider`; i dag översätts ett tjugotal. Ta bort svenska strängar ur engelskt läge (`CharacterImages.tsx`: "Visa bildarkiv").
- Åtgärda varningen "React does not recognize the … prop on a DOM element" som syns i konsolen på startsidan.

## Ordning

Fas 1.1–1.4 → 2 → 3.1–3.5 → 3.6 → 4 → 1.5 → 5 → 6. Fas 7 kan göras när som helst.

## Rapportering per uppgift

Ange: vilka filer som ändrats, vilka tester som lagts till, resultatet av `npm run typecheck` och `npm test`, samt vad som medvetet lämnats utanför.
