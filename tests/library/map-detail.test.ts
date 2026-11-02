import { expect,it } from 'vitest';
import { treeDetailOpacity,mapLabelIds } from '../../src/ui/studio/mapDetail';
import type { MapNode } from '../../src/library/worldMap';
it('reveals stable nested subsets of trees as scale increases',()=>{
 for(let i=0;i<100;i++){
  const rank=i/100;
  expect(treeDetailOpacity(rank,.5)).toBeLessThanOrEqual(treeDetailOpacity(rank,1));
  expect(treeDetailOpacity(rank,1)).toBeLessThanOrEqual(treeDetailOpacity(rank,2));
 }
});
it('keeps selected labels, prioritizes settlements, and avoids overlapping names',()=>{
 const base:MapNode={id:'a',name:'Small clearing',kind:'Clearing',x:50,y:50,description:'',population:'',characterIds:[]};
 const city={...base,id:'b',name:'City',kind:'Settlement'};
 expect([...mapLabelIds([base,city],.5,'')]).toEqual(['b']);
 expect(mapLabelIds([base,city],.5,'a').has('a')).toBe(true);
 expect(mapLabelIds([base,city],1,'').size).toBe(1);
});
