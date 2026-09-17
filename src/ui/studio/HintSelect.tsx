import { useEffect, useId, useRef, useState } from "react";

export type HintChoice = {
  id: string;
  label: string;
  hint?: string;
};

export function HintSelect({
  value,
  noneLabel,
  choices,
  onChange,
  ariaLabel
}: {
  value: string;
  noneLabel: string;
  choices: HintChoice[];
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const current = choices.find((item) => item.id === value);
  const hovered = hoveredId ? choices.find((item) => item.id === hoveredId) : undefined;
  const showingNone = hoveredId === "" || (!hoveredId && !value);
  const tip = showingNone
    ? "No narrator instruction."
    : (hovered?.hint ?? current?.hint ?? "").trim() || "No instruction written for this voice yet.";

  function placeMenu() {
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    setMenuPos({ top: box.bottom + 4, right: Math.max(16, window.innerWidth - box.right) });
  }

  function toggle() {
    setOpen((on) => {
      if (on) return false;
      placeMenu();
      return true;
    });
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onReposition() {
      placeMenu();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setHoveredId(null);
  }

  return (
    <div className={`hint-select ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="hint-select__button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={toggle}
      >
        {current?.label ?? noneLabel}
      </button>
      {open ? (
        <div
          className="hint-select__menu"
          style={menuPos ? { top: menuPos.top, right: menuPos.right } : undefined}
        >
          <div className="hint-select__list" role="listbox" aria-label={ariaLabel}>
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={!value ? "hint-select__choice is-on" : "hint-select__choice"}
              onMouseEnter={() => setHoveredId("")}
              onFocus={() => setHoveredId("")}
              onClick={() => pick("")}
            >
              {noneLabel}
            </button>
            {choices.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === value}
                className={item.id === value ? "hint-select__choice is-on" : "hint-select__choice"}
                onMouseEnter={() => setHoveredId(item.id)}
                onFocus={() => setHoveredId(item.id)}
                onClick={() => pick(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hint-select__tip" id={tipId} role="tooltip">
            {tip}
          </div>
        </div>
      ) : null}
    </div>
  );
}
