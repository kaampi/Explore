# Skapa med guide · G3-granskning

## Slutbesked för G3 v3 den 23 november 2026

**Godkänd. Sol kan börja G4.** Granskad leverans är `kaampi-guide-g3-v3.patch` med SHA-256 `921b92f8dc1b725c4456739c4e1d2abd8bd31e4774220af4d3fa0631d6640572` ovanpå godkänd G2.

Jag verifierade att Studio kan öppna ett guideäventyr, gå via **Alla äventyr**, skapa ett separat manuellt äventyr, spara och öppna det igen. Båda äventyrena fanns kvar med skilda ID:n. Mitt ursprungliga gränssnittsprov från v2 passerade också utan någon lokal kodrättning.

Alla 32 riktade tester passerade, inklusive de tidigare konflikterna mellan två flikar, språkval, manuskriptutkast och återförsök efter en avbruten skrivning. G4 omfattar den frivilliga AI-hjälpen. Vid nästa avstämning ska guiden kunna provspelas med och utan AI.

## Historik · Omgranskning av G3 v2 den 23 november 2026

**Besked till Sol. Åtgärda sparandet av ett nytt manuellt äventyr före G4.** Granskad patch är `kaampi-guide-g3-v2.patch`, SHA-256 `a232477255f93d5a52ef2a9ff5fb143749b78280afcc9212b51f9bde75339416`, tillämpad ovanpå godkänd G2.

De två tidigare felen med samtidiga ändringar är verifierat rättade. Sju riktade testfiler med sammanlagt 31 tester passerade, inklusive språkval, manuskriptvarningen, återförsök efter avbruten skrivning och nytt provspel. Typkontroll och webbbygge passerade. Lint gav 0 fel och 130 varningar. Full CI har inte körts för denna patch.

### Kvarvarande fel i Studio

1. Öppna ett sparat guideäventyr i Studio och välj **Alla äventyr**.
2. Skapa ett nytt manuellt äventyr i samma fönster, ge det ett namn och välj **Spara äventyr**.
3. Studio påstår att en annan flik har ändrat äventyret. Ett oberoende gränssnittstest kontrollerade databasen efter sparandet. Endast det första äventyret fanns där. Felet uppstår med en enda flik.

I `CampaignStudio.tsx` sätter `open` jämförelseunderlaget till det öppnade äventyret. `createNew` lämnar sedan kvar det underlaget. Vid första sparandet behandlar `writeCampaign` därför det nya äventyret som ett tidigare sparat guideäventyr som har tagits bort. Jag provade att nollställa `editBaseline.current` i `createNew` i en isolerad kopia. Då passerade samma gränssnittstest.

**Acceptansprov.** Spara det andra äventyret via Studio, öppna det på nytt och kontrollera att båda äventyrena finns med skilda ID:n. Kör även de tidigare tvåfliksproven. Lägg rättningen och regressionsprovet i nästa G3-leverans.

## Historik från granskningen av den första G3-patchen

**Besked den 23 november 2026. Åtgärda före G4.** Granskad leverans är `kaampi-guide-g3.patch` med SHA-256 `fc3c1ca2907cda8b3f0697ce73f0ab4af10a8499631f2dd3b9f9f39668e79ff6` ovanpå godkänd G2.

## Två fall där författarens text går förlorad

1. **Storyboard sparar efter guiden.** Öppna äventyret i Storyboard i flik A. Ändra hamnens ankomsttext i guiden i flik B och tillämpa. Spara sedan enbart en ny äventyrstitel från den äldre kopian i A. I ett oberoende integrationstest via samma sparmetod återkom hamnens gamla text vid nästa genomspelning. `CampaignStudio.tsx` lämnar hela äventyret till `IndexedDBRepository.saveCampaign`. Vid omgranskning ska båda ändringarna finnas kvar, eller så ska A få möjlighet att jämföra och lösa konflikten innan något skrivs över. Prova även om båda ändrat samma fält.
2. **Konflikt vid sparande av guideutkast.** Skriv en ny ankomsttext i A. Spara ett förslag till scennamn från B. Välj **Granska ändringar** i A och sedan **Läs in senaste scenen**. I ett oberoende gränssnittstest försvann ankomsttexten och bara det nya namnförslaget fanns kvar. I `GuideSceneEditor.tsx` ersätter återinläsningen alla lokala förslag med det senast sparade utkastet. Vid omgranskning ska båda förslagen kunna sparas. För två förslag till samma fält ska författaren kunna välja vilken text som ska behållas.

## Verifierat under granskningen

18 tester passerade i de fyra testfilerna för scenrevision, scenredigeraren, frågeguiden och fyrvaktarspelet. De täcker bland annat att en avbruten transaktion kan göras om, att en ändring av ett delat brev kan begränsas till äventyret och att nästa provspel använder sparad ankomsttext. De två oberoende motproven ovan reproducerade varsin förlust av text.

Inför leverans från `main` behöver också två äldre regressionsprov bli gröna. Språktestet hittar hårdkodad svensk gränssnittstext i engelskt läge. Storyboardproven för manuskriptutkast visar att varningen tappat informationen om var utkastet kommer från. Kör ordinarie testsvit på den sammanslagna koden.

Sol lämnar en rättad revision till Astra vid G3. När den är godkänd integreras den testade koden på `main`. Mats testar via **Sök efter uppdateringar** i skrivbordsappen.
