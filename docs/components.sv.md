# Designbeslut: gemensamma delar – knappar, menyer och listrader

Beslutat 18 november 2026. Steg 2 i byggordningen i `palette.sv.md`. Gäller appens ram: startsidan, biblioteket, Adventure Builder, kartstudion, Anatomy, Morph Studio, dialoger och spelvyns knappar och menyer. Ornamenten i spelvyn (`ornaments.sv.md`) ligger ovanpå och ändrar inte hur delarna fungerar.

## Varför

- **Knappar:** appen har cirka 550 knappar och ett tiotal knappklasser som ser olika ut: `sb-button` med varianterna `--primary`, `--secondary`, `--danger` och `--cream`, `setup-start`, `setup-text-btn`, `sb-link`, `studio-list__btn`, `anatomy-button`, `storyboard-primary` och flera till. Samma handling ser olika ut i olika vyer, och flera använder fortfarande grönt (`--accent-active`) eller färger som är skrivna direkt.
- **Menyer:** det finns två menysystem. `MessageMenu` används för meddelanden i samtal, motorscener och Storyboard. `MapContextMenu` används i kartstudion, formredigeraren, vägritningen och interiörer. De beter sig olika: bara kartmenyn stänger andra menyer, har Home och End och lämnar tillbaka fokus vid Escape.
- **Listrader:** `StudioList` saknar en plats för handlingar per rad, så knappar som Ta bort och Duplicera hamnar i redigeraren. Vald rad markeras i grönt.

Vi bestämde att högerklicksmenyer ska användas där de passar, så att vyerna kan få färre knappar. Då måste det finnas en meny som fungerar likadant överallt, och en listrad med en självklar plats för den.

## Grundregel

Högerklick är en genväg, aldrig det enda sättet. Allt i en högerklicksmeny finns också bakom en synlig knapp "⋯" eller i vyn. Menyn öppnas på samma sätt överallt:

- högerklick
- knappen "⋯"
- tangenten Meny eller Skift+F10 på det som har fokus
- långt tryck, 500 ms, på pekskärm.

## Nya variabler i `tokens.css`

Färger, i båda lägena:

| Variabel | Mörk | Ljus | Roll |
| --- | --- | --- | --- |
| `--accent-strong-hover` | #6E5357 | #5B4347 | Huvudknapp vid hovring, vit text |
| `--on-danger` | #15181E | #FFFFFF | Text på `--accent-danger` |
| `--shadow-menu` | 0 10px 30px rgb(0 0 0 / 0.45) | 0 10px 30px rgb(36 38 43 / 0.16) | Menyer |

Hovringsfärgerna är fasta värden, inte `color-mix`. Då kan kontrasten testas, och de fungerar även i äldre WebKitGTK på Linux. `--page-accent-hover` pekar på `--accent-strong-hover`.

Mått, gemensamma för båda lägena:

```css
--radius-sm: 6px;   /* knappar, fält, chips */
--radius: 10px;     /* menyer, kort, paneler */
--control: 40px;    /* höjd på knappar och fält */
--control-compact: 32px; /* verktygsrader, kartstudion, rader i menyer */
--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;
```

## Knappar

### Fem sorter, inga fler

| Sort | Utseende | Används till |
| --- | --- | --- |
| **Huvudknapp** `primary` | `--accent-strong` med `--on-accent`, hovring `--accent-strong-hover` | Vyns viktigaste handling: Spela, Spara, Skapa. Högst en per vy eller dialog. |
| **Vanlig** `secondary` | `--panel-raised`, kant `--border`, text `--text` | Övriga handlingar: Avbryt, Importera, Ny karaktär. |
| **Tyst** `quiet` | Ingen yta, text `--accent`, understruken vid hovring | Små handlingar i löptext och listor: Ändra, Visa alla. Ersätter `setup-text-btn` och `sb-link`. |
| **Fara** `danger` | Som vanlig men med text `--accent-danger`. Fylld (`--accent-danger` med `--on-danger`) bara i bekräftelsedialogen. | Ta bort, Släng, Återställ. |
| **Idé** `idea` | Kant och text `--highlight` | Bara "Spara idé", enligt regeln för mässing. |

Dessutom finns **ikonknappen**: en kvadrat i höjd med `--control` eller `--control-compact`, med sorten vanlig eller tyst. Den kräver `aria-label`, och etiketten visas också som verktygstips. Knappen "⋯" är en ikonknapp.

### Utseende och lägen

- Text i 14 px, vikt 600 för huvudknappen och 500 för de andra. Stor bokstav bara först. Inga versaler och ingen extra spärrning; dagens `sb-button` har 12 px versaler.
- Höjd `--control` (40 px), `--control-compact` (32 px) i verktygsrader. Aldrig under 24 px klickyta. I spelvyn är klickytan minst 44 px, enligt `play-view.sv.md`.
- Hörn `--radius-sm`. Ikon 16 px till vänster om texten, avstånd `--space-2`.
- **Fokus:** 2 px ring i `--accent` med 2 px avstånd, bara vid `:focus-visible`.
- **Avstängd:** täckning 0,5 och `cursor: not-allowed`. Om skälet inte syns i vyn står det i ett verktygstips, till exempel "Välj en plats först".
- **Arbetar:** `aria-busy="true"`, en liten snurra i stället för ikonen, och samma bredd, så att inget hoppar.
- Hovring ändrar färgen, inte storleken. Inga `filter: brightness`.

### Byggs som

- CSS i en ny fil `src/ui/controls.css`, importerad direkt efter `tokens.css`: klasserna `ui-button`, `ui-button--primary`, `--secondary`, `--quiet`, `--danger`, `--idea`, `ui-button--icon` och `ui-button--compact`.
- Två små komponenter i `src/ui/components/Button.tsx`: `Button` med `variant`, `size`, `icon` och `busy`, och `IconButton`, där `label` är obligatoriskt i typen.
- Ny kod använder komponenterna. Befintlig kod flyttas när varje vy görs om, men redan i det här steget får de gamla klasserna samma utseende som de nya:

| Gammal klass | Blir |
| --- | --- |
| `sb-button`, `sb-button--primary`, `setup-start`, `storyboard-primary`, `anatomy-primary` | primary |
| `sb-button--secondary`, `sb-button--cream`, `studio-list__btn`, `anatomy-button` | secondary |
| `setup-text-btn`, `sb-link` | quiet |
| `sb-button--danger`, `anatomy-danger`, `menu-danger` | danger |

Regeln för de gamla klasserna skrivs om till de nya variablerna, utan nya direkta färger. Gamla och nya namn delar regel (`.sb-button, .ui-button--primary { … }`), tills de gamla namnen är borta.

## Menyer

### En komponent

`Menu` i `src/ui/components/Menu.tsx` ersätter `MessageMenu` och `MapContextMenu`. Beteendet utgår från `MapContextMenu`, som redan gör det mesta rätt.

```ts
type MenuItem =
  | { kind?: "item"; label: string; onSelect: () => void; icon?: IconName; shortcut?: string;
      disabled?: boolean; reason?: string; danger?: boolean }
  | { kind: "check"; label: string; checked: boolean; onToggle: (checked: boolean) => void }
  | { kind: "separator" }
  | { kind: "heading"; label: string };

<Menu label="Åtgärder för Mona" at={{ x, y }} items={items} onClose={…} />
```

Till det kommer:

- `MenuButton`: ikonknappen "⋯", med `aria-haspopup="menu"` och `aria-expanded`. Menyn öppnas under knappen och fokus går tillbaka till knappen när den stängs.
- `useContextMenu(items)`: ger de props som ska läggas på ett element: `onContextMenu`, långt tryck och Skift+F10 eller Meny-tangenten. Samma lista `items` används för knappen "⋯" och för högerklick, så de två kan aldrig skilja sig åt.

### Beteende

- **En meny åt gången.** När en öppnas stängs andra.
- **Placering:** vid pekaren eller under knappen, och alltid inom fönstret med 8 px marginal. Menyn läggs i den närmaste `dialog` om den finns, annars i `.sandbox-root`. Så får den alltid rätt palett, även i mörkt läge.
- **Tangentbord:** pil upp och ner, Home och End, Enter och mellanslag väljer, första bokstaven hoppar till nästa rad som börjar så, Escape stänger och lämnar tillbaka fokus, Tab stänger. Avstängda rader hoppas över.
- **Stänger** vid val, klick utanför, rullning, ändrad fönsterstorlek och Escape.
- **Webbläsarens egen meny** behålls i textfält och när användaren har markerat text, så att Kopiera och Klistra in fungerar. `useContextMenu` gör ingenting i de fallen.
- **En nivå.** Inga undermenyer. Behövs fler val, eller ett fält som Byt namn, öppnas en liten dialog eller ett fält direkt i vyn. I kartstudion har platsens meny i dag ett färgfält ("Change color"). Det blir en rad som öppnar färgväljaren.

### Ordning och innehåll

1. Det man oftast gör, först: Öppna, Spela, Ändra.
2. Sedan grupper med avdelare emellan, till exempel Duplicera och Exportera.
3. Sist, efter en avdelare: Ta bort, i `--accent-danger`. Ta bort ligger alltid i menyn, och alltid sist.

Det som tar bort något frågar först i en bekräftelsedialog, som säger vad som försvinner, till exempel "Ta bort Mona? Hon används i 2 äventyr." Om handlingen kan ångras visas i stället en kort ruta med Ångra.

En rad som inte kan väljas visas avstängd med skälet som verktygstips. Den döljs inte, så att menyn ser likadan ut varje gång.

### Utseende

- Yta `--panel`, kant `--border`, hörn `--radius`, skugga `--shadow-menu`, inre avstånd 6 px.
- Bredd 180–280 px. Rader i höjd `--control-compact`, text 14 px i `--text`.
- Ikon 16 px till vänster, eller tom plats om någon annan rad har ikon. Kortkommando till höger i `--text-faint`.
- Hovring och fokus: `--panel-raised`. Kryssad rad: bock i `--accent`. Fara: text i `--accent-danger`.
- Rubrik: 11 px versaler i `--text-faint`. Avdelare: 1 px `--border-soft`.

## Listrader

### En komponent

`ListRow` i `src/ui/components/ListRow.tsx`, använd av `StudioList` och av listorna i biblioteket.

```
[ bild eller ikon 40 px ]  Namn                    [ status ]  [ ⋯ ]
                           En rad med beskrivning
```

- **Namn** i 15 px `--text`, **beskrivning** i 13 px `--text-dim`. En rad var, avkortat med "…", och hela texten som verktygstips.
- **Status** är högst två små etiketter till höger: Utkast (`--text-faint`), Spelbar (`--success`), Behöver åtgärd (`--accent-locked`). Statusfärgerna betyder samma sak som i paletten och används inte för annat.
- **"⋯"** syns vid hovring och fokus på raden, och alltid på pekskärm och på vald rad. Raden har samma meny vid högerklick.
- Höjd 56 px med bild, 40 px i kompakt läge utan bild.

### Lägen

- **Hovring:** `--panel-raised`.
- **Vald:** `--panel-raised`, en 3 px stapel till vänster i `--accent-strong` och namnet i vikt 600. Inte grönt.
- **Fokus:** ringen i `--accent`, innanför raden.

### Uppbyggnad

Raden är en `li` med två knappar bredvid varandra: själva raden och "⋯". Knappar läggs aldrig i varandra. Vald rad har `aria-current="true"`. Knappen "⋯" har etiketten "Fler val för Mona".

Listan har en rubrik och knappen "+ Ny …" överst, som en vanlig knapp. Är listan tom visas en kort förklaring och en huvudknapp, till exempel "Inga karaktärer än" och "Skapa en karaktär".

Porträttlistan (`layout="portraits"`) följer samma regler: "⋯" i kortets övre högra hörn och samma meny vid högerklick.

### `StudioList`

`StudioList` får en valfri `itemMenu: (item) => MenuItem[]`. Utan den har raden ingen "⋯". Vyerna fyller i menyn när de görs om, en i taget, och flyttar då Ta bort, Duplicera och liknande från redigeraren till raden.

## Vad som visas och vad som hamnar i menyn

Det här gäller i alla vyer, och är frågan "vilka knappar kan bli en meny?" i vår lista per vy:

- **Syns alltid:** vyns huvudhandling, det man gör ofta (Spela, Spara, Ny …), sök och filter, och var man är (flikar, vald sak).
- **I menyn:** handlingar på en enskild sak som görs sällan: Byt namn, Duplicera, Exportera, Flytta, Visa i världen och Ta bort.
- **Aldrig bara i menyn:** något som behövs för att komma vidare, till exempel det steg i Adventure Builder som säger vad som saknas.

## Krav på tester

1. **Kontrast:** `--on-accent` mot `--accent-strong-hover` och `--on-danger` mot `--accent-danger` klarar 4,5 : 1 i båda lägena. Läggs till i testet för `tokens.css`.
2. **Menu:** pilar, Home och End och första bokstaven flyttar fokus. Avstängda rader hoppas över. Escape stänger och lämnar tillbaka fokus. Tab stänger. Bara en meny är öppen. Menyn hamnar inom fönstret.
3. **useContextMenu:** högerklick, Skift+F10 och långt tryck öppnar samma rader som "⋯". Inget händer i `input` och `textarea`, eller när text är markerad.
4. **Palett:** en meny som öppnas i mörkt läge ligger under ett element med `data-shell="dark"`.
5. **Ordning:** en rad med `danger` som inte ligger sist ger en varning i utvecklingsläge och får testet att fallera.
6. **ListRow:** vald rad har `aria-current`, "⋯" har en etikett med namnet, och raden innehåller inga knappar i knappar.
7. **De gamla menyerna är borta:** `MessageMenu.tsx` och `MapContextMenu.tsx` finns inte, och inget importerar dem.
8. **De gamla knappklasserna** räknas på samma sätt som de direkta färgerna. Antalet får bara gå ner.
9. **Provkörning i webbläsaren**, med skärmbilder i båda lägena:
   - knapparna på startsidan och i Adventure Builder
   - menyn för ett meddelande i ett samtal
   - menyn på kartan och i Storyboard
   - en lista i biblioteket med vald rad och öppen "⋯"
   - tangentbordet genom en meny.

## Byggordning

1. **Variabler och knappar:** de nya variablerna, `controls.css`, `Button` och `IconButton`, och de gamla klasserna omskrivna enligt tabellen. Menytexten i mörkt läge byter från `--page-accent` till `--accent`.
2. **Menyn:** `Menu`, `MenuButton` och `useContextMenu`. Byt ut alla nio användningar av `MessageMenu` (fyra) och `MapContextMenu` (fem) med samma innehåll som i dag, och ta bort de gamla filerna.
3. **Listraden:** `ListRow`, och `StudioList` byggd på den med `itemMenu`.
4. **Provkörningen.**

Stanna för provkörning i webbläsaren efter steg 2 och steg 4. Inga vyer görs om i det här steget. Det görs vy för vy enligt vår lista.
