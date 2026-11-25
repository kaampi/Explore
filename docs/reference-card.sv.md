# Designbeslut: referenskort för karaktärer

Beslutat 25 november 2026, version 2 samma dag efter Astras granskning. Gäller karaktärsbiblioteket (Bygg → Karaktärer), bildprompter för karaktärer i biblioteket och i guiden, och kopplingen till Codex. Bygger på `ownership.sv.md`. Ansluter till guidens bildspår (`guide-b2.sv.md`).

## Varför

Ett referenskort är den viktigaste bilden av en karaktär. Det styr alla andra bilder: porträttet i spelet, scenbilder och serierutor i Comic. Kortet är ett underlag för författaren, inte en bild för spelaren.

Kortet innehåller vanligen:
- en kroppsskiss framifrån, från sidan och bakifrån
- porträtt framifrån och i profil
- några uttryck, till exempel vänlig, koncentrerad, bekymrad och lugn
- detaljer: öga, hårets struktur, hudens struktur
- fakta: ålder, längd, byggnad, hår, ögon, hud
- en färgpalett.

Kortet görs i ett bildverktyg utanför Explore och sparas som en enda bild. Explore delar inte upp bilden. Fakta och palett sparas dessutom som data, eftersom det är dem en bildprompt bygger på.

## Grundregler

1. **Referenskortet har en egen plats på karaktären.** Det ligger inte i galleriet, är inte ett känsloutryck och kan inte väljas som porträtt.
2. **Ett aktivt kort per karaktär, med versioner.** Varje sparad ändring blir en ny version med ett nytt nummer. Ett nummer används aldrig två gånger. Tidigare versioner sparas och kan väljas igen.
3. **Fakta och palett är data.** De går att läsa och ändra som text, och det är de som en prompt bygger på.
4. **Kortet visas aldrig för spelaren.** Det är aldrig med i en spelomgång, i spelvyn, i exporten av ett spel eller i det som skickas till berättande AI.
5. **Codex är den gemensamma källan när karaktären är kopplad dit.** Explore använder alltid en egen kopia av en bestämd version, så att allt fungerar offline.
6. **En funktion bygger alla karaktärsprompter,** både i biblioteket och i guiden.

## Data

Ett nytt valfritt fält på `CharacterTemplateSchema`:

```ts
reference?: {
  cardId: string;                    // samma för alla versioner av kortet
  versions: CharacterReference[];    // högst 6, nyaste numret först
  activeVersion: number;             // numret på den version som används
  latestVersion: number;             // det högsta nummer som någonsin har getts
  codexBase?: CodexBase;             // se "Codex som gemensam källa"
};

type CharacterReference = {
  version: number;       // 1, 2, 3 …
  basedOn?: number;      // versionen som ändringen utgick från
  createdAt: string;
  imageDataUrl: string;  // kortet, nedskalat som andra bilder i biblioteket
  thumbDataUrl: string;
  imageHash: string;     // SHA-256 av bilden, för att jämföra utan att jämföra bilder
  facts: ReferenceFacts;
  palette: PaletteColor[];
  styleNote?: string;    // hur kortet är tecknat: "fotografiskt", "akvarell"
  source: { kind: "local" } | { kind: "codex"; revision: number };
};

type ReferenceFacts = {
  age?: string;          // text, inte tal: "34", "i 30-årsåldern"
  height?: string;       // "183 cm"
  build?: string;        // "smal"
  hair?: string;         // "mörkbrunt, vågigt"
  eyes?: string;         // "blågröna"
  skin?: string;         // "ljus"
  marks?: string;        // ärr, födelsemärken, särdrag
  other: { label: string; value: string }[];
};

type PaletteColor = {
  role: "skin" | "hair" | "eyes" | "clothing" | "other";
  label: string;         // "Hår (mörkbrun)"
  color: string;         // "#5a3e2b"
};
```

- `facts` fylls första gången från karaktärens `approximateAge` och `appearance`. Författaren kan sedan ändra fritt. Att läsa av fakta och färger ur bilden med AI kan läggas till senare. Det gör ingenting utan författarens godkännande.
- Kopplingen till Codex finns redan på karaktären (`coreOrigin`), så kortet anger bara Codex revision.
- Det här är en ändring av bibliotekets format. Den följer formatregeln i `ownership.sv.md`: fältet är valfritt, och kod som sparar om en karaktär behåller det.

### Versionerna

1. **En version skapas när författaren sparar kortet.** Att byta bild, ändra fakta eller ändra paletten är ett utkast tills författaren väljer "Spara kortet". Ett utkast som inte sparas skapar ingen version.
2. **Den nya versionen får numret `latestVersion + 1`,** och `latestVersion` räknas upp. Numret beror alltså aldrig på vilken version som var aktiv, och det används aldrig igen.
3. **`basedOn`** anger vilken version ändringen utgick från.
4. **Att välja en tidigare version** gör den aktiv (`activeVersion`) men skapar ingen ny version. Ingenting ändras i den.
5. **Att ändra en tidigare vald version** skapar en ny version enligt punkt 2. Den gamla versionen finns kvar oförändrad.
6. **Gallring:** högst sex versioner sparas. Den aktiva versionen gallras aldrig. När en sjunde version skapas tas versionen med det lägsta numret bort, efter att författaren har fått frågan. `latestVersion` och `codexBase` påverkas inte av gallringen.

**Exempel:** författaren sparar version 1, 2 och 3. Hen väljer version 1 igen; den blir aktiv, och inget nytt nummer skapas. Hen ändrar hårfärgen och sparar. Det blir version 4, med `basedOn: 1`. Version 1 kan fortfarande öppnas och visar den ursprungliga hårfärgen. Om version 1 och 2 senare har gallrats bort, blir nästa version ändå 5, eftersom `latestVersion` är 4.

## I karaktärsbiblioteket

På karaktärens sida, bredvid porträttet, finns avsnittet **Referenskort**:

- **Utan kort:** en tom ruta med "Lägg till referenskort" och en kort förklaring: "Ett referenskort styr alla bilder av karaktären. Det visas aldrig för spelaren."
- **Med kort:**
  - Miniatyren, som går att öppna i full storlek.
  - Versionen och datumet, till exempel "Version 3 · 25 nov".
  - Fakta i en tabell som går att redigera, och paletten som färgrutor med etiketter.
  - Knapparna "Byt kort", som skapar en ny version, och "Tidigare versioner".
  - Om kortet kommer från Codex: "Från Codex · revision 7", och en markering när Codex har en nyare revision (se nedan).
- Under avsnittet visas karaktärens **bildprompt för porträtt**, byggd med den gemensamma funktionen och med en knapp för att kopiera.

Kortet visas inte i galleriet, inte i Morph och inte i listan där porträttet väljs.

## Utanför spelet och exporten

| Var | Referenskortet |
| --- | --- |
| Spelvyn, galleriet, personkort i spelet | finns inte |
| En spelomgång (`Session`) | kopieras inte med när karaktären läggs in |
| Det som skickas till berättande AI | aldrig, varken bild eller fakta |
| Export av ett spel, till exempel för itch.io | tas bort |
| Bibliotekets säkerhetskopia | finns med, eftersom det är författarens eget material |
| Bildprompter | fakta och palett används, och bilden skickas med till verktyg som tar emot referensbilder |

Det ska finnas tester för varje rad. Den som lägger till ett nytt ställe där en karaktär kopieras, ska välja uttryckligen om `reference` följer med.

## Codex som gemensam källa

**Målet:** Write, Comic och Explore pekar på samma referenskort. Ett kort som görs i Comic kan användas i Explore och tvärtom.

**Så används det i Explore:**
1. En karaktär som redan är kopplad till Codex (`coreOrigin`) kan också hämta sitt referenskort därifrån. Kortet sparas som en ny version med `source: { kind: "codex", revision }`, och `codexBase` sätts till det som hämtades.
2. **Explore använder alltid sin egen kopia av den version som är aktiv.** Spel och prompter fungerar utan Codex och utan nät.
3. **När Codex har en nyare revision** visas det på karaktären: "Codex har en nyare version av referenskortet (revision 8)." Författaren väljer "Använd den" eller "Inte nu". Inget byts automatiskt.
4. **Om författaren har ändrat fakta eller palett lokalt** och Codex också har ändrat dem, visas båda bredvid varandra, som i dagens granskning av karaktärsändringar från Codex (`reviewCoreCharacter`). Ingenting skrivs över utan att författaren har valt. Hur jämförelsen görs beskrivs nedan.
5. **Ett kort som görs i Explore** är lokalt tills det skickas till Codex. Det kräver att Codex kan ta emot referenskort och ligger i ett senare steg. Formatet har redan `cardId`, `version` och `source`, så att inget behöver göras om då.

### Jämförelsen mot Codex

Explore jämför tre värden för varje del av kortet, på samma sätt som `reviewCoreCharacter` jämför mot `coreSnapshot`:

- **grunden:** det som senast godtogs från Codex
- **Codex:** den nya revisionen
- **lokalt:** den aktiva versionen i Explore.

**Grunden sparas för sig** i `codexBase`, inte bland versionerna. Därför finns den kvar även när de versioner den kom från har gallrats bort.

```ts
type CodexBase = {
  revision: number;
  imageHash: string;
  facts: ReferenceFacts;
  palette: PaletteColor[];
};
```

`codexBase` innehåller ingen bild, bara bildens `imageHash`, så den tar nästan ingen plats.

**Delarna som jämförs var för sig:**
- varje fast fakta: `age`, `height`, `build`, `hair`, `eyes`, `skin` och `marks`
- varje övrig fakta, med etiketten som nyckel
- varje färg i paletten, med `role` och `label` som nyckel
- bilden, med `imageHash`.

**För varje del:**

| Grunden mot Codex | Grunden mot lokalt | Resultat |
| --- | --- | --- |
| samma | vad som helst | ingen ändring, och delen visas inte |
| ändrad | samma | Codex ändring visas och kan godtas utan konflikt |
| ändrad | ändrad, till samma som Codex | ingen konflikt, delen är redan uppdaterad |
| ändrad | ändrad, till något annat | **konflikt**: båda visas, och författaren väljer |

**Astras exempel:** författaren ändrar håret lokalt. Codex ändrar både hår och ögon. Bara håret blir en konflikt. Ögonen visas som en ändring från Codex som kan godtas direkt.

**När författaren godtar** skapas en ny version enligt reglerna för versioner, med `source: { kind: "codex", revision }`. Den innehåller de valda värdena. `codexBase` sätts till hela den nya revisionen från Codex, även för delar där författaren behöll sitt lokala värde. Nästa jämförelse utgår då från det Codex senast skickade, och författarens lokala val räknas fortfarande som en lokal ändring.

**"Inte nu"** ändrar ingenting, varken versioner eller `codexBase`.

Gemensamma bildstilar via Codex (`TODO.md`) hör ihop med det här, men ingår inte i beslutet. Funktionen nedan tar emot en stil, så att stilarna kan kopplas in senare.

## Den gemensamma funktionen för bildprompter

En ren funktion i `src/library/characterImagePrompt.ts`:

```ts
characterImagePrompt({
  person: PortraitSource,
  subject: string,                  // "porträtt, huvud och axlar, lugnt uttryck" eller "i hamnen i regn, bekymrad"
  style?: { name: string; prompt: string },
  language: "en" | "sv" | "nb",
  referenceImages: boolean,         // om bildverktyget tar emot en referensbild
}): {
  text: string;                     // prompten att kopiera
  referenceImage?: string;          // kortets bild, bara när referenceImages är sant och kortet finns
  referenceVersion?: number;        // vilken version prompten bygger på
}
```

Funktionen tar emot ett porträttunderlag, inte en `CharacterTemplate`. Då kan guiden använda den för personer som inte har något bibliotekskort:

```ts
type PortraitSource = {
  name: string;
  approximateAge?: number;
  appearance?: string;
  note?: string;                    // intervjuanteckningen för en ny person, annars personligheten
  reference?: CharacterReference;   // den aktiva versionen, när det finns ett kort
};

portraitSourceFromCharacter(character: CharacterTemplate): PortraitSource
```

- **En sparad karaktär:** `portraitSourceFromCharacter` ger namn, ålder, utseende, personligheten som `note` och den aktiva versionen av kortet.
- **En ny person i guiden:** guiden anger namn, utseende och intervjuanteckningen. Inget kort.
- **Spelarrollen utan bibliotekskort:** guiden anger namn, utseende och personlighet från `campaign.player`. Inget kort.
- `note` följer alltid med i prompten, med och utan kort. Ingenting som B1 skickar med i dag försvinner.

- **Med ett aktivt kort** bygger prompten på kortets fakta och palett, med färgernas etiketter i ord. Kortets kläder följer inte med, om inte motivet ber om det.
- **Utan kort** bygger den på `approximateAge`, `appearance` och `note`, som B1 gör i dag. Ett äventyr fungerar alltså lika bra utan referenskort.
- Stilen läggs till sist. Utan stil läggs ingen till.
- Funktionen skickar aldrig något och sparar ingenting. Den bygger bara text.

**Guiden använder samma funktion.** Sol byter guidens egen sammanfogning av porträttprompten i `GuideImagePlan.tsx` mot `characterImagePrompt` för porträtt. Förslag för platser, föremål och scener påverkas inte.

**Om ett porträttförslag visas beror bara på om porträttet saknas,** inte på om ett referenskort finns. En violinist med ett komplett referenskort men utan porträtt för spelet får fortfarande porträttförslaget i guiden. Prompten blir då bättre, eftersom den bygger på kortet.

## Vem bygger vad

| Del | Spår |
| --- | --- |
| Fältet `reference`, versionerna och reglerna för vad som följer med | Claude (Sonnet bygger) |
| Avsnittet Referenskort på karaktärens sida | Claude |
| `characterImagePrompt` | Claude, granskas av båda |
| Hämtning från Codex och granskning av nya revisioner | Claude |
| Guiden använder `characterImagePrompt` för porträtt | ChatGPT (Sol) |

## Krav på tester

1. Versionerna:
   - Ett referenskort sparas som version 1, och nästa sparade ändring blir version 2.
   - Version 1, 2 och 3, välj version 1, ändra hårfärgen och spara: det blir version 4 med `basedOn: 1`. Version 1 visar fortfarande den ursprungliga hårfärgen.
   - Ett utkast som inte sparas skapar ingen version.
   - Efter gallring används inget nummer igen, och den aktiva versionen gallras aldrig.
2. En karaktär utan `reference` fungerar exakt som i dag, och en karaktär som sparas om av guiden eller av Codex-granskningen behåller sitt kort.
3. `reference` kopieras inte till en spelomgång, finns inte i det som skickas till berättande AI och finns inte i exporten av ett spel. Det finns däremot i bibliotekets säkerhetskopia.
4. Kortet visas inte i galleriet, i Morph eller bland porträtten.
5. `characterImagePrompt`:
   - med kort: prompten innehåller kortets fakta och färger i ord, men inte kläderna om motivet inte ber om dem
   - utan kort: samma innehåll som B1:s porträttprompt i dag, även `note`
   - för en ny person i guiden och för en spelarroll utan bibliotekskort, via `PortraitSource`
   - stilen läggs till, och `referenceImage` finns bara när verktyget tar emot referensbilder.
6. Guiden föreslår porträtt för en karaktär som har ett referenskort men inget porträtt, och prompten bygger då på kortet.
7. Codex:
   - En nyare revision visas men byts inte automatiskt. "Inte nu" ändrar ingenting.
   - Astras exempel: lokalt ändrat hår, och Codex ändrar hår och ögon. Bara håret blir en konflikt.
   - Jämförelsen fungerar även när versionen som `codexBase` kom från har gallrats bort.
   - Efter att författaren har godtagit är `codexBase` hela den nya revisionen, och ett behållet lokalt värde räknas fortfarande som en lokal ändring.

**Provkörning i webbläsaren,** med skärmbilder i ljust och mörkt läge:
- Lägg till ett referenskort för Gabriel Lindholm, fyll i fakta och palett, och kopiera porträttprompten.
- Byt kort, och välj sedan den tidigare versionen igen.
- Starta ett spel med Gabriel och kontrollera att kortet inte syns någonstans.

## Byggordning

1. Formatet granskas av Astra (fältet `reference`).
2. Fältet, versionerna och reglerna för vad som följer med, med testerna 1–4.
3. `characterImagePrompt`, med test 5. Den granskas av Astra, eftersom Sol bygger på den.
4. Avsnittet Referenskort på karaktärens sida.
5. Sol kopplar in funktionen i guiden, med test 6.
6. Hämtning från Codex och granskning av nya revisioner, med test 7.

Stanna för provkörning i webbläsaren efter steg 4.

## Inte i det här beslutet

- Att skicka ett kort från Explore till Codex. Det kräver att Codex tar emot referenskort.
- Gemensamma bildstilar via Codex.
- Att läsa av fakta och färger ur bilden med AI.
- Att dela upp kortet i separata bilder för kroppsvyer, porträtt och uttryck.
