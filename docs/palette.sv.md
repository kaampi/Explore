# Designbeslut: Explores grundpalett

Beslutat 18 november 2026. Gäller appens ram: menyer, startsidan, biblioteket, Adventure Builder, kartstudion, dialoger och spelvyn när inget tema är valt. Genreteman (se `play-view.sv.md`) ligger ovanpå och påverkar bara spelvyn.

Underlag: skissen *Grundpalett · mörk och ljus* på canvasen *Explore spelvy – skiss*, version 2 (blågrå grund).

## Varför

- Varje kaampi-app har en egen färg i loggan: Write blågrå (#677084), Comic salviagrön (#67846A), Explore plommon (#84676A). Gemensamt är nästan svart (#231F20) och den magenta pricken (#FF008F).
- Dagens mörka tema är grönt, alltså Comics färgfamilj, och dagens ljusa tema är grönaktigt.
- Den nya grunden är kall och blågrå men mörkare och mindre mättad än Writes färg, så att plommonet blir det som gör att appen känns som Explore.

## Paletten

### Mörk

| Variabel | Färg | Roll | Kontrast |
| --- | --- | --- | --- |
| `--bg` | #15181E | Bakgrund | |
| `--panel` | #1C2028 | Paneler och kort | |
| `--panel-raised` | #252A34 | Upphöjda ytor, vald rad | |
| `--border` | #353C49 | Kanter | |
| `--border-soft` | #2A303B | Avdelare | |
| `--text` | #E7E9EE | Text | 14,6 |
| `--text-dim` | #B6BCC8 | Svagare text | 9,3 |
| `--text-faint` | #8F97A6 | Svagast text, etiketter | 6,0 |
| `--accent` | #C9A3A9 | Plommon för text, länkar och markering | 7,9 |
| `--accent-strong` | #84676A | Plommon för knappytor och valt menyval | vit text 5,1 |
| `--on-accent` | #FFFFFF | Text på `--accent-strong` | |
| `--highlight` | #D8B26E | Mässing: upptäckter, bokmärken, valtexter på linjer | 8,9 |
| `--on-highlight` | #15181E | Text på mässingsyta | 8,9 |
| `--success` | #8FD0A8 | Lyckat, sparat, klart | 10,0 |
| `--accent-player` | #9CC3E6 | Spelaren | 9,6 |
| `--accent-ai` | #C4B2E0 | AI, improviserat | 9,1 |
| `--accent-locked` | #D8B26E | Låst, kräver något | 8,9 |
| `--accent-danger` | #F09A9A | Fara, fel, ta bort | 8,3 |
| `--signal` | #FF008F | kaampis magenta | |

### Ljus

| Variabel | Färg | Roll | Kontrast |
| --- | --- | --- | --- |
| `--bg` | #F4F4F2 | Bakgrund | |
| `--panel` | #FCFCFB | Paneler och kort | |
| `--panel-raised` | #E9E9E6 | Upphöjda ytor | |
| `--border` | #D6D6D1 | Kanter | |
| `--border-soft` | #E2E2DE | Avdelare | |
| `--text` | #24262B | Text | 13,7 |
| `--text-dim` | #565B65 | Svagare text | 6,2 |
| `--text-faint` | #5F656F | Svagast text, etiketter | 5,3 |
| `--accent` | #6E5357 | Plommon för text, länkar och knappytor | 6,3; vit text 6,9 |
| `--accent-strong` | #6E5357 | Plommon för knappytor | vit text 6,9 |
| `--on-accent` | #FFFFFF | | |
| `--highlight` | #7F5B1B | Mässing | 5,6 |
| `--on-highlight` | #FFFFFF | Text på mässingsyta | 6,1 |
| `--success` | #3F6B4C | | 5,6 |
| `--accent-player` | #3E6578 | | 5,7 |
| `--accent-ai` | #6D5A84 | | 5,5 |
| `--accent-locked` | #7F5B1B | | 5,6 |
| `--accent-danger` | #A3404A | | 5,6 |
| `--signal` | #FF008F | | |

Kontrasten är mot `--bg`. All text klarar minst 4,5 : 1 även mot `--panel-raised`.

## Regler för användning

- **Plommon** är Explores färg: huvudknappar, valt menyval, vald sak, länkar och fokusring. Högst en huvudknapp per vy.
- **Mässing** är ljuset i rummet: det som ska locka blicken utan att vara en handling, till exempel upptäckter, bokmärken och valtexter i scenflödet. Mässing används inte för knappar, utom "Spara idé", som är Explores egen huvudsak.
- **Magenta** används bara i loggan och för en enda signal: statusen "AI ansluten". Aldrig för text, knappar eller ytor.
- **Statusfärgerna** betyder alltid samma sak: grönt för lyckat och klart, blått för spelaren, lila för AI, mässing för låst och rött för fara. De används aldrig som dekoration.
- **Text på färg** använder alltid `--on-accent` eller `--on-highlight`.
- **Inga färger skrivs direkt** i komponenter. Allt går genom variablerna. Undantag: kartans terräng, illustrationer, tärningar och stridseffekter, som har egna färger.

## Det som ändras i koden

I dag finns färgvariabler på tre ställen:

- `src/ui/styles.css`, `:root`: en gammal blågrå mörk uppsättning som skrivs över.
- `src/ui/experience.css`, `.sandbox-root` och `.sandbox-root[data-shell="dark"]`: den ljusa och den gröna mörka paletten som används nu.
- `src/ui/page-system.css`: `--page-accent` (#84676A) och `--page-accent-hover`.

Dessutom har stilmallarna cirka 380 färger skrivna direkt, flest i `experience.css` (94), `worldMap.css` (64) och `styles.css` (61). Knappen `.setup-start` har till exempel sin gröna färg skriven direkt.

Beslut:

1. **En fil för färger:** `src/ui/tokens.css`, importerad först i `App.tsx`. Ljus palett på `.sandbox-root`, mörk på `.sandbox-root[data-shell="dark"]`. Typsnittsvariablerna (`--font-ui`, `--font-dialogue`, `--font-mono`) flyttas dit också.
2. **De gamla uppsättningarna tas bort:** `:root` i `styles.css` och färgdelen av `.sandbox-root` i `experience.css`. `--page-accent` blir `var(--accent-strong)` och `--page-accent-hover` en beräknad mörkare variant, eller tas bort till förmån för de nya.
3. **Befintliga namn behålls** där de finns, så att de cirka 900 användningarna av `var(--…)` fortsätter fungera. `--accent-active` (i dag grönt för "aktiv") pekar på `--success`. `--subhead` pekar på `--accent`.
4. **Direkta färger ersätts** med variabler, en stilmall i taget, med undantagen ovan. `--accent-strong` med `--on-accent` ersätter de gröna knapparna.
5. **Logotyperna ändras inte.** Den mörka varianten har redan ljus text.
6. **Spelvyns förvalda tema** blir Neutral och hämtar sina färger från paletten, när teman byggs ut enligt `play-view.sv.md`. De fyra färdiga teman som finns i dag behålls.

## Krav på tester

1. Ett test läser `tokens.css` och kontrollerar med `contrastRatio` i `src/ui/themes/theme.ts` att varje textfärg klarar 4,5 : 1 mot `--bg`, `--panel` och `--panel-raised`, och att `--on-accent` och `--on-highlight` klarar det mot sina ytor, i båda lägena.
2. Ett test säkerställer att `:root` i `styles.css` och färgerna i `.sandbox-root` i `experience.css` är borta, så att bara en uppsättning finns.
3. Ett test räknar direkta färger i `src/ui/**/*.css` utanför de undantagna filerna och kräver att antalet går ner; målet är noll.
4. Provkörning i webbläsaren med skärmbilder i både ljust och mörkt läge av startsidan, biblioteket, Adventure Builder, kartstudion och spelvyn. Inget får sakna färg eller bli oläsligt.

## Byggordning

1. `tokens.css` med båda lägena, importerad, och de gamla uppsättningarna borttagna. Kontrasttestet.
2. Knappar, menyer och listrader: de delar som alla vyer använder.
3. Direkta färger i `experience.css`, `styles.css` och `page-system.css`.
4. Övriga stilmallar, en i taget, utom undantagen.

Stanna för provkörning i webbläsaren efter steg 1 och steg 3.
