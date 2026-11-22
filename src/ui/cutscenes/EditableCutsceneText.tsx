import { useRef, useState, type PointerEvent } from "react";
import { MIN_TEXT_BOX_WIDTH, type TextBox, type TextCell } from "../../cutscenes/schema";
import { useTranslate } from "../i18n/LanguageProvider";
import { CutsceneTextLayout } from "./TextEffects";

const controls = [
  { edge: "move", label: "csMoveTextBox" },
  { edge: "left", label: "csResizeTextLeft" },
  { edge: "right", label: "csResizeTextRight" },
] as const;

type Edge = (typeof controls)[number]["edge"];
type Geometry = { box: TextBox; width: number; verticalTravel: number };
type Drag = Geometry & { edge: Edge; pointerId: number; clientX: number; clientY: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

function measure(control: HTMLButtonElement, saved: TextBox | undefined): Geometry | undefined {
  const stage = control.closest(".cutscene-studio__poster-stage")?.getBoundingClientRect();
  const copy = control.parentElement?.getBoundingClientRect();
  if (!stage?.width || !stage.height || !copy?.width) return undefined;
  const verticalTravel = Math.max(0, stage.height - copy.height);
  const width = clamp((copy.width / stage.width) * 100, MIN_TEXT_BOX_WIDTH, 100);
  return {
    width: stage.width,
    verticalTravel,
    box: saved ?? {
      width,
      x: clamp(((copy.left - stage.left) / stage.width) * 100, 0, 100 - width),
      y: verticalTravel ? clamp(((copy.top - stage.top) / verticalTravel) * 100, 0, 100) : 0,
    },
  };
}

function adjust(box: TextBox, edge: Edge, dx: number, dy: number): TextBox {
  if (edge === "move") {
    return {
      ...box,
      x: clamp(round(box.x + dx), 0, 100 - box.width),
      y: clamp(round(box.y + dy), 0, 100),
    };
  }
  if (edge === "left") {
    const right = box.x + box.width;
    const x = clamp(round(box.x + dx), 0, right - MIN_TEXT_BOX_WIDTH);
    return { ...box, x, width: right - x };
  }
  return { ...box, width: clamp(round(box.width + dx), MIN_TEXT_BOX_WIDTH, 100 - box.x) };
}

function pointerBox(drag: Drag, event: PointerEvent<HTMLButtonElement>) {
  const dx = event.clientX - drag.clientX;
  const dy = event.clientY - drag.clientY;
  if ((drag.edge === "move" ? Math.hypot(dx, dy) : Math.abs(dx)) < 2) return undefined;
  return adjust(
    drag.box,
    drag.edge,
    (dx / drag.width) * 100,
    drag.verticalTravel ? (dy / drag.verticalTravel) * 100 : 0,
  );
}

export function EditableCutsceneText({
  text,
  overBackdrop,
  onChange,
  workspaceGesture,
}: {
  text: TextCell;
  overBackdrop: boolean;
  onChange: (box: TextBox) => void;
  workspaceGesture?: ((event: { ctrlKey: boolean }) => boolean) | undefined;
}) {
  const t = useTranslate();
  const drag = useRef<Drag>();
  const [preview, setPreview] = useState<TextBox>();

  function finish(pointerId: number) {
    if (drag.current?.pointerId !== pointerId) return;
    drag.current = undefined;
    setPreview(undefined);
  }

  const handles = controls.map(({ edge, label }) => (
    <button
      key={edge}
      type="button"
      className="cutscene-studio__text-control"
      data-edge={edge}
      data-dragging={Boolean(preview) && drag.current?.edge === edge}
      aria-label={t(label)}
      title={t(label)}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || drag.current || workspaceGesture?.(event))
          return;
        const geometry = measure(event.currentTarget, text.box);
        if (!geometry) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          ...geometry,
          edge,
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId === event.pointerId)
          setPreview(pointerBox(drag.current, event));
      }}
      onPointerUp={(event) => {
        const active = drag.current;
        if (active?.pointerId !== event.pointerId) return;
        const box = pointerBox(active, event);
        finish(event.pointerId);
        if (
          box &&
          (box.x !== active.box.x || box.y !== active.box.y || box.width !== active.box.width)
        )
          onChange(box);
      }}
      onPointerCancel={(event) => finish(event.pointerId)}
      onLostPointerCapture={(event) => finish(event.pointerId)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(drag.current.pointerId);
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const vertical =
          edge === "move" ? (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0) : 0;
        if (!horizontal && !vertical) return;
        const geometry = measure(event.currentTarget, text.box);
        if (!geometry) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        const box = adjust(geometry.box, edge, horizontal * step, vertical * step);
        if (
          box.x !== geometry.box.x ||
          box.y !== geometry.box.y ||
          box.width !== geometry.box.width
        )
          onChange(box);
      }}
    />
  ));

  return (
    <CutsceneTextLayout
      text={preview ? { ...text, box: preview } : text}
      overImage={overBackdrop}
      editControls={handles}
    >
      {text.text}
    </CutsceneTextLayout>
  );
}
