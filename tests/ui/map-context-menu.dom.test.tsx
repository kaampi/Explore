// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { MapContextMenu } from "../../src/ui/studio/MapContextMenu";
import { ShapeEditor } from "../../src/ui/studio/ShapeEditor";
import { RouteDrawing } from "../../src/ui/studio/RouteDrawing";
import type { ShapePoint } from "../../src/library/mapShapes";

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const roots:Array<{root:ReturnType<typeof createRoot>;element:HTMLElement}>=[];
afterEach(async()=>{for(const {root,element} of roots.splice(0)){await act(async()=>root.unmount());element.remove();}});
async function mount(view:React.ReactNode){const element=document.createElement("div");document.body.append(element);const root=createRoot(element);roots.push({root,element});await act(async()=>root.render(view));return element;}
async function rightClick(element:Element){await act(async()=>{element.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:250,clientY:150}));});}

function Harness(){
 const scope=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false);
 const [shape,setShape]=useState<ShapePoint[]|undefined>();
 const [route,setRoute]=useState<ShapePoint[]>([{x:10,y:20},{x:40,y:40},{x:80,y:20}]);
 return <div className="world-map" ref={scope}>
  <button data-open onClick={()=>setOpen(true)}>Open place menu</button><input aria-label="Outside menu"/>
  <svg><ShapeEditor node={{id:"shape",name:"Forest",kind:"Forest",x:30,y:30,width:20,height:20,description:"",population:"",characterIds:[],...(shape?{shape}: {})}} active movable pending={false} onChange={setShape} onStart={()=>{}} onFinish={()=>{}} onMove={()=>{}} onSelect={()=>{}}/>
    <RouteDrawing points={route} active type="road" label="Test route" onSelect={()=>{}} onChange={setRoute}/>
  </svg>
  {open&&<MapContextMenu anchor={{x:250,y:150}} scope={scope.current} onClose={()=>setOpen(false)}><button role="menuitem">Edit shape</button><label>Color<input type="color" aria-label="Menu color"/></label><button role="menuitem">Delete</button></MapContextMenu>}
 </div>;
}

it("closes on outside pointerdown, Escape and Cancel",async()=>{
 const el=await mount(<Harness/>),node=el.querySelector("svg rect")!;
 await rightClick(node);expect(el.querySelector('[role="menu"]')).toBeTruthy();
 await act(async()=>{el.querySelector('input[aria-label="Outside menu"]')!.dispatchEvent(new Event("pointerdown",{bubbles:true}));});
 expect(el.querySelector('[role="menu"]')).toBeNull();
 await rightClick(node);
 const escape=new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true});
 await act(async()=>{document.activeElement!.dispatchEvent(escape);});
 expect(escape.defaultPrevented).toBe(true);expect(el.querySelector('[role="menu"]')).toBeNull();
 await rightClick(node);
 await act(async()=>{Array.from(el.querySelectorAll('[role="menu"] button')).find(b=>b.textContent==="Cancel")!.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
 expect(el.querySelector('[role="menu"]')).toBeNull();
});

it("keeps only one menu open across shapes, routes and place menus",async()=>{
 const el=await mount(<Harness/>);
 await rightClick(el.querySelector("svg rect")!);
 const route=el.querySelector('[aria-label="Test route"]')!.parentElement!;
 await rightClick(route.querySelectorAll("circle")[2]!);
 expect(el.querySelectorAll('[role="menu"]')).toHaveLength(1);
 expect(el.querySelector('[role="menu"]')!.textContent).toContain("Make Free");
 await act(async()=>{(el.querySelector('[data-open]') as HTMLButtonElement).click();});
 expect(el.querySelectorAll('[role="menu"]')).toHaveLength(1);
 expect(el.querySelector('[role="menu"]')!.textContent).toContain("Edit shape");
});

it("uses the same screen-space menu style and never shows a node toolbar",async()=>{
 const el=await mount(<Harness/>);
 await rightClick(el.querySelector("svg rect")!);
 const menu=el.querySelector('[role="menu"]')!;
 expect(menu.className).toBe("world-map__floating-menu");expect(menu.closest("svg")).toBeNull();
 expect((menu as HTMLElement).style.left).toBe("250px");
 await act(async()=>{Array.from(menu.querySelectorAll("button")).find(b=>b.textContent==="Make Smooth")!.click();});
 expect(el.querySelector('[role="menu"]')).toBeNull();expect(el.querySelector("foreignObject")).toBeNull();
 const route=el.querySelector('[aria-label="Test route"]')!.parentElement!;
 await rightClick(route.querySelectorAll("circle")[2]!);
 await act(async()=>{Array.from(el.querySelectorAll('[role="menu"] button')).find(b=>b.textContent==="Make Smooth")!.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
 expect(el.querySelector('[role="menu"]')).toBeNull();expect(el.querySelector("foreignObject")).toBeNull();
});

it("keeps color controls usable, closes after commands and supports menu navigation",async()=>{
 const el=await mount(<Harness/>);
 await act(async()=>{(el.querySelector('[data-open]') as HTMLButtonElement).click();});
 const color=el.querySelector('[aria-label="Menu color"]')!;
 await act(async()=>{color.dispatchEvent(new Event("pointerdown",{bubbles:true}));color.dispatchEvent(new MouseEvent("click",{bubbles:true}));});
 expect(el.querySelector('[role="menu"]')).toBeTruthy();
 const menu=el.querySelector('[role="menu"]')!;
 await act(async()=>{menu.dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true,cancelable:true}));});
 expect(document.activeElement?.textContent).toBe("Delete");
 await act(async()=>{(document.activeElement as HTMLButtonElement).click();});
 expect(el.querySelector('[role="menu"]')).toBeNull();
});
