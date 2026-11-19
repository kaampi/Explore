# Designbeslut: kopplingar i Storyboard

Beslutat 18 november 2026. Gäller kopplingarna mellan scener och grupper i Storyboard (`src/ui/studio/StoryboardCanvas.tsx`), linjen medan man drar en ny koppling, och en ny knapp Ordna.

Underlag: skissen *Storyboard · kopplingar före och efter* på canvasen *Explore spelvy – skiss*, version 16. Linjerna i den högra rutan är framräknade med reglerna nedan, inte ritade för hand.

## Varför

I dag gäller tre regler, och de ger ett ormbo så fort scenerna flyttas:

- **Sidorna är fasta.** En koppling går alltid ut från scenens högra sida och in på den vänstra (`port()`), och för scener alltid mitt på sidan. Tre kopplingar ut från samma scen börjar i samma punkt. Bara grupper sprider sina kopplingar.
- **Bakåt blir en fast båge.** Ligger målet till vänster om källan går bågen 180 px nedåt och tillbaka (`curveControls()`), oavsett vad som finns där.
- **Andra scener finns inte för linjerna.** Linjerna går rakt igenom dem.

## Reglerna

### 1. Rätt sida

För varje koppling provas kombinationerna av sidor vid källan och målet: höger, vänster, upp och ner. Bara sidor som vetter mot den andra änden räknas, det vill säga där riktningen från kortets mitt mot det andra kortets mitt pekar ut genom sidan. Det ger högst 16 kombinationer och oftast 4.

Varje kombination får poäng:

- **längden** på bågen, uppmätt längs kurvan
- **plus 120 för varje punkt som ligger i en annan scen eller grupp**, med 8 px marginal. Bågen mäts i 40 punkter, och de allra första och sista räknas inte.
- Punkter i källans eller målets egen ruta räknas lägre, med vikten 0,6.

Kombinationen med lägst poäng vinner. Vid lika poäng vinner ordningen höger, vänster, ner, upp, så att samma indata alltid ger samma linjer.

**Tröskel mot hopp:** när en scen dras behåller en koppling sina sidor så länge den nya bästa kombinationen inte är minst 15 % bättre. Då hoppar linjen inte fram och tillbaka mellan två sidor under dragningen.

### 2. Flera kopplingar på samma sida

Alla kopplingsändar på samma sida av samma kort sprids jämnt över sidans mittersta 60 %. De sorteras efter var andra änden ligger:

- på vänster och höger sida efter den andra ändens höjd
- uppe och nere efter dess läge i sidled.

Då korsar linjerna inte varandra precis vid kortet. Två kopplingar åt var sitt håll mellan samma två scener hamnar automatiskt bredvid varandra och ritas som två bågar.

### 3. Bågen

Bågen är en kubisk Bézierkurva. Båda kontrollpunkterna ligger rakt ut från sin sida, på avståndet `clamp(36, 0,42 × avståndet mellan ändarna, 140)`. Bågen lämnar alltså kortet vinkelrätt och går aldrig in i det kort den lämnar.

En koppling från en scen till sig själv ritas som en ögla ovanför scenen.

### 4. Etiketter

Etiketten sitter mitt på bågen (t = 0,5), i en liten ruta med `--panel-raised` som bakgrund och `--border` som kant, så att den går att läsa ovanpå andra linjer. Överlappar två etiketter flyttas den ena till t = 0,4 eller 0,6. Dagens beräkning av `labelY`, med specialfallet för `externalInspector`, tas bort.

### 5. Linjen medan man drar

Medan man drar en ny koppling går linjen ut från den sida av källan som vetter mot pekaren. Den följer samma bågregel. Handtaget att dra från (`storyboard-card__port`) blir kvar där det är.

### 6. Fokus

När pekaren är på en scen, eller en scen eller koppling är vald:

- dess kopplingar ritas i `--accent`, något tjockare
- övriga kopplingar och etiketter tonas ner till täckning 0,45.

Samma sak gäller när scenen har tangentbordsfokus.

### 7. Färger

- Linjer i `--text-faint`, framhävda i `--accent`.
- **Kopplingar med krav** (`requiresFlags` eller `requiresOpenBarriers`) streckas i `--accent-locked` och får en låst etikett när de saknar egen text. Dagens markering för `requiresAbsentFlags` (`storyboard-line--blocks`) behålls.
- Kapitelfärgerna, som i dag är skrivna direkt (`CHAPTER_COLORS`), flyttas till `tokens.css` som `--chapter-1` till `--chapter-6`, för båda lägena. De används bara som strecket på kortets kant, aldrig för text eller status, eftersom statusfärgerna har egna betydelser.

### 8. Rutnät

Scener och grupper fäster mot ett rutnät på 20 px när de dras, och det sparade läget är det fästa. Håll Alt för att dra fritt. Rutnätet visas som svaga prickar i Storyboard.

### 9. Ordna

En knapp **Ordna** i Storyboards verktygsrad, bredvid Fit all, lägger ut allt automatiskt:

1. **Startscenen** är äventyrets startscen, annars den första scenen.
2. **Kolumner från vänster till höger:** varje scen hamnar i kolumnen efter den längsta vägen dit från startscenen. Kopplingar som leder bakåt i en slinga räknas inte när kolumnerna bestäms.
3. **Ordning i kolumnen:** scenerna sorteras efter medelhöjden för de scener som leder dit. Det upprepas några varv, vilket minskar antalet korsningar.
4. **Grupper flyttas hela.** En grupp, ihopfälld eller inte, räknas som ett kort, och scenerna i den behåller sina lägen i förhållande till varandra.
5. **Scener som inte går att nå** från startscenen läggs i en egen rad under resten.
6. Kolumnerna ligger 280 px isär och raderna 140 px, fästa mot rutnätet. Efteråt anpassas vyn som med Fit all.

Ordna kan ångras. En kort ruta "Scenerna ordnades · Ångra" visas i 10 sekunder, och Ctrl+Z ångrar så länge den syns. Storyboard har ingen ångra-funktion i övrigt; det här är bara för Ordna.

## Byggs som

- **En ren funktion** i den nya filen `src/ui/studio/storyboardRouting.ts`:

  ```ts
  routeStoryboardLinks(
    cards: StoryboardCard[],
    links: { id: string; from: StoryboardCard; to: StoryboardCard }[],
    previous?: Map<string, { from: Side; to: Side }>,
  ): Map<string, { path: string; a: Point; b: Point; label: Point; sides: { from: Side; to: Side } }>
  ```

  `previous` ger tröskeln under dragning.
- **En ren funktion för Ordna** i `src/ui/studio/storyboardArrange.ts`: `arrangeStoryboard(scenes, sections, links, startSceneId)`, som returnerar nya lägen.
- `StoryboardCanvas.tsx` byter `port()`, `curveControls()`, `bezierPath()` och `linkPort()` mot `routeStoryboardLinks`. Gränserna för ritytan räknas från de nya bågarna och etiketterna.
- **Snabbhet:** en båge mäts bara mot kort vars ruta skär bågens yttre ruta. Under dragning räknas sidorna om bara för kopplingar till de kort som flyttas; för övriga sprids bara ändarna på nytt.

## Krav på tester

`routeStoryboardLinks`:

1. Ett mål till höger, vänster, ovanför och nedanför ger rätt sidor.
2. Ingen båge går genom sin egen källa eller sitt eget mål.
3. En båge går runt en scen som ligger mitt emellan, när det finns en väg runt.
4. Tre kopplingar ut från samma sida sprids och korsar inte varandra vid kortet.
5. Två kopplingar åt var sitt håll mellan samma scener ritas isär.
6. En koppling till samma scen blir en ögla.
7. Samma indata ger samma resultat.
8. Med `previous` byts sidorna inte förrän den nya vägen är minst 15 % bättre.
9. 200 scener och 300 kopplingar räknas fram på under 200 ms i testmiljön (en generös gräns, så att testet inte blir opålitligt).

`arrangeStoryboard`:

10. Scenerna hamnar i kolumner efter längsta vägen från startscenen.
11. En slinga ger inget fel och ingen oändlig loop.
12. Grupper flyttas hela.
13. Scener som inte går att nå hamnar under resten.
14. Alla lägen ligger på rutnätet.

Övrigt:

15. Ångra efter Ordna återställer exakt de tidigare lägena.
16. Ett test i jsdom: med pekaren på en scen har dess kopplingar klassen för fokus och de andra är nedtonade.
17. **Provkörning i webbläsaren** med River Mill och med ett äventyr på minst 12 scener, i båda lägena:
    - dra en scen runt en annan och se att linjerna byter sida utan att hoppa
    - Ordna och sedan Ångra
    - skärmbilder före och efter.

## Byggordning

1. `storyboardRouting.ts` med testerna 1–9.
2. Storyboard använder den: bågar, etiketter och linjen medan man drar.
3. Fokus vid hovring och val, och färgerna till variabler.
4. Rutnätet.
5. `storyboardArrange.ts`, knappen Ordna och Ångra.

Stanna för provkörning i webbläsaren efter steg 2 och steg 5.

Det här hör till arbetet med Adventure Builder, men kan byggas fristående eftersom det mest är nya rena funktioner.
