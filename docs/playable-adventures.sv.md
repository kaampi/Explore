# Spelbara äventyr – första versionen

I Explore: öppna **Adventures**, välj **All campaigns** om ett tidigare äventyr öppnas, och välj **Connected adventure example**. Exemplet skapar egna biblioteksposter och visar två scener i Storyboard. Spara kampanjen eller välj **Test this scene** för att spara och starta en ny genomspelning.

Storyboard öppnas nu i ett eget, nästan skärmfyllande fönster: **Storyboard Editor**. Öppna det via kampanjens **Storyboard** eller **Open Storyboard Editor**. Scener, kopplingar och uppdragsmål finns till vänster; arbetsytan tar det återstående utrymmet i mitten; detaljerna för det valda objektet finns till höger. Sidopanelerna rullar var för sig. Den vanliga Explore-menyn ligger bakom fönstret och tar ingen arbetsyta.

Överst finns **+ Scene**, **+ Action**, **Save adventure** och **Test this scene**. Att lägga till en handling öppnar dess etikett för redigering direkt. Högerklick på en scen ger redigering, ny handling, koppling och test. Högerklick på en koppling ger redigering och borttagning; på tom arbetsyta kan en scen läggas till vid den klickade positionen. Escape stänger en öppen högerklicksmeny först. Att stänga editorfönstret behåller kampanjutkastet i den aktuella vyn; **Save adventure** sparar det i biblioteket.

## Bygg, koppla och testa

Överst i Storyboard väljer du **Adventure map**. Därefter visar **Place on map** endast platser på den sparade kartan, även platser inuti andra platser, till exempel **Pine forest / Hunter’s cabin**. Scenen beskriver vad som händer där; kartplatsen beskriver var det händer. Flera scener kan använda samma kartplats.

**Open Map Studio** öppnar kartan utan att stänga äventyrsutkastet. Spara kartan och återvänd; platslistan uppdateras automatiskt. **Refresh map places** hämtar ändringar som har sparats i ett annat fönster. **Use the introduction from the map** använder kartplatsens aktuella introduktion. Avmarkera eller redigera ankomsttexten för att skriva en särskild introduktion för scenen. **Save adventure** sparar kopplingen.

Kopplingen använder beständiga plats-ID:n. Namnbyten bryter därför inte scenerna. En borttagen plats måste ersättas innan äventyret kan testas. Att byta karta behåller handlingar och personer men kräver nya platsval där de gamla inte finns på den nya kartan. Äldre äventyr använder sitt befintliga platsbibliotek tills författaren uttryckligen väljer en karta.

Ett nytt speltest använder den senast sparade kartan och sparar en egen kartversion med geometri, vägar och skala. Spelarens kartplats följer scenbytena. Ett pågående spel påverkas inte av senare kartändringar. Automatisk restidsberäkning vid scenbyte ingår ännu inte.

- Välj en scen i listan eller på arbetsytan. Ange plats, ankomstbeskrivning och möjliga handlingar med skrivna utfall.
- En handling kan röra en person eller själva scenen. Den kan vara direkt eller kräva ett färdighetsslag enligt d100. Ange då även utfallet vid misslyckande.
- För samtal med en person kan du ange **Conversation topics**, separerade med semikolon. En igenkänd fråga i **Say something** använder samma förberedda svar, villkor, handlingskostnad och eventuella tärningsslag som knappen. Mindre stavfel tolereras för längre ämnesord. Äldre sparade handlingar med etiketten “Ask [person] about [ämne]” fungerar också utan att spelet behöver startas om.
- Dra från en scens högra punkt till en annan scen. Alternativt: högerklicka på startscenen och välj **Connect to another scene**, eller välj **+ Connection** med startscenen markerad. Då sitter ormens början fast i startscenen och dess andra ände följer pekaren. Klicka på målscenen för att fästa kopplingen; Escape avbryter utan att skapa något. En befintlig koppling mellan samma scener väljs i stället för att dupliceras. Välj förbindelsen för att ändra **From**, **To**, spelarens val och vilka upptäckter som krävs. Alla markerade villkor måste uppfyllas. Utan villkor är förbindelsen tillgänglig direkt.
- Villkor visas med handlingens namn och lyckat/misslyckat utfall. Att byta namn på handlingen bryter inte kopplingen.
- Under fler villkor går det även att stänga en förbindelse efter en upptäckt eller registrera fakta vid ankomst.
- Välj **Test this scene** högst upp eller under **3 · Try it** i scenens detaljpanel för en ny sparad genomspelning. Fortsätt en befintlig genomspelning via **My conversations**.

I exemplet öppnar frågan till Edda vägen till vakttornet. Läs meddelandet där för att öppna återvägen. Berätta sedan för Edda vad meddelandet säger, med **Tell Edda what the note says** eller genom att skriva exempelvis `Edda, I found the note. The messenger will return at dawn.` i **Say something**. Edda tackar för beskedet och **Adventure completed** visas. Spelet fortsätter vara öppet för utforskning; avslutet raderar inte samtalet. Den medhavda mässingsnyckeln följer med, och redan utförda handlingar förblir utförda när spelaren återvänder.

Den nya handlingen kräver den verkliga upptäckten från tornet. En påstådd upptäckt i fri text kan inte ersätta den. När samma samtalsämne finns i flera handlingar väljs en unik handling vars upptäcktsvillkor är uppfyllda; tvetydiga val avgörs inte godtyckligt.

I Storyboard kan varje handling få villkor under **Available after these discoveries**. Samtalstypen **Share a discovery** tillåter att spelaren lämnar ett besked med egna ord. Under **Adventure objective & completion** väljer författaren uppdragets rubrik och vilka upptäckter som tillsammans markerar det som färdigt. Samma mekanism kan användas i andra äventyr.

Du kan exempelvis skriva `Hi` och sedan `Edda what can you tell me about the messanger?`. Hälsningen ger ett enkelt svar utan upptäckter. Frågan använder den förberedda handlingen om budbäraren. Svar från en person har personens namn; scenbeskrivningar visas som Narrator. Tvetydiga frågor väljer inte godtyckligt ett av flera svar. Fria ämnen utanför de förberedda samtalen har ännu ingen AI-dialog.

## Vad spelet bevarar

Scenbyten sker inom samma sparade samtal. Hälsa, utrustning, ammunition, resurser, föremålsägande, upptäckter och tidigare sceners tillstånd följer med. Varje scen har sina egna positioner och handlingshistorik. Gamla tärningskast spelas inte upp på nytt vid scenbyte. Omladdning återställer den aktuella genomspelningen.

Genomspelningen innehåller en egen kopia av äventyret. Senare ändringar i biblioteket påverkar nya tester, men skriver inte om ett pågående spel. Förbindelser kontrolleras av spelmotorn; att skriva att man har hittat något ger ingen upptäckt. Scenbyte är spärrat under pågående strid och när spelaren är utslagen. Dubbla eller föråldrade kommandon avvisas utan delvis genomförda följder.

Det medföljande budbärarexemplet har en särskild innehållsuppgradering till version 2. Den lägger till den saknade återrapporteringen och uppdragsmålet även i äldre sparade exemplar, inklusive redan besökta scener. Hälsa, föremål, historik, avklarade handlingar, upptäckter och aktuell plats återställs inte. Andra äventyr och redan uppdaterade exemplar ändras inte av uppgraderingen.

## Avgränsning

Detta är en första sammanhängande version för skrivna handlingar, villkor och scenövergångar. Den nya editorn skapar enkla scener med en position och d100-slag. Fullständig redigering av strid, objektbeteenden, restider och AI-berättande ingår inte i denna version. Äldre kampanjer behåller sitt tidigare startflöde tills de uttryckligen görs spelbara i Storyboard.
