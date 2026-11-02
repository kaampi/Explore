import { describe,it,expect } from 'vitest';
import { brushContains,brushBounds,brushHeight,smoothBrushPath } from '../../src/library/forestBrush';
import { WorldMapSchema,mapContext,type MapNode } from '../../src/library/worldMap';
const forest:MapNode={id:'forest',name:'Pine forest',kind:'Forest',x:50,y:50,description:'',population:'',characterIds:[],brush:[{x:400,y:300,radius:100,erase:false},{x:400,y:300,radius:30,erase:true}]};
describe('painted forest geography',()=>{
 it('smooths lake shores while retaining an island and caching the contour',()=>{
  const lake={...forest,kind:'Lake'};
  const path=smoothBrushPath(lake);
  expect(path).toContain('Q');
  expect(path.match(/M/g)).toHaveLength(2);
  expect(path).not.toMatch(/NaN|Infinity/);
  expect(smoothBrushPath(lake)).toBe(path);
  expect(brushContains(lake,400,300)).toBe(false);
 });
 it('preserves mountain heights and finalization through saving, repainting and erasing',()=>{
  const mountain:MapNode={...forest,kind:'Mountain',mountainFinalized:true,brush:[{x:400,y:300,radius:90,erase:false,height:1},{x:400,y:300,radius:35,erase:false,height:3},{x:400,y:300,radius:10,erase:true}]};
  const saved=WorldMapSchema.parse(JSON.parse(JSON.stringify({nodes:[mountain],routes:[]}))).nodes[0]!;
  expect(saved.mountainFinalized).toBe(true);
  expect(brushHeight(saved,400,300)).toBe(0);
  expect(brushHeight(saved,420,300)).toBe(3);
  expect(brushContains(saved,420,300)).toBe(true);
  expect(brushHeight(saved,460,300)).toBe(1);
 });
 it('preserves painted terrain and erased openings across schema serialization',()=>{
  const map=WorldMapSchema.parse(JSON.parse(JSON.stringify({nodes:[forest],routes:[]})));
  expect(brushContains(map.nodes[0]!,400,300)).toBe(false);
  expect(brushContains(map.nodes[0]!,450,300)).toBe(true);
  expect(brushContains(map.nodes[0]!,550,300)).toBe(false);
 });
 it('allows repainting erased terrain without changing another forest',()=>{
  const repainted={...forest,brush:[...forest.brush!,{x:400,y:300,radius:15,erase:false}]};
  expect(brushContains(repainted,400,300)).toBe(true);
  expect(brushContains(forest,400,300)).toBe(false);
  expect(brushBounds(forest)).toMatchObject({x:50,y:50});
 });
 it('keeps an authored clearing distinct from erased terrain in AI context',()=>{
  const clearing:MapNode={...forest,id:'clearing',name:'Camp clearing',kind:'Clearing',parentId:'forest',isArea:true,description:'A sheltered camp.'};
  const map=WorldMapSchema.parse({nodes:[forest,clearing],routes:[]});
  expect(mapContext(map)).toContain('Camp clearing (Clearing) is inside Pine forest');
  expect(mapContext(map)).toContain('not automatically named clearings');
 });
});
