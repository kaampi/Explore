import type { MapNode, WorldMap } from "./worldMap";
export type MapType = "world" | "settlement" | "interior";
export function generateMap(type:MapType,parentId?:string,random= Math.random):WorldMap {
  const names=type==="world"?["Northern forest","River valley","Hill town","Coastal city","Mountain pass"]:type==="settlement"?["Square","House","Workshop","Meeting hall","Storehouse","House"]:["Entrance","Main room","Side room","Storage"];
  const nodes=names.map((name,i):MapNode=>{
    const id=crypto.randomUUID();
    const interior=type==="interior";
    const x=interior?30+(i%2)*40:15+(i%3)*33+random()*5;
    const y=interior?32+Math.floor(i/2)*35:22+Math.floor(i/3)*46+random()*6;
    return {id,placeId:id,name,kind:interior?"Room":type==="settlement"?(i?"Building":"Square"):(i===2||i===3?"Settlement":"Region"),x,y,description:"",population:"",characterIds:[],...(parentId?{parentId}:{}),...(interior?{width:40,height:35}:{}),...(!interior?{contentType:type==="settlement"&&i>0?"interior" as const:i===2||i===3?"settlement" as const:"world" as const}:{})};
  });
  const pairs=type==="interior"?[[0,1],[0,2],[2,3],...(random()>.5?[[1,3]]:[])]:nodes.slice(1).map((_,i)=>[i,i+1]);
  const routes=pairs.map(([a,b])=>({id:crypto.randomUUID(),from:nodes[a!]!.id,to:nodes[b!]!.id,mode:type==="interior"?"Door":"Walk",duration:type==="world"?`${1+Math.floor(random()*6)} days`:type==="interior"?"A few steps":"5 minutes",access:"open" as const,bothWays:true}));
  return {nodes,routes};
}
