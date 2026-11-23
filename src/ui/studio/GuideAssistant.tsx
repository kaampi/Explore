import { useEffect, useId, useRef, useState } from "react";
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { OpenAICompatibleProvider } from "@llm/providers/OpenAICompatibleProvider";
import {
  discussGuideQuestion,
  guideAnswer,
  guideAssistantFields,
  interpretGuideSynopsis,
  synopsisOrder,
  type GuideExchange,
  type SynopsisSuggestions,
} from "../../library/guideAssistant";
import {
  questionNames,
  type GuideInterview,
  type GuideQuestion,
} from "../../library/guideInterview";
import { useOptionalConnection } from "../connection/ConnectionProvider";
import { initialModel, installedModelName } from "../connection/connection";
import { useTranslate } from "../i18n/LanguageProvider";
import { type EditGuide, type WorldPart } from "./GuidePlanEditor";

const maxSynopsisLength = 12_000;
const worldTopics = {
  people: "cgPerson",
  place: "cgPlace",
  factions: "cgGroup",
  items: "cgItem",
  map: "cgWorldOrMap",
} as const;

export function GuideAssistant({
  draft,
  question,
  choice,
  worldPart,
  disabled,
  edit,
}: {
  draft: GuideInterview;
  question: GuideQuestion;
  choice: GuideInterview["choices"][number] | undefined;
  worldPart: WorldPart | undefined;
  disabled: boolean;
  edit: EditGuide;
}) {
  const t = useTranslate();
  const connection = useOptionalConnection();
  const [mode, setMode] = useState<"discussion" | "synopsis">();
  const [message, setMessage] = useState("");
  const [exchanges, setExchanges] = useState<GuideExchange[]>([]);
  const [discussion, setDiscussion] = useState<{ original: string; used: boolean }>();
  const [synopsis, setSynopsis] = useState<{
    original: string;
    suggestions: SynopsisSuggestions;
  }>();
  const [usedFields, setUsedFields] = useState<(keyof SynopsisSuggestions)[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"cgAiUnavailable" | "cgAiFailed">();
  const request = useRef<AbortController | null>(null);
  const panel = useId();
  const answer = guideAnswer(draft, question, choice);
  const suggestion = exchanges.at(-1)?.suggestion;
  const applyDiscussion = answer.change;
  const blankChoice = draft.choices.find(({ label, outcome }) => !label.trim() && !outcome.trim());
  const firstAction = draft.choices.find(({ label }) => label.trim());
  const synopsisFields = synopsisOrder.filter((field) => {
    if (field === "action" || field === "outcome") return !firstAction;
    const { change, value } = guideAnswer(draft, field);
    return change && !value.trim();
  });
  const canReadSynopsis = question === "idea" && !!draft.premise.trim();

  useEffect(() => () => request.current?.abort(), []);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setPending(false);
  }

  function toggle(next: typeof mode) {
    cancel();
    setError(undefined);
    setMode(mode === next ? undefined : next);
  }

  async function send() {
    if (request.current || disabled || !mode) return;
    if (!connection) {
      setError("cgAiUnavailable");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const discovery =
        connection.discovery.state === "available"
          ? connection.discovery
          : await connection.refresh();
      if (controller.signal.aborted) return;
      const model = installedModelName(
        initialModel(connection.preferredModel, discovery.models),
        discovery.models,
      );
      if (discovery.state !== "available" || !model) {
        setError("cgAiUnavailable");
        return;
      }
      const provider =
        connection.backend === "strata"
          ? new OpenAICompatibleProvider({ model, baseUrl: connection.baseUrl })
          : new OllamaProvider({ model });
      if (mode === "synopsis") {
        const suggestions = await interpretGuideSynopsis(
          provider,
          draft,
          synopsisFields,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (suggestions) {
          setSynopsis({ original: draft.premise, suggestions });
          setUsedFields([]);
        } else {
          setError("cgAiFailed");
        }
      } else {
        const input = message.trim() || t("cgAiDefaultPrompt");
        const topic = worldPart
          ? `${t(questionNames[question])} ${t(worldTopics[worldPart])}`
          : t(questionNames[question]);
        const response = await discussGuideQuestion(
          provider,
          draft,
          question,
          topic,
          choice,
          input,
          exchanges,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (response) {
          setExchanges((history) => [...history, { message: input, ...response }]);
          setDiscussion({ original: answer.value, used: false });
          setMessage("");
        } else {
          setError("cgAiFailed");
        }
      }
    } catch {
      if (!controller.signal.aborted) setError("cgAiFailed");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  function synopsisTarget(field: keyof SynopsisSuggestions) {
    const target = guideAnswer(draft, field, field === "outcome" ? firstAction : blankChoice);
    if (field === "action" && firstAction) return;
    if (
      field === "outcome" &&
      (!usedFields.includes("action") || firstAction?.label !== synopsis?.suggestions.action)
    )
      return;
    if (!target.value.trim()) return target.change;
  }

  const synopsisChanged = synopsis && synopsis.original !== draft.premise;
  const discussionChanged = discussion && discussion.original !== answer.value;
  const synopsisTooLong = draft.premise.length > maxSynopsisLength;

  return (
    <fieldset className="guide-assistant" disabled={disabled}>
      <div className="guide-buttons">
        <button
          type="button"
          aria-expanded={mode === "discussion"}
          aria-controls={mode === "discussion" ? panel : undefined}
          onClick={() => toggle("discussion")}
        >
          {t("cgAiDiscuss")}
        </button>
        {(canReadSynopsis || mode === "synopsis") && (
          <button
            type="button"
            aria-expanded={mode === "synopsis"}
            aria-controls={mode === "synopsis" ? panel : undefined}
            onClick={() => toggle("synopsis")}
          >
            {t("cgAiSynopsis")}
          </button>
        )}
      </div>
      {mode && (
        <div id={panel} className="guide-assistant-panel">
          <p>{t("cgAiConnectionHelp")}</p>
          {mode === "discussion" ? (
            <>
              <div role="log" aria-label={t("cgAiDiscuss")}>
                {exchanges.map(({ message: author, reply }, index) => (
                  <div key={index} className="guide-assistant-turn">
                    <p>
                      <strong>{t("cgAiAuthor")}</strong>
                      <br />
                      {author}
                    </p>
                    <p>
                      <strong>{t("cgAiAssistant")}</strong>
                      <br />
                      {reply}
                    </p>
                  </div>
                ))}
              </div>
              {suggestion && discussion && !discussion.used && applyDiscussion && (
                <div className="guide-assistant-suggestion">
                  <strong>{t(guideAssistantFields[question][0])}</strong>
                  <p>{suggestion}</p>
                  <button
                    type="button"
                    disabled={pending || discussionChanged}
                    onClick={() => {
                      if (discussionChanged) return;
                      edit(applyDiscussion(suggestion));
                      setDiscussion({ ...discussion, used: true });
                    }}
                  >
                    {t("cgAiUseAnswer")}
                  </button>
                  {discussionChanged && <p>{t("cgAiAnswerChanged")}</p>}
                </div>
              )}
              <label className="guide-field">
                <span>{t("cgAiMessage")}</span>
                <textarea
                  maxLength={1600}
                  value={message}
                  disabled={pending}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <p>{t("cgAiSynopsisHelp")}</p>
              {synopsisTooLong && <p>{t("cgAiSynopsisTooLong", { limit: maxSynopsisLength })}</p>}
              {!synopsisFields.length && <p>{t("cgAiNoEmptyAnswers")}</p>}
              {synopsisChanged && <p>{t("cgAiSynopsisChanged")}</p>}
              {synopsis && !synopsisChanged && (
                <div aria-live="polite">
                  {!Object.keys(synopsis.suggestions).length && <p>{t("cgAiNoSuggestions")}</p>}
                  {synopsisOrder.map((field) => {
                    const value = synopsis.suggestions[field];
                    if (!value) return null;
                    const change = synopsisTarget(field);
                    const used = usedFields.includes(field);
                    return (
                      <div key={field} className="guide-assistant-suggestion">
                        <strong>{t(guideAssistantFields[field][0])}</strong>
                        <p>{value}</p>
                        {used ? (
                          <p>{t("cgAiUsed")}</p>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={!change || pending}
                              onClick={() => {
                                if (!change) return;
                                edit(change(value));
                                setUsedFields((fields) => [...fields, field]);
                              }}
                            >
                              {t("cgAiUseAnswer")}
                            </button>
                            {field === "outcome" && !usedFields.includes("action") && (
                              <p>{t("cgAiUseActionFirst")}</p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="guide-buttons">
            {pending ? (
              <>
                <span role="status">{t("cgAiWaiting")}</span>
                <button type="button" onClick={cancel}>
                  {t("cgAiCancel")}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={
                  mode === "synopsis" &&
                  (!canReadSynopsis || synopsisTooLong || !synopsisFields.length)
                }
                onClick={() => void send()}
              >
                {t(mode === "synopsis" ? "cgAiInterpret" : "cgAiSend")}
              </button>
            )}
          </div>
          {error && <p role="status">{t(error)}</p>}
        </div>
      )}
    </fieldset>
  );
}
