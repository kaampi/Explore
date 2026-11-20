# Designbeslut: mellanscener (cut-scenes)

Beslutat 20 november 2026. Gäller äventyr som spelas i spelvyn (motorscener). Samtalsläget ändras inte.

Underlag: punkten *Start page and cut-scenes* under Explore 2.0 i `TODO.md`. Startsidan är inte med här; den får ett eget beslut.

## Vad det är

En mellanscen är en del av berättelsen som spelaren **ser** i stället för att spela: en inledning, en resa, något som händer. Den består av text, gärna en bild, och knappen "Fortsätt".

- **Författaren skriver den.** Den fungerar därför utan AI. AI:n används inte i den första versionen.
- **Den har inga val**, och motorns läge ändras inte medan den visas. Det enda som ändras är det författaren lägger på slutet: faktum som sätts och tid som går.

I gränssnittet heter den "Cut-scene" på engelska, "Mellanscen" på svenska och "Mellomscene" på norska.

## Vad som startar en mellanscen

Det finns tre sätt, och inga fler:

| Utlösare | Exempel | När |
| --- | --- | --- |
| **En väg tas** (`link`) | En resa: "Tre dagar på vägen …" | När spelaren tar vägen, före ankomsten till nästa scen. |
| **En scen börjar** (`scene`) | Inledningen, eller en ankomst | När spelaren kommer till scenen. Första gången, eller varje gång om författaren väljer det. Äventyrets inledning är en sådan på startscenen. |
| **Något blir sant** (`facts`) | En händelse: "När porten öppnas börjar klockorna ringa …" | När det sista av de angivna faktumen sätts, var spelaren än befinner sig. Ett slut, en epilog, är samma sak med målets faktum. |

- **Varje mellanscen visas en gång per spel,** om inte författaren väljer "varje gång". Det valet finns bara för `scene`.
- **Om flera startas samtidigt** visas de i ordningen väg, faktum och scen, och inom samma sort i den ordning de står i äventyret. Tar man en väg som både sätter ett faktum och leder till en ny scen, ser man alltså resan, sedan händelsen och sist ankomsten.
- **Faktum som sätts av en mellanscen** kan starta nästa mellanscen. Varje mellanscen visas ändå högst en gång per utlösning, så det kan inte bli en oändlig kedja.

## Data

### I äventyret

`CampaignTemplateSchema` i `src/library/LibrarySchema.ts` får `cutscenes`:

```ts
export const CutsceneTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), linkId: z.string().min(1) }),
  z.object({ kind: z.literal("scene"), sceneId: z.string().min(1), every: z.boolean().default(false) }),
  z.object({ kind: z.literal("facts"), flags: z.array(z.string().min(1)).min(1) }),
]);

export const CutsceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  /** Stycken, ett i taget på skärmen. */
  paragraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(20),
  imageDataUrl: z.string().optional(),
  trigger: CutsceneTriggerSchema,
  /** Det som händer när mellanscenen är slut, eller hoppas över. */
  setsFlags: z.array(z.string().min(1)).default([]),
  /** Tid som går, i minuter, utöver vägens egen restid. */
  minutes: z.number().int().nonnegative().optional(),
  /** Läge och grupp i Storyboard, som för scener. */
  position: StoryboardPositionSchema.optional(),
  storyboardSectionId: z.string().min(1).optional(),
});

cutscenes: z.array(CutsceneSchema).default([]),
```

Gamla äventyr har inga mellanscener och öppnas som förut.

### I spelet

När spelet startar kopieras mellanscenerna in i spelet (`AdventureRunSchema`), som kopplingarna redan gör, så att ett pågående spel inte ändras när författaren redigerar äventyret. Spelet får också:

```ts
cutscenes: z.array(CutsceneSchema).default([]),
/** Mellanscener som har visats färdigt eller hoppats över i det här spelet. */
cutscenesSeen: z.array(z.string()).default([]),
/** Mellanscener som ska visas nu, i ordning. Den första visas. */
cutscenesPending: z.array(z.string()).default([]),
```

Kön sparas med spelet. Sparar man mitt i en mellanscen och öppnar spelet igen, visas den på nytt från första stycket.

## Motorn

Allt ligger i rena funktioner i en ny fil, `src/game/cutscenes.ts`:

- `dueCutscenes(before: Session, after: Session): string[]` jämför läget före och efter ett steg i motorn och returnerar de mellanscener som ska visas, i rätt ordning:
  - `link`: en ny övergång i `transitions` med vägens id
  - `facts`: alla angivna faktum finns efter steget, men inte alla fanns före
  - `scene`: `currentSceneId` har bytts till scenen, eller spelet har just startat på den.

  Mellanscener som redan är visade hoppas över, utom `scene` med `every: true`. Mellanscener som redan står i kön läggs inte till igen.
- `queueCutscenes(session, ids)` lägger dem sist i `cutscenesPending`.
- `finishCutscene(session, id)` tar bort den första ur kön, lägger den i `cutscenesSeen`, sätter dess faktum, lägger till dess minuter på `clockMinutes`, och lägger till en rad i berättelsen (se nedan). Faktum som sätts här kan i sin tur ge nya mellanscener. Kör `dueCutscenes` på det steget också.

`StateEngine` anropar `dueCutscenes` och `queueCutscenes` efter varje steg som kan ändra läget: när en handling utförs, när en väg tas och när spelet startar. Det görs på samma ställen som `noteGoalReached()` anropas i dag.

**Medan kön inte är tom tar motorn inte emot handlingar,** varken förslag, tal eller vägar. Ett försök ger samma svar som när motorn är upptagen. Gränssnittet visar dem ändå inte.

## Spelvyn

- **Mittkolumnen** byts mot mellanscenen så länge kön inte är tom. Den har temats ram (`Frame`), titeln på en namnskylt (`NamePlate`), ett stycke i taget i temats läsfont och läsbredd, och en avdelare mellan bild och text.
- **Bilden** visas överst i mittkolumnen om mellanscenen har en. Vänsterkolumnens scenbild ändras inte.
- **Knappar:** "Fortsätt" som huvudknapp, med "Fortsätt spelet" på sista stycket. "Hoppa över" som tyst knapp hoppar över resten av mellanscenen och sätter dess faktum och tid som om den visats färdigt. Enter och mellanslag fungerar som "Fortsätt". Escape gör ingenting, så att ingen hoppar över av misstag.
- **"Vad gör du?"** döljs medan en mellanscen visas. Höger kolumn och dagboken går att öppna, men vägarna är avstängda.
- **Markeringar och ankomsten** (steg 8 i spelvyn) väntar tills kön är tom.
- **Berättelsen:** när en mellanscen är klar läggs den till som en egen sorts rad (`cutscene`) med titeln på en avdelare och hela texten som prosa. Raden kan sparas som idé, som andra rader.
- **Dagboken** får delen "Det som hänt", med titlarna på de mellanscener spelaren sett, i ordning.
- **Tillgänglighet:** mellanscenen är en region med titeln som namn. Fokus flyttas till den när den visas, och tillbaka till "Vad gör du?" när kön är tom. Nya stycken meddelas med `aria-live="polite"`. Inga rörelser vid `prefers-reduced-motion` eller "Enkla ramar".

## Storyboard

- **En egen sorts kort,** med streckad kant och en liten filmremsa vid titeln, så att författaren ser skillnad på spel och berättelse.
- **"+ Mellanscen"** i verktygsraden, bredvid "+ Scene", och "Lägg till mellanscen" i högerklicksmenyn för en scen och för en väg. Från en scen eller väg fylls utlösaren i automatiskt.
- **Synlig koppling till utlösaren:** en tunn prickad linje till scenen, eller till mitten av vägen, som utlöser den. För `facts` finns ingen linje. Kortet visar i stället "När: …" med faktumen i ord, eller "När målet nås".
- **Panelen för en mellanscen:**
  - titel
  - text, där en tom rad skiljer stycken
  - bild
  - utlösare: väg, scen eller "När spelaren vet att …"
  - "Första gången" eller "Varje gång", för scen
  - "När den är slut": faktum som sätts, och tid som går.

  Faktumen väljs ur samma lista som för kopplingar, och visas i ord, inte som flaggnamn.
- **Knappen Ordna** lägger mellanscener för en väg eller scen bredvid sin utlösare. Mellanscener för faktum hamnar i en egen rad.

## Kontroll före spel

Äventyrskontrollen får tre varningar, som inte hindrar spel:

- Mellanscenen pekar på en väg eller scen som inte finns längre.
- Faktumen kan aldrig sättas av något i äventyret.
- Texten är tom.

## Krav på tester

1. Schemat: ett gammalt äventyr utan `cutscenes` öppnas, och en mellanscen med för långt stycke eller tom titel avvisas.
2. `dueCutscenes` för varje utlösare: en väg tas, en scen börjar (första gången och varje gång), faktum blir sanna (bara när det sista sätts), och spelet startar på en scen.
3. Ordningen väg, faktum och scen när flera utlöses samtidigt.
4. En mellanscen visas en gång per spel. Den läggs inte i kön två gånger, och en kedja av faktum blir aldrig oändlig.
5. `finishCutscene` sätter faktum och tid, och "Hoppa över" ger samma läge som att läsa färdigt.
6. Motorn tar inte emot handlingar medan kön inte är tom.
7. En sparad kö finns kvar efter att spelet laddats om.
8. Spelvyn: mellanscenen ersätter mitten, "Vad gör du?" döljs, Enter går vidare, Escape gör ingenting, fokus flyttas rätt, och raden hamnar i berättelsen och dagboken.
9. Storyboard: en mellanscen skapas från en väg och från en scen med rätt utlösare, och panelen sparar alla fält.
10. Kontrollen ger de tre varningarna.
11. **Provkörning i webbläsaren** med ett exempel byggt för det: en inledning på startscenen, en resa på en väg med restid, en händelse när ett faktum sätts, och en epilog när målet nås. I Neutral, Fantasy och Sci-fi, och i smalt läge.

## Byggordning

1. **Data och motor:** schemat, kopian in i spelet, `cutscenes.ts`, kön, anropen i `StateEngine`. Bara tester.
2. **Spelvyn:** visningen, knapparna, att handlingar blockeras, berättelsen, dagboken och tillgängligheten.
3. **Storyboard:** kortet, panelen, linjerna till utlösaren, och menyvalen.
4. **Kontrollen,** översättningarna och ett exempel med alla tre utlösare.

Stanna för provkörning i webbläsaren efter steg 2 och steg 4.

## Senare, inte nu

- Musik och ljud i en mellanscen.
- Att AI:n läser upp eller varierar texten med äventyrets röst.
- Att alltid hoppa över mellanscener man redan sett, när man spelar om ett äventyr.
- Startsidan, som får ett eget beslut.
