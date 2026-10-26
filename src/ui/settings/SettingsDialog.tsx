import { Modal } from "../components/Modal";
import { AppearanceSettingsContent } from "../themes/AppearanceDialog";
import { ConnectionHelp } from "../connection/ConnectionHelp";
import { useConnection } from "../connection/ConnectionProvider";
import { useLanguage } from "../i18n/LanguageProvider";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { preferredModel, chooseModel } = useConnection();
  const { t } = useLanguage();
  return <Modal title={t("settings")} onClose={onClose} wide>
    <div className="sb-settings-layout">
      <section className="sb-settings-column" aria-label="Appearance and themes" id="appearance-settings">
        <h3 className="sb-settings-column__title">{t("appearance")}</h3>
        <AppearanceSettingsContent onClose={onClose} />
      </section>
      <section className="sb-settings-column" aria-label="AI Settings" id="ai-settings">
        <h3 className="sb-settings-column__title">{t("ai")}</h3>
        <ConnectionHelp model={preferredModel} onModelChange={chooseModel} />
      </section>
    </div>
  </Modal>;
}
