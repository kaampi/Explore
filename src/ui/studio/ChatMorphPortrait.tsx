import { useEffect, useRef, useState } from "react";
import { renderMorphFrame } from "./morphRenderer";
import type { ChatExpression } from "./useChatExpressions";

export function ChatMorphPortrait({ value, fallback, className }: { value: ChatExpression; fallback?: string | undefined; className: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [painted, setPainted] = useState(false);
  const displayed = useRef<string | null>(null);
  const imageSources = value.profile.expressions.map(item => item.image).join("\n");
  useEffect(() => {
    let cancelled = false;
    setPainted(false); setImages([]);
    const loaded = value.profile.expressions.map(item => { const image = new Image(); image.src = item.image; return image; });
    void Promise.all(loaded.map(image => image.decode())).then(() => { if (!cancelled) setImages(loaded); }).catch(() => {});
    return () => { cancelled = true; };
  }, [imageSources]);
  useEffect(() => {
    const element = canvas.current, profile = value.profile;
    if (!element || images.length !== profile.expressions.length) return;
    const target = profile.expressions.findIndex(item => item.name === value.expression);
    if (target < 0) return;
    let source = profile.expressions.findIndex(item => item.name === displayed.current);
    if (source < 0) source = Math.max(0, profile.expressions.findIndex(item => item.name.toLowerCase() === "neutral"));
    const duration = Math.max(300, Math.min(6000, profile.morphDurations?.[JSON.stringify([profile.expressions[source]!.name, value.expression])] ?? 1800));
    let frame = 0, start: number | null = null;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = reduced || source === target ? 1 : Math.min(1, (now - start) / duration);
      renderMorphFrame(element, profile, images, source, target, t * t * (3 - 2 * t));
      setPainted(true);
      if (t < 1) frame = requestAnimationFrame(tick);
      else displayed.current = value.expression;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [images, value]);
  return <span className={`${className} morph-portrait`} title={value.expression} aria-hidden="true" style={{display:"inline-block",flexShrink:0}}>
    {fallback && <img src={fallback} alt=""/>}
    <canvas ref={canvas} width={252} height={282} style={{opacity:painted?1:0}}/>
  </span>;
}
