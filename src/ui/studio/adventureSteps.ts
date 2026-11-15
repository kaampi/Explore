import type { CampaignTemplate } from "../../library/LibrarySchema";
import type { StoryboardIssue } from "./storyboardReadiness";

export type AdventureStepId = "world" | "you" | "cast" | "scenes" | "connections" | "test";

export type AdventureStep = {
  id: AdventureStepId;
  label: string;
  done: boolean;
  /** A short status line, for example "2 of 3 ready". */
  note: string;
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The guided order for building an adventure, with what is finished so far.
 * Scenes, Connections and Test use the same readiness check as Storyboard.
 */
export function adventureSteps(
  campaign: CampaignTemplate,
  issues: readonly StoryboardIssue[],
): AdventureStep[] {
  const sceneCount = campaign.scenes.length;
  const unfinished = new Set(issues.flatMap((issue) => (issue.kind === "scene" ? [issue.id] : [])));
  const ready = sceneCount - unfinished.size;
  const linkCount = campaign.sceneLinks.length;
  const hasWorld = Boolean(campaign.realmId?.trim() || campaign.mapWorldId?.trim());
  const named = Boolean(campaign.name.trim());
  const youNamed = Boolean(campaign.player?.name.trim());
  const brokenLinks = issues.some((issue) => issue.kind === "link");
  // One scene needs no routes, but it must be built. Two or more need a working route.
  const connected =
    sceneCount >= 2 ? linkCount > 0 && !brokenLinks : sceneCount === 1 && unfinished.size === 0;
  const testable = sceneCount > 0 && issues.length === 0;
  return [
    {
      id: "world",
      label: "World",
      done: hasWorld && named,
      note: !named ? "Name it" : hasWorld ? "Chosen" : "Choose a world",
    },
    {
      id: "you",
      label: "You",
      done: youNamed,
      note: youNamed ? campaign.player!.name.trim() : "Name yourself",
    },
    {
      id: "cast",
      label: "Cast",
      done: campaign.people.length > 0,
      note:
        campaign.people.length > 0
          ? plural(campaign.people.length, "person", "people")
          : "Add who belongs",
    },
    {
      id: "scenes",
      label: "Scenes",
      done: sceneCount > 0 && unfinished.size === 0,
      note: `${ready} of ${sceneCount} ready`,
    },
    {
      id: "connections",
      label: "Connections",
      done: connected,
      note: plural(linkCount, "route", "routes"),
    },
    {
      id: "test",
      label: "Test",
      done: testable,
      note: issues.length
        ? `${issues.length} to finish`
        : sceneCount > 0
          ? "Ready to play"
          : "Add a scene",
    },
  ];
}
