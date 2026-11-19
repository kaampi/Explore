# Designbeslut: den nya spelvyn och teman

Hur spelvyn för motorscener ska se ut och fungera, och hur teman byggs ut så att en genre kan få sin egen känsla. Utgår från `main` (commit `0ab4660`). Dokumentet beskriver beslut, inte kod som finns.

Underlag: skissen *Explore spelvy – skiss* (Claude), Astras två bilder med Mona vid stadsporten (ChatGPT), och diskussionen 17 november 2026. Layouten följer Astras andra bild.

## Mål

Spelaren ska känna närvaro, se vad hen kan göra och märka att det hen gör får följder. Explore är också ett verktyg för att hitta idéer till skrivandet, så berättelsen ska gå att läsa och spara ur.

Inte mål: poäng, utmärkelser, nivåer, dagliga påminnelser eller nedräkningar.

## Omfattning

Gäller motorscener, alltså allt som i dag ritas av `EncounterPanel.tsx`: äventyr från Storyboard, fritt spel i en värld och gatehouse. Chattläget (`ChatPanel.tsx`) ändras inte nu; det kan senare få samma ram. Adventure Builder får ett eget designbeslut.

Motorn ändras inte. Två tillägg i datat behövs (se *Nytt i datat*), båda valfria och utan migrering.

## Layout på bred skärm (1440 px och mer)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ kaampi Explore │ ← Till översikten │   Vid stadsporten   │ Dag 3 · 17:40 │ Spara idé │ Dagbok │ ⚙ │
├──────────────┬───────────────────────────────────────┬───────────────────────┤
│ Scenbild     │ Berättelsen        Tidigare händelser │ I scenen            ⌄ │
│              │ prosa, repliker, slag                 │ Härifrån              │
├──────────────┤                          ↑ Till senaste│ Saker på platsen      │
│ Personkort   ├───────────────────────────────────────┤ Din rollperson        │
│ Mona         │ Vad gör du?                           │ Vad du vet            │
│ Portvakt …   │ [förslag] [förslag] [förslag] [Fler…] │                       │
│ [Mona][Väkt.]│ [Tala | Agera]                        │                       │
│ Minska bild  │ [fritt fält]          [Säg / Granska] │ Visa karta            │
└──────────────┴───────────────────────────────────────┴───────────────────────┘
```

Tre kolumner: vänster cirka 26 %, mitten flexibel med största läsbredd enligt temats `textWidth`, höger cirka 22 %.

## Överst

| Del | Innehåll | Finns i dag |
| --- | --- | --- |
| Till översikten | Sparar och går hem, som "Save & return home". | Ja |
| Platsens namn | `adventure.scenes[current].name`. | Ja |
| Tid | `formatGameTime(run.clockMinutes)`, bara när äventyret har restider. | Ja |
| Spara idé | Huvudknapp. Öppnar `IdeaEditor` med de markerade raderna, annars de senaste tre. | Delvis: idéfångst finns i chatten |
| Dagbok | Öppnar dagboken som en panel från höger. | Nej |
| ⚙ | Meny: Ljud, Utseende, AI och modell, Inspector, Språk. | Ja, som länkar |

## Vänster kolumn: platsen och personerna

**Scenbild.** Platsens bild från kartan eller platskortet (`sceneBackdrop`, `applyAdventurePresentation`). Saknas bild visas temats bakgrund med platsens namn.

**Personkort.** Personen i fokus: porträtt, namn, en kort rad och, i kursiv, hur personen verkar just nu. Utan porträtt visas en monogram-bricka med initialer, och raden blir längre. Personen finns i berättelsen även utan bild.

- Raden hämtas från personans första mening av `personality`, högst 80 tecken.
- "Hur personen verkar" hämtas från `mood`, om den finns.
- Påhittade invånare (fas 5) visas likadant, med monogram.

**Flikar** för varje person som är här (`present()` i `dialogue.ts`). **Vald person är den du talar till.** Det du säger under Tala går till den valda personen, i stället för att gissas fram. Förslagen under "Vad gör du?" utgår också från den valda personen.

**Minska bildytan** fäller ihop kolumnen till en smal remsa med en liten bild och personflikarna. Valet sparas per webbläsare.

## Mitten: berättelsen

**Rubrik** "Berättelsen", med "Tidigare händelser" som visar tidigare platser i samma spel. Varje plats har en avdelare med namn och tid.

**Raderna**

| Slag | Visas som |
| --- | --- |
| Berättartext | Löpande prosa i temats textstil, utan bubbla och utan etikett. |
| Spelarens tal | Etikett "DU · TALA", citat i rak stil, vänsterlinje. |
| Spelarens handling | Etikett "DU · AGERA", handlingens namn. |
| Personens replik | Etikett med personens namn i accentfärg, citat, vänsterlinje. |
| Slag | En kompakt rad: tärning, färdighet, slag mot chans, utfall ("Uppmärksamhet · 34 / 60 · Lyckat"). |
| Improviserad replik | Som personens replik, med en liten markering "Improviserat". |

**På varje rad**, när den har fokus eller pekas på: "Spara idé" och, för improviserade repliker, "Kom ihåg". Det ersätter högerklicksmenyn, som finns kvar som genväg.

**Till senaste** visas när spelaren har bläddrat upp. Nya rader meddelas med `aria-live="polite"`.

## Mitten: Vad gör du?

**Tre förslag** och **Fler val…**. Förslagen väljs ur `publicCommands(game)` i den här ordningen:

1. Samtal och handlingar med den valda personen som inte är gjorda.
2. Andra handlingar på spelarens position som inte är gjorda.
3. Dörrar som kan låsas upp eller öppnas här.
4. "Se dig omkring".

Blockerade handlingar föreslås inte. Ikonen följer typen: samtal, föremål, undersöka, dörr, förflyttning.

**Fler val…** öppnar hela listan, grupperad som Personer, Saker, Platser i scenen och Strid. Blockerade handlingar visas där, avstängda med skälet.

**Tala och Agera** är två flikar över ett gemensamt fält. Tala skickar till `planSay` med vald person som mottagare; knappen heter "Säg". Agera skickar till `planDo`; knappen heter "Granska handling", och raden under säger "Du får se försöket innan det utförs". Utkastet behålls per flik.

**Granskningen** före ett slag ligger kvar som i dag: handling, färdighet, svårighet och chans, med Försök och Ändra.

## Höger kolumn: I scenen

Kan fällas ihop. Fyra delar:

**Härifrån.** Vägar till andra scener med restid och läge: "Landsvägen · 20 min · Tillgänglig", "Stadsporten · Låst". En låst väg visas bara när det är en dörr som håller den stängd; en väg som kräver en upptäckt spelaren inte gjort visas inte, så att inget avslöjas. Klick på en tillgänglig väg reser dit.

**Saker på platsen.** Föremål som syns här (`itemRevealed`). Ett klick visar föremålets beskrivning och de handlingar som rör det.

**Din rollperson.** Hälsa som mätare, packningen som utfällbar lista (`PlayerInventory`), och färdigheterna med namn och värde i en utfällning.

**Vad du vet.** Det spelaren har fått veta i det här spelet, senaste först, högst fem; resten i dagboken.

**Visa karta** längst ner öppnar spelkartan (`PlayMapCard`) i en panel.

## Dagboken

En panel från höger med:

- **Mål**, med bock när det är klart.
- **Vad du vet**, alla, med platsen där du fick veta det.
- **Packning.**
- **Personer du mött**: alla som haft en replik eller varit i en scen du besökt.
- **Platser du varit på**, i ordning, med tid.
- **Ihågkommet**: anteckningarna från "Kom ihåg", per plats, med Glöm.

## Händelser som märks

- **Ankomst till en plats:** en övergång med restiden och platsens namn ("Tjugo minuter senare · Landsvägen"), högst 1,2 sekunder, och en rubrik över berättelsen.
- **Korta markeringar** längst ner när spelaren får veta något, får ett föremål eller låser upp något. En gång, cirka 3 sekunder, inget ljud som standard.
- **Mål klart:** en markering och en rad i berättelsen. Spelet fortsätter.

Alla rörelser stängs av vid `prefers-reduced-motion`.

## Strid

När en strid börjar ersätter stridsvyn (`CombatStage`) mittkolumnen. Vänsterkolumnen visar den figur som har turen. Höger kolumn visar turordning och hälsa för alla. Berättelsen kommer tillbaka när striden är slut, som i dag.

### Värden under "Din rollperson"

Tillagt 19 november 2026, inför steget för strid.

Regelverket säger inte vilka värden som är viktigast, men varje värde har `maxShift`: hur mycket det får ändras per steg i samtalsläget (0 = står still). Det används så här:

- **Tillstånd** (`maxShift > 0`, till exempel Trygghet eller Sanity) visas som mätare under "Din rollperson", i regelverkets ordning, högst tre. Resten i en utfällning.
- **Färdigheter** (`maxShift = 0`, till exempel Styrka eller Övertalning) visas i utfällningen "Färdigheter", som i dag.
- Ett nytt valfritt fält på värdet, `display: "meter" | "skill" | "hidden"`, går före regeln. Det väljs per värde i regelverksredigeraren. Namnet `role` används inte, eftersom det redan finns (`role: "desire"`).

**Hälsa** visas när scenen har fiender (`hostilities`) eller vapen, när något utfall kan starta strid (`start-combat`), eller när spelaren inte har full hälsa. Annars döljs den. Samma regel gäller etiketten "Hostile" på personkortet. Om strid är möjlig avgörs av äventyret, inte av regelverket.

Inga befintliga regelverk behöver ändras: fantasyregelverket och porten ser ut som i dag, och "Förtroende" visar sina värden som mätare och ingen hälsa när ingen kan slåss.

## Mindre skärmar

- **1024–1439 px:** vänsterkolumnen fälls ihop till remsan automatiskt.
- **Under 1024 px:** en kolumn. Scenbilden blir en låg banderoll överst med personflikarna. Berättelsen och "Vad gör du?" följer. "I scenen" och "Dagbok" blir knappar som öppnar paneler.

## Nytt i datat

1. **Porträtt på personan.** `PersonaSchema` i `AdventureSchema.ts` får `portraitDataUrl: z.string().optional()`, kopierat från personkortet när spelet startar (`castFor` i `adventureStart.ts`). Utan det har motorscener inga porträtt.
2. **Vad spelaren fick veta.** `OutcomeSchema` i `EncounterSchema.ts` får `learned: z.string().max(200).optional()`. Storyboard får fältet "Det spelaren får veta" under utfallet. Saknas fältet visas utfallets första mening, men bara för utfall som sätter en upptäckt. Detta är vad "Vad du vet" och dagboken visar; flaggornas namn visas aldrig.

Nya rena funktioner, med tester:

- `suggestedCommands(game, addresseeId)` i `src/game/catalog.ts`: förslagen enligt ordningen ovan.
- `sceneWays(session)` i `src/game/AdventureEngine.ts`: alla vägar från den aktuella scenen med läge `available` eller `locked` och restid. Vägar som kräver en upptäckt som saknas utelämnas.
- `knownThings(session)`: vad spelaren vet, med plats och tid.
- `peopleMet(session)`.
- `planSay` får en valfri `addresseeId` som går före gissningen i `speechAddressee`.

## Teman

### Det som finns

`PlayThemeSchema` i `src/ui/themes/theme.ts` har färger, `font` (serif eller sans), textstorlek, läsbredd och bakgrund. Det finns fyra färdiga teman, egna teman (upp till 50), tema per samtal och kontrollen `contrastRatio`. Teman påverkar bara utseendet, aldrig motorn eller AI.

### Det som läggs till

Fasta val, inte fri CSS, så att alla teman fungerar med samma layout och går att läsa:

```ts
headingFont: z.enum(["newsreader", "cinzel", "cormorant", "exo", "special-elite", "im-fell", "nunito", "inter"]).default("newsreader"),
frame: z.enum(["none", "line", "ornate", "soft", "glow"]).default("line"),
corners: z.enum(["square", "rounded"]).default("rounded"),
texture: z.enum(["none", "parchment", "stone", "metal", "paper"]).default("none"),
```

- **Typsnitten följer med appen** i `public/fonts/`. Explore ska fungera utan nätverk, och `index.html` hämtar i dag Newsreader från Google Fonts; det flyttas också in. Kontrollera licensen för varje typsnitt innan det läggs in (de som nämns är under OFL eller Apache 2.0).
- **Ramen** ritas med CSS och SVG i appen. Inga bilder från användaren.
- **Kontrollen** `contrastRatio` gäller även accentfärg mot panel.

### Färdiga teman

Grundutseendet är neutralt. Därtill följer dessa med, som utgångspunkter:

| Tema | Känsla |
| --- | --- |
| Neutral | Grundutseendet: sans-serif, tunn linje, inga dekorationer. |
| Fantasy | Mörkt och guld, Cinzel, ornamenterad ram, sten. Astras bild. |
| Romance | Varmt och ljust, Cormorant, mjuk ram, rundade hörn, papper. |
| Sci-fi | Kallt och mörkt, Exo, glödande ram, raka hörn, metall. |
| Noir | Svartvitt med en färg, Special Elite, tunn linje, raka hörn. |
| Skräck | Mörkt och kallt, IM Fell, tunn linje, sten. |
| Mysig | Ljust och varmt, Nunito, mjuk ram, rundade hörn. |

De fyra som finns behålls, så att ingen förlorar sitt val.

### Författarens tema

`CampaignTemplate` och `RealmTemplate` får `theme: PlayThemeSchema.optional()`. Steget World i Adventure Builder och världens inställningar får ett temaval. När ett spel startar används äventyrets tema, annars världens, annars spelarens förval. Spelaren kan alltid byta i Utseende, och bytet gäller det samtalet. När äventyr senare kan delas som fil (Explore 2.0) följer temat med.

## Tillgänglighet

- Riktiga knappar, flikar och etiketter. Allt nås med tangentbordet i läsordning: överst, vänster, mitten, höger.
- Kontrast minst 4,5 : 1 för text, kontrollerad för varje tema.
- Klickytor minst 44 px.
- Alla nya texter går genom `LanguageProvider` på engelska, svenska och norska.

## Byggordning

1. **Data och funktioner:** porträtt på personan, `learned`, `suggestedCommands`, `sceneWays`, `knownThings`, `peopleMet`, mottagare i `planSay`. Bara tester, inget gränssnitt.
2. **Ramen:** tre kolumner och överraden, med dagens innehåll flyttat in.
3. **Berättelsen:** raderna, etiketterna, "Spara idé" och "Kom ihåg" per rad, "Till senaste".
4. **Vad gör du?:** förslag, Fler val, Tala och Agera.
5. **Vänster kolumn:** personkort, flikar, vald mottagare, Minska bildytan.
6. **I scenen.**
7. **Dagboken.**
8. **Händelser som märks.**
9. **Mindre skärmar.**
9b. **Strid och värden:** avsnitten *Strid* och *Värden under "Din rollperson"*. Tillagt efteråt; saknades i den första byggordningen.
10. **Teman:** schema, typsnitt, ramar, färdiga teman.
11. **Författarens tema.**

Stanna för granskning efter steg 4 och steg 9, och provkör i webbläsaren efter varje steg från och med 2.

## Krav på tester

1. `suggestedCommands` ger högst tre, i rätt ordning, aldrig blockerade, och utgår från vald person.
2. `sceneWays` visar en dörrlåst väg som låst men utelämnar en väg som kräver en upptäckt som saknas.
3. Det du säger under Tala går till vald person, även när du nämner någon annan.
4. "Vad du vet" visar `learned` eller utfallets första mening, aldrig ett flaggnamn.
5. En person utan porträtt visas med monogram och längre rad.
6. "Spara idé" på en rad skapar en idé med just den raden.
7. Vyn går att använda med enbart tangentbord, och nya rader meddelas.
8. På 1280 px fälls vänsterkolumnen ihop; på 390 px blir det en kolumn.
9. Varje färdigt tema klarar kontrastkontrollen.
10. Ett äventyrs tema används vid start, och spelarens byte gäller bara det samtalet.
11. Äldre sparade spel öppnas som förut.

## Utanför detta beslut

- Chattläget och Adventure Builder.
- Morph-porträtt med ansiktsuttryck i spelvyn (`ChatMorphPortrait` finns; kan kopplas in senare).
- Frilagda porträtt som står i scenbilden.
- Ljud vid händelser.
