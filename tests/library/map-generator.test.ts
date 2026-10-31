import { describe,it,expect } from "vitest";
import { generateMap } from "../../src/library/mapGenerator";
import { WorldMapSchema } from "../../src/library/worldMap";
describe("scale-specific maps",()=>{
 it("generates regions and settlements on a world map",()=>{const map=generateMap("world",undefined,()=>.5);expect(map.nodes.some(n=>n.kind==="Settlement")).toBe(true);expect(map.nodes.some(n=>n.kind==="Room")).toBe(false);expect(map.routes.every(r=>r.duration.includes("days"))).toBe(true);expect(WorldMapSchema.safeParse(map).success).toBe(true);});
 it("makes buildings at settlement scale",()=>{const map=generateMap("settlement","town",()=>.5);expect(map.nodes.filter(n=>n.kind==="Building").every(n=>n.contentType==="interior")).toBe(true);expect(map.nodes.every(n=>n.parentId==="town")).toBe(true);});
 it("connects adjacent rooms sharing walls, not distant nodes",()=>{const map=generateMap("interior",undefined,()=>.8);expect(WorldMapSchema.safeParse(map).success).toBe(true);for(const route of map.routes){const a=map.nodes.find(n=>n.id===route.from)!,b=map.nodes.find(n=>n.id===route.to)!;expect((a.x===b.x&&Math.abs(a.y-b.y)===(a.height!+b.height!)/2)||(a.y===b.y&&Math.abs(a.x-b.x)===(a.width!+b.width!)/2)).toBe(true);}expect(map.nodes.every(n=>n.kind==="Room")).toBe(true);});
});
