# Bygganteckningar för mellanscener

## 20 november 2026 · Delmål 1

- Varje delmål får en egen kumulativ gren och en utkast-PR mot `main`. På så sätt går det att granska varje del även innan beroendena har slagits ihop. PR #36 får dokumentbytet.
- En migrerad film får ett stabilt id härlett från placeringens gamla id. Placeringens id behålls så att redan sparad kö och historik fortfarande refererar till rätt placering. När äldre data saknar datum får filmen ett deterministiskt datum. En äldre bild som saknar miniatyr används också som miniatyr.
- Bildbyten överlappar in- och uteffekten från bildkanalens fördröjning. Textens uteffekt sker när spelaren lämnar steget. Automatiska steg väntar tills både kanalerna och timern nått sina slut. Ljudkanalens tid mäts i dess fördröjning och toning, eftersom ett refererat spår kan saknas och musik loopar.
- Spelaren får ett avslutat uppspelningstillstånd från den rena tidslogiken. Själva `onEnd` ligger utanför modellen, i spelarkomponenten.
