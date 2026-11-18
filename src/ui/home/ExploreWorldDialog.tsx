import { useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import type { RealmTemplate, RulesetTemplate, PlaceTemplate } from "@library/LibrarySchema";
import { emptyCampaignPlayer } from "@library/LibrarySchema";
import type { Session } from "@state/StateSchema";
import { Modal } from "../components/Modal";
import { useTranslate } from "../i18n/LanguageProvider";
import { startablePlaces, startWorldExploration } from "@session/worldStart";

/**
 * Free play in a world: who you are, where you begin, and optionally a rule-set. The world's map
 * becomes an adventure for this game only; nothing is added to the library.
 */
export function ExploreWorldDialog({
  repo,
  world,
  places,
  rulesets,
  sessionId,
  model,
  onStart,
  onClose,
}: {
  repo: IndexedDBRepository;
  world: RealmTemplate;
  places: PlaceTemplate[];
  rulesets: RulesetTemplate[];
  sessionId: string;
  model?: string | undefined;
  onStart: (session: Session) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslate();
  const choices = startablePlaces(world, places);
  const [name, setName] = useState("Traveller");
  const [appearance, setAppearance] = useState("");
  const [personality, setPersonality] = useState("");
  const [startNodeId, setStartNodeId] = useState(choices[0]?.nodeId ?? "");
  const [rulesetId, setRulesetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withNumbers = rulesets.filter((set) => set.attributes.some((a) => a.kind === "number"));

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const [characters, objects, anatomyTemplates, factions] = await Promise.all([
        repo.listCharacters(),
        repo.listObjects(),
        repo.listAnatomyTemplates(),
        repo.listFactions(),
      ]);
      const { session } = startWorldExploration(
        world,
        { characters, objects, places, rulesets, anatomyTemplates, factions },
        {
          player: {
            ...emptyCampaignPlayer(),
            name: name.trim() || "Traveller",
            appearance: appearance.trim(),
            personality: personality.trim(),
          },
          startNodeId,
          ...(rulesetId ? { rulesetId } : {}),
        },
        sessionId,
        model,
      );
      await onStart(session);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start exploring this world.");
      setBusy(false);
    }
  }

  return (
    <Modal title={t("exploreTitle", { name: world.name })} onClose={onClose}>
      <p className="sb-muted">{t("exploreIntro")}</p>
      <label className="sb-field">
        {t("yourName")}
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="sb-field">
        {t("howYouLook")} <span className="sb-muted">{t("optional")}</span>
        <textarea
          rows={2}
          value={appearance}
          onChange={(event) => setAppearance(event.target.value)}
        />
      </label>
      <label className="sb-field">
        {t("whoYouAre")} <span className="sb-muted">{t("optional")}</span>
        <textarea
          rows={2}
          value={personality}
          onChange={(event) => setPersonality(event.target.value)}
        />
      </label>
      <label className="sb-field">
        {t("startAt")}
        <select
          aria-label={t("startAt")}
          value={startNodeId}
          onChange={(event) => setStartNodeId(event.target.value)}
        >
          {choices.map((choice) => (
            <option key={choice.nodeId} value={choice.nodeId}>
              {choice.path}
            </option>
          ))}
        </select>
      </label>
      {withNumbers.length > 0 && (
        <label className="sb-field">
          {t("ruleSet")} <span className="sb-muted">{t("optional")}</span>
          <select
            aria-label={t("ruleSet")}
            value={rulesetId}
            onChange={(event) => setRulesetId(event.target.value)}
          >
            <option value="">{t("basicRules")}</option>
            {withNumbers.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {choices.length === 0 && <p className="sb-muted">{t("noPlacesOnMap")}</p>}
      {error && (
        <p role="alert" className="sb-error">
          {error}
        </p>
      )}
      <div className="sb-dialog__actions">
        <button
          type="button"
          className="sb-button"
          disabled={busy || !startNodeId}
          onClick={() => void begin()}
        >
          {busy ? t("opening") : t("exploreButton")}
        </button>
      </div>
    </Modal>
  );
}
