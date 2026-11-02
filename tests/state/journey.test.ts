import { expect, it } from "vitest";
import { StateEngine } from "@state/StateEngine";
import { SessionSchema } from "@state/StateSchema";
import { EventLog } from "@events/EventLog";
import { newPlaceTemplate, newRealmTemplate } from "@library/LibrarySchema";
import { exampleCharacterTemplate } from "@library/exampleTemplates";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { landmarkTravelPatch } from "@session/landmarkTravel";
import { journeyActionFromText } from "@state/journey";
import { formatGameTime, travelDaysFromDuration } from "@state/gameClock";
import { isLeftBehind } from "@state/party";
import { SessionEngine } from "@session/SessionEngine";
import { LLMAdapter } from "@llm/LLMAdapter";
import { MockProvider } from "@llm/providers/MockProvider";

function fixture(options: {party?:boolean;locked?:boolean} = {}) {
  const origin = newPlaceTemplate({id:"a", realmId:"w", name:"Village"});
  const target = newPlaceTemplate({id:"b", realmId:"w", name:"Forest", note:"Blue flowers at the destination."});
  const world = newRealmTemplate({id:"w", name:"World", note:"", source:"player", worldMap:{
    nodes:[origin,target].map((p,i) => ({id:p.id,placeId:p.id,name:p.name,kind:i ? "Forest" : "Settlement", x:20+i*50,y:50,description:"",population:"",characterIds:[]})), routes:[]}});
  const session = quickCharacterSession(exampleCharacterTemplate(), "journey", {place:origin,realm:world});
  const characterId = Object.keys(session.characters)[0]!;
  if (options.party) session.partyIds = [characterId];
  if (options.locked) session.player!.position.lock = "player_locked";
  const engine = new StateEngine(session, new EventLog());
  return {engine, target, characterId:Object.keys(session.characters)[0]!};
}

it("turns three travel days into three stages and two overnight stops", () => {
  const {engine,target,characterId} = fixture();
  engine.travelToLandmark({...landmarkTravelPatch(target), travelMinutes:4320, travelDays:3});
  let session = engine.getSession();
  expect(session.scene?.location).toBe("On the way to Forest");
  expect(session.scene?.brief).not.toContain("Blue flowers");
  expect(session.journey?.remainingTravelMinutes).toBe(960);
  expect(session.journey?.phase).toBe("overnight");
  expect(isLeftBehind(session,characterId)).toBe(true);
  expect(formatGameTime(session.gameClock!.totalMinutes)).toBe("Day 1 · 16:00");
  expect(() => engine.continueJourney()).toThrow(/Rest/);
  engine.advanceGameTime(960,"rest");
  session = engine.getSession();
  expect(session.journey?.phase).toBe("ready");
  engine.continueJourney();
  session = engine.getSession();
  expect(session.journey?.completedStages).toBe(2);
  expect(formatGameTime(session.gameClock!.totalMinutes)).toBe("Day 2 · 16:00");
  // Simulate closing/reopening the saved conversation during the second stop.
  const reloaded = new StateEngine(SessionSchema.parse(JSON.parse(JSON.stringify(session))), new EventLog());
  reloaded.advanceGameTime(960,"rest");
  reloaded.continueJourney();
  session = reloaded.getSession();
  expect(session.journey).toBeUndefined();
  expect(session.scene?.placeId).toBe("b");
  expect(session.scene?.note).toContain("Blue flowers");
  expect(formatGameTime(session.gameClock!.totalMinutes)).toBe("Day 3 · 16:00");
});

it("does not count waiting as travel or reroll encounters on conversation time", () => {
  const {engine,target} = fixture();
  engine.travelToLandmark({...landmarkTravelPatch(target), travelDays:3,
    encounter:{frequency:"often",participants:"A travelling merchant",tone:"friendly"}});
  let j = engine.getSession().journey!;
  const remaining = j.remainingTravelMinutes;
  const event = structuredClone(j.opportunity);
  engine.advanceGameTime(30,"wait");
  j = engine.getSession().journey!;
  expect(j.opportunity).toEqual(event);
  expect(j.phase).toBe("overnight");
  engine.advanceGameTime(240,"sleep");
  j = engine.getSession().journey!;
  expect(j.phase).toBe("overnight");
  const camp = structuredClone(j.opportunity);
  engine.advanceGameTime(240,"sleep");
  j = engine.getSession().journey!;
  expect(j.phase).toBe("ready");
  expect(j.opportunity).toEqual(camp);
  expect(j.remainingTravelMinutes).toBe(remaining);
});

it("can explicitly push on and keeps travelling companions on the route", () => {
  const {engine,target,characterId} = fixture({party:true});
  engine.travelToLandmark({...landmarkTravelPatch(target), travelDays:2});
  expect(isLeftBehind(engine.getSession(),characterId)).toBe(false);
  engine.continueJourney(true);
  expect(engine.getSession().journey).toBeUndefined();
  expect(engine.getSession().characters[characterId]?.locationRef).toEqual(engine.getSession().player?.locationRef);
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 2 · 00:00");
});

it("restores readiness as well as time when rest is undone", () => {
  const {engine,target} = fixture();
  engine.travelToLandmark({...landmarkTravelPatch(target), travelDays:2});
  engine.advanceGameTime(480,"sleep");
  expect(engine.getSession().journey?.phase).toBe("ready");
  engine.undoLastMutation("player_manual_state",engine.getSession().stateVersion);
  expect(engine.getSession().journey?.phase).toBe("overnight");
  expect(engine.getSession().journey?.restMinutes).toBe(0);
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 1 · 16:00");
});

it("does not restore an old camp by undoing rest after arrival", () => {
  const {engine,target} = fixture();
  engine.travelToLandmark({...landmarkTravelPatch(target),travelDays:2});
  engine.advanceGameTime(960,"rest");
  engine.continueJourney();
  const clock=engine.getSession().gameClock;
  expect(engine.undoLastMutation("player_manual_state",engine.getSession().stateVersion).committed).toBe(false);
  expect(engine.getSession().journey).toBeUndefined();
  expect(engine.getSession().scene?.placeId).toBe("b");
  expect(engine.getSession().gameClock).toEqual(clock);
});

it("does not start a journey when movement is locked, and only accepts explicit continuation", () => {
  const {engine,target} = fixture({locked:true});
  expect(() => engine.travelToLandmark({...landmarkTravelPatch(target),travelDays:3})).toThrow(/Unlock/);
  expect(engine.getSession().journey).toBeUndefined();
  expect(journeyActionFromText("I continue the journey.")).toBe("continue");
  expect(journeyActionFromText("I continue the journey without rest.")).toBe("push-on");
  expect(journeyActionFromText("Should I continue the journey?")).toBeUndefined();
  expect(travelDaysFromDuration("three days")).toBe(3);
  expect(travelDaysFromDuration("72 hours")).toBeUndefined();
});

it("runs staged travel through chat without repeating progress on regenerate", async () => {
  const {engine,target,characterId} = fixture();
  const dialogue = new SessionEngine(engine,new LLMAdapter({primary:new MockProvider({responseChunks:["You stop along the route."]})}),engine.getEventLog());
  await dialogue.runTurn("start",characterId,"I go to Forest",{}, {travel:{...landmarkTravelPatch(target),travelDays:2}});
  expect(engine.getSession().journey?.completedStages).toBe(1);
  await dialogue.regenerateLastTurn("regen");
  expect(engine.getSession().journey?.completedStages).toBe(1);
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 1 · 16:00");
  const event = engine.getSession().journey?.opportunity;
  await dialogue.runTurn("talk",characterId,"I look around");
  expect(engine.getSession().journey?.opportunity).toEqual(event);
  expect(engine.getSession().journey?.remainingTravelMinutes).toBe(480);
  await expect(dialogue.runTurn("early",characterId,"I continue the journey.")).rejects.toThrow(/Rest/);
  await dialogue.runTurn("rest",characterId,"I rest until morning.");
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 2 · 08:00");
  await dialogue.runTurn("continue",characterId,"I continue the journey.");
  expect(engine.getSession().journey).toBeUndefined();
  expect(engine.getSession().scene?.placeId).toBe("b");
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 2 · 16:00");
  await dialogue.regenerateLastTurn("regen-arrival");
  expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 2 · 16:00");
});

it("uses player-planned pauses and nights instead of automatic eight-hour stops",()=>{
 const {engine,target}=fixture();
 engine.travelToLandmark({...landmarkTravelPatch(target),travelMinutes:720,plan:{worldId:"w",routeId:"r",fromPlaceId:"a",stops:[
  {fraction:.25,label:"Bridge",kind:"pause",description:"A wooden bridge over a river."},
  {fraction:.5,label:"Camp before the forest",kind:"overnight"}
 ]}});
 expect(engine.getSession().journey?.phase).toBe("pause");
 expect(engine.getSession().scene?.location).toContain("Bridge");
 expect(formatGameTime(engine.getSession().gameClock!.totalMinutes)).toBe("Day 1 · 11:00");
 const restored=new StateEngine(SessionSchema.parse(JSON.parse(JSON.stringify(engine.getSession()))),new EventLog());
 restored.continueJourney();
 expect(restored.getSession().journey?.currentStop).toBe("Camp before the forest");
 expect(restored.getSession().journey?.phase).toBe("overnight");
 expect(formatGameTime(restored.getSession().gameClock!.totalMinutes)).toBe("Day 1 · 14:00");
 restored.advanceGameTime(1080,"rest");
 restored.continueJourney();
 expect(restored.getSession().journey).toBeUndefined();
 expect(restored.getSession().scene?.placeId).toBe("b");
 expect(formatGameTime(restored.getSession().gameClock!.totalMinutes)).toBe("Day 2 · 14:00");
});

it("supports a planned pause even on a short journey",()=>{
 const {engine,target}=fixture();
 engine.travelToLandmark({...landmarkTravelPatch(target),travelMinutes:60,plan:{worldId:"w",routeId:"r",fromPlaceId:"a",stops:[{fraction:.5,label:"Rest by the bridge",kind:"pause"}]}});
 expect(engine.getSession().journey?.phase).toBe("pause");
 expect(engine.getSession().journey?.remainingTravelMinutes).toBe(30);
 engine.continueJourney();
 expect(engine.getSession().journey).toBeUndefined();
 expect(engine.getSession().gameClock?.totalMinutes).toBe(540);
});

it("removes an upcoming pause without moving the player or losing route time",()=>{
 const {engine,target}=fixture();
 engine.travelToLandmark({...landmarkTravelPatch(target),travelMinutes:240,plan:{worldId:"w",routeId:"r",fromPlaceId:"a",stops:[
  {fraction:.25,label:"Bridge",kind:"pause"},{fraction:.5,label:"Viewpoint",kind:"pause"},{fraction:.75,label:"Rest area",kind:"pause"}
 ]}});
 const before=engine.getSession();
 engine.removeJourneyStop(1);
 expect(engine.getSession().journey?.plan?.stops.map(s=>s.label)).toEqual(["Bridge","Rest area"]);
 expect(engine.getSession().gameClock).toEqual(before.gameClock);
 expect(engine.getSession().player?.position).toEqual(before.player?.position);
 expect(engine.getSession().journey?.remainingTravelMinutes).toBe(180);
 expect(()=>engine.removeJourneyStop(0)).toThrow(/upcoming/);
 expect(()=>engine.removeJourneyStop(10)).toThrow(/upcoming/);
 const restored=new StateEngine(SessionSchema.parse(JSON.parse(JSON.stringify(engine.getSession()))),new EventLog());
 restored.continueJourney();
 expect(restored.getSession().journey?.currentStop).toBe("Rest area");
 expect(restored.getSession().gameClock?.totalMinutes).toBe(660);
 restored.continueJourney();
 expect(restored.getSession().journey).toBeUndefined();
 expect(restored.getSession().gameClock?.totalMinutes).toBe(720);
});

it("can remove the last upcoming overnight without skipping the final travel distance",()=>{
 const {engine,target}=fixture();
 engine.travelToLandmark({...landmarkTravelPatch(target),travelMinutes:240,plan:{worldId:"w",routeId:"r",fromPlaceId:"a",stops:[
  {fraction:.25,label:"Bridge",kind:"pause"},{fraction:.5,label:"Camp",kind:"overnight"}
 ]}});
 engine.removeJourneyStop(1);
 engine.continueJourney();
 expect(engine.getSession().scene?.placeId).toBe("b");
 expect(engine.getSession().journey).toBeUndefined();
 expect(engine.getSession().gameClock?.totalMinutes).toBe(720);
});
