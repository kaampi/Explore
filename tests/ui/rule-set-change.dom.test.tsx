// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RuleSetChange } from "../../src/ui/studio/RuleSetChange";
import { connectedAdventureExample } from "../../src/library/playableCampaign";

async function mount(available: { id: string; name: string }[], onRemap = vi.fn()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample();
  built.campaign.scenes[0]!.encounter!.definition.interactions[0]!.check = {
    stat: "Persuasion",
    modifier: 0,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RuleSetChange campaign={built.campaign} available={available} onRemap={onRemap} />,
    ),
  );
  return {
    host,
    onRemap,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("lists a skill the new rule-set lacks with where it is used, and asks for a replacement", async () => {
  const ui = await mount([{ id: "might", name: "Might" }]);
  try {
    expect(ui.host.textContent).toContain("Skills that changed");
    expect(ui.host.textContent).toContain("Persuasion");
    expect(ui.host.textContent).toContain("Ask Edda about the messenger");
    const select = ui.host.querySelector<HTMLSelectElement>(
      'select[aria-label="Use instead of Persuasion"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        "might",
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(ui.onRemap).toHaveBeenCalledWith("Persuasion", "might");
  } finally {
    await ui.close();
  }
});

it("shows nothing when every skill in use is in the rule-set", async () => {
  const ui = await mount([
    { id: "Persuasion", name: "Persuasion" },
    { id: "Observation", name: "Observation" },
  ]);
  try {
    expect(ui.host.textContent).toBe("");
  } finally {
    await ui.close();
  }
});
