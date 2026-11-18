// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  Menu,
  MenuButton,
  menuOrderProblems,
  useContextMenu,
  type MenuItem,
} from "../../src/ui/components/Menu";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function render(node: React.ReactNode, host: HTMLElement = document.body) {
  const element = document.createElement("div");
  host.append(element);
  const root = createRoot(element);
  await act(async () => root.render(node));
  mounted.push(async () => {
    await act(async () => root.unmount());
    element.remove();
  });
  return element;
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
const key = async (target: Element, name: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, ...init }));
  });

const items = (spy = vi.fn()): MenuItem[] => [
  { label: "Open", onSelect: spy },
  { label: "Rename", onSelect: vi.fn(), disabled: true, reason: "Choose one thing first." },
  { label: "Duplicate", onSelect: vi.fn() },
  { label: "Export", onSelect: vi.fn() },
  { kind: "separator" },
  { label: "Delete", onSelect: vi.fn(), danger: true },
];

it("moves with the arrow keys, Home, End and the first letter, and skips rows that are off", async () => {
  await render(<Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={vi.fn()} />);
  const enabled = rows().filter((r) => r.getAttribute("aria-disabled") !== "true");
  expect(document.activeElement).toBe(enabled[0]);
  const menu = document.querySelector('[role="menu"]')!;

  await key(menu, "ArrowDown");
  expect(document.activeElement).toBe(enabled[1]);
  expect(enabled[1]!.textContent).toContain("Duplicate");
  await key(menu, "End");
  expect(document.activeElement!.textContent).toContain("Delete");
  await key(menu, "ArrowDown");
  expect(document.activeElement!.textContent).toContain("Open");
  await key(menu, "ArrowUp");
  expect(document.activeElement!.textContent).toContain("Delete");
  await key(menu, "Home");
  expect(document.activeElement!.textContent).toContain("Open");
  await key(menu, "e");
  expect(document.activeElement!.textContent).toContain("Export");
  await key(menu, "d");
  expect(document.activeElement!.textContent).toContain("Delete");
  await key(menu, "d");
  expect(document.activeElement!.textContent).toContain("Duplicate");
  // A row that is off is never reached by the letter either.
  await key(menu, "r");
  expect(document.activeElement!.textContent).toContain("Duplicate");
});

it("shows why a row is off, and does nothing when it is chosen", async () => {
  const spy = vi.fn(),
    close = vi.fn();
  await render(
    <Menu
      label="Actions"
      at={{ x: 10, y: 10 }}
      items={[{ label: "Rename", onSelect: spy, disabled: true, reason: "Choose a place first." }]}
      onClose={close}
    />,
  );
  const row = rows()[0]!;
  expect(row.getAttribute("aria-disabled")).toBe("true");
  expect(row.title).toBe("Choose a place first.");
  await act(async () => row.click());
  expect(spy).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it("closes when a row is chosen and runs its action", async () => {
  const spy = vi.fn(),
    close = vi.fn();
  await render(<Menu label="Actions" at={{ x: 10, y: 10 }} items={items(spy)} onClose={close} />);
  await act(async () => rows()[0]!.click());
  expect(close).toHaveBeenCalledOnce();
  expect(spy).toHaveBeenCalledOnce();
});

it("closes on Escape and gives focus back, and closes on Tab", async () => {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  const close = vi.fn();
  await render(<Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={close} />);
  expect(document.activeElement).not.toBe(button);
  await key(document.querySelector('[role="menu"]')!, "Escape");
  expect(close).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(button);

  close.mockClear();
  await key(document.querySelector('[role="menu"]')!, "Tab");
  expect(close).toHaveBeenCalledOnce();
  button.remove();
});

it("gives focus back after Escape in React's strict mode, which runs effects twice", async () => {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  const close = vi.fn();
  await render(
    <StrictMode>
      <Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={close} />
    </StrictMode>,
  );
  expect(document.activeElement).not.toBe(button);
  await key(document.querySelector('[role="menu"]')!, "Escape");
  expect(close).toHaveBeenCalled();
  expect(document.activeElement).toBe(button);
  button.remove();
});

it("closes on a click outside, on scroll and on resize", async () => {
  const close = vi.fn();
  await render(<Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={close} />);
  await act(async () => {
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(close).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
  });
  expect(close).toHaveBeenCalledTimes(2);
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(close).toHaveBeenCalledTimes(3);
});

it("keeps only one menu open at a time", async () => {
  const first = vi.fn(),
    second = vi.fn();
  await render(<Menu label="First" at={{ x: 10, y: 10 }} items={items()} onClose={first} />);
  expect(first).not.toHaveBeenCalled();
  await render(<Menu label="Second" at={{ x: 50, y: 50 }} items={items()} onClose={second} />);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
});

it("stays inside the window", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 200,
    height: 120,
    top: 0,
    left: 0,
    right: 200,
    bottom: 120,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  await render(
    <Menu
      label="Actions"
      at={{ x: window.innerWidth + 400, y: window.innerHeight + 400 }}
      items={items()}
      onClose={vi.fn()}
    />,
  );
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(parseFloat(menu.style.left)).toBe(window.innerWidth - 200 - 8);
  expect(parseFloat(menu.style.top)).toBe(window.innerHeight - 120 - 8);
});

it("is drawn inside the app frame, so a menu in the dark mode is dark", async () => {
  const frame = document.createElement("div");
  frame.className = "sandbox-root";
  frame.dataset.shell = "dark";
  document.body.append(frame);
  const origin = document.createElement("span");
  frame.append(origin);
  await render(
    <Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={vi.fn()} scope={origin} />,
  );
  expect(document.querySelector('[role="menu"]')!.closest('[data-shell="dark"]')).toBe(frame);
  frame.remove();
});

it("is drawn inside the nearest dialog, so it is not hidden behind it", async () => {
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const origin = document.createElement("span");
  dialog.append(origin);
  await render(
    <Menu label="Actions" at={{ x: 10, y: 10 }} items={items()} onClose={vi.fn()} scope={origin} />,
  );
  expect(document.querySelector('[role="menu"]')!.closest("dialog")).toBe(dialog);
  dialog.remove();
});

it("asks for a danger row to come last, after a separator", () => {
  expect(menuOrderProblems(items())).toEqual([]);
  expect(
    menuOrderProblems([
      { label: "Delete", onSelect: vi.fn(), danger: true },
      { label: "Open", onSelect: vi.fn() },
    ]),
  ).toHaveLength(1);
  expect(
    menuOrderProblems([
      { label: "Open", onSelect: vi.fn() },
      { label: "Delete", onSelect: vi.fn(), danger: true },
    ]),
  ).toHaveLength(1);
});

it("warns in development about a danger row that is not last", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await render(
    <Menu
      label="Actions"
      at={{ x: 10, y: 10 }}
      items={[
        { label: "Delete", onSelect: vi.fn(), danger: true },
        { label: "Open", onSelect: vi.fn() },
      ]}
      onClose={vi.fn()}
    />,
  );
  expect(warn).toHaveBeenCalled();
  expect(String(warn.mock.calls[0]![0])).toContain("must come last");
});

it("keeps the menu open while a colour is chosen, and closes after a tick row", async () => {
  const picked = vi.fn(),
    toggled = vi.fn(),
    close = vi.fn();
  await render(
    <Menu
      label="Actions"
      at={{ x: 10, y: 10 }}
      items={[
        {
          kind: "color",
          label: "Change color",
          ariaLabel: "Place color",
          value: "#336699",
          onChange: picked,
        },
        { kind: "check", label: "Show names", checked: true, onToggle: toggled },
      ]}
      onClose={close}
    />,
  );
  const color = document.querySelector<HTMLInputElement>('input[aria-label="Place color"]')!;
  expect(color.value).toBe("#336699");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      color,
      "#aa0000",
    );
    color.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(picked).toHaveBeenCalledWith("#aa0000");
  expect(close).not.toHaveBeenCalled();

  const tick = document.querySelector('[role="menuitemcheckbox"]')!;
  expect(tick.getAttribute("aria-checked")).toBe("true");
  await act(async () => (tick as HTMLElement).click());
  expect(toggled).toHaveBeenCalledWith(false);
  expect(close).toHaveBeenCalledOnce();
});

it("opens from the ⋯ button under it, announces itself, and gives focus back when it closes", async () => {
  const spy = vi.fn();
  const element = await render(<MenuButton label="More options for Mona" items={items(spy)} />);
  const button = element.querySelector("button")!;
  expect(button.getAttribute("aria-haspopup")).toBe("menu");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  button.focus();
  await act(async () => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(document.querySelector('[role="menu"]')!.getAttribute("aria-label")).toBe(
    "More options for Mona",
  );
  await key(document.querySelector('[role="menu"]')!, "Escape");
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(button);
});

function Target({ list }: { list: MenuItem[] }) {
  const { bind, menu } = useContextMenu("Actions for Mona", list);
  return (
    <>
      <div data-testid="target" tabIndex={0} {...bind}>
        Mona
        <input aria-label="Name" />
        <textarea aria-label="Notes" />
      </div>
      {menu}
    </>
  );
}
const labels = () => rows().map((r) => r.textContent);

it("opens the same rows from a right click, Shift+F10 and the Menu key as from the ⋯ button", async () => {
  const list = items();
  const element = await render(<Target list={list} />);
  const target = element.querySelector<HTMLElement>('[data-testid="target"]')!;

  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }),
    );
  });
  const fromClick = labels();
  expect(fromClick).toEqual(["Open", "Rename", "Duplicate", "Export", "Delete"]);
  await key(document.querySelector('[role="menu"]')!, "Escape");
  expect(rows()).toHaveLength(0);

  await key(target, "F10", { shiftKey: true });
  expect(labels()).toEqual(fromClick);
  await key(document.querySelector('[role="menu"]')!, "Escape");

  await key(target, "ContextMenu");
  expect(labels()).toEqual(fromClick);
  await key(document.querySelector('[role="menu"]')!, "Escape");

  const button = await render(<MenuButton label="More" items={list} />);
  await act(async () => button.querySelector("button")!.click());
  expect(labels()).toEqual(fromClick);
});

it("opens a right-click menu inside the dialog it was opened in, not behind it", async () => {
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  const element = await render(<Target list={items()} />, dialog);
  const target = element.querySelector<HTMLElement>('[data-testid="target"]')!;
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }),
    );
  });
  expect(document.querySelector('[role="menu"]')!.closest("dialog")).toBe(dialog);
  await key(document.querySelector('[role="menu"]')!, "Escape");

  await key(target, "F10", { shiftKey: true });
  expect(document.querySelector('[role="menu"]')!.closest("dialog")).toBe(dialog);
  await key(document.querySelector('[role="menu"]')!, "Escape");
  dialog.remove();
});

it("closes the menu on a second click on the ⋯ button, and does not open it again", async () => {
  const element = await render(<MenuButton label="More" items={items()} />);
  const button = element.querySelector("button")!;
  // What a browser sends for one click: press, release, then click. React has drawn what the press
  // changed before the click arrives, so each event gets its own turn.
  const click = async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"])
      await act(async () => {
        button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      });
  };
  await click();
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await click();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await click();
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
});

it("opens from a long press of 500 ms on a touch screen, and not from a short one", async () => {
  vi.useFakeTimers();
  const element = await render(<Target list={items()} />);
  const target = element.querySelector<HTMLElement>('[data-testid="target"]')!;
  const press = (type: string) =>
    act(async () => {
      target.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerType: "touch",
          clientX: 20,
          clientY: 20,
        }),
      );
    });

  await press("pointerdown");
  await act(async () => vi.advanceTimersByTime(300));
  await press("pointerup");
  await act(async () => vi.advanceTimersByTime(400));
  expect(rows()).toHaveLength(0);

  await press("pointerdown");
  await act(async () => vi.advanceTimersByTime(500));
  expect(rows().length).toBeGreaterThan(0);
});

it("leaves the browser's own menu in text fields and when text is selected", async () => {
  const element = await render(<Target list={items()} />);
  const input = element.querySelector("input")!;
  const textarea = element.querySelector("textarea")!;
  const target = element.querySelector<HTMLElement>('[data-testid="target"]')!;
  for (const field of [input, textarea]) {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    await act(async () => {
      field.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    await key(field, "F10", { shiftKey: true });
  }
  expect(rows()).toHaveLength(0);

  vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "some text" } as Selection);
  const selected = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await act(async () => {
    target.dispatchEvent(selected);
  });
  expect(selected.defaultPrevented).toBe(false);
  expect(rows()).toHaveLength(0);
});

it("has no old menus left: the files are gone and nothing imports them", () => {
  expect(existsSync("src/ui/components/MessageMenu.tsx")).toBe(false);
  expect(existsSync("src/ui/studio/MapContextMenu.tsx")).toBe(false);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
    });
  const hits = walk("src").filter((path) =>
    /\bMessageMenu\b|\bMapContextMenu\b|message-context-menu|world-map__floating-menu/.test(
      readFileSync(path, "utf8"),
    ),
  );
  expect(hits).toEqual([]);
});
