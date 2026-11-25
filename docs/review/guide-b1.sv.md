# Bildförslag i spelplanen · B1

## B1 v2 är godkänd

**Godkänd av Astra. Sol kan börja med B2.** Beskedet registrerades den 25 november 2026. Omgranskningen gäller [B1 v2-patchen vid `13372428`](https://github.com/kaampi/Explore/blob/13372428c7774ed8c20afe1cbacbb8f32473b150/docs/review/kaampi-guide-b1-v2.patch), applicerad på `ed6fc097a3cd00a7bcfb86567890f1e0467788b6`. Patchens SHA-256 är `fad4326ebde9cf843de802ff21f654c59ffd5b3523451d15d0e039010bee85a1`.

- När det sparade äventyret öppnades igen återstod bara violinistens porträtt bland förslagen för Musikhuset, dirigenten, notstället och violinisten. Två personer med samma namn följdes var för sig via sina kort.
- Öppningens platskort och dess uttryckligen länkade kartnod gav ett enda förslag, med öppningen först. Två olika platser med samma namn fick varsitt förslag.
- Åhamnen fick ett bildförslag trots ett kolliderande ID i en annan värld. När Åhamnen hade en egen bild eller ärvde en bild från en överordnad nod försvann förslaget.

Webbbygget, 24 riktade tester och Astras fyra oberoende kontroller passerade. Två fel i den bredare lokala sviten kunde reproduceras även före patchen, i Core-manuskriptläsaren och i cutscene-tidslinjen.

Den visuella kontrollen rapporterades godkänd i Windows/Tauri vid 1280 × 800. På första frågan syntes hela svarsfältet utan rullning. **Nästa** och **Hjälp mig komma igång** låg på samma rad.

## Historik från granskningen av första leveransen

**Astras besked den 24 november 2026. B1 är öppen för rättning. B2 väntar.** Granskningen gäller den bifogade B1-leveransen med SHA-256 `8e8e28cdf49bd948780bb6003383c2c57d126e3b2b07ba3a85a26b4318e0b013`, byggd på `0e22bd06`.

### 1. Bildförslagen ligger kvar när författaren har lagt till bilder

Jag skapade och godkände ett äventyr med öppningsplatsen Musikhuset, dirigenten som ny person och ett notställ som nytt föremål. Jag sparade en bild på vart och ett av de tre skapade bibliotekskorten. Sedan öppnade jag samma databas på nytt och fällde ut **Bildförslag** i guiden för det sparade äventyret. Alla tre bilderna föreslogs fortfarande. Violinisten, som fortfarande saknade porträtt, fanns också med.

Vyn för det godkända äventyret skickar intervjuutkastet till `GuideImagePlan`. För nya resurser saknar det utkastet referenserna som `guideImages` använder för att läsa bilder. Utgå från äventyrets sparade kopplingar när författaren öppnar bildlistan efter godkännandet. Vid omgranskning ska bara violinistens porträtt återstå bland dessa fyra förslag. En annan person med samma namn ska kunna ha ett eget porträtt.

### 2. Platskort och kartnod ger två förslag till samma bakgrund

Välj Konserthuset från bibliotekets platskort i öppningen. Välj i en senare scen den kartnod som uttryckligen pekar på samma kort. Med en enda sådan nod och utan bilder fick jag både **Öppningsbild · Konserthuset** och **Scenbakgrund · Konserthuset**. Funktionen grupperar kortet efter plats-ID och noden efter världs-ID och nod-ID.

Vid omgranskning ska den här platsen ge ett enda förslag med öppningen först. Prova också två skilda platser med samma namn så att båda finns kvar när båda saknar bild.

### 3. En bild i en annan värld kan dölja ett förslag

Jag använde en bildlös kartnod för Åhamnen och ett bildsatt platskort för Torrdockan i en annan värld. Kortets ID var samma som nodens lokala ID. Kartans ordinarie platsvy gav Åhamnen utan bild. Bildlistan utelämnade ändå Åhamnen eftersom kortuppslaget i `guideImages` sökte efter ID i hela biblioteket.

Vid omgranskning ska Åhamnen föreslås med dessa två världar i biblioteket. Kontrollera även att en bild som verkligen tillhör Åhamnen eller ärvs från dess överordnade kartnod fortfarande räknas.

### Verifierat

Webbbygget och hela den ordinarie sviten passerade lokalt, med 2 457 godkända och 6 överhoppade prov. De 20 riktade proven passerade också. Av fyra kompletterande prov reproducerade tre fallen ovan. Det fjärde bekräftade att hela prompten markeras för manuell kopiering när urklippet är otillgängligt, utan nätanrop.

**Nästa** och **Hjälp mig komma igång** ligger nu i samma knappgrupp på första frågan. Den visuella kontrollen i Windows/Tauri vid 1280 × 800 återstår. B1 bygger bildprompterna lokalt. Det kvarvarande provet med en verklig modell gäller G4:s frivilliga texthjälp.
