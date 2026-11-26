/**
 * The contract between Storyboard and the AI help panel. See docs/storyboard-ai.sv.md.
 *
 * THIS FILE IS OWNED BY THE CLAUDE TRACK (Storyboard) BUT REVIEWED BY BOTH TRACKS. The panel
 * (`src/ui/studio/assist/`, built by the ChatGPT track) is written against these types, so a change
 * here goes through the product owner to the other track's reviewer first (`ownership.sv.md`).
 *
 * Storyboard hands the panel a request, and gets two things back while the panel is open:
 *
 * - `onPreview(preview)`: what the panel proposes right now. Storyboard draws it dashed on the
 *   canvas and saves nothing. Each preview replaces the one before it entirely; `null` removes it.
 * - `onClose(result)`: exactly once for each opening. The panel has saved what the author chose,
 *   if anything, before it calls. Storyboard then reads the adventure again.
 */
import type { ReactNode } from "react";
import type { AuthoringPatch, TextRef } from "../../library/authoringPatch";

/** Fördjupa scenen, Fortsätt härifrån, Utveckla texten. */
export type AssistIntent = "deepen" | "continue" | "rewrite";

/** What the help is about: a scene, a route, or one text. */
export type AssistTarget = { sceneId: string } | { linkId: string } | { text: TextRef };

/** `openAssist(...)`: what Storyboard asks the panel to help with. */
export type OpenAssist = {
  campaignId: string;
  intent: AssistIntent;
  target: AssistTarget;
  /** Set when the author asks for more from inside a test play. */
  fromPlaytest?: { sceneId: string; carried: string[]; facts: string[]; turns: number };
};

/** One proposal. `key` is the letter or number the author sees on the canvas and in the panel. */
export type AssistProposal = { key: string; selected: boolean; patch: AuthoringPatch };

/** `previewAssist(...)`: the proposals as they stand, and the one the pointer is over. */
export type AssistPreview = { proposals: AssistProposal[]; hoverKey?: string } | null;
export type PreviewAssist = (preview: AssistPreview) => void;

/** `onAssistClose(...)`: the panel is closed. `changed` is true only when it saved something. */
export type AssistClose = {
  changed: boolean;
  newSceneIds: string[];
  focus?: { sceneId: string } | { linkId: string };
};
export type OnAssistClose = (result: AssistClose) => void;

/** What Storyboard gives the panel when it renders it. */
export type AssistPanelProps = {
  request: OpenAssist;
  onPreview: PreviewAssist;
  onClose: OnAssistClose;
};

/**
 * How the panel is plugged into Storyboard: a function that draws it. With none, Storyboard shows
 * no way in at all, so there is never a button that does nothing.
 */
export type RenderAssist = (props: AssistPanelProps) => ReactNode;
