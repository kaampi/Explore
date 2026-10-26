# Utvecklingsmöjlighet: ComicBook × Sandbox AI

**Status:** Idé / framtida utvecklingsspår – inte beslutad implementation.
**Prioritet:** Utforskas efter eller parallellt med Adventure & Story Engine, utan att blockera första publika alphan.

## Vision
ComicBook och Sandbox AI kan dra nytta av gemensamma modeller för visuellt berättande. Samma karaktärer, platser, uttryck och scener kan användas för både serier och interaktiva AI-äventyr. Projekten ska fortsatt fungera självständigt.

## Möjligheter
1. **Delade visuella resurser:** karaktärsporträtt, ansiktsuttryck/humör, platsbilder, bakgrunder, föremål och visuella stilar. Undersök konsekvent karaktärsutseende över flera bilder.
2. **Gemensam scenbeskrivning:** ett avgränsat utbytesformat för scen, plats, karaktärer, stämning, tid, bildreferenser och dialog. ComicBook kan skapa serierutor; Sandbox AI kan presentera samma scen interaktivt.
3. **Visual Mode i Sandbox AI:** ett valbart spelläge inspirerat av visual novels och interaktiva serier, med bakgrundsbilder, karaktärsporträtt, dialogruta och föreslagna val. Den fria textinmatningen ska finnas kvar. Befintligt Chat Mode ska inte ersättas; båda använder samma spelmotor, Story Director och Encounter Engine.
4. **Adventure Chronicle → ComicBook:** exportera en strukturerad sammanfattning av en faktisk spelomgång (scener, dialog, handlingar, konsekvenser, relevanta bildreferenser) för att skapa en serie av spelarens unika äventyr.
5. **ComicBook → Sandbox AI (långsiktig idé):** återanvända världar, karaktärer och scener som grund för ett spel. Kräver komplettering med spelbara val, regler, tillstånd och alternativa förlopp.

## Arkitekturprinciper
- **Ingen sammanslagning av applikationerna.** Börja med att kartlägga respektive projekts datamodeller.
- **Utbytesformat före gemensamt bibliotek.** Skapa ett litet, versionerat format och prova import/export innan ett eventuellt gemensamt StoryCore-bibliotek övervägs.
- **Tydligt ansvar:** spelregler, Story Director och tillstånd hör till Sandbox AI; serielayout, paneler och pratbubblor hör till ComicBook.
- **Lokalt först:** undvik obligatoriska molntjänster och serverberoenden.
- **Rättigheter och integritet:** exportera endast resurser som får delas; inkludera aldrig privata chattar eller nycklar utan uttryckligt, avgränsat användarval.

## Föreslagen ordning
1. Inventera karaktärs-, plats-, bild- och scenmodeller i båda projekten.
2. Prova gemensamma bildreferenser och humörbaserade karaktärsporträtt.
3. Skissa ett minimalt scenutbytesformat och testa det med en scen.
4. Prototypa ett valbart Visual Mode ovanpå befintlig Sandbox AI-chat.
5. Prova Adventure Chronicle-export till ComicBook.
6. Utvärdera först därefter gemensamt bibliotek och omvänd import.

## Avgränsning
Detta är en **utvecklingsmöjlighet**, inte ett krav för Sandbox AI 0.1 Alpha eller en förutsättning för Adventure Engine. Tekniska detaljer och arbetsinsats bestäms efter kartläggning av båda kodbaserna.
