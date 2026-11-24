# Skapa med guide · G4

## Slutbesked för G4 v2 den 24 november 2026

**Godkänd. Sol kan börja med bildspårets första steg.** Underlaget är källkoden i leveransen `Kaampi-Explore-G4-v2.zip`, SHA-256 `209573398b21c5befddb271e998528f5d352f67b3a10aae388d4d29fa37c3405`, jämförd med ursprungsversionen av PR #67.

- **Rätt fält i spelplanen.** Jag körde proven för person, plats, grupp, föremål och kartnamn. Efter godkännande och återöppning var världsbeskrivningen kvar i samtliga fem fall. När författaren bad om råd utan att välja fält ändrades inget i planen.
- **Författaren styr vad som används.** Förslag från både samtal och synopsistolkning gick att redigera och avvisa i förhandsvisningen. Utkastet fick den redigerade texten först vid **Använd som svar**. Oanvända förslag försvann när panelen stängdes.
- **AI-hjälp efter provspel.** Scenredigeraren skickade ankomst respektive handlingsföljd till den valda modellens anslutning. När Studio samtidigt ändrade ankomsten krävdes ett uttryckligt val mellan texterna. Vid nästa provspel innehöll scenen författarens godkända text.
- **Äventyret går att spela offline.** I ett separat prov använde jag en simulerad modell för att skapa en öppning om en budcyklist. Därefter stängde jag guiden, spärrade nätanrop och öppnade den sparade databasen genom en ny instans. Spelmotorn lät cyklisten öppna väskan och hitta brevet utan ett enda nätanrop. Ett andra prov bröt anslutningen under en pågående diskussion. Författarens manuella ändring fanns kvar efteråt.

Alla 43 riktade tester och de två kompletterande proven passerade lokalt. Typkontroll och webbbygge passerade. AI-svaren var simulerade. Svarskvalitet med en verklig modell och visuell kontroll i Windows/Tauri vid 1280 × 800 återstår. Vid layoutkontrollen bör författaren särskilt prova första frågan. **Nästa** och den lokala idéhjälpen ligger i olika knapprader i den granskade koden, medan frågeguidens specifikation anger samma rad på dator.

Vid integrationen fick ett Windows-prov för kartkopplingar en revisionskonflikt. Provet läste databasen innan den sista autosparningen var klar. Astra ändrade provet så att det väntar på att det länkade resmålets plats har tömts i databasen innan det prövar godkännandet. Spelets och guidens kod är densamma som i leveransen.

## Historik · Första G4-granskningen

**Astras besked den 24 november 2026. Åtgärda före godkännande och bildspåret.** Granskningen gäller PR #67 på revision `9729d223ec2ebe7329686bd29d9e4dc9e72d1909`.

### 1. Ett personförslag kan skriva över världsbeskrivningen

Skriv en världsbeskrivning. Välj **Person** på världsfrågan och be Assistenten föreslå en person. Välj **Använd som svar**, stäng guiden och läs tillbaka utkastet. I det oberoende gränssnittsprovet ersatte personförslaget hela den sparade världsbeskrivningen. Ämnet påverkar modellfrågan men `guideAnswer` för `world` skriver alltid till `world.note`.

Vid omgranskning ska författaren se vilket fält förslaget gäller. Prova person, plats, grupp, föremål och karta med en redan ifylld världsbeskrivning. En godkänd ändring ska bara påverka sitt avsedda fält. Om ett entydigt mål saknas kan Assistenten ge råd tills författaren väljer mål.

### 2. Förhandsvisningen saknar redigering och avvisning av enskilda förslag

Förslag i diskussionen och synopsistolkningen visas som text i `GuideAssistant.tsx`. **Använd som svar** lägger in den visade texten direkt. En annan formulering går att skriva i guiden efteråt. Att stänga panelen bevarar svaret, men samma förslag visas igen när panelen öppnas.

Prova två synopsisförslag. Redigera det ena i förhandsvisningen och avvisa det andra. Kontrollera att spelplanen fortfarande har sina tidigare värden tills författaren använder den redigerade texten. Upprepa redigering och avvisning på ett förslag från diskussionen.

### 3. AI-hjälpen saknas vid ändring av en redan spelad scen

Provspela ett guideäventyr, öppna **Ändra scenen i guiden** och redigera ankomsten. **Ge ett textförslag** i `GuideSceneEditor.tsx` använder en lokal textregel. Den kan användas offline. Modellanslutningen finns i frågeintervjun, men den här vägen till en sparad scen saknar motsvarande AI-val.

Vid omgranskning ska författaren kunna be om en ny ankomst eller följd från den valda modellen, redigera eller avvisa förslaget och provspela sin godkända version. Prova att en manuell Studio-ändring på samma fält fortfarande hanteras av G3:s konfliktkontroll.

### Verifiering

- Alla 27 befintliga tester i fyra riktade testfiler passerade lokalt. De omfattar en spelbar öppning offline och en öppning som skapats genom att godkänna separata synopsisförslag från en simulerad Ollama-anslutning. GitHubs bygg- och testkontroll för PR-revisionen passerade också.
- Fem oberoende gränssnittsprov kördes. Tre reproducerade fynden ovan. Två bekräftade att författarens eget svar finns kvar efter ett avbrott mitt i ett modellanrop och när en förslagspanel stängs utan att något tillämpas.
- Modellens svar och anslutningsavbrottet simulerades. Svarskvaliteten från en verklig modell och guidens layout i ett Tauri-fönster på 1280 × 800 återstår att verifiera.

[Granskad revision](https://github.com/kaampi/Explore/commit/9729d223ec2ebe7329686bd29d9e4dc9e72d1909)
