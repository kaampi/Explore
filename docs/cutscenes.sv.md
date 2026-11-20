# Designbeslut: mellanscener och mellanscen-studion

Beslutat 20 november 2026. Version 3. Ersätter version 1 och 2 av samma dokument.

Version 1, med stycken och en bild, är byggd i PR #36: utlösare, kö, spärr mot handlingar och visning. Den här versionen delar mellanscenen i två: en **film**, som skapas i en egen studio, och en **placering** i ett äventyr. Filmen byggs av steg och kanaler. PR #36 är inte sammanslagen, så modellen kan ändras. En överföring från version 1:s format ingår ändå (se *Data*).

Dokumentet är skrivet för att kunna byggas **självständigt**, utan att fråga designern. Läs *Två delar*, *Gränssnitt* och *Arbetsregler* först.

## Två delar

| | Filmen | Placeringen |
| --- | --- | --- |
| Vad | Bilder, ljud, text, effekter och takt. Det spelaren ser och hör. | När filmen visas i ett äventyr, och vad som händer efteråt. |
| Skapas i | **Mellanscen-studion**, en egen studio i biblioteket, som Anatomy och Morph Studio | **Storyboard**, i Adventure Builder |
| Sparas | I biblioteket, som andra kort. Samma film kan användas i flera äventyr. | I äventyret |
| Påverkar spelet | Nej, aldrig | Ja: faktum som sätts och tid som går. Senare också värden, som Sanity (se *Utfall som ändrar värden* i `TODO.md`). |

Studion är en fristående del av Explore. Den levererar visuella och ljudmässiga scener och vet ingenting om spel, faktum eller äventyr.

## Vad en film är

En film byggs av **steg**. I varje steg kan tre **kanaler** göra något samtidigt: **bild**, **ljud** och **text**, var och en med sin egen effekt, fördröjning och längd. Mellan stegen styr läsaren takten med ett klick, om inte författaren har valt att ett steg går vidare av sig självt.

Exempel, steg 1: bilden "sovrum" tonar in på 2 sekunder, ett dovt brus tonar in, och texten "You wake up with a terrible headache" skrivs fram med start efter 0,5 sekunder. Spelaren klickar. Steg 2: bilden ligger kvar, en knackning hörs, och texten "Someone is at the door." tonar in.

I gränssnittet heter den "Cut-scene" på engelska, "Mellanscen" på svenska och "Mellomscene" på norska. Studion heter "Cut-scene Studio", "Mellanscen-studion" och "Mellomscene-studio".

## Gränssnitt: indata och utdata

Spelaren och studion har var sitt gränssnitt. Ingen av dem läser eller skriver spelets läge.

### Spelaren: som en film

```ts
type CutscenePlayerProps = {
  // Indata
  film: CutsceneFilm;                  // steg, bilder och inställningar
  theme: PlayTheme;                    // typsnitt, färger och ornament
  simple: boolean;                     // minskad rörelse, högre kontrast eller "Enkla ramar"
  sound: { enabled: boolean; volume: number; loadTrack: (id: string) => Promise<Blob | null> };
  // Utdata: anropas exakt en gång
  onEnd: (how: "finished" | "skipped") => void;
};
```

- **Under uppspelningen skrivs ingenting,** varken i spelet eller i biblioteket.
- **När filmen är slut** anropas `onEnd` en gång. "Hoppa över" ger samma sak, med `"skipped"`. Avbryts den, till exempel för att fönstret stängs, anropas ingenting.
- Spelaren används på två ställen: i spelet och i studions förhandsvisning.

### Studion: ett kort in, ett kort ut

```ts
type CutsceneStudioProps = {
  // Indata
  film: CutsceneFilm | null;           // null: en ny film
  previewTheme: PlayTheme;             // temat för förhandsvisningen, går att byta i studion
  // Utdata
  onSave: (film: CutsceneFilm) => void;
  onClose: () => void;
};
```

Studion vet ingenting om scener, vägar eller faktum. Den kan öppnas på två sätt:

- **Från biblioteket,** under fliken "Mellanscener", som andra studior. Där finns en lista över alla filmer.
- **Från Storyboard,** när en placering ska ha en ny film eller filmen ska ändras. Då öppnas samma studio i en bred dialog, och `onSave` sparar filmen i biblioteket.

### Spelet

Spelet gör tre saker:

1. Avgör *när* en placering ska visas, med utlösare och kö (byggt i PR #36).
2. Visar spelaren med placeringens film.
3. Tar emot `onEnd`. Först då sätts placeringens faktum och tid, och raden skrivs i berättelsen och dagboken.

Det är hela kontaktytan mellan mellanscener och spelet.

## Arbetsregler

Det här gäller för den som bygger, och går före allt annat i dokumentet.

1. **Påverka spelets kod så lite som möjligt.** All ny kod läggs i:
   - `src/cutscenes/`: datamodellen, överföringen från det gamla formatet, och spelarens tidslogik som rena funktioner
   - `src/ui/cutscenes/`: spelaren och studion.

   Utanför de mapparna får bara det ändras som står i *Anslutningar*.
2. **Bara färdiga val, ingen fri CSS eller kod.** Allt författaren väljer är uppräknade värden med gränser.
3. **Färger** kommer bara från `src/ui/tokens.css` och spelvyns tema (`--play-*`, `--ornament-*`).
4. **Gemensamma komponenter:** `Button`, `IconButton`, `Menu`, `MenuButton`, `ListRow`, `Modal` och `StudioList` i `src/ui/`, och ornamenten i `src/ui/play/ornament/`.
5. **All ny text** går genom `LanguageProvider` på engelska, svenska och norska.
6. **När något är oklart,** välj det enklaste som uppfyller kraven. Skriv beslutet och skälet i `docs/cutscenes-notes.md`, ett datum och några rader per beslut. Ändra inte det här dokumentet.
7. **Före varje commit** ska `npm run typecheck`, `npm run lint`, `npx prettier --check .` och `npm test` vara gröna.
8. **En gren och PR per delmål,** som utkast mot `main`. Slå inte ihop något själv.

## Data

### Filmen, i biblioteket

I `src/cutscenes/schema.ts`:

```ts
const Seconds = z.number().min(0).max(30);
const Delay = z.number().min(0).max(10).default(0);

export const CutsceneImageSchema = z.object({
  id: z.string().min(1),
  /** Från sceneImagesFromFile i src/ui/studio/portrait.ts: bilden och en miniatyr. */
  dataUrl: z.string(),
  thumbDataUrl: z.string(),
  /** Vad bilden visar, för skärmläsare. */
  alt: z.string().max(200).default(""),
});

export const ImageCellSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("keep") }),                          // förra bilden ligger kvar
    z.object({ kind: z.literal("set"), imageId: z.string().min(1) }),
    z.object({ kind: z.literal("clear") }),
  ]),
  in: z.object({ effect: z.enum(["none", "fade", "slide-left", "slide-right", "zoom-in"]), seconds: Seconds.default(1), delay: Delay }),
  out: z.object({ effect: z.enum(["none", "fade", "fade-black", "fade-white"]), seconds: Seconds.default(1) }),
  /** Omgång 2. Följer bilden så länge den ligger kvar, även över flera steg. */
  during: z.enum(["none", "slow-zoom", "pan-left", "pan-right", "shake", "unblur"]).default("none"),
  /** Omgång 2. */
  filter: z.enum(["none", "dark", "grayscale", "sepia", "cold", "warm"]).default("none"),
});

export const SoundCellSchema = z.object({
  action: z.enum(["none", "music", "stop-music", "effect"]),
  /** Ett spår i ljudbiblioteket (src/ui/audio/audioStorage.ts). */
  trackId: z.string().optional(),
  volume: z.number().min(0).max(1).default(0.8),
  fadeSeconds: Seconds.default(0),
  delay: Delay,
  /** Visas som text när ljudet är avstängt, till exempel "[Det knackar på dörren]". */
  caption: z.string().max(120).default(""),
});

export const TextCellSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  style: z.enum(["narrator", "title", "whisper", "shout", "letter"]).default("narrator"),
  size: z.enum(["small", "normal", "large"]).default("normal"),
  position: z.enum(["top", "middle", "bottom"]).default("bottom"),
  align: z.enum(["left", "center", "right"]).default("left"),
  font: z.enum(["reading", "heading"]).default("reading"),
  in: z.object({ effect: z.enum(["none", "fade", "typewriter", "zoom-in", "slide-up"]), seconds: Seconds.default(1), delay: Delay }),
  out: z.object({ effect: z.enum(["stay", "fade", "zoom-out"]), seconds: Seconds.default(0.5) }),
});

export const BeatSchema = z.object({
  id: z.string().min(1),
  image: ImageCellSchema.default({ source: { kind: "keep" }, in: { effect: "none" }, out: { effect: "none" } }),
  sound: SoundCellSchema.default({ action: "none" }),
  text: TextCellSchema.optional(),
  advance: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("click") }),
    z.object({ kind: z.literal("after"), seconds: z.number().min(1).max(30) }),
  ]).default({ kind: "click" }),
});

export const CutsceneFilmSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  /** column: i mittkolumnen. fullscreen: över hela spelvyn (inte webbläsarens helskärm). */
  display: z.enum(["column", "fullscreen"]).default("column"),
  skippable: z.boolean().default(true),
  images: z.array(CutsceneImageSchema).max(30).default([]),
  beats: z.array(BeatSchema).min(1).max(60),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

- Filmerna sparas i ett nytt lager i bibliotekets databas, `cutscenes`, med samma mönster som de andra korten i `src/persistence/IndexedDBRepository.ts`. De följer med i bibliotekets export och import, utom ljudet (se nedan).
- **Bilder:** varje bild högst 2 MB, efter `sceneImagesFromFile`. Studion säger ifrån och föreslår en mindre bild om den är större.
- **Ljud** lagras inte i filmen, bara spårets id. Ljudbiblioteket är medvetet skilt från sessioner och export (se kommentaren i `audioStorage.ts`). Saknas spåret hörs inget, och `caption` visas. Ljud i delade äventyr hör till äventyrsfilen i Explore 2.0.

### Placeringen, i äventyret

`CampaignTemplateSchema` får `cutscenes`:

```ts
export const CutscenePlacementSchema = z.preprocess(fromVersion1, z.object({
  id: z.string().min(1),
  filmId: z.string().min(1),
  trigger: CutsceneTriggerSchema,       // link, scene (med every), facts: som i version 1
  /** Visas filmens texter i berättelsen och dagboken efteråt. */
  showInStory: z.boolean().default(true),
  /** Det som händer när filmen är slut eller hoppas över. */
  setsFlags: z.array(z.string().min(1)).default([]),
  minutes: z.number().int().nonnegative().optional(),
  position: StoryboardPositionSchema.optional(),
  storyboardSectionId: z.string().min(1).optional(),
}));
```

- **När ett spel startar** kopieras placeringarna och deras filmer in i spelet (`AdventureRunSchema`: `cutscenes` och `cutsceneFilms`), som kopplingarna redan kopieras. Ett pågående spel ändras då inte när någon redigerar en film eller ett äventyr.
- **Överföring från version 1 (`fromVersion1`):** en mellanscen i det gamla formatet (`title`, `paragraphs`, `imageDataUrl`, `trigger`, `setsFlags`, `minutes`) blir en placering och en film med ett steg per stycke och "vänta på klick". Bilden sätts i första steget och ligger kvar. Tester visar att ett sparat spel i det gamla formatet spelas som förut.
- Utlösare, ordning, "en gång per spel", kön och spärren mot handlingar fungerar som i PR #36 och ändras inte. Kön innehåller placeringarnas id.

## Spelaren

Spelaren är en ren tidslogik i `src/cutscenes/playback.ts` och en visning i `src/ui/cutscenes/CutscenePlayer.tsx`.

**Inom ett steg** startar alla kanaler samtidigt, var och en efter sin egen fördröjning, med sin egen effekt och längd.

**Klick, Enter eller mellanslag:**

1. Om något i steget fortfarande pågår (toning, framskrivning) blir allt klart direkt.
2. Annars, och om steget väntar på klick, går spelaren till nästa steg.
3. Efter sista steget anropas `onEnd("finished")`.

**Steg som går vidare av sig självt** gör det när alla kanaler är klara och de valda sekunderna har gått. En pausknapp finns alltid när filmen har sådana steg.

**Escape** gör ingenting. **"Hoppa över"** finns när `skippable` är sant och anropar `onEnd("skipped")`.

**Bild:**

- `keep` behåller bilden och dess pågående `during`-effekt.
- `set` tonar ut den gamla med dess `out` och tonar in den nya med `in`.
- `clear` tonar ut.

**Ljud:**

- `music` startar musik som fortsätter över stegen, i slinga, tills `stop-music` eller filmens slut, där den tonas ut på 1 sekund.
- `effect` spelas en gång.
- Volymen och av-läget kommer från spelets ljudval. Är ljudet avstängt eller blockerat av webbläsaren visas `caption`.

**Text:**

- `stay` ligger kvar tills nästa steg har en egen text.
- `typewriter` skriver fram texten på den valda längden.
- Text över en bild får automatiskt en mörk ton bakom sig (`--scrim`), och kontrasten ska klara 4,5 : 1.
- Stilarna hämtar typsnitt och färger från temat:

  | Stil | Utseende |
  | --- | --- |
  | `narrator` | Vanlig berättartext |
  | `title` | Rubrikens typsnitt, på temats namnskylt |
  | `whisper` | Mindre och kursiv, svagare färg |
  | `shout` | Större och fetare |
  | `letter` | På temats lapp (`NoteCard`) |

**Visning:**

- `column` ersätter mittkolumnen.
- `fullscreen` lägger ett lager över hela spelvyn i temats bakgrund.
- Bilden fyller ytan och beskärs vid behov. Texten placeras enligt `position` inom en läsbredd.

**Tillgänglighet:**

- Filmen är en region med titeln som namn, och fokus flyttas dit.
- Varje ny text meddelas med `aria-live="polite"`, och bildens `alt` läses när bilden byts.
- Vid `prefers-reduced-motion` eller "Enkla ramar" blir alla rörelser direkta, toningar högst 150 ms, och framskrivning hela texten på en gång.

## I spelet

- Medan kön inte är tom visas spelaren med den första placeringens film, och handlingar tas inte emot (byggt i PR #36).
- När `onEnd` kommer anropar spelet `finishCutscene`. Den sätter placeringens faktum och tid, tar nästa i kön, och skriver en rad i berättelsen och dagboken om `showInStory` är sant.
- **Raden** har filmens titel på en avdelare och alla stegens texter som prosa. En placering som startats av en väg ligger *före* avdelaren för platsen man kommer till. Det är också de två rättningarna som återstår från granskningen av PR #36.

## Studion

En egen vy i biblioteket, "Mellanscener", bredvid de andra studiorna (`StudioView` i `src/ui/studio/types.ts` och fliken i `StudioShell.tsx`).

**Listan till vänster** (`StudioList`) visar alla filmer med miniatyr, titel och antal steg. Där finns "+ Ny film", och raderna har en meny med Duplicera, Byt namn och Ta bort. Ta bort varnar om filmen används i ett äventyr och säger i vilket.

**Arbetsytan till höger:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Titel ................]   Visning: Kolumn ▾  Får hoppas över ☑  Tema ▾ │
├─────────────────────────────────────────────────────────────────────────┤
│                 Förhandsvisning (16:9, i valt tema)                      │
│                 ▶ Spela från början   ▶ Spela det här steget             │
├───────────┬──────────┬──────────┬──────────┬────────┬───────────────────┤
│           │ Steg 1   │ Steg 2   │ Steg 3   │   +    │  Cellen           │
│ Bild      │ [mini]   │  ↳ kvar  │ [mini]   │        │  (fälten för den  │
│ Ljud      │ ♪ brus   │ ♪ knack  │  –       │        │   valda cellen)   │
│ Text      │ "You..." │ "Some.." │  –       │        │                   │
│ Gå vidare │ klick    │ klick    │ 3 s      │        │                   │
└───────────┴──────────┴──────────┴──────────┴────────┴───────────────────┘
```

- **Överst:** titel, visning (kolumn eller helskärm), "får hoppas över", och vilket tema förhandsvisningen använder (Neutral, Fantasy, Sci-fi eller ett eget). Temat är bara för förhandsvisningen. I spelet används äventyrets tema.
- **Förhandsvisningen** använder samma `CutscenePlayer` som spelet. `onEnd` stänger bara uppspelningen.
- **Rutnätet:** steg som kolumner och kanaler som rader.
  - Varje cell är en knapp med en kort sammanfattning: miniatyr, ljudets namn, textens början eller "kvar".
  - Piltangenterna flyttar mellan cellerna.
  - "+" lägger till ett steg efter det valda.
  - Steg kan dras till ny plats, och flyttas med tangentbordet via stegets meny.
  - Stegets meny (`MenuButton` och högerklick) har Duplicera, Flytta vänster, Flytta höger och Ta bort. Ta bort ligger sist.
- **Panelen för cellen**, till höger:
  - **Bild:** välj ur filmens bilder eller ladda upp, eller "behåll förra" eller "ingen bild". In-effekt och längd, ut-effekt och längd, fördröjning, och bildtext för skärmläsare. I omgång 2 även under-effekt och filter.
  - **Ljud:** åtgärd, spår ur ljudbiblioteket (med uppladdning via `addAudioTrack`), volym, toning, fördröjning och textning.
  - **Text:** texten, stil, storlek, placering, justering, typsnitt, in- och uteffekt, längd och fördröjning.
  - **Gå vidare:** klick eller efter X sekunder.

  Varje panel har "Spela det här steget".
- **Spara:** studion arbetar i ett utkast. "Spara" anropar `onSave`, och ändringarna sparas i biblioteket. Att lämna med osparade ändringar frågar först.
- **Ångra och gör om** med Ctrl+Z och Ctrl+Y (Cmd på Mac). Det är en lista med versioner av utkastet, högst 100.
- **Mindre skärmar:** under 1024 px blir rutnätet en lista med steg och panelen en egen vy.

## Storyboard

Här sätts placeringarna. Det enda studion och Storyboard delar är filmens id.

- **Kortet** för en placering har streckad kant, en filmremsa vid titeln, och filmens första bild som miniatyr.
- **Att lägga till:** "+ Mellanscen" i verktygsraden, och "Lägg till mellanscen" i högerklicksmenyerna för en scen och för en väg. Från en scen eller väg fylls utlösaren i automatiskt.
- **En prickad linje till utlösaren:** till scenen eller till mitten av vägen. För faktum finns ingen linje. Kortet visar i stället "När: …" med faktumen i ord, eller "När målet nås".
- **Panelen** för en placering har:
  - **Film:** välj en film ur biblioteket, "Skapa ny film" eller "Redigera filmen". De två sista öppnar studion i en bred dialog.
  - **Startas av:** en väg, en scen ("första gången" eller "varje gång"), eller "när spelaren vet att …".
  - **Visas i berättelsen efteråt:** ja eller nej.
  - **När den är slut:** faktum som sätts, och tid som går.

  Faktumen väljs ur samma lista som för kopplingar och visas i ord. Senare tillkommer värden, när utfall som ändrar värden är byggt.
- **Ordna** lägger placeringar för en väg eller scen bredvid sin utlösare, och placeringar för faktum i en egen rad.

## Kontroll före spel

Äventyrskontrollen får varningar, som inte hindrar spel:

- Placeringen pekar på en väg, scen eller film som inte finns.
- Faktumen kan aldrig sättas av något i äventyret.
- Filmen saknar steg, eller använder en bild eller ett ljudspår som saknas.

## Anslutningar

Det enda som får ändras utanför `src/cutscenes/` och `src/ui/cutscenes/`:

| Fil | Ändring |
| --- | --- |
| `src/persistence/IndexedDBRepository.ts` | Lagret `cutscenes` och metoderna för att läsa, spara och ta bort filmer, som för andra kort. Med i bibliotekets export och import. |
| `src/ui/studio/types.ts` och `StudioShell.tsx` | Vyn och fliken "Mellanscener". |
| `src/game/CutsceneSchema.ts` | Exporterar placeringen och filmen från `src/cutscenes/schema.ts`. |
| `src/game/AdventureSchema.ts` | `cutscenes` (placeringar) och `cutsceneFilms` i spelet. |
| `src/session/adventureStart.ts` | Kopierar placeringarna och deras filmer in i spelet. |
| `src/game/cutscenes.ts` | Logiken för utlösare och kö är oförändrad. `finishCutscene` anropas bara från `onEnd`, och skriver raden ur stegens texter. |
| `src/library/LibrarySchema.ts` | `cutscenes` (placeringar) på äventyret. |
| `src/ui/play/CutsceneView.tsx` | Ersätts av en tunn omslutning runt `CutscenePlayer`, eller tas bort. |
| `src/ui/components/EncounterPanel.tsx` och `src/ui/play/PlayFrame.tsx` | Bara för att visa spelaren och lagret för helskärm. |
| `src/ui/play/storyRows.ts`, `StoryLog.tsx` och `Journal.tsx` | Raden och dess placering. |
| `src/ui/studio/StoryboardCanvas.tsx` och `PlayableStoryboard.tsx` | Kortet, linjen, menyvalen och panelen för placeringen. |
| Äventyrskontrollen | Varningarna ovan. |
| `src/ui/i18n/LanguageProvider.tsx` | Texterna. |

## Byggordning

Varje delmål är en egen gren och PR, som utkast. Spelaren och studion byggs och provas först mot sina gränssnitt, med tester och en testsida, innan de ansluts till spelet. Efter varje delmål: skärmbilder och en kort rapport till den som gav uppdraget. Fortsätt sedan med nästa, om inget annat sägs.

1. **Modell och tidslogik:** `schema.ts` med film, placering och överföringen från version 1, och `playback.ts` som ren funktion. Bara tester. Bygg vidare på PR #36:s gren.
2. **Spelaren:** `CutscenePlayer` mot sitt gränssnitt. Kolumn och helskärm, kanalernas in- och uteffekter, textstilar, ljud och tillgänglighet. Anslut den sedan till spelet i stället för `CutsceneView`, med raderna i berättelsen och dagboken och de två rättningarna.
3. **Studion:** lagret i biblioteket, fliken, listan, rutnätet, panelerna, förhandsvisningen, bilder, ljud, ångra, och export och import.
4. **Storyboard och kontrollen:** placeringarnas kort, linje, menyer och panel, och varningarna. Dessutom ett **exempel** som följer med appen: ett litet äventyr med en inledning ("You wake up with a terrible headache", bild som tonar in, framskriven text, brus), en resa på en väg med restid, en händelse när ett faktum sätts, och en epilog när målet nås.
5. **Omgång 2:** under-effekterna (Ken Burns, panorering, skakning, oskärpa), filtren, och textstilen `letter` på lapp, om den inte redan är gjord.

## Krav på tester

1. Schemat: gränser, standardvärden, och att version 1:s format blir film och placering.
2. `playback.ts`:
   - fördröjning och längd per kanal
   - klick som gör klart och klick som går vidare
   - steg som går vidare av sig självt, med paus
   - bild och musik som ligger kvar över steg
   - att "Hoppa över" och att läsa färdigt båda ger ett enda `onEnd`.
3. Spelaren mot sitt gränssnitt:
   - `onEnd` anropas exakt en gång, och aldrig vid avbrott
   - ingenting skrivs under uppspelningen
   - Escape gör ingenting
   - fokus och `aria-live` fungerar
   - vid minskad rörelse och "Enkla ramar" visas allt direkt.
4. Text över bild klarar 4,5 : 1 i Neutral, Fantasy och Sci-fi.
5. Ljud: avstängt eller saknat spår ger textningen, och musik slutar när filmen slutar.
6. I spelet: faktum och tid sätts först vid `onEnd`, raden har titeln, och en resa ligger före ankomsten.
7. Studion:
   - skapa, duplicera och ta bort filmer, med varning när filmen används
   - lägga till, flytta, duplicera och ta bort steg
   - redigera varje sorts cell
   - ångra och gör om
   - osparade ändringar frågar innan man lämnar
   - allt går med tangentbordet
   - export och import av biblioteket tar med filmerna.
8. Storyboard: en placering från en väg och från en scen ger rätt utlösare, och studion öppnas och sparar.
9. Kontrollen ger varningarna.
10. Inga direkta färger: testet som räknar dem får inte gå upp.
11. **Provkörning i webbläsaren** med exemplet i Neutral, Fantasy och Sci-fi, i kolumn och helskärm, och vid 1440 och 1024 px.

## Utanför uppdraget

- AI som läser upp eller varierar texten.
- Fri tidslinje med tidpunkter på sekunden.
- Val eller förgreningar inne i en film.
- Egna färger, egna typsnitt eller egen CSS.
- Ljud och bilder i delade äventyrsfiler (Explore 2.0).
- Att ändra värden som Sanity efter en mellanscen. Det kommer med *utfall som ändrar värden* och läggs då på placeringen.
- Startsidan, som får ett eget beslut.
