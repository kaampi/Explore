import { useEffect, useRef, useState, type FormEvent } from "react";
import { FactionSchema, type Faction } from "@library/factions";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import { sceneImagesFromFile, type SceneImagePair } from "./portrait";
import { StudioList } from "./StudioList";
import { AddPictureTile } from "./AddPictureTile";
import { SheetNameField } from "./SheetNameField";
import "./factionStudio.css";

function RelationshipPicker({ label, factions, ids = [], onChange }: {
  label: string;
  factions: Faction[];
  ids?: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const available = factions.filter(faction => !ids.includes(faction.id));

  return (
    <div className="faction-relationship">
      <label className="setup-field faction-relationship__field">
        <span className="setup-field__label">{label}</span>
        <select value="" disabled={!available.length} onChange={event => onChange([...ids, event.target.value])}>
          <option value="" disabled>{available.length ? "Choose a faction" : "No other factions to add"}</option>
          {available.map(faction => <option key={faction.id} value={faction.id}>{faction.name}</option>)}
        </select>
      </label>
      {!!ids.length && (
        <ul className="faction-relationship__list">
          {ids.map(id => {
            const name = factions.find(faction => faction.id === id)?.name ?? "Unavailable faction";
            return (
              <li key={id}>
                {name}
                <button type="button" aria-label={`Remove ${name} from ${label}`} onClick={() => onChange(ids.filter(item => item !== id))}>×</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FactionStudio({ repo, onDirtyChange }: {
  repo: IndexedDBRepository;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [factions, setFactions] = useState<Faction[]>();
  const [draft, setDraft] = useState<Faction>();
  const [original, setOriginal] = useState<Faction>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imagePicker = useRef<HTMLInputElement>(null);
  const dirty = draft !== original;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    void repo.listFactions().then(items => {
      if (!cancelled) setFactions(items);
    }).catch(() => {
      if (!cancelled) setError("Could not load factions.");
    });
    return () => { cancelled = true; };
  }, [repo]);

  function edit(faction: Faction) {
    if (busy || uploading || draft === faction) return;
    if (dirty && !confirm("Discard unsaved faction changes?")) return;
    setDraft(faction);
    setOriginal(faction);
    setError("");
    setNotice("");
  }

  function update(fields: Partial<Faction>) {
    setDraft(current => current && { ...current, ...fields });
    setNotice("");
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    setError("");
    if (files.some(file => file.size > 10 * 1024 * 1024)) {
      setError("Choose images under 10 MB each.");
      return;
    }
    setUploading(true);
    try {
      const images: SceneImagePair[] = [];
      for (const file of files) images.push(await sceneImagesFromFile(file));
      setDraft(current => current && { ...current, images: [...(current.images ?? []), ...images] });
      setNotice("");
    } catch {
      setError("Could not read the selected images. Choose PNG, JPEG or WebP files.");
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || uploading) return;
    const parsed = FactionSchema.safeParse(draft);
    if (!parsed.success) {
      setError("Enter a faction name.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const faction = parsed.data;
      await repo.saveFaction(faction);
      setFactions(items => [...(items ?? []).filter(item => item.id !== faction.id), faction]
        .sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(faction);
      setOriginal(faction);
      setNotice("Faction saved.");
    } catch {
      setError("Could not save the faction.");
    } finally {
      setBusy(false);
    }
  }

  const images = draft?.images ?? [];
  const others = factions?.filter(faction => faction.id !== draft?.id) ?? [];

  return (
    <div className="studio-split faction-studio">
      {factions && (
        <StudioList
          heading="Factions"
          items={factions.map(faction => ({
            id: faction.id,
            name: faction.name,
            ...(faction.images?.[0] ? { thumb: faction.images[0].thumbDataUrl } : {})
          }))}
          selectedId={draft?.id ?? null}
          onSelect={id => {
            const faction = factions.find(item => item.id === id);
            if (faction && id !== draft?.id) edit(faction);
          }}
          onNew={() => edit({ id: crypto.randomUUID(), name: "", description: "" })}
          newLabel="＋ New faction"
          empty="No factions yet."
        />
      )}
      <section className="studio-sheet studio-sheet--form faction-sheet" aria-label="Faction details">
        {draft ? (
          <form onSubmit={save}>
            <header className="faction-cover">
              {images[0] && <img src={images[0].imageDataUrl} alt="" />}
              <div>
                <span>Faction dossier</span>
                <h2>
                  <SheetNameField
                    value={draft.name}
                    onChange={name => update({ name })}
                    placeholder="New faction"
                    ariaLabel="Faction name"
                    required
                    disabled={busy || uploading}
                  />
                </h2>
              </div>
            </header>
            <fieldset className="faction-form" disabled={busy || uploading}>
              <section className="faction-card">
                <h3>Overview</h3>
                <label className="setup-field">
                  <span className="setup-field__label">Description</span>
                  <textarea rows={5} value={draft.description} onChange={event => update({ description: event.target.value })} />
                </label>
                <label className="setup-field">
                  <span className="setup-field__label">History</span>
                  <textarea rows={9} value={draft.history ?? ""} onChange={event => update({ history: event.target.value })} />
                </label>
              </section>
              <section className="faction-card">
                <h3>Relationships</h3>
                <p>Describe this faction’s stance toward other factions.</p>
                <div className="faction-relationships">
                  <RelationshipPicker label="Alliance with" factions={others} ids={draft.alliedFactionIds} onChange={ids => update({
                    alliedFactionIds: ids,
                    hostileFactionIds: draft.hostileFactionIds?.filter(id => !ids.includes(id))
                  })} />
                  <RelationshipPicker label="Hostile against" factions={others} ids={draft.hostileFactionIds} onChange={ids => update({
                    hostileFactionIds: ids,
                    alliedFactionIds: draft.alliedFactionIds?.filter(id => !ids.includes(id))
                  })} />
                </div>
              </section>
              <section className="faction-card">
                <h3>Images</h3>
                <p>The first image appears on the cover and in the faction list.</p>
                <input ref={imagePicker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addImages(files);
                }} />
                <ul className="faction-gallery">
                  {images.map((image, index) => (
                    <li className="faction-gallery__image" key={index}>
                      <img src={image.thumbDataUrl} alt={`Faction image ${index + 1}`} />
                      {index === 0 ? <span className="faction-gallery__cover">Cover</span> : (
                        <button type="button" className="faction-gallery__cover" onClick={() => update({ images: [image, ...images.filter((_, i) => i !== index)] })}>Make cover</button>
                      )}
                      <button type="button" className="faction-gallery__remove" aria-label={`Remove image ${index + 1}`} onClick={() => update({ images: images.filter((_, i) => i !== index) })}>×</button>
                    </li>
                  ))}
                  <li><AddPictureTile label="Add faction pictures" onClick={() => imagePicker.current?.click()} /></li>
                </ul>
              </section>
            </fieldset>
            <footer className="faction-actions">
              <button className="setup-start" type="submit" disabled={busy || uploading || !draft.name.trim()}>Save faction</button>
              <span role="status">{uploading ? "Preparing images…" : notice || (dirty ? "Unsaved changes" : "")}</span>
              {error && <span role="alert">{error}</span>}
            </footer>
          </form>
        ) : (
          <div className="faction-card faction-intro">
            <h2>Factions</h2>
            <p>{factions ? "Choose a faction or create one. Assign factions on character sheets, places and object cards." : "Loading factions…"}</p>
            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
