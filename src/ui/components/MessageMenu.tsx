import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function MessageMenu({ x, y, items, onClose,portalTarget,label='Message actions' }: {
  x: number; y: number; items: { label: string; action: () => void }[]; onClose: () => void;portalTarget?:HTMLElement|undefined;label?:string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const bounds = menu.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)) });
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: Event) => { if (!menu.contains(event.target as Node)) onClose(); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      previous?.focus();
    };
  }, [x, y]);
  return createPortal(<div ref={ref} className="message-context-menu" role="menu" aria-label={label} style={position} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'Tab') { if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}onClose(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(ref.current!.querySelectorAll('button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }}>{items.map(item => <button key={item.label} type="button" role="menuitem" onClick={() => { onClose(); item.action(); }}>{item.label}</button>)}</div>, portalTarget??document.body);
}
