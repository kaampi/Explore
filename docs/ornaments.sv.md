# Designbeslut: ornament i spelvyn

Beslutat 18 november 2026. Gäller spelvyn och det som öppnas från den: packningen, föremålens infokort, lappar, slagkort och dagboken. Appens ram (menyer, bibliotek, Adventure Builder, kartstudion) får inga ornament; den följer `palette.sv.md`.

Underlag: skisserna *Spelvyn · tema Fantasy*, *Spelvyn · tema Sci-fi*, *Packning och föremål · Fantasy* och *Utrustning och föremål · Sci-fi* på canvasen *Explore spelvy – skiss*, version 14.

Det här beslutet ersätter fälten `frame`, `corners` och `texture` i avsnittet *Teman* i `play-view.sv.md`. Övrigt där gäller.

## Varför

Spelvyn ska kännas som en plats i en berättelse, inte som ett formulär. Rollspel gör det med ramar, skyltar, pergament och föremålsfack. Vi tar det formspråket men inte spelmekaniken: inga livmätare, nivåer, valutor eller sällsynthetsfärger.

## Ornamentset

Ett tema väljer ett **ornamentset** och en **nivå**. Alla set har samma åtta delar, så layouten är densamma i alla teman.

| Del | Används till | Fantasy | Sci-fi |
| --- | --- | --- | --- |
| Ram | Scenbild, personkort, berättelsen, I scenen, packningen, infokort | Mässingshörn med dubbla linjer och ranka | Fasade hörn, tunna ljuslinjer |
| Namnskylt | Platsens namn, personens namn, panelrubriker | Spetsig skylt, antikva i versaler | Snedskuren flik med kant till vänster |
| Avdelare | Mellan avsnitt, före "Vad gör du?" | Linje med romb | Linje som tonar ut, rubrik i mitten |
| Medaljong | Porträtt | Rund ring med fyra spetsar | Sexkant med hörnmarkeringar |
| Lapp | Det man hittar och kan läsa | Pergament med rivna kanter, något snett | Avkodat meddelande, monospace |
| Föremålsfack | Saker på platsen, det man bär, packningen | Mörkt fack med mässingskant | Fack med avfasade hörn |
| Slagkort | Utfallet av ett slag | Sigill med siffran | Ringmätare med siffran |
| Valrad | Förslagen under "Vad gör du?" | Graverad rad med romb | Numrerad rad med fasat hörn |

Set som följer med: `plain` (Neutral), `forged` (Fantasy), `hull` (Sci-fi). Senare: `deco` (Noir), `vine` (Romance), `worn` (Skräck), `cloth` (Mysig). Ett set som saknar en del faller tillbaka på `plain`.

### Schemat

I `PlayThemeSchema` i `src/ui/themes/theme.ts`, i stället för `frame`, `corners` och `texture`:

```ts
ornament: z.enum(["plain", "forged", "hull"]).default("plain"),
ornamentLevel: z.enum(["none", "light", "full"]).default("full"),
headingFont: …, // som i play-view.sv.md
```

- `none`: bara tunna linjer, som `plain`. Samma som inställningen "Enkla ramar".
- `light`: ramar och namnskyltar, men inga hörnrankor, ingen struktur och inget snett pergament.
- `full`: som skisserna.

Spelaren kan alltid välja "Enkla ramar" i Utseende. Det gäller också automatiskt när systemet ber om minskad rörelse (`prefers-reduced-motion`) eller högre kontrast (`prefers-contrast: more`).

## Hur det byggs

1. **Ramar som SVG i nio delar** med `border-image`: fyra hörn, fyra kanter som sträcks och en tom mitt. Ett hörn ritas en gång och speglas. Ramen ligger i ett `::before` ovanpå panelen, så att innehållet inte påverkas.
2. **Färgerna kommer från temat.** SVG:erna byggs i kod med temats färger (`--ornament`, `--ornament-hi`, `--ornament-dim`) och läggs som `data:`-URI i en CSS-variabel när temat byts. Inga bildfiler och inga hårdkodade färger i komponenterna.
3. **Formerna** (spetsiga skyltar, fasade hörn, rivna pergamentkanter) görs med `clip-path`.
4. **Struktur** (pergamentkorn, skanningslinjer) är SVG-brus med låg täckning, bara på ramar och lappar.
5. **En komponent per del** i `src/ui/play/ornament/`: `Frame`, `NamePlate`, `Divider`, `Medallion`, `NoteCard`, `ItemSlot`, `CheckCard` och `ChoiceRow`. Varje komponent tar ett `set` från temat och har ingen egen logik om spelet.
6. **Typsnitten** följer med appen enligt `play-view.sv.md`. För de två första seten: Cinzel och IM Fell English (Fantasy), Oxanium och JetBrains Mono (Sci-fi). Kontrollera licensen (OFL) för varje typsnitt.

## Regler

- **Texten ligger alltid på en slät yta.** Ornament och struktur sitter i kanterna. Lappens text klarar 4,5 : 1 mot pergamentet.
- **Ornament finns där berättelsen är:** ramar, skyltar, lappar och fack. Knappar, flikar, inmatning och menyn ⋯ behåller appens lugna stil.
- **Huvudknappen** följer temat: plommon i Neutral och Fantasy, temats accent i Sci-fi. Högst en per panel.
- **Statusfärgerna** behåller sina betydelser. I Sci-fi tar bärnsten mässingens roll: upptäckter, "Spara idé" och låst.
- **"Magiskt"** och liknande egenskaper visas som ord i mässing, aldrig som en sällsynthetsfärg på facket.
- **Skärmläsare** läser inte ornamenten: allt dekorativt har `aria-hidden`, och skyltar är riktiga rubriker.

## Föremålens infokort

Samma kort öppnas från packningen, från "Saker på platsen" och från en rad i berättelsen. I mindre form blir det verktygstips när man pekar på ett fack.

Ordningen är alltid:

1. **Namnskylt och typ.**
2. **Bild**, annars föremålets ikon i stort format.
3. **Beskrivning.**
4. **Vad den gör:** det motorn vet. Vad den öppnar (barriärer med `keyId`), vad den kräver (`requiresFlags`) och vilka handlingar den ingår i. Skrivs som meningar, aldrig som flaggnamn.
5. **Enligt reglerna:** bara när regelverket har värden, till exempel vapnets skada (`weapon`) eller svårighet. Saknas regelverk visas inte avsnittet.
6. **Var den hittades:** plats och speldag, från spelets historik.
7. **Handlingar:** "Använd" som huvudknapp när det finns en handling, "Ge till …" när någon finns att ge till, och ⋯ för resten (Undersök, Lägg ner här, Lägg i dagboken, Släng). Släng ligger alltid i menyn.

Lappar (föremål med `readableContent`) öppnas som en lapp i stället för ett infokort.

## Packningen

- Fack i ett rutnät, fem i bredd. Valt fack har plommonkant (temats accent i Sci-fi).
- Två flikar: Saker och Lappar (Data i Sci-fi).
- Antalet fack är i dag bara utseende: tomma fack visas upp till nästa hela rad, minst 15. Det finns ingen gräns i motorn. Hur mycket man kan bära är en senare fråga, se `TODO.md`.
- Högerklick på ett fack öppnar samma meny som ⋯. Allt går också att nå med tangentbordet.

## Data

Det mesta finns redan:

- `ObjectTemplateSchema` har `imageDataUrl`, `readableContent`, `weapon` och `weight`.
- Motorns `items` i `EncounterSchema.ts` har `imageDataUrl`, `readableContent` och `requiresFlags`.

Det som läggs till:

1. **Ikon per föremål:** `icon: z.string().optional()` på `ObjectTemplateSchema` och motorns `items`, med en fast lista av ikonnamn (svärd, dolk, nyckel, brev, lykta, rep, flaska, ring, bröd, kort, chip, verktyg …). Saknas ikon väljs en från föremålets taggar, annars en neutral.
2. **Var den hittades:** en ren funktion `itemOrigin(session, itemId)` som läser historiken: platsen och speldagen när föremålet först hamnade hos spelaren. Inget nytt fält.
3. **Vad den gör:** en ren funktion `itemUses(game, itemId)` i `src/game/catalog.ts` som listar barriärer den öppnar, krav och handlingar den ingår i, som text.
4. **Magiskt:** taggen `magic` på föremålet ger ordet "magiskt" i typraden. Ingen ny regel.

## Krav på tester

1. Varje ornamentset har alla åtta delar eller faller tillbaka på `plain`, och varje set klarar kontrastkontrollen för text på ram, skylt och lapp.
2. `ornamentLevel: "none"` och "Enkla ramar" ger samma utseende som `plain`.
3. `itemUses` och `itemOrigin` testas med föremål som öppnar en barriär, kräver en upptäckt och saknar historik.
4. Infokortet visar inte "Enligt reglerna" när regelverk saknas, och aldrig ett flaggnamn.
5. Provkörning i webbläsaren med skärmbilder av spelvyn, packningen och ett infokort i Neutral, Fantasy och Sci-fi, i nivåerna `none`, `light` och `full`.

## Byggordning

Byggs som steg 10 i `play-view.sv.md`, efter att spelvyns layout är klar.

1. Schemat, variablerna och `plain`. Komponenterna med `plain`, så att spelvyn ser ut som i dag men använder dem.
2. `forged`: SVG-ramarna, skyltarna, lappen och sigillet.
3. `hull`.
4. Ikoner, `itemUses`, `itemOrigin`, infokortet och packningen.
5. "Enkla ramar", minskad rörelse och högre kontrast.

Stanna för provkörning i webbläsaren efter steg 2 och steg 4.
