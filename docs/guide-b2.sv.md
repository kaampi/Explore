# B2 i Skapa med guide · Från bildförslag till sparad bild

## Uppdrag till Sol

I ett sparat guideäventyr ska författaren kunna välja en lokal bild för ett bildförslag, se vilket bibliotekskort den kommer att hamna på och spara den där. Hela flödet ska gå att använda med AI frånkopplad.

B1 v2 tar fram bildförslagen och deras kopierbara prompter. B2 bygger vidare på den godkända versionen. [Astras B1-besked](review/guide-b1.sv.md) · [B1-integrationen i #76](https://github.com/kaampi/Explore/pull/76) · [B2-leveransen i #77](https://github.com/kaampi/Explore/pull/77)

## Så ska det fungera

1. Författaren öppnar **Bildförslag** i det sparade äventyret. För ett förslag med ett känt bibliotekskort visar guiden vilket kort bilden gäller. Två kort med samma namn ska gå att skilja åt, till exempel med sina beskrivningar. Använd äventyrets sparade koppling och kortets ID när bilden sparas.
2. Författaren kan kopiera bildprompten och välja en bild från datorn. Guiden visar förhandsvisningen tillsammans med målkortet.
3. **Avbryt** kastar filvalet. Kortet behåller sin tidigare bildstatus och förslaget finns kvar.
4. **Spara bild** använder den befintliga bildhanteringen för korttypen. När sparandet lyckas visas bilden på kortet och förslaget försvinner. Om sparandet misslyckas ska författaren kunna se felet och försöka igen.
5. För förslag som saknar en entydig koppling till ett sparat kort finns B1:s kopierbara prompt kvar.

## Provuppgift för Mats och Astra

Öppna konsertäventyret med AI frånkopplad. Välj violinistens porträtt, kopiera prompten, välj en lokal PNG och kontrollera förhandsvisningen. Tryck **Avbryt**, öppna samma förslag igen och välj sedan **Spara bild**. Stäng guiden och öppna äventyret på nytt. Kontrollera att porträttförslaget är borta och att rätt person har bilden under **Bygg → Karaktärer**.

Upprepa med två personkort som har samma namn och olika beskrivningar. Bara det valda kortet ska få porträttet. Det andra ska behålla sitt bildförslag. Kör även B1:s tre återprov för redan bildsatta kort, platskort med länkad kartnod och kolliderande ID i olika världar.

## Överlämning

Sol lämnar testbar revision, testresultat och eventuella kvarstående fel till Astra. Befintlig B2-revision för granskning är [`27ee65f`](https://github.com/kaampi/Explore/commit/27ee65f2bf93a4b80477184f4d8e1282a46be169) i #77.

## Hur referenskort för karaktärer ansluter till guiden

B1 ger författaren en kopierbar porträttprompt. B2 låter författaren spara det färdiga porträttet. Båda flödena ska fungera för en karaktär som saknar referenskort. Även en karaktär som har ett referenskort kan sakna spelporträtt och ska då få B1:s porträttförslag.

Claude föreslås skriva ett separat designbeslut före implementation. Beslutet ska beskriva kortets egen plats på karaktären, dess kroppsvyer, porträtt, uttryck och detaljer, vilka fakta och färger som lagras som data samt hur ett aktivt kort och dess tidigare versioner identifieras. Det ska även beskriva Codex roll som gemensam källa, vilken version Explore behåller offline och hur själva referenskortet hålls utanför spelvyn och exporten.

Guiden och karaktärsbiblioteket bör sedan använda samma funktion för att bygga en karaktärsprompt av motiv, bildstil och den valda versionens fakta och palett. Verktyg som stöder referensbilder kan också få kortbilden. Sol ansluter guiden när produktägaren har tagit ställning till designen. Fram till dess kan Astra granska den befintliga B2-leveransen.
