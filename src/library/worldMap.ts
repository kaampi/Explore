import { crossingSummary } from "./mapCrossings";
import { z } from "zod";

export const DistanceScaleSchema=z.object({value:z.number().positive(),unit:z.string().min(1).max(30),kmPerUnit:z.number().positive()});
export const WorldMapSchema = z.object({
  distanceScale: DistanceScaleSchema.optional(),
  minutesPerCell: z.number().positive().optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  crossings: z.array(z.object({id:z.string(),routeId:z.string(),riverId:z.string(),type:z.enum(["bridge","ferry","none"])})).optional(),
  mapType: z.enum(["world","settlement","interior"]).optional(),
  nodes: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), kind: z.string(),
    distanceScale: DistanceScaleSchema.optional(),
    minutesPerCell: z.number().positive().optional(),
    shape: z.array(z.object({mode:z.enum(["corner","smooth","free"]).optional(),x:z.number().finite(),y:z.number().finite(),incoming:z.object({x:z.number().finite(),y:z.number().finite()}).optional(),outgoing:z.object({x:z.number().finite(),y:z.number().finite()}).optional()})).min(3).max(200).optional(),
    visibility: z.enum(["visible","arrival","hidden"]).optional(),
    isArea: z.boolean().optional(),
    travelMultiplier: z.number().min(0.1).max(100).optional(),
    passage: z.enum(["normal","difficult","blocked"]).optional(),
    rotation: z.number().finite().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    mapBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    contentType: z.enum(["world","settlement","interior"]).optional(),
    width: z.number().positive().max(90).optional(), height: z.number().positive().max(90).optional(),
    parentId: z.string().optional(), placeId: z.string().optional(),
    x: z.number().min(0).max(100), y: z.number().min(0).max(100),
    description: z.string().default(""), population: z.string().default(""),
    characterIds: z.array(z.string()).default([])
  })),
  routes: z.array(z.object({
    ignoreTerrain: z.boolean().optional(),
    manualTime: z.boolean().optional(),
    speedKmh: z.number().positive().optional(),
    type: z.enum(["road","path","bridge","ferry","boat"]).optional(),
    geometry: z.array(z.object({x:z.number().finite(),y:z.number().finite(),incoming:z.object({x:z.number().finite(),y:z.number().finite()}).optional(),outgoing:z.object({x:z.number().finite(),y:z.number().finite()}).optional()})).min(2).max(200).optional(),
    fromAnchor: z.object({x:z.number().finite(),y:z.number().finite()}).optional(), toAnchor:z.object({x:z.number().finite(),y:z.number().finite()}).optional(),
    id: z.string(), from: z.string(), to: z.string(), mode: z.string(),
    duration: z.string(), access: z.enum(["open","locked","hidden"]), bothWays: z.boolean()
  }))
}).superRefine((map,ctx)=>{
  const ids=new Set(map.nodes.map(n=>n.id));
  if(ids.size!==map.nodes.length)ctx.addIssue({code:"custom",message:"Place IDs must be unique."});
  for(const node of map.nodes){
    if(node.parentId && !ids.has(node.parentId))ctx.addIssue({code:"custom",message:"Parent place does not exist."});
    const seen=new Set([node.id]);let parent=node.parentId;
    while(parent){if(seen.has(parent)){ctx.addIssue({code:"custom",message:"A place cannot contain itself."});break;}seen.add(parent);parent=map.nodes.find(n=>n.id===parent)?.parentId;}
  }
  for(const route of map.routes)if(!ids.has(route.from)||!ids.has(route.to)||route.from===route.to)ctx.addIssue({code:"custom",message:"Routes need two different existing places."});
});
export type WorldMap = z.infer<typeof WorldMapSchema>;
export type MapNode = WorldMap["nodes"][number];
export function mapContext(map: WorldMap | undefined): string {
  if(!map?.nodes.length)return "";
  const name=(id:string)=>map.nodes.find(n=>n.id===id)?.name??id;
  return ["World map (authored geography, not current character positions):",...map.nodes.map(n=>`${n.name} (${n.kind}) is inside ${n.parentId?name(n.parentId):"the world"}. ${n.visibility&&n.visibility!=="visible"?` Player knowledge: ${n.visibility==="arrival"?"discover on arrival":"hidden until explicitly revealed"}. Do not reveal its name, exact location or details to the player before discovery; only appropriate sensory hints when approaching. `:""}${n.description}${n.isArea?` This is a local subarea, not the whole parent. Passage: ${n.passage??"normal"}; travel multiplier: ${n.travelMultiplier??1}.`:""}${n.population?` Usual population, not guaranteed present: ${n.population}.`:""}`),...map.routes.map(r=>`${name(r.from)} ${r.bothWays?"↔":"→"} ${name(r.to)}: ${r.type??"route"}, ${r.mode}; travel time: ${r.duration||"unspecified"}; access: ${r.access}.`),...crossingSummary(map),"Containment alone does not establish a traversable route. Do not assume instant travel or automatic access. Use these facts as context; actual movement must follow the scene."].join("\n");
}
