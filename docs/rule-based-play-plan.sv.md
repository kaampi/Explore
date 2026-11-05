# Förslag: Säg, Gör och regelstyrt spel

Diskussionsunderlag, 2 november 2026. Beskriver föreslaget beteende, inte redan implementerade funktioner.

## Målet

Spelaren beskriver vad hen säger eller försöker göra. Explore håller reda på vad som är möjligt, vad det kostar och vad som faktiskt händer. AI tolkar och berättar; spelmotorn beslutar om regler, utfall och bestående förändringar. Free play behåller sin frihet. Regelstyrt spel och Adventure med regler använder samma handlingsmotor.

## Vad som redan finns

- `src/ui/studio/StoryboardCanvas.tsx`: visuella kopplingar mellan scener, med villkor och effekter. Detta är den närmaste motsvarigheten jag hittat till de ihågkomna ”ormarna”. Jag har inte hittat ett separat system med det namnet eller en färdig graf som kopplar godtyckliga objekt till händelser.
- `src/library/storyboardLinks.ts`: villkorsutvärdering finns. Alla krav på en länk måste stämma; flera länkar in till en scen är alternativa vägar. Grafen kopplar ännu inte automatiskt ihop live-scener. En hjälpfunktion för tillgänglighet är inte samma sak som att spelgränssnittet verkställer den.
- `src/state/storyFlags.ts`: fakta kan sättas och tas bort. Lager och kampanjtriggers kan kräva att sådana fakta finns eller saknas. Engångslager kan sätta flaggor när de förbrukas. De kan redan användas för att öppna berättelsemöjligheter.
- `src/state/whatNowGate.ts`: fördefinierade val kan öppnas och styra vilka destinationer spelaren får välja. Dagens aktivering innehåller text-/nyckelordslogik; den ska inte bli ensam auktoritet för lås, skada eller strid.
- `src/state/roomGate.ts`: rum kan vara öppna, låsta eller dolda. Det finns bestående öppnade rum och rörelsebegränsningar. Detta är inte ännu ett generellt låssystem för alla objekt.
- Objekt har bland annat plats/ägare, öppningsbarhet, låsbarhet, `isOpen`, svårighet och kontrollvärde. Fullständigt låstillstånd, åtkomst, vapenegenskaper och regelstyrda objekthandlingar saknas.
- D100-kast avgörs lokalt och sparas. Svårighet väljs fortfarande manuellt, och kontrollen riktas mot en närvarande karaktär. Det är inte ännu en generell objekthandling. Fyra grader av utfall har diskuterats men är inte implementerade.
- Kartförflyttning, händelselogg och sparade samtal ger användbar grund. Existerande närhetszoner är främst schema för socialt avstånd, inte färdig kontroll av stridsräckvidd.
- Porttestets ja/nej-svar bestäms av motorn, men har ännu ingen verklig port som ändrar låstillstånd. Regenerate/Replay återställer inte heller alla bestående fakta i dagens system. Detta måste lösas före regelstyrd strid.

## 1. Två fält, samma avsiktssystem

På bred skärm: två fält bredvid varandra, 3–4 textrader höga. På smal skärm: Säg/Gör som flikar, med bevarat utkast i båda. Ingen extra inställning behövs.

**Säg något:** ord som karaktären säger. ”Kan du släppa in mig?” Vanligt samtal kräver inget slag. Om spelaren vill uppnå en osäker social effekt kan det bli ett försök till övertalning. Att bara säga rätt ord garanterar inte ett utfall.

**Gör något:** avsikten med en handling, inte ett påstått resultat. ”Jag undersöker låset.” ”Jag försöker bryta upp porten.” Skrivs ”Jag dödar skytten” tolkas det som ett attackförsök, inte en redan genomförd seger.

Fälten anger avsikten tydligt men är ingen säkerhetsgräns. Samma regelkontroll gäller om någon skriver en handling i Säg eller kombinerar ord och handlingar. En sammansatt begäran delas upp i steg; ”jag öppnar porten, springer upp och hugger” ger inte flera gratis handlingar.

## 2. Försök före utfall

Flödet är: avsikt → mål → kontroll av situationen → direkt handling, tydligt hinder eller tärningsförsök → sparad förändring → berättelse.

AI får föreslå en strukturerad tolkning. Motorn kontrollerar mål, plats, utrustning, tillgängliga handlingar och vald regel. Ett okänt mål eller en oklar avsikt ger en kort fråga, inte påhittade regler.

- Upplåst, nåbar port: öppna direkt och spara att den är öppen.
- Låst port: visa hindret och relevanta alternativ som Undersök, Dyrka eller Bryt upp.
- Osäkert försök: visa ett kompakt förslag i chatten, exempelvis ”Bryt upp porten · Strength · Svårt”. Visa känd tids-/resurskostnad och uppenbar risk, som att vakten kan ingripa.
- Omöjligt försök: förklara varför och ge möjliga alternativ. Inget tärningskast för ett svärdshugg mot någon högt uppe på muren.

Vid ett riskfyllt försök väljer spelaren **Försök** eller **Ändra**. Försök startar kastet; ingen extra bekräftelse efter det. Riskfria handlingar behöver ingen bekräftelseruta. Hemliga hot och okända svårigheter avslöjas inte av förhandsvisningen.

Värde, svårighet, vapen, räckvidd och kostnader hämtas automatiskt från regelsystemet och situationen. Om något nödvändigt saknas ska Explore inte uppfinna ett värde eller smygbyta regelsystem.

## 3. Konsekvenser och de visuella kopplingarna

Återanvänd idén bakom Storyboards kopplingar: **När → Om → Då**, med valfri **Annars**. Författaren kan exempelvis koppla ett godkänt övertalningsförsök till porten, tillträde och ett nytt berättelsespår.

Exempel: ”Övertalning lyckas” → ”Mona har befogenhet att släppa in dig” → ”porten låses upp, tillträde beviljas, berättelseflaggan Tillträde beviljat sätts”. Själva inträdet är fortfarande spelarens nästa val.

Motorregler sköter generella handlingar som öppna, låsa upp, flytta och skada. Författarkopplingar lägger till berättelsespecifika följder. Författaren ska inte behöva rita varje möjlig svärdsattack i en graf.

Objektets tillstånd är sanningen om portens lås; story flags markerar berättelsefakta som ”vakten accepterade ditt ärende”. Undvik två oberoende sanningar om samma lås. Alla förändringar går genom samma validerade händelser, oavsett om de startas från en knapp, fritext eller en författarkoppling. Kedjor behöver skydd mot upprepning och oändliga loopar.

Utfall kan graderas enligt regelsystemet. För vårt enkla d100-test kan 01–05 ge exceptionell framgång endast när slaget lyckas; 96–100 kan ge allvarligt misslyckande endast när det misslyckas. Vanlig framgång/misslyckande däremellan. 00 betyder 100. Graderna ska inte göra omöjliga försök möjliga eller ersätta andra regelsystems kritiska regler.

Misslyckande ger en passande följd, inte automatiskt strid. En misstänksam vakt kan vägra, kräva att du backar eller kalla på hjälp. Övertalning lyckas inom en rimlig överenskommen omfattning; det ger inte kontroll över en annan person. Samma oförändrade försök ska inte kunna upprepas tills spelaren får ett bra slag. Ny metod, nya uppgifter eller ändrade omständigheter kan öppna ett nytt försök enligt reglerna.

## 4. Närhet, höjd och hinder

Första versionen använder namngivna positioner i en lokal scen: Utanför porten, Vid porten, På muren, Bakom vagnen och I trappan. Förbindelser anger hur man tar sig mellan dem. Kartans verkliga skala används när den finns; en översiktskarta ger inte automatiskt exakta stridspositioner.

Räckvidd, fri sikt, skydd och nåbar väg är skilda kontroller. Att vara i samma område räcker inte för närstrid. Höjd är heller inget generellt skydd mot alla attacker: bågar och kast kan nå upp om räckvidd och sikt tillåter det.

Spelaren ser enkla besked: ”Mona – inom räckhåll”, ”Skytt på muren – synlig, utom räckhåll för svärd”. Exakta meter visas bara när de är kända och användbara. Vi inför inget krav på att spelaren ska kalibrera en karta.

Scenen behöver få giltiga positioner och förbindelser från karta, författare eller en validerad scenförberedelse. AI får föreslå dessa, men saknad geometri är inte ett frikort att godtyckligt avgöra en attack. Använd kvalitativa zoner med tydliga regler där mått saknas.

## 5. Strid utan inställningsarbete

Första testet använder ett färdigt enkelt regelsystem med turordning, en huvudhandling och en förflyttning per tur. Det är testets regelval, inte en universell regel för alla framtida spel. Regelsystem med andra turer eller resurser kan kopplas till samma handlingsflöde senare.

När en konkret fientlig handling eller etablerad händelse inleder strid kontrollerar motorn initiativ och överraskning. En NPC kan angripa utan en extra godkännandedialog, men måste följa samma regler. Att skriva ett hot startar inte alltid strid; den aktuella situationen avgör.

Gör-fältet visar i strid en handlingspanel: Attackera, Försvara, Förflytta, Föremål, Hjälp eller Fly — bara de handlingar regelsystemet stödjer. Fritext ”Annan handling” finns kvar och översätts till ett tillåtet försök som visas före utförandet.

Spelaren väljer handling och mål. Motorn föreslår användbar utrustning och visar varför en viss attack inte går. Ingen manuell inmatning av skada, svårighet eller NPC-värden behövs. NPC:ers målval kan föreslås av AI eller enkla beteenden; alla deras handlingar valideras av motorn.

Säg-fältet finns kvar för dialog, men tal pausar inte fienderna och ger inte extra turer. Förhandling med mekanisk effekt måste också följa regelsystemets kostnad. Medan ett försök eller NPC-turer behandlas tillåts inga dubbla utföranden.

Strid kan sluta genom flykt, kapitulation, förhandling eller att hotet upphör — inte bara genom att alla förlorar sin hälsa. Vunna strider ska kunna öppna berättelsevägar genom samma händelser och villkor som andra handlingar.

## 6. Spara och ändra utan att skapa gratis omkast

Kast, kostnader, positioner och konsekvenser sparas tillsammans en gång. Om AI-svaret misslyckas ligger det avgjorda resultatet kvar; berättelsen kan återupptas utan nytt kast eller dubbel kostnad. Pågående tur och väntande försök följer med vid omladdning.

Regenerate ändrar bara berättelsens formulering, inte tärningarna eller vad som blev sant. Direktredigering av chatttext ändrar inte spelstatus. Replay behöver en separat uttrycklig återgång som återställer hela berörda spelstatusen, även flaggor och förbrukade triggers; annars ska det vara otillgängligt i regelstyrt spel. Historik och dubbla klick får inte bli ett sätt att duplicera föremål eller återfå hälsa.

## 7. Vad spelaren respektive skaparen gör

Spelaren väljer ett spel och använder sin karaktär. Färdig regelprofil och scen tillhandahåller resten. Tidigare val och utrustning används som standard. Det ska inte krävas en uppsättning inställningar före varje handling.

Skaparen väljer en färdig regelprofil och beskriver scenens objekt och startpositioner. Portmallen kan förifylla låst/upplåst och öppna/stäng. Valfria berättelsekopplingar visas med begripliga namn: ”Kräver”, ”Händer när” och ”Leder till”. Avancerade villkor ligger bakom ett extra val. Ett generellt spel ska inte kräva att alla utfall författas i förväg.

Att stödja alla genrer behöver inte innebära en lång meny: regelsystemet och objektets egenskaper avgör relevanta handlingar. Samma upplåsningshandling kan gälla en medeltida port eller en modern dörr, med olika verktyg och kontrollvärden.

## Föreslagen byggordning

1. **Bestående port och villkor:** komplettera objekttillstånd, koppla till befintlig händelselogg/story flags och säkra sparning. Framgång öppnar en verklig möjlighet, inte bara en replik.
2. **Säg/Gör och handlingar:** två fält, måligenkänning, nåbarhetskontroll, automatiskt kontrollvärde och ett kompakt försökserbjudande. Utöka kontrollsystemet till objekt och platser. Koppla in graderade utfall.
3. **Lokal scen:** positioner, höjd, sikt, skydd och förbindelser. Lägg till skytten på muren; inga stridsregler förrän tillåtna handlingar kan kontrolleras.
4. **Liten strid:** färdig regelprofil, initiativ, turer, attacker/försvar, förflyttning, hälsa och flykt. Samma handlingar och händelser som i steg 2; inga separata AI-beslut om skada.
5. **Författarkopplingar och breddning:** gör När/Om/Då-kopplingarna enkla att använda för objekt, händelser och scener. Bredda till fler regelprofiler först när ett helt scenario fungerar.

## Första scenariots godkännandepunkter

- Lyckad övertalning ger verkligt tillträde. Att öppna den upplåsta porten kräver inget nytt slag. Omladdning bevarar detta.
- Misslyckad övertalning kan öka misstänksamhet utan automatisk strid eller nytt försök utan förändring.
- Svärdet kan inte träffa skytten på muren. Ett tillåtet avståndsvapen kan göra ett försök om sikt och räckvidd räcker.
- Att gå upp på muren kräver en tillåten väg och tillräcklig förflyttning; samma regel gäller spelare och NPC.
- Tal, fritext, menyer och redigerad chatt kan inte kringgå lås, räckvidd, turordning eller utrustningskrav.
- Omladdning, dubbla klick och ett AI-fel ger inte nya kast eller dubbla konsekvenser.
- Regenerate bevarar utfallet. Replay är antingen en fullständig tillståndsåtergång eller avstängt för regelstyrda turer.
- Grundscenariot kräver inga manuella svårighetsval från spelaren och fungerar med standardskapad karaktär.
- Befintlig Free play och äldre sparade samtal fortsätter fungera.

Förslaget stannar här vid planering. Ingen ny spelmekanik är implementerad genom detta dokument.
