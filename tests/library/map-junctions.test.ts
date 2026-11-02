import { expect,it } from "vitest";
import { WorldMapSchema } from "@library/worldMap";
import { attachRoadJunction } from "@library/mapJunctions";
import { findCrossings, crossingSummary } from "@library/mapCrossings";
import { parseTravelMinutes } from "@state/gameClock";
import { routeLength, routePoints } from "@library/mapRoutes";
import { plannerRoutes, samplePlannerRoute } from "@library/plannerRoutes";
import { newPlaceTemplate,newRealmTemplate } from "@library/LibrarySchema";
import { exampleCharacterTemplate } from "@library/exampleTemplates";
import { quickCharacterSession } from "../../src/ui/home/quickStart";
import { resolvePlannedMapMovement } from "@session/mapMovement";

function fixture(){return WorldMapSchema.parse({nodes:[
 {id:"a",placeId:"a",name:"Village",kind:"Settlement",x:10,y:50},
 {id:"b",placeId:"b",name:"Forest",kind:"Forest",x:90,y:50},
 {id:"c",placeId:"c",name:"Ruin",kind:"Point of Interest",x:50,y:10},
 {id:"d",placeId:"d",name:"Hill",kind:"Point of Interest",x:50,y:90}
],routes:[
 {id:"road",from:"a",to:"b",type:"road",mode:"Walk",duration:"1 day",access:"open",bothWays:true,manualTime:true,description:"Open fields"},
 {id:"path",from:"c",to:"d",type:"path",mode:"Walk",duration:"4 hours",access:"open",bothWays:true,manualTime:true}
]});}

it("joins two roads into one four-way graph junction and preserves total time",()=>{
 const map=fixture(),first=attachRoadJunction(map,"road",{x:50,y:50});
 const joined=attachRoadJunction(first.map,"path",{x:50,y:50},first.nodeId);
 expect(joined.nodeId).toBe(first.nodeId);
 expect(joined.map.nodes.filter(n=>n.isJunction)).toHaveLength(1);
 expect(joined.map.routes.filter(r=>r.from===first.nodeId||r.to===first.nodeId)).toHaveLength(4);
 expect(joined.map.routes.filter(r=>r.type==="road").reduce((sum,r)=>sum+parseTravelMinutes(r.duration)!,0)).toBe(1440);
 expect(joined.map.routes.filter(r=>r.type==="path").reduce((sum,r)=>sum+parseTravelMinutes(r.duration)!,0)).toBe(240);
 expect(joined.map.routes.filter(r=>r.type==="road").every(r=>r.manualTime&&r.description==="Open fields")).toBe(true);
 expect(WorldMapSchema.safeParse(joined.map).success).toBe(true);
});

it("retains a curved road shape and reuses an endpoint instead of making tiny extra edges",()=>{
 const map=fixture(),r=map.routes[0]!,a=map.nodes[0]!,b=map.nodes[1]!;
 r.geometry=[{x:10,y:50,outgoing:{x:35,y:10}},{x:90,y:50,incoming:{x:65,y:90}}];
 const original=routeLength(routePoints(r,a,b));
 const result=attachRoadJunction(map,"road",{x:50,y:50});
 const length=result.map.routes.filter(r=>r.type==="road").reduce((sum,r)=>sum+routeLength(routePoints(r,result.map.nodes.find(n=>n.id===r.from)!,result.map.nodes.find(n=>n.id===r.to)!)),0);
 expect(length).toBeCloseTo(original,2);
 const atEnd=attachRoadJunction(map,"road",routePoints(r,a,b)[0]!);
 expect(atEnd.nodeId).toBe("a");expect(atEnd.map.routes).toHaveLength(2);
});

it("retains authored river crossing details on the correct split piece",()=>{
 const map=fixture();map.nodes.push({id:"water",name:"River",kind:"River",x:70,y:50,width:8,height:40,description:"",population:"",characterIds:[]});
 const crossing=findCrossings(map).find(c=>c.routeId==="road")!;
 map.crossings=[{...crossing,type:"bridge",description:"A guarded wooden bridge",instructions:"Ask for a permit"}];
 const result=attachRoadJunction(map,"road",{x:50,y:50}).map;
 expect(crossingSummary(result).join("\n")).toContain("A guarded wooden bridge");
 expect(crossingSummary(result).join("\n")).toContain("Ask for a permit");
 expect(result.crossings?.[0]?.routeId).not.toBe("road");
});

it("plans and executes travel to a POI through the joined road network",()=>{
 let map=fixture();const first=attachRoadJunction(map,"road",{x:50,y:50});map=attachRoadJunction(first.map,"path",{x:50,y:50},first.nodeId).map;
 const ruin=plannerRoutes(map,"a").find(r=>r.to==="c")!;
 expect(ruin).toBeTruthy();expect(ruin.legs).toHaveLength(2);expect(ruin.workMinutes).toBe(360);
 const samples=samplePlannerRoute(map,ruin);expect(samples[0]?.fraction).toBe(0);expect(samples.at(-1)?.fraction).toBe(1);
 const places=map.nodes.map(n=>newPlaceTemplate({id:n.placeId!,realmId:"w",name:n.name}));
 const world=newRealmTemplate({id:"w",name:"World",note:"",source:"player",worldMap:map});
 const session=quickCharacterSession(exampleCharacterTemplate(),"network",{place:places[0]!,realm:world});
 const movement=resolvePlannedMapMovement("I go to Ruin",session,[world],places,{worldId:"w",routeId:ruin.legs[0]!.routeId,fromPlaceId:"a",legs:ruin.legs,stops:[]});
 expect(movement.place?.id).toBe("c");expect(movement.travelMinutes).toBe(360);
 expect(movement.travelDays).toBeUndefined();
});

it("honours one-way paths and blocked connections when finding reachable destinations",()=>{
 const map=fixture();map.routes[1]!.bothWays=false;
 const first=attachRoadJunction(map,"road",{x:50,y:50}),joined=attachRoadJunction(first.map,"path",{x:50,y:50},first.nodeId).map;
 expect(plannerRoutes(joined,"a").some(r=>r.to==="c")).toBe(false);
 expect(plannerRoutes(joined,"a").some(r=>r.to==="d")).toBe(true);
 for(const r of joined.routes.filter(r=>r.type==="path"))r.access="locked";
 expect(plannerRoutes(joined,"a").some(r=>r.to==="d")).toBe(false);
});
