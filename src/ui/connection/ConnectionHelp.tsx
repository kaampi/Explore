import { useState } from "react";
import { Modal } from "../components/Modal";
import { useConnection } from "./ConnectionProvider";
import { installedModelName, modelReadiness } from "./connection";

export function ConnectionHelp({
  model,
  onModelChange,
  disabled = false,
}: {
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}) {
  const { discovery, refresh, preferenceError } = useConnection();
  const status = modelReadiness(discovery, model);
  const titles = {
    checking: "Finding your local AI…",
    unavailable: "Your next conversation starts here.",
    empty: "Ollama is connected. Add a chat model next.",
    "missing-model": "Choose a model for this conversation.",
    ready: "You're ready to chat.",
  };
  return (
    <section className="sb-connection-help" aria-label="AI connection">
      <h3>{titles[status]}</h3>
      {status === "checking" && (
        <p className="sb-muted" role="status">
          Checking Ollama on this computer. You can keep exploring while we
          check.
        </p>
      )}
      {status === "unavailable" && (
        <>
          <p className="sb-muted">
            Your characters and themes are ready. To hear an AI reply, connect
            Ollama on your computer.
          </p>
          <ol className="sb-connection-steps">
            <li>
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Install Ollama
              </a>{" "}
              if needed, then open it.
            </li>
            <li>Download a chat model of your choice in Ollama.</li>
            <li>
              Come back here and select <strong>Try again</strong>.
            </li>
          </ol>
        </>
      )}
      {status === "empty" && (
        <p className="sb-muted">
          {discovery.unsupportedModels?.length
            ? "The installed models are for other tasks. Add a chat model in Ollama, then try again."
            : "Download a chat model in Ollama, then try again. SandboxAI will show your installed chat models here."}
        </p>
      )}
      {status === "missing-model" && (
        <p className="sb-muted">
          {model ? (
            <>
              The model <strong>{model}</strong> isn't in Ollama's installed
              list. Choose an available model below, or restore that model in
              Ollama.
            </>
          ) : (
            "Choose one of your installed models to begin."
          )}{" "}
          Your conversation stays here while you choose.
        </p>
      )}
      {status === "ready" && (
        <p className="sb-muted">
          Ollama is connected and <strong>{model}</strong> is installed. Your
          model choice is always yours to change.
        </p>
      )}
      {discovery.state === "available" && discovery.models.length > 0 && (
        <label className="sb-field">
          Chat model
          <select
            aria-label="Chat model"
            disabled={disabled}
            value={installedModelName(model, discovery.models) ?? ""}
            onChange={(event) => onModelChange(event.target.value)}
          >
            <option value="" disabled>
              Choose an installed model
            </option>
            {discovery.models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className="sb-link"
        disabled={status === "checking" || disabled}
        onClick={() => {
          void refresh();
        }}
      >
        {status === "ready" ? "Check connection" : "Try again"}
      </button>
      {(status === "unavailable" || status === "empty") && (
        <details className="sb-connection-details">
          <summary>Ollama is open, but still can't connect?</summary>
          <p>
            The server should be available at{" "}
            <code>http://localhost:11434</code>. If needed, start it with{" "}
            <code>ollama serve</code>.
          </p>
          <p>
            Ollama must allow this SandboxAI address:{" "}
            <code>{window.location.origin}</code>. Check its{" "}
            <code>OLLAMA_ORIGINS</code> setting and restart Ollama after
            changing it.
          </p>
          <p>
            If you're viewing the hosted preview, run SandboxAI locally to use
            your local AI connection.
          </p>
        </details>
      )}
      {preferenceError && (
        <p className="sb-notice" role="status">
          {preferenceError}
        </p>
      )}
    </section>
  );
}
export function HomeConnection() {
  const { discovery, preferredModel, chooseModel } = useConnection();
  const [open, setOpen] = useState(false);
  const status = modelReadiness(discovery, preferredModel);
  return (
    <>
      <div className="sb-home-connection">
        <span
          className={status === "ready" ? "sb-ai-dot is-ready" : "sb-ai-dot"}
        />
        <span>
          {status === "checking"
            ? "Checking your local AI…"
            : status === "ready"
              ? `AI ready · ${preferredModel}`
              : "Explore now. Connect local AI when you're ready to chat."}
        </span>
        <button type="button" className="sb-link" onClick={() => setOpen(true)}>
          {status === "ready" ? "AI settings" : "Set up AI"}
        </button>
      </div>
      {open && (
        <Modal title="Your local AI" onClose={() => setOpen(false)}>
          <ConnectionHelp model={preferredModel} onModelChange={chooseModel} />
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-button"
              onClick={() => setOpen(false)}
            >
              Back to my space
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
