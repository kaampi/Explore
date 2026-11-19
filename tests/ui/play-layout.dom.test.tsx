// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { usePlayLayout } from "../../src/ui/play/usePlayLayout";
import { PlayFrame } from "../../src/ui/play/PlayFrame";
import { PeopleColumn } from "../../src/ui/play/PeopleColumn";
import { LanguageProvider } from "../../src/ui/i18n/LanguageProvider";
import type { PersonCard } from "../../src/ui/play/personCard";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

type Listener = () => void;
/** A window of a given width: answers "(max-width: Npx)" and tells listeners when it changes. */
function windowOfWidth(initial: number) {
  let width = initial;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      const max = /max-width:\s*(\d+)px/.exec(query);
      return max ? width <= Number(max[1]) : false;
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  }));
  Object.defineProperty(window, "matchMedia", { value: globalThis.matchMedia, configurable: true });
  return {
    resize: async (next: number) => {
      width = next;
      await act(async () => listeners.forEach((fn) => fn()));
    },
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function Probe() {
  return <p data-testid="layout">{usePlayLayout()}</p>;
}
async function mount(node: React.ReactNode) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>));
  return { host, root };
}

it("is wide from 1440 px, medium from 1024 to 1439, and narrow under 1024, and follows the window", async () => {
  const win = windowOfWidth(1600);
  const { host } = await mount(<Probe />);
  const layout = () => host.querySelector("[data-testid=layout]")!.textContent;
  expect(layout()).toBe("wide");
  await win.resize(1440);
  expect(layout()).toBe("wide");
  await win.resize(1439);
  expect(layout()).toBe("medium");
  await win.resize(1024);
  expect(layout()).toBe("medium");
  await win.resize(1023);
  expect(layout()).toBe("narrow");
  await win.resize(390);
  expect(layout()).toBe("narrow");
  await win.resize(1600);
  expect(layout()).toBe("wide");
});

it("is wide where the browser cannot tell the width", async () => {
  vi.stubGlobal("matchMedia", undefined);
  Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
  const { host } = await mount(<Probe />);
  expect(host.querySelector("[data-testid=layout]")!.textContent).toBe("wide");
});

function Frame({ layout, onJournal }: { layout: "wide" | "narrow"; onJournal?: () => void }) {
  return (
    <PlayFrame
      layout={layout}
      {...(onJournal ? { onJournal } : {})}
      left={<p>left</p>}
      center={<p>center</p>}
      right={<p className="scene-content">right</p>}
    />
  );
}

it("keeps the three columns in a wide window", async () => {
  const { host } = await mount(<Frame layout="wide" />);
  expect(host.querySelector(".play-view--narrow")).toBeNull();
  expect(host.querySelector(".play-view__panels")).toBeNull();
  expect(host.querySelector(".play-view__right .scene-content")).not.toBeNull();
});

it("is one column in a narrow window, with In the scene and the journal behind buttons", async () => {
  const onJournal = vi.fn();
  const { host } = await mount(<Frame layout="narrow" onJournal={onJournal} />);
  expect(host.querySelector(".play-view--narrow")).not.toBeNull();
  expect(host.querySelector(".play-view__right")).toBeNull();
  expect(host.querySelector(".scene-content")).toBeNull();

  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(".play-view__panels button"));
  expect(buttons.map((b) => b.textContent)).toEqual(["In the scene", "Journal"]);
  await act(async () => buttons[0]!.click());
  expect(
    host.querySelector('dialog.sb-dialog--side[aria-label="In the scene"] .scene-content'),
  ).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>("dialog .sb-icon")!.click());
  expect(host.querySelector(".scene-content")).toBeNull();

  await act(async () => buttons[1]!.click());
  expect(onJournal).toHaveBeenCalledOnce();
});

it("has no journal button when there is no journal to open", async () => {
  const { host } = await mount(<Frame layout="narrow" />);
  expect(
    Array.from(host.querySelectorAll(".play-view__panels button")).map((b) => b.textContent),
  ).toEqual(["In the scene"]);
});

it("closes the panel when the window grows wide again", async () => {
  function Wrapper() {
    const [layout, setLayout] = useState<"wide" | "narrow">("narrow");
    return (
      <>
        <button type="button" id="grow" onClick={() => setLayout("wide")} />
        <Frame layout={layout} />
      </>
    );
  }
  const { host } = await mount(<Wrapper />);
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".play-view__panels button")!.click(),
  );
  expect(host.querySelector("dialog")).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>("#grow")!.click());
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.querySelector(".play-view__right .scene-content")).not.toBeNull();
});

const edda: PersonCard = {
  id: "edda",
  name: "Edda",
  line: "Calm.",
  mood: "",
  portrait: undefined,
  initials: "E",
};
const tam: PersonCard = {
  id: "tam",
  name: "Old Tam",
  line: "",
  mood: "",
  portrait: undefined,
  initials: "OT",
};

it("shows the scene as a low banner with the person tabs, and no card and no strip button", async () => {
  const { host } = await mount(
    <PeopleColumn
      sceneName="The village square"
      backdrop={null}
      cards={[edda, tam]}
      statuses={{}}
      selectedId="edda"
      onSelect={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
      banner
      fixed
    />,
  );
  expect(host.querySelector(".play-view__scene--banner")).not.toBeNull();
  expect(host.querySelector(".play-person")).toBeNull();
  expect(host.querySelector(".play-people__toggle")).toBeNull();
  const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  expect(tabs.map((t) => t.textContent)).toEqual(["Edda", "Old Tam"]);
  // There is no card for a tab to point at.
  expect(tabs.every((t) => !t.hasAttribute("aria-controls"))).toBe(true);
});

it("has no strip button when the strip is not a choice", async () => {
  const { host } = await mount(
    <PeopleColumn
      sceneName="The village square"
      backdrop={null}
      cards={[edda]}
      statuses={{}}
      selectedId="edda"
      onSelect={() => {}}
      collapsed
      onToggleCollapsed={() => {}}
      fixed
    />,
  );
  expect(host.querySelector(".play-people--collapsed")).not.toBeNull();
  expect(host.querySelector(".play-people__toggle")).toBeNull();
});
