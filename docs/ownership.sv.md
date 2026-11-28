# Vem gör vad i Explore

Beslutat 24 november 2026. Gäller allt arbete på `main` från två håll:

- **Claude-spåret:** Claude designar och granskar, Sonnet bygger.
- **ChatGPT-spåret:** Sol bygger, Astra granskar.

Produktägaren bestämmer vad som görs och samordnar mellan spåren. Ingen ändrar i ett annat spårs område utan att gå via produktägaren.

## Varför

Båda spåren arbetar i samma kod. Den 22 november ändrade en PR om AI i världsutforskning (#66) spelvyn, och ett test för mobil i det andra spåret slutade fungera. Ingen märkte det, eftersom webbläsartesterna hoppades över. Guiden skapar redan Storyboard, och nästa steg är att Storyboard ska kunna öppna guiden. Då måste det vara tydligt var gränsen går.

## Områden

| Område | Ägare | Filer |
| --- | --- | --- |
| Guiden "Skapa med guide", med AI-hjälp och bildförslag | ChatGPT | `src/ui/studio/AdventureGuide.tsx`, `Guide*.tsx`, `adventure-guide.css`, `guidePlaytest.ts`, `src/library/guide*.ts`, `adventureGuidePlan.ts`, `buildGuideAdventure.ts` |
| AI-hjälp i Storyboard: panelen, AI-anropen och sparandet för Fördjupa, Fortsätt och Utveckla texten | ChatGPT | `src/ui/studio/assist/`, enligt `storyboard-ai.sv.md` |
| Cut-scenes: studion och spelaren | ChatGPT | `src/ui/cutscenes/`, och filmformatet enligt `cutscenes.sv.md` |
| Sparande med kontroll av samtidiga ändringar | ChatGPT | kontrollen i `IndexedDBRepository.ts` och `CampaignStudio.tsx` från G3 |
| Storyboard: ritytan, kopplingarna, lägena, Ordna och verktygsraden | Claude | `StoryboardCanvas.tsx`, `PlayableStoryboard.tsx`, `storyboardRouting.ts`, `storyboardArrange.ts`, `storyboardReadiness.ts` |
| AI-hjälp i Storyboard: ingångarna, de streckade förslagen på ritytan, `AuthoringPatch` och motorns kontroller | Claude | `authoringPatch.ts`, `authoringChecks.ts`, `placeNewScenes`, enligt `storyboard-ai.sv.md` |
| Spelvyn, med teman och ornament | Claude | `src/ui/play/`, `PlayWorkspace.tsx`, `EncounterPanel.tsx`, `src/ui/themes/` |
| När en cut-scene spelas: utlösare, platsen i spelvyn och flaggor efteråt | Claude | enligt `cutscenes.sv.md`. Spelaren själv är ChatGPT:s. |
| Spelmotorn: tillstånd, handlingar, slag, strid och utfall | Claude | `src/game/`, `src/state/`, `src/session/` |
| Regelverk, värden och "Utfall som ändrar värden" | Claude | `RulesetStudio.tsx`, `genreRulesets.ts`, `exampleRulesetTexts.ts` |
| Palett, gemensamma komponenter och appens ram | Claude | `tokens.css`, `src/ui/components/`, `controls.css`, `menu.css`, `ExploreNavigation.tsx` |
| Uppdateringar och byggflöden | Claude | `.github/workflows/`, `UpdateProvider.tsx`, `CheckUpdates.tsx` |

Ett område som saknas i tabellen tillhör ingen. Då bestämmer produktägaren innan någon börjar.

## Delade filer

Båda spåren får ändra de här filerna, men bara inom sitt eget område:

- **`LanguageProvider.tsx`:** lägg nya texter i ett eget block med spårets prefix, till exempel `cg…` för guiden, `cs…` för cut-scenes och `rss…` för regelverk. Ändra aldrig någon annans texter. Lägg nya nycklar sist i ditt block, så att konflikterna blir små.
- **`styles.css`, `App.tsx` och `HomeScreen.tsx`:** lägg till, men skriv inte om någon annans regler eller komponenter. Ny stil för ett område hör hemma i områdets egen CSS-fil.
- **`LibrarySchema.ts` och `EncounterSchema.ts`:** se nästa avsnitt.

## Äventyrsformatet

Både guiden, Storyboard och spelmotorn läser och skriver samma äventyr. Därför gäller samma regel som för filmformatet:

1. **Formatet får bara utökas.** Nya fält är valfria. Ett fält som finns byter aldrig betydelse, namn eller typ.
2. **Okända fält följer med.** Kod som läser ett äventyr och sparar det igen behåller fält den inte känner till. Varje spår har ett test som visar det för sina sparvägar: guiden, Storyboard och import av biblioteket.
3. **Ändringar meddelas innan de byggs.** Den som behöver ett nytt fält skriver ett kort förslag: fältet, typen, vem som skriver det och vem som läser det. Förslaget går via produktägaren till det andra spårets granskare innan någon bygger.
4. **Märk PR:en.** En PR som ändrar formatet har "Format:" först i titeln.

Nästa kända ändring är "Utfall som ändrar värden", där en följd kan ändra ett värde i regelverket. Förslaget skickas till Astra innan Sonnet börjar, så att guiden kan läsa och behålla de nya fälten i samma veva.

## Guiden och Storyboard

### I dag

Guiden skapar ett nytt äventyr med scener, handlingar, följder och scenutkast. Storyboard visar och redigerar det som vilket äventyr som helst.

### Gränsen

| | Storyboard (Claude) | Guiden (ChatGPT) |
| --- | --- | --- |
| Scenernas lägen på ritytan | Bestämmer alltid | Sätter aldrig läget för en scen som redan finns |
| Kopplingarnas utseende, sidor och etiketter | Bestämmer | Rör inte |
| Innehållet: scener, handlingar, följder, villkor | Redigerar för hand | Skapar och ändrar efter författarens godkännande |
| Knapparna som öppnar guiden från Storyboard | Var de sitter och hur de ser ut | Vad som händer när de används |
| Guidens panel, frågor, förslag och förhandsvisning | Rör inte | Bestämmer |

**Nya scener:**
- I ett helt nytt äventyr får guiden placera scenerna. Lägena ska ligga på Storyboards rutnät på 20 px. Den rena funktionen `arrangeStoryboard` får användas för det.
- När guiden lägger till scener i ett äventyr som redan finns, lämnar den läget tomt. Storyboard placerar de nya scenerna nära scenen de utgår från och flyttar inga befintliga scener.

### När Storyboard ska kunna öppna guiden

Fördjupa scenen, Fortsätt härifrån och Utveckla texten beskrivs i `storyboard-ai.sv.md`, med gränssnittet:

- `openAssist(...)`: Storyboard öppnar panelen.
- `previewAssist(...)`: panelen visar förslag streckade på ritytan. Storyboard ritar dem men sparar ingenting.
- `onAssistClose(...)`: exakt en gång när panelen stängs. Storyboard läser in äventyret igen och placerar nya scener.

Förslagen beskrivs som en `AuthoringPatch`, som bara lägger till. Formatet och funktionen `applyPatch` ägs av Claude-spåret och granskas av båda.

## Innan något slås ihop

1. **Hela testsviten, även webbläsartesterna** i `tests/browser/`. Ett test som hoppas över räknas som ej kört.
2. **Ett prov i webbläsaren** för det man har ändrat, med skärmbilder i PR:en.
3. **Rebase mot `main`** samma dag som sammanslagningen.
4. **Om en ändring rör ett annat spårs område**, även bara en rad, nämner PR:en det, och det andra spårets granskare tittar på den raden.

Om något går sönder i ett annat spårs område, meddelar den som upptäcker det produktägaren. Ägaren rättar det. Den som orsakade det rättar inte själv i någon annans område.

## Pågående just nu

| Spår | Arbete |
| --- | --- |
| ChatGPT | B1 bildförslag (rättning), sedan B2. Guidens utseende. |
| Claude | Mobiltestet som faller sedan #66 (spelvyn). "Utfall som ändrar värden", med formatförslaget först. `AuthoringPatch` och kontrollerna för AI-hjälpen i Storyboard. |
