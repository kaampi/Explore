import { expect, it } from "vitest";
import { WorldMapSchema } from "@library/worldMap";
import { RoutePlanSchema, plannedTimings, pointOnPlannedRoute, projectToPlannedRoute, samplePlannedRoute, validatePlannedStops } from "@library/routePlan";

const map=()=>WorldMapSchema.parse({nodes:[
 {id:"a",placeId:"pa",name:"Village",kind:"Settlement",x:10,y:50},
 {id:"b",placeId:"pb",name:"Forest",kind:"Forest",x:90,y:50}
],routes:[{id:"road",from:"a",to:"b",mode:"Walk",duration:"12 hours",access:"open",bothWays:true,
 geometry:[{x:10,y:50,outgoing:{x:40,y:10}},{x:90,y:50,incoming:{x:60,y:90}}]}]});

it("projects a dragged stop onto the curved route in either travel direction",()=>{
 const m=map(),forward=samplePlannedRoute(m,"road","pa"),reverse=samplePlannedRoute(m,"road","pb");
 const quarter=pointOnPlannedRoute(forward,.25);
 const projection=projectToPlannedRoute(forward,quarter);
 expect(projection.fraction).toBeCloseTo(.25,4);
 expect(projectToPlannedRoute(reverse,quarter).fraction).toBeCloseTo(.75,4);
 expect(forward[0]!.x).toBeLessThan(forward[forward.length-1]!.x);
 expect(reverse[0]!.x).toBeGreaterThan(reverse[reverse.length-1]!.x);
});

it("forecasts a pause and an overnight stay without charging rest twice",()=>{
 const plan=RoutePlanSchema.parse({worldId:"w",routeId:"r",fromPlaceId:"pa",stops:[
  {fraction:.25,label:"Bridge",kind:"pause"},{fraction:.5,label:"Camp",kind:"overnight"}
 ]});
 const timeline=plannedTimings(720,plan.stops,480);
 expect(timeline.map(t=>t.travelMinutes)).toEqual([180,180,360]);
 expect(timeline.map(t=>t.arrival)).toEqual([660,840,2280]);
 expect(timeline[1]!.departure).toBe(1920);
 expect(validatePlannedStops(plan.stops,720)).toBeUndefined();
});

it("rejects reversed stops and stops too close to consume separate travel time",()=>{
 expect(RoutePlanSchema.safeParse({worldId:"w",routeId:"r",fromPlaceId:"pa",stops:[
  {fraction:.6,label:"A",kind:"pause"},{fraction:.5,label:"B",kind:"pause"}
 ]}).success).toBe(false);
 expect(validatePlannedStops([{fraction:.001,label:"Too close",kind:"pause"}],60)).toBeTruthy();
});
