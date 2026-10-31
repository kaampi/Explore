import { expect,it } from "vitest";
import { WorldMapSchema } from "../../src/library/worldMap";
import { knownMapNodes } from "../../src/library/mapVisibility";
const fixture=()=>WorldMapSchema.parse({nodes:[{id:"forest",name:"Forest",kind:"Forest",x:50,y:50},{id:"clearing",name:"Secret clearing",kind:"Clearing",parentId:"forest",visibility:"arrival",x:50,y:50},{id:"cave",name:"Cave",kind:"Point of Interest",parentId:"clearing",visibility:"hidden",x:50,y:50}],routes:[]});
it("hides unknown places and descendants until discovered",()=>{const map=fixture();expect(knownMapNodes(map,new Set()).map(n=>n.id)).toEqual(["forest"]);expect(knownMapNodes(map,new Set(["clearing"])).map(n=>n.id)).toEqual(["forest","clearing"]);expect(knownMapNodes(map,new Set(["clearing","cave"]))).toHaveLength(3);});
it("does not leak a revealed child through an unknown parent",()=>{expect(knownMapNodes(fixture(),new Set(["cave"])).map(n=>n.id)).toEqual(["forest"]);});
