import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      onSelect: () => void;
      shortcut?: string;
      /** A row that cannot be chosen is shown, not hidden, so the menu looks the same every time. */
      disabled?: boolean;
      /** Why a disabled row is disabled: shown as its tooltip. */
      reason?: string;
      /** Deleting and the like. Always the last row of the menu, after a separator. */
      danger?: boolean;
    }
  | { kind: "check"; label: string; checked: boolean; onToggle: (checked: boolean) => void }
  | {
      /** A row that opens the colour picker. The menu stays open while a colour is chosen. */
      kind: "color";
      label: string;
      ariaLabel: string;
      value: string;
      onChange: (value: string) => void;
    }
  | { kind: "separator" }
  | { kind: "heading"; label: string };

const MENU_OPEN = "explore:menu-open";
const MARGIN = 8;

/** The things wrong with the order of a menu, in words. Empty when it is as it should be. */
export function menuOrderProblems(items: readonly MenuItem[]): string[] {
  const problems: string[] = [];
  const last = items.length - 1;
  items.forEach((item, index) => {
    if ((item.kind ?? "item") === "item" && "danger" in item && item.danger && index !== last)
      problems.push(`"${item.label}" is a danger row and must come last.`);
  });
  const lastItem = items[last];
  if (
    lastItem &&
    (lastItem.kind ?? "item") === "item" &&
    "danger" in lastItem &&
    lastItem.danger &&
    items.length > 1 &&
    items[last - 1]?.kind !== "separator"
  )
    problems.push(`"${lastItem.label}" is a danger row and must follow a separator.`);
  return problems;
}

/** The nearest dialog, or else the app frame, so that the menu gets the right palette. */
function hostFor(scope: Element | null | undefined): Element {
  return (
    scope?.closest("dialog") ??
    scope?.closest(".sandbox-root") ??
    document.querySelector(".sandbox-root") ??
    document.body
  );
}

/**
 * One menu for the whole app: messages, the map, Storyboard, lists. It opens at a point or under a
 * button, stays inside the window, takes the keyboard, and only one is open at a time.
 */
export function Menu({
  label,
  at,
  items,
  onClose,
  scope,
  portalTarget,
}: {
  label: string;
  at: { x: number; y: number };
  items: readonly MenuItem[];
  onClose: () => void;
  /** An element near the menu's origin: the menu goes in its dialog, or else in the app frame. */
  scope?: Element | null;
  portalTarget?: Element | undefined;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState(at);

  if (import.meta.env.DEV) {
    for (const problem of menuOrderProblems(items)) console.warn(`Menu "${label}": ${problem}`);
  }

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      x: Math.max(MARGIN, Math.min(at.x, window.innerWidth - rect.width - MARGIN)),
      y: Math.max(MARGIN, Math.min(at.y, window.innerHeight - rect.height - MARGIN)),
    });
  }, [at.x, at.y, items]);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    window.dispatchEvent(new CustomEvent(MENU_OPEN, { detail: id }));
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close.current();
    };
    const other = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) close.current();
    };
    const scrolled = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        if (previous instanceof HTMLElement || previous instanceof SVGElement) previous.focus();
      }
    };
    const resize = () => close.current();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("contextmenu", outside, true);
    window.addEventListener(MENU_OPEN, other);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resize);
    menu.current
      ?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      ?.focus();
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("contextmenu", outside, true);
      window.removeEventListener(MENU_OPEN, other);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resize);
    };
  }, [id]);

  const rows = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Tab") {
      close.current();
      return;
    }
    const all = rows();
    if (!all.length) return;
    const current = all.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % all.length;
    else if (event.key === "ArrowUp") next = (current - 1 + all.length) % all.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = all.length - 1;
    else if (
      event.key.length === 1 &&
      /\S/.test(event.key) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const letter = event.key.toLowerCase();
      for (let step = 1; step <= all.length; step += 1) {
        const index = (current + step) % all.length;
        if (all[index]!.textContent?.trim().toLowerCase().startsWith(letter)) {
          next = index;
          break;
        }
      }
    } else return;
    event.preventDefault();
    event.stopPropagation();
    if (next >= 0) all[next]!.focus();
  };

  const choose = (action: () => void) => {
    close.current();
    action();
  };
  const hasShortcut = items.some((item) => "shortcut" in item && item.shortcut);

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      className="ui-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const kind = item.kind ?? "item";
        if (kind === "separator")
          return <div key={index} role="separator" className="ui-menu__separator" />;
        if (kind === "heading")
          return (
            <div key={index} role="presentation" className="ui-menu__heading">
              {(item as { label: string }).label}
            </div>
          );
        if (kind === "color") {
          const color = item as Extract<MenuItem, { kind: "color" }>;
          return (
            <div key={index} className="ui-menu__row" role="none">
              <button
                type="button"
                role="menuitem"
                className="ui-menu__item"
                onClick={(event) => {
                  const input = event.currentTarget.parentElement?.querySelector("input");
                  if (input)
                    (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.() ??
                      input.click();
                }}
              >
                {color.label}
              </button>
              <input
                type="color"
                className="ui-menu__swatch"
                aria-label={color.ariaLabel}
                tabIndex={-1}
                value={color.value}
                onChange={(event) => color.onChange(event.target.value)}
              />
            </div>
          );
        }
        if (kind === "check") {
          const check = item as Extract<MenuItem, { kind: "check" }>;
          return (
            <button
              key={index}
              type="button"
              role="menuitemcheckbox"
              aria-checked={check.checked}
              className="ui-menu__item"
              onClick={() => choose(() => check.onToggle(!check.checked))}
            >
              <span className="ui-menu__check" aria-hidden="true">
                {check.checked ? "✓" : ""}
              </span>
              {check.label}
            </button>
          );
        }
        const row = item as Extract<MenuItem, { kind?: "item" }>;
        return (
          <button
            key={index}
            type="button"
            role="menuitem"
            aria-disabled={row.disabled ? true : undefined}
            title={row.disabled ? row.reason : undefined}
            className={`ui-menu__item${row.danger ? " ui-menu__item--danger" : ""}`}
            onClick={() => {
              if (!row.disabled) choose(row.onSelect);
            }}
          >
            <span className="ui-menu__label">{row.label}</span>
            {hasShortcut && <kbd className="ui-menu__shortcut">{row.shortcut ?? ""}</kbd>}
          </button>
        );
      })}
    </div>,
    portalTarget ?? hostFor(scope),
  );
}

/** The "⋯" button: opens the menu under itself, and gives focus back to itself when it closes. */
export function MenuButton({
  label,
  items,
  size,
  className,
}: {
  label: string;
  items: readonly MenuItem[];
  size?: "normal" | "compact";
  className?: string;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const classes = [
    "ui-button",
    "ui-button--quiet",
    "ui-button--icon",
    size === "compact" ? "ui-button--compact" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <button
        ref={button}
        type="button"
        className={classes}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(event) => {
          event.stopPropagation();
          if (at) {
            setAt(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setAt({ x: rect.left, y: rect.bottom + 4 });
        }}
      >
        ⋯
      </button>
      {at && (
        <Menu
          label={label}
          at={at}
          items={items}
          scope={button.current}
          onClose={() => {
            setAt(null);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

const LONG_PRESS_MS = 500;

function inTextControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
  );
}

/**
 * What to put on an element so that right click, Shift+F10 or the Menu key, and a long press on a
 * touch screen open the menu. Use the same `items` for the "⋯" button. In text fields, and when text
 * is selected, nothing happens, so that Copy and Paste keep working.
 */
export function useContextMenu(label: string, items: readonly MenuItem[]) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  useEffect(() => stop, [stop]);
  const bind = {
    onContextMenu: (event: ReactMouseEvent) => {
      if (inTextControl(event.target) || window.getSelection()?.toString()) return;
      event.preventDefault();
      setAt({ x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: ReactKeyboardEvent) => {
      if (inTextControl(event.target)) return;
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      setAt({ x: rect.left + 8, y: rect.top + Math.min(rect.height, 40) });
    },
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" || inTextControl(event.target)) return;
      origin.current = { x: event.clientX, y: event.clientY };
      pressed.current = false;
      stop();
      timer.current = window.setTimeout(() => {
        pressed.current = true;
        setAt(origin.current);
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: ReactPointerEvent) => {
      if (
        timer.current !== undefined &&
        Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10
      )
        stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onClickCapture: (event: ReactMouseEvent) => {
      // The press that opened the menu must not also be a click on what is underneath.
      if (pressed.current) {
        pressed.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
  const menu: ReactNode = at ? (
    <Menu label={label} at={at} items={items} onClose={() => setAt(null)} />
  ) : null;
  return { bind, menu };
}
