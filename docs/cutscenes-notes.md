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
