# Gemensam handlingsmotor – första versionen

4 november 2026. Implementerad grund för författade möten med en spelarkontrollerad deltagare och valfritt antal andra deltagare. Den ersätter inte ännu allt spel i Explore.

## Vad som nu är gemensamt

`src/game/` hanterar deltagare, lag, positioner, förbindelser, hinder, föremålsägande, resurser, handlingar och deras resultat. Ingen kod där känner till Mona, en viss port, en vagn eller en särskild genre.

- `EncounterSchema.ts`: scenbeskrivning, aktuell status, tillåtna kommandon och bestående händelser.
- `EncounterEngine.ts`: validering, turordning, automatiska motståndare, förflyttning och strid. Varje kommando arbetar på en kopia och blir en sammanhållen förändring. ID och revision stoppar dubbla och inaktuella försök.
- `geometry.ts`: faktisk väg, avstånd, höjd, fri sikt och stängda eller blockerade förbindelser. Att se någon innebär inte att man når personen med ett närstridsvapen.
- `rules.ts`: anslutning för regelsystem. D100 är levererad och används i båda provscenerna. Ett separat test använder en annan regelmodell utan att ändra turhantering eller scendata; andra kompletta regelsystem eller tärningsgränssnitt är ännu inte levererade.
- `interactions.ts`: författade möjligheter som kan kräva färdighet, närvaro, fakta och tillgängliga varor/resurser. Förhandling, betalning och överlämning är skilda steg. En vanlig affär behöver inget slumpmoment.
- `intention.ts`: katalog från scenens faktiska handlingar och en försiktig lokal tolkning av skrivna avsikter. Ett förslag har ingen egen rätt att ändra världen.
- `narration.ts`: beskriver motorns fastställda resultat. Texten verkställs aldrig som instruktioner.

Resultat, faktiska kast, strukturerade händelser, turer och aktuell status sparas i sessionen. Återförsök vid lagringsfel sparar samma resultat utan omkast. AI-dialog, redigering, Replay och Regenerate är avstängda för dessa författade möten så att de inte kan kringgå handlingsmotorn.

Stridens attacker, försvar och förflyttningar visas i en kompakt stridslogg i spelpanelen. Varje svärdshugg skapar inte längre två stora dialogbubblor, och den vanliga chatten rullar inte ned för dessa poster. Samtal, utforskning och andra berättelsehandlingar ligger kvar i chatten. Underlaget och slagen sparas fortfarande även för äldre provomgångar. Medaljongen zoomar och tonar in; OK låter den och tärningarna tona bort innan ytan stängs.

## Scener och kompatibilitet

Portscenen använder den gemensamma motorn för initiativ, automatiska fiendeturer, geometri, träffchanser och attacker. `src/scenarios/gateWorld.ts` innehåller dess värld och en översättning till det äldre sparformatet. Äldre portomgångar kan därför fortsätta. Portens berättelsetext, specialhandlingar och gamla Säg/Gör-tolkning finns kvar i dess kompatibilitetslager; hela scenen är ännu inte ombyggd till deklarativa möjligheter.

`src/scenarios/loadingBay.ts` beskriver en andra scen som vanlig data: en kurir, en neutral handlare, tre motståndare, behållare som skydd, ett låst lastskydd, en upphöjd gång och andra vapen. Den har ingen egen stridsfunktion. Den använder också samma handlingsgräns för prisförhandling och köp.

## Så provar du

Välj **With rules → Try the orbital depot**.

1. Välj **Bargain with Imani**. Förhandling 60 ger ett avtalat pris på 8 krediter vid framgång. Misslyckande behåller ordinarie pris 10. Upprepad oförändrad förhandling ger inget nytt slag.
2. Kontrollera att du fortfarande har 30 krediter efter förhandlingen. Välj sedan det tillgängliga köpet. Pengar och medicinkit ska överföras tillsammans, utan ett nytt kast.
3. Lås upp och öppna lastskyddet med åtkomstkortet. Det är två skilda handlingar. Gå till lastgolvet.
4. Prova strid mot vakterna eller drönaren. Närstridsvapen når inte drönaren på den upphöjda gången från lastgolvet. Förflyttning går via stegen.
5. Använd handling och förflyttning under strid. Motståndarna agerar automatiskt i sparad initiativordning. Skydd, ammunition och försvar påverkar utfallen.
6. Ladda om eller återvänd till samma samtal. Kontrollera att köp, hälsa, ammunition, lås och slag finns kvar.

Gör-fältet för depån förstår framför allt handlingsnamnen från panelen samt anfall med angivet mål och vapen. Det har ännu inte porttestets AI-stödda fritexttolkning. Alla knappar och skrivna förslag prövas av samma motor.

## Andra handlingar än strid

En möjlighet beskriver vad spelaren försöker uppnå, villkoren, eventuell färdighet och möjliga konsekvenser. Samma mekanism kan användas för att köpslå, pruta, be om hjälp eller föreslå ett möte. Ett automatiskt test visar en social möjlighet som bara ändrar en överenskommen berättelseflagga, utan strid eller pengar.

Fria, hot och utpressning är ännu inte färdiga spelhandlingar. De ska beskrivas med motsvarande förutsättningar och begränsade utfall, inklusive de andra deltagarnas möjligheter och relationer. Ett slag ska bara avgöra det som möjligheten och regelsystemet faktiskt omfattar.

## Avgränsningar och nästa steg

Första versionen är zonbaserad, med en aktiv spelarkontrollerad deltagare. Flera motståndare och automatiska allierade stöds genom lag och fientliga relationer; det finns ännu inget gränssnitt för att styra flera gruppmedlemmar i samma strid. NPC-beteendet är en enkel policy som tar högst en förflyttning och en handling per tur. Scenerna använder samma gräns för spelaren.

Avväpning som egen handling, gisslan/hot, rustning och tillfällighetsattacker är ännu inte införda. Anfall efter kapitulation hanteras däremot nu i den gemensamma motorn, med återupptagna fientligheter och beredskap för vapen.

Scenerna definieras ännu i koden. Nästa steg är att koppla deltagare, objekt, möjligheter och effekter till skapargrafen och en sceneditor. Kartans verkliga entiteter måste sedan leverera positioner och förbindelser till samma motor. En scenövergång behöver också föra med sig rätt deltagare, föremål och resurser; depån är ännu en fristående provomgång.

Generell uppfinning av uppdrag eller föremål från AI-text är inte aktiverad. Vanliga befintliga Free play- och With rules-samtal använder fortfarande sina tidigare flöden.

## Lokal stridsvy (prototyp)

Under strid växlar båda provscenerna till samma stridsyta: spelare till vänster, valt mål till höger, faktisk hälsa och position vid figurerna. Målval ändrar bara vyn. Vapnens tillgänglighet prövas fortfarande av spelmotorn; bilden visar inte fysisk närhet. Efter striden återkommer samtalet med bevarad historik.

Portscenen använder de tillhandahållna bilderna `player-sword.png` och `mona-fighting.png`. Bakgrunden är `fight-background.jpg`. Deltagare utan bild får en enkel silhuett utifrån angiven anatomi, eller en neutral figur om anatomin är okänd. Depån får inga fantasyfigurer som standard.

**Add figure / Change figure** väljer PNG, WebP eller JPEG upp till 4 MB. Egna figurer sparas i det aktuella samtalet och överlever omladdning. Detta ändrar inga slag, turer, resurser eller positioner. Bilderna är ännu inte kopplade till karaktärsbibliotekets editor. Originalen ligger kvar oförändrade.

## Turpresentation och glöd

Varje utförd stridshandling sparar nu små ögonblicksbilder av deltagarnas hälsa, position och tillstånd, tillsammans med det verkliga slaget. Gränssnittet visar dem i initiativordning: en kort paus utan separat turruta, tärningar och samma resultatmedalj. Spelarens tärningar kastas från vänster och motståndarnas från höger; den väntande figuren tonas ned. Varje kast bekräftas med OK, även motståndarens. Handlingar utan slag visas kort och går vidare automatiskt. Den väntande figuren har 65 procents opacitet.

När spelarens handling är bekräftad lämnar gränssnittet automatiskt över turen. Förflyttning kan väljas före handlingen; **End turn** finns kvar för att passa utan handling. Sparlogik, förbrukade resurser och slumpresultat styrs av motorn. Uppspelning och OK gör inga nya kast. En pågående presentation lagras lokalt per samtal och revision; en redan synlig medalj återkommer vid omladdning utan ny tärningsanimation.

Bågskyttens bild är `archer-fighting.png`. Partikeleffekten är anpassad från den tillhandahållna glöddemon: avgränsad till mittenkolumnen, högst 80 partiklar, 30 bildrutor per sekund, tidsbaserad hastighet och separat visuell slumpgenerator. Den stannar i dold vy, vid reducerad rörelse och när stridsytan avmonteras. Glöden tar inte emot klick.


## Anfall efter kapitulation

En kapitulerad deltagare får angripas igen om räckvidd, sikt, vapen, ammunition och spelarens handling tillåter det. Knappar för ett sådant anfall öppnar samma granskning som en skriven handling, med en tydlig beskrivning av att kapitulationen bryts. Vanliga stridsknappar utför fortfarande handlingen direkt.

Kapitulation innebär nedlagt vapen. D100-regeln ger ett konfigurerbart tillägg på 20 procentenheter mot en sådan motståndare. Ett anfall återaktiverar deltagaren och återupptar strid även när ingen längre var aktiv. En miss bryter också kapitulationen. Andra redan fientliga deltagare agerar enligt sin vanliga taktik; inga nya relationer eller figurer uppfinns.

En återaktiverad deltagare får välja sin befintliga flykt-/kapitulationstaktik om svårt sårad. Annars går en handling åt för att göra vapnet redo innan deltagaren kan anfalla på en senare tur. Gamla sparningar utan beredskapsfält tolkas från kapitulationsstatus. Ett vapen är fortfarande en förmåga/ägd utrustning inom zonen; separata vapenföremål på golvet och generellt upplockningsspel är inte införda här.

Fortsatta attacker använder vanlig skada. Vid 0 hälsa är deltagaren oskadliggjord i testmotorn. Det finns ännu inget separat tillstånd för död och ingen garanti att formuleringen ”döda” i sig ger ett dödligt utfall.
