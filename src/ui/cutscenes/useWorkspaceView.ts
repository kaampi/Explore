import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react";

const origin = { zoom: 1, x: 0, y: 0 };
const previewMaxZoom = 8;

function constrain(view: typeof origin, width: number, height: number) {
  return {
    zoom: view.zoom,
    x: Math.max(width * (1 - view.zoom), Math.min(0, view.x)),
    y: Math.max(height * (1 - view.zoom), Math.min(0, view.y)),
  };
}

export function useWorkspaceView(horizontal = false, maxZoom = previewMaxZoom) {
  const [view, setView] = useState(origin);
  const viewport = useRef<HTMLDivElement>(null);
  const space = useRef(false);
  const gesture = useRef<{
    pointer: number;
    mode: "zoom" | "pan";
    clientX: number;
    clientY: number;
    anchorX: number;
    anchorY: number;
    view: typeof origin;
  }>();
  const [mode, setMode] = useState<"zoom" | "pan">();

  const zoomAt = useCallback(
    (zoom: number, before: typeof origin, x: number, y: number) => {
      const factor = zoom / before.zoom;
      const surface = viewport.current;
      if (!surface) return before;
      return constrain(
        { zoom, x: x - (x - before.x) * factor, y: y - (y - before.y) * factor },
        surface.clientWidth,
        horizontal ? 0 : surface.clientHeight,
      );
    },
    [horizontal],
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      space.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") space.current = false;
    };
    const blur = () => {
      space.current = false;
      gesture.current = undefined;
      setMode(undefined);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const surface = viewport.current;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !surface) return;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
      if (!event.deltaY) return;
      event.preventDefault();
      if (gesture.current) return;
      const x = event.clientX - surface.getBoundingClientRect().left - surface.clientLeft;
      const factor = 2 ** ((-event.deltaY * units) / 240);
      setView((before) =>
        zoomAt(Math.min(maxZoom, Math.max(1, before.zoom * factor)), before, x, 0),
      );
    };
    if (horizontal) surface?.addEventListener("wheel", wheel, { passive: false });
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(([entry]) => {
            if (!entry) return;
            const { width, height } = entry.contentRect;
            setView((before) => constrain(before, width, horizontal ? 0 : height));
          });
    if (surface) observer?.observe(surface);
    return () => {
      surface?.removeEventListener("wheel", wheel);
      observer?.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [horizontal, maxZoom, zoomAt]);

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = undefined;
    setMode(undefined);
  };
  return {
    view,
    maxZoom,
    mode,
    reset: () => setView(origin),
    zoomBy: (factor: number) => {
      const surface = viewport.current;
      if (surface)
        setView((before) =>
          zoomAt(
            Math.min(maxZoom, Math.max(1, before.zoom * factor)),
            before,
            surface.clientWidth / 2,
            surface.clientHeight / 2,
          ),
        );
    },
    bind: {
      ref: viewport,
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget || view.zoom === 1) return;
        const axis =
          event.key === "ArrowLeft"
            ? [1, 0]
            : event.key === "ArrowRight"
              ? [-1, 0]
              : event.key === "ArrowUp" && !horizontal
                ? [0, 1]
                : event.key === "ArrowDown" && !horizontal
                  ? [0, -1]
                  : undefined;
        if (!axis) return;
        event.preventDefault();
        const { clientWidth, clientHeight } = event.currentTarget;
        setView((before) =>
          constrain(
            {
              zoom: before.zoom,
              x: before.x + (axis[0]! * clientWidth) / 8,
              y: before.y + (axis[1]! * clientHeight) / 8,
            },
            clientWidth,
            horizontal ? 0 : clientHeight,
          ),
        );
      },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        const nextMode = event.ctrlKey
          ? "zoom"
          : space.current && view.zoom > 1
            ? "pan"
            : undefined;
        if (!nextMode) return;
        const surface = event.currentTarget;
        const rect = surface.getBoundingClientRect();
        gesture.current = {
          pointer: event.pointerId,
          mode: nextMode,
          clientX: event.clientX,
          clientY: event.clientY,
          anchorX: event.clientX - rect.left,
          anchorY: event.clientY - rect.top,
          view,
        };
        surface.setPointerCapture(event.pointerId);
        setMode(nextMode);
        event.preventDefault();
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const start = gesture.current;
        if (!start || start.pointer !== event.pointerId) return;
        const dx = event.clientX - start.clientX;
        const dy = event.clientY - start.clientY;
        const surface = event.currentTarget;
        setView(
          start.mode === "zoom"
            ? zoomAt(
                Math.min(maxZoom, Math.max(1, start.view.zoom * 2 ** (-dy / 120))),
                start.view,
                start.anchorX,
                start.anchorY,
              )
            : constrain(
                { zoom: start.view.zoom, x: start.view.x + dx, y: start.view.y + dy },
                surface.clientWidth,
                horizontal ? 0 : surface.clientHeight,
              ),
        );
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.ctrlKey) event.preventDefault();
      },
    },
  };
}
