import { expect, it } from "vitest";
import { formatGameTime, gameTimeOfDay, parseTravelMinutes, timeActionFromText } from "@state/gameClock";
import { newPlaceTemplate, newRealmTemplate } from "@library/LibrarySchema";
import { exampleCharacterTemplate } from "@library/exampleTemplates";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { resolveMapMovement } from "@session/mapMovement";
import { landmarkTravelPatch } from "@session/landmarkTravel";
import { StateEngine } from "@state/StateEngine";
import { EventLog } from "@events/EventLog";
import { SessionSchema } from "@state/StateSchema";

it("parses explicit map durations without guessing descriptions", () => {
  expect(parseTravelMinutes("3 days")).toBe(4320);
  expect(parseTravelMinutes("1 hour and 30 minutes")).toBe(90);
  expect(parseTravelMinutes("1,5 timmar")).toBe(90);
  expect(parseTravelMinutes("2 weeks")).toBe(20160);
  for (const text of ["A few steps", "", "Blocked by terrain", "-5 minutes", "about 3 days", "2 unknown"]) expect(parseTravelMinutes(text)).toBeUndefined();
  expect(formatGameTime(480 + 4320)).toBe("Day 4 · 08:00");
  expect(formatGameTime(1439 + 2)).toBe("Day 2 · 00:01");
});

it("only consumes time for explicit completed waits and rest", () => {
  expect(timeActionFromText("I sleep for two hours", 480)).toEqual({kind:"sleep", minutes:120});
  expect(timeActionFromText("Jag sover i två timmar", 480)).toEqual({kind:"sleep", minutes:120});
  expect(timeActionFromText("I wait for twenty-five minutes", 480)).toEqual({kind:"wait", minutes:25});
  expect(timeActionFromText("I rest for an hour", 480)).toEqual({kind:"rest", minutes:60});
  expect(formatGameTime(480 + 120)).toBe("Day 1 · 10:00");
  expect(gameTimeOfDay(480 + 120)).toBe("morning");
  expect(timeActionFromText("I sleep for 8 hours.", 480)).toEqual({kind:"sleep", minutes:480});
  expect(timeActionFromText("Jag väntar i 30 minuter", 480)).toEqual({kind:"wait", minutes:30});
  expect(timeActionFromText("I rest until morning.", 23*60)).toEqual({kind:"rest", minutes:540});
  expect(timeActionFromText("I sleep until morning", 6*60)).toEqual({kind:"sleep", minutes:120});
  for (const text of ["I want to sleep for 8 hours", "Should I wait for 30 minutes?", "I do not wait for 30 minutes", "I wait for 30 minutes?", "She sleeps for 8 hours", "I cook dinner", "I sleep for -8 hours"]) {
    expect(timeActionFromText(text, 480)).toBeUndefined();
  }
});

it("advances once on actual travel, persists time and leaves ordinary text alone", () => {
  const a = newPlaceTemplate({id: "a", realmId: "w", name: "Kitchen"});
  const b = newPlaceTemplate({id: "b", realmId: "w", name: "Forest"});
  const world = newRealmTemplate({id: "w", name: "World", note: "", source: "player", worldMap: {
    nodes: [a,b].map((p,i) => ({id: p.id, placeId: p.id, name: p.name, kind: i ? "Forest" : "Room", x: 20 + 50*i, y: 50, description: "", population: "", characterIds: []})),
    routes: [{id:"r", from:"a", to:"b", mode:"Walk", duration:"5 minutes", access:"open", bothWays:true}]
  }});
  const engine = new StateEngine(quickCharacterSession(exampleCharacterTemplate(), "clock", {place:a, realm:world}), new EventLog());
  expect(engine.getSession().gameClock?.totalMinutes).toBe(480);
  expect(resolveMapMovement("I look around", engine.getSession(), [world], [a,b]).place).toBeUndefined();
  const move = resolveMapMovement("I go outside", engine.getSession(), [world], [a,b]);
  const patch = {...landmarkTravelPatch(move.place!), travelMinutes: move.travelMinutes!};
  engine.travelToLandmark(patch);
  expect(engine.getSession().gameClock?.totalMinutes).toBe(485);
  engine.travelToLandmark(patch);
  expect(engine.getSession().gameClock?.totalMinutes).toBe(485);
  expect(SessionSchema.parse(JSON.parse(JSON.stringify(engine.getSession()))).gameClock?.totalMinutes).toBe(485);
  const returnMove = resolveMapMovement("I go to Kitchen", engine.getSession(), [world], [a,b]);
  engine.travelToLandmark({...landmarkTravelPatch(returnMove.place!), travelMinutes: returnMove.travelMinutes!});
  expect(engine.getSession().gameClock?.totalMinutes).toBe(490);
});
