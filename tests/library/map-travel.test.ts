import { expect,it } from "vitest";
import { applyMapScale, rescaleTravelTimes } from "../../src/library/mapTravel";
import type { WorldMap } from "../../src/library/worldMap";
const before:WorldMap={nodes:[{id:"a",name:"A",kind:"Place",x:10,y:10,description:"",population:"",characterIds:[]},{id:"b",name:"B",kind:"Place",x:30,y:10,description:"",population:"",characterIds:[]}],routes:[{id:"r",from:"a",to:"b",mode:"Walk",duration:"2 days",access:"open",bothWays:true}]};
it("scales numeric time with distance from the original layout",()=>{const next={...before,nodes:before.nodes.map(n=>n.id==="b"?{...n,x:50}:n)};expect(rescaleTravelTimes(before,next).routes[0]?.duration).toBe("10 days");});
it("keeps descriptive estimates and doors unchanged",()=>{const next={...before,nodes:before.nodes.map(n=>({...n,x:n.x*2}))};const doors={...before,routes:before.routes.map(r=>({...r,mode:"Door"}))};expect(rescaleTravelTimes(doors,{...next,routes:doors.routes}).routes[0]?.duration).toBe("2 days");const descriptive={...before,routes:before.routes.map(r=>({...r,duration:"Until sunset"}))};expect(rescaleTravelTimes(descriptive,{...next,routes:descriptive.routes}).routes[0]?.duration).toBe("Until sunset");});

it("calculates travel time from the current grid scale",()=>{expect(applyMapScale(before,"",30).routes[0]?.duration).toBe("30 minutes");expect(applyMapScale(before,"different-level",30).routes[0]?.duration).toBe("2 days");});

it("counts two empty grid cells as six days at three days per cell",()=>{
 const map={...before,nodes:before.nodes.map(n=>n.id==="b"?{...n,x:35}:n)};
 expect(applyMapScale(map,"",3*1440).routes[0]?.duration).toBe("6 days");
 const touching={...map,nodes:map.nodes.map(n=>n.id==="b"?{...n,x:25}:n)};
 expect(applyMapScale(touching,"",3*1440).routes[0]?.duration).toBe("0 minutes");
});
