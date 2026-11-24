# Skapa med guide · G4

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
