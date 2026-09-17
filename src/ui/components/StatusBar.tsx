import { useEngine } from "../EngineStore";
import { inspectPromptBudget } from "@context/promptBudget";
import { OllamaModelPicker } from "./OllamaModelPicker";
import { ReplyLengthPicker } from "./ReplyLengthPicker";

export function StatusBar() {
  const { useSession, phase, ollamaModel, setOllamaModel, setMaxReplyTokens, resetSession } =
    useEngine();
  const session = useSession();

  const budget = inspectPromptBudget(session);
  const dotClass = phase === "streaming" ? "chip__dot--busy" : phase === "error" ? "chip__dot--error" : "chip__dot--idle";
  const phaseLabel = phase === "streaming" ? "streaming" : phase === "error" ? "error" : "idle";

  return (
    <div className="status-bar">
      <span className="status-bar__brand">AI SANDBOX ENGINE</span>

      <span className="chip">
        <span className={`chip__dot ${dotClass}`} />
        {phaseLabel}
      </span>

      <span className="chip" title="Estimated Pass 1 prompt tokens vs. the 3,500 target">
        ctx {budget.promptTokens} / {budget.targetTokens}
        {budget.overTarget ? " (over target)" : ""}
      </span>

      {budget.droppedBlocks > 0 && (
        <span className="chip" style={{ borderColor: "var(--accent-danger)", color: "var(--accent-danger)" }}>
          {budget.droppedBlocks} dropped
        </span>
      )}

      {budget.injectionFindings > 0 && (
        <span className="chip" style={{ borderColor: "var(--accent-danger)", color: "var(--accent-danger)" }}>
          {budget.injectionFindings} injection signal
          {budget.injectionFindings > 1 ? "s" : ""}
        </span>
      )}

      <span style={{ flex: 1 }} />

      <OllamaModelPicker model={ollamaModel} onChange={setOllamaModel} />
      <ReplyLengthPicker
        tokens={session.runtime.maxReplyTokens}
        onChange={setMaxReplyTokens}
      />

      <button
        className="chip"
        style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}
        onClick={() => {
          const fromCampaign = Boolean(session.campaignId);
          const ok = confirm(
            fromCampaign
              ? "Leave this scene? You'll return to the campaign. Chat is cleared. Edit the agreement before you Start the next scene."
              : "Start a new scene? This clears the current session."
          );
          if (ok) void resetSession();
        }}
        title={
          session.campaignId
            ? "Clear this night and return to the campaign"
            : "Clear the current scene and return to Studio"
        }
      >
        new scene
      </button>
    </div>
  );
}
