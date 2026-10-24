import { installedModelName } from "../connection/connection";
import { useConnection } from "../connection/ConnectionProvider";

/** Discovery is shared with onboarding; opening Settings never silently changes a saved model. */
export function OllamaModelPicker({
  model,
  onChange,
  variant = "chip",
}: {
  model: string;
  onChange: (model: string) => void;
  variant?: "chip" | "field";
}) {
  const { discovery, chooseModel } = useConnection();
  function change(value: string) {
    chooseModel(value);
    onChange(value);
  }
  const models = discovery.models;
  const input = models.length ? (
    <select
      aria-label="Ollama model"
      className={variant === "chip" ? "chip__field" : undefined}
      value={installedModelName(model, models) ?? ""}
      onChange={(event) => change(event.target.value)}
    >
      <option value="" disabled>
        {model ? `${model} · not installed` : "Choose an installed model"}
      </option>
      {models.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  ) : (
    <input
      aria-label="Ollama model"
      className={variant === "chip" ? "chip__field" : undefined}
      value={model}
      onChange={(event) => change(event.target.value)}
      placeholder="model name"
    />
  );
  return variant === "field" ? (
    input
  ) : (
    <label
      className="chip"
      title={
        discovery.state === "available"
          ? "Your Ollama model"
          : "Use Set up AI to connect Ollama"
      }
    >
      ollama: {input}
    </label>
  );
}
