import { Modal } from "../components/Modal";
import { AppearanceSettingsContent } from "../themes/AppearanceDialog";
import { ConnectionHelp } from "../connection/ConnectionHelp";
import { useConnection } from "../connection/ConnectionProvider";
import { useAppearance } from "../themes/ThemeProvider";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { preferredModel, chooseModel } = useConnection();
  const { library, setShell, ready } = useAppearance();
  return <Modal title="Settings" onClose={onClose} wide>
    <div className="sb-settings-layout">
      <section className="sb-settings-column" aria-label="Appearance and themes" id="appearance-settings">
        <div className="sb-settings-appearance-heading">
          <h3 className="sb-settings-column__title">Appearance &amp; Themes</h3>
          <div className="sb-segment" role="group" aria-label="App appearance">
            {(["light", "dark"] as const).map((mode) => <button type="button" key={mode} disabled={!ready} aria-pressed={library.shell === mode} onClick={() => setShell(mode)}>{mode === "light" ? "Light" : "Dark"}</button>)}
          </div>
        </div>
        <AppearanceSettingsContent onClose={onClose} />
      </section>
      <section className="sb-settings-column" aria-label="AI Settings" id="ai-settings">
        <h3 className="sb-settings-column__title">AI Settings</h3>
        <ConnectionHelp model={preferredModel} onModelChange={chooseModel} />
      </section>
    </div>
  </Modal>;
}
