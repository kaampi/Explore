\# AI Sandbox Engine — Master Specification v2.2



\## 1. Systemöversikt\[cite: 5]



AI Sandbox Engine är en modulär, teknikoberoende sandbox-plattform för interaktiva AI-drivna scenarier\[cite: 5].



Systemet kombinerar:



\- dynamisk kontextmontering\[cite: 5]

\- strukturerat scen- och karaktärstillstånd\[cite: 5]

\- lagerbaserad beteendestyrning\[cite: 5]

\- rullande och semantiskt minne\[cite: 5]

\- kontrollerade AI-genererade state-förslag\[cite: 5]

\- explicit spelarstyrning och manuella overrides\[cite: 5]

\- eventbaserad historik\[cite: 5]

\- lokal persistence\[cite: 5]

\- provideroberoende LLM-integration\[cite: 5]

\- robust fel- och återställningshantering\[cite: 5]

\- diagnostik, snapshots och replay\[cite: 5]



\### Kärnprincip



> \*\*State Engine äger sanningen. AI:n föreslår. Spelaren kan överstyra. Memory beskriver historik. Context Engine avgör vad modellen får se.\*\*\[cite: 5]



Arkitekturen ska optimeras för låg upplevd latens, kontrollerad tokenförbrukning, reproducerbarhet där det är möjligt och hög grad och insyn för spelaren\[cite: 5].



\---



\# 2. Arkitekturprinciper\[cite: 5]



\## 2.1 Separation of Concerns\[cite: 5]



Systemansvaret delas upp enligt följande:



\- \*\*Session Engine\*\* — samordnar sessionens livscykel\[cite: 5].

\- \*\*State Engine\*\* — äger det kanoniska aktuella världstillståndet\[cite: 5].

\- \*\*Context Engine\*\* — bygger och budgeterar den kontext som skickas till LLM\[cite: 5].

\- \*\*Memory Engine\*\* — lagrar, rankar och hämtar historiska minnen\[cite: 5].

\- \*\*Layer Engine\*\* — hanterar aktiva beteende- och regel-lager\[cite: 5].

\- \*\*LLM Adapter\*\* — abstraherar modeller och providers\[cite: 5].

\- \*\*Policy Engine\*\* — validerar regler, mutationer och authority\[cite: 5].

\- \*\*Event Log\*\* — registrerar förändringar och viktiga systemhändelser\[cite: 5].

\- \*\*Persistence Layer\*\* — lagrar session, state, memory och konfiguration\[cite: 5].

\- \*\*Import/Export Engine\*\* — hanterar template- och sessionexport\[cite: 5].

\- \*\*Migration Engine\*\* — migrerar äldre schemas till aktuell intern modell\[cite: 5].

\- \*\*Diagnostics\*\* — mäter latens, tokens, mutationer och fel\[cite: 5].

\- \*\*UI / Inspector\*\* — presenterar systemet och skickar explicita commands\[cite: 5].



\## 2.2 AI:n är inte Source of Truth\[cite: 5]



LLM:n får:



\- tolka spelarens input\[cite: 5]

\- generera dialog\[cite: 5]

\- föreslå state-förändringar\[cite: 5]

\- föreslå minnen\[cite: 5]

\- föreslå layers\[cite: 5]

\- föreslå triggeraktiveringar\[cite: 5]



LLM:n får \*\*inte\*\* direkt mutera den kanoniska state-modellen\[cite: 5].



Alla AI-förslag måste passera:



```text

LLM

&#x20;↓

Structured Proposal

&#x20;↓

Schema Validation

&#x20;↓

Policy Validation

&#x20;↓

Authority / Lock Resolution

&#x20;↓

State Version Check

&#x20;↓

State Engine

&#x20;↓

Committed State

```\[cite: 5]



\---



\# 3. Systemkomponenter\[cite: 5]



```text

┌──────────────────────────────────────────┐

│                  UI / UX                 │

└────────────────────┬─────────────────────┘

&#x20;                    │ Commands / Events

&#x20;                    ↓

┌──────────────────────────────────────────┐

│              Session Engine              │

└───────┬──────────────┬──────────────┬────┘

&#x20;       │              │              │

&#x20;       ↓              ↓              ↓

┌─────────────┐ ┌─────────────┐ ┌─────────────┐

│ State       │ │ Context     │ │ Memory      │

│ Engine      │ │ Engine      │ │ Engine      │

└──────┬──────┘ └──────┬──────┘ └──────┬──────┘

&#x20;      │               │               │

&#x20;      └───────────────┼───────────────┘

&#x20;                      ↓

&#x20;              ┌──────────────┐

&#x20;              │ Policy       │

&#x20;              │ Engine       │

&#x20;              └──────┬───────┘

&#x20;                     ↓

&#x20;              ┌──────────────┐

&#x20;              │ LLM Adapter  │

&#x20;              └──────┬───────┘

&#x20;                     ↓

&#x20;                LLM Provider



Tvärgående komponenter:

\- Event Log

\- Schema Validator

\- Persistence Layer

\- Diagnostics

\- Import/Export Engine

\- Migration Engine

\- Crypto Worker

```\[cite: 5]



\---



\# 4. Two-Pass Execution Pipeline\[cite: 5]



För att separera snabb, naturlig dialog från strukturerad state-utvinning delas varje tur upp i två logiska pass\[cite: 5].



\## 4.1 Pass 1 — Rollspel \& Dialog\[cite: 5]



\*\*Syfte:\*\* generera naturlig dialog med streaming till UI\[cite: 5].



Typiska inställningar:



\- temperatur: cirka `0.7–0.8`\[cite: 5]

\- streaming: aktiverad\[cite: 5]

\- normal kreativitet\[cite: 5]

\- ingen direkt state-mutation\[cite: 5]



Pass 1 ska prioritera upplevd responsivitet\[cite: 5].



TTFT mäts från användarens submit till första renderade token\[cite: 5].



\## 4.2 Pass 2 — Asynkron State-utvinning\[cite: 5]



\*\*Syfte:\*\* analysera den avslutade eller godkänt avbrutna turen och skapa strukturerade förslag för:\[cite: 5]



\- emotionella förändringar\[cite: 5]

\- nya fakta\[cite: 5]

\- positionsförändringar\[cite: 5]

\- relationsförändringar\[cite: 5]

\- triggeraktiveringar\[cite: 5]

\- relevanta minnen\[cite: 5]



Typiska inställningar:



\- låg temperatur, exempelvis `0.0`\[cite: 5]

\- Structured Output / JSON Schema när provider stödjer det\[cite: 5]

\- GBNF/grammar där runtime stödjer det\[cite: 5]



Pass 2 är en \*\*proposal-generator\*\*, inte en state-writer\[cite: 5].



\### 4.3 KV-cache\[cite: 5]



KV-cache ska betraktas som en \*\*optimering\*\*, inte som ett arkitekturkrav\[cite: 5].



Om provider/runtime stödjer återanvändning av prompt-prefix eller KV-cache får Context Engine strukturera prompten för maximal cache-träff:\[cite: 5]



```text

\[Static Rules]

\[Character Core]

\[Scene Base]

\[Active Layers]

\[Relevant Memory]

\[Recent History]

\[Current Input]

```\[cite: 5]



Systemet får aldrig anta att KV-cache:\[cite: 5]



\- finns\[cite: 5]

\- överlever mellan requests\[cite: 5]

\- överlever mellan sessions\[cite: 5]

\- är identisk mellan providers\[cite: 5]

\- kan återanvändas efter godtyckliga promptändringar\[cite: 5]



Om cache inte kan återanvändas ska systemet fortfarande fungera korrekt\[cite: 5].



\---



\# 5. State Engine\[cite: 5]



State Engine är den auktoritativa källan för vad som är sant i den aktuella scenen\[cite: 5].



\## 5.1 State-kategorier\[cite: 5]



\### World State\[cite: 5]



```yaml

world:

&#x20; location: "Baren"

&#x20; environment:

&#x20;   lighting: "dim"

&#x20;   noise: "high"

&#x20;   music: true

```\[cite: 5]



\### Character State\[cite: 5]



```yaml

characters:

&#x20; emma:

&#x20;   position: "table"

&#x20;   pose: "sitting"

&#x20;   mood: "reserved"

&#x20;   energy: 60

```\[cite: 5]



\### Relationship State\[cite: 5]



```yaml

relationships:

&#x20; emma\_player:

&#x20;   trust: 72

&#x20;   familiarity: 35

&#x20;   tension: 20

```\[cite: 5]



\### Session State\[cite: 5]



```yaml

session:

&#x20; turn: 184

&#x20; started\_at: "2026-08-28T21:00:00Z"

&#x20; current\_time: "22:14"

```\[cite: 5]



\---



\# 6. State Authority \& Conflict Resolution\[cite: 5]



När flera källor försöker påverka samma state gäller följande auktoritetsordning:\[cite: 5]



```text

1\. Immutable system constraints

2\. Player-locked state

3\. Player manual state

4\. Explicit scenario rules

5\. Active layer effects

6\. AI-approved state mutations

7\. AI inference

8\. Historical memory

```\[cite: 5]



Detta är en prioriteringsmodell för konflikter och ska implementeras i Policy/State Engine\[cite: 5].



\### Memory är inte current state\[cite: 5]



Exempel:\[cite: 5]



```text

Memory:

"Emma var arg tidigare."



Current State:

Emma.mood = calm

```\[cite: 5]



Detta är inte en konflikt. Memory beskriver historik; State beskriver aktuell verklighet\[cite: 5].



\---



\# 7. Variable Locking\[cite: 5]



Varje muterbart state-fält kan ha:\[cite: 5]



\- `unlocked`\[cite: 5]

\- `player\_locked`\[cite: 5]

\- `system\_locked`\[cite: 5]



Exempel:\[cite: 5]



```yaml

characters:

&#x20; emma:

&#x20;   mood:

&#x20;     value: "angry"

&#x20;     lock: "player\_locked"

```\[cite: 5]



\### Regler\[cite: 5]



\- `system\_locked` kan endast ändras av systemets explicita kontrollflöden\[cite: 5].

\- `player\_locked` får inte ändras av AI-förslag\[cite: 5].

\- `unlocked` kan ändras efter schema- och policyvalidering\[cite: 5].

\- Avvisade mutationer registreras i Event Log\[cite: 5].

\- UI ska tydligt visa varför en mutation blockerades\[cite: 5].



\---



\# 8. State Mutation Contract\[cite: 5]



AI:n får endast föreslå state-förändringar via ett strukturerat kontrakt\[cite: 5].



Exempel:\[cite: 5]



```json

{

&#x20; "schema\_version": 1,

&#x20; "based\_on\_state\_version": 184,

&#x20; "mutations": \[

&#x20;   {

&#x20;     "target": "characters.emma.mood",

&#x20;     "from": "calm",

&#x20;     "to": "angry",

&#x20;     "reason": "Emma reagerar på spelarens kommentar",

&#x20;     "confidence": 0.91

&#x20;   }

&#x20; ]

}

```\[cite: 5]



\## 8.1 Valideringspipeline\[cite: 5]



Varje mutation går genom:\[cite: 5]



```text

1\. Parse / Structured Output Validation

2\. Schema Validation

3\. Target Validation

4\. Type Validation

5\. Range / Constraint Validation

6\. Authority Validation

7\. Lock Validation

8\. State Version / Conflict Check

9\. Commit

```\[cite: 5]



Syntaktiskt giltig JSON är alltså \*\*inte\*\* samma sak som en giltig mutation\[cite: 5].



En mutation kan vara JSON-valid men ändå avvisas på grund av exempelvis:\[cite: 5]



\- okänd target\[cite: 5]

\- fel datatyp\[cite: 5]

\- ogiltigt värde\[cite: 5]

\- player lock\[cite: 5]

\- system lock\[cite: 5]

\- state-versionkonflikt\[cite: 5]

\- policyregel\[cite: 5]



\---



\# 9. Event Log\[cite: 5]



Alla betydande state-förändringar och systemhändelser registreras som events\[cite: 5].



Exempel:\[cite: 5]



```yaml

event:

&#x20; id: "evt\_1842"

&#x20; timestamp: "2026-08-28T22:14:21Z"

&#x20; turn: 184

&#x20; type: "STATE\_CHANGE"

&#x20; source: "player"

&#x20; target: "characters.emma.mood"

&#x20; previous: "calm"

&#x20; next: "angry"

&#x20; reason: "Manual override"

```\[cite: 5]



Event Log används för:\[cite: 5]



\- debugging\[cite: 5]

\- undo\[cite: 5]

\- replay\[cite: 5]

\- audit\[cite: 5]

\- session-inspektion\[cite: 5]

\- state reconstruction\[cite: 5]

\- diagnostik\[cite: 5]

\- förklaring av AI-beteende\[cite: 5]



Varje committed state-mutation ska kunna spåras till minst ett event\[cite: 5].



\---



\# 10. Context Engine\[cite: 5]



Context Engine bygger den kontext som skickas till LLM:n\[cite: 5].



Den ska aldrig skicka hela sessionen per automatik\[cite: 5].



Grundstruktur:\[cite: 5]



```text

\[System Invariants]

\[Character Core]

\[Current Scene State]

\[Active Layers]

\[Relevant Memory]

\[Recent Conversation]

\[Current User Input]

```\[cite: 5]



\## 10.1 Statisk → dynamisk promptordning\[cite: 5]



Prompten ska, när det är praktiskt möjligt, ordnas från mest statisk till mest dynamisk information:\[cite: 5]



```text

\[System Invariants \& Rules]

\[Character Core Definitions]

\[Scene Base \& Environment]

\[Active Layers]

\[Relevant Memory]

\[Recent Conversation History]

\[Current User Input]

```\[cite: 5]



Detta optimerar möjlig prefix-/KV-cache\[cite: 5].



Cacheoptimering får dock aldrig förändra semantiken eller authority-modellen\[cite: 5].



\---



\# 11. Context Budget Manager\[cite: 5]



Systemet har en explicit contextbudget\[cite: 5].



\### Target\[cite: 5]



\*\*≤ 3 500 tokens\*\* för system/context-delen\[cite: 5].



\### Hard Ceiling\[cite: 5]



\*\*≤ 8 000 tokens\*\*\[cite: 5].



Hard ceiling får aldrig överskridas av Context Engine\[cite: 5].



Exempelbudget:\[cite: 5]



```text

System Rules             300

Character Core           500

Scene State              400

Active Layers            800

Relevant Memory          600

Recent History          900

────────────────────────────

Target                  3500

```\[cite: 5]



Vid överskriden target-budget prioriteras:\[cite: 5]



```text

1\. System constraints

2\. Player-locked state

3\. Current Scene State

4\. Character Core

5\. High-priority Active Layers

6\. Relevant Memory

7\. Recent Conversation

```\[cite: 5]



Lågprioriterat innehåll får komprimeras eller tas bort\[cite: 5].



Obligatoriskt state får inte tas bort enbart för att nå target-budget\[cite: 5].



\---



\# 12. Layer Engine\[cite: 5]



Layers är modulära instruktioner och beteenderegler som kan aktiveras dynamiskt\[cite: 5].



\## 12.1 Layer-typer\[cite: 5]



\### Core Layer\[cite: 5]



\- namn\[cite: 5]

\- utseende\[cite: 5]

\- röst\[cite: 5]

\- personlighet\[cite: 5]

\- grundbeteende\[cite: 5]



\### Relationship Layer\[cite: 5]



Exempel:\[cite: 5]



\- Främling\[cite: 5]

\- Vän\[cite: 5]

\- Partner\[cite: 5]

\- Rival\[cite: 5]



\### Environment Layer\[cite: 5]



Exempel:\[cite: 5]



\- Högljudd krog\[cite: 5]

\- Formellt kontor\[cite: 5]

\- Mörkt rum\[cite: 5]



\### State / Trigger Layer\[cite: 5]



Exempel:\[cite: 5]



\- Svartsjuk\[cite: 5]

\- Stressad\[cite: 5]

\- Rädd\[cite: 5]

\- Berusad\[cite: 5]



\---



\# 13. Layer Schema\[cite: 5]



```yaml

layer:

&#x20; id: "jealous\_v1"

&#x20; name: "Svartsjuk"

&#x20; enabled: true

&#x20; priority: 70

&#x20; source: "generated"

&#x20; instructions:

&#x20;   - "Emma visar subtil svartsjuka."

&#x20; activation:

&#x20;   type: "manual"

&#x20; metadata:

&#x20;   created\_at: "2026-08-28T21:00:00Z"

```\[cite: 5]



`priority` används för att lösa konflikter mellan aktiva layers\[cite: 5].



Layers får inte kringgå player/system locks\[cite: 5].



\---



\# 14. Layer Activation\[cite: 5]



Layers kan aktiveras genom:\[cite: 5]



\### Manuell aktivering\[cite: 5]



Spelaren slår på/av lagret\[cite: 5].



\### Regelbaserad aktivering\[cite: 5]



Exempel:\[cite: 5]



```text

trust < 30

location == "bar"

```\[cite: 5]



\### Eventbaserad aktivering\[cite: 5]



Exempel:\[cite: 5]



```text

player\_mentions("ex")

```\[cite: 5]



\### AI-genererad aktivering\[cite: 5]



AI:n kan föreslå att ett befintligt layer bör aktiveras, men den faktiska aktiveringen går genom Policy/State Engine\[cite: 5].



\---



\# 15. AI-genererade Layers\[cite: 5]



AI-genererade layers får aldrig injiceras direkt som rå systemprompt\[cite: 5].



Pipeline:\[cite: 5]



```text

Player Request

&#x20;↓

Layer Generator

&#x20;↓

Structured Layer

&#x20;↓

Schema Validation

&#x20;↓

Policy Validation

&#x20;↓

Preview

&#x20;↓

Player Approval / Activation

```\[cite: 5]



Ett genererat layer ska kunna:\[cite: 5]



\- redigeras\[cite: 5]

\- förhandsgranskas\[cite: 5]

\- prioriteras\[cite: 5]

\- avaktiveras\[cite: 5]

\- dupliceras\[cite: 5]

\- raderas\[cite: 5]



innan eller efter aktivering\[cite: 5].



\---



\# 16. Memory Architecture\[cite: 5]



Memory och Current State är separata system\[cite: 5].



Memory representerar vad som har hänt, observerats eller fastställts tidigare\[cite: 5].



\## 16.1 Memory-typer\[cite: 5]



\### Episodiskt minne\[cite: 5]



Vad som hände\[cite: 5].



```text

"Emma och spelaren gick tillsammans till baren."

```\[cite: 5]



\### Semantiskt minne\[cite: 5]



Stabila fakta\[cite: 5].



```text

"Spelaren föredrar te framför kaffe."

```\[cite: 5]



\### Relationellt minne\[cite: 5]



Historiska relationella observationer\[cite: 5].



```text

"Emma litade mer på spelaren efter samtalet."

```\[cite: 5]



\---



\# 17. Structured Memory\[cite: 5]



Minnen lagras som strukturerade objekt\[cite: 5].



```yaml

memory:

&#x20; id: "mem\_123"

&#x20; type: "semantic"

&#x20; subject: "player"

&#x20; predicate: "preferred\_drink"

&#x20; value: "tea"

&#x20; importance: 0.9

&#x20; confidence: 0.97

&#x20; source: "player"

&#x20; created\_at: "2026-08-28T21:00:00Z"

&#x20; updated\_at: "2026-08-28T21:00:00Z"

&#x20; last\_accessed: null

&#x20; tags:

&#x20;   - "preference"

```\[cite: 5]



Memory metadata bör stödja:\[cite: 5]



\- importance\[cite: 5]

\- confidence\[cite: 5]

\- source\[cite: 5]

\- timestamps\[cite: 5]

\- last\_accessed\[cite: 5]

\- decay\[cite: 5]

\- tags\[cite: 5]

\- subject\[cite: 5]

\- related entities\[cite: 5]



\---



\# 18. Memory Retrieval\[cite: 5]



Alla minnen skickas inte till modellen\[cite: 5].



Memory Engine väljer relevanta minnen baserat på:\[cite: 5]



\- aktuell scen\[cite: 5]

\- aktiva karaktärer\[cite: 5]

\- spelarens input\[cite: 5]

\- semantisk relevans\[cite: 5]

\- importance\[cite: 5]

\- recency\[cite: 5]

\- relation till current state\[cite: 5]

\- eventuell decay\[cite: 5]



Pipeline:\[cite: 5]



```text

Full Memory Store

&#x20;↓

Retrieval

&#x20;↓

Ranking

&#x20;↓

Context Budget

&#x20;↓

Relevant Memory

&#x20;↓

LLM

```\[cite: 5]



\---



\# 19. Rolling Conversation Memory\[cite: 5]



När aktiv konversationshistorik överskrider definierad budget kondenseras äldre dialog asynkront\[cite: 5].



Sammanfattningen ska vara strukturerad\[cite: 5].



Exempel:\[cite: 5]



```yaml

summary:

&#x20; events:

&#x20;   - "Emma och spelaren diskuterade relationen."

&#x20; facts:

&#x20;   - "Spelaren vill inte bli kallad Johan."

&#x20; unresolved:

&#x20;   - "Emma väntar fortfarande på ett svar."

```\[cite: 5]



\### Insikter\[cite: 5]



\*\*Insikter är ett UI-/presentationsbegrepp, inte en separat auktoritativ statekälla.\*\*\[cite: 5]



Underliggande information ska lagras som strukturerade memory objects\[cite: 5].



En sammanfattning får ersätta eller komprimera tidigare summary-data\[cite: 5]. Den ska inte växa obegränsat genom att varje ny sammanfattning bara läggs ovanpå föregående\[cite: 5].



\---



\# 20. Scene State Engine\[cite: 5]



Scene State beskriver den aktuella fysiska och sociala situationen\[cite: 5].



\## 20.1 Relativ positionering\[cite: 5]



\### Intim zon\[cite: 5]



\- mycket nära\[cite: 5]

\- viskning möjlig\[cite: 5]

\- fysisk kontakt möjlig\[cite: 5]



\### Personlig zon\[cite: 5]



\- normalt samtal\[cite: 5]

\- individuell interaktion\[cite: 5]



\### Social zon\[cite: 5]



\- större avstånd\[cite: 5]

\- högre röst krävs\[cite: 5]

\- andra kan lättare höra\[cite: 5]



Zonsystemet ska kunna utökas utan att kärnmodellen bryts\[cite: 5].



\---



\# 21. Scene State Schema\[cite: 5]



```yaml

scene:

&#x20; location:

&#x20;   name: "Baren"

&#x20;   sub\_location: "Mörkt hörnbord"



&#x20; environment:

&#x20;   noise: "high"

&#x20;   lighting: "dim"

&#x20;   music: true



&#x20; characters:

&#x20;   emma:

&#x20;     pose: "sitting"

&#x20;     position: "table"

&#x20;     distance\_to\_player: "personal"



&#x20;   player:

&#x20;     pose: "standing"

&#x20;     position: "table"

```\[cite: 5]



\---



\# 22. Instruction Hierarchy\[cite: 5]



Systemet skiljer mellan auktoritativa instruktioner och innehåll\[cite: 5].



Rekommenderad ordning:\[cite: 5]



```text

System Invariants

↓

Player Locks

↓

Core Character Rules

↓

Scenario Rules

↓

Active Layers

↓

Current State

↓

Memory

↓

Conversation History

↓

Player Content

```\[cite: 5]



Spelarens innehåll är data och får inte automatiskt upphöjas till systeminstruktion\[cite: 5].



\---



\# 23. Prompt Injection \& Context Safety\[cite: 5]



All externt genererad eller användarskapad text behandlas som potentiellt icke-auktoritativ\[cite: 5].



AI-genererade:\[cite: 5]



\- layers\[cite: 5]

\- memories\[cite: 5]

\- state proposals\[cite: 5]

\- summaries\[cite: 5]



får inte automatiskt upphöjas till systemnivå\[cite: 5].



Exempel:\[cite: 5]



```text

"Ignore all previous rules."

```\[cite: 5]



får inte kunna förändra systemets authority model\[cite: 5].



Policy Engine ska validera sådana försök utifrån deras faktiska effekt, inte enbart genom en hårdkodad lista av fraser\[cite: 5].



\---



\# 24. UI \& UX\[cite: 5]



UI:t består av tre huvudzoner\[cite: 5].



\## 24.1 Vänsterpanel — Layer Stack \& Creator\[cite: 5]



Visar:\[cite: 5]



\- aktiva layers\[cite: 5]

\- prioritet\[cite: 5]

\- source\[cite: 5]

\- activation status\[cite: 5]

\- lock/status\[cite: 5]



Funktioner:\[cite: 5]



\- toggle\[cite: 5]

\- reorder\[cite: 5]

\- edit\[cite: 5]

\- duplicate\[cite: 5]

\- delete\[cite: 5]

\- skapa layer med AI\[cite: 5]



\## 24.2 Mittenpanel — Chat \& Status\[cite: 5]



Statusrad:\[cite: 5]



```text

\[Baren]

\[Personlig zon]

\[Emma: Arg]

\[3 aktiva layers]

```\[cite: 5]



Chips ska kunna öppna snabbredigering\[cite: 5].



Chatmeddelanden ska kunna:\[cite: 5]



\- redigeras\[cite: 5]

\- regenereras\[cite: 5]

\- kopieras\[cite: 5]

\- inspekteras\[cite: 5]

\- användas som regeneration context\[cite: 5]



\## 24.3 Högerpanel — Inspector\[cite: 5]



Visar kanoniskt state med:\[cite: 5]



\- current value\[cite: 5]

\- source\[cite: 5]

\- lock status\[cite: 5]

\- last mutation\[cite: 5]

\- timestamp\[cite: 5]

\- event reference\[cite: 5]

\- state version\[cite: 5]



\---



\# 25. Inspector Mode\[cite: 5]



Inspector ska göra det möjligt att svara på:\[cite: 5]



> "Varför är detta state-värde sådant?"\[cite: 5]



Genom att navigera:\[cite: 5]



```text

Current State

&#x20;↓

Last Mutation

&#x20;↓

Validation Result

&#x20;↓

Event

&#x20;↓

Turn / Proposal

&#x20;↓

LLM Output

```\[cite: 5]



Avvisade mutationer ska också vara synliga\[cite: 5].



\---



\# 26. Inline Editing \& Regeneration\[cite: 5]



Spelaren kan redigera AI-genererad dialog utan att det automatiskt ändrar world state\[cite: 5].



Det ska vara möjligt att skilja mellan:\[cite: 5]



```text

Edited Dialogue

```\[cite: 5]



och:\[cite: 5]



```text

State Mutation

```\[cite: 5]



\### Regeneration\[cite: 5]



Exempel:\[cite: 5]



```text

"Gör om svaret, men kom ihåg att dörren är låst."

```\[cite: 5]



Regeneration ska som standard använda samma state snapshot och relevant context som den ursprungliga generationen\[cite: 5].



En regeneration är en ny generation och får ett eget event/diagnostic record\[cite: 5].



\---



\# 27. Web Worker \& Async Offloading\[cite: 5]



Kryptografiskt tunga operationer ska inte blockera UI-tråden\[cite: 5].



Exempel:\[cite: 5]



```text

Main UI Thread

&#x20;     │

&#x20;     │ postMessage()

&#x20;     ↓

crypto.worker.js

&#x20;     │

&#x20;     ├── KDF

&#x20;     └── AES-256-GCM

&#x20;     │

&#x20;     ↓

Main UI Thread

```\[cite: 5]



Även andra CPU-tunga lokala operationer kan flyttas till workers när det är motiverat\[cite: 5].



\---



\# 28. Turn Lifecycle\[cite: 5]



En komplett tur:\[cite: 5]



```text

1\.  Player Input

2\.  Input Registration

3\.  State Snapshot

4\.  Memory Retrieval

5\.  Layer Resolution

6\.  Context Assembly

7\.  Token Budget Check

8\.  Pass 1 — LLM Stream

9\.  Response Finalization

10\. Pass 2 — Async State Extraction

11\. Structured Proposal

12\. Schema Validation

13\. Policy Validation

14\. Authority / Lock Check

15\. State Version Check

16\. State Commit

17\. Event Log

18\. Memory Update

19\. Persistence

20\. Diagnostics

```\[cite: 5]



Memory Retrieval och Layer Resolution kan köras parallellt om deras inputs är stabila\[cite: 5].



\---



\# 29. State Snapshots\[cite: 5]



Inför varje LLM-turn skapas en immutable snapshot\[cite: 5].



```yaml

snapshot:

&#x20; turn: 184

&#x20; state\_version: 184

&#x20; state\_hash: "a8f3b..."

&#x20; context\_hash: "c912e..."

&#x20; timestamp: "2026-08-28T22:14:21Z"

```\[cite: 5]



Snapshot används för:\[cite: 5]



\- regeneration\[cite: 5]

\- debugging\[cite: 5]

\- replay\[cite: 5]

\- undo\[cite: 5]

\- reproducibility\[cite: 5]

\- concurrency control\[cite: 5]



\---



\# 30. Pass 2 — Snapshot \& Version Semantics\[cite: 5]



Pass 2 måste explicit ange vilken state-version och turn den analyserar\[cite: 5].



Exempel:\[cite: 5]



```text

Pass 1

&#x20; ↓

snapshot state\_version = 184

&#x20; ↓

dialog generated

&#x20; ↓

Pass 2 proposal:

based\_on\_state\_version = 184

```\[cite: 5]



Om aktuell state senare är:\[cite: 5]



```text

state\_version = 187

```\[cite: 5]



får proposal från version 184 inte appliceras blint\[cite: 5].



State Engine måste:\[cite: 5]



1\. kontrollera versionsskillnaden\[cite: 5]

2\. identifiera eventuella konflikter\[cite: 5]

3\. avvisa eller rebase:a mutationen enligt definierad policy\[cite: 5]



\---



\# 31. Undo \& Replay\[cite: 5]



Eftersom förändringar är eventbaserade kan systemet:\[cite: 5]



\- ångra senaste mutation\[cite: 5]

\- ångra en hel tur\[cite: 5]

\- återställa en snapshot\[cite: 5]

\- spela upp events\[cite: 5]

\- jämföra snapshots\[cite: 5]

\- rekonstruera state\[cite: 5]



Undo ska inte radera historik\[cite: 5].



Istället skapas en ny korrigerande event-kedja\[cite: 5].



\---



\# 32. LLM Provider Abstraction\[cite: 5]



LLM Adapter ska vara provideroberoende\[cite: 5].



Adapterlagret ska abstrahera:\[cite: 5]



\- streaming\[cite: 5]

\- structured output\[cite: 5]

\- JSON Schema\[cite: 5]

\- grammar/GBNF capability\[cite: 5]

\- function calling\[cite: 5]

\- token usage\[cite: 5]

\- model metadata\[cite: 5]

\- temperature\[cite: 5]

\- seed\[cite: 5]

\- timeout\[cite: 5]

\- cancellation\[cite: 5]

\- error codes\[cite: 5]

\- context limits\[cite: 5]

\- cache capabilities\[cite: 5]



Provider capabilities ska upptäckas eller konfigureras explicit\[cite: 5].



Exempel:\[cite: 5]



```yaml

provider\_capabilities:

&#x20; streaming: true

&#x20; structured\_output: true

&#x20; grammar: true

&#x20; kv\_cache\_reuse: false

&#x20; cancellation: true

```\[cite: 5]



Arkitekturen får inte förutsätta att alla providers stöder samma funktioner\[cite: 5].



\---



\# 33. Fallback Models\[cite: 5]



Fallback kan användas vid definierade tekniska fel:\[cite: 5]



\- timeout\[cite: 5]

\- provider offline\[cite: 5]

\- resource exhaustion\[cite: 5]

\- VRAM exhaustion\[cite: 5]



Exempel:\[cite: 5]



```text

Primary: 14B

Fallback: 8B

```\[cite: 5]



Fallback ska inte automatiskt användas för semantiska problem\[cite: 5].



Fallback ska registreras i diagnostics och event metadata\[cite: 5].



\---



\# 34. Felhantering \& Retries\[cite: 5]



Nätverksanrop använder exponential backoff\[cite: 5].



Exempel:\[cite: 5]



```text

Attempt 1 → immediate

Attempt 2 → 250 ms

Attempt 3 → 750 ms

```\[cite: 5]



Retry policy ska vara konfigurerbar\[cite: 5].



Retries ska endast användas för retryable errors\[cite: 5].



Idempotens måste beaktas så att samma state-mutation inte råkar commit:as flera gånger\[cite: 5].



\---



\# 35. Structured Output Recovery\[cite: 5]



Primär strategi:\[cite: 5]



```text

Structured Output / JSON Schema / Grammar

&#x20;       ↓

Schema Validation

```\[cite: 5]



Om structured output misslyckas:\[cite: 5]



```text

Tolerant Extraction / Recovery

&#x20;       ↓

Schema Validation

```\[cite: 5]



Regex får endast användas som sista recovery-nivå\[cite: 5].



Exempel på fallback:\[cite: 5]



```regex

/\\{\[\\s\\S]\*\\}/

```\[cite: 5]



Resultatet får aldrig betraktas som giltigt enbart för att det ser ut som JSON\[cite: 5].



Slutlig pipeline:\[cite: 5]



```text

Parse

&#x20;↓

Schema Validation

&#x20;↓

Policy Validation

```\[cite: 5]



Om detta misslyckas:\[cite: 5]



```text

Discard Proposal

&#x20;↓

Diagnostic Event

&#x20;↓

Continue Session

```\[cite: 5]



Fel i Pass 2 får inte krascha chattgränssnittet\[cite: 5].



\---



\# 36. Diagnostics \& Observability\[cite: 5]



Systemet samlar diagnostik per tur\[cite: 5].



Exempel:\[cite: 5]



```yaml

diagnostics:

&#x20; turn: 184

&#x20; model: "..."

&#x20; model\_version: "..."

&#x20; ttft\_ms: 1210

&#x20; total\_latency\_ms: 4380

&#x20; input\_tokens: 3120

&#x20; output\_tokens: 486

&#x20; context\_tokens: 3482

&#x20; memory\_items: 4

&#x20; active\_layers: 7

&#x20; state\_mutations\_proposed: 3

&#x20; state\_mutations\_accepted: 2

&#x20; state\_mutations\_rejected: 1

&#x20; fallback\_used: false

&#x20; cache\_reused: false

```\[cite: 5]



Diagnostics ska göra det möjligt att skilja på:\[cite: 5]



\- client latency\[cite: 5]

\- context assembly latency\[cite: 5]

\- network latency\[cite: 5]

\- provider queue latency\[cite: 5]

\- model TTFT\[cite: 5]

\- generation time\[cite: 5]

\- Pass 2 latency\[cite: 5]



\---



\# 37. Performance Targets \& SLA\[cite: 5]



| Metric | Target | Hard Ceiling | Kommentar |

|---|---:|---:|---|

| TTFT Pass 1 | ≤ 1,5 s | 3,0 s | Strömmande dialog |

| Pass 2 extraction | ≤ 0,8 s | 2,0 s | Asynkront |

| Memory summarizer | ≤ 4,0 s | 8,0 s | Background job |

| Pipeline prep | ≤ 10 ms | 30 ms | Lokal in-memory prep |

| Crypto export | ≤ 300 ms | 1 000 ms | Worker |

| Context target | ≤ 3 500 tokens | 8 000 tokens | Context Engine ceiling |\[cite: 5]



\### Viktig begränsning\[cite: 5]



TTFT och Pass 2-latens är delvis beroende av LLM-provider, modell, hårdvara och nätverk\[cite: 5].



Mätningar ska därför logga både total latens och delkomponenter\[cite: 5].



\---



\# 38. Client Performance\[cite: 5]



Kryptering, nyckelderivering och andra tunga beräkningar får inte blockera UI\[cite: 5].



Långa operationer ska köras i Web Worker eller motsvarande background execution\[cite: 5].



\---



\# 39. Persistence\[cite: 5]



\*\*IndexedDB är primär persistence för sessionsdata.\*\*\[cite: 5]



LocalStorage används endast för små metadata- och inställningsobjekt\[cite: 5].



IndexedDB bör innehålla exempelvis:\[cite: 5]



\- sessions\[cite: 5]

\- characters\[cite: 5]

\- layers\[cite: 5]

\- current state\[cite: 5]

\- memory\[cite: 5]

\- conversation\[cite: 5]

\- events\[cite: 5]

\- diagnostics\[cite: 5]

\- provider settings metadata\[cite: 5]

\- export metadata\[cite: 5]



Persistence ska stödja atomiska skrivoperationer där flera relaterade objekt måste hållas konsistenta\[cite: 5].



\---



\# 40. Privacy Model\[cite: 5]



Systemet ska dokumentera exakt vilken information som lämnar klienten\[cite: 5].



För varje provider ska det framgå, när informationen är känd:\[cite: 5]



```yaml

provider:

&#x20; transport: "local"

&#x20; stores\_requests: false

&#x20; stores\_outputs: false

&#x20; training\_usage: false

&#x20; retention: "none"

```\[cite: 5]



Okända eller ej verifierbara egenskaper får inte presenteras som garantier\[cite: 5].



\### Lokal LLM\[cite: 5]



Vid användning av en verkligt lokal provider kan prompts och sessiondata hållas lokalt, \*\*förutsatt att runtime/provider inte själv skickar data externt\*\*\[cite: 5].



Exempel på lokal provider är Ollama\[cite: 5].



\---



\# 41. Encryption \& Secure Export\[cite: 5]



PIN-/lösenordsskyddad export ska använda:\[cite: 5]



\- slumpmässigt salt\[cite: 5]

\- slumpmässig nonce/IV\[cite: 5]

\- autentiserad kryptering\[cite: 5]

\- versionsnumrerat format\[cite: 5]

\- explicit KDF-parametrar\[cite: 5]



\### KDF\[cite: 5]



Föredragen:\[cite: 5]



```text

Argon2id

```\[cite: 5]



Fallback:\[cite: 5]



```text

PBKDF2-HMAC-SHA-256

```\[cite: 5]



KDF-parametrar ska benchmarkas på målplattformen\[cite: 5].



\### Cipher\[cite: 5]



```text

AES-256-GCM

```\[cite: 5]



Exempel:\[cite: 5]



```json

{

&#x20; "version": 2,

&#x20; "encrypted": true,

&#x20; "kdf": {

&#x20;   "algorithm": "PBKDF2",

&#x20;   "hash": "SHA-256",

&#x20;   "iterations": 310000,

&#x20;   "salt": "Base64..."

&#x20; },

&#x20; "cipher": {

&#x20;   "algorithm": "AES-256-GCM",

&#x20;   "iv": "Base64..."

&#x20; },

&#x20; "ciphertext": "Base64..."

}

```\[cite: 5]



KDF-parametrar ska kunna uppdateras genom formatversionering\[cite: 5].



\---



\# 42. Export\[cite: 5]



\## 42.1 Template Export\[cite: 5]



Innehåller:\[cite: 5]



\- character definitions\[cite: 5]

\- core layers\[cite: 5]

\- optional layers\[cite: 5]

\- scene template\[cite: 5]

\- environment definitions\[cite: 5]

\- state schema/defaults\[cite: 5]



Ingen personlig sessionhistorik ska inkluderas\[cite: 5].



\## 42.2 Session Export\[cite: 5]



Innehåller:\[cite: 5]



\- template\[cite: 5]

\- current state\[cite: 5]

\- memory\[cite: 5]

\- conversation\[cite: 5]

\- event log\[cite: 5]

\- diagnostics\[cite: 5]

\- runtime metadata\[cite: 5]



Användaren ska kunna välja om diagnostics och rå historik ska inkluderas\[cite: 5].



\---



\# 43. Schema Versioning \& Migration\[cite: 5]



Alla persistenta datastrukturer ska vara versionsnumrerade\[cite: 5].



Exempel:\[cite: 5]



```json

{

&#x20; "schema\_version": 2,

&#x20; "application\_version": "..."

}

```\[cite: 5]



Import:\[cite: 5]



```text

Import

&#x20;↓

Version Detection

&#x20;↓

Migration

&#x20;↓

Schema Validation

&#x20;↓

Current Internal Model

```\[cite: 5]



Migrationer ska vara:\[cite: 5]



\- deterministiska\[cite: 5]

\- testbara\[cite: 5]

\- versionsspecifika\[cite: 5]

\- bakåtkompatibla där det är möjligt\[cite: 5]



\---



\# 44. Reproducibility\[cite: 5]



Sessionmetadata bör innehålla:\[cite: 5]



```yaml

runtime:

&#x20; model: "..."

&#x20; model\_version: "..."

&#x20; temperature: 0.7

&#x20; seed: null

&#x20; system\_prompt\_hash: "..."

&#x20; context\_hash: "..."

```\[cite: 5]



Full determinism kan inte garanteras för alla modeller/providers\[cite: 5].



Målet är istället att kunna förklara och reproducera så mycket av körningen som möjligt\[cite: 5].



\---



\# 45. Atomic State Commit\[cite: 5]



Mutationer från en turn valideras individuellt som standard\[cite: 5].



Exempel:\[cite: 5]



```text

A ✓

B ✓

C ✗

D ✓

E ✓

```\[cite: 5]



Giltiga oberoende mutationer kan commit:as\[cite: 5].



För beroende mutationer ska systemet kunna använda transactional batching:\[cite: 5]



```text

A + B + C

&#x20;    ↓

all accepted

eller

all rejected

```\[cite: 5]



En turn får aldrig lämna State Engine i ett delvis uppdaterat internt objekt\[cite: 5].



\---



\# 46. Cancellation\[cite: 5]



Användaren ska kunna avbryta en pågående generation\[cite: 5].



Vid cancellation:\[cite: 5]



\- streaming stoppas\[cite: 5]

\- ofullständigt svar markeras som `incomplete`\[cite: 5]

\- automatiska state-mutationer från den avbrutna generationen commit:as inte\[cite: 5]

\- cancellation registreras i Event Log/Diagnostics\[cite: 5]



Om en tidigare färdig del av turen måste bevaras ska den behandlas explicit som partial output, inte som en komplett turn\[cite: 5].



\---



\# 47. Concurrency \& Race Condition Prevention\[cite: 5]



Varje state snapshot har ett versionsnummer:\[cite: 5]



```yaml

state\_version: 184

```\[cite: 5]



Mutationer baserade på version 184 får inte appliceras blint på version 187\[cite: 5].



Exempel:\[cite: 5]



```text

Turn A snapshot → version 184

Background Pass 2 → proposal based on 184



Player action → state version 185

Another action → state version 186

Background action → state version 187



Proposal based on 184

&#x20;       ↓

Conflict Check

&#x20;       ↓

Reject / Rebase according to policy

```\[cite: 5]



Detta skyddar mot race conditions mellan:\[cite: 5]



\- användarinput\[cite: 5]

\- Pass 2\[cite: 5]

\- memory workers\[cite: 5]

\- summarizers\[cite: 5]

\- regeneration\[cite: 5]

\- persistence\[cite: 5]



\---



\# 48. Session State Machine\[cite: 5]



```text

IDLE

&#x20;↓

INPUT\_RECEIVED

&#x20;↓

CONTEXT\_BUILDING

&#x20;↓

GENERATING

&#x20;↓

STREAMING

&#x20;↓

RESPONSE\_FINALIZED

&#x20;↓

STATE\_ANALYSIS

&#x20;↓

STATE\_COMMIT

&#x20;↓

MEMORY\_UPDATE

&#x20;↓

PERSISTED

&#x20;↓

IDLE

```\[cite: 5]



Vid fel:\[cite: 5]



```text

ERROR\_RECOVERY

&#x20;↓

IDLE

```\[cite: 5]



Systemet får inte lämnas i ett halv-committat state\[cite: 5].



\---



\# 49. Turn Idempotency\[cite: 5]



Varje turn och mutation ska ha ett unikt ID\[cite: 5].



Exempel:\[cite: 5]



```yaml

turn\_id: "turn\_184"

proposal\_id: "proposal\_184\_01"

```\[cite: 5]



State Engine ska kunna upptäcka om samma proposal redan har commit:ats\[cite: 5].



Detta är viktigt vid:\[cite: 5]



\- retries\[cite: 5]

\- reconnect\[cite: 5]

\- worker restart\[cite: 5]

\- duplicated provider responses\[cite: 5]

\- persistence recovery\[cite: 5]



\---



\# 50. Testing Strategy\[cite: 5]



\## 50.1 Unit Tests\[cite: 5]



Testa bland annat:\[cite: 5]



\- layer resolution\[cite: 5]

\- state mutation\[cite: 5]

\- locks\[cite: 5]

\- authority\[cite: 5]

\- memory ranking\[cite: 5]

\- context budgeting\[cite: 5]

\- schema validation\[cite: 5]

\- migration\[cite: 5]

\- encryption\[cite: 5]

\- event creation\[cite: 5]



\## 50.2 Integration Tests\[cite: 5]



Testa:\[cite: 5]



\- full turn lifecycle\[cite: 5]

\- LLM adapter\[cite: 5]

\- memory pipeline\[cite: 5]

\- Pass 1 → Pass 2\[cite: 5]

\- import/export\[cite: 5]

\- fallback provider\[cite: 5]

\- cancellation\[cite: 5]

\- persistence recovery\[cite: 5]



\## 50.3 Regression Tests\[cite: 5]



Färdiga scenarier där förväntade state-förändringar och invariants verifieras\[cite: 5].



\## 50.4 Property Tests\[cite: 5]



Exempel:\[cite: 5]



> Ett player-locked fält får aldrig ändras av en AI-mutation\[cite: 5].



Testa detta över många slumpmässiga mutationer och kombinationer av layers/events\[cite: 5].



\---



\# 51. System Invariants\[cite: 5]



Följande regler ska alltid gälla:\[cite: 5]



1\. AI kan aldrig skriva över `player\_locked` state\[cite: 5].

2\. AI kan aldrig skriva över `system\_locked` state genom normal mutation\[cite: 5].

3\. Ogiltiga state-mutationer commit:as aldrig\[cite: 5].

4\. Memory kan aldrig direkt ändra current state\[cite: 5].

5\. Inaktiva layers påverkar inte context\[cite: 5].

6\. Raderad conversation får inte fortsätta skickas till LLM\[cite: 5].

7\. En state commit kan spåras till event\[cite: 5].

8\. Importerad data måste schema-valideras\[cite: 5].

9\. Krypterad export kan inte dekrypteras utan korrekt credential\[cite: 5].

10\. Context Engine får aldrig överskrida 8 000 tokens\[cite: 5].

11\. KDF och tung kryptering får inte köras på UI-huvudtråden\[cite: 5].

12\. Pass 2 får inte commit:a en proposal mot en inkompatibel state-version\[cite: 5].

13\. Retries får inte skapa dubbla state-commits\[cite: 5].

14\. Cancellation får inte commit:a ofullständiga automatiska state-mutationer\[cite: 5].

15\. AI-genererade layers får inte kringgå Policy Engine\[cite: 5].

16\. UI får inte direkt mutera kanoniskt state utan att gå genom State Engine\[cite: 5].

17\. Alla schema migrationer måste vara deterministiska\[cite: 5].



\---



\# 52. Observability\[cite: 5]



Inspector Mode ska kunna visa:\[cite: 5]



```text

Session

&#x20;├─ Current State

&#x20;├─ State Version

&#x20;├─ Active Layers

&#x20;├─ Retrieved Memory

&#x20;├─ Context Budget

&#x20;├─ Last LLM Call

&#x20;├─ Pass 1 Output

&#x20;├─ Pass 2 Proposal

&#x20;├─ Accepted Mutations

&#x20;├─ Rejected Mutations

&#x20;├─ Event History

&#x20;├─ Snapshots

&#x20;└─ Performance

```\[cite: 5]



Målet är full spårbarhet:\[cite: 5]



```text

Output

&#x20;↓

Proposal

&#x20;↓

Schema Validation

&#x20;↓

Policy Validation

&#x20;↓

Authority / Lock Check

&#x20;↓

State Version Check

&#x20;↓

State Event

&#x20;↓

Current State

```\[cite: 5]



\---



\# 53. Teknisk Pipeline per Turn\[cite: 5]



```text

PLAYER INPUT

&#x20;     ↓

REGISTER INPUT

&#x20;     ↓

CREATE STATE SNAPSHOT

&#x20;     ↓

MEMORY RETRIEVAL ─────┐

&#x20;                     ├──► CONTEXT ASSEMBLY

LAYER RESOLUTION ─────┘

&#x20;                             ↓

&#x20;                      TOKEN BUDGET CHECK

&#x20;                             ↓

&#x20;                      PASS 1 LLM STREAM

&#x20;                             ↓

&#x20;                      RESPONSE FINALIZE

&#x20;                             ↓

&#x20;                   PASS 2 ASYNC EXTRACTION

&#x20;                             ↓

&#x20;                   STRUCTURED PROPOSAL

&#x20;                             ↓

&#x20;                    SCHEMA VALIDATION

&#x20;                             ↓

&#x20;                    POLICY VALIDATION

&#x20;                             ↓

&#x20;                AUTHORITY / LOCK CHECK

&#x20;                             ↓

&#x20;                   STATE VERSION CHECK

&#x20;                             ↓

&#x20;                      STATE COMMIT

&#x20;                             ↓

&#x20;                        EVENT LOG

&#x20;                             ↓

&#x20;                      MEMORY UPDATE

&#x20;                             ↓

&#x20;                        PERSISTENCE

&#x20;                             ↓

&#x20;                        DIAGNOSTICS

```\[cite: 5]



\---



\# 54. Minimal Canonical Data Model\[cite: 5]



```yaml

session:

&#x20; schema\_version: 2

&#x20; id: "session\_001"



&#x20; runtime:

&#x20;   model: "..."

&#x20;   model\_version: "..."

&#x20;   temperature: 0.7

&#x20;   seed: null

&#x20;   provider: "..."



&#x20; state\_version: 184



&#x20; characters: {}



&#x20; scene: {}



&#x20; relationships: {}



&#x20; layers: \[]



&#x20; state: {}



&#x20; memory:

&#x20;   episodic: \[]

&#x20;   semantic: \[]

&#x20;   relational: \[]



&#x20; conversation: \[]



&#x20; events: \[]



&#x20; snapshots: \[]



&#x20; diagnostics: \[]

```\[cite: 5]



\---



\# 55. Recommended Module Boundaries\[cite: 5]



En möjlig implementationstruktur:\[cite: 5]



```text

src/

├── session/

│   ├── SessionEngine

│   └── TurnCoordinator

│

├── state/

│   ├── StateEngine

│   ├── StateSchema

│   ├── MutationValidator

│   ├── AuthorityResolver

│   ├── LockManager

│   └── StateVersioning

│

├── context/

│   ├── ContextEngine

│   ├── ContextBudgetManager

│   └── PromptAssembler

│

├── memory/

│   ├── MemoryEngine

│   ├── MemoryRetriever

│   ├── MemoryRanker

│   └── Summarizer

│

├── layers/

│   ├── LayerEngine

│   ├── LayerResolver

│   └── LayerGenerator

│

├── llm/

│   ├── LLMAdapter

│   ├── ProviderCapabilities

│   └── providers/

│

├── events/

│   ├── EventLog

│   └── EventTypes

│

├── persistence/

│   ├── IndexedDBRepository

│   ├── MigrationEngine

│   └── ExportEngine

│

├── crypto/

│   └── crypto.worker

│

├── diagnostics/

│   └── DiagnosticsEngine

│

└── ui/

&#x20;   ├── Chat

&#x20;   ├── LayerInspector

&#x20;   ├── StateInspector

&#x20;   └── StatusBar

```\[cite: 5]



Detta är en rekommenderad modulgräns, inte ett krav på specifikt programmeringsspråk eller framework\[cite: 5].



\---



\# 56. Designmål\[cite: 5]



\## För rollspelaren\[cite: 5]



\- snabb\[cite: 5]

\- naturlig\[cite: 5]

\- responsiv\[cite: 5]

\- sammanhängande\[cite: 5]

\- lätt att korrigera\[cite: 5]



\## För regissören\[cite: 5]



\- transparent\[cite: 5]

\- kontrollerbar\[cite: 5]

\- inspekterbar\[cite: 5]

\- reversibel\[cite: 5]

\- förutsägbar\[cite: 5]



\## För utvecklaren\[cite: 5]



\- modulär\[cite: 5]

\- testbar\[cite: 5]

\- provideroberoende\[cite: 5]

\- versionsbar\[cite: 5]

\- diagnostiserbar\[cite: 5]



\---



\# 57. Sammanfattande Arkitekturregel\[cite: 5]



Den centrala kontrollkedjan är:\[cite: 5]



```text

&#x20;                   ┌──────────────┐

&#x20;                   │    PLAYER    │

&#x20;                   └──────┬───────┘

&#x20;                          │

&#x20;                          ↓

&#x20;                   ┌──────────────┐

&#x20;                   │   COMMAND    │

&#x20;                   └──────┬───────┘

&#x20;                          │

&#x20;                          ↓

&#x20;                   ┌──────────────┐

&#x20;                   │ STATE ENGINE │

&#x20;                   └──────┬───────┘

&#x20;                          │

&#x20;             ┌────────────┴────────────┐

&#x20;             ↓                         ↓

&#x20;      ┌────────────┐             ┌────────────┐

&#x20;      │  CONTEXT   │             │   EVENT    │

&#x20;      │   ENGINE   │             │    LOG     │

&#x20;      └──────┬─────┘             └────────────┘

&#x20;             │

&#x20;             ↓

&#x20;      LLM — PASS 1

&#x20;      Stream Dialog

&#x20;             │

&#x20;             ↓

&#x20;      LLM — PASS 2

&#x20;      Async Extraction

&#x20;             │

&#x20;             ↓

&#x20;      STRUCTURED PROPOSAL

&#x20;             │

&#x20;             ↓

&#x20;      SCHEMA / POLICY

&#x20;             │

&#x20;             ↓

&#x20;      AUTHORITY / LOCK

&#x20;             │

&#x20;             ↓

&#x20;      VERSION CHECK

&#x20;             │

&#x20;             ↓

&#x20;      STATE ENGINE

&#x20;             │

&#x20;             ↓

&#x20;      COMMITTED STATE

```\[cite: 5]



> \*\*AI:n beskriver vad den tror händer. State Engine avgör vad som faktiskt händer.\*\*\[cite: 5]



Detta är den grundläggande designregeln som gör systemet robust mot hallucinationer, gamla minnen, genererade layers, samtidiga bakgrundsprocesser och felaktiga AI-förslag samtidigt som spelaren behåller rollen som regissör\[cite: 5].

