# Designbeslut: referenskort för karaktärer

Beslutat 25 november 2026. Version 3 den 26 november: flera namngivna kort per karaktär, och varje äventyr minns sitt val. Version 2 preciserade versionsnummer och jämförelsen mot Codex efter Astras granskning.

Gäller karaktärsbiblioteket (Bygg → Karaktärer), bildprompter för karaktärer i biblioteket och i guiden, äventyrens val av utseende, och kopplingen till Codex. Bygger på `ownership.sv.md`. Ansluter till guidens bildspår (`guide-b2.sv.md`).

## Varför

Ett referenskort är den viktigaste bilden av en karaktär. Det styr alla andra bilder: porträttet i spelet, scenbilder och serierutor i Comic. Kortet är ett underlag för författaren, inte en bild för spelaren.

Samma karaktär kan behöva se olika ut i olika berättelser. Emma kan vara en alv i ett fantasyäventyr och pilot i ett sci-fi-äventyr. Hon är fortfarande samma person, med samma personlighet och samma historia i biblioteket. Därför kan en karaktär ha flera namngivna kort, och varje äventyr väljer vilket det använder.

Ett kort innehåller vanligen:
- en kroppsskiss framifrån, från sidan och bakifrån
- porträtt framifrån och i profil
- några uttryck, till exempel vänlig, koncentrerad, bekymrad och lugn
- detaljer: öga, hårets struktur, hudens struktur
- fakta: ålder, längd, byggnad, hår, ögon, hud
- en färgpalett.

Kortet görs i ett bildverktyg utanför Explore och sparas som en enda bild. Explore delar inte upp bilden. Fakta och palett sparas dessutom som data, eftersom det är dem en bildprompt bygger på.

## Grundregler

1. **Referenskorten har en egen plats på karaktären.** De ligger inte i galleriet, är inte känsloutryck och kan inte väljas som porträtt.
2. **En karaktär kan ha flera namngivna kort,** till exempel "Fantasy" och "Sci-fi". Ett av dem är förvalt.
3. **Varje kort har versioner.** Varje sparad ändring blir en ny version med ett nytt nummer, och ett nummer används aldrig två gånger.
4. **Varje äventyr minns vilket kort det använder.** Samma karaktär kan alltså användas i två äventyr med olika utseenden samtidigt.
5. **Fakta och palett är data.** De går att läsa och ändra som text, och det är de som en prompt bygger på.
6. **Korten visas aldrig för spelaren.** De är aldrig med i en spelomgång, i spelvyn, i exporten av ett spel eller i det som skickas till berättande AI.
7. **Codex är den gemensamma källan när karaktären är kopplad dit.** Explore använder alltid en egen kopia, så att allt fungerar offline.
8. **En funktion bygger alla karaktärsprompter,** både i biblioteket och i guiden.

## Data

### På karaktären

Ett nytt valfritt fält på `CharacterTemplateSchema`:

```ts
references?: {
  cards: ReferenceCard[];            // högst 8
  defaultCardId: string;             // det förvalda kortet, alltid ett av korten
};

type ReferenceCard = {
  cardId: string;                    // samma för alla versioner av kortet
  name: string;                      // "Fantasy", "Sci-fi", "Som ung"
  versions: CharacterReference[];    // högst 6, nyaste numret först
  activeVersion: number;             // numret på den version som används
  latestVersion: number;             // det högsta nummer som någonsin har getts för kortet
  portraitDataUrl?: string;          // spelporträttet för det här utseendet, se nedan
  codexBase?: CodexBase;             // se "Codex som gemensam källa"
  codexCardRef?: string;             // kortets id i Codex, när kortet kommer därifrån
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

- Det första kortet blir förvalt. Författaren kan välja ett annat förval när som helst.
- `facts` fylls första gången från karaktärens `approximateAge` och `appearance`. Författaren kan sedan ändra fritt. Att läsa av fakta och färger ur bilden med AI kan läggas till senare. Det gör ingenting utan författarens godkännande.
- Kopplingen till Codex finns redan på karaktären (`coreOrigin`). Kortet anger bara sitt id i Codex och revisionen.
- Det här är en ändring av bibliotekets format. Den följer formatregeln i `ownership.sv.md`: fältet är valfritt, och kod som sparar om en karaktär behåller det.

### På äventyret

Ett nytt valfritt fält på `CampaignTemplateSchema`:

```ts
characterLooks?: { characterId: string; cardId: string }[];
```

- Ett äventyr anger vilket kort det använder för en karaktär. Saknas en rad används karaktärens förvalda kort.
- Äventyret pekar på kortet, inte på en version. Prompter använder kortets aktiva version. Bilder som redan är sparade i äventyret ändras inte när kortet får en ny version.
- Det här är en ändring av äventyrets format och följer samma formatregel. Guiden ska behålla fältet när den sparar om ett äventyr.

### Vilket kort som gäller

En ren funktion i `src/library/characterReference.ts`:

```ts
referenceFor(character: CharacterTemplate, campaign?: CampaignTemplate): {
  card?: ReferenceCard;
  reference?: CharacterReference;    // kortets aktiva version
  portraitDataUrl?: string;          // spelporträttet för det här utseendet
}
```

1. Om äventyret har valt ett kort för karaktären, och kortet finns, används det.
2. Annars används karaktärens förvalda kort.
3. Utan kort finns inget kort. Då används karaktärens vanliga porträtt och `appearance`, som i dag.
4. Har äventyret valt ett kort som har tagits bort, används förvalet. Storyboard visar då en upplysning: "Emmas utseende Sci-fi finns inte längre. Förvalet Fantasy används."

All kod som behöver en karaktärs utseende i ett äventyr använder `referenceFor`: guiden, Storyboard, spelstarten och prompterna. Ingen väljer kort på egen hand.

## Spelporträttet för varje utseende

Ett äventyr med Emma som pilot ska inte visa porträttet av Emma som alv. Därför kan varje kort ha ett eget spelporträtt (`portraitDataUrl` på kortet).

- **När ett spel startar** hämtas porträttet med `referenceFor`. Kortets porträtt används om det finns. Annars används karaktärens vanliga porträtt, så att ingen person i spelet står utan bild.
- **Guidens porträttförslag** visas när det utseende som äventyret använder saknar ett eget porträtt. Om äventyret använder ett kort, sparar B2 porträttet på det kortet. Annars sparar B2 på karaktären, som i dag.
- En karaktär med ett enda kort och ett vanligt porträtt fungerar exakt som i dag. Kortets porträtt behövs först när det finns flera utseenden.

**Fråga till Astra och Sol:** B2 sparar i dag porträttet på karaktären. Med flera kort behöver B2 spara på det kort som äventyret använder. Det är en liten ändring av målet för sparandet, men den hör till B2. Ska den göras i #77, eller som en uppföljning när referenskorten finns?

## Versionerna

Reglerna gäller varje kort för sig.

1. **En version skapas när författaren sparar kortet.** Att byta bild, ändra fakta eller ändra paletten är ett utkast tills författaren väljer "Spara kortet". Ett utkast som inte sparas skapar ingen version.
2. **Den nya versionen får numret `latestVersion + 1`,** och kortets `latestVersion` räknas upp. Numret beror alltså aldrig på vilken version som var aktiv, och det används aldrig igen.
3. **`basedOn`** anger vilken version ändringen utgick från.
4. **Att välja en tidigare version** gör den aktiv (`activeVersion`) men skapar ingen ny version. Ingenting ändras i den.
5. **Att ändra en tidigare vald version** skapar en ny version enligt punkt 2. Den gamla versionen finns kvar oförändrad.
6. **Gallring:** högst sex versioner per kort sparas. Den aktiva versionen gallras aldrig. När en sjunde version skapas tas versionen med det lägsta numret bort, efter att författaren har fått frågan. `latestVersion` och `codexBase` påverkas inte av gallringen.

**Exempel:** författaren sparar version 1, 2 och 3 av kortet Fantasy. Hen väljer version 1 igen; den blir aktiv, och inget nytt nummer skapas. Hen ändrar hårfärgen och sparar. Det blir version 4, med `basedOn: 1`. Version 1 kan fortfarande öppnas och visar den ursprungliga hårfärgen. Om version 1 och 2 senare har gallrats bort, blir nästa version ändå 5, eftersom `latestVersion` är 4. Kortet Sci-fi har sina egna nummer och påverkas inte.

## I karaktärsbiblioteket

På karaktärens sida, bredvid porträttet, finns avsnittet **Referenskort**:

- **Utan kort:** en tom ruta med "Lägg till referenskort" och en kort förklaring: "Ett referenskort styr alla bilder av karaktären. Det visas aldrig för spelaren."
- **Med kort:** en rad flikar, en per kort, med kortets namn. Det förvalda kortet har märkningen "Förval". Sist finns "Lägg till referensbild".
- **Det valda kortet visar:**
  - Miniatyren, som går att öppna i full storlek.
  - Versionen och datumet, till exempel "Version 3 · 25 nov".
  - Fakta i en tabell som går att redigera, och paletten som färgrutor med etiketter.
  - Kortets spelporträtt, om det har ett.
  - Knapparna "Byt bild", som skapar en ny version av kortet, och "Tidigare versioner".
  - I menyn ⋯: "Gör till förval", "Byt namn", "Ta bort kortet".
  - Om kortet kommer från Codex: "Från Codex · revision 7", och en markering när Codex har en nyare revision.
  - Vilka äventyr som använder kortet, till exempel "Används i: Stjärnhamnen, Det sista uppdraget". Äventyr som använder förvalet utan eget val räknas med under förvalet.
- **"Lägg till referensbild"** frågar efter ett namn och en bild, och skapar ett nytt kort med version 1. Faktan fylls från det förvalda kortet, så att man bara behöver ändra det som skiljer.
- **Att ta bort ett kort:**
  - Förvalet kan inte tas bort så länge det finns andra kort. Välj ett annat förval först.
  - Används kortet av ett äventyr, visas vilka, och de går över till förvalet efter att författaren har bekräftat.
- Under avsnittet visas **bildprompten för porträtt** för det valda kortet, byggd med den gemensamma funktionen och med en knapp för att kopiera.

Korten visas inte i galleriet, inte i Morph och inte i listan där porträttet väljs.

## Utseendet i ett äventyr

I Storyboard, där personerna i äventyret visas, får varje karaktär med fler än ett kort raden **Utseende i det här äventyret: [Fantasy ▾]**.

- Listan visar karaktärens kort, med förvalet först och märkt "Förval".
- Att välja förvalet tar bort äventyrets rad i `characterLooks`, så att äventyret följer förvalet även om det ändras senare. Att välja ett annat kort skriver raden.
- **I guiden** används förvalet när författaren väljer en karaktär ur biblioteket. Har karaktären flera kort, visar guiden vilket utseende som används och låter författaren byta. Valet sparas i `characterLooks` när äventyret skapas.
- En karaktär med ett enda kort visar ingen sådan rad. Det finns inget att välja.

**Exempel:** Emma har korten Fantasy (förval) och Sci-fi. Äventyret Alvskogen har ingen rad och använder Fantasy. Äventyret Stjärnhamnen har raden `{ characterId: "emma", cardId: "sci-fi" }`. Prompter och porträtt i de två äventyren bygger på var sitt kort, samtidigt. Om Fantasy får en ny version, ändras prompterna i Alvskogen men inte i Stjärnhamnen.

## Utanför spelet och exporten

| Var | Referenskorten |
| --- | --- |
| Spelvyn, galleriet, personkort i spelet | finns inte. Bara kortets spelporträtt används, som porträtt. |
| En spelomgång (`Session`) | korten kopieras inte med när karaktären läggs in |
| Det som skickas till berättande AI | aldrig, varken bild eller fakta |
| Export av ett spel, till exempel för itch.io | korten tas bort. Spelporträttet för det utseende som äventyret använder följer med, som porträtt. |
| Bibliotekets säkerhetskopia | finns med, eftersom det är författarens eget material |
| Bildprompter | fakta och palett används, och bilden skickas med till verktyg som tar emot referensbilder |

Det ska finnas tester för varje rad. Den som lägger till ett nytt ställe där en karaktär kopieras, ska välja uttryckligen om `references` följer med.

## Codex som gemensam källa

**Målet:** Write, Comic och Explore pekar på samma referenskort. Ett kort som görs i Comic kan användas i Explore och tvärtom.

**Så används det i Explore:**
1. En karaktär som redan är kopplad till Codex (`coreOrigin`) kan hämta sina referenskort därifrån. Varje kort i Codex blir ett kort i Explore, med `codexCardRef` som sitt id i Codex. Kortet sparas som en ny version med `source: { kind: "codex", revision }`, och kortets `codexBase` sätts till det som hämtades.
2. **Explore använder alltid sin egen kopia av den version som är aktiv.** Spel och prompter fungerar utan Codex och utan nät.
3. **När Codex har en nyare revision av ett kort** visas det på kortet: "Codex har en nyare version av Sci-fi (revision 8)." Författaren väljer "Använd den" eller "Inte nu". Inget byts automatiskt.
4. **Ett nytt kort i Codex** visas som ett förslag: "Codex har ett nytt utseende för Emma: Som ung." Författaren väljer om det ska läggas till.
5. **Om författaren har ändrat fakta eller palett lokalt** och Codex också har ändrat dem, visas båda bredvid varandra. Ingenting skrivs över utan att författaren har valt. Hur jämförelsen görs beskrivs nedan.
6. **Vilket kort som är förval och vilka kort äventyren använder** bestäms alltid i Explore. Codex ändrar aldrig dem.
7. **Ett kort som görs i Explore** är lokalt tills det skickas till Codex. Det kräver att Codex kan ta emot referenskort och ligger i ett senare steg. Formatet har redan `cardId`, `version`, `source` och `codexCardRef`, så att inget behöver göras om då.

### Jämförelsen mot Codex

Jämförelsen görs för varje kort för sig. Explore jämför tre värden för varje del av kortet, på samma sätt som `reviewCoreCharacter` jämför mot `coreSnapshot`:

- **grunden:** det som senast godtogs från Codex för kortet
- **Codex:** den nya revisionen av kortet
- **lokalt:** kortets aktiva version i Explore.

**Grunden sparas för sig** i kortets `codexBase`, inte bland versionerna. Därför finns den kvar även när de versioner den kom från har gallrats bort.

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

**När författaren godtar** skapas en ny version av kortet enligt reglerna för versioner, med `source: { kind: "codex", revision }`. Den innehåller de valda värdena. `codexBase` sätts till hela den nya revisionen från Codex, även för delar där författaren behöll sitt lokala värde. Nästa jämförelse utgår då från det Codex senast skickade, och författarens lokala val räknas fortfarande som en lokal ändring.

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
  referenceImage?: string;          // kortets bild, bara när referenceImages är sant och ett kort finns
  reference?: { cardId: string; version: number };   // vilket kort och vilken version prompten bygger på
}
```

Funktionen tar emot ett porträttunderlag, inte en `CharacterTemplate`. Då kan guiden använda den för personer som inte har något bibliotekskort:

```ts
type PortraitSource = {
  name: string;
  approximateAge?: number;
  appearance?: string;
  note?: string;                    // intervjuanteckningen för en ny person, annars personligheten
  reference?: CharacterReference;   // den aktiva versionen av det kort som gäller
  cardId?: string;
};

portraitSourceFromCharacter(character: CharacterTemplate, campaign?: CampaignTemplate): PortraitSource
```

- **En sparad karaktär:** `portraitSourceFromCharacter` ger namn, ålder, utseende, personligheten som `note`, och det kort som gäller enligt `referenceFor`. Med ett äventyr är det äventyrets val, och utan är det förvalet.
- **En ny person i guiden:** guiden anger namn, utseende och intervjuanteckningen. Inget kort.
- **Spelarrollen utan bibliotekskort:** guiden anger namn, utseende och personlighet från `campaign.player`. Inget kort.
- `note` följer alltid med i prompten, med och utan kort. Ingenting som B1 skickar med i dag försvinner.

- **Med ett kort** bygger prompten på kortets fakta och palett, med färgernas etiketter i ord. Kortets kläder följer inte med, om inte motivet ber om det.
- **Utan kort** bygger den på `approximateAge`, `appearance` och `note`, som B1 gör i dag. Ett äventyr fungerar alltså lika bra utan referenskort.
- Stilen läggs till sist. Utan stil läggs ingen till.
- Funktionen skickar aldrig något och sparar ingenting. Den bygger bara text.

**Guiden använder samma funktion.** Sol byter guidens egen sammanfogning av porträttprompten i `GuideImagePlan.tsx` mot `characterImagePrompt` för porträtt, och anger äventyret så att rätt kort används. Förslag för platser, föremål och scener påverkas inte.

**Om ett porträttförslag visas beror bara på om porträttet saknas** för det utseende som äventyret använder, inte på om ett referenskort finns. En violinist med ett komplett referenskort men utan spelporträtt får fortfarande porträttförslaget i guiden. Prompten blir då bättre, eftersom den bygger på kortet.

## Vem bygger vad

| Del | Spår |
| --- | --- |
| Fälten `references` och `characterLooks`, versionerna och reglerna för vad som följer med | Claude (Sonnet bygger) |
| `referenceFor` och `portraitSourceFromCharacter` | Claude, granskas av båda |
| Avsnittet Referenskort på karaktärens sida | Claude |
| Raden Utseende i Storyboard | Claude |
| `characterImagePrompt` | Claude, granskas av båda |
| Hämtning från Codex och granskning av nya revisioner | Claude |
| Guiden använder `characterImagePrompt`, visar och sparar valt utseende | ChatGPT (Sol) |
| B2 sparar porträttet på det kort som äventyret använder | ChatGPT (Sol), se frågan ovan |

## Krav på tester

1. Versionerna, för varje kort för sig:
   - Ett nytt kort sparas som version 1, och nästa sparade ändring blir version 2.
   - Version 1, 2 och 3, välj version 1, ändra hårfärgen och spara: det blir version 4 med `basedOn: 1`. Version 1 visar fortfarande den ursprungliga hårfärgen.
   - Ett utkast som inte sparas skapar ingen version.
   - Efter gallring används inget nummer igen, och den aktiva versionen gallras aldrig.
   - En ny version av ett kort ändrar inte numren på karaktärens andra kort.
2. Flera kort:
   - "Lägg till referensbild" skapar ett nytt kort. "Byt bild" skapar en ny version av det valda kortet.
   - Det första kortet blir förval. Förvalet kan bytas, men inte tas bort så länge det finns andra kort.
   - Att ta bort ett kort som används av ett äventyr, flyttar äventyret till förvalet efter bekräftelse.
3. `referenceFor`:
   - äventyrets val, annars förvalet, annars inget kort
   - ett val som pekar på ett borttaget kort ger förvalet och en upplysning
   - Emma i Alvskogen och i Stjärnhamnen ger två olika kort samtidigt, och en ny version av Fantasy ändrar bara Alvskogens prompt.
4. Spelporträttet:
   - när ett spel startar används kortets porträtt, annars karaktärens
   - guiden föreslår ett porträtt när utseendet i äventyret saknar ett eget.
5. En karaktär utan `references`, och ett äventyr utan `characterLooks`, fungerar exakt som i dag. En karaktär som sparas om av guiden eller av Codex-granskningen behåller sina kort, och ett äventyr som sparas om av guiden behåller sitt val.
6. Korten kopieras inte till en spelomgång, finns inte i det som skickas till berättande AI och finns inte i exporten av ett spel. De finns däremot i bibliotekets säkerhetskopia.
7. Korten visas inte i galleriet, i Morph eller bland porträtten.
8. `characterImagePrompt`:
   - med kort: prompten innehåller kortets fakta och färger i ord, men inte kläderna om motivet inte ber om dem
   - utan kort: samma innehåll som B1:s porträttprompt i dag, även `note`
   - för en ny person i guiden och för en spelarroll utan bibliotekskort, via `PortraitSource`
   - stilen läggs till, och `referenceImage` finns bara när verktyget tar emot referensbilder.
9. Codex:
   - En nyare revision av ett kort visas men byts inte automatiskt. "Inte nu" ändrar ingenting.
   - Ett nytt kort i Codex blir ett förslag, inte ett kort.
   - Astras exempel: lokalt ändrat hår, och Codex ändrar hår och ögon. Bara håret blir en konflikt.
   - Jämförelsen fungerar även när versionen som `codexBase` kom från har gallrats bort.
   - Efter att författaren har godtagit är `codexBase` hela den nya revisionen, och ett behållet lokalt värde räknas fortfarande som en lokal ändring.
   - Codex ändrar aldrig förvalet eller äventyrens val.

**Provkörning i webbläsaren,** med skärmbilder i ljust och mörkt läge:
- Ge Gabriel Lindholm korten Fantasy och Sci-fi, med fakta och palett, och kopiera porträttprompten för båda.
- Byt bild på Fantasy, och välj sedan den tidigare versionen igen.
- Använd Gabriel i två äventyr med olika utseenden, och kontrollera prompter och porträtt i båda.
- Starta ett spel med Gabriel och kontrollera att inget kort syns någonstans.

## Byggordning

1. Formatet granskas av Astra (`references` och `characterLooks`), och frågan om B2 besvaras.
2. Fälten, versionerna, `referenceFor` och reglerna för vad som följer med, med testerna 1–3 och 5–7.
3. `characterImagePrompt` och `portraitSourceFromCharacter`, med test 8. Funktionerna granskas av Astra, eftersom Sol bygger på dem.
4. Avsnittet Referenskort på karaktärens sida, och raden Utseende i Storyboard.
5. Spelporträttet för varje utseende, med test 4.
6. Sol kopplar in funktionen och valet av utseende i guiden.
7. Hämtning från Codex och granskning av nya revisioner, med test 9.

Stanna för provkörning i webbläsaren efter steg 4 och steg 5.

## Inte i det här beslutet

- Att skicka ett kort från Explore till Codex. Det kräver att Codex tar emot referenskort.
- Gemensamma bildstilar via Codex.
- Att läsa av fakta och färger ur bilden med AI.
- Att dela upp kortet i separata bilder för kroppsvyer, porträtt och uttryck.
- Ett utseende per scen, till exempel Emma som ung i en tillbakablick. Det kan läggas till senare som en rad per scen, med äventyrets val som reserv.
