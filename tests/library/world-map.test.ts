import { describe, expect, it } from "vitest";
import { WorldMapSchema, mapContext, type MapNode } from "../../src/library/worldMap";
import { newRealmTemplate, parseRealmTemplate } from "../../src/library/LibrarySchema";
import { realmPlayFields } from "../../src/session/campaignStart";
const node=(id:string,parentId?:string):MapNode=>({id,name:id,kind:"Place",x:50,y:50,description:"",population:"",characterIds:[],...(parentId?{parentId}:{})});
describe("world map geography",()=>{
 it("accepts nested worlds and preserves them through library parsing",()=>{const world=newRealmTemplate({name:"World",note:"",source:"player",worldMap:{nodes:[node("village"),node("house","village"),node("room","house")],routes:[]}});expect(parseRealmTemplate(world).worldMap?.nodes).toHaveLength(3);});
 it("rejects cycles and missing parents",()=>{expect(WorldMapSchema.safeParse({nodes:[node("a","b"),node("b","a")],routes:[]}).success).toBe(false);expect(WorldMapSchema.safeParse({nodes:[node("a","missing")],routes:[]}).success).toBe(false);});
 it("rejects dangling routes",()=>{expect(WorldMapSchema.safeParse({nodes:[node("a")],routes:[{id:"r",from:"a",to:"missing",mode:"Walk",duration:"1 day",access:"open",bothWays:true}]}).success).toBe(false);});
 it("passes containment, travel time and access to new scene context",()=>{const map={nodes:[node("village"),node("mine")],routes:[{id:"r",from:"village",to:"mine",mode:"Walk",duration:"2 days",access:"locked" as const,bothWays:true}]};const world=newRealmTemplate({name:"World",note:"Background",source:"player",worldMap:map});const brief=realmPlayFields(world).realmBrief;expect(brief).toContain("2 days");expect(brief).toContain("access: locked");expect(brief).toContain("Background");expect(mapContext(map)).toContain("Containment alone does not establish");});
});
