// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ListRow } from "../../src/ui/components/ListRow";
import { StudioList } from "../../src/ui/studio/StudioList";
import type { MenuItem } from "../../src/ui/components/Menu";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
});
async function render(node: React.ReactNode) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  await act(async () => root.render(node));
  mounted.push(async () => {
    await act(async () => root.unmount());
    element.remove();
  });
  return element;
}
const menuItems = (spy = vi.fn()): MenuItem[] => [
  { label: "Open", onSelect: spy },
  { label: "Duplicate", onSelect: vi.fn() },
  { kind: "separator" },
  { label: "Delete", onSelect: vi.fn(), danger: true },
];
const menuRows = () =>
  Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map(
    (row) => row.textContent,
  );

it("marks the chosen row, names its ⋯ button after the thing, and keeps buttons out of buttons", async () => {
  const el = await render(
    <ul>
      <ListRow
        name="Mona"
        description="A stranger in the harbour"
        selected
        onSelect={vi.fn()}
        menu={menuItems()}
      />
      <ListRow name="Edda" onSelect={vi.fn()} menu={menuItems()} />
    </ul>,
  );
  const [mona, edda] = Array.from(el.querySelectorAll("li"));
  expect(mona!.querySelector(".ui-row__main")!.getAttribute("aria-current")).toBe("true");
  expect(edda!.querySelector(".ui-row__main")!.hasAttribute("aria-current")).toBe(false);
  expect(mona!.querySelector(".ui-row__menu")!.getAttribute("aria-label")).toBe(
    "More options for Mona",
  );
  expect(edda!.querySelector(".ui-row__menu")!.getAttribute("aria-label")).toBe(
    "More options for Edda",
  );
  for (const row of [mona!, edda!]) {
    // Two buttons side by side: the row and the dots.
    expect(Array.from(row.children).map((child) => child.tagName)).toEqual(["BUTTON", "BUTTON"]);
    expect(el.querySelectorAll("button button")).toHaveLength(0);
  }
});

it("gives the full text as a tooltip, keeps at most two statuses, and a row without a picture is compact", async () => {
  const el = await render(
    <ul>
      <ListRow
        name="A very long name for a person who lives far away"
        description="And an even longer line about where they are from and why"
        statuses={[
          { label: "Draft", kind: "draft" },
          { label: "Playable", kind: "playable" },
          { label: "Needs work", kind: "attention" },
        ]}
        onSelect={vi.fn()}
      />
      <ListRow name="With picture" media={<img alt="" src="x.png" />} onSelect={vi.fn()} />
    </ul>,
  );
  const [plain, withPicture] = Array.from(el.querySelectorAll("li"));
  expect(plain!.querySelector(".ui-row__name")!.getAttribute("title")).toBe(
    "A very long name for a person who lives far away",
  );
  expect(plain!.querySelector(".ui-row__desc")!.getAttribute("title")).toContain("an even longer");
  expect(Array.from(plain!.querySelectorAll(".ui-row__status")).map((s) => s.className)).toEqual([
    "ui-row__status ui-row__status--draft",
    "ui-row__status ui-row__status--playable",
  ]);
  expect(plain!.classList.contains("ui-row--compact")).toBe(true);
  expect(withPicture!.classList.contains("ui-row--compact")).toBe(false);
});

it("has no ⋯ and no menu when there is nothing to do with the thing", async () => {
  const el = await render(
    <ul>
      <ListRow name="Mona" onSelect={vi.fn()} />
    </ul>,
  );
  expect(el.querySelector(".ui-row__menu")).toBeNull();
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  await act(async () => {
    el.querySelector("li")!.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("opens the same rows from the ⋯ button and from a right click, and chooses the row on a click", async () => {
  const onSelect = vi.fn(),
    open = vi.fn();
  const el = await render(
    <ul>
      <ListRow name="Mona" onSelect={onSelect} menu={menuItems(open)} />
    </ul>,
  );
  await act(async () => el.querySelector<HTMLElement>(".ui-row__menu")!.click());
  const fromDots = menuRows();
  expect(fromDots).toEqual(["Open", "Duplicate", "Delete"]);
  await act(async () => {
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[role="menu"]')).toBeNull();

  await act(async () => {
    el.querySelector("li")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
    );
  });
  expect(menuRows()).toEqual(fromDots);
  await act(async () =>
    (document.querySelector('[role="menu"] [role="menuitem"]') as HTMLElement).click(),
  );
  expect(open).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();

  await act(async () => el.querySelector<HTMLElement>(".ui-row__main")!.click());
  expect(onSelect).toHaveBeenCalledOnce();
});

it("builds a studio list of rows, with a menu per row when the view gives one", async () => {
  const picked = vi.fn();
  const el = await render(
    <StudioList
      heading="Characters"
      items={[
        {
          id: "1",
          name: "Mona",
          caption: "Archive",
          statuses: [{ label: "Draft", kind: "draft" }],
        },
        { id: "2", name: "Edda" },
      ]}
      selectedId="2"
      onSelect={picked}
      onNew={vi.fn()}
      newLabel="Create new"
      empty="Nobody yet."
      itemMenu={(item) => [
        { label: `Open ${item.name}`, onSelect: vi.fn() },
        { kind: "separator" },
        { label: "Delete", danger: true, onSelect: vi.fn() },
      ]}
    />,
  );
  const rows = Array.from(el.querySelectorAll("li.ui-row"));
  expect(rows).toHaveLength(2);
  expect(rows[1]!.querySelector(".ui-row__main")!.getAttribute("aria-current")).toBe("true");
  expect(rows[0]!.querySelector(".ui-row__menu")!.getAttribute("aria-label")).toBe(
    "More options for Mona",
  );
  await act(async () => rows[0]!.querySelector<HTMLElement>(".ui-row__main")!.click());
  expect(picked).toHaveBeenCalledWith("1");
  // With something in the list the new button is a plain one.
  expect(el.querySelector(".studio-list__head button")!.className).toBe("studio-list__btn");
});

it("has no ⋯ in a studio list whose view gives no menu, and shows the main button when the list is empty", async () => {
  const el = await render(
    <StudioList
      heading="Voices"
      items={[]}
      selectedId={null}
      onSelect={vi.fn()}
      onNew={vi.fn()}
      newLabel="Create a voice"
      empty="No voices yet."
    />,
  );
  expect(el.textContent).toContain("No voices yet.");
  expect(el.querySelector(".studio-list__head button")!.className).toBe("setup-start");
  const withRows = await render(
    <StudioList
      heading="Voices"
      items={[{ id: "1", name: "Narrator" }]}
      selectedId={null}
      onSelect={vi.fn()}
      onNew={vi.fn()}
      newLabel="Create a voice"
      empty="No voices yet."
    />,
  );
  expect(withRows.querySelector(".ui-row__menu")).toBeNull();
});
