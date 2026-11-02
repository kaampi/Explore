import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MENU_OPEN = "explore:map-context-menu-open";

/** One screen-sized menu system for canvas, shape nodes, routes and crossings. */
export function MapContextMenu({anchor,scope,onClose,children}: {
  anchor:{x:number;y:number};scope?:Element|null;onClose:()=>void;children:ReactNode;
}) {
  const id=useId(),menu=useRef<HTMLDivElement>(null),close=useRef(onClose);
  close.current=onClose;
  const [position,setPosition]=useState(anchor);
  useLayoutEffect(()=>{
    const element=menu.current;if(!element)return;
    const rect=element.getBoundingClientRect();
    setPosition({x:Math.max(8,Math.min(anchor.x,window.innerWidth-rect.width-8)),y:Math.max(8,Math.min(anchor.y,window.innerHeight-rect.height-8))});
  },[anchor.x,anchor.y,children]);
  useLayoutEffect(()=>{
    const previous=document.activeElement;
    window.dispatchEvent(new CustomEvent(MENU_OPEN,{detail:id}));
    const outside=(event:Event)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))close.current();};
    const other=(event:Event)=>{if((event as CustomEvent<string>).detail!==id)close.current();};
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        event.preventDefault();event.stopPropagation();close.current();
        if(previous instanceof HTMLElement||previous instanceof SVGElement)previous.focus();
      } else if(event.key==="Tab")close.current();
    };
    const resize=()=>close.current();
    window.addEventListener("pointerdown",outside,true);
    window.addEventListener("contextmenu",outside,true);
    window.addEventListener(MENU_OPEN,other);
    window.addEventListener("keydown",key,true);
    window.addEventListener("resize",resize);
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return()=>{
      window.removeEventListener("pointerdown",outside,true);
      window.removeEventListener("contextmenu",outside,true);
      window.removeEventListener(MENU_OPEN,other);
      window.removeEventListener("keydown",key,true);
      window.removeEventListener("resize",resize);
    };
  },[id]);
  const host=scope?.closest(".world-map")??scope?.closest("dialog")??document.body;
  return createPortal(<div ref={menu} role="menu" className="world-map__floating-menu" style={{left:position.x,top:position.y,maxHeight:"calc(100vh - 16px)",overflowY:"auto"}}
    onContextMenu={event=>{event.preventDefault();event.stopPropagation();}}
    onPointerDown={event=>event.stopPropagation()} onClick={event=>{
      event.stopPropagation();
      if(event.target instanceof Element&&event.target.closest("button:not(:disabled)"))close.current();
    }} onKeyDown={event=>{
      if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
      const buttons=Array.from(menu.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)")??[]);
      if(!buttons.length)return;
      event.preventDefault();event.stopPropagation();
      const current=buttons.indexOf(document.activeElement as HTMLElement);
      const index=event.key==="Home"?0:event.key==="End"?buttons.length-1:(current+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length;
      buttons[index]?.focus();
    }}>{children}</div>,host);
}
