# Ideas: game time, journeys, rest and injuries

Design notes from discussion, 2026-11-01. These are ideas for future gameplay implementation, not a description of completed features.

Implemented first steps: a persisted fictional clock (Day 1, 08:00 initially), explicit map-route durations, and player-declared wait/rest/sleep durations. Chat provides Pass time controls, including next morning at 08:00. Ordinary dialogue and real elapsed time do not advance the clock. Regenerating a reply does not charge a declared wait again.

First journey iteration: map estimates in days represent eight active travel hours per travel day. Longer routes progress in eight-hour stages, with stops between stages. Rest or sleep of at least eight hours unlocks the next stage; players can explicitly push on without a numeric fatigue simulation. Rest-until-morning normally yields two overnight stops on a three-day route, arriving on Day 3. Rest advances the clock independently and is never charged again on continue. Route progress, destination snapshots and encounter opportunities survive saving/reloading. Authored route encounter settings are checked once per stage and once per camp; narration must not reroll them per message. Full encounter resolution, interruptions within a stage, automatic narrative-time proposals and injury/fatigue rules remain future work.

River crossings now have descriptions, AI conditions, ferry schedule text, explicit blocked/available access, and authored ford/swimming alternatives. Schedules and guard conditions are narrative guidance; they are not automatic timetable/quest gates. Ford/swim routes require an explicit player action. Precise crossing arrival times and pauses at checkpoints remain future work.

Map route planner first iteration: before a journey, choose a destination reachable through mapped connections at the current map level by dragging from the player marker to its destination, clicking a route or using the destination dropdown. Add stops on the selected path, drag them along its curve, or click a crossing to place a stop there. Stops are pauses or overnight stays. The itinerary previews travel and arrival times, and the saved per-session plan drives actual stages. Stops do not create library places. Planning follows the road network through junctions and supports multiple connections to reach points of interest. Ferry/bridge crossings can be added from a separate stop selector. Upcoming stops can be removed during travel. Off-road travel and fully redrawing an already-started plan remain follow-ups. A planned stop at a crossing is now possible; automatic checkpoint gates remain future work.

## Narrative time

- Game time follows events in the fiction, not real elapsed time or message count.
- Travel time comes from route distance, movement speed and terrain.
- Actions advance time according to their scope. Opening a door can take seconds; preparing a three-course meal can take hours, even if described in one message.
- Dialogue advances time conservatively. Twenty short exchanges may take only a few fictional minutes.
- Distinguish proposals and intentions from completed actions. Asking whether to cook does not consume the time needed to cook.
- Concurrent activities share elapsed time: conversation during cooking should not add its full duration again.
- The AI proposes approximate elapsed time; the engine owns the clock and validates changes. Allow player corrections and make significant time advances understandable.

## Journeys and encounter opportunities

- Distinguish travel days from continuous hours of movement. A three-day journey normally includes meals, breaks and two overnight stops; do not charge for those twice.
- Split long journeys into daytime stages, stopping decisions, overnight rest and eventual arrival.
- Campsites, inns and secluded shelters create different encounter possibilities. Stops do not guarantee encounters.
- Allow players to play out a meeting or evening, or summarize an uneventful stage. Pause the summary when a meaningful decision is needed.
- Check encounters on arrival or at appropriate intervals of fictional travel/stay, not once per chat message.
- Pause travel progress and route encounter checks when the traveller stops to talk. A conversation should not repeatedly trigger new arrivals.
- Sleep and rest requirements depend on the character and world. Robots and other beings need not follow human assumptions.

## Keep the initial rest system simple

- Begin with travel days, overnight stops and meaningful choices, without detailed fatigue, calorie or carrying-weight simulation.
- Equipment matters when relevant: a tent provides rain shelter; missing bedding can make a cold night difficult.
- Pushing on without rest may produce a persistent fatigue state or a need for longer recovery, rather than repeated arbitrary penalties.
- Detailed encumbrance, sleep and survival mechanics could be an optional ruleset later.

## Injuries and persistent consequences

- Apply consequences to relevant activities: an injured foot may slow walking and require breaks; an injured hand may impede climbing without slowing walking.
- Severe injuries can make continued travel unreasonable until help or treatment is available.
- Start with simple persistent conditions and understandable consequences, rather than a medical simulation.
- The engine records conditions; the AI describes their effects. Do not stack a fresh penalty for the same injury on every message.
- Apply effects more narratively in free chat and more strictly in rule-driven adventures.

## Questions for implementation

- Define travel-day duration and when a route estimate includes overnight rest.
- Define encounter intervals, cooldowns and checks for arrival, active travel and longer stays.
- Define how time proposals, player corrections, simultaneous activities and interrupted journeys are represented in session state.
- Define condition severity, recovery and ruleset-specific effects before adding detailed calculations.

Map Studio connection tool can attach roads/paths to other roads/paths. Clicking a route creates or reuses a graph junction; clicking another road or place completes the connection. Splitting preserves curve geometry, manual duration totals, direction, conditions and authored river-crossing details. Crossing lines remain independent until explicitly connected.
