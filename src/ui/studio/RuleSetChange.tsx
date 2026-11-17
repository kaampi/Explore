import { useTranslate } from "../i18n/LanguageProvider";
import type { CampaignTemplate } from "../../library/LibrarySchema";
import { skillsInUse } from "../../library/sceneParts";

/**
 * Shown in World when actions or weapons use skills the chosen rule-set does not have. Choosing
 * a replacement changes every use of the old skill at once.
 */
export function RuleSetChange({
  campaign,
  available,
  onRemap,
}: {
  campaign: CampaignTemplate;
  /** The skills of the chosen rule-set. */
  available: { id: string; name: string }[];
  onRemap: (fromId: string, toId: string) => void;
}) {
  const t = useTranslate();
  const missing = skillsInUse(campaign).filter(
    (skill) => !available.some((option) => option.id === skill.id),
  );
  if (missing.length === 0 || available.length === 0) return null;
  return (
    <section className="rule-set-change" aria-label="Skills that changed">
      <p className="panel-heading">{t("rscHeading")}</p>
      <p className="form-section__lede">{t("rscLede")}</p>
      {missing.map((skill) => (
        <div key={skill.id} className="rule-set-change__row">
          <strong>{skill.name}</strong>
          <ul>
            {skill.uses.map((use) => (
              <li key={use}>{use}</li>
            ))}
          </ul>
          <select
            aria-label={`Use instead of ${skill.name}`}
            value=""
            onChange={(event) => event.target.value && onRemap(skill.id, event.target.value)}
          >
            <option value="">{t("rscChoose")}</option>
            {available.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}
