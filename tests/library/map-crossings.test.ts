import { expect,it } from "vitest";
import { findCrossings,crossingSummary } from "../../src/library/mapCrossings";
import { WorldMapSchema } from "../../src/library/worldMap";
const fixture=()=>WorldMapSchema.parse({nodes:[{id:"a",name:"A",kind:"Place",x:10,y:50},{id:"b",name:"B",kind:"Place",x:90,y:50},{id:"river",name:"River",kind:"River",x:50,y:50,width:10,height:80}],routes:[{id:"r",from:"a",to:"b",type:"road",mode:"Walk",duration:"1 day",access:"open",bothWays:true}]});
it("finds one water crossing and follows the moved river",()=>{const map=fixture();const crossing=findCrossings(map);expect(crossing).toHaveLength(1);expect(crossing[0]!.x).toBeGreaterThanOrEqual(45);expect(crossing[0]!.x).toBeLessThanOrEqual(55);map.nodes[2]!.x=60;expect(findCrossings(map)[0]!.id).toBe(crossing[0]!.id);map.nodes[2]!.y=0;map.nodes[2]!.height=10;expect(findCrossings(map)).toHaveLength(0);});
it("preserves the authored bridge and supplies it to context",()=>{const map=fixture(),c=findCrossings(map)[0]!;map.crossings=[{id:c.id,routeId:c.routeId,riverId:c.riverId,type:"bridge"}];const saved=WorldMapSchema.parse(map);expect(crossingSummary(saved)[0]).toContain("bridge");expect(crossingSummary(fixture())[0]).toContain("No established passage");});
it("does not treat a boat route as a road crossing",()=>{const map=fixture();map.routes[0]!.type="boat";expect(findCrossings(map)).toHaveLength(0);});
it("preserves crossing descriptions, schedules and natural passage in AI context",()=>{
 const map=fixture(),c=findCrossings(map)[0]!;
 map.crossings=[{...c,type:"ferry",description:"A cable ferry",schedule:"Dawn and dusk",instructions:"Ask the ferryman for passage",access:"open"}];
 const saved=WorldMapSchema.parse(JSON.parse(JSON.stringify(map)));
 const summary=crossingSummary(saved,"r").join("\n");
 expect(summary).toContain("A cable ferry"); expect(summary).toContain("Dawn and dusk");expect(summary).toContain("Ask the ferryman");
 saved.crossings![0]!.type="none";saved.crossings![0]!.naturalPassage="ford";
 expect(crossingSummary(saved)[0]).toContain("requires wading");
});
