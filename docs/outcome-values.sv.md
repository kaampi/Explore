# Designbeslut: utfall som ändrar värden

Beslutat 24 november 2026. Gäller spelmotorn (`src/game/`), Storyboards redigering av handlingar och följder, och spelvyn. Innehåller två formatförslag som ska granskas av ChatGPT-spåret enligt `ownership.sv.md` innan något byggs.

## Varför

Regelverken har värden som Förstånd, Förtroende och Nerv, men i ett spel kan bara strid ändra något, och då bara hälsan. Det räcker för fantasy med svärd, men inte för skräck (förståndet sjunker), romantik (förtroendet växer) eller vardag (att övertala en busschaufför). En följd ska kunna ändra ett värde, och ett värde ska kunna öppna eller stänga val.

Allt i det här beslutet sköts av motorn. Det fungerar lika bra utan AI, och det är grunden för spel utan AI.

## Det som redan finns

- Ett slag kan göras mot vilket värde som helst i regelverket (`check: { stat, modifier }`). Värdet räknas om till en chans i procent efter regelverkets skala.
- En följd kan sätta fakta, ge och ta föremål, låsa upp dörrar, starta strid och flytta resurser (`EffectSchema`).
- Motorn räknar fram fyra grader: exceptionell, lyckad, misslyckad och allvarlig. Författaren kan bara skriva en följd för lyckat och en för misslyckat.
- Spelarens och personernas värden (`actor.stats`) följer med mellan scenerna i ett äventyr (`AdventureEngine.ts`).
- Förtroende, bekantskap och spänning för en person i en scen (`SceneCastSchema`) följer med i fritt spel, men tappas när ett äventyr startar (`adventureStart.ts`).
- I AI-spel får AI flytta ett värde högst "Move / beat" (`maxShift`) per tur.

## Beslutet

### 1. En följd kan ändra ett värde

En ny effekt:

```ts
{ kind: "change-value", who: "player" | ActorId, value: string, by: number }
```

- `value` är ett värde i regelverket, till exempel `sanity`, eller ett av personens relationsvärden: `trust`, `familiarity` eller `tension`.
- `by` är positivt eller negativt. Värdet stannar inom regelverkets gränser, och relationsvärdena inom 0–100.
- **`maxShift` gäller inte här.** Det är AI:ns gräns per tur. En effekt är författarens uttryckliga beslut.
- Ändringen gäller direkt. Nästa slag mot värdet använder det nya värdet, och det följer med till nästa scen som allt annat i `actor.stats`.

Ett exempel från skräckregelverket: "Öppna källardörren" har ett slag mot Nerv. Vid ett allvarligt misslyckande blir följden "Förstånd −15" och fakta "har sett det i källaren".

### 2. Relationsvärden följer med in i spelet

Varje person som inte är spelaren får relationsvärden mot spelaren:

```ts
// ActorSchema, valfritt
relation?: { trust: number; familiarity: number; tension: number }
```

- När ett äventyr startar fylls `relation` från scenens `SceneCastSchema`, där värdena i dag är text ("20"). Saknas personen där används 20, 10 och 5, samma som i dag.
- Följer med mellan scener som resten av personen.
- I fritt spel med AI används samma värden som i dag. Ingenting ändras där.

### 3. Fyra följder i stället för två

`InteractionSchema` får två valfria följder:

```ts
exceptional?: Outcome   // saknas: success används
severe?: Outcome        // saknas: failure används
```

- I Storyboard visas "Exceptionellt" och "Allvarligt" som hopfällda rader under Lyckat och Misslyckat, med texten "Som lyckat" och "Som misslyckat" tills författaren skriver något.
- Utan slag finns bara Lyckat, som i dag.

### 4. Ett värde kan vara ett villkor

Handlingar, kopplingar mellan scener och scenbeskrivningar får ett valfritt villkor på ett värde:

```ts
requiresValues?: { who: "player" | ActorId; value: string; atLeast?: number; atMost?: number }[]
```

- Finns på `InteractionSchema`, på varianterna i `descriptions` och på `AdventureLinkSchema`.
- Exempel: "Fråga Edda om det hon inte berättat" kräver förtroende minst 60. "Skaka av dig rösterna" kräver förstånd högst 30.
- Ett val som inte är uppfyllt visas inte, precis som ett val vars fakta saknas. Det finns inget "låst"-läge för värden, eftersom ett synligt krav på en siffra bryter stämningen.

### 5. Vad som händer vid en gräns

Ett äventyr får regler för gränser:

```ts
// CampaignTemplateSchema, valfritt
valueLimits?: {
  id: string;
  who: "player" | ActorId;
  value: string;
  atMost?: number;          // när värdet når hit eller lägre
  atLeast?: number;         // eller hit eller högre
  text: string;             // det som berättas
  setsFlags: string[];
  ends?: "defeat" | "ending";
}[]
```

- Motorn kontrollerar gränserna efter varje effekt. Varje gräns slår till en gång per spel.
- **Gränsen sätter fakta.** Resten, som en ny scen, ett nytt val eller en låst väg, byggs med det som redan finns: kopplingar och handlingar som kräver fakta. Exempel: "Förstånd högst 0" sätter fakta "har brutit ihop", och en koppling som kräver den faktan leder till scenen "Sjukhuset".
- `ends: "defeat"` avslutar spelet som när hälsan tar slut. `ends: "ending"` avslutar spelet som ett slut, inte ett nederlag.
- Utan regler för gränser händer ingenting vid en gräns. Värdet stannar där.

### 6. Vad spelaren ser

Spelvyn följer regelverkets inställning "Shown in play" (`display`):

| Värde | När det ändras |
| --- | --- |
| Mätare (`meter`) | Mätaren under "Din rollperson" ändras med en kort rörelse, och en notis visas: "Förstånd −15". |
| Färdighet (`skill`) | En notis, och siffran i listan ändras. |
| Dolt (`hidden`) | Ingen notis och ingen siffra. Bara följdens text berättar. |
| En persons relationsvärde | Ingen siffra. En notis i ord när värdet passerar en tredjedel eller två tredjedelar: "Edda litar mer på dig." / "Edda blir mer på sin vakt." |

- Varje ändring hamnar i dagboken, med samma ord som notisen.
- En gräns som slår till visar sin text i berättelsen, som en följd.
- Med minskad rörelse ändras mätaren utan rörelse.

### 7. Storyboard

- **Följder:** raden "Ändra ett värde" med fyra fält: [Spelaren ▾] [Förstånd ▾] [−] [15]. Listan över värden kommer från äventyrets regelverk och personernas relationsvärden.
- **Villkor:** raden "Kräver ett värde" med [Spelaren ▾] [Förtroende ▾] [minst ▾] [60].
- **Gränser:** ett eget avsnitt i äventyrets inställningar, "När ett värde når en gräns".
- **Kontroller i motorn,** som också ska finnas i `authoringChecks.ts` (se `storyboard-ai.sv.md`):
  - ett värde som inte finns i regelverket
  - ett villkor som aldrig kan uppfyllas, till exempel "minst 120" när skalan går till 100
  - en gräns som aldrig kan nås, eftersom inget i äventyret ändrar värdet åt det hållet
  - en upplysning, inget fel, när ett värde kan nå sin gräns men inget händer där.

### 8. AI-spel

- I ett AI-spel gäller både motorns effekter och AI:ns flyttar inom `maxShift`. Motorns effekter görs först.
- AI:n får alltid de aktuella värdena från `actor.stats`. Kopian i `playerIdentity.stats` som görs när äventyret startar ska följa med när ett värde ändras, så att AI:n aldrig ser gamla siffror.

## Formatförslag till ChatGPT-spåret

Alla fält är valfria. Ett äventyr utan dem fungerar som i dag. Enligt `ownership.sv.md` ska kod som sparar om ett äventyr behålla fält den inte känner till. Guiden behöver inte skriva de nya fälten nu, men den får inte tappa dem.

| Fält | Var | Vem skriver | Vem läser |
| --- | --- | --- | --- |
| Effekten `change-value` | `EffectSchema` | Storyboard, senare guiden och AI-hjälpen | motorn |
| `relation` | `ActorSchema` | när äventyret startar, och motorn | motorn och spelvyn |
| `exceptional`, `severe` | `InteractionSchema` | Storyboard | motorn |
| `requiresValues` | `InteractionSchema`, `descriptions`, `AdventureLinkSchema` | Storyboard | motorn |
| `valueLimits` | `CampaignTemplateSchema` | Storyboard | motorn |
| `play: "fixed" \| "ai"` | `CampaignTemplateSchema` | guiden (`"fixed"`), Storyboard | kontrollen "Spelbart utan AI?", exporten, äventyrets kort |

### `play`: spel utan AI eller AI-spel

Det andra formatförslaget i samma omgång:

- Saknas fältet beter sig äventyret som i dag.
- Guiden sätter `"fixed"` på nya äventyr.
- I Storyboard visas valet i äventyrets inställningar: "Spelas utan AI (rekommenderas)" eller "AI-spel". För `"fixed"` visar kontrollen "Spelbart utan AI?" vad som saknas, och provspelet körs utan AI.
- För `"ai"` visar äventyrets kort "Kräver lokal AI".

Det som gör AI-spel bättre ligger i version 2: krav på modell, ramar för berättaren och reserv när modellen saknas.

## Krav på tester

Motorn:
1. `change-value` ändrar rätt värde, stannar inom regelverkets gränser och påverkar nästa slag.
2. Ett ändrat värde följer med till nästa scen.
3. `relation` fylls från scenens värden när äventyret startar, också när de är skrivna som text.
4. En exceptionell eller allvarlig följd används när den finns, annars lyckad eller misslyckad.
5. `requiresValues` döljer och visar handlingar, kopplingar och beskrivningar på gränsen (exakt 60 för "minst 60").
6. En gräns slår till en gång, sätter sina fakta och avslutar spelet med `ends`.
7. Kontrollerna i Storyboard hittar ett värde som saknas, ett omöjligt villkor och en gräns som inte kan nås.
8. Ett äventyr som sparas om av guiden behåller alla nya fält.
9. Ett äventyr utan de nya fälten spelas exakt som i dag.

Spelvyn:
10. Notiserna följer `display`. Ett dolt värde ger ingen notis, och ett relationsvärde ger ord, aldrig siffror.
11. Dagboken får en rad för varje ändring.

**Provkörning i webbläsaren,** med skärmbilder i ljust och mörkt läge och i ett mörkt speltema:
- Skräck: Nerv, Förstånd −15 vid allvarligt misslyckande, och gränsen "Förstånd högst 0" som leder till en ny scen.
- Romantik: förtroende som växer tills "Fråga Edda om det hon inte berättat" dyker upp.

## Byggordning

1. Formatförslagen granskas av Astra.
2. Motorn: `change-value`, `relation`, de fyra följderna och `requiresValues`, med testerna 1–5, 8 och 9.
3. Gränser (`valueLimits`), med test 6.
4. Spelvyn: notiser, mätaren och dagboken, med testerna 10 och 11.
5. Storyboard: raderna för värden och villkor, avsnittet om gränser och kontrollerna, med test 7.
6. `play: "fixed" | "ai"` och kontrollen "Spelbart utan AI?".

Stanna för provkörning i webbläsaren efter steg 4 och steg 5.

## Inte i det här beslutet

- Värden som ändras över tid, till exempel förstånd som sjunker en punkt i timmen i mörker. Det hör ihop med speltid (`TODO.md`).
- Att resurser (`transfer-resource`) och värden slås ihop. De är olika saker: en resurs kan ges bort, ett värde kan inte det.
- Skrivna samtal, där relationsvärdena gör mest nytta. De får ett eget beslut.
