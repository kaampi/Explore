# Bygganteckningar för mellanscener

## 20 november 2026 · Delmål 1

- Varje delmål får en egen kumulativ gren och en utkast-PR mot `main`. På så sätt går det att granska varje del även innan beroendena har slagits ihop. PR #36 får dokumentbytet.
- En migrerad film får ett stabilt id härlett från placeringens gamla id. Placeringens id behålls så att redan sparad kö och historik fortfarande refererar till rätt placering. När äldre data saknar datum får filmen ett deterministiskt datum. En äldre bild som saknar miniatyr används också som miniatyr.
- Bildbyten överlappar in- och uteffekten från bildkanalens fördröjning. Textens uteffekt sker när spelaren lämnar steget. Automatiska steg väntar tills både kanalerna och timern nått sina slut. Ljudkanalens tid mäts i dess fördröjning och toning, eftersom ett refererat spår kan saknas och musik loopar.
- Spelaren får ett avslutat uppspelningstillstånd från den rena tidslogiken. Själva `onEnd` ligger utanför modellen, i spelarkomponenten.

## 20 november 2026 · Delmål 2

- Helskärm täcker spelvyns spelområde. Förhandsvisning kan visa exakt samma spelare i sin egen ram.
- Motorn kopierar bara filmer som används av placeringar. Äldre inbäddade filmer bevaras vid inläsning; saknade filmreferenser blockerar inte spel. Spelaren startar om från första steget efter omladdning.
- Spelaren läser sparad ljudvolym, och volym noll betyder avstängt. Textningen visas när spåret saknas eller webbläsaren nekar uppspelning. Det finns ingen ny global ljudinställning.
- Text över bild använder palettens ljusa fototext och ett mörkt underlag från spelvyns palett. Spelaren skickar full text till skärmläsaren en gång per textbyte, samtidigt som framskrivningen fortsätter visuellt.

## 20 november 2026 · Delmål 3

- Säkerhetskopian har ett valfritt toppfält `cutscenes`. Äldre säkerhetskopior utan fältet fungerar, och ljudspår behåller sina id:n. Av två kopior med samma film-id lagras den som användaren uttryckligen importerar. Äventyr lagrar bara placeringarnas film-id. Vid läsning hämtas de refererade filmerna så att befintlig synkron spelstart kan kopiera dem. Version 1-filmer flyttas ur äventyren när databasen uppgraderas.
- Redigeringsvyn använder textfält och tidsinställningar bredvid ett stegrutnät. Förhandsvisningen visar bild när det finns en och startas uttryckligen. Enstegsförhandsvisning använder tidigare bild, text och musik när det valda steget behåller dem. Automatiska steg får tre sekunder när de väljs första gången.
- Varje ändring i utkastet kan ångras. Redigering av ljudreferenser påverkar utkastet. En uppladdad ljudfil hamnar i det gemensamma ljudbiblioteket med dess vanliga begränsningar.
- Navigering bort från bibliotekets studio använder samma bekräftelsemekanism som andra osparade studior. Studiofunktionen behåller sitt filmgränssnitt. Biblioteket sparar först och markerar utkastet som sparat när den uppdaterade filmen kommer tillbaka.

## 20 november 2026 · Delmål 4

- Placeringar som läggs till utan menyval använder vald scen, eller första scenen. Om filmhyllan är tom visas en saknad film tills författaren skapar eller väljer en. Varningarna blockerar aldrig spel.
- Ordna fäster korten mot samma rutnät som Storyboard. Scen- och vägkort föredrar ett ledigt läge intill utlösaren. Faktakort läggs på en rad under spelkartans kort. Ångra återställer också placeringarna.
- Exemplet *Before the bells* installeras från filmhyllan och blir ett vanligt äventyr i biblioteket. Det använder den befintliga budbärarens kort som utgångspunkt, en bild som redan följer med appen och textning för ljudsignaler.

## 20 november 2026 · Delmål 5

- Studion följer skissen från genomgången: förhandsvisning till vänster, vald cells panel till höger och hela kanalrutnätet längst ned. Vald rad och kolumn markeras. Den stillastående förhandsvisningen visar valt stegs bild och text direkt; film och enskilda steg kan spelas därifrån.
- Filmens toppmeny har Arkiv för att spara och stänga, och Inställningar för kolumn eller helskärm, överhoppning och förhandsvisningstema. På smala skärmar finns steglista och separat panel.
- Rörelser och filter använder de befintliga uppräknade värdena i filmformatet. De har fasta förlopp, fortsätter när bilden behålls och pausar tillsammans med filmen. Enkla ramar och minskad rörelse stänger av rörelsen, med filtret kvar. Brev använder temats `NoteCard`.

## 20 november 2026 · Tidslinje inom steget

- Rutnätet är filmens översikt. Under det visar stegets tidslinje samma fördröjningar, toningar och klocka som spelaren. Fälten i högerpanelen redigerar tiderna. En engångssignal visas som en markör eftersom ljudfilens speltid inte ingår i filmen. Streckade spår betyder att innehållet väntar kvar på klick. Textens uteffekt och stegets övergång visas med sina längder när tidpunkten beror på ett klick.
- Ctrl och vertikal dragning zoomar runt pekaren. Mellanslag och dragning panorerar förhandsvisningen på båda axlarna och tidslinjen längs tiden. Zoomknappar och piltangenter ger samma funktion utan musgest. Vyn sparas inte i filmen.
- `BeatSchema` får tillägget `transition` för övergången från steget till nästa. `effect` är `cut`, `crossfade` eller `through-black`, med `cut` som standard. `seconds` har samma gränser som kanalernas längder och standardvärdet 1 s. Sista steget har inget efterföljande scenbyte. Övergången följer efter textens uteffekt, visar nästa stegs första bildruta och låter dess kanalur börja när bytet är klart. Pågående musik fortsätter. Enkla ramar och minskad rörelse begränsar toningen till 150 ms. Övergången följer sitt utgående steg vid omordning.
- Till textdelmålet hör fri placering och rotation med handtag och vinkelvärde, samt övervägda val för opacitet, kontur, skugga och yttre glöd. Blandningslägen bedöms i den avancerade textpanelen mot både ljusa och mörka bilder.
- Efter genomgången flyttas filmhyllan till Arkiv → Öppna film, med lista, exempel och befintliga filmåtgärder i en dialog. Filmtiteln redigeras i Inställningar tillsammans med visningsläge, överhoppning och förhandsvisningstema. Förhandsvisningen och tidslinjen får hyllans tidigare utrymme. Egenskaper för det valda elementet finns kvar till höger om förhandsvisningen.
