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

it("keeps a saved trust of 20 when the stance becomes friendly, until the author takes 60", async () => {
  const { choose, edda, host, done } = await mount();
  try {
    expect(edda().trust).toBe("20");
    await choose("Attitude of Edda", "friendly");
    expect(edda().stance).toBe("friendly");
    expect(edda().trust).toBe("20");
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Use suggested trust for Edda"]')!
        .click(),
    );
    expect(edda().trust).toBe("60");
    await choose("Attitude of Edda", "hostile");
    expect(edda().trust).toBe("60");
    expect(host.querySelector('select[aria-label="On reveal for Edda"]')).toBeNull();
  } finally {
    await done();
  }
});

it("hides a person until the success of an action, and offers wait or attack only for a hostile one", async () => {
  const { choose, edda, actor, box, host, done } = await mount();
  try {
    const action = box.campaign.scenes[0]!.encounter!.definition.interactions[0]!;
    await choose("Visibility of Edda", "hidden");
    expect(edda().hidden).toBeUndefined();
    await choose("Revealed by action for Edda", action.id);
    const fact = edda().hidden!.revealedBy;
    expect(actor().requiresFlags).toEqual([fact]);
    expect(
      box.campaign.scenes[0]!.encounter!.definition.interactions[0]!.success.effects.some(
        (e) => e.kind === "flag" && e.flag === fact,
      ),
    ).toBe(true);
    expect(host.querySelector('select[aria-label="Outcome for Edda"]')).toBeTruthy();
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

it("still lets the author pick an existing fact instead", async () => {
  const { choose, edda, actor, built, done } = await mount();
  try {
    const fact = adventureFacts(built.campaign)[0]!;
    await choose("Visibility of Edda", "hidden");
    await choose("Revealed by action for Edda", "__fact__");
    await choose("Revealed by for Edda", fact.id);
    expect(edda().hidden).toEqual({ revealedBy: fact.id });
    expect(actor().requiresFlags).toEqual([fact.id]);
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

it("warns about the arrival text and about action texts the player sees first, never changing them", async () => {
  const { choose, box, done } = await mount();
  try {
    const action = box.campaign.scenes[0]!.encounter!.definition.interactions[0]!;
    await choose("Visibility of Edda", "hidden");
    await choose("Revealed by action for Edda", action.id);
    const scene = box.campaign.scenes[0]!;
    const game = scene.encounter!;
    const warn = () =>
      storyboardWarnings(box.campaign, new Set(adventureFacts(box.campaign).map((f) => f.id)))
        .filter((w) => w.message.includes("mentions Edda"))
        .map((w) => w.message);
    // The action Edda is not the subject of is the one that reveals her; use a second one.
    game.definition.description = "Edda waits beside the well.";
    expect(warn().some((m) => m.startsWith("The arrival text"))).toBe(true);
    expect(game.definition.description).toBe("Edda waits beside the well.");
    game.definition.description = "A well in a quiet square.";
    expect(warn()).toEqual([]);
    const look = game.definition.interactions[1]!;
    delete look.counterpartyId;
    look.requiresFlags = [];
    look.label = "Look closer at Edda";
    expect(warn().some((m) => m.includes("name of the action"))).toBe(true);
    look.label = "Look closer";
    look.description = "You study Edda.";
    expect(warn().some((m) => m.includes("description of the action"))).toBe(true);
    // An action that only appears after the discovery, and the text of the discovery itself, may say her name.
    look.requiresFlags = [edda0(box)];
    expect(warn()).toEqual([]);
    game.definition.interactions[0]!.success.text = "You find Edda hiding.";
    expect(warn()).toEqual([]);
    expect(look.label).toBe("Look closer");
  } finally {
    await done();
  }
});

function edda0(box: { campaign: CampaignTemplate }) {
  return box.campaign.scenes[0]!.people[0]!.hidden!.revealedBy;
}
