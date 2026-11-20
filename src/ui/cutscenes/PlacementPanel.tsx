import type { CampaignTemplate } from "../../library/LibrarySchema";
import type { CutsceneFilm, CutscenePlacement } from "../../cutscenes/schema";
import { Button } from "../components/Button";
import { useTranslate } from "../i18n/LanguageProvider";
import { Pick } from "./CutsceneFields";

type Fact = { id: string; label: string };

function Checks({
  label,
  facts,
  checked,
  toggle,
}: {
  label: string;
  facts: Fact[];
  checked: string[];
  toggle: (flag: string, on: boolean) => void;
}) {
  return (
    <fieldset className="cutscene-field-group">
      <legend>{label}</legend>
      {facts.map(({ id, label: name }) => (
        <label key={id} className="playable-check">
          <input
            type="checkbox"
            checked={checked.includes(id)}
            onChange={(event) => toggle(id, event.target.checked)}
          />
          {name}
        </label>
      ))}
    </fieldset>
  );
}

function flagsAfter(flags: string[], flag: string, checked: boolean) {
  return checked ? [...new Set([...flags, flag])] : flags.filter((id) => id !== flag);
}

export function PlacementPanel({
  campaign,
  placement,
  films,
  facts,
  change,
  create,
  edit,
}: {
  campaign: CampaignTemplate;
  placement: CutscenePlacement;
  films: CutsceneFilm[];
  facts: Fact[];
  change: (placement: CutscenePlacement) => void;
  create: () => void;
  edit: (film: CutsceneFilm) => void;
}) {
  const t = useTranslate();
  const film = films.find(({ id }) => id === placement.filmId);
  const { trigger } = placement;
  const types: CutscenePlacement["trigger"]["kind"][] = [
    ...(campaign.sceneLinks.length || trigger.kind === "link" ? ["link" as const] : []),
    ...(campaign.scenes.length || trigger.kind === "scene" ? ["scene" as const] : []),
    ...(facts.length || trigger.kind === "facts" ? ["facts" as const] : []),
  ];
  return (
    <section className="cutscene-placement-panel" aria-label={t("csPlacement")}>
      <div className="storyboard-panel-heading">
        <small>{t("csPlacement")}</small>
        <h3>{film?.title ?? t("csMissingFilm")}</h3>
      </div>
      <label className="cutscene-field">
        <span>{t("csFilm")}</span>
        <select
          value={placement.filmId}
          onChange={(event) => change({ ...placement, filmId: event.target.value })}
        >
          {!film && <option value={placement.filmId}>{t("csMissingFilm")}</option>}
          {films.map(({ id, title }) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <div className="cutscene-studio__actions">
        <Button onClick={create}>{t("csCreateFilm")}</Button>
        <Button disabled={!film} onClick={() => film && edit(film)}>
          {t("csEditFilm")}
        </Button>
      </div>
      <Pick
        label={t("csTrigger")}
        value={trigger.kind}
        options={types}
        onChange={(kind) => {
          if (kind === trigger.kind) return;
          const scene = campaign.scenes[0];
          const link = campaign.sceneLinks[0];
          const fact = facts[0];
          if (kind === "scene" && scene)
            change({ ...placement, trigger: { kind, sceneId: scene.id, every: false } });
          if (kind === "link" && link) change({ ...placement, trigger: { kind, linkId: link.id } });
          if (kind === "facts" && fact)
            change({ ...placement, trigger: { kind, flags: [fact.id] } });
        }}
      />
      {trigger.kind === "scene" && (
        <>
          <label className="cutscene-field">
            <span>{t("csValue_scene")}</span>
            <select
              value={trigger.sceneId}
              onChange={(event) =>
                change({ ...placement, trigger: { ...trigger, sceneId: event.target.value } })
              }
            >
              {campaign.scenes.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name || t("psUntitledScene")}
                </option>
              ))}
            </select>
          </label>
          <label className="cutscene-field">
            <span>{t("csAdvance")}</span>
            <select
              value={Number(trigger.every)}
              onChange={(event) =>
                change({ ...placement, trigger: { ...trigger, every: event.target.value === "1" } })
              }
            >
              <option value="0">{t("csFirstTime")}</option>
              <option value="1">{t("csEveryTime")}</option>
            </select>
          </label>
        </>
      )}
      {trigger.kind === "link" && (
        <label className="cutscene-field">
          <span>{t("csValue_link")}</span>
          <select
            value={trigger.linkId}
            onChange={(event) =>
              change({ ...placement, trigger: { ...trigger, linkId: event.target.value } })
            }
          >
            {campaign.sceneLinks.map((way) => (
              <option key={way.id} value={way.id}>
                {way.label.trim() ||
                  [
                    campaign.scenes.find(({ id }) => id === way.fromSceneId)?.name ||
                      t("psUntitledScene"),
                    campaign.scenes.find(({ id }) => id === way.toSceneId)?.name ||
                      t("psUntitledScene"),
                  ].join(" → ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {trigger.kind === "facts" && (
        <Checks
          label={t("csValue_facts")}
          facts={facts}
          checked={trigger.flags}
          toggle={(flag, checked) => {
            const flags = flagsAfter(trigger.flags, flag, checked);
            if (flags.length) change({ ...placement, trigger: { ...trigger, flags } });
          }}
        />
      )}
      <label className="cutscene-field cutscene-field--check">
        <input
          type="checkbox"
          checked={placement.showInStory}
          onChange={(event) => change({ ...placement, showInStory: event.target.checked })}
        />
        <span>{t("csShowStory")}</span>
      </label>
      <fieldset className="cutscene-field-group">
        <legend>{t("csAfterFilm")}</legend>
        <Checks
          label={t("csSetFlags")}
          facts={facts}
          checked={placement.setsFlags}
          toggle={(flag, checked) =>
            change({ ...placement, setsFlags: flagsAfter(placement.setsFlags, flag, checked) })
          }
        />
        <label className="cutscene-field">
          <span>{t("csMinutes")}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={placement.minutes ?? ""}
            onChange={(event) => {
              const minutes = event.target.valueAsNumber;
              if (Number.isFinite(minutes))
                change({ ...placement, minutes: Math.max(0, Math.floor(minutes)) });
              else {
                const { minutes: _minutes, ...withoutTime } = placement;
                change(withoutTime);
              }
            }}
          />
        </label>
      </fieldset>
    </section>
  );
}
