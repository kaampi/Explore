// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { innVisitExample } from "../../src/scenarios/innVisit";
import { startWorldExploration } from "../../src/session/worldStart";
import { emptyCampaignPlayer } from "../../src/library/LibrarySchema";
import { CastPanel } from "../../src/ui/components/CastPanel";

let context: unknown;
vi.mock("../../src/ui/EngineStore", () => ({ useEngine: () => context }));

function session() {
  const inn = innVisitExample();
  const common = inn.realm.worldMap!.nodes.find((n) => n.name === "Common room")!;
  const { session } = startWorldExploration(
    inn.realm,
    { characters: [], objects: [], places: [], rulesets: [] },
    { player: { ...emptyCampaignPlayer(), name: "Traveller" }, startNodeId: common.id },
    "cast-notes",
  );
  const run = session.adventure!;
  const kitchen = run.scenes.find((s) => s.name === "Kitchen")!;
  run.notes = {
    [run.currentSceneId]: ["The fire is always lit."],
    [kitchen.id]: ["The cook is deaf in one ear."],
  };
  return { session, kitchen };
}

it("lists the remembered lines of every place, here first, and forgets one from another place", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const { session: s, kitchen } = session();
  const forget = vi.fn(async () => {});
  context = {
    useSession: () => s,
    forgetPlaceNote: forget,
    toggleLayer: vi.fn(),
    addPlayerLayer: vi.fn(),
    setLayerKeywords: vi.fn(),
    removeLayer: vi.fn(),
    compactLayers: vi.fn(),
    compacting: false,
    setHandoff: vi.fn(),
    setOutgoingHandoff: vi.fn(),
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<CastPanel />));
  try {
    const text = host.textContent ?? "";
    expect(text).toContain("The fire is always lit.");
    expect(text).toContain("The cook is deaf in one ear.");
    expect(text.indexOf("Common room")).toBeLessThan(text.indexOf("Kitchen"));
    expect(text).toContain("Common room · here");

    const forgetCook = Array.from(host.querySelectorAll("button")).find((b) =>
      b.getAttribute("aria-label")?.startsWith("Forget: The cook"),
    )!;
    await act(async () => forgetCook.click());

    expect(forget).toHaveBeenCalledWith(kitchen.id, 0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
