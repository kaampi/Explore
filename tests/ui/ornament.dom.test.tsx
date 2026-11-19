// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import {
  CheckCard,
  ChoiceRow,
  Divider,
  Frame,
  ItemSlot,
  Medallion,
  NamePlate,
  NoteCard,
  OrnamentProvider,
} from "../../src/ui/play/ornament";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  document.body.innerHTML = "";
});

type Theme = Parameters<typeof OrnamentProvider>[0]["theme"];
const parts = (
  <>
    <Frame className="a">frame</Frame>
    <NamePlate className="b">name</NamePlate>
    <Divider className="c">label</Divider>
    <Medallion className="d">
      <img alt="" src="x" />
    </Medallion>
    <NoteCard className="e">note</NoteCard>
    <ItemSlot className="f">slot</ItemSlot>
    <CheckCard roll={34} className="g">
      Roll
    </CheckCard>
    <ChoiceRow className="h">choice</ChoiceRow>
  </>
);

async function draw(theme: Theme, simple = false, children: ReactNode = parts) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <OrnamentProvider theme={theme} simple={simple}>
        {children}
      </OrnamentProvider>,
    ),
  );
  return host;
}
const marks = (host: HTMLElement) =>
  Array.from(host.querySelectorAll("[data-orn-set]")).map((el) => el.getAttribute("data-orn-set"));

it("draws every part as the element it stands for, with the set it is drawn in", async () => {
  const host = await draw({ ornament: "forged", ornamentLevel: "full" });

  expect(marks(host)).toEqual(Array(8).fill("forged"));
  expect(host.querySelector("h2.orn-nameplate")!.textContent).toBe("name");
  expect(host.querySelector("button.orn-slot")!.getAttribute("type")).toBe("button");
  expect(host.querySelector("button.orn-choice")!.getAttribute("type")).toBe("button");
});

it("draws plain, with nothing added, when there is no theme or the set is plain", async () => {
  const none = await draw({});
  expect(marks(none)).toEqual(Array(8).fill("plain"));
  expect(none.querySelector(".orn-divider__mark")).toBeNull();
  expect(none.querySelector(".orn-check__seal")).toBeNull();

  const plain = await draw({ ornament: "plain", ornamentLevel: "full" });
  expect(plain.innerHTML).toBe(none.innerHTML);
});

it("falls back on plain for a set that does not draw a part (the hull set, for now)", async () => {
  const host = await draw({ ornament: "hull", ornamentLevel: "full" });
  expect(marks(host)).toEqual(Array(8).fill("plain"));
});

it("looks the same at level none, and with plain frames, as plain does", async () => {
  const plain = await draw({ ornament: "plain" });
  const none = await draw({ ornament: "forged", ornamentLevel: "none" });
  const simple = await draw({ ornament: "forged", ornamentLevel: "full" }, true);

  // Only the level they report is the same word: the markup is identical.
  expect(none.innerHTML).toBe(plain.innerHTML);
  expect(simple.innerHTML).toBe(plain.innerHTML);
});

it("keeps what is only decoration away from a screen reader", async () => {
  const host = await draw({ ornament: "forged", ornamentLevel: "full" });
  for (const decoration of Array.from(
    host.querySelectorAll(".orn-divider__mark, .orn-check__seal"),
  ))
    expect(decoration.getAttribute("aria-hidden")).toBe("true");
  // The sign is a real heading, and the words of the roll are there as well as the seal.
  expect(host.querySelector("h2")!.textContent).toBe("name");
  expect(host.querySelector(".orn-check")!.textContent).toContain("Roll");
});

it("lets a sign be another kind of element, so that a heading level is the page's to choose", async () => {
  const host = await draw(
    { ornament: "forged" },
    false,
    <>
      <NamePlate as="h3">A</NamePlate>
      <NamePlate as="p">B</NamePlate>
      <Frame as="section" aria-label="Story">
        C
      </Frame>
    </>,
  );
  expect(host.querySelector("h3.orn-nameplate")).not.toBeNull();
  expect(host.querySelector("p.orn-nameplate")).not.toBeNull();
  expect(host.querySelector("section.orn-frame")!.getAttribute("aria-label")).toBe("Story");
});
