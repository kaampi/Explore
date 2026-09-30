import { useEffect, useId, useRef } from "react";
import { percentileNotation } from "../../checks/CheckEngine";
import type { DiceSound } from "../diceSound";

export function DiceTray({ roll, sound, onSettled }: {
  roll: number; sound: DiceSound | null; onSettled: (fallback: boolean) => void;
}) {
  const id = `dice-${useId().replace(/:/g, "")}`;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    let box: import("@3d-dice/dice-box-threejs").default | undefined;
    let initialized = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = (fallback: boolean) => {
      if (cancelled || finished) return;
      finished = true;
      window.clearTimeout(watchdog);
      onSettledRef.current(fallback);
    };
    const watchdog = window.setTimeout(() => finish(true), 12000);
    const resize = () => {
      if (!initialized || !box || !host || cancelled) return;
      box.setDimensions({ x: host.clientWidth, y: host.clientHeight });
    };
    const observer = new ResizeObserver(resize);
    const host = document.getElementById(id);
    if (host) observer.observe(host);
    async function animate() {
      if (reducedMotion) { finish(true); return; }
      try {
        const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
        if (cancelled) return;
        box = new DiceBox(`#${id}`, {
          sounds: false, shadows: true, theme_colorset: "white",
          theme_texture: "none", theme_material: "plastic", baseScale: 65,
          theme_customColorset: {
            name: "sandbox", foreground: "#f6e8c9", background: "#705934",
            outline: "#352714", texture: "none", material: "plastic"
          }
        });
        // Its resizeWorld registers an anonymous global listener with no
        // removal API. Own resizing locally so repeated checks don't leak it.
        box.resizeWorld = () => {};
        const audioBox = box;
        box.eventCollide = ({ body, target }) => {
          // Skip the invisible simulation used to predetermine faces.
          if (audioBox.animstate !== "throw" || !body || !target) return;
          const diceCollision = body.mass > 0;
          sound?.hit(diceCollision ? body.velocity.length() : target.velocity.length(), diceCollision);
        };
        await box.initialize();
        if (cancelled) return;
        initialized = true;
        await box.roll(percentileNotation(roll));
        finish(false);
      } catch {
        finish(true); // WebGL failure never changes or rerolls the engine's result.
      }
    }
    void animate();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      observer.disconnect();
      if (box) {
        const oldBox = box;
        oldBox.running = false;
        oldBox.rolling = false;
        // The package has no destroy API. Allow its pending frame to stop,
        // then release GPU resources instead of retaining a canvas per check.
        window.setTimeout(() => {
          oldBox.scene.traverse((object) => {
            object.geometry?.dispose();
            const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            materials.forEach((material) => material.dispose());
          });
          oldBox.renderer?.dispose();
          oldBox.renderer?.forceContextLoss();
        }, 200);
      }
    };
  }, [id, roll, sound]);

  return <div id={id} className="action-check__tray" aria-label="Percentile dice: tens and units" />;
}
