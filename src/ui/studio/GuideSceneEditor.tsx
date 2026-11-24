import { useEffect, useRef, useState } from "react";
import { useTranslate } from "../i18n/LanguageProvider";
import {
  guideRevisionRows,
  GuideSceneConflictError,
  type GuideSceneDecision,
  type GuideSceneField,
  type GuideSceneSnapshot,
  type GuideSceneTarget,
} from "../../library/guideSceneRevision";
import type { IndexedDBRepository } from "../../persistence/IndexedDBRepository";
import type { Session } from "../../state/StateSchema";
import { Modal } from "../components/Modal";
import { GuideSceneAssistant } from "./GuideAssistant";
import { GuideText } from "./GuidePlanEditor";
import { startSavedGuideAdventure } from "./guidePlaytest";
import { mergeGuideEdits, type EditConflict } from "../../library/guideConcurrentEdit";
import "./adventure-guide.css";

export function GuideSceneEditor({
  repo,
  target,
  close,
  onPlay,
  openStoryboard,
}: {
  repo: IndexedDBRepository;
  target: GuideSceneTarget;
  close: () => void;
  onPlay?: ((session: Session) => Promise<void>) | undefined;
  openStoryboard?: ((target: GuideSceneTarget) => void) | undefined;
}) {
  const t = useTranslate();
  function fieldLabel(field: GuideSceneField | undefined) {
    if (!field) return t("cgRemovedField");
    switch (field.kind) {
      case "name":
        return t("cgSceneName");
      case "arrival":
        return t("cgArrivalField");
      case "outcome":
        return t("cgOutcomeField", { name: field.recordName });
      case "item":
        return t("cgItemField", { name: field.recordName });
    }
  }
  function textProposal(field: GuideSceneField): string | undefined {
    if (field.kind !== "arrival" && field.kind !== "outcome") return undefined;
    return (
      field.current.match(/^.+?[.!?](?=\s)/)?.[0] ??
      t(field.kind === "arrival" ? "cgSuggestArrival" : "cgSuggestOutcome", {
        text: field.current.trim(),
      }).trim()
    );
  }
  const { campaignId, sceneId } = target;
  const [snapshot, setSnapshot] = useState<GuideSceneSnapshot>();
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [review, setReview] = useState<GuideSceneSnapshot>();
  const [decisions, setDecisions] = useState<Record<string, GuideSceneDecision>>({});
  const [draftConflicts, setDraftConflicts] = useState<EditConflict[]>([]);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    let active = true;
    void repo.loadGuideSceneRevision({ campaignId, sceneId }).then(
      (loaded) => {
        if (!active) return;
        setSnapshot(loaded);
        setChanges(loaded.revision.changes);
      },
      (reason: unknown) => {
        if (active) setError(reason);
      },
    );
    return () => {
      active = false;
    };
  }, [repo, campaignId, sceneId]);

  function change(id: string, value?: string) {
    setChanges((old) => {
      const next = { ...old };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
    setReview(undefined);
    setNotice("");
  }

  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(undefined);
    setNotice("");
    try {
      await operation();
    } catch (reason) {
      setError(reason);
      if (reason instanceof GuideSceneConflictError) setReview(undefined);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function save(forReview: boolean) {
    if (!snapshot || draftConflicts.length) return;
    void run(async () => {
      const latest = await repo.saveGuideSceneRevision(target, snapshot.revision.revision, changes);
      setSnapshot(latest);
      setChanges(latest.revision.changes);
      setDecisions({});
      setReview(forReview ? latest : undefined);
      if (!forReview) setNotice(t("cgRevisionSaved"));
    });
  }

  const rows = review ? guideRevisionRows(review) : [];
  const reviewReady =
    rows.length > 0 &&
    rows.every(
      ({ id, field, conflict, proposed }) =>
        field &&
        (!conflict || decisions[id]) &&
        (decisions[id] === "studio" || field.kind === "item" || proposed.trim()),
    );

  function chooseDraftValue(conflict: EditConflict, value: unknown) {
    change(conflict.path[0]!, typeof value === "string" ? value : undefined);
    setDraftConflicts((previous) => previous.filter(({ key }) => key !== conflict.key));
  }

  return (
    <Modal
      title={snapshot ? t("cgSceneTitle", { name: snapshot.title }) : t("cgEditScene")}
      wide
      onClose={() => {
        if (!busy) close();
      }}
    >
      <div className="guide-scene-revision">
        {!!error && (
          <p role="alert">
            {error instanceof GuideSceneConflictError
              ? t(snapshot ? "cgSceneConflict" : "cgSceneGone")
              : error instanceof Error
                ? error.message
                : String(error)}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {draftConflicts.map((conflict) => (
          <fieldset key={conflict.key} disabled={busy}>
            <legend>
              {fieldLabel(snapshot?.fields.find(({ id }) => id === conflict.path[0]))}
            </legend>
            <p>{typeof conflict.latest === "string" ? conflict.latest : "—"}</p>
            <button type="button" onClick={() => chooseDraftValue(conflict, conflict.latest)}>
              {t("cgLatestText")}
            </button>
            <p>{typeof conflict.local === "string" ? conflict.local : "—"}</p>
            <button type="button" onClick={() => chooseDraftValue(conflict, conflict.local)}>
              {t("cgMyText")}
            </button>
          </fieldset>
        ))}
        {!snapshot && !error && <p role="status">{t("cgRevisionLoading")}</p>}
        {applied ? (
          <div className="guide-buttons">
            {onPlay && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onPlay(
                      await startSavedGuideAdventure(
                        repo,
                        target.campaignId,
                        "guide-revision-playtest",
                      ),
                    );
                  })
                }
              >
                {t("cgPlaytest")}
              </button>
            )}
            {openStoryboard && (
              <button type="button" disabled={busy} onClick={() => openStoryboard(target)}>
                {t("cgSceneStoryboard")}
              </button>
            )}
          </div>
        ) : (
          snapshot && (
            <>
              {review ? (
                <section aria-label={t("cgCompare")}>
                  {rows.map(({ id, field, proposed, conflict }) => (
                    <article key={id} className="guide-plan-section">
                      <h3>{fieldLabel(field)}</h3>
                      <dl>
                        <dt>{t("cgPreviousGuide")}</dt>
                        <dd>{field?.baseline ?? t("cgNoPrevious")}</dd>
                        <dt>{t("cgCurrentText")}</dt>
                        <dd>{field?.current || t("cgEmptyText")}</dd>
                        <dt>{t("cgYourProposal")}</dt>
                        <dd>{proposed || t("cgEmptyText")}</dd>
                      </dl>
                      {field && conflict && (
                        <fieldset>
                          <legend>{t("cgChooseText")}</legend>
                          <label>
                            <input
                              type="radio"
                              name={id}
                              checked={decisions[id] === "studio"}
                              onChange={() => setDecisions({ ...decisions, [id]: "studio" })}
                            />
                            {t("cgKeepCurrent")}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={id}
                              checked={decisions[id] === "guide"}
                              onChange={() => setDecisions({ ...decisions, [id]: "guide" })}
                            />
                            {t("cgUseGuideEdit")}
                          </label>
                        </fieldset>
                      )}
                      {!field && (
                        <button type="button" disabled={busy} onClick={() => change(id)}>
                          {t("cgRemoveProposal")}
                        </button>
                      )}
                    </article>
                  ))}
                  <div className="guide-buttons">
                    <button
                      type="button"
                      disabled={busy || !reviewReady}
                      onClick={() =>
                        void run(async () => {
                          await repo.applyGuideSceneRevision(review, decisions);
                          setApplied(true);
                          setNotice(t("cgSceneUpdated"));
                        })
                      }
                    >
                      {t("cgApply")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setReview(undefined)}>
                      {t("cgContinue")}
                    </button>
                  </div>
                </section>
              ) : (
                <fieldset disabled={busy}>
                  <legend>{t("cgChooseField")}</legend>
                  {snapshot.fields.map((field) => (
                    <article key={field.id} className="guide-plan-section">
                      <h3>{fieldLabel(field)}</h3>
                      {changes[field.id] === undefined ? (
                        <>
                          <p>{field.current || t("cgEmptyText")}</p>
                          <button type="button" onClick={() => change(field.id, field.current)}>
                            {t("cgEditField", { name: fieldLabel(field).toLocaleLowerCase() })}
                          </button>
                        </>
                      ) : (
                        <>
                          <GuideText
                            label={fieldLabel(field)}
                            value={changes[field.id]!}
                            multiline
                            change={(value) => change(field.id, value)}
                          />
                          {field.kind === "item" && <p>{t("cgLocalItem")}</p>}
                          {textProposal(field) && (
                            <button
                              type="button"
                              onClick={() => change(field.id, textProposal(field))}
                            >
                              {t("cgSuggestText")}
                            </button>
                          )}
                          {(field.kind === "arrival" || field.kind === "outcome") &&
                            !draftConflicts.length &&
                            !error && (
                              <GuideSceneAssistant
                                key={JSON.stringify([
                                  campaignId,
                                  sceneId,
                                  field.id,
                                  snapshot.revision.revision,
                                  changes[field.id],
                                ])}
                                scene={snapshot.title}
                                field={fieldLabel(field)}
                                value={changes[field.id]!}
                                change={(value) => change(field.id, value)}
                              />
                            )}
                          <button type="button" onClick={() => change(field.id)}>
                            {t("cgRemoveProposal")}
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                  {Object.keys(changes)
                    .filter((id) => !snapshot.fields.some((field) => field.id === id))
                    .map((id) => (
                      <p key={id}>
                        {t("cgRemovedField")}{" "}
                        <button type="button" onClick={() => change(id)}>
                          {t("cgRemoveProposal")}
                        </button>
                      </p>
                    ))}
                  <div className="guide-buttons">
                    <button
                      type="button"
                      disabled={!Object.keys(changes).length || !!draftConflicts.length}
                      onClick={() => save(true)}
                    >
                      {t("cgReviewEdits")}
                    </button>
                    <button
                      type="button"
                      disabled={!!draftConflicts.length}
                      onClick={() => save(false)}
                    >
                      {t("cgSaveDraft")}
                    </button>
                    {openStoryboard && (
                      <button type="button" onClick={() => openStoryboard(target)}>
                        {t("cgSceneStoryboard")}
                      </button>
                    )}
                  </div>
                </fieldset>
              )}
              {!!error && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const latest = await repo.loadGuideSceneRevision(target);
                      const merged = mergeGuideEdits(
                        snapshot.revision.changes,
                        latest.revision.changes,
                        changes,
                      );
                      setSnapshot(latest);
                      setChanges(merged.value);
                      setDraftConflicts(merged.conflicts);
                      setReview(undefined);
                      setDecisions({});
                    })
                  }
                >
                  {t("cgReloadScene")}
                </button>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  );
}
