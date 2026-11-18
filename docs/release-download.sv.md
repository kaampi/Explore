# Uppgift: installationsfilen på GitHub Releases

Beslutat 18 november 2026.

## Problemet

När appen säger "Update available" öppnar knappen listan över byggen i GitHub Actions (`UPDATE_DOWNLOADS` i `src/ui/home/UpdateProvider.tsx`). Där måste man:

1. förstå att man ska välja ett grönt bygge
2. rulla ner till Artifacts
3. vara inloggad på GitHub, annars är filnamnet ingen länk och inget förklarar varför
4. packa upp en ZIP och köra filen i den.

Det är en sida för utvecklare, och en testare fastnade där.

Dessutom jämför appen sin egen commit med `main`. Varje commit på `main` ger därför "Update available", även en som bara ändrar dokument och inte ger något nytt bygge, eftersom `desktop-build.yml` bara bygger när koden ändras.

## Målet

- Installationsfilen kan laddas ner **utan inloggning och utan ZIP**, från en adress som aldrig ändras.
- Appen säger "uppdatering finns" **bara när det finns en ny installationsfil**.
- Knappen leder till en kort förklaring på tre steg, inte till GitHub.

## 1. Byggflödet: `.github/workflows/desktop-build.yml`

Efter steget som byter namn på filen, lägg till ett steg som publicerar den som en förhandsversion med den fasta taggen `alpha-latest`.

- **Bara från main:** `if: github.ref == 'refs/heads/main'`. Steget körs efter testerna och bygget, så en version som inte klarar testerna publiceras aldrig.
- **Behörighet:** `permissions: contents: write` på det här jobbet, inte på hela flödet.
- **Med `gh`**, som finns på Windows-maskinerna i Actions, och `GH_TOKEN: ${{ github.token }}`:
  1. Skapa förhandsversionen `alpha-latest` om den inte finns, med titeln "Senaste alfa" och flaggan `--prerelease`.
  2. Ladda upp `kaampi-Explore-Setup.exe` med `--clobber`, så att den ersätter den förra.
  3. Uppdatera beskrivningen med `gh release edit`. Den ska innehålla raden `Revision: <hela commit-id>` (`${{ github.sha }}`), datumet, och en mening om att bygget är osignerat och att Windows kan varna.
  4. Flytta taggen till den nya commiten: `git tag -f alpha-latest` och `git push -f origin alpha-latest`.

  Ladda upp först och flytta taggen sist. Då finns det alltid en fil att hämta, även om ett steg misslyckas.
- **Fast adress till filen:** `https://github.com/kaampi/Explore/releases/download/alpha-latest/kaampi-Explore-Setup.exe`. Använd inte `releases/latest/...`, för den pekar aldrig på en förhandsversion.
- **Artifacts:** behåll uppladdningen, men sänk `retention-days` till 14. De behövs bara för felsökning.
- **Varningen om Node.js 20:** byt `actions/checkout`, `actions/setup-node` och `actions/upload-artifact` till den senaste huvudversionen som kör på Node 24. Kontrollera versionerna på respektive sida på GitHub innan du byter.

## 2. Appen: `UpdateProvider.tsx` och `CheckUpdates.tsx`

### Två sätt att köra appen

| Körs som | Uppdatering finns när | Knappen leder till |
| --- | --- | --- |
| Skrivbordsappen (`isTauri()`) | förhandsversionen `alpha-latest` har en annan commit än appens egen, och den commiten ligger efter appens | rutan "Uppdatera Explore" nedan |
| Webbläsaren, från källkoden | `main` ligger före appens commit, som i dag | en kort text: "Hämta den senaste koden med `git pull` och starta om", med länk till `docs/running.md` |

### Kontrollen i skrivbordsappen

1. Hämta `https://api.github.com/repos/kaampi/Explore/releases/tags/alpha-latest`.
2. Läs commiten från raden `Revision: …` i `body`. Kontrollera att det är 40 hexadecimala tecken.
3. Är den samma som appens egen finns ingen uppdatering. Annars jämför med `compare/<egen>...<versionens>`, och finns det commits framåt (`ahead_by > 0`) finns en uppdatering.
4. Felmeddelanden och tidsgränser som i dag. En kontroll i bakgrunden som misslyckas syns inte.

Saknas förhandsversionen (404) räknas det som att ingen uppdatering finns. Då visas texten "Det finns ingen installationsfil att hämta än."

### Rutan "Uppdatera Explore"

Knappen "Update available" öppnar en liten dialog (`Modal`, med `Button` från `components.sv.md`):

> **En ny version av Explore finns**
>
> 1. **Ladda ner** installationsfilen. (Huvudknapp: öppnar den fasta adressen i webbläsaren, som laddar ner filen direkt.)
> 2. **Kör filen.** Windows kan säga att appen inte känns igen, eftersom den inte är signerad än. Välj **Mer information** och sedan **Kör ändå**.
> 3. **Följ installationen.** Stäng Explore om installationen ber om det. Den nya versionen ersätter den gamla.
>
> Dina världar, karaktärer och samtal finns kvar. Vill du vara säker, så ta en säkerhetskopia först. (Länk: **Exportera biblioteket**, samma funktion som i biblioteket.)
>
> (Vanlig knapp: Inte nu)

- Kan webbläsaren inte öppnas visas adressen med knappen "Kopiera länken", som i dag.
- Länken "View available builds" till Actions tas bort.
- Alla texter går genom `LanguageProvider` på engelska, svenska och norska.

## 3. Dokumentationen

- `README.md` och `docs/running.md`: ersätt beskrivningen av Actions och Artifacts med den fasta adressen och de tre stegen ovan. Säg att ingen inloggning behövs.
- `docs/alpha-release-checklist.md`: lägg till att förhandsversionen `alpha-latest` har fått den nya filen och rätt commit.

## Krav på tester

1. `UpdateProvider` i skrivbordsläge:
   - samma commit ger ingen uppdatering
   - en nyare commit ger uppdatering
   - en saknad förhandsversion (404) ger ingen uppdatering och rätt text
   - en beskrivning utan `Revision:` ger ett fel och ingen uppdatering
   - en commit som bara ändrar dokument på `main` ger ingen uppdatering.
2. `UpdateProvider` i webbläsarläge fungerar som i dag.
3. `CheckUpdates`:
   - knappen öppnar rutan
   - "Ladda ner" öppnar den fasta adressen
   - utan webbläsare visas adressen och "Kopiera länken"
   - det finns ingen länk till Actions.
4. Ett test läser `desktop-build.yml` och kontrollerar:
   - att publiceringen bara sker från `main`
   - att `contents: write` bara gäller jobbet
   - att filen laddas upp innan taggen flyttas.
5. **Prova på riktigt efter sammanslagningen:** kör flödet en gång via "Run workflow". Kontrollera sedan:
   - att `alpha-latest` finns med filen
   - att den fasta adressen laddar ner filen i ett privat webbläsarfönster, utan inloggning
   - att appen från det förra bygget säger att en uppdatering finns.

## Inte i den här uppgiften

Uppdatering inifrån appen ("Uppdatera och starta om") med Tauris uppdateringstillägg. Den kräver en signeringsnyckel som hemlighet i GitHub och ligger i `TODO.md`.
