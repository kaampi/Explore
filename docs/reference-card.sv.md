# Designbeslut: referenskort för karaktärer

Beslutat 25 november 2026. Gäller karaktärsbiblioteket (Bygg → Karaktärer), bildprompter för karaktärer i biblioteket och i guiden, och kopplingen till Codex. Bygger på `ownership.sv.md`. Ansluter till guidens bildspår (`guide-b2.sv.md`).

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
2. **Ett aktivt kort per karaktär, med versioner.** Ett nytt kort blir en ny version. Tidigare versioner sparas och kan väljas igen.
3. **Fakta och palett är data.** De går att läsa och ändra som text, och det är de som en prompt bygger på.
4. **Kortet visas aldrig för spelaren.** Det är aldrig med i en spelomgång, i spelvyn, i exporten av ett spel eller i det som skickas till berättande AI.
5. **Codex är den gemensamma källan när karaktären är kopplad dit.** Explore använder alltid en egen kopia av en bestämd version, så att allt fungerar offline.
6. **En funktion bygger alla karaktärsprompter,** både i biblioteket och i guiden.

## Data

Ett nytt valfritt fält på `CharacterTemplateSchema`:

```ts
reference?: {
  active: CharacterReference;
  previous: CharacterReference[];   // nyaste först, högst 5
};

type CharacterReference = {
  id: string;            // samma för alla versioner av kortet
  version: number;       // 1, 2, 3 …
  createdAt: string;
  imageDataUrl: string;  // kortet, nedskalat som andra bilder i biblioteket
  thumbDataUrl: string;
  facts: {
    age?: string;        // text, inte tal: "34", "i 30-årsåldern"
    height?: string;     // "183 cm"
    build?: string;      // "smal"
    hair?: string;       // "mörkbrunt, vågigt"
    eyes?: string;       // "blågröna"
    skin?: string;       // "ljus"
    marks?: string;      // ärr, födelsemärken, särdrag
    other: { label: string; value: string }[];
  };
  palette: {
    role: "skin" | "hair" | "eyes" | "clothing" | "other";
    label: string;       // "Hår (mörkbrun)"
    color: string;       // "#5a3e2b"
  }[];
  styleNote?: string;    // hur kortet är tecknat: "fotografiskt", "akvarell"
  source:
    | { kind: "local" }
    | { kind: "codex"; workspaceId: string; projectId: string; entityRef: string; revision: number };
};
```

- `facts` fylls första gången från karaktärens `approximateAge` och `appearance`. Författaren kan sedan ändra fritt. Att läsa av fakta och färger ur bilden med AI kan läggas till senare. Det gör ingenting utan författarens godkännande.
- Bara `active` används för prompter. En tidigare version blir aktiv genom att författaren väljer den, och då blir den nuvarande en tidigare version.
- Med fler än fem tidigare versioner tas den äldsta bort. Före det frågar Explore författaren.
- Det här är en ändring av bibliotekets format. Den följer formatregeln i `ownership.sv.md`: fältet är valfritt, och kod som sparar om en karaktär behåller det.

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
1. En karaktär som redan är kopplad till Codex (`coreOrigin`) kan också hämta sitt referenskort därifrån. Kortet sparas som en ny version med `source.kind: "codex"` och Codex revision.
2. **Explore använder alltid sin egen kopia av den version som är aktiv.** Spel och prompter fungerar utan Codex och utan nät.
3. **När Codex har en nyare revision** visas det på karaktären: "Codex har en nyare version av referenskortet (revision 8)." Författaren väljer "Använd den" eller "Inte nu". Inget byts automatiskt.
4. **Om författaren har ändrat fakta eller palett lokalt** och Codex också har ändrat dem, visas båda bredvid varandra, som i dagens granskning av karaktärsändringar från Codex (`reviewCoreCharacter`). Ingenting skrivs över utan att författaren har valt.
5. **Ett kort som görs i Explore** är lokalt tills det skickas till Codex. Det kräver att Codex kan ta emot referenskort och ligger i ett senare steg. Formatet har redan `id`, `version` och `source`, så att inget behöver göras om då.

Gemensamma bildstilar via Codex (`TODO.md`) hör ihop med det här, men ingår inte i beslutet. Funktionen nedan tar emot en stil, så att stilarna kan kopplas in senare.

## Den gemensamma funktionen för bildprompter

En ren funktion i `src/library/characterImagePrompt.ts`:

```ts
characterImagePrompt({
  character: CharacterTemplate,
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

- **Med ett aktivt kort** bygger prompten på kortets fakta och palett, med färgernas etiketter i ord. Kortets kläder följer inte med, om inte motivet ber om det.
- **Utan kort** bygger den på `approximateAge` och `appearance`, som B1 gör i dag. Ett äventyr fungerar alltså lika bra utan referenskort.
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

1. Ett referenskort sparas som version 1. Ett nytt kort blir version 2, och den första ligger bland de tidigare. Att välja en tidigare version byter plats på dem.
2. En karaktär utan `reference` fungerar exakt som i dag, och en karaktär som sparas om av guiden eller av Codex-granskningen behåller sitt kort.
3. `reference` kopieras inte till en spelomgång, finns inte i det som skickas till berättande AI och finns inte i exporten av ett spel. Det finns däremot i bibliotekets säkerhetskopia.
4. Kortet visas inte i galleriet, i Morph eller bland porträtten.
5. `characterImagePrompt`:
   - med kort: prompten innehåller kortets fakta och färger i ord, men inte kläderna om motivet inte ber om dem
   - utan kort: samma innehåll som B1:s porträttprompt i dag
   - stilen läggs till, och `referenceImage` finns bara när verktyget tar emot referensbilder.
6. Guiden föreslår porträtt för en karaktär som har ett referenskort men inget porträtt, och prompten bygger då på kortet.
7. Codex: en nyare revision visas men byts inte automatiskt. Lokala ändringar och Codex ändringar visas bredvid varandra, och ingenting skrivs över utan ett val.

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
