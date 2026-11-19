import { useState } from "react";
import { commandKind, type CommandGroup, type PublicCommand } from "../../game/catalog";
import type { EncounterGame } from "../../game/EncounterSchema";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
import { CommandIcon } from "./CommandIcon";

/**
 * "What do you do?": three suggestions and "More choices…", and below them one field with two
 * tabs, Talk and Act. What is typed is only ever turned into a proposal; the engine decides.
 */
export function WhatDoYouDo({
  game,
  suggestions,
  groups,
  mode,
  onMode,
  say,
  text,
  onSay,
  onText,
  busy,
  waiting,
  onCancelWaiting,
  onChoose,
  onSubmitSay,
  onSubmitDo,
  titleFor,
}: {
  game: EncounterGame;
  suggestions: PublicCommand[];
  groups: CommandGroup[];
  mode: "say" | "do";
  onMode: (mode: "say" | "do") => void;
  say: string;
  text: string;
  onSay: (value: string) => void;
  onText: (value: string) => void;
  busy: boolean;
  waiting: "interpreting" | "writing" | null;
  onCancelWaiting: () => void;
  onChoose: (command: PublicCommand) => void;
  onSubmitSay: () => void;
  onSubmitDo: () => void;
  /** The author's description of a choice, for its tooltip. */
  titleFor: (command: PublicCommand) => string | undefined;
}) {
  const t = useTranslate();
  const [all, setAll] = useState(false);
  const field = mode === "say" ? say : text;
  const groupName = {
    people: t("pvGroupPeople"),
    things: t("pvGroupThings"),
    places: t("pvGroupPlaces"),
    fight: t("pvGroupFight"),
  };
  return (
    <section className="play-do" id="play-do" tabIndex={-1} aria-labelledby="play-do-title">
      <h2 id="play-do-title" className="play-do__title">
        {t("pvWhatDoYouDo")}
      </h2>
      <div className="play-do__suggestions">
        {suggestions.map((command) => (
          <button
            key={JSON.stringify(command.action)}
            type="button"
            className="play-do__suggestion"
            disabled={busy}
            title={titleFor(command)}
            onClick={() => onChoose(command)}
          >
            <CommandIcon kind={commandKind(game, command)} />
            {command.label}
          </button>
        ))}
        <button
          type="button"
          className="play-do__more"
          aria-haspopup="dialog"
          onClick={() => setAll(true)}
        >
          {t("pvMoreChoices")}
        </button>
      </div>
      <div className="play-do__tabs" role="tablist" aria-label={t("pvWhatDoYouDo")}>
        {(["say", "do"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`play-do-tab-${tab}`}
            aria-selected={mode === tab}
            aria-controls="play-do-panel"
            tabIndex={mode === tab ? 0 : -1}
            className="play-do__tab"
            onClick={() => onMode(tab)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                onMode(tab === "say" ? "do" : "say");
              }
            }}
          >
            {tab === "say" ? t("pvTabTalk") : t("pvTabAct")}
          </button>
        ))}
      </div>
      <div
        className="play-do__panel"
        id="play-do-panel"
        role="tabpanel"
        aria-labelledby={`play-do-tab-${mode}`}
      >
        {waiting && (
          <p role="status">
            {waiting === "interpreting" ? "Working out what you mean…" : "Writing the reply…"}{" "}
            <button type="button" onClick={onCancelWaiting}>
              Cancel
            </button>
          </p>
        )}
        <textarea
          rows={3}
          disabled={busy}
          value={field}
          maxLength={1000}
          aria-label={mode === "say" ? t("epSaySomething") : t("epDoSomething")}
          onChange={(event) =>
            mode === "say" ? onSay(event.target.value) : onText(event.target.value)
          }
          placeholder={mode === "say" ? t("epYourCharacterSWords") : t("epDescribeTheTargetAnd")}
        />
        <div className="play-do__submit">
          {mode === "do" && <small>{t("pvDoHint")}</small>}
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={busy || !field.trim()}
            onClick={mode === "say" ? onSubmitSay : onSubmitDo}
          >
            {mode === "say" ? t("epSay") : t("epReviewAction")}
          </button>
        </div>
      </div>
      {all && (
        <Modal title={t("pvAllChoices")} onClose={() => setAll(false)}>
          {groups.map((entry) => (
            <section key={entry.group} className="play-do__group">
              <h3>{groupName[entry.group]}</h3>
              <ul>
                {entry.commands.map((command) => (
                  <li key={JSON.stringify(command.action)}>
                    <button
                      type="button"
                      className="play-do__choice"
                      aria-disabled={command.blocked ? true : undefined}
                      title={titleFor(command)}
                      onClick={() => {
                        if (command.blocked || busy) return;
                        setAll(false);
                        onChoose(command);
                      }}
                    >
                      <CommandIcon kind={commandKind(game, command)} />
                      <span>
                        {command.label}
                        {command.blocked && (
                          <small className="play-do__reason">{command.blocked}</small>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-button sb-button--secondary"
              onClick={() => setAll(false)}
            >
              {t("pvClose")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
