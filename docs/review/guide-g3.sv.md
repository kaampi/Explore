# Skapa med guide · G3-granskning

**Besked den 23 november 2026. Åtgärda före G4.** Granskad leverans är `kaampi-guide-g3.patch` med SHA-256 `fc3c1ca2907cda8b3f0697ce73f0ab4af10a8499631f2dd3b9f9f39668e79ff6` ovanpå godkänd G2.

## Två fall där författarens text går förlorad

1. **Storyboard sparar efter guiden.** Öppna äventyret i Storyboard i flik A. Ändra hamnens ankomsttext i guiden i flik B och tillämpa. Spara sedan enbart en ny äventyrstitel från den äldre kopian i A. I ett oberoende integrationstest via samma sparmetod återkom hamnens gamla text vid nästa genomspelning. `CampaignStudio.tsx` lämnar hela äventyret till `IndexedDBRepository.saveCampaign`. Vid omgranskning ska båda ändringarna finnas kvar, eller så ska A få möjlighet att jämföra och lösa konflikten innan något skrivs över. Prova även om båda ändrat samma fält.
2. **Konflikt vid sparande av guideutkast.** Skriv en ny ankomsttext i A. Spara ett förslag till scennamn från B. Välj **Granska ändringar** i A och sedan **Läs in senaste scenen**. I ett oberoende gränssnittstest försvann ankomsttexten och bara det nya namnförslaget fanns kvar. I `GuideSceneEditor.tsx` ersätter återinläsningen alla lokala förslag med det senast sparade utkastet. Vid omgranskning ska båda förslagen kunna sparas. För två förslag till samma fält ska författaren kunna välja vilken text som ska behållas.

## Verifierat under granskningen

18 tester passerade i de fyra testfilerna för scenrevision, scenredigeraren, frågeguiden och fyrvaktarspelet. De täcker bland annat att en avbruten transaktion kan göras om, att en ändring av ett delat brev kan begränsas till äventyret och att nästa provspel använder sparad ankomsttext. De två oberoende motproven ovan reproducerade varsin förlust av text.

Inför leverans från `main` behöver också två äldre regressionsprov bli gröna. Språktestet hittar hårdkodad svensk gränssnittstext i engelskt läge. Storyboardproven för manuskriptutkast visar att varningen tappat informationen om var utkastet kommer från. Kör ordinarie testsvit på den sammanslagna koden.

Sol lämnar en rättad revision till Astra vid G3. När den är godkänd integreras den testade koden på `main`. Mats testar via **Sök efter uppdateringar** i skrivbordsappen.
