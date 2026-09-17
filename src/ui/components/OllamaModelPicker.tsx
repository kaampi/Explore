import { useEffect, useRef, useState } from "react";
import { listOllamaModels, pickListedOllamaModel } from "@llm/providers/OllamaProvider";

export function OllamaModelPicker({
  model,
  onChange,
  variant = "chip"
}: {
  model: string;
  onChange: (model: string) => void;
  variant?: "chip" | "field";
}) {
  const modelRef = useRef(model);
  modelRef.current = model;
  const [listed, setListed] = useState<string[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    listOllamaModels({ signal: ac.signal })
      .then((names) => {
        if (names.length === 0) {
          setListed(null);
          return;
        }
        setListed(names);
        const picked = pickListedOllamaModel(modelRef.current, names);
        if (picked && picked !== modelRef.current) onChange(picked);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setListed(null);
      });
    return () => ac.abort();
  }, [onChange]);

  if (listed && listed.length > 0) {
    const options = listed.includes(model) ? listed : [model, ...listed];
    const select = (
      <select
        className={variant === "chip" ? "chip__field" : undefined}
        value={model}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    );
    if (variant === "field") return select;
    return (
      <label className="chip" title="Installed Ollama models">
        ollama:
        {select}
      </label>
    );
  }

  const input = (
    <input
      className={variant === "chip" ? "chip__field" : undefined}
      value={model}
      onChange={(e) => onChange(e.target.value)}
      placeholder="model name"
    />
  );
  if (variant === "field") return input;
  return (
    <label className="chip" title="Ollama unreachable — type a model name">
      ollama:
      {input}
    </label>
  );
}
