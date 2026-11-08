import { crossingSummary } from "./mapCrossings";
import { z } from "zod";

export const EncounterSchema=z.object({frequency:z.enum(["never","rarely","sometimes","often"]),participants:z.string().default(""),tone:z.string().default("")});
function encounterText(value:z.infer<typeof EncounterSchema>|undefined){return value?` Encounter setup: ${value.frequency}; possible participants: ${value.participants||"unspecified"}; tone: ${value.tone||"unspecified"}. This is authored setup, not an encounter that has already happened. Do not introduce new arrivals every message.`:"";}
export const DistanceScaleSchema=z.object({value:z.number().positive(),unit:z.string().min(1).max(30),kmPerUnit:z.number().positive()});
export const WorldMapSchema = z.object({
  distanceScale: DistanceScaleSchema.optional(),
  minutesPerCell: z.number().positive().optional(),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  crossings: z.array(z.object({id:z.string(),routeId:z.string(),riverId:z.string(),type:z.enum(["bridge","ferry","none"]),
    description:z.string().optional(), instructions:z.string().optional(), schedule:z.string().optional(),
    access:z.enum(["open","blocked"]).optional(), naturalPassage:z.enum(["blocked","ford","swim"]).optional()
  })).optional(),
  mapType: z.enum(["world","settlement","interior"]).optional(),
  nodes: z.array(z.object({
    blueprintId:z.string().optional(),
    symbol:z.enum(["marker","cottage","longhouse","townhouse","inn"]).optional(),
    isJunction: z.boolean().optional(),
    mountainFinalized: z.boolean().optional(),
    brush: z.array(z.object({x:z.number().min(0).max(800),y:z.number().min(0).max(600),radius:z.number().min(2).max(150),erase:z.boolean(),height:z.number().int().min(1).max(3).optional()})).max(30000).optional(),
    id: z.string().min(1), name: z.string().min(1), kind: z.string(),
    distanceScale: DistanceScaleSchema.optional(),
    minutesPerCell: z.number().positive().optional(),
    shape: z.array(z.object({mode:z.enum(["corner","smooth","free"]).optional(),x:z.number().finite(),y:z.number().finite(),incoming:z.object({x:z.number().finite(),y:z.number().finite()}).optional(),outgoing:z.object({x:z.number().finite(),y:z.number().finite()}).optional()})).min(3).max(200).optional(),
    images:z.array(z.string()).optional(),
    intro:z.string().optional(), instructions:z.string().optional(), imageDataUrl:z.string().optional(), audioDataUrl:z.string().optional(), lighting:z.string().optional(), noise:z.string().optional(),
    encounter: EncounterSchema.optional(),
    visibility: z.enum(["visible","arrival","hidden"]).optional(),
    isArea: z.boolean().optional(),
    travelMultiplier: z.number().min(0.1).max(100).optional(),
    passage: z.enum(["normal","difficult","blocked"]).optional(),
    rotation: z.number().finite().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    mapBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    hasMap: z.boolean().optional(),
    contentType: z.enum(["world","settlement","interior"]).optional(),
    width: z.number().positive().max(90).optional(), height: z.number().positive().max(90).optional(),
    parentId: z.string().optional(), placeId: z.string().optional(),
    x: z.number().min(0).max(100), y: z.number().min(0).max(100),
    description: z.string().default(""), population: z.string().default(""),
    factionIds: z.array(z.string().min(1)).optional(),
    characterIds: z.array(z.string()).default([])
  })),
  routes: z.array(z.object({
    areaIds:z.array(z.string()).optional(),
    description: z.string().optional(),
    instructions: z.string().optional(),
    encounter: EncounterSchema.optional(),
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
  return ["World map (authored geography, not current character positions):",...map.nodes.map(n=>`${n.name} (${n.kind}) is inside ${n.parentId?name(n.parentId):"the world"}. ${n.visibility&&n.visibility!=="visible"?` Player knowledge: ${n.visibility==="arrival"?"discover on arrival":"hidden until explicitly revealed"}. Do not reveal its name, exact location or details to the player before discovery; only appropriate sensory hints when approaching. `:""}${n.brush?` Painted ${n.kind.toLowerCase()} terrain near map position ${n.x.toFixed(1)}, ${n.y.toFixed(1)} (0–100 coordinates); approximate bounding size ${(n.width??0).toFixed(1)} by ${(n.height??0).toFixed(1)}. The painted footprint, not its bounding rectangle, defines the area. Erased gaps are underlying terrain, not automatically named clearings. `:""}${n.isJunction?` Route position: ${n.x.toFixed(2)}, ${n.y.toFixed(2)} on the containing map. `:""}${n.description}${encounterText(n.encounter)}${n.instructions?` Instructions: ${n.instructions}`:""}${n.characterIds.length?` Associated library character IDs (not current presence): ${n.characterIds.join(", ")}.`:""}${n.isArea?` This is a local subarea, not the whole parent. Passage: ${n.passage??"normal"}; travel multiplier: ${n.travelMultiplier??1}.`:""}${n.population?` Usual population, not guaranteed present: ${n.population}.`:""}`),...map.routes.map(r=>`${name(r.from)} ${r.bothWays?"↔":"→"} ${name(r.to)}: ${r.type??"route"}, ${r.mode}; travel time: ${r.duration||"unspecified"}; access: ${r.access}.${r.description?` Route surroundings: ${r.description}.`:""}${r.instructions?` Route instructions: ${r.instructions}.`:""}${r.areaIds?.length?` Passes through: ${r.areaIds.map(name).join(", ")}. Entry and exit are distinct geographic positions; do not treat the area as a single arrival point.`:""}${encounterText(r.encounter)}`),...crossingSummary(map),"Containment alone does not establish a traversable route. Do not assume instant travel or automatic access. Use these facts as context; actual movement must follow the scene."].join("\n");
}
