import { useEffect, useId, useRef, useState } from "react";
import { OllamaProvider } from "@llm/providers/OllamaProvider";
import { OpenAICompatibleProvider } from "@llm/providers/OpenAICompatibleProvider";
import {
  discussGuideQuestion,
  guideAnswer,
  guideAssistantFields,
  guideWorldTargets,
  interpretGuideSynopsis,
  suggestGuideSceneText,
  synopsisOrder,
  type GuideExchange,
  type GuideWorldTarget,
  type SynopsisSuggestions,
} from "../../library/guideAssistant";
import {
  questionNames,
  type GuideInterview,
  type GuideQuestion,
} from "../../library/guideInterview";
import type { Provider } from "../../session/encounterAI";
import { useOptionalConnection } from "../connection/ConnectionProvider";
import { initialModel, installedModelName } from "../connection/connection";
import { useLanguageControls, useTranslate } from "../i18n/LanguageProvider";
import { type EditGuide, type WorldPart } from "./GuidePlanEditor";

const maxSynopsisLength = 12_000;
const worldTopics = {
  people: "cgPerson",
  place: "cgPlace",
  factions: "cgGroup",
  items: "cgItem",
  map: "cgWorldOrMap",
} as const;

function useGuideRequest() {
  const connection = useOptionalConnection();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"cgAiUnavailable" | "cgAiFailed">();
  const request = useRef<AbortController | null>(null);

  const backend = connection?.backend;
  const baseUrl = connection?.baseUrl;
  useEffect(() => {
    setPending(false);
    setError(undefined);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [backend, baseUrl]);

  function cancel() {
    request.current?.abort();
    request.current = null;
    setPending(false);
    setError(undefined);
  }

  async function send<T>(
    load: (provider: Provider, signal: AbortSignal) => Promise<T | null>,
    receive: (result: T) => void,
  ) {
    if (request.current) return;
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
      const result = await load(provider, controller.signal);
      if (controller.signal.aborted) return;
      if (result === null) setError("cgAiFailed");
      else receive(result);
    } catch {
      if (!controller.signal.aborted) setError("cgAiFailed");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  return { pending, error, cancel, send };
}

function GuideSuggestion({
  label,
  value,
  maxLength,
  disabled,
  change,
  apply,
  dismiss,
}: {
  label: string;
  value: string;
  maxLength: number;
  disabled?: boolean | undefined;
  change: (value: string) => void;
  apply: () => void;
  dismiss: () => void;
}) {
  const t = useTranslate();
  return (
    <div className="guide-assistant-suggestion">
      <label className="guide-field">
        <span>{t("cgAiEditSuggestion", { field: label })}</span>
        <textarea
          maxLength={maxLength}
          value={value}
          onChange={(event) => change(event.target.value)}
        />
      </label>
      <div className="guide-buttons">
        <button type="button" onClick={apply} disabled={disabled || !value.trim()}>
          {t("cgAiUseAnswer")}
        </button>
        <button type="button" onClick={dismiss}>
          {t("cgAiDismissSuggestion")}
        </button>
      </div>
    </div>
  );
}

function GuideRequestButtons({
  pending,
  cancel,
  send,
  synopsis,
  disabled,
}: {
  pending: boolean;
  cancel: () => void;
  send: () => void;
  synopsis?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslate();
  return (
    <div className="guide-buttons">
      {pending ? (
        <>
          <span role="status">{t("cgAiWaiting")}</span>
          <button type="button" onClick={cancel}>
            {t("cgAiCancel")}
          </button>
        </>
      ) : (
        <button type="button" disabled={disabled} onClick={send}>
          {t(synopsis ? "cgAiInterpret" : "cgAiSend")}
        </button>
      )}
    </div>
  );
}

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
  const [mode, setMode] = useState<"discussion" | "synopsis">();
  const [message, setMessage] = useState("");
  const [worldTarget, setWorldTarget] = useState<GuideWorldTarget>();
  const [exchanges, setExchanges] = useState<GuideExchange[]>([]);
  const [discussion, setDiscussion] = useState<{ revision: number; value: string }>();
  const [synopsis, setSynopsis] = useState<{
    original: string;
    suggestions: SynopsisSuggestions;
    emptyResult: boolean;
  }>();
  const [usedAction, setUsedAction] = useState<string>();
  const { pending, error, cancel, send } = useGuideRequest();
  const panel = useId();
  const targetOptions: GuideWorldTarget[] =
    worldPart === "map"
      ? draft.world.existingId
        ? []
        : ["mapName", "mapNote"]
      : worldPart
        ? [worldPart]
        : [];
  const activeTarget = worldTarget && targetOptions.includes(worldTarget) ? worldTarget : undefined;
  const answer = guideAnswer(draft, question, choice, activeTarget);
  const [answerLabel, maxLength] = activeTarget
    ? guideWorldTargets[activeTarget]
    : guideAssistantFields[question];
  const blankChoice = draft.choices.find(({ label, outcome }) => !label.trim() && !outcome.trim());
  const firstAction = draft.choices.find(({ label }) => label.trim());
  const synopsisFields = synopsisOrder.filter((field) => {
    if (field === "action" || field === "outcome") return !firstAction;
    const { change, value } = guideAnswer(draft, field);
    return change && !value.trim();
  });
  const canReadSynopsis = question === "idea" && !!draft.premise.trim();
  const synopsisChanged = synopsis && synopsis.original !== draft.premise;
  const discussionChanged = discussion && discussion.revision !== draft.revision;
  const synopsisTooLong = draft.premise.length > maxSynopsisLength;

  function toggle(next: typeof mode) {
    cancel();
    setDiscussion(undefined);
    setSynopsis(undefined);
    setUsedAction(undefined);
    setMode(mode === next ? undefined : next);
  }

  function ask() {
    if (disabled || !mode) return;
    if (mode === "synopsis") {
      void send(
        (provider, signal) => interpretGuideSynopsis(provider, draft, synopsisFields, signal),
        (suggestions) => {
          setSynopsis({
            original: draft.premise,
            suggestions,
            emptyResult: !Object.keys(suggestions).length,
          });
          setUsedAction(undefined);
        },
      );
    } else {
      const input = message.trim() || t("cgAiDefaultPrompt");
      const topic = worldPart
        ? `${t(questionNames[question])} ${t(worldTopics[worldPart])}`
        : t(questionNames[question]);
      void send(
        (provider, signal) =>
          discussGuideQuestion(
            provider,
            draft,
            question,
            topic,
            choice,
            input,
            exchanges,
            signal,
            activeTarget,
          ),
        (response) => {
          setExchanges((history) => [...history, { message: input, ...response }]);
          setDiscussion(
            response.suggestion
              ? { revision: draft.revision, value: response.suggestion }
              : undefined,
          );
          setMessage("");
        },
      );
    }
  }

  function setSynopsisField(field: keyof SynopsisSuggestions, value?: string) {
    if (!synopsis) return;
    const suggestions = { ...synopsis.suggestions };
    if (value === undefined) delete suggestions[field];
    else suggestions[field] = value;
    setSynopsis({ ...synopsis, suggestions });
  }

  function synopsisTarget(field: keyof SynopsisSuggestions) {
    const target = guideAnswer(draft, field, field === "outcome" ? firstAction : blankChoice);
    if (field === "action" && firstAction) return;
    if (field === "outcome" && (usedAction === undefined || firstAction?.label !== usedAction))
      return;
    if (!target.value.trim()) return target.change;
  }

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
              {question === "world" && (
                <>
                  {!!targetOptions.length && (
                    <label className="guide-field">
                      <span>{t("cgAiTarget")}</span>
                      <select
                        value={activeTarget ?? ""}
                        onChange={(event) => {
                          const selected = targetOptions.find(
                            (option) => option === event.target.value,
                          );
                          cancel();
                          setDiscussion(undefined);
                          setWorldTarget(selected);
                        }}
                      >
                        <option value="">{t("cgAiAdviceOnly")}</option>
                        {targetOptions.map((key) => (
                          <option key={key} value={key}>
                            {t(guideWorldTargets[key][0])}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {!activeTarget && <p>{t("cgAiChooseTarget")}</p>}
                </>
              )}
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
              {discussion && answer.change && (
                <>
                  <GuideSuggestion
                    label={t(answerLabel)}
                    maxLength={maxLength}
                    value={discussion.value}
                    disabled={pending || discussionChanged}
                    change={(value) => setDiscussion({ ...discussion, value })}
                    dismiss={() => setDiscussion(undefined)}
                    apply={() => {
                      if (discussionChanged || !answer.change) return;
                      edit(answer.change(discussion.value.trim()));
                      setDiscussion(undefined);
                    }}
                  />
                  {discussionChanged && <p>{t("cgAiAnswerChanged")}</p>}
                </>
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
                  {synopsis.emptyResult && <p>{t("cgAiNoSuggestions")}</p>}
                  {synopsisOrder.map((field) => {
                    const value = synopsis.suggestions[field];
                    if (value === undefined) return null;
                    const change = synopsisTarget(field);
                    const [label, length] = guideAssistantFields[field];
                    return (
                      <GuideSuggestion
                        key={field}
                        label={t(label)}
                        maxLength={length}
                        value={value}
                        disabled={!change || pending}
                        change={(text) => setSynopsisField(field, text)}
                        dismiss={() => setSynopsisField(field)}
                        apply={() => {
                          if (!change) return;
                          const text = value.trim();
                          edit(change(text));
                          if (field === "action") setUsedAction(text);
                          setSynopsisField(field);
                        }}
                      />
                    );
                  })}
                  {synopsis.suggestions.outcome !== undefined && !usedAction && (
                    <p>{t("cgAiUseActionFirst")}</p>
                  )}
                </div>
              )}
            </>
          )}
          <GuideRequestButtons
            pending={pending}
            cancel={cancel}
            send={ask}
            synopsis={mode === "synopsis"}
            disabled={
              mode === "synopsis" && (!canReadSynopsis || synopsisTooLong || !synopsisFields.length)
            }
          />
          {error && <p role="status">{t(error)}</p>}
        </div>
      )}
    </fieldset>
  );
}

export function GuideSceneAssistant({
  scene,
  field,
  value,
  change,
}: {
  scene: string;
  field: string;
  value: string;
  change: (value: string) => void;
}) {
  const t = useTranslate();
  const language = useLanguageControls()?.language ?? "en";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState<string>();
  const { pending, error, cancel, send } = useGuideRequest();
  const panel = useId();
  return (
    <div className="guide-assistant">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        onClick={() => {
          cancel();
          setSuggestion(undefined);
          setOpen(!open);
        }}
      >
        {t("cgAiDiscuss")}
      </button>
      {open && (
        <div className="guide-assistant-panel" id={panel}>
          <p>{t("cgAiConnectionHelp")}</p>
          <label className="guide-field">
            <span>{t("cgAiMessage")}</span>
            <textarea
              maxLength={1600}
              disabled={pending}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          {suggestion !== undefined && (
            <GuideSuggestion
              label={field}
              maxLength={800}
              value={suggestion}
              change={setSuggestion}
              dismiss={() => setSuggestion(undefined)}
              disabled={pending}
              apply={() => {
                change(suggestion.trim());
                setSuggestion(undefined);
              }}
            />
          )}
          <GuideRequestButtons
            pending={pending}
            cancel={cancel}
            send={() => {
              setSuggestion(undefined);
              void send(
                (provider, signal) =>
                  suggestGuideSceneText(
                    provider,
                    { scene, field, currentText: value, message: message.trim() },
                    language,
                    signal,
                  ),
                (result) => setSuggestion(result.suggestion),
              );
            }}
          />
          {error && <p role="status">{t(error)}</p>}
        </div>
      )}
    </div>
  );
}
