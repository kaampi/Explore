import { useEffect, useState } from "react";
import { useEngine } from "../EngineStore";
import { Dot } from "./Dot";
import { isEffectivelyActive } from "@layers/LayerEngine";
import { formatKeywordList, layerHasKeywordGate, parseKeywordList } from "@layers/keywords";
import { displayLayerType } from "@layers/layerPlacement";
import { displayCharacterName } from "@session/createSession";
import type { Layer, LayerType, Session } from "@state/StateSchema";
import { beatLocation, sideRoomStage, venueBuildingName } from "@state/playerDestination";
import { hereIntro } from "@state/placeIntro";
import { sceneBackdrop } from "@state/sceneBackdrop";
import { liveTraitNote, traitVoice } from "@state/traitBands";
import { portraitSrc } from "../studio/portrait";

const PLAYER_LAYER_LABEL: Record<LayerType, string> = {
  core: "personality",
  relationship: "relationship",
  environment: "place",
  state_trigger: "state"
};

function displayName(
  id: string,
  storedName: string | undefined,
  familyName?: string,
  middleName?: string
): string {
  if (storedName !== undefined && storedName.trim() !== "") {
    return displayCharacterName(id, storedName, familyName, middleName);
  }
  return displayCharacterName(id);
}

function isPendingAi(layer: Layer): boolean {
  return layer.aiGenerated && !layer.active;
}

function LockMark({ lock }: { lock: string }) {
  if (lock === "player_locked") return <Dot kind="locked" title="Locked by you — the AI cannot change this" />;
  if (lock === "system_locked") return <Dot kind="locked" title="Locked by the system" />;
  return null;
}

function Fact({
  label,
  value,
  lock,
  note,
  onUnlock
}: {
  label: string;
  value: string;
  lock?: string;
  note?: string | undefined;
  onUnlock?: () => void;
}) {
  return (
    <div className="sheet-fact-wrap">
      <div className="sheet-fact">
        <span className="sheet-fact__label">{label}</span>
        <span className="sheet-fact__value">{value}</span>
        {lock === "player_locked" && onUnlock ? (
          <button
            type="button"
            className="sheet-fact__unlock"
            title="Locked by you — click to let the scene change this"
            onClick={onUnlock}
          >
            <LockMark lock={lock} />
          </button>
        ) : lock ? (
          <LockMark lock={lock} />
        ) : null}
      </div>
      {note ? <p className="sheet-fact__note">{note}</p> : null}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span className="meter__label">{label}</span>
      <span className="meter__track" aria-hidden="true">
        <span className="meter__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="meter__value">{value}</span>
    </div>
  );
}

function TraitCard({
  layer,
  session,
  onToggle,
  onRemove,
  onKeywords,
  pending
}: {
  layer: Layer;
  session: Session;
  onToggle: (id: string, active: boolean) => void;
  onRemove?: (id: string) => void;
  onKeywords?: (id: string, keywords: string[]) => void;
  pending?: boolean;
}) {
  const live = isEffectivelyActive(session, layer);
  const gated = layerHasKeywordGate(layer) && !layer.once;
  const waiting = Boolean(layer.active && gated && !live);
  const onceWaiting = Boolean(layer.once && layer.active && !layer.spent && !live);
  const spent = Boolean(layer.spent);
  const [keywordDraft, setKeywordDraft] = useState(formatKeywordList(layer.keywords ?? []));

  useEffect(() => {
    setKeywordDraft(formatKeywordList(layer.keywords ?? []));
  }, [layer.keywords]);

  function commitKeywords() {
    if (!onKeywords) return;
    const next = parseKeywordList(keywordDraft);
    const prev = layer.keywords ?? [];
    if (next.join("\0").toLowerCase() === prev.join("\0").toLowerCase()) return;
    onKeywords(layer.id, next);
  }

  return (
    <div
      className="layer-card"
      style={pending ? { borderColor: "color-mix(in srgb, var(--accent-ai) 45%, var(--border))" } : undefined}
    >
      <div className="layer-card__head">
        <Dot
          kind={pending ? "ai" : live ? "active" : "inactive"}
          title={
            pending
              ? "AI-proposed"
              : spent
                ? "played — will not return"
                : live
                  ? "in play this turn"
                  : onceWaiting
                    ? "On — waiting to return to the bar, with that thing already in play"
                    : waiting
                      ? "On — waiting for a keyword in chat"
                      : "not in play"
          }
        />
        <span className="layer-card__type">
          {PLAYER_LAYER_LABEL[displayLayerType(layer, Object.keys(session.characters))]}
          {layer.once ? (spent ? " · once · played" : " · once") : ""}
          {layer.aiGenerated && !pending ? " · ai-approved" : pending ? " · proposed" : ""}
          {onceWaiting ? " · waiting" : waiting ? " · waiting" : live && gated ? " · awake" : ""}
        </span>
        {pending ? null : (
          <button
            className="layer-card__toggle"
            type="button"
            aria-pressed={layer.active}
            title={layer.active ? "On — click to turn off" : "Off — click to turn on"}
            onClick={() => onToggle(layer.id, !layer.active)}
          >
            {layer.active ? "On" : "Off"}
          </button>
        )}
      </div>
      <div className="layer-card__content">{layer.content}</div>
      {layer.trigger && (
        <div className="layer-card__content">
          when {layer.trigger === "return_to_bar" ? "you return to the bar" : layer.trigger}
        </div>
      )}
      {pending ? null : (
        <input
          className="layer-card__keywords"
          placeholder={
            layer.once ? "Already in play (brooch, …)" : "Wake on words (empty = always in the prompt)"
          }
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onBlur={commitKeywords}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      )}
      {pending && onRemove && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            className="layer-card__toggle"
            style={{ flex: 1, border: "1px solid var(--accent-active)", color: "var(--accent-active)" }}
            onClick={() => onToggle(layer.id, true)}
          >
            Approve
          </button>
          <button
            className="layer-card__toggle"
            style={{ flex: 1, border: "1px solid var(--accent-danger)", color: "var(--accent-danger)" }}
            onClick={() => onRemove(layer.id)}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function AddTraitForm({
  types,
  onAdd,
  onCancel,
  placeholder
}: {
  types: Array<"core" | "relationship" | "environment">;
  onAdd: (type: "core" | "relationship" | "environment", content: string, keywords: string[]) => void;
  onCancel: () => void;
  placeholder: string;
}) {
  const [type, setType] = useState<"core" | "relationship" | "environment">(types[0] ?? "core");
  const [content, setContent] = useState("");
  const [keywords, setKeywords] = useState("");

  return (
    <div className="new-layer-form">
      {types.length > 1 && (
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {PLAYER_LAYER_LABEL[t]}
            </option>
          ))}
        </select>
      )}
      <textarea placeholder={placeholder} value={content} onChange={(e) => setContent(e.target.value)} />
      <input
        className="layer-card__keywords"
        placeholder="Wake on words (optional)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <button
        onClick={() => {
          if (!content.trim()) return;
          onAdd(type, content.trim(), parseKeywordList(keywords));
        }}
      >
        Add
      </button>
      <button type="button" className="layer-card__toggle" style={{ width: "100%", marginTop: 6 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function AddOnceBeatForm({
  onAdd,
  onCancel
}: {
  onAdd: (content: string, keywords: string[]) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState("");
  const [keywords, setKeywords] = useState("");

  return (
    <div className="new-layer-form">
      <textarea
        placeholder="This beat, once: two strangers enter and say…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <input
        className="layer-card__keywords"
        placeholder="Already in play (brooch, broschen)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />
      <button
        onClick={() => {
          if (!content.trim() || parseKeywordList(keywords).length === 0) return;
          onAdd(content.trim(), parseKeywordList(keywords));
        }}
      >
        Add once beat
      </button>
      <button type="button" className="layer-card__toggle" style={{ width: "100%", marginTop: 6 }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function CharacterSheet({
  characterId,
  session,
  onBack,
  toggleLayer,
  addPlayerLayer,
  setLayerKeywords,
  compactLayers,
  compacting
}: {
  characterId: string;
  session: Session;
  onBack: () => void;
  toggleLayer: (id: string, active: boolean) => void;
  addPlayerLayer: (params: {
    type: "core" | "relationship" | "environment" | "state_trigger";
    content: string;
    keywords?: string[];
    once?: boolean;
    trigger?: string;
  }) => void;
  setLayerKeywords: (id: string, keywords: string[]) => void;
  compactLayers: (scope: "core" | "relationship" | "environment") => Promise<{ ok: boolean; reason?: string }>;
  compacting: boolean;
}) {
  const { setFieldLock } = useEngine();
  const character = session.characters[characterId];
  const relationship = session.relationships[characterId];
  const [showForm, setShowForm] = useState(false);

  const characterIds = Object.keys(session.characters);
  const established = session.layers.filter((layer) => !isPendingAi(layer));
  const shown = (layer: Layer) => displayLayerType(layer, characterIds);
  const core = established.filter((layer) => shown(layer) === "core");
  const relating = established.filter((layer) => shown(layer) === "relationship");
  const states = established.filter((layer) => shown(layer) === "state_trigger" && !layer.once);

  if (!character) {
    return (
      <div>
        <button className="sheet-back" onClick={onBack}>
          ← Characters
        </button>
        <p className="inspector-empty">That character is no longer in the scene.</p>
      </div>
    );
  }

  return (
    <div>
      <button className="sheet-back" onClick={onBack}>
        ← Characters
      </button>
      <div className="sheet-head">
        {portraitSrc(character.portraitDataUrl) ? (
          <img className="sheet-head__portrait" src={portraitSrc(character.portraitDataUrl)} alt="" />
        ) : null}
        <h2 className="sheet-name">{displayName(characterId, character.name, character.familyName, character.middleName)}</h2>
      </div>

      {character.appearance?.trim() ? (
        <section className="sheet-section">
          <Fact label="looks" value={character.appearance.trim()} />
          {typeof character.approximateAge === "number" ? (
            <Fact label="age" value={String(character.approximateAge)} />
          ) : null}
        </section>
      ) : typeof character.approximateAge === "number" ? (
        <section className="sheet-section">
          <Fact label="age" value={String(character.approximateAge)} />
        </section>
      ) : null}

      <section className="sheet-section">
        <p className="panel-heading">Right now</p>
        <Fact
          label="mood"
          value={String(character.mood.value)}
          lock={character.mood.lock}
          onUnlock={() => setFieldLock(`characters.${characterId}.mood`, "unlocked")}
        />
        {character.pronoun && <Fact label="pronoun" value={character.pronoun} />}
        {character.pose && <Fact label="pose" value={String(character.pose.value)} lock={character.pose.lock} />}
        {character.clothing?.value.trim() ? (
          <Fact
            label="wearing"
            value={character.clothing.value.trim()}
            lock={character.clothing.lock}
            onUnlock={() => setFieldLock(`characters.${characterId}.clothing`, "unlocked")}
          />
        ) : null}
        {character.holding?.value.trim() ? (
          <Fact
            label="holding"
            value={character.holding.value.trim()}
            lock={character.holding.lock}
            onUnlock={() => setFieldLock(`characters.${characterId}.holding`, "unlocked")}
          />
        ) : null}
        <Fact label="position" value={String(character.position.value)} lock={character.position.lock} />
        {character.energy && <Fact label="energy" value={String(character.energy.value)} lock={character.energy.lock} />}
      </section>

      {character.stats && Object.keys(character.stats).length > 0 && (
        <section className="sheet-section">
          <p className="panel-heading">{session.ruleset?.name ?? "Stats"}</p>
          {Object.entries(character.stats).map(([statId, field]) => {
            const def = session.ruleset?.attributes.find((item) => item.id === statId);
            return (
            <Fact
              key={statId}
              label={def?.name ?? statId}
              value={String(field.value)}
              lock={field.lock}
              note={
                def
                  ? liveTraitNote(
                      def,
                      field.value,
                      traitVoice({ char: character.name, pronoun: character.pronoun })
                    )
                  : undefined
              }
            />
            );
          })}
        </section>
      )}

      {relationship && (
        <section className="sheet-section">
          <p className="panel-heading">With you</p>
          <Meter label="trust" value={relationship.trust.value} />
          <Meter label="familiarity" value={relationship.familiarity.value} />
          <Meter label="tension" value={relationship.tension.value} />
        </section>
      )}

      <section className="sheet-section">
        <div className="setup-section__head">
          <p className="panel-heading">Who they are</p>
          {core.length >= 2 && (
            <button
              type="button"
              className="setup-text-btn"
              disabled={compacting}
              onClick={() => void compactLayers("core")}
            >
              {compacting ? "Compacting…" : "Compact"}
            </button>
          )}
        </div>
        {core.length === 0 && <p className="inspector-empty">No personality notes yet.</p>}
        {core.map((layer) => (
          <TraitCard key={layer.id} layer={layer} session={session} onToggle={toggleLayer} onKeywords={setLayerKeywords} />
        ))}
      </section>

      <section className="sheet-section">
        <div className="setup-section__head">
          <p className="panel-heading">How they see you</p>
          {relating.length >= 2 && (
            <button
              type="button"
              className="setup-text-btn"
              disabled={compacting}
              onClick={() => void compactLayers("relationship")}
            >
              {compacting ? "Compacting…" : "Compact"}
            </button>
          )}
        </div>
        {relating.length === 0 && <p className="inspector-empty">No relationship notes yet.</p>}
        {relating.map((layer) => (
          <TraitCard key={layer.id} layer={layer} session={session} onToggle={toggleLayer} onKeywords={setLayerKeywords} />
        ))}
      </section>

      <section className="sheet-section">
        <p className="panel-heading">States</p>
        {states.length === 0 && <p className="inspector-empty">No temporary states.</p>}
        {states.map((layer) => (
          <TraitCard key={layer.id} layer={layer} session={session} onToggle={toggleLayer} onKeywords={setLayerKeywords} />
        ))}
      </section>

      {showForm ? (
        <AddTraitForm
          types={["core", "relationship"]}
          placeholder="A note about this character…"
          onAdd={(type, content, keywords) => {
            addPlayerLayer({ type, content, keywords });
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          className="layer-card__toggle"
          style={{ width: "100%", border: "1px dashed var(--border)", padding: "8px 0" }}
          onClick={() => setShowForm(true)}
        >
          + Add to {displayName(characterId, character.name, character.familyName, character.middleName)}
        </button>
      )}
    </div>
  );
}

export function CastPanel() {
  const { useSession, toggleLayer, addPlayerLayer, setLayerKeywords, removeLayer, compactLayers, compacting, setHandoff, setOutgoingHandoff } =
    useEngine();
  const session = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [showOnceForm, setShowOnceForm] = useState(false);

  const characterIds = Object.keys(session.characters);

  useEffect(() => {
    if (selectedId && !session.characters[selectedId]) setSelectedId(null);
  }, [selectedId, session.characters]);

  const pendingReview = session.layers.filter(isPendingAi);
  const placeLayers = session.layers.filter(
    (layer) => !isPendingAi(layer) && !layer.once && displayLayerType(layer, characterIds) === "environment"
  );
  const onceBeats = session.layers.filter((layer) => !isPendingAi(layer) && layer.once);
  const env = session.scene?.environment;
  const staged = Boolean(sideRoomStage(session));
  const here = beatLocation(session);
  const venue = venueBuildingName(session.scene?.location);
  const backdrop = sceneBackdrop(session);
  const intro = hereIntro(session);
  const envBits = staged
    ? []
    : [
        env?.lighting,
        env?.noise,
        env?.music === true ? "music" : env?.music === false ? "no music" : undefined
      ].filter((bit): bit is string => Boolean(bit));

  return (
    <div className="panel panel--left">
      {pendingReview.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="setup-section__head">
            <p className="panel-heading" style={{ color: "var(--accent-ai)" }}>
              Pending AI review ({pendingReview.length})
            </p>
            {pendingReview.length >= 2 && (
              <button
                type="button"
                className="setup-text-btn"
                disabled={compacting}
                onClick={() => void compactLayers("pending")}
              >
                {compacting ? "Compacting…" : "Compact similar"}
              </button>
            )}
          </div>
          {pendingReview.map((layer) => (
            <TraitCard
              key={layer.id}
              layer={layer}
              session={session}
              onToggle={toggleLayer}
              onRemove={removeLayer}
              pending
            />
          ))}
        </div>
      )}

      {selectedId ? (
        <CharacterSheet
          characterId={selectedId}
          session={session}
          onBack={() => setSelectedId(null)}
          toggleLayer={toggleLayer}
          addPlayerLayer={addPlayerLayer}
          setLayerKeywords={setLayerKeywords}
          compactLayers={compactLayers}
          compacting={compacting}
        />
      ) : (
        <>
          {session.campaignIntro?.trim() ? (
            <>
              <p className="panel-heading">Campaign</p>
              <div className="place-card">
                <div className="place-card__name">{session.story?.title.trim() || "Campaign"}</div>
                <div className="place-card__intro">{session.campaignIntro}</div>
              </div>
            </>
          ) : null}

          {session.player?.name?.trim() || session.player?.appearance?.trim() || session.player?.portraitDataUrl ? (
            <>
              <p className="panel-heading" style={{ marginTop: session.campaignIntro?.trim() ? 22 : undefined }}>
                You
              </p>
              <div className="place-card">
                {portraitSrc(session.player?.portraitDataUrl) ? (
                  <img
                    className="cast-row__portrait"
                    src={portraitSrc(session.player?.portraitDataUrl)}
                    alt=""
                    style={{ marginBottom: 8 }}
                  />
                ) : null}
                <div className="place-card__name">{session.player?.name?.trim() || "You"}</div>
                {session.player?.appearance?.trim() ? (
                  <div className="place-card__intro">{session.player.appearance.trim()}</div>
                ) : null}
              </div>
            </>
          ) : null}

          {session.campaignId ? (
            <>
              <p
                className="panel-heading"
                style={{
                  marginTop:
                    session.campaignIntro?.trim() ||
                    session.player?.name?.trim() ||
                    session.player?.appearance?.trim() ||
                    session.player?.portraitDataUrl
                      ? 22
                      : undefined
                }}
              >
                Why you are here
              </p>
              <p className="form-section__lede">
                The agreement from the last scene. Pass 1 honors this. Empty = a new meeting.
              </p>
              <textarea
                className="setup-field__story"
                value={session.handoff ?? ""}
                onChange={(e) => setHandoff(e.target.value)}
                placeholder="He asked to sleep. Nothing else happened."
              />
              <p className="panel-heading" style={{ marginTop: 22 }}>
                For the next scene
              </p>
              <p className="form-section__lede">
                Chat will not come with. Write the next agreement here before you leave. Empty = your last line is the seed.
              </p>
              <textarea
                className="setup-field__story"
                value={session.outgoingHandoff ?? ""}
                onChange={(e) => setOutgoingHandoff(e.target.value)}
                placeholder="We fled to the cabin together."
              />
            </>
          ) : null}

          {session.voice?.instruction.trim() ? (
            <>
              <p className="panel-heading">Narrator</p>
              <div className="place-card">
                <div className="place-card__name">{session.voice.title.trim() || "Narrator"}</div>
                <div className="story-card__body">{session.voice.instruction}</div>
              </div>
            </>
          ) : null}

          {session.story?.premise.trim() ? (
            <>
              <p className="panel-heading" style={session.voice?.instruction.trim() ? { marginTop: 22 } : undefined}>
                Ground story
              </p>
              <div className="place-card">
                <div className="place-card__name">{session.story.title.trim() || "Ground story"}</div>
                <div className="story-card__body">{session.story.premise}</div>
              </div>
            </>
          ) : null}

          <p
            className="panel-heading"
            style={session.story?.premise.trim() || session.voice?.instruction.trim() ? { marginTop: 22 } : undefined}
          >
            Characters
          </p>
          {characterIds.length === 0 && <p className="inspector-empty">No one in the scene yet.</p>}
          {characterIds.map((id) => {
            const character = session.characters[id];
            if (!character) return null;
            const summary = [
              String(character.mood.value),
              character.clothing?.value.trim() || null,
              character.holding?.value.trim() ? `holds ${character.holding.value.trim()}` : null,
              character.pose ? String(character.pose.value) : null
            ]
              .filter(Boolean)
              .join(" · ");
            const portrait = portraitSrc(character.portraitDataUrl);
            return (
              <button
                key={id}
                className={portrait ? "cast-row cast-row--portrait" : "cast-row"}
                onClick={() => setSelectedId(id)}
              >
                {portrait ? <img className="cast-row__portrait" src={portrait} alt="" /> : null}
                <span className="cast-row__name">{displayName(id, character.name, character.familyName, character.middleName)}</span>
                <span className="cast-row__meta">{summary}</span>
                <span className="cast-row__chevron" aria-hidden="true">
                  →
                </span>
              </button>
            );
          })}

          <div className="setup-section__head" style={{ marginTop: 22 }}>
            <p className="panel-heading">Place</p>
            {placeLayers.length >= 2 && (
              <button
                type="button"
                className="setup-text-btn"
                disabled={compacting}
                onClick={() => void compactLayers("environment")}
              >
                {compacting ? "Compacting…" : "Compact"}
              </button>
            )}
          </div>
          <div className={backdrop.thumbDataUrl ? "place-card place-card--thumb" : "place-card"}>
          {backdrop.thumbDataUrl ? (
            <img className="place-card__thumb" key={here ?? "venue"} src={backdrop.thumbDataUrl} alt="" />
          ) : null}
            <div>
              <div className="place-card__name">{here ?? "Unknown place"}</div>
              {staged && venue ? (
                <div className="place-card__meta">in {venue}</div>
              ) : envBits.length > 0 ? (
                <div className="place-card__meta">{envBits.join(" · ")}</div>
              ) : null}
              {intro ? <div className="place-card__intro">{intro.body}</div> : null}
              {session.scene?.realmNote?.trim() ? (
                <div className="place-card__meta">
                  {session.scene.realm ? `${session.scene.realm} — ` : ""}
                  {session.scene.realmNote}
                </div>
              ) : null}
            </div>
          </div>
          {(session.objects ?? []).length > 0 && (
            <div className="place-card" style={{ marginTop: 8 }}>
              <div className="place-card__name">In this room</div>
              <div className="place-card__meta">
                {(session.objects ?? []).map((object) => object.name).join(" · ")}
              </div>
            </div>
          )}
          {placeLayers.map((layer) => (
            <TraitCard key={layer.id} layer={layer} session={session} onToggle={toggleLayer} onKeywords={setLayerKeywords} />
          ))}
          {onceBeats.map((layer) => (
            <TraitCard key={layer.id} layer={layer} session={session} onToggle={toggleLayer} onKeywords={setLayerKeywords} />
          ))}
          {showOnceForm ? (
            <AddOnceBeatForm
              onAdd={(content, keywords) => {
                addPlayerLayer({
                  type: "state_trigger",
                  content,
                  keywords,
                  once: true,
                  trigger: "return_to_bar"
                });
                setShowOnceForm(false);
              }}
              onCancel={() => setShowOnceForm(false)}
            />
          ) : showPlaceForm ? (
            <AddTraitForm
              types={["environment"]}
              placeholder="How this place feels, sounds, constrains people…"
              onAdd={(type, content, keywords) => {
                addPlayerLayer({ type, content, keywords });
                setShowPlaceForm(false);
              }}
              onCancel={() => setShowPlaceForm(false)}
            />
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="layer-card__toggle"
                style={{ flex: 1, border: "1px dashed var(--border)", padding: "8px 0" }}
                onClick={() => setShowPlaceForm(true)}
              >
                + Add place note
              </button>
              <button
                className="layer-card__toggle"
                style={{ flex: 1, border: "1px dashed var(--border)", padding: "8px 0" }}
                onClick={() => setShowOnceForm(true)}
              >
                + Once beat
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
