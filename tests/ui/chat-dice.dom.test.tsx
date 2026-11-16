// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ActionCheckDialog } from "../../src/ui/components/ActionCheckDialog";
import legacy from "../fixtures/legacy-gate-session.json";
import { SessionSchema } from "../../src/state/StateSchema";
vi.mock("../../src/ui/components/DiceTray", () => ({
  DiceTray: ({ roll }: { roll: number }) => <div data-testid="animated-dice">{roll}</div>,
}));
vi.mock("../../src/ui/diceSound", () => ({
  DiceSound: class {
    close() {}
    setEnabled() {}
  },
}));
/** A chat session with a rule-set and a persuasion value, made from a saved older session. */
function chatSession() {
  const saved = structuredClone(legacy) as Record<string, unknown>;
  delete saved.gateEncounter;
  return SessionSchema.parse(saved);
}
it("closes the preparation dialog and rolls on the chat surface without a second roll", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const close = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    close();
    this.removeAttribute("open");
  };
  const random = vi.spyOn(Math, "random").mockReturnValue(0.36),
    host = document.createElement("div");
  host.className = "chat-panel";
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ActionCheckDialog session={chatSession()} onClose={() => {}} onContinue={() => {}} />,
      ),
    );
    const before = random.mock.calls.length;
    const roll = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Roll the dice",
    )!;
    await act(async () => roll.click());
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.querySelector(".chat-dice-roll")).toBeTruthy();
    expect(host.querySelector('[data-testid="animated-dice"]')?.textContent).toBe("37");
    expect(random.mock.calls.length).toBe(before + 1);
    expect(close).toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    random.mockRestore();
    host.remove();
  }
});
