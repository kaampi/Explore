// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import legacy from "../fixtures/legacy-gate-session.json";
import { SessionSchema, type Session } from "../../src/state/StateSchema";
import { LegacyGatePanel } from "../../src/ui/components/LegacyGatePanel";
import { IndexedDBRepository } from "../../src/persistence/IndexedDBRepository";

const load = (): Session => SessionSchema.parse(structuredClone(legacy));

async function mount(onStartNew = vi.fn(), onHome = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const repo = new IndexedDBRepository(new IDBFactory(), "legacy-gate");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const session = load();
  await act(async () =>
    root.render(
      <LegacyGatePanel session={session} repo={repo} onStartNew={onStartNew} onHome={onHome} />,
    ),
  );
  return {
    host,
    session,
    onStartNew,
    onHome,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("still loads a saved gatehouse conversation with its old state", () => {
  const session = load();

  expect(session.gateEncounter?.phase).toBe("exploration");
  expect(session.gateEncounter?.gateLocked).toBe(true);
});

it("shows the conversation read only, says it was replaced, and offers the new gatehouse", async () => {
  const ui = await mount();
  try {
    expect(ui.host.textContent).toContain("has been replaced");
    expect(ui.host.textContent).toContain("The city is closed for the night");
    const labels = Array.from(ui.host.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toContain("Start the new gatehouse");
    expect(ui.host.querySelector("textarea, input")).toBeNull();
    expect(labels.some((label) => /persuade|force|pick|attack/i.test(label ?? ""))).toBe(false);
  } finally {
    await ui.close();
  }
});

it("starts the new gatehouse from the button, and the talk can still be saved as an idea", async () => {
  const ui = await mount();
  try {
    const save = Array.from(ui.host.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Save as idea",
    );
    expect(save).toBeTruthy();
    await act(async () =>
      Array.from(ui.host.querySelectorAll("button"))
        .find((b) => b.textContent === "Start the new gatehouse")!
        .click(),
    );
    expect(ui.onStartNew).toHaveBeenCalledTimes(1);
  } finally {
    await ui.close();
  }
});
