import type { Journey, Session } from "./StateSchema";
import { JourneySchema } from "./StateSchema";
import { applyLandmarkTravel, type LandmarkTravelPatch } from "./landmarkTravel";
import { INITIAL_GAME_MINUTES } from "./gameClock";
import { copyPictureFields } from "./placePictures";
import { copyAudioFields } from "./placeAudio";
import { RoutePlanSchema, validatePlannedStops } from "@library/routePlan";

export const TRAVEL_STAGE_MINUTES = 8 * 60;
export const OVERNIGHT_REST_MINUTES = 8 * 60;
export class JourneyError extends Error {}

export function journeyActionFromText(text: string): "continue" | "push-on" | undefined {
  const value = text.trim().replace(/[.!]$/, "");
  if (/^(?:I |we )?(?:continue (?:the |our |my )?(?:journey|travel)|resume (?:the |our |my )?(?:journey|travel))$|^(?:jag |vi )?fortsätter (?:resan|färden)$/i.test(value)) return "continue";
  if (/^(?:I |we )?(?:continue (?:the |our |my )?journey without (?:rest|sleep)|push on without (?:rest|sleep))$|^(?:jag |vi )?fortsätter (?:resan|färden) utan (?:vila|sömn)$/i.test(value)) return "push-on";
  return;
}

function opportunity(journey: Journey, kind: "travel" | "camp"): NonNullable<Journey["opportunity"]> {
  const chance = {never:0, rarely:0.1, sometimes:0.3, often:0.6}[journey.encounter?.frequency ?? "never"];
  // Stable for a given stage: refreshing, talking and regenerating never reroll an opportunity.
  let hash = 2166136261;
  for (const char of `${journey.id}:${journey.completedStages}:${kind}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return {kind, triggered:Boolean(journey.encounter?.participants.trim()) && (hash >>> 0) / 4294967296 < chance};
}

function destinationPatch(journey: Journey): LandmarkTravelPatch {
  const {environment, ...scene} = journey.destination;
  return {location:scene.location, placeId:journey.destination.placeId!, ...copyPictureFields(scene), ...copyAudioFields(scene),
    ...(journey.routeInfo ? {routeInfo:journey.routeInfo} : {}),
    ...(scene.note !== undefined ? {note:scene.note} : {}),
    ...(scene.brief !== undefined ? {brief:scene.brief} : {}),
    ...(scene.rooms ? {rooms:scene.rooms} : {}),
    ...(environment.lighting !== undefined ? {lighting:environment.lighting} : {}),
    ...(environment.noise !== undefined ? {noise:environment.noise} : {}),
    ...(environment.music !== undefined ? {music:environment.music} : {}),
    placeLayers:journey.destinationLayers.map(layer => ({id:layer.id, type:layer.type, priority:layer.priority,
      content:layer.content, active:layer.active, aiGenerated:layer.aiGenerated, ...(layer.keywords ? {keywords:layer.keywords} : {})}))};
}

export function travelWorkMinutes(patch: LandmarkTravelPatch): number | undefined {
  const minutes = patch.travelDays !== undefined ? Math.round(patch.travelDays * TRAVEL_STAGE_MINUTES) : patch.travelMinutes;
  return minutes !== undefined && Number.isSafeInteger(minutes) && minutes > 0 ? minutes : undefined;
}

/** Pin arrival facts now so later library edits cannot change a journey in progress. */
export function beginJourney(session: Session, patch: LandmarkTravelPatch): void {
  if (session.journey) throw new JourneyError("Finish the current journey before starting another one.");
  if (session.player?.position.lock !== "unlocked") throw new JourneyError("Unlock the player's position before travelling.");
  const total = travelWorkMinutes(patch);
  if (!total || total <= TRAVEL_STAGE_MINUTES && !patch.plan?.stops.length) throw new JourneyError("This journey does not need intermediate stages.");
  const plan=patch.plan?RoutePlanSchema.parse(patch.plan):undefined;
  if(plan&&plan.fromPlaceId!==session.scene?.placeId)throw new JourneyError("The route plan starts at another place. Open the planner again.");
  const error=plan&&validatePlannedStops(plan.stops,total);
  if(error)throw new JourneyError(error);
  const {placeLayers, travelMinutes: _minutes, travelDays: _days, encounter, routeInfo, plan:_plan, lighting, noise, music, ...destination} = patch;
  session.gameClock ??= {totalMinutes:INITIAL_GAME_MINUTES};
  session.journey = JourneySchema.parse({id:crypto.randomUUID(), originName:session.scene?.location ?? "Departure",
    destination:{...destination, environment:{lighting, noise, music}}, destinationLayers:placeLayers,
    totalTravelMinutes:total, remainingTravelMinutes:total, completedStages:0, restMinutes:0, phase:"ready",
    ...(encounter ? {encounter} : {}), campChecked:false, pushedOn:false});
  if(plan)session.journey!.plan=plan;
  if (routeInfo) session.journey!.routeInfo = routeInfo;
  advanceJourney(session);
}

export function validateJourneyContinue(session: Session, pushOn = false): void {
  if (!session.journey) throw new JourneyError("There is no journey to continue.");
  if (session.player?.position.lock !== "unlocked") throw new JourneyError("Unlock the player's position before continuing the journey.");
  if (session.journey.phase === "overnight" && !pushOn) throw new JourneyError("Rest for at least eight hours before the next stage, or choose Continue without rest.");
}

export function advanceJourney(session: Session, pushOn = false): void {
  validateJourneyContinue(session, pushOn);
  const journey = session.journey!;
  const stop=journey.plan?.stops[journey.completedStages];
  const travelled=journey.totalTravelMinutes-journey.remainingTravelMinutes;
  const minutes = journey.plan ? Math.round(journey.totalTravelMinutes*(stop?.fraction??1))-travelled : Math.min(TRAVEL_STAGE_MINUTES, journey.remainingTravelMinutes);
  if(minutes<=0||minutes>journey.remainingTravelMinutes)throw new JourneyError("The next planned stop is invalid. Replan the remaining journey.");
  journey.remainingTravelMinutes -= minutes;
  journey.completedStages++;
  journey.restMinutes = 0;
  journey.campChecked = false;
  journey.pushedOn = pushOn;
  journey.opportunity = opportunity(journey, "travel");
  if (journey.remainingTravelMinutes === 0) {
    applyLandmarkTravel(session, {...destinationPatch(journey), travelMinutes:minutes});
    delete session.journey;
    return;
  }
  journey.phase = stop?.kind==="pause"?"pause":"overnight";
  if(stop)journey.currentStop=stop.label;
  const location = stop ? `${stop.label} — on the way to ${journey.destination.location}` : `On the way to ${journey.destination.location}`;
  const note = `Journey from ${journey.originName} to ${journey.destination.location}. Stage ${journey.completedStages} is complete. You have stopped along the route and have not arrived. ${stop?`Planned stop: ${stop.label}. ${stop.description??""}`:""} ${journey.phase==="pause"?"This is a pause, not an automatic overnight stay. Continue when the player chooses.":"The next stage awaits rest or a decision to push on."}`;
  applyLandmarkTravel(session, {placeId:`journey:${journey.id}`, location, note, brief:note,
    travelMinutes:minutes, placeLayers:[{id:"layer-place-journey", type:"environment", priority:10, content:note, active:true, aiGenerated:false}]});
}

/** Rest consumes clock time, not route progress; it is never charged a second time on continue. */
export function recordJourneyRest(session: Session, minutes: number): void {
  const journey = session.journey;
  if (!journey) return;
  journey.restMinutes += minutes;
  if (!journey.campChecked) {
    journey.opportunity = opportunity(journey, "camp");
    journey.campChecked = true;
  }
  if (journey.restMinutes >= OVERNIGHT_REST_MINUTES) journey.phase = "ready";
}

/** Completed/current stops are history; removing a future stop must not move the player. */
export function removePlannedJourneyStop(session: Session,index: number): void {
  const journey=session.journey;
  if(!journey?.plan)throw new JourneyError("This journey has no editable planned stops.");
  if(!Number.isInteger(index)||index<journey.completedStages||index>=journey.plan.stops.length)
    throw new JourneyError("Only upcoming stops can be removed. Continue the journey to leave your current stop.");
  journey.plan.stops.splice(index,1);
}
