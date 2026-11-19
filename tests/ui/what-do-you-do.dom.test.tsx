// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WhatDoYouDo } from "../../src/ui/play/WhatDoYouDo";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import { connectedAdventureExample, newOpportunity } from "../../src/library/playableCampaign";
import { startPlayableCampaign } from "../../src/session/adventureStart";
import { groupedCommands, suggestedCommands, type PublicCommand } from "../../src/game/catalog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounted: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of mounted.splice(0)) await close();
  localStorage.clear();
});

function setup(extra = 0) {
  const built = connectedAdventureExample();
  const session = startPlayableCampaign(
    built.campaign,
    built.campaign.scenes[0]!,
    built.places,
    "wdyd",
    [built.realm],
    { characters: built.characters },
  );
  const game = session.encounter!;
  for (let i = 0; i < extra; i++)
    game.definition.interactions.push(newOpportunity(`Try thing ${i + 1}`, "Done."));
  game.state.attempts.push(game.definition.interactions[1]!.id);
  return game;
}

async function render(game = setup(), overrides: Partial<Parameters<typeof WhatDoYouDo>[0]> = {}) {
  const calls = {
    choose: vi.fn<(c: PublicCommand) => void>(),
    say: vi.fn(),
    act: vi.fn(),
    addressee: vi.fn(),
  };
  function Harness() {
    const [mode, setMode] = useState<"say" | "do">("say");
    const [say, setSay] = useState("");
    const [text, setText] = useState("");
    return (
      <LanguageProvider>
        <WhatDoYouDo
          game={game}
          suggestions={suggestedCommands(game)}
          groups={groupedCommands(game)}
          people={[{ id: "a", name: "Edda" }]}
          addresseeId="a"
          onAddressee={calls.addressee}
          mode={mode}
          onMode={setMode}
          say={say}
          text={text}
          onSay={setSay}
          onText={setText}
          busy={false}
          waiting={null}
          onCancelWaiting={() => {}}
          onChoose={calls.choose}
          onSubmitSay={calls.say}
          onSubmitDo={calls.act}
          titleFor={() => undefined}
          {...overrides}
        />
      </LanguageProvider>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  await act(async () => root.render(<Harness />));
  mounted.push(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return { host, ...calls };
}
const type = async (field: HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field,
      value,
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });

it("shows at most three suggestions, each with a picture, and a button for more choices", async () => {
  const { host } = await render(setup(4));

  const suggestions = host.querySelectorAll(".play-do__suggestion");
  expect(suggestions).toHaveLength(3);
  for (const suggestion of Array.from(suggestions)) {
    expect(suggestion.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  }
  expect(host.querySelector(".play-do__more")!.textContent).toBe("More choices…");
  expect(host.querySelector(".play-do__title")!.textContent).toBe("What do you do?");
});

it("chooses a suggestion", async () => {
  const { host, choose } = await render();

  await act(async () => host.querySelector<HTMLButtonElement>(".play-do__suggestion")!.click());

  expect(choose).toHaveBeenCalledOnce();
  expect(choose.mock.calls[0]![0].action).toMatchObject({ kind: "interaction" });
});

it("opens every choice in groups, and shows a blocked one with its reason without letting it be chosen", async () => {
  const game = setup();
  game.state.attempts.push(game.definition.interactions[0]!.id);
  const { host, choose } = await render(game);

  await act(async () => host.querySelector<HTMLButtonElement>(".play-do__more")!.click());
  const dialog = host.querySelector("dialog")!;
  expect(Array.from(dialog.querySelectorAll("h3")).map((h) => h.textContent)).toEqual([
    "People",
    "Places in the scene",
  ]);
  const blocked = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    b.textContent?.includes("Ask Edda about the messenger"),
  )!;
  expect(blocked.getAttribute("aria-disabled")).toBe("true");
  expect(blocked.textContent).toMatch(/already resolved/i);
  await act(async () => blocked.click());
  expect(choose).not.toHaveBeenCalled();
  expect(host.querySelector("dialog")).not.toBeNull();

  const open = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent === "Look around",
  )!;
  await act(async () => open.click());
  expect(choose).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).toBeNull();
});

it("has the two tabs Talk and Act over one field, and keeps a draft for each", async () => {
  const { host } = await render();
  const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  expect(tabs.map((t) => t.textContent)).toEqual(["Talk", "Act"]);
  expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  expect(host.querySelectorAll("textarea")).toHaveLength(1);

  await type(host.querySelector("textarea")!, "Good day, Edda.");
  await act(async () => tabs[1]!.click());
  expect(host.querySelector("textarea")!.value).toBe("");
  await type(host.querySelector("textarea")!, "Look under the well cover");
  await act(async () => tabs[0]!.click());
  expect(host.querySelector("textarea")!.value).toBe("Good day, Edda.");
  await act(async () => tabs[1]!.click());
  expect(host.querySelector("textarea")!.value).toBe("Look under the well cover");
});

it("names the button after the tab, and under Act says the attempt is shown first", async () => {
  const { host, say, act: submitAct } = await render();
  const button = () => host.querySelector<HTMLButtonElement>(".play-do__submit button")!;

  expect(button().textContent).toBe("Say");
  expect(button().disabled).toBe(true);
  await type(host.querySelector("textarea")!, "Hello");
  await act(async () => button().click());
  expect(say).toHaveBeenCalledOnce();

  await act(async () => host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
  expect(button().textContent).toBe("Review action");
  expect(host.querySelector(".play-do__submit small")!.textContent).toBe(
    "You will see the attempt before it is carried out.",
  );
  await type(host.querySelector("textarea")!, "Climb the wall");
  await act(async () => button().click());
  expect(submitAct).toHaveBeenCalledOnce();
});

it("moves between the tabs with the arrow keys, and only the chosen tab is in the tab order", async () => {
  const { host } = await render();
  const tabs = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

  expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
  await act(async () => {
    tabs()[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  expect(host.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe(
    "play-do-tab-do",
  );
});

it("asks who to talk to only when more than one person is here, and only under Talk", async () => {
  const one = await render();
  expect(one.host.querySelector(".play-do__to")).toBeNull();
  const two = await render(setup(), {
    people: [
      { id: "a", name: "Edda" },
      { id: "b", name: "Hob" },
    ],
  });
  const select = two.host.querySelector<HTMLSelectElement>(".play-do__to select")!;
  expect(two.host.querySelector(".play-do__to")!.textContent).toContain("Talk to");
  expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Edda", "Hob"]);
  await act(async () => two.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
  expect(two.host.querySelector(".play-do__to")).toBeNull();
});

it("speaks Swedish when the interface is Swedish", async () => {
  localStorage.setItem("sandboxai:interface-language", "sv");
  const { host } = await render();

  expect(host.querySelector(".play-do__title")!.textContent).toBe("Vad gör du?");
  expect(host.querySelector(".play-do__more")!.textContent).toBe("Fler val…");
  expect(Array.from(host.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual([
    "Tala",
    "Agera",
  ]);
});
