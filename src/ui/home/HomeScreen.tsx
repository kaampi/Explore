import { useEffect, useState } from "react";
import type { IndexedDBRepository } from "@persistence/IndexedDBRepository";
import {
  newCharacterTemplate,
  type CampaignTemplate,
  type CharacterTemplate,
  type PlaceTemplate,
  type RealmTemplate,
} from "@library/LibrarySchema";
import {
  exampleCharacterTemplate,
  examplePlaceTemplate,
  exampleRealmDunbaar,
} from "@library/exampleTemplates";
import { formatPersonName } from "@library/personName";
import type { Session } from "@state/StateSchema";
import { primaryCharacter } from "@session/createSession";
import { sessionFromCampaignScene } from "@session/campaignStart";
import type { StudioView } from "../studio/types";
import { portraitSrc } from "../studio/portrait";
import { Modal } from "../components/Modal";
import { quickCharacterSession } from "./quickStart";
import { WorldArtwork } from "./WorldArtwork";

export function HomeScreen({
  repo,
  session,
  sessionId,
  onResume,
  onStart,
  onStudio,
}: {
  repo: IndexedDBRepository;
  session: Session | null;
  sessionId: string;
  onResume: () => void;
  onStart: (session: Session) => Promise<void>;
  onStudio: (view: StudioView) => void;
}) {
  const [characters, setCharacters] = useState<CharacterTemplate[]>([]);
  const [realms, setRealms] = useState<RealmTemplate[]>([]);
  const [places, setPlaces] = useState<PlaceTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPersonality, setQuickPersonality] = useState("");
  const [world, setWorld] = useState<RealmTemplate | null>(null);
  const [campaign, setCampaign] = useState<CampaignTemplate | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [characterId, setCharacterId] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      repo.listCharacters(),
      repo.listRealms(),
      repo.listPlaces(),
      repo.listCampaigns(),
    ])
      .then(([people, worlds, venues, stories]) => {
        if (cancelled) return;
        setCharacters(people);
        setRealms(worlds);
        setPlaces(venues);
        setCampaigns(stories);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load your library.",
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);
  async function startCharacter(
    character: CharacterTemplate,
    place?: PlaceTemplate,
    realm?: RealmTemplate,
  ) {
    setBusy(true);
    setError(null);
    try {
      await onStart(
        quickCharacterSession(character, sessionId, {
          ...(place ? { place } : {}),
          ...(realm ? { realm } : {}),
          ...(session?.runtime.model ? { model: session.runtime.model } : {}),
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start this conversation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function startCampaign(sceneId: string) {
    if (!campaign) return;
    const scene = campaign.scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    setBusy(true);
    setError(null);
    try {
      const [objects, voices, rulesets] = await Promise.all([
        repo.listObjects(),
        repo.listVoices(),
        repo.listRulesets(),
      ]);
      const built = sessionFromCampaignScene(
        {
          campaign,
          scene,
          places,
          realms,
          characters,
          objects,
          voices,
          rulesets,
        },
        sessionId,
      );
      if (!built.ok) throw new Error(built.reason);
      await onStart(built.session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start this adventure.",
      );
    } finally {
      setBusy(false);
    }
  }
  const person = session ? primaryCharacter(session) : null;
  const lastTurn = session?.conversation.at(-1);
  const recent =
    lastTurn &&
    typeof lastTurn === "object" &&
    "content" in lastTurn &&
    typeof lastTurn.content === "string"
      ? lastTurn.content
      : undefined;
  function openCreate() {
    setCreating(true);
    setError(null);
  }
  async function createAndChat() {
    if (!quickName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const character = newCharacterTemplate({
        name: quickName.trim(),
        personality: quickPersonality.trim(),
      });
      await repo.saveCharacter(character);
      setCharacters((items) => [...items, character]);
      setCreating(false);
      setQuickName("");
      setQuickPersonality("");
      await startCharacter(character);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this character.",
      );
    } finally {
      setBusy(false);
    }
  }
  function openWorld(realm: RealmTemplate) {
    setWorld(realm);
    setPlaceId(places.find((place) => place.realmId === realm.id)?.id ?? "");
    setCharacterId(characters[0]?.id ?? "");
    setError(null);
  }
  return (
    <main className="sb-home">
      <div className="sb-breadcrumb">
        Your creative space <span>/</span> SandboxAI
      </div>
      <div className="sb-home-heading">
        <div>
          <h1>
            A familiar face.
            <br className="sb-mobile-break" />{" "}
            <em>A world of possibilities.</em>
          </h1>
          <p>
            Meet a character. Follow a thought. See where the conversation takes
            you.
          </p>
        </div>
        <span className="sb-flourish" aria-hidden="true">
          ✧
        </span>
      </div>
      {!ready ? (
        <p className="sb-muted" role="status">
          Opening your worlds…
        </p>
      ) : (
        <>
          <section className="sb-hero">
            <WorldArtwork />
            <div className="sb-hero__shade" />
            <div className="sb-hero__content">
              <span className="sb-eyebrow sb-hero__eyebrow">
                {session ? "● YOUR LAST EXPLORATION" : "✧ BEGIN ANYWHERE"}
              </span>
              <h2>
                {session
                  ? session.scene?.realm ||
                    session.scene?.location ||
                    `A conversation with ${person?.name ?? "your characters"}`
                  : "Every conversation opens a door."}
              </h2>
              <p>
                {session
                  ? recent
                    ? recent.slice(0, 190) + (recent.length > 190 ? "…" : "")
                    : `Your meeting with ${person?.name ?? "the cast"} is ready to continue.`
                  : "You don't need a manuscript, a world, or a plan. Just someone you're curious to meet."}
              </p>
              {session ? (
                <button
                  type="button"
                  className="sb-button sb-button--cream"
                  onClick={onResume}
                >
                  Continue exploring <span>→</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="sb-button sb-button--cream"
                  onClick={openCreate}
                >
                  Create your first character <span>＋</span>
                </button>
              )}
              <div className="sb-hero__foot">
                {session
                  ? `${person?.name ?? "Your cast"} · Your conversation is saved locally`
                  : "Or bring a character you already know — character card import is available in the library."}
              </div>
            </div>
            <span className="sb-hero__caption">The beginning is yours.</span>
          </section>
          <section className="sb-home-section">
            <div className="sb-section-heading">
              <h2>Someone to talk to</h2>
              <div className="sb-section-links">
                <button type="button" className="sb-link" onClick={openCreate}>
                  ＋ Create
                </button>
                <button
                  type="button"
                  className="sb-link"
                  onClick={() => onStudio("characters")}
                >
                  Import card ↗
                </button>
              </div>
            </div>
            <p className="sb-section-description">
              No destination required. Choose a character and begin.
            </p>
            <div className="sb-character-grid">
              {characters.map((character) => (
                <button
                  type="button"
                  className="sb-character-card"
                  key={character.id}
                  disabled={busy}
                  onClick={() => void startCharacter(character)}
                >
                  {portraitSrc(character.portraitDataUrl) ? (
                    <img src={portraitSrc(character.portraitDataUrl)} alt="" />
                  ) : (
                    <span className="sb-character-initial" aria-hidden="true">
                      {character.name.charAt(0)}
                    </span>
                  )}
                  <span>
                    <strong>
                      {formatPersonName(
                        character.name,
                        character.familyName,
                        character.middleName,
                      )}
                    </strong>
                    <small>
                      {character.personality ||
                        character.mood ||
                        "A conversation waiting to happen."}
                    </small>
                    <b>Start a conversation ↗</b>
                  </span>
                </button>
              ))}
              {characters.length === 0 && (
                <div className="sb-empty-card">
                  <span aria-hidden="true">♧</span>
                  <h3>A character is enough.</h3>
                  <p>
                    Create someone new or import a SillyTavern card. No world
                    setup needed.
                  </p>
                  <button
                    type="button"
                    className="sb-button"
                    onClick={openCreate}
                  >
                    Add a character
                  </button>
                </div>
              )}
              <button
                type="button"
                className="sb-example-card"
                disabled={busy}
                onClick={() =>
                  void startCharacter(
                    exampleCharacterTemplate(),
                    examplePlaceTemplate(),
                    exampleRealmDunbaar(),
                  )
                }
              >
                <span className="sb-eyebrow">
                  A PLACE TO START · BUILT-IN EXAMPLE
                </span>
                <h3>Meet Emma at the Aurora Room</h3>
                <p>
                  A quiet venue, a familiar face, and the beginning of a
                  conversation.
                </p>
                <span>
                  Try a conversation <b>→</b>
                </span>
              </button>
            </div>
          </section>
          <section className="sb-home-section">
            <div className="sb-section-heading">
              <h2>Your worlds, waiting</h2>
              <button
                type="button"
                className="sb-link"
                onClick={() => onStudio("places")}
              >
                Manage worlds & places ↗
              </button>
            </div>
            <p className="sb-section-description">
              Step into a place you've imagined, or follow a prepared adventure.
            </p>
            <div className="sb-world-grid">
              {realms.map((realm, index) => (
                <button
                  type="button"
                  className="sb-world-card"
                  key={realm.id}
                  onClick={() => openWorld(realm)}
                >
                  <div className="sb-world-card__art">
                    {realm.imageDataUrl || realm.thumbDataUrl ? (
                      <img
                        src={realm.imageDataUrl || realm.thumbDataUrl}
                        alt=""
                      />
                    ) : (
                      <WorldArtwork variant={index} />
                    )}
                    <span>WORLD</span>
                  </div>
                  <div>
                    <h3>{realm.name}</h3>
                    <p>{realm.note || "There is more to discover here."}</p>
                    <small>
                      {
                        places.filter((place) => place.realmId === realm.id)
                          .length
                      }{" "}
                      places <b>↗</b>
                    </small>
                  </div>
                </button>
              ))}
              {campaigns.map((item) => (
                <button
                  type="button"
                  className="sb-world-card sb-adventure-card"
                  key={item.id}
                  onClick={() => {
                    setCampaign(item);
                    setError(null);
                  }}
                >
                  <span className="sb-eyebrow">PREPARED ADVENTURE</span>
                  <h3>{item.name}</h3>
                  <p>
                    {item.playerIntro || "Choose a scene and enter the story."}
                  </p>
                  <small>
                    {item.scenes.length} scenes <b>↗</b>
                  </small>
                </button>
              ))}
              {realms.length === 0 && campaigns.length === 0 && (
                <div className="sb-empty-world">
                  <span aria-hidden="true">⌖</span>
                  <div>
                    <h3>A world can come later.</h3>
                    <p>
                      Start with a conversation, or build a setting in your
                      library.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sb-link"
                    onClick={() => onStudio("places")}
                  >
                    Create a world →
                  </button>
                </div>
              )}
            </div>
          </section>
          <div className="sb-ecosystem-note">
            <span aria-hidden="true">✧</span>
            <p>
              <strong>One imagination. More ways to create.</strong>
              <br />
              Write in StorybookAI. Explore in SandboxAI. Bring scenes to life
              in ComicbookAI.
            </p>
            <button
              type="button"
              className="sb-link"
              onClick={() => onStudio("campaigns")}
            >
              Open your studio →
            </button>
          </div>
        </>
      )}
      {error && !world && !campaign && !creating && (
        <p className="sb-error" role="alert">
          {error}
        </p>
      )}
      {creating && (
        <Modal title="Someone new to meet" onClose={() => setCreating(false)}>
          <p className="sb-muted">
            A name is enough to begin. A little personality makes the
            conversation yours.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createAndChat();
            }}
          >
            <label className="sb-field">
              Name
              <input
                required
                maxLength={100}
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
                placeholder="What are they called?"
              />
            </label>
            <label className="sb-field">
              Personality <span>optional</span>
              <textarea
                maxLength={5000}
                rows={4}
                value={quickPersonality}
                onChange={(event) => setQuickPersonality(event.target.value)}
                placeholder="A curious cartographer with a dry sense of humor…"
              />
            </label>
            {error && (
              <p className="sb-error" role="alert">
                {error}
              </p>
            )}
            <div className="sb-dialog__actions">
              <button
                type="button"
                className="sb-link"
                onClick={() => onStudio("characters")}
              >
                Open full character studio ↗
              </button>
              <button
                type="submit"
                className="sb-button"
                disabled={busy || !quickName.trim()}
              >
                {busy ? "Opening…" : "Create & chat →"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {world && (
        <Modal title={world.name} onClose={() => setWorld(null)}>
          <p className="sb-muted">
            Choose a place and someone to meet. The rest can unfold as you go.
          </p>
          <label className="sb-field">
            Visit a place
            <select
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
            >
              <option value="">Choose a place</option>
              {places
                .filter((place) => place.realmId === world.id)
                .map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="sb-field">
            Meet a character
            <select
              value={characterId}
              onChange={(event) => setCharacterId(event.target.value)}
            >
              <option value="">Choose a character</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {formatPersonName(
                    character.name,
                    character.familyName,
                    character.middleName,
                  )}
                </option>
              ))}
            </select>
          </label>
          {!places.some((place) => place.realmId === world.id) && (
            <p className="sb-muted">
              This world needs a place to visit. Add one in Worlds & places.
            </p>
          )}
          {characters.length === 0 && (
            <p className="sb-muted">
              Add a character to start a meeting in this world.
            </p>
          )}
          {error && (
            <p role="alert" className="sb-error">
              {error}
            </p>
          )}
          <div className="sb-dialog__actions">
            <button
              type="button"
              className="sb-link"
              onClick={() => onStudio("places")}
            >
              Worlds & places ↗
            </button>
            <button
              type="button"
              className="sb-button"
              disabled={busy || !placeId || !characterId}
              onClick={() => {
                const character = characters.find(
                  (item) => item.id === characterId,
                );
                const place = places.find((item) => item.id === placeId);
                if (character && place)
                  void startCharacter(character, place, world);
              }}
            >
              {busy ? "Opening…" : "Begin exploring →"}
            </button>
          </div>
        </Modal>
      )}
      {campaign && (
        <Modal title={campaign.name} onClose={() => setCampaign(null)}>
          <p className="sb-muted">
            {campaign.playerIntro || "Choose where to enter the adventure."}
          </p>
          <div className="sb-scene-list">
            {campaign.scenes.map((scene) => (
              <button
                type="button"
                className="sb-scene-choice"
                key={scene.id}
                disabled={busy}
                onClick={() => void startCampaign(scene.id)}
              >
                <strong>
                  {scene.name ||
                    places.find((place) => place.id === scene.placeId)?.name ||
                    "Untitled scene"}
                </strong>
                <span>Enter scene →</span>
              </button>
            ))}
          </div>
          {campaign.scenes.length === 0 && (
            <p className="sb-muted">
              This adventure has no scenes yet. Open the studio to create one.
            </p>
          )}
          {error && (
            <p role="alert" className="sb-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="sb-link"
            onClick={() => onStudio("campaigns")}
          >
            Open adventure studio ↗
          </button>
        </Modal>
      )}
    </main>
  );
}
