import { Modal } from "../components/Modal";
import { AppearanceSettingsContent } from "../themes/AppearanceDialog";
import { ConnectionHelp } from "../connection/ConnectionHelp";
import { useConnection } from "../connection/ConnectionProvider";

export function SettingsDialog({ onClose, initialSection = "appearance" }: { onClose: () => void; initialSection?: "appearance" | "ai" }) {
  const { preferredModel, chooseModel } = useConnection();
  return <Modal title="Settings" onClose={onClose} wide>
    <div className="sb-settings-layout">
      <section className="sb-settings-column" aria-label="Appearance and themes" id="appearance-settings">
        <h3 className="sb-settings-column__title">Appearance &amp; Themes</h3>
        <AppearanceSettingsContent onClose={onClose} />
      </section>
      <section className="sb-settings-column" aria-label="AI Settings" id="ai-settings">
        <h3 className="sb-settings-column__title">AI Settings</h3>
        <ConnectionHelp model={preferredModel} onModelChange={chooseModel} />
      </section>
    </div>
  </Modal>;
}
