import { useEffect, useState } from "react";
import type { Faction } from "@library/factions";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";

export function FactionField({ repo, value = [], onChange }: {
  repo: IndexedDBRepository;
  value?: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const [factions, setFactions] = useState<Faction[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const items = await repo.listFactions();
        if (!cancelled) setFactions(items);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [repo]);

  if (failed) return <p role="status">Could not load factions.</p>;
  if (!factions) return null;
  const missing = value.filter(id => !factions.some(faction => faction.id === id));

  return (
    <fieldset className="faction-membership">
      <legend>Factions</legend>
      {!factions.length && <p>Create factions in Library → Factions.</p>}
      {factions.map(faction => (
        <label key={faction.id}>
          <input
            type="checkbox"
            checked={value.includes(faction.id)}
            onChange={event => onChange(event.target.checked
              ? [...value, faction.id]
              : value.filter(id => id !== faction.id))}
          /> {faction.name}
        </label>
      ))}
      {missing.map(id => (
        <label key={id}>
          <input type="checkbox" checked onChange={() => onChange(value.filter(item => item !== id))} />
          {" "}Unavailable faction ({id})
        </label>
      ))}
    </fieldset>
  );
}
