# Bygg och generera settlements

På världskartan: högerklicka där byn eller staden ska ligga och välj **Build settlement here…**. Ange ett namn och välj **Build settlement** för att öppna dess egen, tomma karta. **Cancel** skapar ingenting. Alternativt välj **＋ Settlement** och klicka ut platsmarkören innan du anger namnet. Ingen stor placeringsruta eller geografisk yta skapas. Öppna en befintlig by med **Build settlement →**, dubbelklick eller högerklickets **Build settlement…**.

**Show world map underlay** visar omgivningens vägar, vatten och terräng som ett låst underlag, centrerat på byns plats. Det visas även i generatorns förhandsvisning. Underlaget följer förhållandet mellan världskartans och bykartans avståndsskalor; det kopieras inte in som redigerbara hus eller vägar. Världskartans stora träd- och bergsymboler ersätts med terrängytor i underlaget. Ändra världens geografi på världskartan och placera byns egna hus och gator ovanpå underlaget. Med äldre restidsskalor visas en markering om ungefärlig anpassning; använd avstånd per ruta på båda kartnivåerna för precis placering. Generatorn anpassar ännu inte husen automatiskt till stranden eller befintliga världsvägar, så dess förslag behöver granskas och justeras.

I en tom settlement-karta finns **Generate layout…**. Välj Village, Town eller City starter, välj en huvudgata eller ett vägkors och välj eventuell religiös byggnad eller samlingsbyggnad i utkanten. Förhandsvisningen ändrar inte kartan. **Use this layout** lägger till riktiga platser och vägar med de ID:n som förhandsvisningen visar. **Cancel** lämnar kartan orörd.

Planeringsreglerna placerar verksamheter kring ett centralt torg, bostäder längs gator, fria tomter mellan byggnader och anslutningar från entréerna till gatunätet. Kyrka/religiös byggnad är valfri och får sin tro och användning från författaren. Befolkning, föremål, rum och scener genereras inte. City starter är ett första stadsavsnitt att utveckla vidare.

Alla byggnader kan flyttas, namnges, skalas och beskrivas. Byggverktygen ger Cottage, Longhouse, Townhouse, Inn och Square. Symbolen är en illustration; namn, beskrivning och eventuell platsmall anger funktionen. Mallar och platser är inte låsta till en viss genre. Ritade förbindelser anger bestämda färdvägar och deras restider.

Nya byggnader får **Default entrance → Open**, både vid manuell placering, från byggnadsmallar och i generatorn. Spelaren kan gå fram till huset och gå in genom standardentrén utan att en stig eller ett första rum behöver ritas. I högerpanelen kan standardentrén ändras till **Locked**, **Hidden** eller **No default entrance**. Byggnadsmallar har samma inställning. Befintliga byggnaders entréer ändras inte automatiskt. När ritade dörrar redan leder in i byggnaden gäller deras destinationer, lås och riktning; standardentrén får inte skapa en genväg runt dem. Entrén skapar inga invånare eller färdiga rum, och äventyrets scenregler gäller fortfarande.

Under **Objects** finns **Fields**, **Cattle pasture**, **Well** och **Docks** med egna symboler. Fält och beteshagar blir områden, brunnen en intressepunkt och bryggorna en besöksbar hamnplats. De kan namnges, beskrivas, flyttas, skalas och roteras. Beteshagens illustration skapar inte automatiskt individuella djurkaraktärer. **Police station** finns under **From template…** bland POI-mallarna, taggad `modern` och `crime`.

Bryggor kräver kontakt med både land och vatten. Kontrollen använder vatten på den lokala kartan och vatten i världskartans projicerade underlag, även när underlaget är dolt. Helt torr mark och placering mitt ute i vattnet avvisas med en förklaring. Även flytt och storleksändring kontrolleras. Docks-mallen har samma krav; i malleditorn finns **Placement requirement → Shoreline** för egna mallar. Andra kartor, fartyg och båtresor kopplas inte automatiskt till en utplacerad brygga.

Klicka på en gata för att redigera den. Dra de guldfärgade korsningspunkterna för att flytta en korsning och alla anslutna vägändar. Välj **Add bend** i högerpanelen eller högerklicka på vägen och välj **Add node**. Dra den blå punkten för att böja vägen; högerklicka på punkten och välj **Make Smooth** för att forma kurvan med handtagen. Punkterna visas ovanför kartobjekten och kan även flyttas med piltangenterna. Husens entréer sitter kvar på husen.

Ritade vägar och stigar förenklas automatiskt efter penseldraget. För en befintlig väg: markera den och välj **Simplify route** under **Route shape**. Balanced behåller huvudformen; Gentle behåller små detaljer och Stronger prioriterar färre punkter. Resultatet visar antalet punkter före och efter, och **Undo simplification** återställer den senaste förenklingen fram till nästa ändring av vägformen. Vägen förblir redigerbar. Korsningar, anslutningar och separata in- och utgångar i terräng behålls som egna geografiska punkter; dessa slås inte ihop bara för att få färre redigeringspunkter.

Nya settlements visas som platsmarkörer på världskartan. Symbolens läsbara storlek anger inte en fysisk utbredning och ska inte förkorta restiden genom att ta upp flera rutor. Vägar ansluter till platsens geografiska läge. Byggnader, gator och avstånd inuti byn använder den lokala kartans egen skala. En markör ger inte automatiskt en världskarteyta baserad på den lokala storleken.

Äldre settlements med ritade ytor behåller sin geometri och eventuell illustration från det byggda innehållet. Välj **Show as location marker** i högerpanelen för att byta till en platsmarkör; platsens ID, innehåll och förbindelser behålls. Ingen automatisk konvertering sker. **Save map** sparar samtliga kartnivåer. Storyboard kan referera till både byn och dess byggnader.

Generering ersätter inte befintliga platser. För att prova ett annat upplägg efter att en by sparats skapar man en ny settlement-plats eller redigerar innehållet manuellt. Därmed raderas inte scenernas platsreferenser av en ny generering.

## Karta under spel

När spelet startas på en plats som är kopplad till en sparad karta visas en liten spelarkarta i högerspalten, även i Free Play. I en by visas byns struktur; inne i ett hus eller rum visas dess läge i byn. Klicka på kartan eller pilen för en större vy med zoom, panorering och namn på markerade platser. Kartan ändrar inte spelarens position. Använd spelets handlingar för förflyttning. Författarens beskrivningar och instruktioner visas inte i platsinformationen.

Kartvyn filtrerar bort dolda platser, okända ankomstplatser och hemliga förbindelser. Besök som spelet faktiskt genomför sparas så att ankomstplatser förblir kända efter återbesök och omladdning. Detta är platskännedom, inte systemet för beständiga invånare och husinnehåll som finns i TODO. Kartan ritar den aktuella nivån och förenklar symboler på täta översikter; vid zoom klipps objekt utanför vyn bort.

Äventyr visar sin sparade kartversion. Starta en ny spelomgång för att få med senare ändringar av kartan. Dina SVG:er används för Cottage (`house.svg`), Longhouse (`big_house.svg`) och Well (`well.svg`), med bibehållna proportioner och transparent bakgrund.


## Rum och interiörer

Dubbelklicka på ett hus i bykartan. När ett standardhus öppnas första gången får det en redigerbar planlösning: Cottage och Townhouse har tre rum, Longhouse en stor sal och två mindre rum, och Inn fyra rum. Hus med egna raka ytterkonturer börjar med ett öppet rum. Befintliga äldre rumsnivåer ersätts aldrig automatiskt. Rummen skapas lokalt och sparas med **Save map**; samma identiteter används när huset öppnas igen och i Storyboard.

Välj **Wall** och klicka på väggens start och slut, eller dra mellan två befintliga väggar. Den slutna ytan delas i två rum. Det större behåller det tidigare rummets identitet, text och bild; det andra blir **New room**. Med **Select** kan väggarnas knutpunkter dras; piltangenter flyttar en fokuserad punkt. Punkter på ytterväggar följer väggen. En vägg får inte korsa andra väggar eller flyttas genom inredning. **Remove wall** slår samman två rum, men skyddar rum som används av äventyr eller har egen text, bild eller andra kopplingar. **Undo** ångrar de senaste redigeringarna i den öppna interiören.

**Door** placerar en verklig dubbelriktad dörrförbindelse på en vägg. Välj dörren och ändra **Access** till Open, Locked eller Hidden. Standardentrén blir en ytterdörr med byggnadens befintliga entréinställning. Fönster placeras med **Window** på ytterväggar och skapar ingen förflyttningsväg. Färdiga dörrar får inte korsas av en ny vägg; flytta eller ta bort öppningen först.

Placera **Table**, **Chair**, **Bed** och **Storage** inne i rum. Välj ett föremål för namn, beskrivning och rotation. Dra för att flytta det, även till ett annat rum. Inredningen sparas med egna identiteter och ingår i rummets lokala bakgrundsfakta. Den skapar inte automatiskt inventarier, invånare eller nya spelhandlingar.

Under **Room background** kan ett rum få en egen bild. Utan egen bild används närmaste bild från huset eller dess omgivning; därefter gäller spelets vanliga bakgrund. **Use inherited picture** tar bort rummets egen bild. Scenbakgrunden visas när Appearance använder Scene. Ett äventyr behåller sin sparade kartversion; starta en ny genomspelning för att få med senare ändringar. Rumsfakta och möbler läggs i det aktuella rummets kontext i stället för att upprepas för varje hus i världens allmänna bakgrund.

**Extend building** bygger till en sida av ett rektangulärt hus och lägger till ett rum. Befintliga rum behåller sina identiteter. Ytterdörrar och fönster på den utbyggda sidan följer den nya ytterväggen; placera en dörr mellan det gamla huset och den nya delen. Byggnadens storlek och position på bykartan uppdateras, och en utbyggnad över en granne, gata eller kartkant avvisas. Den här första versionen har en våning och rektangulära utbyggnader. Egna raka ytterkonturer kan delas in och möbleras, medan kurvade konturer och fler våningar återstår.

Spelarkartan i högerspalten visar husets kända rum när spelaren befinner sig i ett rum med denna nya planlösning. Att klicka på kartan är fortfarande en visningsfunktion; förflyttning måste följa spelets dörrar eller författade äventyrsscener.


### Gemensam skala i meter

Interiören har egna sparade mått i meter. Startförslagen är Cottage 8 × 7 m, Longhouse 16 × 10 m, Townhouse 7 × 10 m och Inn 16 × 12 m. Det är redigerbara projektförslag, inte mått som kan läsas ut ur en dekorativ hussymbol. Under **House size · metres** anger man Width och Depth och väljer **Apply house size**. Kartans befintliga skala kalibreras inte om automatiskt; byggnadens kartavtryck ändras proportionellt när dess mått ändras.

Möbler använder samma skala: Table 1,6 × 0,9 m, Chair 0,5 × 0,5 m, Bed 0,9 × 2 m och Storage 1,2 × 0,5 m. Dörröppningar är normalt 0,9 m breda och fönster 1,2 m. Måtten visas för valt föremål eller öppning. Skalstocken visar två meter och rutnätet en meter. Rummen visar sin beräknade golvyta i m². Samma möbel- och dörrsymboler används i spelarkartan.

Utbyggnader ökar husets metermått men förstorar inte gamla möbler eller befintliga rums fysiska ytor. En ändring av hela husets mått skalar planlösningen medan möblerna behåller sina egna mått. En möbel måste få plats med hela sin roterade yta; en dörr eller ett fönster måste få plats på sin vägg. I Select kan öppningar dras längs väggen med samma identitet och låsinställning.

Äldre interiörer får startmått första gången de öppnas med denna version. Rummens identiteter, bilder, planlösning och möbelpositioner behålls. Möbler eller öppningar som inte längre får plats markeras rött, i stället för att flyttas eller tas bort automatiskt. Spara kartan för att behålla de införda metermåtten.


### Förhandsvisning och Delete

När Table, Chair, Bed, Storage, Door eller Window är valt följer en genomskinlig skuggbild muspekaren. Den använder samma metermått som det färdiga objektet. Dörrar och fönster snäpper till en vägg. Röd kontur visar att placeringen inte fungerar; musrörelser sparar inga objekt och ändrar inte kartan. Skuggbilden försvinner när pekaren lämnar ritningen eller med Escape, som återgår till Select.

Välj Select och markera en möbel, dörr eller ett fönster. Delete tar bort markeringen; Undo återställer både objekt och eventuell dörrförbindelse. Delete gäller inte rum, textfält eller menyer. Rumsindelning ändras fortfarande med väggverktygen.


### Väggar med hörn

Välj **Wall**, klicka på en befintlig vägg och klicka sedan ut önskade hörn inne i samma rum. Avsluta genom att klicka på en befintlig vägg igen. Den streckade förhandsvisningen följer hela väggkedjan; kartan ändras först när den är färdig och ett slutet rum kan bildas. Håll **Shift** för en vågrät eller lodrät sträcka. **Backspace** eller **Undo corner** tar bort det senaste hörnet; **Escape** avbryter hela utkastet. Det går fortfarande att dra en rak vägg direkt mellan två väggar.

En vinklad vägg får inte korsa sig själv, gå genom ett annat rum, en öppning eller inredning. Ett U-format avskärmat rum kan börja och sluta på samma vägg. De nya hörnen blir redigerbara knutpunkter i Select, och samma rumsidentiteter och författade innehåll bevaras enligt reglerna för vanlig rumsdelning.


## Speltest: The Copper Lantern

Öppna **With Rules → Try the inn** på startsidan. Testet sparar en egen värld, ett värdshus med fyra riktiga rum och ett litet äventyr. Din befintliga testkarta ersätts inte. Samma exempel kan öppnas för redigering med **Adventures → Inn & rooms example**. Varje ny exempelstart skapar en separat kopia.

1. Välj **Enter the inn**. Kartan i högerspalten byter från byn till planlösningen. Kartklick visar platser; knapparna förflyttar spelaren.
2. Undersök och ta mässingsnyckeln i **Common room**. Den försvinner från Objects here och hamnar i Inventory.
3. Välj **Unlock · Store room door**, sedan **Open · Store room door**. Utan nyckel går detta inte.
4. Gå till **Store room**. Rummet har en egen enkel testbild; övriga rum ärver värdshusets bild. Läs och ta gästboken.
5. Gå tillbaka genom Common room och välj **Leave the inn**. Målet markeras som slutfört först när du är ute med boken.
6. Välj **Save & return home**, fortsätt den sparade konversationen och gå in igen. Förrådsdörren förblir upplåst och öppnad, och de tagna föremålen återskapas inte. Rumsbeskrivningarna säger att deras tidigare platser är tomma.

Testet använder författade handlingar och kräver inga tärningskast. Dörrars tillstånd, föremål och upptäckter sparas i den enskilda spelomgången; originalkartan ändras inte av spelet. En ny spelomgång börjar med nyckeln och boken på plats och förrådet låst. Bilderna är enkla vektorillustrationer för att prova bildbyten. Att generera invånare och historier för alla godtyckliga hus ingår fortfarande inte.


## Spelarens Inventory

I regelstyrt spel och äventyr finns en egen **Inventory** i högerspalten. Föremål, vapen, ammunition och pengar/resurser visas var för sig. Klicka på ett föremål för dess sparade beskrivning och eventuell läsbar text; vapen visar de regler som redan finns för vapnet. Antalet pilar och mängden pengar följer spelets tillstånd.

När något läggs till visas **Added to inventory** och en kort **New**-markering. Befintlig packning markeras inte som ny när en konversation laddas. En nyckel kan visa ett val för att låsa upp en närliggande dörr; valet kontrolleras och sparas av samma spelmotor som scenens övriga handlingar. Författade överlämningar kan också visas när deras villkor är uppfyllda. Packningsvyn ger aldrig föremål eller fri tillgång till nya handlingar genom att man bara klickar på dem.

Den första versionen har ingen viktgräns, utrustningsplatser eller fri släpp-/ge-/använd-mekanik. Dessa kräver egna regler för placering, ägarskap och tillåtna mål. Vanliga regelspel visar sina definierade startföremål; AI-text ensam genomför ingen överföring.
