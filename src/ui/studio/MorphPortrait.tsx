import { useEffect, useRef, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { morphLoopStep, renderMorphFrame, type Profile } from "./morphRenderer";

export function MorphPortrait({ characterId, repo, fallback }: { characterId: string; repo: IndexedDBRepository; fallback?: string | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const [poster, setPoster] = useState(fallback);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent).detail === characterId) setRevision(value => value + 1); };
    window.addEventListener("kaampi:morph-saved", changed);
    return () => window.removeEventListener("kaampi:morph-saved", changed);
  }, [characterId]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    setPainted(false);
    setPoster(fallback);
    let disposed = false, visible = false, frame = 0, elapsed = 0, last = 0;
    let profile: Profile | null = null;
    const images: HTMLImageElement[] = [];
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const tick = (time: number) => {
      if (disposed || !profile) return;
      if (last) elapsed += Math.min(time - last, 100);
      last = time;
      // Hold each expression, then smoothly morph to the next, including last → first.
      const { source, target, mix } = morphLoopStep(elapsed, profile.expressions.length);
      renderMorphFrame(element, profile, images, source, target, mix);
      setPainted(true);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      if (!disposed && visible && !document.hidden && !motion?.matches && profile) frame = requestAnimationFrame(tick);
      else setPainted(false);
    };
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; sync(); }) : null;
    observer?.observe(element);
    if (!observer) visible = true;
    document.addEventListener("visibilitychange", sync);
    motion?.addEventListener("change", sync);
    void repo.loadCharacterMorph(characterId).then(async value => {
      const candidate = value as Profile | null;
      if (!candidate?.active || candidate.version !== 1 || !Array.isArray(candidate.expressions) || candidate.expressions.length < 2) return;
      const count = candidate.expressions[0]?.points?.length;
      if (!count || candidate.expressions.some(expression => typeof expression.image !== "string" || !Array.isArray(expression.points) || expression.points.length !== count || expression.points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(coordinate => !Number.isFinite(coordinate))))) return;
      if (!disposed) setPoster(fallback || candidate.expressions[0]?.image);
      await Promise.all(candidate.expressions.map(expression => new Promise<void>((resolve, reject) => {
        const image = new Image(); images.push(image); image.onload = () => resolve(); image.onerror = reject; image.src = expression.image;
      })));
      if (disposed) return;
      profile = candidate; sync();
    }).catch(() => { /* Keep the static portrait if the saved profile cannot be rendered. */ });
    return () => { disposed = true; stop(); observer?.disconnect(); document.removeEventListener("visibilitychange", sync); motion?.removeEventListener("change", sync); images.forEach(image => { image.onload = null; image.onerror = null; }); };
  }, [characterId, repo, fallback, revision]);
  return <span className="studio-list__thumb morph-portrait" aria-hidden="true">
    {poster && <img src={poster} alt="" />}
    <canvas ref={canvas} width={252} height={282} style={{ opacity: painted ? 1 : 0 }} />
  </span>;
}
