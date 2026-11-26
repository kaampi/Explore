// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { PlayableStoryboard } from "../../src/ui/studio/PlayableStoryboard";
import { connectedAdventureExample } from "../../src/library/playableCampaign";
import { storyboardWarnings } from "../../src/ui/studio/storyboardReadiness";
import { adventureFacts } from "../../src/library/playableCampaign";
import type { CampaignTemplate } from "../../src/library/LibrarySchema";

async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const built = connectedAdventureExample(),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const box = { campaign: built.campaign as CampaignTemplate };
  function Harness() {
    const [campaign, setCampaign] = useState(built.campaign);
    box.campaign = campaign;
    return (
      <PlayableStoryboard
        campaign={campaign}
        places={built.places}
        characters={built.characters}
        objects={built.objects}
        busy={false}
        onChange={setCampaign}
        onPlay={() => {}}
      />
    );
  }
  await act(async () => root.render(<Harness />));
  const choose = async (label: string, value: string) => {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    expect(select, label).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(
        select,
        value,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const edda = () => box.campaign.scenes[0]!.people.find((p) => p.characterId)!;
  const actor = () =>
    Object.values(box.campaign.scenes[0]!.encounter!.state.actors).find((a) => a.name === "Edda")!;
  return {
    host,
    box,
    choose,
    edda,
    actor,
    built,
    done: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

it("sets friendly, suggests trust 60 once, and keeps it when the stance changes again", async () => {
  const { choose, edda, actor, host, done } = await mount();
  try {
    await choose("Attitude of Edda", "friendly");
    expect(edda().stance).toBe("friendly");
    expect(edda().trust).toBe("60");
    expect(actor().team).not.toBe("opponents");
    await choose("Attitude of Edda", "hostile");
    expect(actor().team).toBe("opponents");
    expect(edda().trust).toBe("60");
    expect(host.querySelector('select[aria-label="On reveal for Edda"]')).toBeNull();
  } finally {
    await done();
  }
});

it("hides a person until a chosen fact, and offers wait or attack only for a hostile one", async () => {
  const { choose, edda, actor, host, built, done } = await mount();
  try {
    const fact = adventureFacts(built.campaign)[0]!;
    await choose("Visibility of Edda", "hidden");
    expect(edda().hidden).toBeUndefined();
    await choose("Revealed by for Edda", fact.id);
    expect(edda().hidden).toEqual({ revealedBy: fact.id });
    expect(actor().requiresFlags).toEqual([fact.id]);
    expect(host.querySelector('select[aria-label="On reveal for Edda"]')).toBeNull();
    await choose("Attitude of Edda", "hostile");
    await choose("On reveal for Edda", "attack");
    expect(edda().onReveal).toBe("attack");
    expect(actor().onReveal).toBe("attack");
    await choose("Visibility of Edda", "visible");
    expect(edda().hidden).toBeUndefined();
    expect(actor().requiresFlags).toBeUndefined();
  } finally {
    await done();
  }
});

it("makes a new position from a name and keeps the person there after a rename", async () => {
  const { host, choose, edda, actor, box, done } = await mount();
  try {
    await choose("Position of Edda", "__new-position__");
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Name of the new position (Edda)"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "I taket",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Add (Edda)"]')!.click(),
    );
    const id = edda().positionId!;
    expect(actor().position).toBe(id);
    expect(edda().position).toBe("I taket");
    expect(box.campaign.scenes[0]!.encounter!.definition.places.some((p) => p.id === id)).toBe(
      true,
    );
  } finally {
    await done();
  }
});

it("warns when the author's own arrival text names a hidden person, and leaves the text alone", async () => {
  const { choose, box, built, done } = await mount();
  try {
    const fact = adventureFacts(built.campaign)[0]!;
    await choose("Visibility of Edda", "hidden");
    await choose("Revealed by for Edda", fact.id);
    const text = "Edda wait beside the well.";
    const scene = box.campaign.scenes[0]!;
    scene.encounter!.definition.description = text;
    const warnings = storyboardWarnings(
      box.campaign,
      new Set(adventureFacts(box.campaign).map((f) => f.id)),
    );
    expect(warnings.some((w) => w.message.includes("mentions Edda"))).toBe(true);
    expect(scene.encounter!.definition.description).toBe(text);
    scene.encounter!.definition.description = "A well in a quiet square.";
    expect(
      storyboardWarnings(box.campaign, new Set()).some((w) => w.message.includes("mentions Edda")),
    ).toBe(false);
  } finally {
    await done();
  }
});
