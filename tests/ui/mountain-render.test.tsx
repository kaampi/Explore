import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { MountainTerrain } from '../../src/ui/studio/MountainTerrain';
import type { MapNode } from '../../src/library/worldMap';
it('renders a long mountain painting as three height surfaces instead of hundreds of circles',()=>{
 const node:MapNode={id:'mountain',kind:'Mountain',name:'Mountain',x:50,y:50,description:'',population:'',characterIds:[],brush:Array.from({length:500},(_,i)=>({x:300+i%80,y:200+i%60,radius:25,erase:false,height:(i%3+1) as 1|2|3}))};
 const markup=renderToStaticMarkup(<svg><MountainTerrain node={node} detailScale={1}/></svg>);
 expect((markup.match(/<path /g)??[]).length).toBe(3);
 expect(markup).not.toContain('<circle');
});
it('cuts high terrain and mountain silhouettes out of forest masks without masking low hills',()=>{
 const base:MapNode={id:'m',kind:'Mountain',name:'Mountain',x:50,y:50,description:'',population:'',characterIds:[]};
 const low={...base,mountainFinalized:true,brush:[{x:400,y:300,radius:80,erase:false,height:1}]};
 const high={...low,brush:[{x:400,y:300,radius:80,erase:false,height:3}]};
 const lowMask=renderToStaticMarkup(<svg><MountainTerrain node={low} detailScale={1} silhouette/></svg>);
 const highMask=renderToStaticMarkup(<svg><MountainTerrain node={high} detailScale={1} silhouette/></svg>);
 expect(lowMask).toContain('d=""');
 expect((highMask.match(/fill="black"/g)??[]).length).toBeGreaterThan(1);
 expect(highMask).not.toContain('#f4f3e9');
});
it('preserves every mountain silhouette and its forest mask across zoom levels',()=>{
 const node:MapNode={id:'m',kind:'Mountain',name:'Mountain',x:50,y:50,description:'',population:'',characterIds:[],mountainFinalized:true,brush:[{x:400,y:300,radius:130,erase:false,height:2},{x:400,y:300,radius:45,erase:false,height:3}]};
 const render=(scale:number,silhouette=false)=>renderToStaticMarkup(<svg><MountainTerrain node={node} detailScale={scale} silhouette={silhouette}/></svg>);
 const outlines=(html:string)=>html.match(/<path[^>]+stroke-width="1.1"[^>]*>/g);
 expect(outlines(render(.5))).toEqual(outlines(render(3)));
 expect(render(.5,true)).toEqual(render(3,true));
});
